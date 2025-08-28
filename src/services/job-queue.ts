/**
 * Job Queue System - In-memory queue with persistence backup
 */

import { EventEmitter } from 'events';
import {
  BaseJob,
  JobStatus,
  JobPriority,
  JobType,
  CreateJobOptions,
  UpdateJobOptions,
  JobQueryFilters,
  JobQueueConfig,
  JobEvent,
  JobEventData,
  JobMetrics
} from '../types/job';
import { logger } from '../lib/logger';
import { db } from '../db';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid';

export class JobQueue extends EventEmitter {
  private queue: Map<string, BaseJob> = new Map();
  private priorityQueue: BaseJob[] = [];
  private runningJobs: Map<string, BaseJob> = new Map();
  private completedJobs: Map<string, BaseJob> = new Map();
  private failedJobs: Map<string, BaseJob> = new Map();
  private scheduledJobs: Map<string, BaseJob> = new Map();
  
  private persistenceTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  
  private config: JobQueueConfig = {
    maxConcurrentJobs: 10,
    retryDelay: 1000,
    maxRetryDelay: 60000,
    retryBackoffFactor: 2,
    defaultMaxRetries: 3,
    jobTimeout: 300000, // 5 minutes
    cleanupInterval: 60000, // 1 minute
    persistenceInterval: 5000, // 5 seconds
    enableMetrics: true
  };

  private metrics: JobMetrics = {
    totalJobs: 0,
    pendingJobs: 0,
    runningJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    averageProcessingTime: 0,
    successRate: 0,
    queueLength: 0,
    activeWorkers: 0,
    lastUpdated: new Date()
  };

  constructor(config?: Partial<JobQueueConfig>) {
    super();
    this.config = { ...this.config, ...config };
    this.startBackgroundTasks();
    this.loadPersistedJobs();
  }

  /**
   * Create and queue a new job
   */
  async createJob(options: CreateJobOptions): Promise<BaseJob> {
    // Validate digestId if provided
    let validatedDigestId = options.digestId;
    if (options.digestId) {
      try {
        const digest = await db.digest.findUnique({
          where: { id: options.digestId }
        });
        if (!digest) {
          logger.warn({ 
            jobType: options.type, 
            invalidDigestId: options.digestId 
          }, 'Job created with non-existent digestId, setting to null');
          validatedDigestId = undefined;
        }
      } catch (error) {
        logger.error({ 
          error, 
          digestId: options.digestId,
          jobType: options.type 
        }, 'Failed to validate digestId, setting to null');
        validatedDigestId = undefined;
      }
    }

    const job: BaseJob = {
      id: `job_${uuidv4()}`,
      type: options.type,
      status: options.scheduleTime && options.scheduleTime > new Date() 
        ? JobStatus.PENDING 
        : JobStatus.QUEUED,
      priority: options.priority || JobPriority.NORMAL,
      params: options.params,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: options.createdById,
      digestId: validatedDigestId,
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.defaultMaxRetries,
      scheduleTime: options.scheduleTime,
      dependencies: options.dependencies || [],
      tags: options.tags || [],
      metadata: options.metadata || {}
    };

    // Validate dependencies
    if (job.dependencies && job.dependencies.length > 0) {
      const unresolved = await this.validateDependencies(job.dependencies);
      if (unresolved.length > 0) {
        throw new Error(`Unresolved dependencies: ${unresolved.join(', ')}`);
      }
    }

    // Add to appropriate queue
    if (job.scheduleTime && job.scheduleTime > new Date()) {
      this.scheduledJobs.set(job.id, job);
      logger.info({ jobId: job.id, scheduleTime: job.scheduleTime }, 'Job scheduled');
    } else {
      this.queue.set(job.id, job);
      this.addToPriorityQueue(job);
      logger.info({ jobId: job.id, type: job.type }, 'Job queued');
    }

    // Persist to database
    await this.persistJob(job);

    // Emit event
    this.emitJobEvent(JobEvent.CREATED, job);

    // Update metrics
    this.updateMetrics();

    return job;
  }

  /**
   * Get next job from priority queue
   */
  getNextJob(): BaseJob | null {
    // Check for scheduled jobs that are ready
    this.processScheduledJobs();

    // Check dependencies for queued jobs
    this.processDependentJobs();

    if (this.priorityQueue.length === 0) {
      return null;
    }

    // Get highest priority job
    const job = this.priorityQueue.shift()!;
    this.queue.delete(job.id);
    this.runningJobs.set(job.id, job);

    // Update job status
    job.status = JobStatus.RUNNING;
    job.startedAt = new Date();
    job.updatedAt = new Date();

    this.emitJobEvent(JobEvent.STARTED, job);
    return job;
  }

  /**
   * Update job status and properties
   */
  async updateJob(jobId: string, updates: UpdateJobOptions): Promise<BaseJob | null> {
    let job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    const oldStatus = job.status;

    // Apply updates
    Object.assign(job, {
      ...updates,
      updatedAt: new Date()
    });

    // Move job between collections if status changed
    if (updates.status && updates.status !== oldStatus) {
      this.moveJobBetweenCollections(job, oldStatus, updates.status);
    }

    // Persist changes
    await this.persistJob(job);

    // Emit appropriate events
    if (updates.status) {
      switch (updates.status) {
        case JobStatus.COMPLETED:
          this.emitJobEvent(JobEvent.COMPLETED, job);
          break;
        case JobStatus.FAILED:
          this.emitJobEvent(JobEvent.FAILED, job);
          break;
        case JobStatus.CANCELLED:
          this.emitJobEvent(JobEvent.CANCELLED, job);
          break;
        case JobStatus.RETRYING:
          this.emitJobEvent(JobEvent.RETRYING, job);
          break;
      }
    }

    if (updates.progress !== undefined) {
      this.emitJobEvent(JobEvent.PROGRESS_UPDATED, job);
    }

    this.updateMetrics();
    return job;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BaseJob | null {
    return this.findJob(jobId);
  }

  /**
   * Query jobs with filters
   */
  queryJobs(filters: JobQueryFilters = {}): BaseJob[] {
    let jobs: BaseJob[] = [];

    // Collect jobs from all collections
    jobs = jobs.concat(
      Array.from(this.queue.values()),
      Array.from(this.runningJobs.values()),
      Array.from(this.completedJobs.values()),
      Array.from(this.failedJobs.values()),
      Array.from(this.scheduledJobs.values())
    );

    // Apply filters
    if (filters.status) {
      jobs = jobs.filter(job => filters.status!.includes(job.status));
    }

    if (filters.type) {
      jobs = jobs.filter(job => filters.type!.includes(job.type));
    }

    if (filters.priority) {
      jobs = jobs.filter(job => filters.priority!.includes(job.priority));
    }

    if (filters.createdById) {
      jobs = jobs.filter(job => job.createdById === filters.createdById);
    }

    if (filters.digestId) {
      jobs = jobs.filter(job => job.digestId === filters.digestId);
    }

    if (filters.tags && filters.tags.length > 0) {
      jobs = jobs.filter(job => 
        job.tags && job.tags.some(tag => filters.tags!.includes(tag))
      );
    }

    if (filters.dateFrom) {
      jobs = jobs.filter(job => job.createdAt >= filters.dateFrom!);
    }

    if (filters.dateTo) {
      jobs = jobs.filter(job => job.createdAt <= filters.dateTo!);
    }

    // Sort results
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';

    jobs.sort((a, b) => {
      let aVal: any = a[sortBy];
      let bVal: any = b[sortBy];

      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Apply pagination
    if (filters.offset || filters.limit) {
      const offset = filters.offset || 0;
      const limit = filters.limit || jobs.length;
      jobs = jobs.slice(offset, offset + limit);
    }

    return jobs;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.findJob(jobId);
    if (!job) {
      return false;
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED) {
      return false;
    }

    await this.updateJob(jobId, {
      status: JobStatus.CANCELLED,
      finishedAt: new Date(),
      error: 'Job cancelled by user'
    });

    return true;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    const job = this.findJob(jobId);
    // Allow retrying both FAILED and RETRYING jobs
    if (!job || (job.status !== JobStatus.FAILED && job.status !== JobStatus.RETRYING)) {
      return false;
    }

    if (job.retryCount >= job.maxRetries) {
      return false;
    }

    // Calculate retry delay with exponential backoff
    const delay = Math.min(
      this.config.retryDelay * Math.pow(this.config.retryBackoffFactor, job.retryCount),
      this.config.maxRetryDelay
    );

    const scheduleTime = new Date(Date.now() + delay);

    const updated = await this.updateJob(jobId, {
      status: JobStatus.PENDING,
      error: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      scheduleTime
    });

    // Move to scheduled jobs from any previous collection
    this.queue.delete(jobId);
    this.runningJobs.delete(jobId);
    this.completedJobs.delete(jobId);
    this.failedJobs.delete(jobId);
    this.priorityQueue = this.priorityQueue.filter(j => j.id !== jobId);
    if (updated) {
      this.scheduledJobs.set(jobId, updated);
    } else if (job) {
      this.scheduledJobs.set(jobId, job);
    }

    return true;
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): JobMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear completed and failed jobs
   */
  async cleanup(olderThanHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - (olderThanHours * 60 * 60 * 1000));
    let cleanedCount = 0;

    // Clean completed jobs
    for (const [jobId, job] of this.completedJobs) {
      if (job.finishedAt && job.finishedAt < cutoffTime) {
        this.completedJobs.delete(jobId);
        await this.deleteJobFromDb(jobId);
        cleanedCount++;
      }
    }

    // Clean old failed jobs
    for (const [jobId, job] of this.failedJobs) {
      if (job.finishedAt && job.finishedAt < cutoffTime) {
        this.failedJobs.delete(jobId);
        await this.deleteJobFromDb(jobId);
        cleanedCount++;
      }
    }

    logger.info({ cleanedCount, olderThanHours }, 'Job cleanup completed');
    return cleanedCount;
  }

  /**
   * Shutdown the queue gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down job queue...');

    // Clear timers
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    // Final persistence
    await this.persistAllJobs();

    logger.info('Job queue shutdown completed');
  }

  // Private helper methods

  private addToPriorityQueue(job: BaseJob): void {
    // Insert job in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.priorityQueue.length; i++) {
      if (job.priority > this.priorityQueue[i].priority) {
        this.priorityQueue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.priorityQueue.push(job);
    }
  }

  private findJob(jobId: string): BaseJob | null {
    return this.queue.get(jobId) ||
           this.runningJobs.get(jobId) ||
           this.completedJobs.get(jobId) ||
           this.failedJobs.get(jobId) ||
           this.scheduledJobs.get(jobId) ||
           null;
  }

  private moveJobBetweenCollections(job: BaseJob, oldStatus: JobStatus, newStatus: JobStatus): void {
    // Remove from old collection
    switch (oldStatus) {
      case JobStatus.QUEUED:
      case JobStatus.PENDING:
        this.queue.delete(job.id);
        this.priorityQueue = this.priorityQueue.filter(j => j.id !== job.id);
        break;
      case JobStatus.RUNNING:
        this.runningJobs.delete(job.id);
        break;
      case JobStatus.COMPLETED:
        this.completedJobs.delete(job.id);
        break;
      case JobStatus.FAILED:
        this.failedJobs.delete(job.id);
        break;
    }

    // Add to new collection
    switch (newStatus) {
      case JobStatus.QUEUED:
        this.queue.set(job.id, job);
        this.addToPriorityQueue(job);
        break;
      case JobStatus.RUNNING:
        this.runningJobs.set(job.id, job);
        break;
      case JobStatus.COMPLETED:
        this.completedJobs.set(job.id, job);
        break;
      case JobStatus.FAILED:
        this.failedJobs.set(job.id, job);
        break;
      case JobStatus.PENDING:
        if (job.scheduleTime && job.scheduleTime > new Date()) {
          this.scheduledJobs.set(job.id, job);
        } else {
          this.queue.set(job.id, job);
          this.addToPriorityQueue(job);
        }
        break;
    }
  }

  private processScheduledJobs(): void {
    const now = new Date();
    const readyJobs: BaseJob[] = [];

    for (const [jobId, job] of this.scheduledJobs) {
      if (!job.scheduleTime || job.scheduleTime <= now) {
        readyJobs.push(job);
      }
    }

    for (const job of readyJobs) {
      this.scheduledJobs.delete(job.id);
      job.status = JobStatus.QUEUED;
      job.scheduleTime = undefined;
      this.queue.set(job.id, job);
      this.addToPriorityQueue(job);
    }
  }

  private async processDependentJobs(): Promise<void> {
    const dependentJobs: BaseJob[] = [];

    for (const job of this.priorityQueue) {
      if (job.dependencies && job.dependencies.length > 0) {
        const resolved = await this.checkDependencies(job.dependencies);
        if (resolved) {
          dependentJobs.push(job);
        }
      }
    }

    // Dependencies are resolved, these jobs can now run
    // (They're already in the priority queue, so no action needed)
  }

  private async validateDependencies(dependencies: string[]): Promise<string[]> {
    const unresolved: string[] = [];
    
    for (const depId of dependencies) {
      const depJob = this.findJob(depId);
      if (!depJob) {
        unresolved.push(depId);
      }
    }

    return unresolved;
  }

  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    for (const depId of dependencies) {
      const depJob = this.findJob(depId);
      if (!depJob || depJob.status !== JobStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  private emitJobEvent(event: JobEvent, job: BaseJob): void {
    const eventData: JobEventData = {
      event,
      jobId: job.id,
      job: { ...job },
      timestamp: new Date()
    };

    this.emit(event, eventData);
    this.emit('job_event', eventData);
  }

  private updateMetrics(): void {
    this.metrics = {
      totalJobs: this.queue.size + this.runningJobs.size + this.completedJobs.size + this.failedJobs.size + this.scheduledJobs.size,
      pendingJobs: this.queue.size + this.scheduledJobs.size,
      runningJobs: this.runningJobs.size,
      completedJobs: this.completedJobs.size,
      failedJobs: this.failedJobs.size,
      queueLength: this.priorityQueue.length,
      activeWorkers: 0, // Will be updated by WorkerManager
      averageProcessingTime: this.calculateAverageProcessingTime(),
      successRate: this.calculateSuccessRate(),
      lastUpdated: new Date()
    };
  }

  private calculateAverageProcessingTime(): number {
    const completedJobs = Array.from(this.completedJobs.values());
    if (completedJobs.length === 0) return 0;

    const totalTime = completedJobs.reduce((sum, job) => {
      if (job.startedAt && job.finishedAt) {
        return sum + (job.finishedAt.getTime() - job.startedAt.getTime());
      }
      return sum;
    }, 0);

    return totalTime / completedJobs.length;
  }

  private calculateSuccessRate(): number {
    const total = this.completedJobs.size + this.failedJobs.size;
    if (total === 0) return 0;
    return (this.completedJobs.size / total) * 100;
  }

  private startBackgroundTasks(): void {
    // Persistence timer
    this.persistenceTimer = setInterval(() => {
      this.persistAllJobs().catch(error => {
        logger.error({ error }, 'Failed to persist jobs');
      });
    }, this.config.persistenceInterval);

    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        logger.error({ error }, 'Failed to cleanup jobs');
      });
    }, this.config.cleanupInterval);

    // Metrics timer
    if (this.config.enableMetrics) {
      this.metricsTimer = setInterval(() => {
        this.updateMetrics();
      }, 10000); // Update metrics every 10 seconds
    }
  }

  private async loadPersistedJobs(): Promise<void> {
    try {
      const jobs = await db.job.findMany({
        where: {
          status: {
            in: ['PENDING', 'QUEUED', 'RUNNING']
          }
        }
      });

      for (const dbJob of jobs) {
        const job: BaseJob = {
          id: dbJob.id,
          type: dbJob.type as JobType,
          status: dbJob.status as JobStatus,
          priority: (dbJob.paramsJson as any).priority || JobPriority.NORMAL,
          params: JSON.parse(dbJob.paramsJson),
          progress: dbJob.progress,
          error: dbJob.error || undefined,
          startedAt: dbJob.startedAt || undefined,
          finishedAt: dbJob.finishedAt || undefined,
          createdAt: dbJob.createdAt,
          updatedAt: new Date(),
          createdById: dbJob.createdById,
          digestId: dbJob.digestId || undefined,
          retryCount: 0,
          maxRetries: this.config.defaultMaxRetries,
          dependencies: [],
          tags: [],
          metadata: {}
        };

        // Reset running jobs to queued (they were interrupted)
        if (job.status === JobStatus.RUNNING) {
          job.status = JobStatus.QUEUED;
          job.startedAt = undefined;
        }

        if (job.status === JobStatus.QUEUED) {
          this.queue.set(job.id, job);
          this.addToPriorityQueue(job);
        } else if (job.status === JobStatus.PENDING) {
          this.scheduledJobs.set(job.id, job);
        }
      }

      logger.info({ loadedJobs: jobs.length }, 'Loaded persisted jobs');
    } catch (error) {
      logger.error({ error }, 'Failed to load persisted jobs');
    }
  }

  private async persistJob(job: BaseJob): Promise<void> {
    try {
      await db.job.upsert({
        where: { id: job.id },
        update: {
          status: job.status,
          progress: job.progress,
          error: job.error,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          digestId: job.digestId,
          paramsJson: JSON.stringify({
            ...job.params,
            priority: job.priority,
            retryCount: job.retryCount,
            maxRetries: job.maxRetries,
            dependencies: job.dependencies,
            tags: job.tags,
            metadata: job.metadata
          })
        },
        create: {
          id: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          paramsJson: JSON.stringify({
            ...job.params,
            priority: job.priority,
            retryCount: job.retryCount,
            maxRetries: job.maxRetries,
            dependencies: job.dependencies,
            tags: job.tags,
            metadata: job.metadata
          }),
          error: job.error,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          createdById: job.createdById,
          digestId: job.digestId
        }
      });
    } catch (error) {
      // Handle foreign key constraint violation specifically
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2003') {
        logger.warn({ 
          jobId: job.id, 
          jobType: job.type,
          digestId: job.digestId,
          error: error.message 
        }, 'Foreign key constraint violation during job persistence, retrying with null digestId');
        
        // Retry with digestId set to null
        try {
          await db.job.upsert({
            where: { id: job.id },
            update: {
              status: job.status,
              progress: job.progress,
              error: job.error,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              digestId: null,
              paramsJson: JSON.stringify({
                ...job.params,
                priority: job.priority,
                retryCount: job.retryCount,
                maxRetries: job.maxRetries,
                dependencies: job.dependencies,
                tags: job.tags,
                metadata: job.metadata
              })
            },
            create: {
              id: job.id,
              type: job.type,
              status: job.status,
              progress: job.progress,
              paramsJson: JSON.stringify({
                ...job.params,
                priority: job.priority,
                retryCount: job.retryCount,
                maxRetries: job.maxRetries,
                dependencies: job.dependencies,
                tags: job.tags,
                metadata: job.metadata
              }),
              error: job.error,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              createdById: job.createdById,
              digestId: null
            }
          });
          
          // Update the in-memory job to reflect the null digestId
          job.digestId = undefined;
          logger.info({ jobId: job.id }, 'Successfully persisted job with null digestId after constraint violation');
          
        } catch (retryError) {
          logger.error({ 
            retryError, 
            jobId: job.id, 
            originalError: error 
          }, 'Failed to persist job even after setting digestId to null');
        }
      } else {
        logger.error({ error, jobId: job.id }, 'Failed to persist job');
      }
    }
  }

  private async persistAllJobs(): Promise<void> {
    const allJobs = [
      ...Array.from(this.queue.values()),
      ...Array.from(this.runningJobs.values()),
      ...Array.from(this.completedJobs.values()),
      ...Array.from(this.failedJobs.values()),
      ...Array.from(this.scheduledJobs.values())
    ];

    await Promise.all(allJobs.map(job => this.persistJob(job)));
  }

  private async deleteJobFromDb(jobId: string): Promise<void> {
    try {
      await db.job.delete({
        where: { id: jobId }
      });
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to delete job from database');
    }
  }
}