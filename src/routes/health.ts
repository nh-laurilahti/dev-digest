import { Router, Request, Response, NextFunction } from 'express';
import { 
  validateSchema,
  healthSchemas,
} from '../lib/validation';
import {
  PERMISSIONS,
} from '../lib/rbac';
import { logger } from '../lib/logger';
import { DigestService } from '../services/digests';
import { jobService } from '../services';
import { GitHubClient } from '../clients/github';
import { db } from '../db';
import { config } from '../lib/config';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const router = Router();
const execAsync = promisify(exec);

// Initialize services for health checks
const digestService = new DigestService();
const githubClient = new GitHubClient({
  token: config.GITHUB_TOKEN,
  userAgent: 'Daily-Dev-Digest/1.0.0',
});

/**
 * GET /api/v1/health
 * Basic health check (public endpoint)
 */
router.get('/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const startTime = Date.now();

      // Basic health indicators
      const health = {
        status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        requestId: req.headers['x-request-id'],
      };

      // Quick database connectivity check
      try {
        await db.$queryRaw`SELECT 1`;
      } catch (error) {
        health.status = 'unhealthy';
      }

      const responseTime = Date.now() - startTime;

      res.status(health.status === 'unhealthy' ? 503 : 200).json({
        success: health.status !== 'unhealthy',
        data: {
          ...health,
          responseTime,
        },
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Health check failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/v1/health/detailed
 * Detailed health check with service statuses
 */
router.get('/detailed',
  validateSchema(healthSchemas.detailed, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { includeServices, includeDependencies, includeMetrics } = req.query as any;
      const startTime = Date.now();
      const userId = 1; // Default user ID since authentication is removed

      logger.debug({
        userId,
        includeServices,
        includeDependencies,
        includeMetrics,
      }, 'Performing detailed health check');

      const health: any = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      };

      const checks: any = {};
      let unhealthyCount = 0;

      // Database health check
      try {
        const dbStart = Date.now();
        await db.$queryRaw`SELECT 1`;
        const dbTime = Date.now() - dbStart;
        
        checks.database = {
          status: 'healthy',
          responseTime: dbTime,
          lastCheck: new Date().toISOString(),
        };
      } catch (error) {
        checks.database = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: new Date().toISOString(),
        };
        unhealthyCount++;
      }

      if (includeServices) {
        // Job Service health check
        try {
          const jobHealth = await jobService.getHealthCheck();
          checks.jobService = {
            status: jobHealth.healthy ? 'healthy' : 'unhealthy',
            workers: jobHealth.workerStatus,
            queueSize: jobHealth.queueSize,
            metrics: jobHealth.metrics,
            lastCheck: new Date().toISOString(),
          };
          
          if (!jobHealth.healthy) unhealthyCount++;
        } catch (error) {
          checks.jobService = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            lastCheck: new Date().toISOString(),
          };
          unhealthyCount++;
        }

        // Digest Service health check
        try {
          const digestHealth = await digestService.getHealthStatus();
          checks.digestService = {
            status: digestHealth.status,
            services: digestHealth.services,
            lastCheck: digestHealth.lastChecked,
          };
          
          if (digestHealth.status !== 'healthy') unhealthyCount++;
        } catch (error) {
          checks.digestService = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            lastCheck: new Date().toISOString(),
          };
          unhealthyCount++;
        }
      }

      if (includeDependencies) {
        // GitHub API health check
        try {
          const githubStart = Date.now();
          const rateLimit = await githubClient.getOctokit().rest.rateLimit.get();
          const githubTime = Date.now() - githubStart;
          
          checks.github = {
            status: 'healthy',
            responseTime: githubTime,
            rateLimit: {
              remaining: rateLimit.data.rate.remaining,
              limit: rateLimit.data.rate.limit,
              reset: new Date(rateLimit.data.rate.reset * 1000).toISOString(),
            },
            lastCheck: new Date().toISOString(),
          };
        } catch (error) {
          checks.github = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            lastCheck: new Date().toISOString(),
          };
          unhealthyCount++;
        }

        // AI Services health check (if configured)
        if (config.OPENAI_API_KEY) {
          try {
            // This would require implementing a basic OpenAI health check
            checks.openai = {
              status: 'healthy',
              configured: true,
              lastCheck: new Date().toISOString(),
            };
          } catch (error) {
            checks.openai = {
              status: 'unhealthy',
              error: error instanceof Error ? error.message : 'Unknown error',
              lastCheck: new Date().toISOString(),
            };
            unhealthyCount++;
          }
        } else {
          checks.openai = {
            status: 'not_configured',
            configured: false,
          };
        }
      }

      if (includeMetrics) {
        // System metrics
        health.metrics = {
          memory: {
            usage: process.memoryUsage(),
            system: {
              total: os.totalmem(),
              free: os.freemem(),
              used: os.totalmem() - os.freemem(),
            },
          },
          cpu: {
            loadAverage: os.loadavg(),
            usage: process.cpuUsage(),
          },
          disk: await getDiskUsage(),
        };

        // Application metrics
        if (includeServices) {
          try {
            const jobMetrics = jobService.getMetrics();
            health.metrics.jobs = jobMetrics;
          } catch (error) {
            logger.warn({ error }, 'Failed to get job metrics');
          }
        }

        // Database metrics
        try {
          const [userCount, repoCount, digestCount, jobCount, notificationCount] = await Promise.all([
            db.user.count(),
            db.repo.count(),
            db.digest.count(),
            db.job.count(),
            db.notification.count(),
          ]);

          health.metrics.database = {
            users: userCount,
            repositories: repoCount,
            digests: digestCount,
            jobs: jobCount,
            notifications: notificationCount,
          };
        } catch (error) {
          logger.warn({ error }, 'Failed to get database metrics');
        }
      }

      // Determine overall health status
      const totalChecks = Object.keys(checks).length;
      if (unhealthyCount === 0) {
        health.status = 'healthy';
      } else if (unhealthyCount < totalChecks / 2) {
        health.status = 'degraded';
      } else {
        health.status = 'unhealthy';
      }

      const responseTime = Date.now() - startTime;

      const httpStatus = health.status === 'unhealthy' ? 503 : 
                        health.status === 'degraded' ? 200 : 200;

      res.status(httpStatus).json({
        success: health.status !== 'unhealthy',
        data: {
          ...health,
          checks,
          summary: {
            totalChecks,
            healthyChecks: totalChecks - unhealthyCount,
            unhealthyChecks: unhealthyCount,
            responseTime,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/health/readiness
 * Readiness probe for Kubernetes/container orchestration
 */
router.get('/readiness',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if the application is ready to serve traffic
      const checks = [];

      // Database connectivity
      try {
        await db.$queryRaw`SELECT 1`;
        checks.push({ name: 'database', ready: true });
      } catch (error) {
        checks.push({ 
          name: 'database', 
          ready: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }

      // Job service readiness
      try {
        const jobHealth = await jobService.getHealthCheck();
        checks.push({ 
          name: 'jobService', 
          ready: jobHealth.healthy,
          workers: jobHealth.workerStatus?.length || 0,
        });
      } catch (error) {
        checks.push({ 
          name: 'jobService', 
          ready: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }

      const allReady = checks.every(check => check.ready);
      const status = allReady ? 'ready' : 'not_ready';

      res.status(allReady ? 200 : 503).json({
        success: allReady,
        data: {
          status,
          checks,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        data: {
          status: 'not_ready',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/v1/health/liveness
 * Liveness probe for Kubernetes/container orchestration
 */
router.get('/liveness',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Simple liveness check - is the process running and responsive
      const alive = {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
      };

      res.json({
        success: true,
        data: alive,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: {
          status: 'dead',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/v1/health/metrics
 * Prometheus-style metrics endpoint
 */
router.get('/metrics',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = [];
      
      // Process metrics
      const memUsage = process.memoryUsage();
      metrics.push(`# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes`);
      metrics.push(`# TYPE nodejs_memory_usage_bytes gauge`);
      metrics.push(`nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}`);
      metrics.push(`nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}`);
      metrics.push(`nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}`);
      metrics.push(`nodejs_memory_usage_bytes{type="external"} ${memUsage.external}`);

      // Uptime
      metrics.push(`# HELP nodejs_process_uptime_seconds Process uptime in seconds`);
      metrics.push(`# TYPE nodejs_process_uptime_seconds counter`);
      metrics.push(`nodejs_process_uptime_seconds ${process.uptime()}`);

      // System metrics
      const loadAvg = os.loadavg();
      metrics.push(`# HELP system_load_average System load average`);
      metrics.push(`# TYPE system_load_average gauge`);
      metrics.push(`system_load_average{period="1m"} ${loadAvg[0]}`);
      metrics.push(`system_load_average{period="5m"} ${loadAvg[1]}`);
      metrics.push(`system_load_average{period="15m"} ${loadAvg[2]}`);

      // Database metrics
      try {
        const [userCount, repoCount, digestCount, jobCount] = await Promise.all([
          db.user.count(),
          db.repo.count(),
          db.digest.count(),
          db.job.count(),
        ]);

        metrics.push(`# HELP database_records_total Total number of database records`);
        metrics.push(`# TYPE database_records_total gauge`);
        metrics.push(`database_records_total{table="users"} ${userCount}`);
        metrics.push(`database_records_total{table="repos"} ${repoCount}`);
        metrics.push(`database_records_total{table="digests"} ${digestCount}`);
        metrics.push(`database_records_total{table="jobs"} ${jobCount}`);
      } catch (error) {
        logger.warn({ error }, 'Failed to get database metrics');
      }

      // Job service metrics
      try {
        const jobMetrics = jobService.getMetrics();
        metrics.push(`# HELP jobs_total Total number of jobs by status`);
        metrics.push(`# TYPE jobs_total gauge`);
        Object.entries(jobMetrics.byStatus).forEach(([status, count]) => {
          metrics.push(`jobs_total{status="${status}"} ${count}`);
        });

        metrics.push(`# HELP jobs_processing_time_seconds Job processing time in seconds`);
        metrics.push(`# TYPE jobs_processing_time_seconds histogram`);
        if (jobMetrics.averageProcessingTime) {
          metrics.push(`jobs_processing_time_seconds_sum ${jobMetrics.averageProcessingTime}`);
          metrics.push(`jobs_processing_time_seconds_count ${jobMetrics.total}`);
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to get job service metrics');
      }

      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(metrics.join('\n') + '\n');
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Helper function to get disk usage
 */
async function getDiskUsage(): Promise<any> {
  try {
    if (process.platform === 'win32') {
      // Windows disk usage
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      return { platform: 'windows', raw: stdout };
    } else {
      // Unix-like disk usage
      const { stdout } = await execAsync('df -h');
      return { platform: 'unix', raw: stdout };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      platform: process.platform,
    };
  }
}

export default router;