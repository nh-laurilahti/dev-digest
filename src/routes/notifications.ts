import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  validateSchema,
  notificationSchemas,
  querySchemas,
} from '../lib/validation';
import {
  PERMISSIONS,
} from '../lib/rbac';
import { logger } from '../lib/logger';
import { jobService } from '../services';
import { db } from '../db';
import { NotFoundError, ValidationError, ExternalServiceError } from '../lib/errors';
import { JobType } from '../types/job';
import { config } from '../lib/config';

const router = Router();

// Rate limiting for notification operations
const notificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 notification operations per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Notification operations rate limit exceeded.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for test notifications (more restrictive)
const testNotificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 test notifications per hour
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Test notification rate limit exceeded.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication removed - all routes are now public

/**
 * GET /api/v1/notifications
 * List notifications with filtering and pagination
 */
router.get('/',
  validateSchema(notificationSchemas.query, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        page,
        limit,
        offset,
        sortBy = 'createdAt',
        sortOrder,
        type,
        channel,
        status,
        priority,
        recipientId,
      } = req.query as any;

      const userId = 0; // No-user mode placeholder

      logger.debug({
        userId,
        page,
        limit,
        type,
        channel,
        status,
      }, 'Listing notifications');

      // Build where clause - users can only see their own notifications unless admin
      const where: any = {
        recipientId: userId,
      };

      // All users can filter by recipientId since authentication is removed
      if (recipientId) {
        where.recipientId = recipientId;
      }

      if (type) where.type = type;
      if (channel) where.channel = channel;
      if (status) where.status = status;

      // Get total count
      const total = await db.notification.count({ where });

      // Get notifications
      const notifications = await db.notification.findMany({
        where,
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          digest: {
            select: {
              id: true,
              repo: {
                select: {
                  id: true,
                  path: true,
                  name: true,
                },
              },
              dateFrom: true,
              dateTo: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit,
      });

      // Transform response
      const transformedNotifications = notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        channel: notification.channel,
        status: notification.status,
        subject: notification.subject,
        message: notification.message,
        metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
        recipient: notification.recipient,
        digest: notification.digest,
        sentAt: notification.sentAt,
        error: notification.error,
        createdAt: notification.createdAt,
      }));

      res.json({
        success: true,
        data: {
          notifications: transformedNotifications,
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
 * GET /api/v1/notifications/:id
 * Get specific notification details
 */
router.get('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id, 10);
      
      if (isNaN(notificationId)) {
        throw new ValidationError('Invalid notification ID');
      }

      const notification = await db.notification.findUnique({
        where: { id: notificationId },
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          digest: {
            select: {
              id: true,
              repo: {
                select: {
                  id: true,
                  path: true,
                  name: true,
                },
              },
              dateFrom: true,
              dateTo: true,
              createdAt: true,
            },
          },
        },
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      logger.debug({
        notificationId,
        userId: 0,
        type: notification.type,
        channel: notification.channel,
      }, 'Notification details retrieved');

      res.json({
        success: true,
        data: {
          id: notification.id,
          type: notification.type,
          channel: notification.channel,
          status: notification.status,
          subject: notification.subject,
          message: notification.message,
          metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
          recipient: notification.recipient,
          digest: notification.digest,
          sentAt: notification.sentAt,
          error: notification.error,
          createdAt: notification.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/notifications/:id
 * Mark notification as read or update status
 */
router.patch('/:id',
  notificationRateLimit,
  validateSchema(notificationSchemas.update),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id, 10);
      const updateData = req.body;
      
      if (isNaN(notificationId)) {
        throw new ValidationError('Invalid notification ID');
      }

      const userId = 0;

      const notification = await db.notification.update({
        where: { id: notificationId },
        data: updateData,
        include: {
          recipient: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      logger.info({
        notificationId,
        userId,
        updates: Object.keys(updateData),
        newStatus: notification.status,
      }, 'Notification updated');

      res.json({
        success: true,
        data: {
          id: notification.id,
          type: notification.type,
          channel: notification.channel,
          status: notification.status,
          subject: notification.subject,
          message: notification.message,
          metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
          recipient: notification.recipient,
          sentAt: notification.sentAt,
          error: notification.error,
          createdAt: notification.createdAt,
        },
        message: 'Notification updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/notifications/:id
 * Delete notification
 */
router.delete('/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id, 10);
      
      if (isNaN(notificationId)) {
        throw new ValidationError('Invalid notification ID');
      }

      const userId = 0;

      // Check if notification exists
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      // Delete notification
      await db.notification.delete({
        where: { id: notificationId },
      });

      logger.info({
        notificationId,
        userId,
        type: notification.type,
      }, 'Notification deleted');

      res.json({
        success: true,
        message: 'Notification deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/mark-all-read
 * Mark all notifications as read for the current user
 */
router.post('/mark-all-read',
  notificationRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 0;

      const updated = await db.notification.updateMany({
        where: {
          recipientId: userId,
          status: { in: ['pending', 'sent'] },
        },
        data: {
          status: 'read',
        },
      });

      logger.info({
        userId,
        updatedCount: updated.count,
      }, 'All notifications marked as read');

      res.json({
        success: true,
        data: {
          updatedCount: updated.count,
        },
        message: `${updated.count} notifications marked as read`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/notifications/clear-read
 * Clear all read notifications for the current user
 */
router.delete('/clear-read',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 0;

      const deleted = await db.notification.deleteMany({
        where: {
          recipientId: userId,
          status: 'read',
        },
      });

      logger.info({
        userId,
        deletedCount: deleted.count,
      }, 'Read notifications cleared');

      res.json({
        success: true,
        data: {
          deletedCount: deleted.count,
        },
        message: `${deleted.count} read notifications cleared`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 0;

      const unreadCount = await db.notification.count({
        where: {
          recipientId: userId,
          status: { in: ['pending', 'sent'] },
        },
      });

      // Also get counts by type and channel
      const countsByType = await db.notification.groupBy({
        by: ['type'],
        where: {
          recipientId: userId,
          status: { in: ['pending', 'sent'] },
        },
        _count: { id: true },
      });

      const countsByChannel = await db.notification.groupBy({
        by: ['channel'],
        where: {
          recipientId: userId,
          status: { in: ['pending', 'sent'] },
        },
        _count: { id: true },
      });

      res.json({
        success: true,
        data: {
          total: unreadCount,
          byType: countsByType.reduce((acc: any, item) => {
            acc[item.type] = item._count.id;
            return acc;
          }, {}),
          byChannel: countsByChannel.reduce((acc: any, item) => {
            acc[item.channel] = item._count.id;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/test-slack
 * Test Slack notification
 */
router.post('/test-slack',
  testNotificationRateLimit,
  validateSchema(notificationSchemas.testSlack),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channel, message, webhook_url } = req.body;
      const userId = 0;

      logger.info({
        userId,
        channel,
      }, 'Testing Slack notification');

      // Create a test notification job with proper payload format
      const job = await jobService.createJob({
        type: JobType.NOTIFICATION,
        priority: 'high',
        params: {
          type: 'slack',
          recipients: [userId.toString()], // Array of recipient IDs
          subject: 'Test Slack Notification',
          message,
          template: 'slack_test_message',
          data: {
            slack_channel: channel,
            webhook_url: webhook_url || config.SLACK_WEBHOOK_URL,
            is_test: true,
            test_timestamp: new Date().toISOString(),
          },
        },
        maxRetries: 1,
      });

      res.status(202).json({
        success: true,
        data: {
          job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
          },
          test: {
            channel,
            message,
            timestamp: new Date().toISOString(),
          },
        },
        message: 'Slack test notification job created',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/test-slack-simple
 * Simplified test Slack notification (bypasses job queue)
 */
router.post('/test-slack-simple',
  testNotificationRateLimit,
  validateSchema(notificationSchemas.testSlack),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channel, message } = req.body;
      const userId = 0;

      logger.info({
        userId,
        channel,
      }, 'Testing Slack notification directly');

      // Check if Slack is configured
      const slackToken = process.env.SLACK_BOT_TOKEN;
      const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
      
      if (!slackToken || !slackSigningSecret) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'SLACK_NOT_CONFIGURED',
            message: 'Slack integration is not configured. Please set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET environment variables.',
          },
        });
      }

      // Try to send a simple Slack message directly
      try {
        // Import Slack service dynamically to avoid initialization issues
        const { SlackService } = await import('../services/slack');
        
        const slackService = new SlackService({
          token: slackToken,
          signingSecret: slackSigningSecret,
          scopes: ['chat:write', 'files:write', 'users:read']
        });

        // Use the simpler WebClient directly for testing
        const { WebClient } = await import('@slack/web-api');
        const slackClient = new WebClient(slackToken);

        // Test the connection first
        const authTest = await slackClient.auth.test();
        if (!authTest.ok) {
          throw new Error(`Slack auth failed: ${authTest.error}`);
        }

        // If this is a config check from the settings page, do not post a message
        if (message === 'config-check') {
          return res.json({
            success: true,
            data: {
              channel,
              messageId: null,
              timestamp: new Date().toISOString(),
              permalink: undefined,
            },
            message: 'Slack configuration verified',
          });
        }

        // Send test message
        const result = await slackClient.chat.postMessage({
          channel: channel,
          text: message,
          unfurl_links: false,
          unfurl_media: false
        });

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error}`);
        }

        const slackResult = {
          success: true,
          channel: result.channel,
          messageId: result.ts,
          timestamp: result.ts,
          permalink: undefined // Could get permalink if needed
        };

        if (slackResult.success) {
          res.json({
            success: true,
            data: {
              channel: slackResult.channel,
              messageId: slackResult.messageId,
              timestamp: slackResult.timestamp,
              permalink: slackResult.permalink,
            },
            message: 'Slack test message sent successfully',
          });
        } else {
          throw new Error('Failed to send Slack message');
        }

      } catch (slackError) {
        logger.error({
          userId,
          channel,
          error: slackError instanceof Error ? slackError.message : String(slackError)
        }, 'Direct Slack test failed');

        res.status(500).json({
          success: false,
          error: {
            code: 'SLACK_SEND_FAILED',
            message: `Failed to send Slack message: ${slackError instanceof Error ? slackError.message : String(slackError)}`,
          },
        });
      }

    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/test-email
 * Test email notification
 */
router.post('/test-email',
  testNotificationRateLimit,
  validateSchema(notificationSchemas.testEmail),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { to, subject, message, html } = req.body;
      const userId = 0;

      logger.info({
        userId,
        to,
        subject,
      }, 'Testing email notification');

      // Create a test notification job
      const job = await jobService.createJob({
        type: JobType.NOTIFICATION,
        priority: 'high',
        params: {
          type: 'email',
          recipients: [to], // Use the email address directly as recipient
          subject,
          message,
          template: 'email_test_message',
          data: {
            email_to: to,
            is_html: html,
            is_test: true,
          },
        },
        maxRetries: 1,
      });

      res.status(202).json({
        success: true,
        data: {
          job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
          },
          test: {
            to,
            subject,
            html,
            timestamp: new Date().toISOString(),
          },
        },
        message: 'Email test notification job created',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/test-teams
 * Test Microsoft Teams notification
 */
router.post('/test-teams',
  testNotificationRateLimit,
  validateSchema(notificationSchemas.testTeams),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { webhook_url, title, message, theme_color = '0078d4' } = req.body;
      const userId = 0;

      logger.info({
        userId,
        webhook_url: webhook_url ? '***' : undefined,
      }, 'Testing Teams notification');

      // Create a test notification job
      const job = await jobService.createJob({
        type: JobType.NOTIFICATION,
        priority: 'high',
        payload: {
          type: 'test_teams',
          channel: 'teams',
          recipientId: userId,
          subject: title || 'Test Teams Notification',
          message,
          metadata: {
            webhook_url,
            title_template: title,
            theme_color,
            is_test: true,
          },
        },
        maxRetries: 1,
      });

      res.status(202).json({
        success: true,
        data: {
          job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
          },
          test: {
            webhook_url: webhook_url ? `${webhook_url.substring(0, 20)}...` : undefined,
            title,
            message,
            theme_color,
            timestamp: new Date().toISOString(),
          },
        },
        message: 'Teams test notification job created',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/notifications/test-webhook
 * Test webhook notification
 */
router.post('/test-webhook',
  testNotificationRateLimit,
  validateSchema(notificationSchemas.testWebhook),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, method = 'POST', headers, secret, message } = req.body;
      const userId = 0;

      logger.info({
        userId,
        url: url ? '***' : undefined,
        method,
      }, 'Testing webhook notification');

      // Create a test notification job
      const job = await jobService.createJob({
        type: JobType.NOTIFICATION,
        priority: 'high',
        payload: {
          type: 'test_webhook',
          channel: 'webhook',
          recipientId: userId,
          subject: 'Test Webhook Notification',
          message: message || JSON.stringify({ test: true, message: 'This is a test webhook notification' }),
          metadata: {
            webhook_url: url,
            method,
            headers,
            secret,
            is_test: true,
          },
        },
        maxRetries: 1,
      });

      res.status(202).json({
        success: true,
        data: {
          job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
          },
          test: {
            url: url ? `${url.substring(0, 20)}...` : undefined,
            method,
            headers: headers ? 'Provided' : undefined,
            secret: secret ? 'Provided' : undefined,
            timestamp: new Date().toISOString(),
          },
        },
        message: 'Webhook test notification job created',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/notifications/stats
 * Get notification statistics
 */
router.get('/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 0;

      // Get stats for the current user
      const [totalStats, statusStats, channelStats, typeStats] = await Promise.all([
        // Total notifications
        db.notification.aggregate({
          where: { recipientId: userId },
          _count: { id: true },
        }),

        // By status
        db.notification.groupBy({
          by: ['status'],
          where: { recipientId: userId },
          _count: { id: true },
        }),

        // By channel
        db.notification.groupBy({
          by: ['channel'],
          where: { recipientId: userId },
          _count: { id: true },
        }),

        // By type
        db.notification.groupBy({
          by: ['type'],
          where: { recipientId: userId },
          _count: { id: true },
        }),
      ]);

      // Get recent activity (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentStats = await db.notification.aggregate({
        where: {
          recipientId: userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      });

      res.json({
        success: true,
        data: {
          total: totalStats._count.id,
          recent: recentStats._count.id,
          byStatus: statusStats.reduce((acc: any, item) => {
            acc[item.status] = item._count.id;
            return acc;
          }, {}),
          byChannel: channelStats.reduce((acc: any, item) => {
            acc[item.channel] = item._count.id;
            return acc;
          }, {}),
          byType: typeStats.reduce((acc: any, item) => {
            acc[item.type] = item._count.id;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;