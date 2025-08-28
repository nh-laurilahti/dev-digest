/**
 * Worker Pool Management - Load balancing and worker health monitoring
 */

import { EventEmitter } from 'events';
import {
  JobType,
  BaseJob,
  WorkerConfig,
  WorkerStatus
} from '../types/job';
import { JobQueue } from './job-queue';
import { JobProcessor } from './job-processor';
import { JobMonitor } from './job-monitor';
import { logger } from '../lib/logger';
import {
  DigestJobHandler,
  NotificationJobHandler,
  CleanupJobHandler,
  HealthCheckJobHandler
} from './jobs';

interface WorkerInstance {
  config: WorkerConfig;
  status: WorkerStatus;
  processor: JobProcessor;
  currentJobs: Map<string, BaseJob>;
  startedAt: Date;
  healthCheckTimer?: NodeJS.Timeout;
  shutdownPromise?: Promise<void>;
  shutdownResolve?: () => void;
}

export class WorkerManager extends EventEmitter {
  private jobQueue: JobQueue;
  private jobMonitor: JobMonitor;
  private workers: Map<string, WorkerInstance> = new Map();
  private masterProcessor: JobProcessor;
  private isShuttingDown = false;
  
  private loadBalancingStrategy: 'round_robin' | 'least_loaded' | 'job_type_affinity' = 'least_loaded';
  private lastWorkerIndex = 0;

  constructor(
    jobQueue: JobQueue,
    jobMonitor: JobMonitor,
    options: {
      loadBalancingStrategy?: 'round_robin' | 'least_loaded' | 'job_type_affinity';
    } = {}
  ) {
    super();
    this.jobQueue = jobQueue;
    this.jobMonitor = jobMonitor;
    this.loadBalancingStrategy = options.loadBalancingStrategy || 'least_loaded';
    
    // Create a master processor for coordination
    this.masterProcessor = new JobProcessor(jobQueue, {
      maxConcurrentJobs: 0 // Master doesn't process jobs directly
    });

    this.setupEventListeners();
  }

  /**
   * Register job handlers on a JobProcessor instance
   * This duplicates the logic from JobService to avoid circular dependencies
   */
  private registerJobHandlersOnProcessor(processor: JobProcessor): void {
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
    }, 'Job handlers registered on worker processor');
  }

  /**
   * Add a new worker to the pool
   */
  async addWorker(config: WorkerConfig): Promise<string> {
    if (this.workers.has(config.id)) {
      throw new Error(`Worker with ID ${config.id} already exists`);
    }

    try {
      // Create worker processor
      const processor = new JobProcessor(this.jobQueue, {
        maxConcurrentJobs: config.maxJobs,
        jobTimeout: 600000 // 10 minutes
      });

      // Register job handlers on the worker processor
      this.registerJobHandlersOnProcessor(processor);

      // Create worker instance
      const worker: WorkerInstance = {
        config,
        status: {
          id: config.id,
          healthy: true,
          activeJobs: 0,
          totalProcessed: 0,
          lastActivity: new Date(),
          supportedJobTypes: config.supportedJobTypes,
          errors: []
        },
        processor,
        currentJobs: new Map(),
        startedAt: new Date()
      };

      // Set up worker-specific event handlers
      this.setupWorkerEventHandlers(worker);

      // Start health check monitoring
      if (config.healthCheckInterval > 0) {
        this.startWorkerHealthCheck(worker);
      }

      // Add to workers map
      this.workers.set(config.id, worker);

      // Register with monitor
      this.jobMonitor.registerWorker(worker.status);

      // Start the worker processor
      processor.startProcessing();

      logger.info({
        workerId: config.id,
        maxJobs: config.maxJobs,
        supportedJobTypes: config.supportedJobTypes
      }, 'Worker added and started');

      this.emit('worker_added', worker);
      return config.id;

    } catch (error) {
      logger.error({
        workerId: config.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to add worker');
      throw error;
    }
  }

  /**
   * Remove a worker from the pool
   */
  async removeWorker(workerId: string, graceful: boolean = true): Promise<boolean> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return false;
    }

    try {
      logger.info({
        workerId,
        graceful,
        activeJobs: worker.currentJobs.size
      }, 'Removing worker');

      // Stop health checks
      if (worker.healthCheckTimer) {
        clearInterval(worker.healthCheckTimer);
      }

      if (graceful) {
        // Graceful shutdown - wait for current jobs to complete
        await this.shutdownWorkerGracefully(worker);
      } else {
        // Force shutdown
        worker.processor.stopProcessing();
        
        // Cancel active jobs
        for (const [jobId, job] of worker.currentJobs) {
          await this.jobQueue.updateJob(jobId, {
            status: 'FAILED',
            finishedAt: new Date(),
            error: 'Worker forcefully shut down'
          });
        }
      }

      // Remove from collections
      this.workers.delete(workerId);
      this.jobMonitor.unregisterWorker(workerId);

      logger.info({ workerId }, 'Worker removed');
      this.emit('worker_removed', worker);
      return true;

    } catch (error) {
      logger.error({
        workerId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to remove worker');
      return false;
    }
  }

  /**
   * Get worker by ID
   */
  getWorker(workerId: string): WorkerInstance | null {
    return this.workers.get(workerId) || null;
  }

  /**
   * Get all workers
   */
  getWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get workers that can handle a specific job type
   */
  getWorkersForJobType(jobType: JobType): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(worker =>
      worker.config.enabled &&
      worker.status.healthy &&
      worker.config.supportedJobTypes.includes(jobType)
    );
  }

  /**
   * Scale workers based on current load
   */
  async autoScale(): Promise<void> {
    try {
      const metrics = this.jobQueue.getMetrics();
      const totalWorkers = this.workers.size;
      const healthyWorkers = Array.from(this.workers.values()).filter(w => w.status.healthy).length;
      
      logger.debug({
        queueLength: metrics.queueLength,
        runningJobs: metrics.runningJobs,
        totalWorkers,
        healthyWorkers
      }, 'Checking auto-scaling conditions');

      // Scale up conditions
      if (metrics.queueLength > 100 && healthyWorkers < 10) {
        await this.scaleUp();
      }
      // Scale down conditions  
      else if (metrics.queueLength < 10 && healthyWorkers > 2) {
        await this.scaleDown();
      }

    } catch (error) {
      logger.error({ error }, 'Error in auto-scaling');
    }
  }

  /**
   * Rebalance workload across workers
   */
  async rebalanceWorkload(): Promise<void> {
    try {
      const workers = Array.from(this.workers.values()).filter(w => w.status.healthy);
      
      if (workers.length < 2) {
        return; // Can't rebalance with less than 2 workers
      }

      // Find overloaded and underloaded workers
      const overloaded = workers.filter(w => w.status.activeJobs > w.config.maxJobs * 0.8);
      const underloaded = workers.filter(w => w.status.activeJobs < w.config.maxJobs * 0.3);

      if (overloaded.length > 0 && underloaded.length > 0) {
        logger.info({
          overloaded: overloaded.length,
          underloaded: underloaded.length
        }, 'Rebalancing workload between workers');

        // In a real implementation, you might pause overloaded workers temporarily
        // or implement job redistribution logic
        this.emit('workload_rebalanced', { overloaded, underloaded });
      }

    } catch (error) {
      logger.error({ error }, 'Error rebalancing workload');
    }
  }

  /**
   * Get worker pool statistics
   */
  getPoolStats(): {
    totalWorkers: number;
    healthyWorkers: number;
    totalCapacity: number;
    currentLoad: number;
    loadPercentage: number;
    workersByType: Map<JobType, number>;
  } {
    const workers = Array.from(this.workers.values());
    const healthyWorkers = workers.filter(w => w.status.healthy);
    
    const totalCapacity = workers.reduce((sum, w) => sum + w.config.maxJobs, 0);
    const currentLoad = workers.reduce((sum, w) => sum + w.status.activeJobs, 0);
    const loadPercentage = totalCapacity > 0 ? (currentLoad / totalCapacity) * 100 : 0;

    // Count workers by supported job types
    const workersByType = new Map<JobType, number>();
    for (const worker of healthyWorkers) {
      for (const jobType of worker.config.supportedJobTypes) {
        workersByType.set(jobType, (workersByType.get(jobType) || 0) + 1);
      }
    }

    return {
      totalWorkers: workers.length,
      healthyWorkers: healthyWorkers.length,
      totalCapacity,
      currentLoad,
      loadPercentage: Math.round(loadPercentage * 100) / 100,
      workersByType
    };
  }

  /**
   * Shutdown all workers gracefully
   */
  async shutdown(timeoutMs: number = 60000): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info({ workerCount: this.workers.size }, 'Starting worker pool shutdown');

    const shutdownPromises: Promise<void>[] = [];

    // Shutdown all workers
    for (const [workerId, worker] of this.workers) {
      shutdownPromises.push(this.shutdownWorkerGracefully(worker, timeoutMs));
    }

    try {
      await Promise.all(shutdownPromises);
      logger.info('All workers shut down gracefully');
    } catch (error) {
      logger.warn('Some workers did not shut down gracefully');
    }

    // Clear workers map
    this.workers.clear();
    
    logger.info('Worker pool shutdown completed');
  }

  // Private methods

  private setupEventListeners(): void {
    // Listen to job queue events for load balancing
    this.jobQueue.on('job_created', () => {
      // Trigger auto-scaling check if needed
      if (this.workers.size > 0) {
        setImmediate(() => this.autoScale().catch(() => {}));
      }
    });
  }

  private setupWorkerEventHandlers(worker: WorkerInstance): void {
    const { processor, status } = worker;

    processor.on('job_started', (data: any) => {
      worker.currentJobs.set(data.jobId, data.job);
      status.activeJobs = worker.currentJobs.size;
      status.lastActivity = new Date();
      this.jobMonitor.updateWorkerStatus(worker.config.id, status);
    });

    processor.on('job_completed', (data: any) => {
      worker.currentJobs.delete(data.jobId);
      status.activeJobs = worker.currentJobs.size;
      status.totalProcessed++;
      status.lastActivity = new Date();
      this.jobMonitor.updateWorkerStatus(worker.config.id, status);
    });

    processor.on('job_failed', (data: any) => {
      worker.currentJobs.delete(data.jobId);
      status.activeJobs = worker.currentJobs.size;
      status.lastActivity = new Date();
      
      // Track errors
      const errorMessage = data.error || 'Unknown error';
      status.errors = [...(status.errors || []), {
        timestamp: new Date(),
        message: errorMessage,
        jobId: data.jobId
      }].slice(-10); // Keep last 10 errors

      this.jobMonitor.updateWorkerStatus(worker.config.id, status);
    });
  }

  private startWorkerHealthCheck(worker: WorkerInstance): void {
    worker.healthCheckTimer = setInterval(() => {
      this.performWorkerHealthCheck(worker).catch(error => {
        logger.error({
          workerId: worker.config.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Worker health check failed');
      });
    }, worker.config.healthCheckInterval);
  }

  private async performWorkerHealthCheck(worker: WorkerInstance): Promise<void> {
    try {
      const now = new Date();
      const timeSinceLastActivity = now.getTime() - worker.status.lastActivity.getTime();
      const maxInactiveTime = worker.config.healthCheckInterval * 3; // 3x health check interval

      // Check if worker has been inactive for too long
      let healthy = timeSinceLastActivity < maxInactiveTime;

      // Check if worker has too many errors recently
      const recentErrors = (worker.status.errors || []).filter(error => 
        now.getTime() - error.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
      );

      if (recentErrors.length > 5) {
        healthy = false;
      }

      // Update worker health status
      const wasHealthy = worker.status.healthy;
      worker.status.healthy = healthy;

      if (wasHealthy !== healthy) {
        logger.info({
          workerId: worker.config.id,
          healthy,
          timeSinceLastActivity,
          recentErrors: recentErrors.length
        }, `Worker health changed: ${wasHealthy ? 'healthy' : 'unhealthy'} -> ${healthy ? 'healthy' : 'unhealthy'}`);

        this.emit('worker_health_changed', { worker, wasHealthy, healthy });
      }

      this.jobMonitor.updateWorkerStatus(worker.config.id, worker.status);

    } catch (error) {
      worker.status.healthy = false;
      worker.status.errors = [...(worker.status.errors || []), {
        timestamp: new Date(),
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        jobId: 'health_check'
      }].slice(-10);

      this.jobMonitor.updateWorkerStatus(worker.config.id, worker.status);
    }
  }

  private async shutdownWorkerGracefully(worker: WorkerInstance, timeoutMs: number = 30000): Promise<void> {
    return new Promise<void>((resolve) => {
      const workerId = worker.config.id;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        logger.warn({ workerId }, 'Worker graceful shutdown timed out, forcing shutdown');
        worker.processor.stopProcessing();
        resolve();
      }, timeoutMs);

      // Wait for current jobs to complete
      const checkInterval = setInterval(() => {
        if (worker.currentJobs.size === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          worker.processor.stopProcessing();
          logger.info({ workerId }, 'Worker shut down gracefully');
          resolve();
        }
      }, 1000);

      // If no active jobs, shutdown immediately
      if (worker.currentJobs.size === 0) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        worker.processor.stopProcessing();
        resolve();
      }
    });
  }

  private async scaleUp(): Promise<void> {
    try {
      const currentWorkers = this.workers.size;
      const maxWorkers = 10; // Configurable maximum

      if (currentWorkers >= maxWorkers) {
        logger.debug('Cannot scale up: at maximum worker limit');
        return;
      }

      const newWorkerConfig: WorkerConfig = {
        id: `auto_worker_${Date.now()}`,
        maxJobs: 5,
        supportedJobTypes: [JobType.DIGEST_GENERATION, JobType.NOTIFICATION, JobType.CLEANUP],
        enabled: true,
        healthCheckInterval: 30000,
        gracefulShutdownTimeout: 30000
      };

      await this.addWorker(newWorkerConfig);
      logger.info({ newWorkerId: newWorkerConfig.id }, 'Scaled up: added new worker');

    } catch (error) {
      logger.error({ error }, 'Failed to scale up workers');
    }
  }

  private async scaleDown(): Promise<void> {
    try {
      const workers = Array.from(this.workers.values());
      const autoWorkers = workers.filter(w => w.config.id.startsWith('auto_worker_'));
      
      if (autoWorkers.length === 0) {
        logger.debug('Cannot scale down: no auto-created workers to remove');
        return;
      }

      // Find the least loaded auto worker
      const leastLoaded = autoWorkers.reduce((min, worker) => 
        worker.status.activeJobs < min.status.activeJobs ? worker : min
      );

      await this.removeWorker(leastLoaded.config.id, true);
      logger.info({ removedWorkerId: leastLoaded.config.id }, 'Scaled down: removed worker');

    } catch (error) {
      logger.error({ error }, 'Failed to scale down workers');
    }
  }
}