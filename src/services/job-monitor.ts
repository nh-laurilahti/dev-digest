/**
 * Job Monitor - Real-time job status tracking and performance metrics
 */

import { EventEmitter } from 'events';
import {
  BaseJob,
  JobStatus,
  JobType,
  JobMetrics,
  JobHealthCheck,
  WorkerStatus,
  JobEventData,
  JobEvent
} from '../types/job';
import { JobQueue } from './job-queue';
import { JobProcessor } from './job-processor';
import { logger } from '../lib/logger';
import { db } from '../db';

interface AlertRule {
  id: string;
  name: string;
  condition: 'queue_length' | 'failed_rate' | 'processing_time' | 'stuck_jobs' | 'worker_down';
  threshold: number;
  duration: number; // minutes
  enabled: boolean;
  recipients: string[];
  lastTriggered?: Date;
  cooldownMinutes: number;
}

interface JobAlert {
  id: string;
  ruleId: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  triggeredAt: Date;
  acknowledged?: Date;
  acknowledgedBy?: string;
  resolved?: Date;
  metadata: Record<string, any>;
}

export class JobMonitor extends EventEmitter {
  private jobQueue: JobQueue;
  private jobProcessor: JobProcessor;
  private workers: Map<string, WorkerStatus> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, JobAlert> = new Map();
  
  private metricsHistory: Array<{ timestamp: Date; metrics: JobMetrics }> = [];
  private maxHistoryEntries = 1440; // 24 hours of minute-by-minute data
  
  private monitorTimer?: NodeJS.Timeout;
  private alertTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private monitorInterval = 60000; // 1 minute
  private alertCheckInterval = 30000; // 30 seconds

  constructor(
    jobQueue: JobQueue,
    jobProcessor: JobProcessor,
    options: {
      monitorInterval?: number;
      alertCheckInterval?: number;
      maxHistoryEntries?: number;
    } = {}
  ) {
    super();
    this.jobQueue = jobQueue;
    this.jobProcessor = jobProcessor;
    this.monitorInterval = options.monitorInterval || 60000;
    this.alertCheckInterval = options.alertCheckInterval || 30000;
    this.maxHistoryEntries = options.maxHistoryEntries || 1440;
    
    this.setupEventListeners();
    this.setupDefaultAlertRules();
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Start metrics collection
    this.monitorTimer = setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error({ error }, 'Error collecting metrics');
      });
    }, this.monitorInterval);

    // Start alert checking
    this.alertTimer = setInterval(() => {
      this.checkAlertRules().catch(error => {
        logger.error({ error }, 'Error checking alert rules');
      });
    }, this.alertCheckInterval);

    logger.info({
      monitorInterval: this.monitorInterval,
      alertCheckInterval: this.alertCheckInterval
    }, 'Job monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }

    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = undefined;
    }

    logger.info('Job monitor stopped');
  }

  /**
   * Get current health status
   */
  async getHealthCheck(): Promise<JobHealthCheck> {
    try {
      const metrics = this.jobQueue.getMetrics();
      const processorStats = this.jobProcessor.getStats();
      
      // Check for stuck jobs (running for more than 30 minutes)
      const stuckJobThreshold = new Date(Date.now() - 30 * 60 * 1000);
      const stuckJobs = await db.job.count({
        where: {
          status: 'RUNNING',
          startedAt: {
            lt: stuckJobThreshold
          }
        }
      });

      // Get oldest pending job
      const oldestPendingJob = await db.job.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      });

      // Check for recent processing activity
      const lastProcessedJob = await db.job.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true }
      });

      const errors: string[] = [];
      const warnings: string[] = [];

      // Health checks
      if (metrics.queueLength > 1000) {
        warnings.push(`High queue length: ${metrics.queueLength}`);
      }

      if (metrics.failedJobs > 100) {
        warnings.push(`High number of failed jobs: ${metrics.failedJobs}`);
      }

      if (stuckJobs > 0) {
        errors.push(`${stuckJobs} jobs appear to be stuck`);
      }

      if (metrics.successRate < 90) {
        warnings.push(`Low success rate: ${metrics.successRate.toFixed(1)}%`);
      }

      const workerStatuses = Array.from(this.workers.values());
      const unhealthyWorkers = workerStatuses.filter(w => !w.healthy);
      if (unhealthyWorkers.length > 0) {
        errors.push(`${unhealthyWorkers.length} workers are unhealthy`);
      }

      const healthy = errors.length === 0;

      return {
        healthy,
        queueLength: metrics.queueLength,
        activeJobs: metrics.runningJobs,
        failedJobs: metrics.failedJobs,
        oldestPendingJob: oldestPendingJob?.createdAt,
        workerStatus: workerStatuses,
        lastProcessedJob: lastProcessedJob?.finishedAt || undefined,
        errors,
        warnings
      };

    } catch (error) {
      logger.error({ error }, 'Failed to get health check');
      return {
        healthy: false,
        queueLength: 0,
        activeJobs: 0,
        failedJobs: 0,
        workerStatus: [],
        errors: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 24): Array<{ timestamp: Date; metrics: JobMetrics }> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(entry => entry.timestamp >= cutoffTime);
  }

  /**
   * Get job performance statistics
   */
  async getJobPerformanceStats(jobType?: JobType): Promise<{
    totalJobs: number;
    averageProcessingTime: number;
    successRate: number;
    throughputPerHour: number;
    slowestJobs: Array<{ id: string; type: JobType; processingTime: number }>;
    failureReasons: Array<{ reason: string; count: number }>;
  }> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const whereClause: any = {
        createdAt: { gte: last24Hours }
      };

      if (jobType) {
        whereClause.type = jobType;
      }

      const jobs = await db.job.findMany({
        where: whereClause,
        select: {
          id: true,
          type: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          error: true
        }
      });

      const completedJobs = jobs.filter(j => j.status === 'COMPLETED' && j.startedAt && j.finishedAt);
      const failedJobs = jobs.filter(j => j.status === 'FAILED');

      // Calculate processing times
      const processingTimes = completedJobs.map(job => {
        const start = new Date(job.startedAt!).getTime();
        const end = new Date(job.finishedAt!).getTime();
        return {
          id: job.id,
          type: job.type as JobType,
          processingTime: end - start
        };
      });

      const averageProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((sum, job) => sum + job.processingTime, 0) / processingTimes.length
        : 0;

      const successRate = jobs.length > 0
        ? (completedJobs.length / jobs.length) * 100
        : 0;

      const throughputPerHour = completedJobs.length; // Jobs completed in last 24 hours

      // Get slowest jobs (top 10)
      const slowestJobs = processingTimes
        .sort((a, b) => b.processingTime - a.processingTime)
        .slice(0, 10);

      // Analyze failure reasons
      const failureReasonMap = new Map<string, number>();
      failedJobs.forEach(job => {
        const reason = job.error || 'Unknown error';
        const shortReason = reason.length > 100 ? reason.substring(0, 100) + '...' : reason;
        failureReasonMap.set(shortReason, (failureReasonMap.get(shortReason) || 0) + 1);
      });

      const failureReasons = Array.from(failureReasonMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalJobs: jobs.length,
        averageProcessingTime: Math.round(averageProcessingTime),
        successRate: Math.round(successRate * 100) / 100,
        throughputPerHour,
        slowestJobs,
        failureReasons
      };

    } catch (error) {
      logger.error({ error, jobType }, 'Failed to get job performance stats');
      throw error;
    }
  }

  /**
   * Register a worker
   */
  registerWorker(workerStatus: WorkerStatus): void {
    this.workers.set(workerStatus.id, {
      ...workerStatus,
      lastActivity: new Date()
    });

    logger.info({
      workerId: workerStatus.id,
      supportedJobTypes: workerStatus.supportedJobTypes
    }, 'Worker registered');

    this.emit('worker_registered', workerStatus);
  }

  /**
   * Update worker status
   */
  updateWorkerStatus(workerId: string, status: Partial<WorkerStatus>): void {
    const existingWorker = this.workers.get(workerId);
    if (!existingWorker) {
      return;
    }

    const updatedWorker: WorkerStatus = {
      ...existingWorker,
      ...status,
      lastActivity: new Date()
    };

    this.workers.set(workerId, updatedWorker);
    this.emit('worker_updated', updatedWorker);
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      this.workers.delete(workerId);
      logger.info({ workerId }, 'Worker unregistered');
      this.emit('worker_unregistered', worker);
    }
  }

  /**
   * Get all worker statuses
   */
  getWorkerStatuses(): WorkerStatus[] {
    return Array.from(this.workers.values());
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRule: AlertRule = {
      ...rule,
      id: ruleId
    };

    this.alertRules.set(ruleId, newRule);
    
    logger.info({
      ruleId,
      name: rule.name,
      condition: rule.condition,
      threshold: rule.threshold
    }, 'Alert rule added');

    return newRule;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): JobAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    logger.info({
      alertId,
      acknowledgedBy
    }, 'Alert acknowledged');

    this.emit('alert_acknowledged', alert);
    return true;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = new Date();
    this.activeAlerts.delete(alertId);

    logger.info({ alertId }, 'Alert resolved');
    this.emit('alert_resolved', alert);
    return true;
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen to job queue events
    this.jobQueue.on('job_event', (eventData: JobEventData) => {
      this.handleJobEvent(eventData);
    });

    // Listen to processor events
    this.jobProcessor.on('job_completed', (data: any) => {
      this.emit('job_completed', data);
    });

    this.jobProcessor.on('job_failed', (data: any) => {
      this.emit('job_failed', data);
    });
  }

  private handleJobEvent(eventData: JobEventData): void {
    // Update worker metrics based on job events
    if (eventData.event === JobEvent.COMPLETED || eventData.event === JobEvent.FAILED) {
      // This would update worker statistics in a real implementation
    }

    // Forward events
    this.emit('job_event', eventData);
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = this.jobQueue.getMetrics();
      const timestamp = new Date();

      // Update active workers count in metrics
      const activeWorkers = Array.from(this.workers.values()).filter(w => w.healthy).length;
      metrics.activeWorkers = activeWorkers;

      // Add to history
      this.metricsHistory.push({ timestamp, metrics });

      // Trim history to max entries
      if (this.metricsHistory.length > this.maxHistoryEntries) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistoryEntries);
      }

      this.emit('metrics_collected', { timestamp, metrics });

    } catch (error) {
      logger.error({ error }, 'Failed to collect metrics');
    }
  }

  private async checkAlertRules(): Promise<void> {
    const now = new Date();
    
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldTrigger = await this.evaluateAlertRule(rule);
        
        if (shouldTrigger) {
          // Check cooldown
          if (rule.lastTriggered) {
            const timeSinceLastAlert = now.getTime() - rule.lastTriggered.getTime();
            const cooldownMs = rule.cooldownMinutes * 60 * 1000;
            if (timeSinceLastAlert < cooldownMs) {
              continue; // Still in cooldown
            }
          }

          await this.triggerAlert(rule);
        }

      } catch (error) {
        logger.error({
          ruleId: rule.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Error evaluating alert rule');
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule): Promise<boolean> {
    const metrics = this.jobQueue.getMetrics();
    
    switch (rule.condition) {
      case 'queue_length':
        return metrics.queueLength > rule.threshold;
        
      case 'failed_rate':
        return metrics.successRate < (100 - rule.threshold);
        
      case 'processing_time':
        return metrics.averageProcessingTime > rule.threshold;
        
      case 'stuck_jobs':
        const stuckJobThreshold = new Date(Date.now() - rule.threshold * 60 * 1000);
        const stuckJobs = await db.job.count({
          where: {
            status: 'RUNNING',
            startedAt: { lt: stuckJobThreshold }
          }
        });
        return stuckJobs > 0;
        
      case 'worker_down':
        const healthyWorkers = Array.from(this.workers.values()).filter(w => w.healthy).length;
        return healthyWorkers < rule.threshold;
        
      default:
        return false;
    }
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: JobAlert = {
      id: alertId,
      ruleId: rule.id,
      message: this.generateAlertMessage(rule),
      severity: this.getAlertSeverity(rule),
      triggeredAt: new Date(),
      metadata: {
        condition: rule.condition,
        threshold: rule.threshold,
        currentValue: await this.getCurrentValueForRule(rule)
      }
    };

    this.activeAlerts.set(alertId, alert);
    rule.lastTriggered = new Date();

    logger.warn({
      alertId,
      ruleId: rule.id,
      message: alert.message,
      severity: alert.severity
    }, 'Alert triggered');

    // Send notifications (in a real implementation)
    this.emit('alert_triggered', alert);
    
    // Schedule notifications for recipients
    for (const recipient of rule.recipients) {
      logger.info({
        alertId,
        recipient,
        message: alert.message
      }, 'Alert notification sent');
    }
  }

  private generateAlertMessage(rule: AlertRule): string {
    switch (rule.condition) {
      case 'queue_length':
        return `Queue length exceeded threshold: ${rule.threshold}`;
      case 'failed_rate':
        return `Job failure rate exceeded ${rule.threshold}%`;
      case 'processing_time':
        return `Average processing time exceeded ${rule.threshold}ms`;
      case 'stuck_jobs':
        return `Jobs stuck for more than ${rule.threshold} minutes detected`;
      case 'worker_down':
        return `Less than ${rule.threshold} healthy workers available`;
      default:
        return `Alert condition "${rule.condition}" triggered`;
    }
  }

  private getAlertSeverity(rule: AlertRule): 'warning' | 'error' | 'critical' {
    if (rule.condition === 'worker_down' || rule.condition === 'stuck_jobs') {
      return 'critical';
    }
    if (rule.condition === 'failed_rate' && rule.threshold > 50) {
      return 'error';
    }
    return 'warning';
  }

  private async getCurrentValueForRule(rule: AlertRule): Promise<number> {
    const metrics = this.jobQueue.getMetrics();
    
    switch (rule.condition) {
      case 'queue_length':
        return metrics.queueLength;
      case 'failed_rate':
        return 100 - metrics.successRate;
      case 'processing_time':
        return metrics.averageProcessingTime;
      case 'worker_down':
        return Array.from(this.workers.values()).filter(w => w.healthy).length;
      case 'stuck_jobs':
        const stuckJobThreshold = new Date(Date.now() - rule.threshold * 60 * 1000);
        return await db.job.count({
          where: {
            status: 'RUNNING',
            startedAt: { lt: stuckJobThreshold }
          }
        });
      default:
        return 0;
    }
  }

  private setupDefaultAlertRules(): void {
    // Default alert rules
    const defaultRules: Omit<AlertRule, 'id'>[] = [
      {
        name: 'High Queue Length',
        condition: 'queue_length',
        threshold: 500,
        duration: 5,
        enabled: true,
        recipients: ['admin@example.com'],
        cooldownMinutes: 30
      },
      {
        name: 'High Failure Rate',
        condition: 'failed_rate',
        threshold: 20, // More than 20% failures
        duration: 10,
        enabled: true,
        recipients: ['admin@example.com'],
        cooldownMinutes: 60
      },
      {
        name: 'Stuck Jobs',
        condition: 'stuck_jobs',
        threshold: 30, // Jobs running for more than 30 minutes
        duration: 1,
        enabled: true,
        recipients: ['admin@example.com'],
        cooldownMinutes: 15
      }
    ];

    for (const rule of defaultRules) {
      this.addAlertRule(rule);
    }
  }
}