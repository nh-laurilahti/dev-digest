import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { 
  validateSchema,
  repositorySchemas,
  commonPatterns,
} from '../lib/validation';
import {
  PERMISSIONS,
} from '../lib/rbac';
import { logger } from '../lib/logger';
import { RepositoryService } from '../services/repositories';
import { GitHubClient } from '../clients/github';
import { db } from '../db';
import { NotFoundError, ValidationError, ExternalServiceError } from '../lib/errors';
import { config } from '../lib/config';

const router = Router();

// Initialize services
const githubClient = new GitHubClient({
  token: config.GITHUB_TOKEN,
  userAgent: 'Daily-Dev-Digest/1.0.0',
});
const repositoryService = new RepositoryService(githubClient);

// Rate limiting for repository operations
const repositoryRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Repository operations rate limit exceeded.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication removed - all routes are now public

/**
 * GET /api/v1/repos
 * List repositories with filtering and pagination
 */
router.get('/',
  validateSchema(repositorySchemas.query, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page,
        limit,
        offset,
        sortBy = 'updatedAt',
        sortOrder,
        search,
        language,
        tags,
        isActive,
      } = req.query as any;

      logger.debug({
        userId: 1, // Default user ID since authentication is removed
        page,
        limit,
        search,
        language,
      }, 'Listing repositories');

      // Build where clause
      const where: any = {};
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { path: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (isActive !== undefined) {
        where.active = isActive;
      }

      // Get total count
      const total = await db.repo.count({ where });

      // Get repositories
      const repositories = await db.repo.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
      });

      // Transform response
      const transformedRepos = repositories.map(repo => ({
        id: repo.id,
        path: repo.path,
        name: repo.name,
        description: repo.description,
        active: repo.active,
        defaultBranch: repo.defaultBranch,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
      }));

      res.json({
        success: true,
        data: {
          repositories: transformedRepos,
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
 * POST /api/v1/repos
 * Add a new repository
 */
router.post('/',
  repositoryRateLimit,
  validateSchema(repositorySchemas.add),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repository, name, description, tags, isPrivate, watchBranches } = req.body;
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
        repository,
        isPrivate,
      }, 'Adding new repository');

      // Use repository directly as owner/repo format
      const repoPath = repository;
      const [owner, repoName] = repository.split('/');

      // Check if repository already exists
      const existingRepo = await db.repo.findUnique({
        where: { path: repoPath },
      });

      if (existingRepo) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'REPOSITORY_EXISTS',
            message: 'Repository already exists in the system',
            data: {
              id: existingRepo.id,
              path: existingRepo.path,
              active: existingRepo.active,
            },
          },
        });
      }

      // Validate repository access
      const validation = await repositoryService.validateRepositoryAccess(owner, repoName);
      
      if (!validation.exists) {
        throw new NotFoundError('Repository not found on GitHub');
      }

      if (!validation.accessible) {
        throw new ExternalServiceError('GitHub', 'Repository is not accessible');
      }

      if (isPrivate && !validation.permissions.pull) {
        throw new ExternalServiceError('GitHub', 'No read access to private repository');
      }

      // Get repository details from GitHub
      const githubRepo = await repositoryService.getRepository(owner, repoName);

      // Create repository record
      const newRepository = await db.repo.create({
        data: {
          path: repoPath,
          name: name || githubRepo.name,
          description: description || githubRepo.description,
          defaultBranch: githubRepo.default_branch || 'main',
          active: true,
        },
      });

      logger.info({
        repositoryId: newRepository.id,
        path: newRepository.path,
        userId,
      }, 'Repository added successfully');

      res.status(201).json({
        success: true,
        data: {
          repository: {
            id: newRepository.id,
            path: newRepository.path,
            name: newRepository.name,
            description: newRepository.description,
            active: newRepository.active,
            defaultBranch: newRepository.defaultBranch,
            createdAt: newRepository.createdAt,
            updatedAt: newRepository.updatedAt,
          },
          githubInfo: {
            private: githubRepo.private,
            language: githubRepo.language,
            stars: githubRepo.stargazers_count,
            forks: githubRepo.forks_count,
            openIssues: githubRepo.open_issues_count,
            lastPush: githubRepo.pushed_at,
          },
          permissions: validation.permissions,
        },
        message: 'Repository added successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/repos/:id
 * Get repository details
 */
router.get('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repositoryId = parseInt(req.params.id, 10);
      
      if (isNaN(repositoryId)) {
        throw new ValidationError('Invalid repository ID');
      }

      const repository = await db.repo.findUnique({
        where: { id: repositoryId },
        include: {
          digests: {
            select: {
              id: true,
              dateFrom: true,
              dateTo: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      // Get GitHub repository details if active
      let githubInfo = null;
      if (repository.active) {
        try {
          const [owner, repoName] = repository.path.split('/');
          githubInfo = await repositoryService.getRepository(owner, repoName);
        } catch (error) {
          logger.warn({
            repositoryId,
            path: repository.path,
            error,
          }, 'Failed to fetch GitHub repository details');
        }
      }

      logger.debug({
        repositoryId,
        userId: 1, // Default user ID since authentication is removed
        path: repository.path,
      }, 'Repository details retrieved');

      res.json({
        success: true,
        data: {
          repository: {
            id: repository.id,
            path: repository.path,
            name: repository.name,
            description: repository.description,
            active: repository.active,
            defaultBranch: repository.defaultBranch,
            createdAt: repository.createdAt,
            updatedAt: repository.updatedAt,
            digestCount: repository.digests.length,
            recentDigests: repository.digests,
          },
          githubInfo: githubInfo ? {
            private: githubInfo.private,
            language: githubInfo.language,
            stars: githubInfo.stargazers_count,
            forks: githubInfo.forks_count,
            openIssues: githubInfo.open_issues_count,
            lastPush: githubInfo.pushed_at,
            topics: githubInfo.topics || [],
            license: githubInfo.license?.name,
            size: githubInfo.size,
            archived: githubInfo.archived,
            disabled: githubInfo.disabled,
          } : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/repos/:id
 * Update repository settings
 */
router.patch('/:id',
  validateSchema(repositorySchemas.update),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repositoryId = parseInt(req.params.id, 10);
      
      if (isNaN(repositoryId)) {
        throw new ValidationError('Invalid repository ID');
      }

      const updateData = req.body;
      const userId = 1; // Default user ID since authentication is removed

      // Check if repository exists
      const existingRepo = await db.repo.findUnique({
        where: { id: repositoryId },
      });

      if (!existingRepo) {
        throw new NotFoundError('Repository not found');
      }

      // Update repository
      const repository = await db.repo.update({
        where: { id: repositoryId },
        data: updateData,
      });

      logger.info({
        repositoryId,
        userId,
        updates: Object.keys(updateData),
      }, 'Repository updated');

      res.json({
        success: true,
        data: {
          repository: {
            id: repository.id,
            path: repository.path,
            name: repository.name,
            description: repository.description,
            active: repository.active,
            defaultBranch: repository.defaultBranch,
            createdAt: repository.createdAt,
            updatedAt: repository.updatedAt,
          },
        },
        message: 'Repository updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/repos/:id
 * Remove repository
 */
router.delete('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repositoryId = parseInt(req.params.id, 10);
      
      if (isNaN(repositoryId)) {
        throw new ValidationError('Invalid repository ID');
      }

      const userId = 1; // Default user ID since authentication is removed

      // Check if repository exists
      const repository = await db.repo.findUnique({
        where: { id: repositoryId },
        include: {
          digests: {
            select: { id: true },
          },
        },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      // Check if there are associated digests
      if (repository.digests.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'REPOSITORY_HAS_DIGESTS',
            message: 'Cannot delete repository with existing digests. Delete digests first or deactivate the repository.',
            data: {
              digestCount: repository.digests.length,
            },
          },
        });
      }

      // Delete repository
      await db.repo.delete({
        where: { id: repositoryId },
      });

      logger.info({
        repositoryId,
        path: repository.path,
        userId,
      }, 'Repository deleted');

      res.json({
        success: true,
        message: 'Repository deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/repos/validate
 * Validate repository access
 */
router.post('/validate',
  repositoryRateLimit,
  validateSchema(z.object({
    repository: commonPatterns.githubRepo,
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repository } = req.body;
      const userId = 1; // Default user ID since authentication is removed

      logger.debug({
        userId,
        repository,
      }, 'Validating repository access');

      // Use repository directly as owner/repo format
      const repoPath = repository;
      const [owner, repoName] = repository.split('/');

      // Validate repository access
      const validation = await repositoryService.validateRepositoryAccess(owner, repoName);
      
      let repositoryInfo = null;
      if (validation.exists && validation.accessible) {
        try {
          repositoryInfo = await repositoryService.getRepository(owner, repoName);
        } catch (error) {
          logger.warn({
            owner,
            repoName,
            error,
          }, 'Failed to get repository info during validation');
        }
      }

      // Check if already exists in our database
      const existingRepo = await db.repo.findUnique({
        where: { path: repoPath },
        select: {
          id: true,
          active: true,
          createdAt: true,
        },
      });

      const response: any = {
        valid: validation.exists && validation.accessible,
        path: repoPath,
        exists: validation.exists,
        accessible: validation.accessible,
        permissions: validation.permissions,
        private: validation.private,
        archived: validation.archived,
        disabled: validation.disabled,
        alreadyAdded: !!existingRepo,
      };

      if (existingRepo) {
        response.existingRepository = {
          id: existingRepo.id,
          active: existingRepo.active,
          addedAt: existingRepo.createdAt,
        };
      }

      if (repositoryInfo) {
        response.repositoryInfo = {
          name: repositoryInfo.name,
          description: repositoryInfo.description,
          language: repositoryInfo.language,
          stars: repositoryInfo.stargazers_count,
          forks: repositoryInfo.forks_count,
          openIssues: repositoryInfo.open_issues_count,
          lastPush: repositoryInfo.pushed_at,
          defaultBranch: repositoryInfo.default_branch,
          topics: repositoryInfo.topics || [],
          license: repositoryInfo.license?.name,
        };
      }

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/repos/:id/stats
 * Get repository statistics
 */
router.get('/:id/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repositoryId = parseInt(req.params.id, 10);
      
      if (isNaN(repositoryId)) {
        throw new ValidationError('Invalid repository ID');
      }

      const repository = await db.repo.findUnique({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      const [owner, repoName] = repository.path.split('/');

      // Get comprehensive repository statistics from GitHub
      const stats = await repositoryService.getRepositoryStatistics(
        owner,
        repoName,
        {
          includeContributors: true,
          includeLanguages: true,
          includeCommitActivity: true,
          dateRange: {
            since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
          },
        }
      );

      // Get digest statistics from our database
      const digestStats = await db.digest.aggregate({
        where: {
          repoId: repositoryId,
        },
        _count: {
          id: true,
        },
      });

      const recentDigests = await db.digest.findMany({
        where: {
          repoId: repositoryId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          createdAt: true,
          statsJson: true,
        },
      });

      logger.debug({
        repositoryId,
        userId: 1, // Default user ID since authentication is removed
        path: repository.path,
      }, 'Repository statistics retrieved');

      res.json({
        success: true,
        data: {
          repository: {
            id: repository.id,
            path: repository.path,
            name: repository.name,
          },
          github: {
            ...stats,
            contributors: stats.contributors.slice(0, 20), // Limit to top 20
          },
          digests: {
            total: digestStats._count.id,
            recent: recentDigests.map(digest => ({
              id: digest.id,
              dateRange: {
                from: digest.dateFrom,
                to: digest.dateTo,
              },
              createdAt: digest.createdAt,
              stats: digest.statsJson ? JSON.parse(digest.statsJson) : {},
            })),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/repos/:id/branches
 * Get repository branches
 */
router.get('/:id/branches',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repositoryId = parseInt(req.params.id, 10);
      
      if (isNaN(repositoryId)) {
        throw new ValidationError('Invalid repository ID');
      }

      const repository = await db.repo.findUnique({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      const [owner, repoName] = repository.path.split('/');

      // Get branches from GitHub
      const branches = await repositoryService.getBranches(owner, repoName);

      logger.debug({
        repositoryId,
        userId: 1, // Default user ID since authentication is removed
        branchCount: branches.length,
      }, 'Repository branches retrieved');

      res.json({
        success: true,
        data: {
          repository: {
            id: repository.id,
            path: repository.path,
            defaultBranch: repository.defaultBranch,
          },
          branches: branches.map(branch => ({
            name: branch.name,
            sha: branch.commit.sha,
            protected: branch.protected,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;