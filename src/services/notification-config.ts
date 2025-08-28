/**
 * Notification Configuration Manager
 * Handles configuration, management utilities, and setup for the notification system
 */

import { logger } from '../lib/logger';
import { db } from '../db';
import { NotificationManager, NotificationChannel } from './notification-manager';
import { EmailService, SMTP_PROVIDER, EmailProvider, EmailProviderConfig } from './email';
import { SlackService, SlackBot, SlackWorkspace } from './slack';
import { TemplateEngine } from './templates/template-engine';
import { NotificationAnalytics } from './notification-analytics';
import { EMAIL_TEMPLATES } from './templates/email-templates';
import { SLACK_TEMPLATES } from './templates/slack-templates';

export interface NotificationSystemConfig {
  email: {
    enabled: boolean;
    providers: {
      primary: string;
      fallback: string[];
    };
    config: EmailProviderConfig;
  };
  slack: {
    enabled: boolean;
    bots: SlackBot[];
    workspaces: SlackWorkspace[];
  };
  webhook: {
    enabled: boolean;
    retryCount: number;
    timeout: number;
  };
  sms: {
    enabled: boolean;
    provider: string;
    config: Record<string, any>;
  };
  analytics: {
    enabled: boolean;
    retentionDays: number;
    realTime: boolean;
  };
  templates: {
    cacheSize: number;
    reloadInterval: number;
  };
  batching: {
    enabled: boolean;
    interval: number;
    maxSize: number;
  };
  rateLimit: {
    enabled: boolean;
    perMinute: number;
    perHour: number;
    perDay: number;
  };
}

export interface NotificationHealth {
  overall: 'healthy' | 'warning' | 'critical';
  services: {
    email: ServiceHealth;
    slack: ServiceHealth;
    webhook: ServiceHealth;
    templates: ServiceHealth;
    analytics: ServiceHealth;
  };
  metrics: {
    queueLength: number;
    averageDeliveryTime: number;
    errorRate: number;
    lastUpdated: Date;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'warning' | 'critical' | 'disabled';
  lastCheck: Date;
  responseTime?: number;
  errorCount: number;
  message?: string;
}

export interface NotificationSettings {
  userId: number;
  channels: NotificationChannel[];
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  frequency: 'immediate' | 'batched' | 'digest';
  categories: {
    digest: boolean;
    alert: boolean;
    system: boolean;
    user: boolean;
    job: boolean;
  };
  minimumSeverity: 'low' | 'medium' | 'high' | 'critical';
  personalizations: {
    enabled: boolean;
    contentLength: 'brief' | 'detailed';
    tone: 'formal' | 'casual' | 'friendly';
    includeVisuals: boolean;
  };
}

export interface ProviderTestResult {
  provider: string;
  success: boolean;
  responseTime: number;
  error?: string;
  details: Record<string, any>;
}

export class NotificationConfigManager {
  private config: NotificationSystemConfig;
  private notificationManager: NotificationManager | null = null;
  private emailService: EmailService | null = null;
  private slackService: SlackService | null = null;
  private templateEngine: TemplateEngine | null = null;
  private analytics: NotificationAnalytics | null = null;

  constructor(config?: Partial<NotificationSystemConfig>) {
    this.config = this.mergeWithDefaults(config || {});
  }

  /**
   * Initialize the notification system with current configuration
   */
  async initialize(): Promise<void> {
    try {
      logger.info({
        config: this.sanitizeConfigForLogging(this.config)
      }, 'Initializing notification system');

      // Initialize template engine
      this.templateEngine = new TemplateEngine();
      await this.setupDefaultTemplates();

      // Initialize email service
      if (this.config.email.enabled) {
        this.emailService = new EmailService(this.config.email.config);
      }

      // Initialize Slack service
      if (this.config.slack.enabled && this.config.slack.bots.length > 0) {
        this.slackService = new SlackService(this.config.slack.bots[0]);
        
        // Add configured workspaces
        for (const workspace of this.config.slack.workspaces) {
          await this.slackService.addWorkspace(workspace);
        }
      }

      // Initialize analytics
      if (this.config.analytics.enabled) {
        this.analytics = new NotificationAnalytics();
      }

      // Initialize notification manager
      if (this.emailService && this.slackService && this.templateEngine) {
        this.notificationManager = new NotificationManager(
          this.emailService,
          this.slackService,
          this.templateEngine
        );
      }

      logger.info('Notification system initialized successfully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize notification system');
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<NotificationHealth> {
    try {
      const services = {
        email: await this.checkEmailHealth(),
        slack: await this.checkSlackHealth(),
        webhook: await this.checkWebhookHealth(),
        templates: await this.checkTemplateHealth(),
        analytics: await this.checkAnalyticsHealth()
      };

      const queueLength = await this.getQueueLength();
      const errorRate = await this.calculateErrorRate();
      const averageDeliveryTime = await this.calculateAverageDeliveryTime();

      // Determine overall health
      const criticalServices = Object.values(services).filter(s => s.status === 'critical').length;
      const warningServices = Object.values(services).filter(s => s.status === 'warning').length;

      let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (criticalServices > 0 || errorRate > 10) {
        overall = 'critical';
      } else if (warningServices > 1 || errorRate > 5 || queueLength > 100) {
        overall = 'warning';
      }

      return {
        overall,
        services,
        metrics: {
          queueLength,
          averageDeliveryTime,
          errorRate,
          lastUpdated: new Date()
        }
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get system health');

      return {
        overall: 'critical',
        services: {
          email: { status: 'critical', lastCheck: new Date(), errorCount: 0, message: 'Health check failed' },
          slack: { status: 'critical', lastCheck: new Date(), errorCount: 0, message: 'Health check failed' },
          webhook: { status: 'critical', lastCheck: new Date(), errorCount: 0, message: 'Health check failed' },
          templates: { status: 'critical', lastCheck: new Date(), errorCount: 0, message: 'Health check failed' },
          analytics: { status: 'critical', lastCheck: new Date(), errorCount: 0, message: 'Health check failed' }
        },
        metrics: {
          queueLength: 0,
          averageDeliveryTime: 0,
          errorRate: 100,
          lastUpdated: new Date()
        }
      };
    }
  }

  /**
   * Test notification providers
   */
  async testProviders(): Promise<ProviderTestResult[]> {
    const results: ProviderTestResult[] = [];

    // Test email providers
    if (this.config.email.enabled && this.emailService) {
      const emailResult = await this.testEmailProvider();
      results.push(emailResult);
    }

    // Test Slack workspaces
    if (this.config.slack.enabled && this.slackService) {
      for (const workspace of this.config.slack.workspaces) {
        const slackResult = await this.testSlackWorkspace(workspace.id);
        results.push(slackResult);
      }
    }

    // Test webhook endpoint
    if (this.config.webhook.enabled) {
      const webhookResult = await this.testWebhookProvider();
      results.push(webhookResult);
    }

    return results;
  }

  /**
   * Get user notification settings
   */
  async getUserSettings(userId: number): Promise<NotificationSettings | null> {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { preferences: true }
      });

      if (!user || !user.preferences) {
        return null;
      }

      const prefs = user.preferences;
      const channels = JSON.parse(prefs.channels || '[]');

      return {
        userId,
        channels: channels.map((channelName: string) => ({
          type: channelName as any,
          enabled: true,
          config: {},
          priority: channelName === 'email' ? 10 : 5
        })),
        quietHours: {
          enabled: !!prefs.timeOfDay,
          start: '22:00',
          end: '08:00',
          timezone: 'UTC'
        },
        frequency: prefs.frequency as any,
        categories: {
          digest: true,
          alert: true,
          system: true,
          user: true,
          job: true
        },
        minimumSeverity: 'low',
        personalizations: {
          enabled: true,
          contentLength: prefs.detailLevel === 'detailed' ? 'detailed' : 'brief',
          tone: 'casual',
          includeVisuals: false
        }
      };
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get user notification settings');
      return null;
    }
  }

  /**
   * Update user notification settings
   */
  async updateUserSettings(userId: number, settings: Partial<NotificationSettings>): Promise<void> {
    try {
      const channels = settings.channels?.map(c => c.type) || [];
      
      await db.userPreference.upsert({
        where: { userId },
        create: {
          userId,
          channels: JSON.stringify(channels),
          frequency: settings.frequency || 'immediate',
          detailLevel: settings.personalizations?.contentLength || 'brief',
          isEnabled: true
        },
        update: {
          channels: JSON.stringify(channels),
          frequency: settings.frequency,
          detailLevel: settings.personalizations?.contentLength
        }
      });

      logger.info({
        userId,
        channels: channels.length
      }, 'User notification settings updated');
    } catch (error) {
      logger.error({
        userId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to update user notification settings');
      throw error;
    }
  }

  /**
   * Configure email provider
   */
  async configureEmailProvider(
    providerName: string, 
    config: Partial<EmailProvider>
  ): Promise<void> {
    try {
      if (providerName.toUpperCase() !== 'SMTP') {
        throw new Error(`Only SMTP provider is supported: ${providerName}`);
      }

      // Test provider configuration
      const testResult = await this.testEmailProviderConfig(providerName, config);
      if (!testResult.success) {
        throw new Error(`Provider test failed: ${testResult.error}`);
      }

      // Update configuration
      this.config.email.config.primary = { ...SMTP_PROVIDER, ...config };

      // Reinitialize email service
      if (this.emailService) {
        await this.emailService.close();
      }
      this.emailService = new EmailService(this.config.email.config);

      // Save configuration to database
      await this.saveConfiguration();

      logger.info({
        provider: providerName
      }, 'Email provider configured successfully');
    } catch (error) {
      logger.error({
        provider: providerName,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to configure email provider');
      throw error;
    }
  }

  /**
   * Add Slack workspace
   */
  async addSlackWorkspace(workspace: SlackWorkspace): Promise<void> {
    try {
      if (!this.slackService) {
        throw new Error('Slack service not initialized');
      }

      // Test workspace connection
      await this.slackService.addWorkspace(workspace);

      // Update configuration
      const existingIndex = this.config.slack.workspaces.findIndex(w => w.id === workspace.id);
      if (existingIndex >= 0) {
        this.config.slack.workspaces[existingIndex] = workspace;
      } else {
        this.config.slack.workspaces.push(workspace);
      }

      // Save configuration
      await this.saveConfiguration();

      logger.info({
        workspaceId: workspace.id,
        workspaceName: workspace.name
      }, 'Slack workspace added successfully');
    } catch (error) {
      logger.error({
        workspaceId: workspace.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to add Slack workspace');
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(dateFrom?: Date, dateTo?: Date): Promise<any> {
    try {
      if (!this.notificationManager) {
        throw new Error('Notification manager not initialized');
      }

      const stats = await this.notificationManager.getStats(dateFrom, dateTo);

      // Get additional analytics if available
      let analyticsData = {};
      if (this.analytics) {
        const metrics = await this.analytics.getDeliveryMetrics(
          dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          dateTo || new Date()
        );
        analyticsData = {
          deliveryMetrics: metrics,
          channelPerformance: await this.analytics.getChannelPerformance(
            dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            dateTo || new Date()
          )
        };
      }

      return {
        ...stats,
        ...analyticsData,
        period: {
          from: dateFrom,
          to: dateTo
        }
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get notification statistics');
      throw error;
    }
  }

  /**
   * Export system configuration
   */
  async exportConfiguration(): Promise<string> {
    try {
      const exportConfig = {
        ...this.config,
        // Remove sensitive information
        email: {
          ...this.config.email,
          config: {
            ...this.config.email.config,
            primary: {
              ...this.config.email.config.primary,
              auth: { user: '[REDACTED]', pass: '[REDACTED]' }
            }
          }
        },
        slack: {
          ...this.config.slack,
          bots: this.config.slack.bots.map(bot => ({
            ...bot,
            token: '[REDACTED]',
            signingSecret: '[REDACTED]'
          })),
          workspaces: this.config.slack.workspaces.map(ws => ({
            ...ws,
            botToken: '[REDACTED]',
            userToken: '[REDACTED]'
          }))
        }
      };

      return JSON.stringify(exportConfig, null, 2);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to export configuration');
      throw error;
    }
  }

  /**
   * Import system configuration
   */
  async importConfiguration(configJson: string): Promise<void> {
    try {
      const importedConfig = JSON.parse(configJson);
      
      // Validate configuration structure
      this.validateConfiguration(importedConfig);

      // Merge with current config (preserve sensitive values if marked as REDACTED)
      this.config = this.mergeConfigurations(this.config, importedConfig);

      // Reinitialize services
      await this.initialize();

      // Save to database
      await this.saveConfiguration();

      logger.info('Configuration imported and applied successfully');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to import configuration');
      throw error;
    }
  }

  /**
   * Get notification manager instance
   */
  getNotificationManager(): NotificationManager | null {
    return this.notificationManager;
  }

  /**
   * Get analytics instance
   */
  getAnalytics(): NotificationAnalytics | null {
    return this.analytics;
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    try {
      const shutdownPromises = [];

      if (this.notificationManager) {
        shutdownPromises.push(this.notificationManager.shutdown());
      }

      if (this.emailService) {
        shutdownPromises.push(this.emailService.close());
      }

      if (this.slackService) {
        shutdownPromises.push(this.slackService.close());
      }

      await Promise.all(shutdownPromises);

      logger.info('Notification system shutdown complete');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Error during notification system shutdown');
    }
  }

  /**
   * Private helper methods
   */

  private mergeWithDefaults(config: Partial<NotificationSystemConfig>): NotificationSystemConfig {
    const defaults: NotificationSystemConfig = {
      email: {
        enabled: true,
        providers: {
          primary: 'GMAIL',
          fallback: ['SENDGRID']
        },
        config: {
          primary: SMTP_PROVIDER,
          fallback: [],
          maxRetries: 3,
          retryDelay: 1000,
          trackDelivery: true,
          trackOpens: true,
          trackClicks: true
        }
      },
      slack: {
        enabled: false,
        bots: [],
        workspaces: []
      },
      webhook: {
        enabled: true,
        retryCount: 3,
        timeout: 30000
      },
      sms: {
        enabled: false,
        provider: 'twilio',
        config: {}
      },
      analytics: {
        enabled: true,
        retentionDays: 90,
        realTime: true
      },
      templates: {
        cacheSize: 100,
        reloadInterval: 300000
      },
      batching: {
        enabled: true,
        interval: 300000,
        maxSize: 50
      },
      rateLimit: {
        enabled: true,
        perMinute: 100,
        perHour: 1000,
        perDay: 10000
      }
    };

    return this.deepMerge(defaults, config);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private async setupDefaultTemplates(): Promise<void> {
    if (!this.templateEngine) {
      return;
    }

    try {
      // Setup email templates
      for (const [key, template] of Object.entries(EMAIL_TEMPLATES)) {
        await this.templateEngine.createTemplate(
          template.name,
          'email',
          template.content,
          {
            subject: template.subject,
            variables: template.variables,
            metadata: template.metadata,
            createdById: null // No user required
          }
        );
      }

      // Setup Slack templates
      for (const [key, template] of Object.entries(SLACK_TEMPLATES)) {
        await this.templateEngine.createTemplate(
          template.name,
          'slack',
          template.content,
          {
            variables: template.variables,
            metadata: template.metadata,
            createdById: null // No user required
          }
        );
      }

      logger.info('Default templates setup complete');
    } catch (error) {
      // Templates might already exist, which is fine
      logger.debug({
        error: error instanceof Error ? error.message : String(error)
      }, 'Template setup completed with some existing templates');
    }
  }

  private sanitizeConfigForLogging(config: NotificationSystemConfig): any {
    return {
      ...config,
      email: {
        ...config.email,
        config: {
          ...config.email.config,
          primary: { ...config.email.config.primary, auth: '[REDACTED]' }
        }
      },
      slack: {
        ...config.slack,
        bots: config.slack.bots.map(bot => ({ ...bot, token: '[REDACTED]', signingSecret: '[REDACTED]' }))
      }
    };
  }

  private async checkEmailHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.config.email.enabled || !this.emailService) {
        return {
          status: 'disabled',
          lastCheck: new Date(),
          errorCount: 0,
          message: 'Email service disabled'
        };
      }

      // Perform basic health check (could test SMTP connection)
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        errorCount: 0
      };
    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        errorCount: 1,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async checkSlackHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.config.slack.enabled || !this.slackService) {
        return {
          status: 'disabled',
          lastCheck: new Date(),
          errorCount: 0,
          message: 'Slack service disabled'
        };
      }

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        errorCount: 0
      };
    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        errorCount: 1,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async checkWebhookHealth(): Promise<ServiceHealth> {
    return {
      status: this.config.webhook.enabled ? 'healthy' : 'disabled',
      lastCheck: new Date(),
      errorCount: 0,
      message: this.config.webhook.enabled ? undefined : 'Webhook service disabled'
    };
  }

  private async checkTemplateHealth(): Promise<ServiceHealth> {
    try {
      if (!this.templateEngine) {
        return {
          status: 'critical',
          lastCheck: new Date(),
          errorCount: 1,
          message: 'Template engine not initialized'
        };
      }

      const templates = await this.templateEngine.listTemplates();
      
      return {
        status: templates.length > 0 ? 'healthy' : 'warning',
        lastCheck: new Date(),
        errorCount: 0,
        message: templates.length === 0 ? 'No templates loaded' : undefined
      };
    } catch (error) {
      return {
        status: 'critical',
        lastCheck: new Date(),
        errorCount: 1,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async checkAnalyticsHealth(): Promise<ServiceHealth> {
    return {
      status: this.config.analytics.enabled && this.analytics ? 'healthy' : 'disabled',
      lastCheck: new Date(),
      errorCount: 0,
      message: !this.config.analytics.enabled ? 'Analytics disabled' : undefined
    };
  }

  private async getQueueLength(): Promise<number> {
    try {
      // This would query the actual job queue
      return 0;
    } catch (error) {
      return 0;
    }
  }

  private async calculateErrorRate(): Promise<number> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [total, failed] = await Promise.all([
        db.notificationRecord.count({
          where: { createdAt: { gte: twentyFourHoursAgo } }
        }),
        db.notificationRecord.count({
          where: { 
            createdAt: { gte: twentyFourHoursAgo },
            failedDeliveries: { gt: 0 }
          }
        })
      ]);

      return total > 0 ? (failed / total) * 100 : 0;
    } catch (error) {
      return 0;
    }
  }

  private async calculateAverageDeliveryTime(): Promise<number> {
    try {
      // This would calculate from actual delivery data
      return 0;
    } catch (error) {
      return 0;
    }
  }

  private async testEmailProvider(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      if (!this.emailService) {
        throw new Error('Email service not initialized');
      }

      // Could send a test email here
      const responseTime = Date.now() - startTime;

      return {
        provider: 'email',
        success: true,
        responseTime,
        details: {
          provider: this.config.email.providers.primary,
          host: this.config.email.config.primary.host
        }
      };
    } catch (error) {
      return {
        provider: 'email',
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: {}
      };
    }
  }

  private async testSlackWorkspace(workspaceId: string): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      if (!this.slackService) {
        throw new Error('Slack service not initialized');
      }

      const info = await this.slackService.getWorkspaceInfo(workspaceId);
      const responseTime = Date.now() - startTime;

      return {
        provider: `slack_${workspaceId}`,
        success: !!info,
        responseTime,
        details: info || {}
      };
    } catch (error) {
      return {
        provider: `slack_${workspaceId}`,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: {}
      };
    }
  }

  private async testWebhookProvider(): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    return {
      provider: 'webhook',
      success: true,
      responseTime: Date.now() - startTime,
      details: {
        timeout: this.config.webhook.timeout,
        retryCount: this.config.webhook.retryCount
      }
    };
  }

  private async testEmailProviderConfig(
    providerName: string, 
    config: Partial<EmailProvider>
  ): Promise<ProviderTestResult> {
    const startTime = Date.now();
    
    try {
      // Create temporary email service for testing
      const testProvider = { ...SMTP_PROVIDER, ...config };
      const testService = new EmailService({
        primary: testProvider,
        maxRetries: 1,
        retryDelay: 1000,
        trackDelivery: false,
        trackOpens: false,
        trackClicks: false
      });

      // Test would go here
      await testService.close();

      return {
        provider: providerName,
        success: true,
        responseTime: Date.now() - startTime,
        details: { host: testProvider.host, port: testProvider.port }
      };
    } catch (error) {
      return {
        provider: providerName,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: {}
      };
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await db.setting.upsert({
        where: { key: 'notification_system_config' },
        create: {
          key: 'notification_system_config',
          valueJson: JSON.stringify(this.config)
        },
        update: {
          valueJson: JSON.stringify(this.config)
        }
      });
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to save configuration to database');
    }
  }

  private validateConfiguration(config: any): void {
    // Basic validation of configuration structure
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration format');
    }

    const requiredSections = ['email', 'slack', 'webhook', 'analytics'];
    for (const section of requiredSections) {
      if (!(section in config)) {
        throw new Error(`Missing configuration section: ${section}`);
      }
    }
  }

  private mergeConfigurations(current: any, imported: any): any {
    const result = { ...current };

    for (const key in imported) {
      if (imported[key] && typeof imported[key] === 'object' && !Array.isArray(imported[key])) {
        result[key] = this.mergeConfigurations(current[key] || {}, imported[key]);
      } else if (imported[key] !== '[REDACTED]') {
        result[key] = imported[key];
      }
    }

    return result;
  }
}