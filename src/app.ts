import express, { Application, Request, Response } from 'express';
import { config } from './lib/config';
import { errorHandler, notFoundHandler } from './lib/errors';
import { db } from './db';
import { jobService } from './services';
import { JobType, JobPriority } from './types/job';
// Removed auth routes
import jobRoutes from './routes/jobs';
import digestRoutes from './routes/digests';
import repositoryRoutes from './routes/repositories';
// import userRoutes from './routes/users'; // Removed user functionality
import settingsRoutes from './routes/settings';
import notificationRoutes from './routes/notifications';
import healthRoutes from './routes/health';

// Health check handler
const healthCheck = (req: Request, res: Response): void => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: config.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  res.json(healthData);
};

// API info handler
const apiInfo = (req: Request, res: Response): void => {
  const apiData = {
    name: 'Daily Dev Digest API',
    description: 'Personalized developer newsletter application',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.NODE_ENV,
    documentation: '/docs',
    health: '/health',
    timestamp: new Date().toISOString(),
  };

  res.json(apiData);
};

export function createApp(): Application {
  const app = express();

  // Body parsing middleware
  app.use(express.json({ 
    limit: '10mb',
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Trust proxy for accurate IP addresses
  app.set('trust proxy', 1);

  // EJS template engine configuration
  app.set('view engine', 'ejs');
  app.set('views', 'views');

  // Serve static files (CSS, images, etc.)
  app.use('/static', express.static('public', {
    maxAge: config.NODE_ENV === 'production' ? '1y' : '1h',
    etag: true,
    lastModified: true,
  }));

  // Favicon fallback for browsers requesting /favicon.ico
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.redirect(301, '/static/images/favicon.svg');
  });

  // Basic routes
  // Serve frontend at root
  app.get('/', (req: Request, res: Response) => {
    res.render('dashboard');
  });
  
  // Removed authentication pages
  
  // Main application pages (no auth required)
  app.get('/dashboard', (req: Request, res: Response) => {
    res.render('dashboard');
  });
  
  app.get('/archive', (req: Request, res: Response) => {
    res.render('archive');
  });
  
  app.get('/settings', (req: Request, res: Response) => {
    res.render('settings');
  });

  // Individual digest view
  app.get('/digests/:id', (req: Request, res: Response) => {
    res.render('digest');
  });

  // Repository management
  app.get('/repositories', (req: Request, res: Response) => {
    res.render('repositories');
  });

  // HTMX endpoints for HTML fragments
  app.get('/fragments/repositories', async (req: Request, res: Response) => {
    try {
      // Fetch repositories from database
      const repositories = await db.repo.findMany({
        select: {
          id: true,
          path: true,
          name: true,
          description: true
        },
        where: {
          active: true
        },
        orderBy: {
          path: 'asc'
        }
      });

      // Transform to expected format
      const transformedRepos = repositories.map(repo => {
        const [owner, repoName] = repo.path.split('/');
        return {
          id: repo.id,
          path: repo.path,
          name: repo.name,
          owner: owner,
          description: repo.description || ''
        };
      });
      
      res.render('partials/repository-options', { repositories: transformedRepos });
    } catch (error) {
      console.error('Error fetching repositories:', error);
      // Fallback to empty array if database error
      res.render('partials/repository-options', { repositories: [] });
    }
  });

  // Fragment for digest stats 
  app.get('/fragments/stats/digests', async (req: Request, res: Response) => {
    try {
      const count = await db.digest.count();
      res.send(count.toString());
    } catch (error) {
      console.error('Error fetching digest count:', error);
      res.send('0');
    }
  });

  app.get('/fragments/stats/repositories', async (req: Request, res: Response) => {
    try {
      const count = await db.repo.count();
      res.send(count.toString());
    } catch (error) {
      console.error('Error fetching repository count:', error);
      res.send('0');
    }
  });

  // Fragment for recent digests
  app.get('/fragments/digests/recent', async (req: Request, res: Response) => {
    try {
      // Fetch recent digests from database
      const digests = await db.digest.findMany({
        include: {
          repo: {
            select: {
              id: true,
              path: true,
              name: true,
              description: true,
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
            where: { type: JobType.DIGEST_GENERATION },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8, // Show recent 8 digests on dashboard
      });

      if (digests.length === 0) {
        return res.send(`
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h3 class="empty-state-title">No digests yet</h3>
            <p class="empty-state-description">
              Generate your first digest using the form above
            </p>
          </div>
        `);
      }

      // Transform database records to display format
      const transformedDigests = digests.map(digest => {
        const latestJob = digest.jobs[0];
        const stats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
        const [owner, repoName] = digest.repo.path.split('/');
        
        // Generate title based on repo and date
        const title = digest.repo.name 
          ? `${digest.repo.name} Digest`
          : `${owner}/${repoName} Digest`;
        
        // Determine status from latest job or digest state
        let status = 'COMPLETED';
        let progress = 100;
        
        if (latestJob) {
          status = latestJob.status.toUpperCase();
          progress = latestJob.progress || 0;
        } else if (!digest.summaryMd && !digest.summaryHtml) {
          status = 'PENDING';
          progress = 0;
        }

        return {
          id: digest.id.toString(),
          title,
          status,
          progress,
          createdAt: digest.createdAt.toISOString(),
          repositories: [{
            name: repoName || digest.repo.name,
            owner: owner || 'unknown'
          }],
          stats: {
            pullRequests: stats.pullRequests || stats.prs || 0,
            issues: stats.issues || 0,
            commits: stats.commits || 0
          },
          summary: digest.summaryMd 
            ? digest.summaryMd.substring(0, 200) + (digest.summaryMd.length > 200 ? '...' : '')
            : undefined
        };
      });

      const html = transformedDigests.map(digest => `
        <div class="digest-card glass-container glass-container--subtle" data-digest-id="${digest.id}">
          <div class="digest-card-header">
            <div class="digest-card-icon">
              ${digest.status === 'COMPLETED' ? '📊' : digest.status === 'RUNNING' ? '⏳' : digest.status === 'FAILED' ? '❌' : '📋'}
            </div>
            <div class="digest-card-info">
              <h3 class="digest-card-title">${digest.title || `Digest #${digest.id}`}</h3>
              <div class="digest-card-meta">
                <span class="digest-card-date">Created ${new Date(digest.createdAt).toLocaleDateString()}</span>
                ${digest.repositories && digest.repositories[0] ? `
                  <span class="digest-card-repos">Repository ${digest.repositories[0].name || digest.repositories[0].owner || 'Unknown'}</span>
                ` : ''}
                ${digest.stats && digest.stats.pullRequests > 0 ? `
                  <span class="digest-card-prs">Pull Requests ${digest.stats.pullRequests}</span>
                ` : ''}
              </div>
            </div>
            <div class="digest-card-status">
              <div class="job-status job-status--${digest.status.toLowerCase()}">
                <span class="job-status-icon"></span>
                <span class="job-status-text">${digest.status}</span>
              </div>
            </div>
          </div>
          
          ${digest.summary ? `
            <div class="digest-card-content">
              <p class="digest-card-description">${digest.summary}</p>
            </div>
          ` : ''}
          
          ${digest.stats && (digest.stats.pullRequests > 0 || digest.stats.issues > 0 || digest.stats.commits > 0) ? `
            <div class="digest-card-stats">
              <div class="stat-grid stat-grid--compact">
                ${digest.stats.pullRequests > 0 ? `
                  <div class="stat-item">
                    <span class="stat-value">${digest.stats.pullRequests}</span>
                    <span class="stat-label">PRs</span>
                  </div>
                ` : ''}
                ${digest.stats.issues > 0 ? `
                  <div class="stat-item">
                    <span class="stat-value">${digest.stats.issues}</span>
                    <span class="stat-label">Issues</span>
                  </div>
                ` : ''}
                ${digest.stats.commits > 0 ? `
                  <div class="stat-item">
                    <span class="stat-value">${digest.stats.commits}</span>
                    <span class="stat-label">Commits</span>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}
          
          <div class="digest-card-actions">
            <div class="digest-actions-links">
              ${digest.status === 'COMPLETED' ? `
                <a href="/digests/${digest.id}">View</a>
              ` : ''}
              
              ${digest.status === 'COMPLETED' || digest.status === 'FAILED' ? `
                <a href="#"
                   hx-post="/api/v1/digests/${digest.id}/regenerate"
                   hx-target="closest .digest-card"
                   hx-swap="outerHTML"
                   hx-confirm="Regenerate this digest?">Regenerate</a>
              ` : ''}
              
              <a href="#"
                 style="color: #ef4444;"
                 hx-delete="/api/v1/digests/${digest.id}"
                 hx-target="closest .digest-card"
                 hx-swap="outerHTML"
                 hx-confirm="Are you sure you want to delete this digest?">Delete</a>
            </div>
          </div>
        </div>
      `).join('');
      
      res.send(html);
    } catch (error) {
      console.error('Error fetching recent digests:', error);
      // Fallback to empty state on error
      res.send(`
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">Unable to load digests</h3>
          <p class="empty-state-description">
            There was an error loading your digests. Please try refreshing the page.
          </p>
        </div>
      `);
    }
  });

  // Mock digest creation for form submission - now uses real job creation
  app.post('/fragments/digest/create', async (req: Request, res: Response) => {
    try {
      console.log('Request body:', req.body);
      
      let { repositories, summaryStyle, summaryPrompt } = req.body;
      
      // Handle repositories - it could be undefined, a single value, or an array
      if (!repositories) {
        repositories = [];
      } else if (typeof repositories === 'string') {
        repositories = [repositories];
      }
      
      console.log('Processed repositories:', repositories);

      // Convert to integers and validate
      const repositoryIds = repositories.map((r: string) => parseInt(r)).filter((id: number) => !isNaN(id));
      
      if (repositoryIds.length === 0) {
        const html = `
          <div class="alert alert--error">
            <span class="alert-icon">❌</span>
            <span class="alert-message">Please select at least one repository</span>
          </div>
        `;
        return res.send(html);
      }

      // Get all active repositories (no user restrictions)
      const repoRecords = await db.repo.findMany({
        where: {
          id: { in: repositoryIds },
          active: true,
        },
      });

      if (repoRecords.length === 0) {
        const html = `
          <div class="alert alert--error">
            <span class="alert-icon">❌</span>
            <span class="alert-message">No valid repositories found</span>
          </div>
        `;
        return res.send(html);
      }

      // Create digest record (no user required)
      const digest = await db.digest.create({
        data: {
          repoId: repoRecords[0].id, // For now, single repo support
          dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
          dateTo: new Date(),
          statsJson: '{}',
          // No createdById field - public digest
        },
      });

      // Create job using real job service (no user required)
      const job = await jobService.createJob({
        type: JobType.DIGEST_GENERATION,
        priority: JobPriority.NORMAL,
        params: {
          repoId: repoRecords[0].id,
          dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          dateTo: new Date(),
          includePRs: true,
          includeIssues: false,
          includeCommits: false,
          summaryType: 'detailed',
          summaryStyle: summaryStyle || 'concise',
          customPrompt: summaryPrompt,
        },
        digestId: digest.id,
      });
      
      // Return job status polling component
      const html = `
        <div class="alert alert--success">
          <span class="alert-icon">✅</span>
          <span class="alert-message">Digest generation started! Job ID: ${job.id}</span>
        </div>
        <div class="job-status-container" 
             id="job-${job.id}"
             hx-get="/fragments/job/${job.id}/status"
             hx-trigger="every 3s"
             hx-target="#job-${job.id}"
             hx-swap="outerHTML">
          <div class="job-status job-status--pending">
            <span class="job-status-icon"></span>
            <span class="job-status-text">PENDING</span>
          </div>
          <div class="progress progress--sm" style="margin-top: var(--space-2);">
            <div class="progress-bg">
              <div class="progress-bar" style="width: 0%" data-progress="0"></div>
            </div>
            <span class="progress-text">0%</span>
          </div>
        </div>
      `;
      
      res.send(html);
    } catch (error) {
      console.error('Error creating digest:', error);
      const html = `
        <div class="alert alert--error">
          <span class="alert-icon">❌</span>
          <span class="alert-message">Failed to create digest: ${error instanceof Error ? error.message : 'Unknown error'}</span>
        </div>
      `;
      res.send(html);
    }
  });

  // Real job status for polling
  app.get('/fragments/job/:jobId/status', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    
    try {
      console.log('Looking for job with ID:', jobId);
      
      // Query the actual job from database
      const job = await db.job.findUnique({
        where: { id: jobId },
        include: {
          digest: {
            select: { id: true }
          }
        }
      });

      console.log('Found job:', job ? { id: job.id, status: job.status, digestId: job.digestId } : 'null');

      if (!job) {
        console.log('Job not found in database, returning error');
        return res.status(404).send(`
          <div class="alert alert--error">
            <span class="alert-icon">❌</span>
            <span class="alert-message">Job not found with ID: ${jobId}</span>
          </div>
        `);
      }

      const status = job.status;
      const progress = job.progress;
      
      if (status === 'COMPLETED') {
        const digestId = job.digestId || 'unknown';
        const html = `
          <div class="alert alert--success">
            <span class="alert-icon">🎉</span>
            <span class="alert-message">
              Digest generated successfully! 
              <a href="/digests/${digestId}" class="btn btn--primary btn--sm" style="margin-left: var(--space-2);">View Digest</a>
            </span>
          </div>
        `;
        return res.send(html);
      }

      if (status === 'FAILED') {
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
             hx-get="/fragments/job/${jobId}/status"
             hx-trigger="every 3s"
             hx-target="#job-${jobId}"
             hx-swap="outerHTML">
          <div class="job-status job-status--${status.toLowerCase()}">
            <span class="job-status-icon"></span>
            <span class="job-status-text">${status}</span>
          </div>
          <div class="progress progress--sm" style="margin-top: var(--space-2);">
            <div class="progress-bg">
              <div class="progress-bar ${status === 'COMPLETED' ? 'progress-bar--success' : 'progress-bar--primary'}" 
                   style="width: ${progress}%" 
                   data-progress="${progress}">
              </div>
            </div>
            <span class="progress-text">${progress}%</span>
          </div>
        </div>
      `;
      
      res.send(html);
    } catch (error) {
      console.error('Error fetching job status:', error);
      res.status(500).send(`
        <div class="alert alert--error">
          <span class="alert-icon">❌</span>
          <span class="alert-message">Error checking job status</span>
        </div>
      `);
    }
  });

  app.get('/health', healthCheck);
  
  // API routes - v1
  const API_PREFIX = '/api/v1';
  
  // Public routes (auth removed)
  app.use(`${API_PREFIX}/health`, healthRoutes);
  
  // Public routes (auth removed)
  app.use('/api', jobRoutes); // Keep legacy job routes for backward compatibility
  app.use(`${API_PREFIX}/digests`, digestRoutes);
  app.use(`${API_PREFIX}/repos`, repositoryRoutes);
  // app.use(`${API_PREFIX}/users`, userRoutes); // Removed user functionality
  app.use(`${API_PREFIX}/settings`, settingsRoutes);
  app.use(`${API_PREFIX}/notifications`, notificationRoutes);

  // Handle Chrome DevTools well-known endpoint
  app.get('/.well-known/appspecific/com.chrome.devtools.json', (req: Request, res: Response) => {
    res.status(404).json({ error: 'Not available' });
  });

  // API documentation
  app.get('/docs', (req: Request, res: Response) => {
    res.json({
      name: 'Daily Dev Digest API',
      description: 'Comprehensive REST API for the Daily Dev Digest application',
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      baseUrl: `${req.protocol}://${req.get('host')}`,
      endpoints: {
        authentication: {
          prefix: '/api/auth',
          routes: [
            'POST /register - User registration',
            'POST /login - User login',
            'POST /logout - User logout',
            'POST /refresh - Refresh token',
            'POST /forgot-password - Request password reset',
            'POST /reset-password - Reset password with token',
          ],
        },
        health: {
          prefix: '/api/v1/health',
          routes: [
            'GET / - Basic health check (public)',
            'GET /detailed - Detailed health check with service statuses',
            'GET /readiness - Kubernetes readiness probe',
            'GET /liveness - Kubernetes liveness probe', 
            'GET /metrics - Prometheus-style metrics',
          ],
        },
        digests: {
          prefix: '/api/v1/digests',
          routes: [
            'POST / - Create digest generation job',
            'GET / - List digests with filtering and pagination',
            'GET /:id - Get specific digest details',
            'DELETE /:id - Delete digest',
            'GET /:id/stats - Get digest statistics',
            'POST /:id/regenerate - Regenerate digest',
            'GET /:id/export - Export digest in various formats',
          ],
        },
        repositories: {
          prefix: '/api/v1/repos',
          routes: [
            'GET / - List repositories with filtering',
            'POST / - Add new repository (body: {repository: "owner/repo"})',
            'GET /:id - Get repository details',
            'PATCH /:id - Update repository settings',
            'DELETE /:id - Remove repository',
            'POST /validate - Validate repository access (body: {repository: "owner/repo"})',
            'GET /:id/stats - Get repository statistics',
            'GET /:id/branches - Get repository branches',
          ],
        },
        users: {
          prefix: '/api/v1/users',
          routes: [
            'GET /me - Get current user profile',
            'PATCH /me - Update user profile',
            'GET /me/preferences - Get user preferences',
            'PATCH /me/preferences - Update user preferences',
            'GET /me/stats - Get user activity statistics',
            'POST /me/change-password - Change user password',
            'GET /me/api-keys - Get user API keys',
            'GET /me/sessions - Get active sessions',
            'DELETE /me/sessions/:sessionId - Revoke session',
            'POST /me/sessions/revoke-all - Revoke all sessions',
          ],
        },
        settings: {
          prefix: '/api/v1/settings',
          routes: [
            'GET / - Get application settings (admin)',
            'PATCH / - Update application settings (admin)',
            'GET /public - Get public settings',
            'GET /:section/:key - Get specific setting',
            'PUT /:section/:key - Set specific setting (admin)',
            'DELETE /:section/:key - Reset setting to default (admin)',
            'POST /reset - Reset all settings (admin)',
            'GET /export - Export settings as JSON (admin)',
            'POST /import - Import settings from JSON (admin)',
          ],
        },
        notifications: {
          prefix: '/api/v1/notifications',
          routes: [
            'GET / - List notifications with filtering',
            'GET /:id - Get notification details',
            'PATCH /:id - Update notification status',
            'DELETE /:id - Delete notification',
            'POST /mark-all-read - Mark all notifications as read',
            'DELETE /clear-read - Clear read notifications',
            'GET /unread-count - Get unread notification count',
            'POST /test-slack - Test Slack notifications',
            'POST /test-email - Test email notifications',
            'GET /stats - Get notification statistics',
          ],
        },
        jobs: {
          prefix: '/api',
          routes: [
            'GET /jobs - List jobs (legacy endpoint)',
            'POST /jobs - Create job (legacy endpoint)',
            'GET /jobs/:id - Get job details (legacy endpoint)',
          ],
        },
      },
      authentication: {
        type: 'Bearer Token',
        description: 'Include Authorization header with Bearer token for authenticated endpoints',
        example: 'Authorization: Bearer your-jwt-token-here',
      },
      permissions: {
        description: 'Role-based access control with granular permissions',
        roles: ['user', 'moderator', 'admin'],
        note: 'Contact admin for role assignment',
      },
      support: {
        documentation: '/docs',
        health: '/health',
        metrics: '/api/v1/health/metrics',
      },
    });
  });

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}