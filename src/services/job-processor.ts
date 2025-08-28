/**
 * Job Processor - Main job processing engine with error handling and recovery
 */

import { EventEmitter } from 'events';
import {
  BaseJob,
  JobStatus,
  JobType,
  JobResult,
  JobHandler,
  JobEvent,
  JobEventData
} from '../types/job';
import { JobQueue } from './job-queue';
import { logger } from '../lib/logger';

export class JobProcessor extends EventEmitter {
  private jobQueue: JobQueue;
  private handlers: Map<JobType, JobHandler> = new Map();
  private activeJobs: Map<string, AbortController> = new Map();
  private isProcessing = false;
  private processInterval?: NodeJS.Timeout;
  private maxConcurrentJobs: number;
  private jobTimeout: number;
  private shutdownSignal = false;

  constructor(
    jobQueue: JobQueue,
    options: {
      maxConcurrentJobs?: number;
      jobTimeout?: number;
      processInterval?: number;
    } = {}
  ) {
    super();
    this.jobQueue = jobQueue;
    this.maxConcurrentJobs = options.maxConcurrentJobs || 5;
    this.jobTimeout = options.jobTimeout || 300000; // 5 minutes
    
    // Set up job queue event listeners
    this.setupJobQueueListeners();
    
    // Start processing
    // Autostart removed; processing should be started explicitly after handlers are registered
  }

  /**
   * Register a job handler for a specific job type
   */
  registerHandler(handler: JobHandler): void {
    if (this.handlers.has(handler.type)) {
      logger.warn({ jobType: handler.type }, 'Handler already exists, overwriting');
    }
    
    this.handlers.set(handler.type, handler);
    logger.info({ jobType: handler.type }, 'Job handler registered');
  }

  /**
   * Unregister a job handler
   */
  unregisterHandler(jobType: JobType): void {
    this.handlers.delete(jobType);
    logger.info({ jobType }, 'Job handler unregistered');
  }

  /**
   * Get all registered handlers
   */
  getHandlers(): JobType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Process a single job
   */
  async processJob(job: BaseJob): Promise<JobResult> {
    logger.info({ jobId: job.id, jobType: job.type, availableHandlers: Array.from(this.handlers.keys()) }, 'Processing job');
    
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const error = `No handler registered for job type: ${job.type}`;
      logger.error({ 
        jobId: job.id, 
        jobType: job.type, 
        jobTypeType: typeof job.type,
        availableHandlers: Array.from(this.handlers.keys()),
        handlerKeysTypes: Array.from(this.handlers.keys()).map(k => ({ key: k, type: typeof k }))
      }, error);
      return { success: false, error };
    }

    // Validate job parameters if validator exists
    if (handler.validate && !handler.validate(job.params)) {
      const error = 'Job parameter validation failed';
      logger.error({ jobId: job.id, params: job.params }, error);
      return { success: false, error };
    }

    const startTime = Date.now();
    const abortController = new AbortController();
    this.activeJobs.set(job.id, abortController);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      logger.warn({ jobId: job.id }, 'Job timed out');
    }, this.jobTimeout);

    try {
      logger.info({ 
        jobId: job.id, 
        jobType: job.type, 
        params: job.params 
      }, 'Starting job processing');

      // Update job status to running
      await this.jobQueue.updateJob(job.id, {
        status: JobStatus.RUNNING,
        startedAt: new Date(),
        progress: 0
      });

      // Process the job
      const result = await handler.handle(job);

      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;

      if (result.success) {
        logger.info({ 
          jobId: job.id, 
          processingTime,
          result: result.data 
        }, 'Job completed successfully');

        await this.jobQueue.updateJob(job.id, {
          status: JobStatus.COMPLETED,
          progress: 100,
          finishedAt: new Date()
        });

        this.emit('job_completed', {
          jobId: job.id,
          job,
          result,
          processingTime
        });
      } else {
        logger.error({ 
          jobId: job.id, 
          error: result.error,
          processingTime 
        }, 'Job failed');

        await this.handleJobFailure(job, result.error || 'Unknown error');
      }

      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ 
        jobId: job.id, 
        error: errorMessage,
        processingTime,
        stack: error instanceof Error ? error.stack : undefined
      }, 'Job processing threw an exception');

      await this.handleJobFailure(job, errorMessage);

      return { success: false, error: errorMessage };

    } finally {
      clearTimeout(timeoutId);
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const abortController = this.activeJobs.get(jobId);
    if (abortController) {
      abortController.abort();
      this.activeJobs.delete(jobId);
      
      await this.jobQueue.updateJob(jobId, {
        status: JobStatus.CANCELLED,
        finishedAt: new Date(),
        error: 'Job cancelled by user'
      });

      logger.info({ jobId }, 'Job cancelled');
      return true;
    }

    // Try to cancel from queue
    return await this.jobQueue.cancelJob(jobId);
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    activeJobs: number;
    registeredHandlers: number;
    isProcessing: boolean;
    maxConcurrentJobs: number;
  } {
    return {
      activeJobs: this.activeJobs.size,
      registeredHandlers: this.handlers.size,
      isProcessing: this.isProcessing,
      maxConcurrentJobs: this.maxConcurrentJobs
    };
  }

  /**
   * Start job processing
   */
  startProcessing(intervalMs: number = 1000): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.shutdownSignal = false;
    
    this.processInterval = setInterval(async () => {
      if (this.shutdownSignal) {
        return;
      }

      try {
        await this.processNextJobs();
      } catch (error) {
        logger.error({ error }, 'Error in job processing loop');
      }
    }, intervalMs);

    logger.info({ intervalMs }, 'Job processing started');
  }

  /**
   * Stop job processing
   */
  stopProcessing(): void {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }

    logger.info('Job processing stopped');
  }

  /**
   * Graceful shutdown - wait for active jobs to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info({ activeJobs: this.activeJobs.size }, 'Starting graceful shutdown');
    
    this.shutdownSignal = true;
    this.stopProcessing();

    // Wait for active jobs to complete or timeout
    const startTime = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Force cancel remaining jobs
    if (this.activeJobs.size > 0) {
      logger.warn({ 
        remainingJobs: this.activeJobs.size 
      }, 'Force cancelling remaining jobs');
      
      for (const [jobId, controller] of this.activeJobs) {
        controller.abort();
        await this.jobQueue.updateJob(jobId, {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          error: 'Job cancelled due to system shutdown'
        });
      }
      
      this.activeJobs.clear();
    }

    logger.info('Job processor shutdown completed');
  }

  // Private methods

  private async processNextJobs(): Promise<void> {
    const availableSlots = this.maxConcurrentJobs - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    // Get jobs to process
    const jobsToProcess: BaseJob[] = [];
    for (let i = 0; i < availableSlots; i++) {
      const job = this.jobQueue.getNextJob();
      if (!job) break;
      
      // Check if we have a handler for this job type
      logger.info({
        jobId: job.id,
        jobType: job.type,
        jobTypeType: typeof job.type,
        availableHandlers: Array.from(this.handlers.keys()),
        handlerKeysTypes: Array.from(this.handlers.keys()).map(k => ({ key: k, type: typeof k })),
        hasHandler: this.handlers.has(job.type)
      }, 'Checking handler for job type');
      
      if (!this.handlers.has(job.type)) {
        logger.error({ 
          jobId: job.id, 
          jobType: job.type 
        }, 'No handler available for job type, marking as failed');
        
        await this.jobQueue.updateJob(job.id, {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          error: `No handler registered for job type: ${job.type}`
        });
        continue;
      }

      jobsToProcess.push(job);
    }

    // Process jobs concurrently
    if (jobsToProcess.length > 0) {
      const promises = jobsToProcess.map(job => 
        this.processJob(job).catch(error => {
          logger.error({ jobId: job.id, error }, 'Unhandled error in job processing');
        })
      );

      await Promise.all(promises);
    }
  }

  private async handleJobFailure(job: BaseJob, error: string): Promise<void> {
    const shouldRetry = job.retryCount < job.maxRetries;
    
    if (shouldRetry) {
      // Increment retry count and schedule retry
      const updatedJob = await this.jobQueue.updateJob(job.id, {
        status: JobStatus.FAILED,
        error,
        retryCount: job.retryCount + 1
      });

      if (updatedJob) {
        // Schedule retry using the queue's retry mechanism
        await this.jobQueue.retryJob(job.id);
        
        logger.info({ 
          jobId: job.id, 
          retryCount: job.retryCount + 1,
          maxRetries: job.maxRetries 
        }, 'Job scheduled for retry');
      }
    } else {
      // Mark as permanently failed
      await this.jobQueue.updateJob(job.id, {
        status: JobStatus.FAILED,
        finishedAt: new Date(),
        error
      });

      this.emit('job_failed', {
        jobId: job.id,
        job,
        error,
        finalFailure: true
      });

      logger.error({ 
        jobId: job.id, 
        retryCount: job.retryCount,
        maxRetries: job.maxRetries 
      }, 'Job permanently failed after all retries');
    }
  }

  private setupJobQueueListeners(): void {
    this.jobQueue.on('job_event', (eventData: JobEventData) => {
      // Forward job events
      this.emit('job_event', eventData);
      
      // Emit specific events
      switch (eventData.event) {
        case JobEvent.CREATED:
          this.emit('job_created', eventData);
          break;
        case JobEvent.STARTED:
          this.emit('job_started', eventData);
          break;
        case JobEvent.COMPLETED:
          this.emit('job_completed', eventData);
          break;
        case JobEvent.FAILED:
          this.emit('job_failed', eventData);
          break;
        case JobEvent.CANCELLED:
          this.emit('job_cancelled', eventData);
          break;
        case JobEvent.RETRYING:
          this.emit('job_retrying', eventData);
          break;
        case JobEvent.PROGRESS_UPDATED:
          this.emit('job_progress', eventData);
          break;
      }
    });
  }
}