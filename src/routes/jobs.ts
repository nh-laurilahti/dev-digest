/**
 * Job API Routes - RESTful endpoints for job management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  JobType,
  JobPriority,
  JobStatus,
  CreateJobOptions,
  JobQueryFilters
} from '../types/job';
import { jobService } from '../services';
import { logger } from '../lib/logger';

const router = Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: errors.array()
      }
    });
  }
  next();
};

// Authentication removed - all routes are now public

/**
 * POST /jobs - Create a new job
 */
router.post('/jobs',
  [
    body('type').isIn(Object.values(JobType)).withMessage('Invalid job type'),
    body('params').isObject().withMessage('Job params must be an object'),
    body('priority').optional().isIn(Object.values(JobPriority)).withMessage('Invalid priority'),
    body('scheduleTime').optional().isISO8601().withMessage('Invalid schedule time'),
    body('maxRetries').optional().isInt({ min: 0, max: 10 }).withMessage('Max retries must be 0-10'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('digestId').optional().isInt({ min: 1 }).withMessage('Invalid digest ID')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID since authentication is removed
      const { type, params, priority, scheduleTime, maxRetries, tags, digestId } = req.body;

      const jobOptions: CreateJobOptions = {
        type,
        params,
        priority: priority || JobPriority.NORMAL,
        createdById: userId,
        scheduleTime: scheduleTime ? new Date(scheduleTime) : undefined,
        maxRetries,
        tags,
        digestId
      };

      const job = await jobService.createJob(jobOptions);

      logger.info({
        jobId: job.id,
        jobType: type,
        userId
      }, 'Job created via API');

      res.status(201).json({
        success: true,
        data: {
          job: {
            id: job.id,
            type: job.type,
            status: job.status,
            priority: job.priority,
            progress: job.progress,
            createdAt: job.createdAt,
            scheduleTime: job.scheduleTime
          }
        }
      });

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        userId: 1 // Default user ID since authentication is removed
      }, 'Failed to create job');

      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_CREATION_FAILED',
          message: 'Failed to create job',
          details: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
);

/**
 * GET /jobs - List jobs with filtering and pagination
 */
router.get('/jobs',
  [
    query('status').optional().isArray().withMessage('Status must be an array'),
    query('type').optional().isArray().withMessage('Type must be an array'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'priority']).withMessage('Invalid sortBy'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sortOrder')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID since authentication is removed
      const {
        status,
        type,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        dateFrom,
        dateTo,
        tags
      } = req.query;

      const filters: JobQueryFilters = {
        status: status as JobStatus[],
        type: type as JobType[],
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        tags: tags as string[]
      };

      const jobs = await jobService.queryJobs(filters);

      res.json({
        success: true,
        data: {
          jobs: jobs.map(job => ({
            id: job.id,
            type: job.type,
            status: job.status,
            priority: job.priority,
            progress: job.progress,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            retryCount: job.retryCount,
            maxRetries: job.maxRetries,
            digestId: job.digestId,
            tags: job.tags
          })),
          pagination: {
            limit: filters.limit,
            offset: filters.offset,
            total: jobs.length // In a real implementation, get total count
          }
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to list jobs');
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_LIST_FAILED',
          message: 'Failed to retrieve jobs'
        }
      });
    }
  }
);

/**
 * GET /jobs/:jobId - Get job details
 */
router.get('/jobs/:jobId',
  [
    param('jobId').isString().notEmpty().withMessage('Job ID is required')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const job = await jobService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found`
          }
        });
      }

      // Check if this is an HTMX request (for frontend polling)
      if (req.headers['hx-request']) {
        // Return HTML fragment for HTMX polling
        if (job.status === 'COMPLETED') {
          const digestId = job.digestId || 'unknown';
          const html = `
            <div class="alert alert--success">
              <span class="alert-icon">🎉</span>
              <span class="alert-message">
                Digest generation completed successfully! 
                <a href="/digests/${digestId}" class="btn btn--primary btn--sm" style="margin-left: var(--space-2);">View Digest</a>
              </span>
            </div>
          `;
          return res.send(html);
        }

        if (job.status === 'FAILED') {
          const digestId = job.digestId || 'unknown';
          const html = `
            <div class="alert alert--error">
              <span class="alert-icon">❌</span>
              <span class="alert-message">
                Digest generation failed: ${job.error || 'Unknown error'}
                <br>
                <a href="/digests/${digestId}" class="btn btn--ghost btn--sm" style="margin-top: var(--space-1);">View Digest</a>
              </span>
            </div>
          `;
          return res.send(html);
        }
        
        // For PENDING, RUNNING, or other statuses
        const html = `
          <div class="job-status-container" 
               id="job-${jobId}"
               hx-get="/api/jobs/${jobId}"
               hx-trigger="every 3s"
               hx-target="#job-${jobId}"
               hx-swap="outerHTML">
            <div class="job-status job-status--${job.status.toLowerCase()}">
              <span class="job-status-icon"></span>
              <span class="job-status-text">${job.status}</span>
            </div>
            <div class="progress progress--sm" style="margin-top: var(--space-2);">
              <div class="progress-bg">
                <div class="progress-bar ${job.status === 'COMPLETED' ? 'progress-bar--success' : 'progress-bar--primary'}" 
                     style="width: ${job.progress}%" 
                     data-progress="${job.progress}">
                </div>
              </div>
              <span class="progress-text">${job.progress}%</span>
            </div>
          </div>
        `;
        
        res.send(html);
      } else {
        // Return JSON for API clients
        res.json({
          success: true,
          data: {
            job: {
              id: job.id,
              type: job.type,
              status: job.status,
              priority: job.priority,
              progress: job.progress,
              params: job.params,
              error: job.error,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              retryCount: job.retryCount,
              maxRetries: job.maxRetries,
              createdById: job.createdById,
              digestId: job.digestId,
              tags: job.tags,
              metadata: job.metadata
            }
          }
        });
      }

    } catch (error) {
      logger.error({ error, jobId: req.params.jobId }, 'Failed to get job');
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_RETRIEVAL_FAILED',
          message: 'Failed to retrieve job'
        }
      });
    }
  }
);

/**
 * POST /jobs/:jobId/cancel - Cancel a job
 */
router.post('/jobs/:jobId/cancel',
  [
    param('jobId').isString().notEmpty().withMessage('Job ID is required')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const success = await jobService.cancelJob(jobId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found or cannot be cancelled`
          }
        });
      }

      logger.info({
        jobId,
        userId: 1 // Default user ID since authentication is removed
      }, 'Job cancelled via API');

      res.json({
        success: true,
        data: {
          message: 'Job cancelled successfully'
        }
      });

    } catch (error) {
      logger.error({ error, jobId: req.params.jobId }, 'Failed to cancel job');
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_CANCELLATION_FAILED',
          message: 'Failed to cancel job'
        }
      });
    }
  }
);

/**
 * POST /jobs/:jobId/retry - Retry a failed job
 */
router.post('/jobs/:jobId/retry',
  [
    param('jobId').isString().notEmpty().withMessage('Job ID is required')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const success = await jobService.retryJob(jobId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'JOB_RETRY_FAILED',
            message: 'Job cannot be retried (not failed or max retries exceeded)'
          }
        });
      }

      logger.info({
        jobId,
        userId: 1 // Default user ID since authentication is removed
      }, 'Job retry requested via API');

      res.json({
        success: true,
        data: {
          message: 'Job retry scheduled successfully'
        }
      });

    } catch (error) {
      logger.error({ error, jobId: req.params.jobId }, 'Failed to retry job');
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_RETRY_ERROR',
          message: 'Failed to retry job'
        }
      });
    }
  }
);

/**
 * GET /jobs/metrics - Get job queue metrics
 */
router.get('/jobs/metrics',
  async (req: Request, res: Response) => {
    try {
      const metrics = await jobService.getMetrics();
      const healthCheck = await jobService.getHealthCheck();

      res.json({
        success: true,
        data: {
          metrics,
          health: healthCheck
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get job metrics');
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve metrics'
        }
      });
    }
  }
);

/**
 * GET /jobs/performance - Get job performance statistics
 */
router.get('/jobs/performance',
  [
    query('type').optional().isIn(Object.values(JobType)).withMessage('Invalid job type'),
    query('hours').optional().isInt({ min: 1, max: 168 }).withMessage('Hours must be 1-168')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { type, hours = 24 } = req.query;
      const stats = await jobService.getJobPerformanceStats(type as JobType);
      const metricsHistory = await jobService.getMetricsHistory(parseInt(hours as string));

      res.json({
        success: true,
        data: {
          performance: stats,
          history: metricsHistory
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get job performance stats');
      res.status(500).json({
        success: false,
        error: {
          code: 'PERFORMANCE_STATS_FAILED',
          message: 'Failed to retrieve performance statistics'
        }
      });
    }
  }
);

/**
 * GET /jobs/workers - Get worker pool status
 */
router.get('/jobs/workers',
  async (req: Request, res: Response) => {
    try {
      const workerStatuses = await jobService.getWorkerStatuses();
      const poolStats = await jobService.getWorkerPoolStats();

      res.json({
        success: true,
        data: {
          workers: workerStatuses,
          poolStats
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get worker statuses');
      res.status(500).json({
        success: false,
        error: {
          code: 'WORKER_STATUS_FAILED',
          message: 'Failed to retrieve worker statuses'
        }
      });
    }
  }
);

/**
 * GET /jobs/schedules - Get scheduled jobs
 */
router.get('/jobs/schedules',
  async (req: Request, res: Response) => {
    try {
      const schedules = await jobService.getAllSchedules();
      const schedulerStats = await jobService.getSchedulerStats();

      res.json({
        success: true,
        data: {
          schedules,
          stats: schedulerStats
        }
      });

    } catch (error) {
      logger.error({ error }, 'Failed to get schedules');
      res.status(500).json({
        success: false,
        error: {
          code: 'SCHEDULES_RETRIEVAL_FAILED',
          message: 'Failed to retrieve schedules'
        }
      });
    }
  }
);

/**
 * POST /jobs/schedules - Create a new schedule
 */
router.post('/jobs/schedules',
  [
    body('name').isString().notEmpty().withMessage('Schedule name is required'),
    body('cron').isString().notEmpty().withMessage('Cron expression is required'),
    body('jobType').isIn(Object.values(JobType)).withMessage('Invalid job type'),
    body('jobParams').isObject().withMessage('Job params must be an object'),
    body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
    body('timezone').optional().isString().withMessage('Timezone must be string'),
    body('maxConcurrentRuns').optional().isInt({ min: 1 }).withMessage('Max concurrent runs must be >= 1')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const userId = 1; // Default user ID since authentication is removed
      const { name, cron, jobType, jobParams, enabled = true, timezone, maxConcurrentRuns } = req.body;

      const schedule = await jobService.addSchedule({
        name,
        cron,
        jobType,
        jobParams,
        enabled,
        timezone,
        maxConcurrentRuns,
        createdById: userId
      });

      logger.info({
        scheduleId: schedule.id,
        name,
        cron,
        jobType,
        userId
      }, 'Schedule created via API');

      res.status(201).json({
        success: true,
        data: { schedule }
      });

    } catch (error) {
      logger.error({ error, userId: (req as any).userId }, 'Failed to create schedule');
      res.status(500).json({
        success: false,
        error: {
          code: 'SCHEDULE_CREATION_FAILED',
          message: 'Failed to create schedule',
          details: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
);

/**
 * POST /jobs/schedules/:scheduleId/trigger - Manually trigger a schedule
 */
router.post('/jobs/schedules/:scheduleId/trigger',
  [
    param('scheduleId').isString().notEmpty().withMessage('Schedule ID is required')
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;
      const job = await jobService.triggerSchedule(scheduleId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SCHEDULE_NOT_FOUND',
            message: 'Schedule not found or not enabled'
          }
        });
      }

      logger.info({
        scheduleId,
        jobId: job.id,
        userId: 1 // Default user ID since authentication is removed
      }, 'Schedule triggered manually via API');

      res.json({
        success: true,
        data: {
          job: {
            id: job.id,
            type: job.type,
            status: job.status
          }
        }
      });

    } catch (error) {
      logger.error({ error, scheduleId: req.params.scheduleId }, 'Failed to trigger schedule');
      res.status(500).json({
        success: false,
        error: {
          code: 'SCHEDULE_TRIGGER_FAILED',
          message: 'Failed to trigger schedule'
        }
      });
    }
  }
);

export default router;