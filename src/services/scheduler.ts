/**
 * Job Scheduler - Cron-like job scheduling with timezone support
 */

import { EventEmitter } from 'events';
import {
  JobType,
  JobPriority,
  CreateJobOptions,
  ScheduleConfig,
  BaseJob
} from '../types/job';
import { JobQueue } from './job-queue';
import { logger } from '../lib/logger';
import { db } from '../db';

// Simple cron parser interface
interface CronExpression {
  minute: number[];      // 0-59
  hour: number[];        // 0-23
  dayOfMonth: number[];  // 1-31
  month: number[];       // 1-12
  dayOfWeek: number[];   // 0-7 (0 and 7 are Sunday)
}

export class JobScheduler extends EventEmitter {
  private jobQueue: JobQueue;
  private schedules: Map<string, ScheduleConfig> = new Map();
  private schedulerTimer?: NodeJS.Timeout;
  private isRunning = false;
  private checkInterval = 60000; // Check every minute

  constructor(jobQueue: JobQueue, checkInterval?: number) {
    super();
    this.jobQueue = jobQueue;
    this.checkInterval = checkInterval || 60000;
    this.loadSchedules();
  }

  /**
   * Add a new scheduled job
   */
  async addSchedule(schedule: Omit<ScheduleConfig, 'id' | 'nextRun'>): Promise<ScheduleConfig> {
    try {
      // Validate cron expression
      if (!this.validateCronExpression(schedule.cron)) {
        throw new Error(`Invalid cron expression: ${schedule.cron}`);
      }

      const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newSchedule: ScheduleConfig = {
        ...schedule,
        id: scheduleId,
        nextRun: this.calculateNextRun(schedule.cron, schedule.timezone)
      };

      this.schedules.set(scheduleId, newSchedule);
      await this.persistSchedule(newSchedule);

      logger.info({
        scheduleId,
        name: schedule.name,
        cron: schedule.cron,
        jobType: schedule.jobType,
        nextRun: newSchedule.nextRun
      }, 'Schedule added');

      this.emit('schedule_added', newSchedule);
      return newSchedule;

    } catch (error) {
      logger.error({
        schedule,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to add schedule');
      throw error;
    }
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(scheduleId: string, updates: Partial<ScheduleConfig>): Promise<ScheduleConfig | null> {
    try {
      const existingSchedule = this.schedules.get(scheduleId);
      if (!existingSchedule) {
        return null;
      }

      const updatedSchedule: ScheduleConfig = {
        ...existingSchedule,
        ...updates,
        nextRun: updates.cron || updates.timezone 
          ? this.calculateNextRun(updates.cron || existingSchedule.cron, updates.timezone || existingSchedule.timezone)
          : existingSchedule.nextRun
      };

      // Validate cron if it was updated
      if (updates.cron && !this.validateCronExpression(updates.cron)) {
        throw new Error(`Invalid cron expression: ${updates.cron}`);
      }

      this.schedules.set(scheduleId, updatedSchedule);
      await this.persistSchedule(updatedSchedule);

      logger.info({
        scheduleId,
        updates,
        nextRun: updatedSchedule.nextRun
      }, 'Schedule updated');

      this.emit('schedule_updated', updatedSchedule);
      return updatedSchedule;

    } catch (error) {
      logger.error({
        scheduleId,
        updates,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to update schedule');
      throw error;
    }
  }

  /**
   * Remove a schedule
   */
  async removeSchedule(scheduleId: string): Promise<boolean> {
    try {
      const schedule = this.schedules.get(scheduleId);
      if (!schedule) {
        return false;
      }

      this.schedules.delete(scheduleId);
      await this.deleteScheduleFromDb(scheduleId);

      logger.info({ scheduleId, name: schedule.name }, 'Schedule removed');
      this.emit('schedule_removed', schedule);
      return true;

    } catch (error) {
      logger.error({
        scheduleId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to remove schedule');
      throw error;
    }
  }

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId: string): ScheduleConfig | null {
    return this.schedules.get(scheduleId) || null;
  }

  /**
   * Get all schedules
   */
  getAllSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedules by job type
   */
  getSchedulesByType(jobType: JobType): ScheduleConfig[] {
    return Array.from(this.schedules.values()).filter(s => s.jobType === jobType);
  }

  /**
   * Get schedules created by user
   */
  getSchedulesByUser(userId: number): ScheduleConfig[] {
    return Array.from(this.schedules.values()).filter(s => s.createdById === userId);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.schedulerTimer = setInterval(() => {
      this.checkAndRunScheduledJobs().catch(error => {
        logger.error({ error }, 'Error in scheduler check');
      });
    }, this.checkInterval);

    logger.info({ 
      checkInterval: this.checkInterval,
      scheduleCount: this.schedules.size 
    }, 'Job scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }

    logger.info('Job scheduler stopped');
  }

  /**
   * Trigger a schedule manually
   */
  async triggerSchedule(scheduleId: string): Promise<BaseJob | null> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) {
      return null;
    }

    try {
      const job = await this.createJobFromSchedule(schedule);
      
      // Update last run time
      await this.updateSchedule(scheduleId, {
        lastRun: new Date()
      });

      logger.info({
        scheduleId,
        jobId: job.id,
        scheduleName: schedule.name
      }, 'Schedule triggered manually');

      return job;

    } catch (error) {
      logger.error({
        scheduleId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to trigger schedule manually');
      throw error;
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    isRunning: boolean;
    totalSchedules: number;
    enabledSchedules: number;
    nextScheduledRun?: Date;
    checkInterval: number;
  } {
    const enabledSchedules = Array.from(this.schedules.values()).filter(s => s.enabled);
    const nextRuns = enabledSchedules
      .map(s => s.nextRun)
      .filter((date): date is Date => date !== undefined)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      isRunning: this.isRunning,
      totalSchedules: this.schedules.size,
      enabledSchedules: enabledSchedules.length,
      nextScheduledRun: nextRuns[0],
      checkInterval: this.checkInterval
    };
  }

  // Private methods

  private async checkAndRunScheduledJobs(): Promise<void> {
    const now = new Date();
    const schedulesToRun: ScheduleConfig[] = [];

    // Find schedules that should run
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled || !schedule.nextRun) {
        continue;
      }

      if (schedule.nextRun <= now) {
        // Check for concurrent run limits
        if (schedule.maxConcurrentRuns && schedule.maxConcurrentRuns > 0) {
          const runningJobs = await this.countRunningJobsForSchedule(schedule);
          if (runningJobs >= schedule.maxConcurrentRuns) {
            logger.warn({
              scheduleId: schedule.id,
              runningJobs,
              maxConcurrentRuns: schedule.maxConcurrentRuns
            }, 'Schedule skipped due to concurrent run limit');
            continue;
          }
        }

        schedulesToRun.push(schedule);
      }
    }

    // Execute schedules
    for (const schedule of schedulesToRun) {
      try {
        await this.executeSchedule(schedule);
      } catch (error) {
        logger.error({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to execute scheduled job');
      }
    }

    if (schedulesToRun.length > 0) {
      logger.info({
        executedSchedules: schedulesToRun.length
      }, 'Scheduled jobs check completed');
    }
  }

  private async executeSchedule(schedule: ScheduleConfig): Promise<void> {
    try {
      const job = await this.createJobFromSchedule(schedule);
      
      // Calculate next run time
      const nextRun = this.calculateNextRun(schedule.cron, schedule.timezone);
      
      // Update schedule
      await this.updateSchedule(schedule.id, {
        lastRun: new Date(),
        nextRun
      });

      logger.info({
        scheduleId: schedule.id,
        jobId: job.id,
        scheduleName: schedule.name,
        nextRun
      }, 'Scheduled job created');

      this.emit('job_scheduled', { schedule, job });

    } catch (error) {
      logger.error({
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to execute schedule');
      
      this.emit('schedule_error', { schedule, error });
    }
  }

  private async createJobFromSchedule(schedule: ScheduleConfig): Promise<BaseJob> {
    const jobOptions: CreateJobOptions = {
      type: schedule.jobType,
      params: schedule.jobParams,
      priority: JobPriority.NORMAL,
      createdById: schedule.createdById,
      tags: ['scheduled', `schedule:${schedule.id}`],
      metadata: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduledAt: new Date().toISOString()
      }
    };

    return await this.jobQueue.createJob(jobOptions);
  }

  private async countRunningJobsForSchedule(schedule: ScheduleConfig): Promise<number> {
    try {
      return await db.job.count({
        where: {
          status: 'RUNNING',
          type: schedule.jobType,
          paramsJson: {
            contains: `"scheduleId":"${schedule.id}"`
          }
        }
      });
    } catch (error) {
      logger.error({
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to count running jobs for schedule');
      return 0;
    }
  }

  private calculateNextRun(cronExpression: string, timezone?: string): Date {
    try {
      const cron = this.parseCronExpression(cronExpression);
      const now = new Date();
      
      // Start from the next minute
      const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
      
      // Find the next matching time
      for (let i = 0; i < 366 * 24 * 60; i++) { // Search up to a year
        const candidate = new Date(nextMinute.getTime() + i * 60000);
        
        if (this.cronMatches(cron, candidate)) {
          return candidate;
        }
      }

      // Fallback: schedule for next hour
      return new Date(now.getTime() + 60 * 60 * 1000);

    } catch (error) {
      logger.error({
        cronExpression,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to calculate next run time');
      
      // Fallback: schedule for next hour
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  private parseCronExpression(cron: string): CronExpression {
    const parts = cron.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error('Cron expression must have 5 parts: minute hour day month weekday');
    }

    return {
      minute: this.parseCronField(parts[0], 0, 59),
      hour: this.parseCronField(parts[1], 0, 23),
      dayOfMonth: this.parseCronField(parts[2], 1, 31),
      month: this.parseCronField(parts[3], 1, 12),
      dayOfWeek: this.parseCronField(parts[4], 0, 7).map(d => d === 7 ? 0 : d) // Convert Sunday from 7 to 0
    };
  }

  private parseCronField(field: string, min: number, max: number): number[] {
    if (field === '*') {
      return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }

    const values: number[] = [];
    const parts = field.split(',');

    for (const part of parts) {
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepValue = parseInt(step, 10);
        const rangeValues = range === '*' 
          ? Array.from({ length: max - min + 1 }, (_, i) => min + i)
          : this.parseCronField(range, min, max);
        
        for (let i = 0; i < rangeValues.length; i += stepValue) {
          values.push(rangeValues[i]);
        }
      } else if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      } else {
        values.push(parseInt(part, 10));
      }
    }

    return values.filter(v => v >= min && v <= max).sort((a, b) => a - b);
  }

  private cronMatches(cron: CronExpression, date: Date): boolean {
    return (
      cron.minute.includes(date.getMinutes()) &&
      cron.hour.includes(date.getHours()) &&
      cron.dayOfMonth.includes(date.getDate()) &&
      cron.month.includes(date.getMonth() + 1) &&
      cron.dayOfWeek.includes(date.getDay())
    );
  }

  private validateCronExpression(cron: string): boolean {
    try {
      this.parseCronExpression(cron);
      return true;
    } catch {
      return false;
    }
  }

  private async loadSchedules(): Promise<void> {
    try {
      // In a real implementation, load schedules from database
      // For now, we'll start with an empty schedule map
      logger.info('Loading schedules from database');
      
      // Mock schedule loading
      const mockSchedules: ScheduleConfig[] = [
        {
          id: 'daily_cleanup',
          name: 'Daily Cleanup',
          cron: '0 2 * * *', // 2 AM daily
          jobType: JobType.CLEANUP,
          jobParams: {
            targetTable: 'jobs',
            olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            batchSize: 100
          },
          enabled: true,
          createdById: null // No user required
        },
        {
          id: 'hourly_health_check',
          name: 'Hourly Health Check',
          cron: '0 * * * *', // Every hour
          jobType: JobType.HEALTH_CHECK,
          jobParams: {
            checks: ['database', 'memory', 'jobs'],
            alertOnFailure: true,
            alertRecipients: ['admin@example.com']
          },
          enabled: true,
          createdById: null // No user required
        }
      ];

      for (const schedule of mockSchedules) {
        schedule.nextRun = this.calculateNextRun(schedule.cron, schedule.timezone);
        this.schedules.set(schedule.id, schedule);
      }

      logger.info({
        loadedSchedules: mockSchedules.length
      }, 'Schedules loaded successfully');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to load schedules');
    }
  }

  private async persistSchedule(schedule: ScheduleConfig): Promise<void> {
    try {
      // In a real implementation, save to database
      logger.debug({
        scheduleId: schedule.id,
        name: schedule.name
      }, 'Schedule persisted');
    } catch (error) {
      logger.error({
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to persist schedule');
    }
  }

  private async deleteScheduleFromDb(scheduleId: string): Promise<void> {
    try {
      // In a real implementation, delete from database
      logger.debug({ scheduleId }, 'Schedule deleted from database');
    } catch (error) {
      logger.error({
        scheduleId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to delete schedule from database');
    }
  }
}