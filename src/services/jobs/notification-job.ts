/**
 * Notification Job Handler
 * Updated to use the comprehensive notification system
 */

import {
  BaseJob,
  JobResult,
  JobHandler,
  JobType,
  NotificationJobParams
} from '../../types/job';
import { logger } from '../../lib/logger';
import { db } from '../../db';
import { NotificationManager, NotificationRequest, NotificationRecipient } from '../notification-manager';
import { EmailService, DEFAULT_EMAIL_CONFIG } from '../email';
import { SlackService } from '../slack';
import { TemplateEngine } from '../templates/template-engine';

export class NotificationJobHandler implements JobHandler {
  type = JobType.NOTIFICATION;
  private notificationManager: NotificationManager | null = null;

  constructor() {
    this.initializeNotificationManager().catch(error => {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize notification manager');
    });
  }

  /**
   * Initialize the notification manager with all services
   */
  private async initializeNotificationManager(): Promise<void> {
    try {
      const emailService = new EmailService(DEFAULT_EMAIL_CONFIG);
      const slackService = new SlackService({
        token: process.env.SLACK_BOT_TOKEN || '',
        signingSecret: process.env.SLACK_SIGNING_SECRET || '',
        scopes: ['chat:write', 'files:write', 'users:read']
      });


      const templateEngine = new TemplateEngine();

      this.notificationManager = new NotificationManager(
        emailService,
        slackService,
        templateEngine
      );

      logger.info('Notification manager initialized successfully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize notification manager');
    }
  }

  async handle(job: BaseJob): Promise<JobResult> {
    try {
      const params = job.params as NotificationJobParams;

      if (!this.validate(params)) {
        return {
          success: false,
          error: 'Invalid notification job parameters'
        };
      }

      if (!this.notificationManager) {
        await this.initializeNotificationManager();
        
        if (!this.notificationManager) {
          throw new Error('Failed to initialize notification manager');
        }
      }

      logger.info({
        jobId: job.id,
        type: params.type,
        recipientCount: params.recipients.length,
        digestId: params.digestId
      }, 'Processing notification job');

      await this.updateProgress(job.id, 10);

      // Convert job parameters to notification manager format
      const notificationRequest = await this.convertJobParamsToNotificationRequest(params, job);
      
      await this.updateProgress(job.id, 20);

      // Get recipient information from database
      const recipients = await this.getNotificationRecipients(params.recipients);
      
      await this.updateProgress(job.id, 30);

      notificationRequest.recipients = recipients;

      // Send notification using the notification manager
      const result = await this.notificationManager.sendNotification(notificationRequest);
      
      await this.updateProgress(job.id, 90);

      // Store job-specific notification record
      await this.storeJobNotificationRecord(job.id, params, result);
      
      await this.updateProgress(job.id, 100);

      const jobResult: JobResult = {
        success: result.success,
        data: {
          notificationId: result.id,
          successCount: result.successfulDeliveries,
          failureCount: result.failedCount,
          totalRecipients: result.totalRecipients,
          deliveries: result.deliveries.map(d => ({
            channel: d.channel,
            recipient: d.recipient,
            success: d.success,
            messageId: d.messageId
          }))
        },
        metadata: {
          notificationType: params.type,
          digestId: params.digestId,
          duration: result.duration,
          deliveredAt: result.deliveredAt
        }
      };

      if (!result.success) {
        jobResult.error = result.error;
      } else if (result.failedCount > 0) {
        jobResult.error = `Partial success: ${result.failedCount} of ${result.totalRecipients} deliveries failed`;
      }

      logger.info({
        jobId: job.id,
        notificationId: result.id,
        successCount: result.successfulDeliveries,
        failureCount: result.failedCount,
        totalRecipients: result.totalRecipients,
        duration: result.duration
      }, 'Notification job completed');

      return jobResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        jobId: job.id,
        error: errorMessage
      }, 'Notification job failed');

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Convert job parameters to notification request format
   */
  private async convertJobParamsToNotificationRequest(
    params: NotificationJobParams, 
    job: BaseJob
  ): Promise<NotificationRequest> {
    // Determine category based on job context
    let category: 'digest' | 'alert' | 'system' | 'user' | 'job' = 'system';
    if (params.digestId) {
      category = 'digest';
    } else if (params.template?.includes('alert')) {
      category = 'alert';
    } else if (params.template?.includes('job')) {
      category = 'job';
    }

    // Determine severity based on template
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (params.template?.includes('critical')) {
      severity = 'critical';
    } else if (params.template?.includes('high')) {
      severity = 'high';
    } else if (params.template?.includes('low')) {
      severity = 'low';
    }

    const baseRequest: NotificationRequest = {
      id: `job_${job.id}_${Date.now()}`,
      type: params.template || `${params.type}_notification`,
      category,
      severity,
      title: params.subject || `${params.type} notification`,
      message: params.message,
      recipients: [], // Will be populated later
      channels: [params.type] as any,
      templateData: {
        ...params.data,
        jobId: job.id,
        digestId: params.digestId,
        _system: {
          timestamp: new Date(),
          jobType: job.type,
          jobStatus: job.status
        }
      },
      metadata: {
        jobId: job.id,
        digestId: params.digestId,
        originalParams: params,
        // Allow digest notifications to bypass quiet hours filtering
        ignoreQuietHours: category === 'digest'
      }
    };

    // Only include template if provided to satisfy exactOptionalPropertyTypes
    if (params.template) {
      (baseRequest as any).template = params.template;
    }

    return baseRequest;
  }

  /**
   * Get notification recipients with their preferences from database
   */
  private async getNotificationRecipients(recipientIds: string[]): Promise<NotificationRecipient[]> {
    const recipients: NotificationRecipient[] = [];

    for (const recipientId of recipientIds) {
      try {
        // Try to find user by email first, then by user ID
        let user = await db.user.findFirst({
          where: { email: recipientId },
          include: { preferences: true }
        });

        if (!user && !isNaN(Number(recipientId))) {
          user = await db.user.findUnique({
            where: { id: Number(recipientId) },
            include: { preferences: true }
          });
        }

        if (user) {
          const preferences = user.preferences;
          let channelNames: string[] = preferences ? JSON.parse(preferences.channels || '[]') : ['email'];
          if (!Array.isArray(channelNames) || channelNames.length === 0) {
            channelNames = ['email'];
          }

          // Map frequency to allowed values
          const prefFreq = preferences?.frequency || 'digest';
          const allowedFreq = ['immediate', 'batched', 'digest'] as const;
          const mappedFrequency = (allowedFreq as readonly string[]).includes(prefFreq) ? (prefFreq as 'immediate' | 'batched' | 'digest') : 'digest';

          const recipient: NotificationRecipient = {
            id: user.id,
            preferences: {
              channels: channelNames.map((channelName: string) => ({
                type: channelName as any,
                enabled: true,
                config: {},
                priority: channelName === 'email' ? 10 : 5
              })),
              frequency: mappedFrequency,
              categories: ['digest', 'alert', 'system', 'user', 'job'],
              minimumSeverity: 'low'
            }
          };

          if (user.email) {
            (recipient as any).email = user.email;
          }
          if (preferences?.slackUserId) {
            (recipient as any).slackUserId = preferences.slackUserId;
          }

          recipients.push(recipient);
        } else {
          // Create a basic recipient for email-only delivery
          const isEmail = recipientId.includes('@');
          const recipient: NotificationRecipient = {
            id: Date.now(), // Temporary ID
            preferences: {
              channels: [{
                type: 'email',
                enabled: true,
                config: {},
                priority: 10
              }],
              frequency: 'immediate',
              categories: ['digest', 'alert', 'system', 'user', 'job'],
              minimumSeverity: 'low'
            }
          };

          if (isEmail) {
            (recipient as any).email = recipientId;
          }

          recipients.push(recipient);
        }
      } catch (error) {
        logger.warn({
          recipientId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to load recipient information');
        
        // Create fallback recipient
        const fallback: NotificationRecipient = {
          id: Date.now(),
          preferences: {
            channels: [{
              type: 'email',
              enabled: true,
              config: {},
              priority: 10
            }],
            frequency: 'immediate',
            categories: ['digest', 'alert', 'system', 'user', 'job'],
            minimumSeverity: 'low'
          }
        };
        if (recipientId.includes('@')) {
          (fallback as any).email = recipientId;
        }
        recipients.push(fallback);
      }
    }

    return recipients;
  }

  /**
   * Store job-specific notification record
   */
  private async storeJobNotificationRecord(
    jobId: string,
    params: NotificationJobParams,
    result: any
  ): Promise<void> {
    try {
      // Persist notification result into paramsJson since Job has no standalone metadata column
      const existing = await db.job.findUnique({ where: { id: jobId } });
      const existingParams = existing?.paramsJson ? JSON.parse(existing.paramsJson) : {};
      const updatedParams = {
        ...existingParams,
        notificationResult: {
          notificationId: result.id,
          successCount: result.successfulDeliveries,
          failureCount: result.failedCount,
          totalRecipients: result.totalRecipients,
          deliveredAt: result.deliveredAt
        }
      };

      await db.job.update({
        where: { id: jobId },
        data: {
          paramsJson: JSON.stringify(updatedParams)
        }
      });

      logger.debug({
        jobId,
        notificationId: result.id
      }, 'Stored job notification record');
    } catch (error) {
      logger.error({
        jobId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to store job notification record');
    }
  }

  validate(params: any): boolean {
    if (!params || typeof params !== 'object') {
      return false;
    }

    // Required fields
    const required = ['type', 'recipients', 'message'];
    for (const field of required) {
      if (!(field in params)) {
        return false;
      }
    }

    // Validate type
    const validTypes = ['email', 'slack', 'webhook'];
    if (!validTypes.includes(params.type)) {
      return false;
    }

    // Validate recipients
    if (!Array.isArray(params.recipients) || params.recipients.length === 0) {
      return false;
    }

    // Validate message
    if (typeof params.message !== 'string' || params.message.trim() === '') {
      return false;
    }

    // Type-specific validation
    if (params.type === 'email' && !params.subject) {
      return false;
    }

    return true;
  }

  estimateTime(params: NotificationJobParams): number {
    let baseTime = 5; // 5 seconds base

    // Add time per recipient
    baseTime += params.recipients.length * 2; // 2 seconds per recipient

    // Add time based on notification type
    switch (params.type) {
      case 'email':
        baseTime += 10; // Email takes longer to process
        break;
      case 'slack':
        baseTime += 5;
        break;
      case 'webhook':
        baseTime += 3;
        break;
    }

    return Math.min(baseTime, 300); // Max 5 minutes
  }

  private async updateProgress(jobId: string, progress: number): Promise<void> {
    logger.debug({ jobId, progress }, 'Notification job progress updated');
  }
}