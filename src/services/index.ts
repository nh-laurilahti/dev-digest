/**
 * Job Processing Service - Main service that orchestrates all job components
 */

import { JobQueue } from './job-queue';
import { JobProcessor } from './job-processor';
import { JobScheduler } from './scheduler';
import { JobMonitor } from './job-monitor';
import { WorkerManager } from './workers';
import {
  DigestJobHandler,
  NotificationJobHandler,
  CleanupJobHandler,
  HealthCheckJobHandler
} from './jobs';
import {
  BaseJob,
  CreateJobOptions,
  JobQueryFilters,
  JobMetrics,
  JobHealthCheck,
  WorkerStatus,
  ScheduleConfig,
  JobType,
  WorkerConfig
} from '../types/job';
import { logger } from '../lib/logger';

class JobService {
  private jobQueue: JobQueue;
  private jobProcessor: JobProcessor;
  private jobScheduler: JobScheduler;
  private jobMonitor: JobMonitor;
  private workerManager: WorkerManager;
  private isInitialized = false;

  constructor() {
    // Initialize components
    this.jobQueue = new JobQueue({
      maxConcurrentJobs: 50,
      retryDelay: 2000,
      maxRetryDelay: 300000, // 5 minutes
      retryBackoffFactor: 2,
      defaultMaxRetries: 3,
      jobTimeout: 600000, // 10 minutes
      cleanupInterval: 300000, // 5 minutes
      persistenceInterval: 10000, // 10 seconds
      enableMetrics: true
    });

    this.jobProcessor = new JobProcessor(this.jobQueue, {
      maxConcurrentJobs: 20,
      jobTimeout: 600000, // 10 minutes
      processInterval: 2000 // 2 seconds
    });

    // Ensure handlers are registered immediately so processing never runs without them
    this.registerJobHandlers();

    this.jobScheduler = new JobScheduler(this.jobQueue, 60000); // Check every minute

    this.jobMonitor = new JobMonitor(this.jobQueue, this.jobProcessor, {
      monitorInterval: 30000, // 30 seconds
      alertCheckInterval: 60000, // 1 minute
      maxHistoryEntries: 2880 // 48 hours of minute-by-minute data
    });

    this.workerManager = new WorkerManager(this.jobQueue, this.jobMonitor, {
      loadBalancingStrategy: 'least_loaded'
    });

    this.setupEventListeners();
  }

  /**
   * Initialize the job service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing job processing service...');

      // Create default workers
      await this.createDefaultWorkers();

      // Start all components
      this.jobProcessor.startProcessing();
      this.jobScheduler.start();
      this.jobMonitor.start();

      this.isInitialized = true;
      logger.info('Job processing service initialized successfully');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize job service');
      throw error;
    }
  }

  /**
   * Shutdown the job service gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down job processing service...');

    try {
      // Stop components in reverse order
      this.jobMonitor.stop();
      this.jobScheduler.stop();
      
      // Shutdown workers first
      await this.workerManager.shutdown(30000);
      
      // Then shutdown processor and queue
      await this.jobProcessor.shutdown(30000);
      await this.jobQueue.shutdown();

      this.isInitialized = false;
      logger.info('Job processing service shut down successfully');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Error during job service shutdown');
    }
  }

  // Job management methods
  async createJob(options: CreateJobOptions): Promise<BaseJob> {
    return await this.jobQueue.createJob(options);
  }

  async getJob(jobId: string): Promise<BaseJob | null> {
    return this.jobQueue.getJob(jobId);
  }

  async queryJobs(filters: JobQueryFilters = {}): Promise<BaseJob[]> {
    return this.jobQueue.queryJobs(filters);
  }

  async cancelJob(jobId: string): Promise<boolean> {
    return await this.jobQueue.cancelJob(jobId);
  }

  async retryJob(jobId: string): Promise<boolean> {
    return await this.jobQueue.retryJob(jobId);
  }

  // Metrics and monitoring
  getMetrics(): JobMetrics {
    return this.jobQueue.getMetrics();
  }

  async getHealthCheck(): Promise<JobHealthCheck> {
    return await this.jobMonitor.getHealthCheck();
  }

  getMetricsHistory(hours: number = 24): Array<{ timestamp: Date; metrics: JobMetrics }> {
    return this.jobMonitor.getMetricsHistory(hours);
  }

  async getJobPerformanceStats(jobType?: JobType) {
    return await this.jobMonitor.getJobPerformanceStats(jobType);
  }

  // Worker management
  getWorkerStatuses(): WorkerStatus[] {
    return this.jobMonitor.getWorkerStatuses();
  }

  getWorkerPoolStats() {
    return this.workerManager.getPoolStats();
  }

  async addWorker(config: WorkerConfig): Promise<string> {
    return await this.workerManager.addWorker(config);
  }

  async removeWorker(workerId: string, graceful: boolean = true): Promise<boolean> {
    return await this.workerManager.removeWorker(workerId, graceful);
  }

  // Scheduling
  async addSchedule(schedule: Omit<ScheduleConfig, 'id' | 'nextRun'>): Promise<ScheduleConfig> {
    return await this.jobScheduler.addSchedule(schedule);
  }

  async updateSchedule(scheduleId: string, updates: Partial<ScheduleConfig>): Promise<ScheduleConfig | null> {
    return await this.jobScheduler.updateSchedule(scheduleId, updates);
  }

  async removeSchedule(scheduleId: string): Promise<boolean> {
    return await this.jobScheduler.removeSchedule(scheduleId);
  }

  getSchedule(scheduleId: string): ScheduleConfig | null {
    return this.jobScheduler.getSchedule(scheduleId);
  }

  getAllSchedules(): ScheduleConfig[] {
    return this.jobScheduler.getAllSchedules();
  }

  async triggerSchedule(scheduleId: string): Promise<BaseJob | null> {
    return await this.jobScheduler.triggerSchedule(scheduleId);
  }

  getSchedulerStats() {
    return this.jobScheduler.getStats();
  }

  /**
   * Register job handlers on a JobProcessor instance
   * This method can be used by both the main service and worker processors
   */
  public static registerJobHandlers(processor: JobProcessor): void {
    const digestHandler = new DigestJobHandler();
    const notificationHandler = new NotificationJobHandler();
    const cleanupHandler = new CleanupJobHandler();
    const healthCheckHandler = new HealthCheckJobHandler();

    processor.registerHandler(digestHandler);
    processor.registerHandler(notificationHandler);
    processor.registerHandler(cleanupHandler);
    processor.registerHandler(healthCheckHandler);

    logger.info({
      handlers: [
        digestHandler.type,
        notificationHandler.type,
        cleanupHandler.type,
        healthCheckHandler.type
      ]
    }, 'Job handlers registered');
  }

  // Private methods
  private registerJobHandlers(): void {
    JobService.registerJobHandlers(this.jobProcessor);
  }

  private async createDefaultWorkers(): Promise<void> {
    const defaultWorkers: WorkerConfig[] = [
      {
        id: 'digest_worker_1',
        maxJobs: 3,
        supportedJobTypes: [JobType.DIGEST_GENERATION],
        enabled: true,
        healthCheckInterval: 30000,
        gracefulShutdownTimeout: 60000
      },
      {
        id: 'notification_worker_1',
        maxJobs: 10,
        supportedJobTypes: [JobType.NOTIFICATION],
        enabled: true,
        healthCheckInterval: 30000,
        gracefulShutdownTimeout: 30000
      },
      {
        id: 'general_worker_1',
        maxJobs: 5,
        supportedJobTypes: [
          JobType.CLEANUP,
          JobType.HEALTH_CHECK,
          JobType.WEBHOOK_DELIVERY,
          JobType.DATA_SYNC,
          JobType.BACKUP
        ],
        enabled: true,
        healthCheckInterval: 30000,
        gracefulShutdownTimeout: 30000
      },
      {
        id: 'general_worker_2',
        maxJobs: 5,
        supportedJobTypes: [
          JobType.CLEANUP,
          JobType.HEALTH_CHECK,
          JobType.WEBHOOK_DELIVERY,
          JobType.DATA_SYNC,
          JobType.BACKUP
        ],
        enabled: true,
        healthCheckInterval: 30000,
        gracefulShutdownTimeout: 30000
      }
    ];

    for (const workerConfig of defaultWorkers) {
      try {
        await this.workerManager.addWorker(workerConfig);
      } catch (error) {
        logger.error({
          workerId: workerConfig.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to create default worker');
      }
    }

    logger.info({
      workerCount: defaultWorkers.length
    }, 'Default workers created');
  }

  private setupEventListeners(): void {
    // Job queue events
    this.jobQueue.on('job_event', (eventData) => {
      logger.debug({
        event: eventData.event,
        jobId: eventData.jobId,
        jobType: eventData.job.type
      }, 'Job event');
    });

    // Job processor events
    this.jobProcessor.on('job_completed', (data) => {
      logger.info({
        jobId: data.jobId,
        jobType: data.job.type,
        processingTime: data.processingTime
      }, 'Job completed');
    });

    this.jobProcessor.on('job_failed', (data) => {
      logger.error({
        jobId: data.jobId,
        jobType: data.job.type,
        error: data.error,
        finalFailure: data.finalFailure
      }, 'Job failed');
    });

    // Scheduler events
    this.jobScheduler.on('job_scheduled', (data) => {
      logger.info({
        scheduleId: data.schedule.id,
        jobId: data.job.id,
        scheduleName: data.schedule.name
      }, 'Scheduled job created');
    });

    this.jobScheduler.on('schedule_error', (data) => {
      logger.error({
        scheduleId: data.schedule.id,
        scheduleName: data.schedule.name,
        error: data.error
      }, 'Schedule execution error');
    });

    // Monitor events
    this.jobMonitor.on('alert_triggered', (alert) => {
      logger.warn({
        alertId: alert.id,
        ruleId: alert.ruleId,
        message: alert.message,
        severity: alert.severity
      }, 'Job monitoring alert triggered');
    });

    // Worker events
    this.workerManager.on('worker_added', (worker) => {
      logger.info({
        workerId: worker.config.id,
        maxJobs: worker.config.maxJobs,
        supportedJobTypes: worker.config.supportedJobTypes
      }, 'Worker added to pool');
    });

    this.workerManager.on('worker_removed', (worker) => {
      logger.info({
        workerId: worker.config.id
      }, 'Worker removed from pool');
    });

    this.workerManager.on('worker_health_changed', (data) => {
      logger.info({
        workerId: data.worker.config.id,
        healthy: data.healthy,
        wasHealthy: data.wasHealthy
      }, 'Worker health status changed');
    });
  }
}

// Create singleton instance
export const jobService = new JobService();

// Export individual components for direct access if needed
export { JobQueue } from './job-queue';
export { JobProcessor } from './job-processor';
export { JobScheduler } from './scheduler';
export { JobMonitor } from './job-monitor';
export { WorkerManager } from './workers';
export * from './jobs';