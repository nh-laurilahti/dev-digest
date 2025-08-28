/**
 * Notification Manager
 * Unified notification interface for all channels with delivery preferences and scheduling
 */

import { EmailService, EmailOptions, EmailResult } from './email';
import { SlackService, SlackMessage, SlackResult, SlackWorkspace } from './slack';
import { TemplateEngine } from './templates/template-engine';
import { logger } from '../lib/logger';
import { db } from '../db';
import { config } from '../lib/config';

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  enabled: boolean;
  config: Record<string, any>;
  priority: number;
}

export interface NotificationRecipient {
  id: number;
  email?: string;
  slackUserId?: string;
  slackWorkspaceId?: string;
  phoneNumber?: string;
  preferences: {
    channels: NotificationChannel[];
    frequency: 'immediate' | 'batched' | 'digest';
    quietHours?: {
      start: string; // HH:mm format
      end: string;
      timezone: string;
    };
    categories: string[];
    minimumSeverity?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface NotificationRequest {
  id?: string;
  type: string;
  category: 'digest' | 'alert' | 'system' | 'user' | 'job';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  recipients: NotificationRecipient[];
  channels?: ('email' | 'slack' | 'webhook' | 'sms')[];
  template?: string;
  templateData?: Record<string, any>;
  attachments?: NotificationAttachment[];
  scheduledFor?: Date;
  expiresAt?: Date;
  retryCount?: number;
  maxRetries?: number;
  metadata?: Record<string, any>;
}

export interface NotificationAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
  size: number;
}

export interface NotificationResult {
  id: string;
  success: boolean;
  deliveries: NotificationDelivery[];
  failedDeliveries: NotificationDelivery[];
  totalRecipients: number;
  successfulDeliveries: number;
  failedCount: number;
  error?: string;
  deliveredAt: Date;
  duration: number;
}

export interface NotificationDelivery {
  channel: 'email' | 'slack' | 'webhook' | 'sms';
  recipient: string;
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
}

export interface NotificationStats {
  totalSent: number;
  totalFailed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  avgDeliveryTime: number;
  channelStats: Record<string, {
    sent: number;
    failed: number;
    rate: number;
  }>;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    categories?: string[];
    severity?: string[];
    keywords?: string[];
    senders?: string[];
    timeRange?: {
      start: string;
      end: string;
      timezone: string;
    };
  };
  actions: {
    channels: string[];
    delay?: number;
    template?: string;
    escalation?: {
      after: number; // minutes
      channels: string[];
      recipients?: string[];
    };
  };
  isActive: boolean;
  priority: number;
  createdById: number;
}

export class NotificationManager {
  private emailService: EmailService;
  private slackService: SlackService;
  private templateEngine: TemplateEngine;
  private batchQueue: Map<string, NotificationRequest[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private rules: Map<string, NotificationRule> = new Map();

  constructor(
    emailService: EmailService,
    slackService: SlackService,
    templateEngine: TemplateEngine
  ) {
    this.emailService = emailService;
    this.slackService = slackService;
    this.templateEngine = templateEngine;
    this.startBatchProcessor();
    this.loadNotificationRules();
  }

  /**
   * Send notification to recipients
   */
  async sendNotification(request: NotificationRequest): Promise<NotificationResult> {
    const startTime = Date.now();
    const notificationId = request.id || this.generateNotificationId();
    
    try {
      logger.info({
        notificationId,
        type: request.type,
        category: request.category,
        severity: request.severity,
        recipientCount: request.recipients.length
      }, 'Processing notification request');

      // Apply notification rules
      const processedRequest = await this.applyNotificationRules(request);
      
      // Filter recipients based on preferences and rules
      const eligibleRecipients = await this.filterRecipients(processedRequest);
      
      if (eligibleRecipients.length === 0) {
        logger.warn({
          notificationId,
          originalCount: request.recipients.length
        }, 'No eligible recipients after filtering');

        // Fallback: if Slack is enabled, send to default channel
        const slackTokenPresent = Boolean(process.env.SLACK_BOT_TOKEN);
        const wantsSlack = !request.channels || request.channels.includes('slack');
        const fallbackChannel = process.env.SLACK_DEFAULT_CHANNEL || '#general';

        if (slackTokenPresent && wantsSlack) {
          try {
            // Ensure default workspace exists for fallback
            try {
              if (process.env.SLACK_BOT_TOKEN) {
                await this.slackService.addWorkspace({
                  id: 'default',
                  name: 'Default Workspace',
                  domain: 'slack',
                  botToken: process.env.SLACK_BOT_TOKEN!,
                  teamId: 'T_DEFAULT',
                  isActive: true,
                  installedAt: new Date(),
                  scopes: ['chat:write', 'files:write', 'users:read']
                } as SlackWorkspace);
              }
            } catch (e) {
              logger.warn({ error: e instanceof Error ? e.message : String(e) }, 'Failed to ensure default Slack workspace');
            }

            const slackResult = await this.slackService.sendMessage(
              'default',
              { channel: fallbackChannel, text: request.message },
              request.template,
              request.templateData
            );

            const delivery: NotificationDelivery = {
              channel: 'slack',
              recipient: fallbackChannel,
              success: slackResult.success,
              messageId: slackResult.messageId || ''
            } as NotificationDelivery;
            if (slackResult.success) {
              (delivery as any).deliveredAt = new Date();
            } else if (slackResult.error) {
              (delivery as any).error = slackResult.error;
            }
            const deliveries: NotificationDelivery[] = [delivery];

            // Store record and return
            await this.storeNotificationRecord(notificationId, {
              ...request,
              channels: ['slack']
            } as any, deliveries);

            return {
              id: notificationId,
              success: slackResult.success,
              deliveries,
              failedDeliveries: deliveries.filter(d => !d.success),
              totalRecipients: 1,
              successfulDeliveries: slackResult.success ? 1 : 0,
              failedCount: slackResult.success ? 0 : 1,
              deliveredAt: new Date(),
              duration: Date.now() - startTime
            };
          } catch (fallbackError) {
            logger.error({
              notificationId,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            }, 'Slack fallback delivery failed');
          }
        }
        
        return {
          id: notificationId,
          success: false,
          deliveries: [],
          failedDeliveries: [],
          totalRecipients: 0,
          successfulDeliveries: 0,
          failedCount: 0,
          error: 'No eligible recipients',
          deliveredAt: new Date(),
          duration: Date.now() - startTime
        };
      }

      // Check if notification should be batched
      if (this.shouldBatch(processedRequest, eligibleRecipients)) {
        await this.addToBatch(processedRequest, eligibleRecipients);
        
        return {
          id: notificationId,
          success: true,
          deliveries: [],
          failedDeliveries: [],
          totalRecipients: eligibleRecipients.length,
          successfulDeliveries: 0,
          failedCount: 0,
          deliveredAt: new Date(),
          duration: Date.now() - startTime
        };
      }

      // Check for scheduled delivery
      if (processedRequest.scheduledFor && processedRequest.scheduledFor > new Date()) {
        await this.scheduleNotification(processedRequest, eligibleRecipients);
        
        return {
          id: notificationId,
          success: true,
          deliveries: [],
          failedDeliveries: [],
          totalRecipients: eligibleRecipients.length,
          successfulDeliveries: 0,
          failedCount: 0,
          deliveredAt: new Date(),
          duration: Date.now() - startTime
        };
      }

      // Process immediate delivery
      const deliveries = await this.processDeliveries(processedRequest, eligibleRecipients);
      
      // Store notification record
      await this.storeNotificationRecord(notificationId, processedRequest, deliveries);
      
      const successfulDeliveries = deliveries.filter(d => d.success).length;
      const failedDeliveries = deliveries.filter(d => !d.success);
      
      const result: NotificationResult = {
        id: notificationId,
        success: successfulDeliveries > 0,
        deliveries: deliveries.filter(d => d.success),
        failedDeliveries,
        totalRecipients: eligibleRecipients.length,
        successfulDeliveries,
        failedCount: failedDeliveries.length,
        deliveredAt: new Date(),
        duration: Date.now() - startTime
      };

      if (failedDeliveries.length > 0) {
        result.error = `${failedDeliveries.length} deliveries failed`;
      }

      logger.info({
        notificationId,
        totalRecipients: result.totalRecipients,
        successfulDeliveries: result.successfulDeliveries,
        failedCount: result.failedCount,
        duration: result.duration
      }, 'Notification processing completed');

      return result;
    } catch (error) {
      logger.error({
        notificationId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to process notification');

      return {
        id: notificationId,
        success: false,
        deliveries: [],
        failedDeliveries: [],
        totalRecipients: request.recipients.length,
        successfulDeliveries: 0,
        failedCount: request.recipients.length,
        error: error instanceof Error ? error.message : String(error),
        deliveredAt: new Date(),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Process deliveries across all channels
   */
  private async processDeliveries(
    request: NotificationRequest,
    recipients: NotificationRecipient[]
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    
    // Group recipients by channel preference
    const channelGroups = this.groupRecipientsByChannel(recipients, request.channels);
    
    // Process each channel group
    for (const [channel, channelRecipients] of channelGroups.entries()) {
      try {
        const channelDeliveries = await this.processChannelDeliveries(
          channel,
          channelRecipients,
          request
        );
        deliveries.push(...channelDeliveries);
      } catch (error) {
        logger.error({
          channel,
          recipientCount: channelRecipients.length,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to process channel deliveries');
        
        // Add failed deliveries for this channel
        const failedDeliveries = channelRecipients.map(recipient => ({
          channel,
          recipient: this.getRecipientAddress(recipient, channel),
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }));
        deliveries.push(...failedDeliveries);
      }
    }
    
    return deliveries;
  }

  /**
   * Process deliveries for a specific channel
   */
  private async processChannelDeliveries(
    channel: 'email' | 'slack' | 'webhook' | 'sms',
    recipients: NotificationRecipient[],
    request: NotificationRequest
  ): Promise<NotificationDelivery[]> {
    switch (channel) {
      case 'email':
        return await this.processEmailDeliveries(recipients, request);
      case 'slack':
        return await this.processSlackDeliveries(recipients, request);
      case 'webhook':
        return await this.processWebhookDeliveries(recipients, request);
      case 'sms':
        return await this.processSmsDeliveries(recipients, request);
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  /**
   * Process email deliveries
   */
  private async processEmailDeliveries(
    recipients: NotificationRecipient[],
    request: NotificationRequest
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    
    for (const recipient of recipients) {
      if (!recipient.email) {
        deliveries.push({
          channel: 'email',
          recipient: `user_${recipient.id}`,
          success: false,
          error: 'No email address available'
        });
        continue;
      }
      
      try {
        const emailOptions: EmailOptions = {
          to: recipient.email,
          subject: request.title,
          text: request.message,
          template: request.template,
          templateData: request.templateData,
          attachments: request.attachments?.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType
          }))
        };
        
        const result: EmailResult = await this.emailService.sendEmail(emailOptions);
        
        deliveries.push({
          channel: 'email',
          recipient: recipient.email,
          success: result.success,
          messageId: result.messageId || '',
          error: result.error || undefined,
          deliveredAt: result.success ? new Date() : undefined
        } as any);
      } catch (error) {
        deliveries.push({
          channel: 'email',
          recipient: recipient.email,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return deliveries;
  }

  /**
   * Process Slack deliveries
   */
  private async processSlackDeliveries(
    recipients: NotificationRecipient[],
    request: NotificationRequest
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    
    // Group recipients by workspace
    const workspaceGroups = new Map<string, NotificationRecipient[]>();
    
    for (const recipient of recipients) {
      // For test notifications, allow using channel from template data
      const isTestNotification = request.templateData?.is_test === true;
      const testSlackChannel = request.templateData?.slack_channel;
      
      if (!recipient.slackUserId && !recipient.slackWorkspaceId && !isTestNotification) {
        deliveries.push({
          channel: 'slack',
          recipient: `user_${recipient.id}`,
          success: false,
          error: 'No Slack user ID or workspace ID available'
        });
        continue;
      }
      
      // Use test workspace or recipient's workspace
      const workspaceId = recipient.slackWorkspaceId || (isTestNotification ? 'test-workspace' : '');
      if (!workspaceId) {
        deliveries.push({
          channel: 'slack',
          recipient: `user_${recipient.id}`,
          success: false,
          error: 'No workspace ID available'
        });
        continue;
      }
      
      if (!workspaceGroups.has(workspaceId)) {
        workspaceGroups.set(workspaceId, []);
      }
      workspaceGroups.get(workspaceId)!.push(recipient);
    }
    
    // Process each workspace group
    for (const [workspaceId, workspaceRecipients] of workspaceGroups.entries()) {
      for (const recipient of workspaceRecipients) {
        try {
          // For test notifications, use the test channel; otherwise use user ID
          const isTestNotification = request.templateData?.is_test === true;
          const testSlackChannel = request.templateData?.slack_channel;
          
          const slackMessage: SlackMessage = {
            channel: (isTestNotification && testSlackChannel) ? testSlackChannel : recipient.slackUserId!,
            text: request.message
          };
          
          const result: SlackResult = await this.slackService.sendMessage(
            workspaceId,
            slackMessage,
            request.template,
            request.templateData
          );
          
          deliveries.push({
            channel: 'slack',
            recipient: recipient.slackUserId!,
            success: result.success,
            messageId: result.messageId || '',
            error: result.error || undefined,
            deliveredAt: result.success ? new Date() : undefined
          } as any);
        } catch (error) {
          deliveries.push({
            channel: 'slack',
            recipient: recipient.slackUserId!,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    
    return deliveries;
  }

  /**
   * Process webhook deliveries
   */
  private async processWebhookDeliveries(
    recipients: NotificationRecipient[],
    request: NotificationRequest
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    
    for (const recipient of recipients) {
      const webhookUrl = recipient.preferences.channels
        .find(c => c.type === 'webhook')?.config?.url;
        
      if (!webhookUrl) {
        deliveries.push({
          channel: 'webhook',
          recipient: `user_${recipient.id}`,
          success: false,
          error: 'No webhook URL configured'
        });
        continue;
      }
      
      try {
        const payload = {
          id: request.id,
          type: request.type,
          category: request.category,
          severity: request.severity,
          title: request.title,
          message: request.message,
          timestamp: new Date().toISOString(),
          metadata: request.metadata
        };
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Daily-Dev-Digest/1.0'
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        deliveries.push({
          channel: 'webhook',
          recipient: webhookUrl,
          success: true,
          messageId: `webhook_${Date.now()}`,
          deliveredAt: new Date()
        });
      } catch (error) {
        deliveries.push({
          channel: 'webhook',
          recipient: webhookUrl,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return deliveries;
  }

  /**
   * Process SMS deliveries (placeholder implementation)
   */
  private async processSmsDeliveries(
    recipients: NotificationRecipient[],
    request: NotificationRequest
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    
    for (const recipient of recipients) {
      // SMS implementation would go here
      deliveries.push({
        channel: 'sms',
        recipient: recipient.phoneNumber || `user_${recipient.id}`,
        success: false,
        error: 'SMS delivery not implemented'
      });
    }
    
    return deliveries;
  }

  /**
   * Filter recipients based on preferences and rules
   */
  private async filterRecipients(
    request: NotificationRequest
  ): Promise<NotificationRecipient[]> {
    const filtered: NotificationRecipient[] = [];
    
    for (const recipient of request.recipients) {
      // Check if recipient has opted out of this category
      if (!recipient.preferences.categories.includes(request.category)) {
        logger.debug({
          recipientId: recipient.id,
          category: request.category
        }, 'Recipient filtered out by category preference');
        continue;
      }
      
      // Check minimum severity level
      if (recipient.preferences.minimumSeverity) {
        const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
        const minLevel = severityLevels[recipient.preferences.minimumSeverity];
        const requestLevel = severityLevels[request.severity];
        
        if (requestLevel < minLevel) {
          logger.debug({
            recipientId: recipient.id,
            requestSeverity: request.severity,
            minimumSeverity: recipient.preferences.minimumSeverity
          }, 'Recipient filtered out by severity level');
          continue;
        }
      }
      
      // Check quiet hours
      if (recipient.preferences.quietHours && this.isInQuietHours(recipient.preferences.quietHours)) {
        // For critical notifications, override quiet hours
        if (request.severity !== 'critical') {
          logger.debug({
            recipientId: recipient.id
          }, 'Recipient filtered out by quiet hours');
          continue;
        }
      }
      
      // Check if recipient has any enabled channels
      const enabledChannels = recipient.preferences.channels.filter(c => c.enabled);
      if (enabledChannels.length === 0) {
        logger.debug({
          recipientId: recipient.id
        }, 'Recipient has no enabled notification channels');
        continue;
      }
      
      filtered.push(recipient);
    }
    
    return filtered;
  }

  /**
   * Check if current time is within quiet hours
   */
  private isInQuietHours(quietHours: { start: string; end: string; timezone: string }): boolean {
    try {
      const now = new Date();
      const timezone = quietHours.timezone || 'UTC';
      
      // Convert current time to recipient's timezone
      const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);
      
      const [currentHour, currentMinute] = localTime.split(':').map(Number);
      const currentMinutes = (currentHour ?? 0) * 60 + (currentMinute ?? 0);
      
      const [startHour, startMinute] = quietHours.start.split(':').map(Number);
      const startMinutes = (startHour ?? 0) * 60 + (startMinute ?? 0);
      
      const [endHour, endMinute] = quietHours.end.split(':').map(Number);
      const endMinutes = (endHour ?? 0) * 60 + (endMinute ?? 0);
      
      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
      } else {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
    } catch (error) {
      logger.warn({
        quietHours,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to check quiet hours, allowing notification');
      return false;
    }
  }

  /**
   * Group recipients by their preferred channels
   */
  private groupRecipientsByChannel(
    recipients: NotificationRecipient[],
    requestChannels?: string[]
  ): Map<'email' | 'slack' | 'webhook' | 'sms', NotificationRecipient[]> {
    const groups = new Map<'email' | 'slack' | 'webhook' | 'sms', NotificationRecipient[]>();
    
    for (const recipient of recipients) {
      const enabledChannels = recipient.preferences.channels
        .filter(c => c.enabled)
        .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)
      
      for (const channelConfig of enabledChannels) {
        const channelType = channelConfig.type;
        
        // Skip if this channel is not requested
        if (requestChannels && !requestChannels.includes(channelType)) {
          continue;
        }
        
        if (!groups.has(channelType)) {
          groups.set(channelType, []);
        }
        
        groups.get(channelType)!.push(recipient);
        break; // Only use highest priority channel
      }
    }
    
    return groups;
  }

  /**
   * Get recipient address for a specific channel
   */
  private getRecipientAddress(
    recipient: NotificationRecipient,
    channel: 'email' | 'slack' | 'webhook' | 'sms'
  ): string {
    switch (channel) {
      case 'email':
        return recipient.email || `user_${recipient.id}`;
      case 'slack':
        return recipient.slackUserId || `user_${recipient.id}`;
      case 'webhook':
        const webhookUrl = recipient.preferences.channels
          .find(c => c.type === 'webhook')?.config?.url;
        return webhookUrl || `user_${recipient.id}`;
      case 'sms':
        return recipient.phoneNumber || `user_${recipient.id}`;
      default:
        return `user_${recipient.id}`;
    }
  }

  /**
   * Apply notification rules to modify request
   */
  private async applyNotificationRules(
    request: NotificationRequest
  ): Promise<NotificationRequest> {
    const applicableRules = Array.from(this.rules.values())
      .filter(rule => rule.isActive && this.ruleMatches(rule, request))
      .sort((a, b) => b.priority - a.priority);
    
    let processedRequest = { ...request };
    
    for (const rule of applicableRules) {
      // Apply rule actions
      if (rule.actions.channels) {
        processedRequest.channels = rule.actions.channels as any;
      }
      
      if (rule.actions.delay) {
        const scheduledFor = new Date(Date.now() + rule.actions.delay * 60000);
        processedRequest.scheduledFor = scheduledFor;
      }
      
      if (rule.actions.template) {
        processedRequest.template = rule.actions.template;
      }
      
      logger.debug({
        ruleId: rule.id,
        ruleName: rule.name,
        notificationType: request.type
      }, 'Applied notification rule');
    }
    
    return processedRequest;
  }

  /**
   * Check if a rule matches the notification request
   */
  private ruleMatches(rule: NotificationRule, request: NotificationRequest): boolean {
    const conditions = rule.conditions;
    
    // Check categories
    if (conditions.categories && !conditions.categories.includes(request.category)) {
      return false;
    }
    
    // Check severity
    if (conditions.severity && !conditions.severity.includes(request.severity)) {
      return false;
    }
    
    // Check keywords
    if (conditions.keywords) {
      const content = `${request.title} ${request.message}`.toLowerCase();
      const hasKeyword = conditions.keywords.some(keyword => 
        content.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }
    
    // Check time range
    if (conditions.timeRange) {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', { 
        timeZone: conditions.timeRange.timezone,
        hour12: false 
      });
      
      if (currentTime < conditions.timeRange.start || currentTime > conditions.timeRange.end) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if notification should be batched
   */
  private shouldBatch(request: NotificationRequest, recipients: NotificationRecipient[]): boolean {
    // Don't batch critical notifications
    if (request.severity === 'critical') {
      return false;
    }
    
    // Check if any recipient prefers batched delivery
    return recipients.some(r => r.preferences.frequency === 'batched');
  }

  /**
   * Add notification to batch queue
   */
  private async addToBatch(
    request: NotificationRequest,
    recipients: NotificationRecipient[]
  ): Promise<void> {
    const batchKey = this.getBatchKey(request);
    
    if (!this.batchQueue.has(batchKey)) {
      this.batchQueue.set(batchKey, []);
    }
    
    this.batchQueue.get(batchKey)!.push({ ...request, recipients });
    
    logger.debug({
      batchKey,
      queueSize: this.batchQueue.get(batchKey)!.length
    }, 'Added notification to batch queue');
  }

  /**
   * Get batch key for grouping notifications
   */
  private getBatchKey(request: NotificationRequest): string {
    return `${request.category}_${request.type}`;
  }

  /**
   * Start batch processor
   */
  private startBatchProcessor(): void {
    const batchInterval = (config as any).notifications?.batchInterval || 300000; // 5 minutes
    
    this.batchTimer = setInterval(() => {
      this.processBatches().catch(error => {
        logger.error({
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to process notification batches');
      });
    }, batchInterval);
    
    logger.info({ batchInterval }, 'Batch processor started');
  }

  /**
   * Process queued batches
   */
  private async processBatches(): Promise<void> {
    if (this.batchQueue.size === 0) {
      return;
    }
    
    logger.info({
      batchCount: this.batchQueue.size
    }, 'Processing notification batches');
    
    for (const [batchKey, requests] of this.batchQueue.entries()) {
      try {
        await this.processBatch(batchKey, requests);
        this.batchQueue.delete(batchKey);
      } catch (error) {
        logger.error({
          batchKey,
          requestCount: requests.length,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to process batch');
      }
    }
  }

  /**
   * Process a single batch
   */
  private async processBatch(batchKey: string, requests: NotificationRequest[]): Promise<void> {
    // Combine similar notifications into a digest
    const combinedRequest = this.combineNotifications(requests);
    
    // Get all unique recipients
    const allRecipients = Array.from(
      new Map(
        requests.flatMap(r => r.recipients)
          .map(recipient => [recipient.id, recipient])
      ).values()
    );
    
    // Send the combined notification
    await this.sendNotification({
      ...combinedRequest,
      recipients: allRecipients
    });
    
    logger.info({
      batchKey,
      originalCount: requests.length,
      recipientCount: allRecipients.length
    }, 'Processed notification batch');
  }

  /**
   * Combine multiple notifications into a single digest
   */
  private combineNotifications(requests: NotificationRequest[]): NotificationRequest {
    const first = requests[0];
    const count = requests.length;
    
    return {
      ...first,
      title: `${count} ${first.category} notifications`,
      message: requests.map(r => `• ${r.title}`).join('\n'),
      template: 'batch_digest',
      templateData: {
        notifications: requests.map(r => ({
          title: r.title,
          message: r.message,
          severity: r.severity,
          timestamp: new Date()
        })),
        count
      }
    };
  }

  /**
   * Schedule notification for later delivery
   */
  private async scheduleNotification(
    request: NotificationRequest,
    recipients: NotificationRecipient[]
  ): Promise<void> {
    // Store in database for scheduled processing
    await db.scheduledNotification.create({
      data: {
        id: request.id!,
        type: request.type,
        category: request.category,
        severity: request.severity,
        title: request.title,
        message: request.message,
        recipients: JSON.stringify(recipients.map(r => r.id)),
        scheduledFor: request.scheduledFor!,
        requestData: JSON.stringify(request)
      }
    });
    
    logger.info({
      notificationId: request.id,
      scheduledFor: request.scheduledFor
    }, 'Notification scheduled for later delivery');
  }

  /**
   * Store notification record in database
   */
  private async storeNotificationRecord(
    id: string,
    request: NotificationRequest,
    deliveries: NotificationDelivery[]
  ): Promise<void> {
    try {
      const channels = JSON.stringify(request.channels || Array.from(new Set(deliveries.map(d => d.channel))));
      const anySuccess = deliveries.some(d => d.success);
      const failedCount = deliveries.filter(d => !d.success).length;
      const errorSummary = deliveries
        .filter(d => !d.success && (d as any).error)
        .map(d => (d as any).error as string)
        .join('; ');

      const metadata = JSON.stringify({
        id,
        title: request.title,
        message: request.message,
        category: request.category,
        severity: request.severity,
        recipientCount: request.recipients.length,
        successfulDeliveries: deliveries.filter(d => d.success).length,
        deliveries
      });

      await db.notificationRecord.create({
        data: {
          type: request.type,
          channels,
          recipientId: null,
          digestId: (request.metadata as any)?.digestId ?? undefined,
          status: anySuccess ? 'sent' : 'failed',
          failedDeliveries: failedCount,
          deliveredAt: anySuccess ? new Date() : null,
          error: errorSummary || null,
          metadata
        }
      });
    } catch (error) {
      logger.error({
        notificationId: id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to store notification record');
    }
  }

  /**
   * Load notification rules from database
   */
  private async loadNotificationRules(): Promise<void> {
    try {
      const rules = await db.notificationRule.findMany({
        where: { enabled: true }
      });
      
      for (const rule of rules) {
        this.rules.set(rule.id, {
          id: rule.id,
          name: rule.name,
          description: rule.description || '',
          conditions: JSON.parse(rule.conditions),
          actions: JSON.parse(rule.actions),
          isActive: rule.isActive,
          priority: rule.priority,
          createdById: rule.createdById
        });
      }
      
      logger.info({
        ruleCount: this.rules.size
      }, 'Notification rules loaded');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to load notification rules');
    }
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get notification statistics
   */
  async getStats(dateFrom?: Date, dateTo?: Date): Promise<NotificationStats> {
    try {
      const whereClause = dateFrom && dateTo ? {
        createdAt: {
          gte: dateFrom,
          lte: dateTo
        }
      } : {};
      
      const [records, emailStats] = await Promise.all([
        db.notificationRecord.findMany({ where: whereClause }),
        this.emailService.getDeliveryStats(dateFrom, dateTo)
      ]);
      
      const totalSent = records.reduce((sum, r) => sum + r.successfulDeliveries, 0);
      const totalFailed = records.reduce((sum, r) => sum + r.failedDeliveries, 0);
      
      return {
        totalSent,
        totalFailed,
        deliveryRate: totalSent / (totalSent + totalFailed) * 100,
        openRate: emailStats.opened / emailStats.sent * 100,
        clickRate: emailStats.clicked / emailStats.sent * 100,
        avgDeliveryTime: 0, // Would need to track delivery times
        channelStats: {
          email: {
            sent: emailStats.sent,
            failed: emailStats.failed,
            rate: emailStats.sent / (emailStats.sent + emailStats.failed) * 100
          }
          // Add other channels as needed
        }
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get notification stats');
      
      return {
        totalSent: 0,
        totalFailed: 0,
        deliveryRate: 0,
        openRate: 0,
        clickRate: 0,
        avgDeliveryTime: 0,
        channelStats: {}
      };
    }
  }

  /**
   * Shutdown notification manager
   */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Process any remaining batches
    await this.processBatches();
    
    // Close services
    await Promise.all([
      this.emailService.close(),
      this.slackService.close()
    ]);
    
    logger.info('Notification manager shutdown complete');
  }
}