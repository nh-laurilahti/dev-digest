import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { 
  validateSchema,
  digestSchemas,
  statsSchemas,
  querySchemas,
} from '../lib/validation';
import {
  PERMISSIONS,
} from '../lib/rbac';
import { logger } from '../lib/logger';
import { DigestService } from '../services/digests';
import { jobService } from '../services';
import { db } from '../db';
import { NotFoundError, ValidationError } from '../lib/errors';
import { JobType, JobPriority } from '../types/job';

const router = Router();
const digestService = new DigestService();

// Rate limiting for digest creation (more restrictive)
const createDigestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 digest creations per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Digest creation rate limit exceeded. Try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication removed - all routes are now public

/**
 * POST /api/v1/digests
 * Create a new digest generation job
 */
router.post('/',
  createDigestRateLimit,
  validateSchema(digestSchemas.create),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, repositories, schedule, isActive, summaryStyle, summaryPrompt } = req.body;
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
        repositoryCount: repositories.length,
        schedule,
      }, 'Creating digest generation job');

      // Validate repositories exist and user has access
      const repoRecords = await db.repo.findMany({
        where: {
          id: { in: repositories },
          active: true,
        },
      });

      if (repoRecords.length !== repositories.length) {
        throw new ValidationError('Some repositories not found or inactive');
      }

      // Create job for digest generation (job will create the digest)
      const job = await jobService.createJob({
        type: JobType.DIGEST_GENERATION,
        priority: JobPriority.NORMAL,
        params: {
          repoId: repositories[0], // For now, single repo support  
          dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
          dateTo: new Date(),
          includePRs: true,
          includeIssues: true,
          includeCommits: true,
          summaryType: 'detailed',
          summaryStyle: summaryStyle || 'concise',
          customPrompt: summaryPrompt,
          notifyUsers: [], // Could be populated from user preferences
        },
        maxRetries: 3,
        createdById: userId,
      });

      logger.info({
        jobId: job.id,
        userId,
        repoId: repositories[0],
      }, 'Digest generation job created');

      res.status(202).json({
        success: true,
        data: {
          job: {
            id: job.id,
            type: job.type,
            status: job.status,
            progress: job.progress,
            createdAt: job.createdAt,
          },
          repository: {
            id: repoRecords[0].id,
            path: repoRecords[0].path,
            name: repoRecords[0].name,
          },
          statusUrl: `/api/v1/jobs/${job.id}`,
        },
        message: 'Digest generation job created successfully. Use the job ID to track progress.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/digests
 * List digests with filtering and pagination
 */
router.get('/',
  validateSchema(digestSchemas.query, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page,
        limit,
        offset,
        sortBy = 'createdAt',
        sortOrder,
        search,
        schedule,
        isActive,
      } = req.query as any;

      logger.debug({
        userId: 1, // Default user ID since authentication is removed
        page,
        limit,
        search,
      }, 'Listing digests');

      // Build where clause
      const where: any = {};
      
      if (search) {
        where.OR = [
          { repo: { name: { contains: search, mode: 'insensitive' } } },
          { repo: { path: { contains: search, mode: 'insensitive' } } },
        ];
      }

      if (isActive !== undefined) {
        where.repo = { active: isActive };
      }

      // Get total count
      const total = await db.digest.count({ where });

      // Get digests
      const digests = await db.digest.findMany({
        where,
        include: {
          repo: {
            select: {
              id: true,
              path: true,
              name: true,
              description: true,
              active: true,
            },
          },
          jobs: {
            select: {
              id: true,
              status: true,
              progress: true,
              createdAt: true,
              finishedAt: true,
            },
            where: { type: 'digest_generation' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
      });

      // Transform response
      const transformedDigests = digests.map(digest => {
        const rawStats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
        const transformedStats = {
          // Keep original nested structure first
          ...rawStats,
          // Then override with flat properties expected by frontend
          totalPRs: rawStats.pullRequests?.total || 0,
          mergedPRs: rawStats.pullRequests?.merged || 0,
          contributors: rawStats.contributors?.total || 0,
          totalAdditions: rawStats.commits?.totalAdditions || 0
        };

        return {
          id: digest.id,
          repo: digest.repo,
          dateFrom: digest.dateFrom,
          dateTo: digest.dateTo,
          createdAt: digest.createdAt,
          createdBy: digest.createdBy,
          hasMarkdown: !!digest.summaryMd,
          hasHtml: !!digest.summaryHtml,
          lastJob: digest.jobs[0] || null,
          stats: transformedStats,
        };
      });

      res.json({
        success: true,
        data: {
          digests: transformedDigests,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
            hasNext: offset + limit < total,
            hasPrev: page > 1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/digests/:id
 * Get specific digest details
 */
router.get('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const digestId = parseInt(req.params.id, 10);
      
      if (isNaN(digestId)) {
        throw new ValidationError('Invalid digest ID');
      }

      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          repo: true,
          jobs: {
            select: {
              id: true,
              type: true,
              status: true,
              progress: true,
              error: true,
              createdAt: true,
              startedAt: true,
              finishedAt: true,
            },
            where: { type: 'digest_generation' },
            orderBy: { createdAt: 'desc' },
          },
          notifications: {
            select: {
              id: true,
              type: true,
              channel: true,
              status: true,
              createdAt: true,
              sentAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!digest) {
        throw new NotFoundError('Digest not found');
      }

      logger.info({
        digestId,
        userId: 1, // Default user ID since authentication is removed
        repoPath: digest.repo.path,
      }, 'Digest retrieved');

      // Parse and transform stats to match frontend expectations
      const rawStats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
      const transformedStats = {
        // Keep original nested structure first
        ...rawStats,
        // Then override with flat properties expected by frontend
        totalPRs: rawStats.pullRequests?.total || 0,
        mergedPRs: rawStats.pullRequests?.merged || 0,
        contributors: rawStats.contributors?.total || 0,
        totalAdditions: rawStats.commits?.totalAdditions || 0
      };

      res.json({
        success: true,
        data: {
          id: digest.id,
          repo: digest.repo,
          dateFrom: digest.dateFrom,
          dateTo: digest.dateTo,
          summaryMarkdown: digest.summaryMd,
          summaryHtml: digest.summaryHtml,
          narrativeSummary: digest.narrativeSummary,
          stats: transformedStats,
          prData: digest.prDataJson ? JSON.parse(digest.prDataJson) : null,
          createdAt: digest.createdAt,
          createdBy: digest.createdBy,
          jobs: digest.jobs,
          notifications: digest.notifications,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/digests/:id
 * Delete a digest
 */
router.delete('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const digestId = parseInt(req.params.id, 10);
      
      if (isNaN(digestId)) {
        throw new ValidationError('Invalid digest ID');
      }

      // Check if digest exists
      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          jobs: {
            select: { id: true, status: true },
          },
        },
      });

      if (!digest) {
        throw new NotFoundError('Digest not found');
      }

      // Cancel any running jobs
      for (const job of digest.jobs) {
        if (job.status === 'pending' || job.status === 'running') {
          await jobService.cancelJob(job.id);
        }
      }

      // Delete digest (cascade will handle related records)
      await db.digest.delete({
        where: { id: digestId },
      });

      logger.info({
        digestId,
        userId: 1, // Default user ID since authentication is removed
        cancelledJobs: digest.jobs.length,
      }, 'Digest deleted');

      // Check if this is an HTMX request (for DOM manipulation)
      if (req.headers['hx-request']) {
        // Return empty content for HTMX to replace with nothing (removes element)
        res.status(200).send('');
      } else {
        // Return JSON for API clients
        res.json({
          success: true,
          message: 'Digest deleted successfully',
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/digests/:id/stats
 * Get digest statistics and metrics
 */
router.get('/:id/stats',
  validateSchema(statsSchemas.digestStats, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const digestId = parseInt(req.params.id, 10);
      const {
        includeRepositories,
        includePRBreakdown,
        includeContributors,
        includeLanguages,
      } = req.query as any;
      
      if (isNaN(digestId)) {
        throw new ValidationError('Invalid digest ID');
      }

      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          repo: includeRepositories,
        },
      });

      if (!digest) {
        throw new NotFoundError('Digest not found');
      }

      const baseStats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
      const prData = digest.prDataJson ? JSON.parse(digest.prDataJson) : null;

      const stats: any = {
        ...baseStats,
        digestId: digest.id,
        dateRange: {
          from: digest.dateFrom,
          to: digest.dateTo,
        },
        generatedAt: digest.createdAt,
      };

      if (includeRepositories && digest.repo) {
        stats.repository = {
          id: digest.repo.id,
          path: digest.repo.path,
          name: digest.repo.name,
          active: digest.repo.active,
        };
      }

      if (includePRBreakdown && prData) {
        stats.pullRequests = {
          total: prData.length,
          byStatus: prData.reduce((acc: any, pr: any) => {
            acc[pr.state] = (acc[pr.state] || 0) + 1;
            return acc;
          }, {}),
          merged: prData.filter((pr: any) => pr.merged).length,
          draft: prData.filter((pr: any) => pr.draft).length,
        };
      }

      if (includeContributors && prData) {
        const contributors = new Map();
        prData.forEach((pr: any) => {
          if (pr.user) {
            const login = pr.user.login;
            if (!contributors.has(login)) {
              contributors.set(login, {
                login,
                id: pr.user.id,
                avatar_url: pr.user.avatar_url,
                prs: 0,
                additions: 0,
                deletions: 0,
              });
            }
            const contributor = contributors.get(login);
            contributor.prs++;
            contributor.additions += pr.additions || 0;
            contributor.deletions += pr.deletions || 0;
          }
        });
        
        stats.contributors = Array.from(contributors.values())
          .sort((a, b) => b.prs - a.prs);
      }

      if (includeLanguages && prData) {
        // This would require additional API calls to get language data
        // For now, return empty object
        stats.languages = {};
      }

      logger.debug({
        digestId,
        userId: 1, // Default user ID since authentication is removed
        includeRepositories,
        includePRBreakdown,
      }, 'Digest stats retrieved');

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/digests/:id/regenerate
 * Regenerate a digest
 */
router.post('/:id/regenerate',
  createDigestRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const digestId = parseInt(req.params.id, 10);
      
      if (isNaN(digestId)) {
        throw new ValidationError('Invalid digest ID');
      }

      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          repo: true,
          jobs: {
            where: {
              type: 'digest_generation',
              status: { in: ['pending', 'running'] },
            },
          },
        },
      });

      if (!digest) {
        throw new NotFoundError('Digest not found');
      }

      // Check if there's already a running job
      if (digest.jobs.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DIGEST_GENERATION_IN_PROGRESS',
            message: 'Digest generation is already in progress',
          },
        });
      }

      // Create new job for regeneration with high priority
      const job = await jobService.createJob({
        type: JobType.DIGEST_GENERATION,
        priority: JobPriority.HIGH,
        params: {
          repoId: digest.repoId,
          dateFrom: digest.dateFrom,
          dateTo: digest.dateTo,
          includePRs: true,
          includeIssues: true,
          includeCommits: true,
          summaryType: 'detailed',
          regenerate: true,
        },
        digestId: digest.id,
        maxRetries: 3,
      });

      logger.info({
        digestId,
        jobId: job.id,
        userId: 1, // Default user ID since authentication is removed
      }, 'Digest regeneration job created');

      // Check if this is an HTMX request (for frontend regeneration)
      if (req.headers['hx-request']) {
        // Return HTML fragment for HTMX frontend with proper polling URL
        const html = `
          <div class="digest-card glass-container glass-container--subtle" data-digest-id="${digestId}">
            <div class="digest-card-header">
              <div class="digest-card-icon">⏳</div>
              <div class="digest-card-info">
                <h3 class="digest-card-title">Regenerating Digest #${digestId}</h3>
                <div class="digest-card-meta">
                  <span class="digest-card-date">Job ID: ${job.id}</span>
                </div>
              </div>
              <div class="digest-card-status">
                <div class="job-status job-status--running">
                  <span class="job-status-icon"></span>
                  <span class="job-status-text">RUNNING</span>
                </div>
              </div>
            </div>
            <div class="job-status-container" 
                 id="job-${job.id}"
                 hx-get="/api/jobs/${job.id}"
                 hx-trigger="every 3s"
                 hx-target="#job-${job.id}"
                 hx-swap="outerHTML">
              <div class="progress progress--sm" style="margin-top: var(--space-2);">
                <div class="progress-bg">
                  <div class="progress-bar" style="width: 0%" data-progress="0"></div>
                </div>
                <span class="progress-text">0%</span>
              </div>
            </div>
          </div>
        `;
        res.status(200).send(html);
      } else {
        // Return JSON for API clients
        res.status(202).json({
          success: true,
          data: {
            job: {
              id: job.id,
              type: job.type,
              status: job.status,
              progress: job.progress,
              createdAt: job.createdAt,
            },
            statusUrl: `/api/jobs/${job.id}`,
          },
          message: 'Digest regeneration job created successfully',
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/digests/:id/export
 * Export digest in various formats
 */
router.get('/:id/export',
  validateSchema(z.object({
    format: z.enum(['json', 'markdown', 'html', 'pdf']).default('json'),
  }), 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const digestId = parseInt(req.params.id, 10);
      const { format } = req.query as any;
      
      if (isNaN(digestId)) {
        throw new ValidationError('Invalid digest ID');
      }

      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          repo: true,
        },
      });

      if (!digest) {
        throw new NotFoundError('Digest not found');
      }

      let content: string;
      let contentType: string;
      let filename: string;

      switch (format) {
        case 'json':
          content = JSON.stringify({
            id: digest.id,
            repo: digest.repo,
            dateFrom: digest.dateFrom,
            dateTo: digest.dateTo,
            stats: digest.statsJson ? JSON.parse(digest.statsJson) : {},
            prData: digest.prDataJson ? JSON.parse(digest.prDataJson) : null,
            summaryMarkdown: digest.summaryMd,
            summaryHtml: digest.summaryHtml,
            createdAt: digest.createdAt,
            createdBy: digest.createdBy,
          }, null, 2);
          contentType = 'application/json';
          filename = `digest-${digestId}.json`;
          break;

        case 'markdown':
          content = digest.summaryMd || 'No markdown content available';
          contentType = 'text/markdown';
          filename = `digest-${digestId}.md`;
          break;

        case 'html':
          content = digest.summaryHtml || '<p>No HTML content available</p>';
          contentType = 'text/html';
          filename = `digest-${digestId}.html`;
          break;

        default:
          throw new ValidationError('Unsupported export format');
      }

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      logger.info({
        digestId,
        format,
        userId: 1, // Default user ID since authentication is removed
      }, 'Digest exported');

      res.send(content);
    } catch (error) {
      next(error);
    }
  }
);

export default router;