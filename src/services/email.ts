/**
 * Email Service
 * Provides SMTP email delivery with multiple provider support, templates, and tracking
 */

import * as nodemailer from 'nodemailer';
import { logger } from '../lib/logger';
import { db } from '../db';
import { config } from '../lib/config';

// Email provider configurations
export interface EmailProvider {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  pool?: boolean;
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: string;
  cid?: string; // Content-ID for embedded images
}

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  template?: string;
  templateData?: Record<string, any>;
  priority?: 'high' | 'normal' | 'low';
  replyTo?: string;
  messageId?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
  recipients?: string[];
  deliveredAt?: Date;
  bounced?: boolean;
  bounceReason?: string;
}

export interface EmailProviderConfig {
  primary: EmailProvider;
  fallback?: EmailProvider[];
  maxRetries: number;
  retryDelay: number;
  trackDelivery: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
}

export class EmailService {
  private transporters: Map<string, nodemailer.Transporter> = new Map();
  private config: EmailProviderConfig;
  private templateCache: Map<string, string> = new Map();

  constructor(config: EmailProviderConfig) {
    this.config = config;
    this.initializeTransporters();
  }

  /**
   * Initialize email transporters for all configured providers
   */
  private initializeTransporters(): void {
    // Initialize primary provider
    this.createTransporter(this.config.primary);

    // Initialize fallback providers
    if (this.config.fallback) {
      this.config.fallback.forEach(provider => {
        this.createTransporter(provider);
      });
    }

    logger.info({
      primaryProvider: this.config.primary.name,
      fallbackProviders: this.config.fallback?.map(p => p.name) || [],
      transporterCount: this.transporters.size
    }, 'Email transporters initialized');
  }

  /**
   * Create a nodemailer transporter for SMTP provider
   */
  private createTransporter(provider: EmailProvider): void {
    try {
      // Validate SMTP credentials
      if (!provider.auth?.user || !provider.auth?.pass) {
        throw new Error('SMTP credentials (SMTP_USER and SMTP_PASS) are required');
      }

      const transporter = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure, // true for 465, false for other ports
        auth: {
          user: provider.auth.user,
          pass: provider.auth.pass
        },
        pool: provider.pool || false, // Disable pooling for simplicity
        tls: {
          rejectUnauthorized: false // Accept self-signed certificates
        }
      });

      // Verify connection
      transporter.verify((error) => {
        if (error) {
          logger.error({
            provider: provider.name,
            host: provider.host,
            port: provider.port,
            user: provider.auth?.user,
            error: error.message
          }, 'SMTP connection failed');
        } else {
          logger.info({
            provider: provider.name,
            host: provider.host,
            port: provider.port,
            user: provider.auth?.user
          }, 'SMTP connection verified successfully');
        }
      });

      this.transporters.set(provider.name, transporter);
    } catch (error) {
      logger.error({
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to create SMTP transporter');
    }
  }

  /**
   * Send an email with automatic failover and retry logic
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    const providers = [this.config.primary, ...(this.config.fallback || [])];
    let lastError: string = '';

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      for (const provider of providers) {
        try {
          const result = await this.sendWithProvider(provider, options, attempt);
          if (result.success) {
            // Log successful delivery
            await this.logEmailDelivery(options, result, provider.name);
            return result;
          }
          lastError = result.error || 'Unknown error';
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          logger.warn({
            provider: provider.name,
            attempt: attempt + 1,
            error: lastError,
            recipient: Array.isArray(options.to) ? options.to[0] : options.to
          }, 'Email delivery attempt failed');
        }

        // Wait before trying next provider
        if (attempt < this.config.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * Math.pow(2, attempt)));
        }
      }
    }

    // All providers failed
    const result: EmailResult = {
      success: false,
      error: `All email providers failed. Last error: ${lastError}`,
      recipients: Array.isArray(options.to) ? options.to : [options.to]
    };

    // Log failed delivery
    await this.logEmailDelivery(options, result);
    return result;
  }

  /**
   * Send email using a specific provider
   */
  private async sendWithProvider(
    provider: EmailProvider, 
    options: EmailOptions, 
    attempt: number
  ): Promise<EmailResult> {
    const transporter = this.transporters.get(provider.name);
    if (!transporter) {
      throw new Error(`Transporter not found for provider: ${provider.name}`);
    }

    // Prepare email content
    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.SMTP_FROM || provider.auth?.user || 'noreply@digest.dev',
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: att.encoding as any,
        cid: att.cid
      })),
      priority: options.priority || 'normal',
      replyTo: options.replyTo,
      messageId: options.messageId,
      headers: options.headers
    };

    // Process template if specified
    if (options.template && options.templateData) {
      const processedContent = await this.processTemplate(options.template, options.templateData);
      if (processedContent.html) {
        mailOptions.html = processedContent.html;
      }
      if (processedContent.text) {
        mailOptions.text = processedContent.text;
      }
    }

    // Add tracking pixels if enabled
    if (this.config.trackOpens && mailOptions.html) {
      mailOptions.html = this.addTrackingPixel(mailOptions.html, options.messageId || '');
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      provider: provider.name,
      recipients: Array.isArray(options.to) ? options.to : [options.to],
      deliveredAt: new Date()
    };
  }

  /**
   * Process email template with data substitution
   */
  private async processTemplate(
    templateName: string, 
    data: Record<string, any>
  ): Promise<{ html?: string; text?: string }> {
    try {
      // Try to get template from cache first
      let template = this.templateCache.get(templateName);
      
      if (!template) {
        // Load template from database or file system
        const templateRecord = await db.notificationTemplate.findFirst({
          where: { name: templateName, type: 'email' }
        });
        
        if (templateRecord) {
          template = templateRecord.content;
          this.templateCache.set(templateName, template);
        } else {
          throw new Error(`Email template not found: ${templateName}`);
        }
      }

      // Use handlebars-like template processing
      const processedTemplate = this.substituteVariables(template, data);
      
      // Return both HTML and text versions
      return {
        html: processedTemplate,
        text: this.htmlToText(processedTemplate)
      };
    } catch (error) {
      logger.error({
        templateName,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to process email template');
      
      return {
        text: 'Email template processing failed'
      };
    }
  }

  /**
   * Simple variable substitution for templates
   */
  private substituteVariables(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  /**
   * Add tracking pixel for email opens
   */
  private addTrackingPixel(html: string, messageId: string): string {
    const trackingPixel = `<img src="${config.baseUrl}/api/email/track/open/${messageId}" width="1" height="1" style="display:none" />`;
    
    // Add before closing body tag
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    
    // Add at the end if no body tag
    return html + trackingPixel;
  }

  /**
   * Log email delivery attempt to database
   */
  private async logEmailDelivery(
    options: EmailOptions, 
    result: EmailResult, 
    provider?: string
  ): Promise<void> {
    try {
      await db.emailLog.create({
        data: {
          messageId: result.messageId || `failed_${Date.now()}`,
          provider: provider || 'unknown',
          recipients: JSON.stringify(result.recipients || []),
          subject: options.subject,
          status: result.success ? 'sent' : 'failed',
          error: result.error,
          sentAt: result.success ? new Date() : null,
          metadata: JSON.stringify({
            template: options.template,
            priority: options.priority,
            attachmentCount: options.attachments?.length || 0
          })
        }
      });
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to log email delivery');
    }
  }

  /**
   * Track email open
   */
  async trackEmailOpen(messageId: string, userAgent?: string, ip?: string): Promise<void> {
    try {
      await db.emailTracking.create({
        data: {
          messageId,
          eventType: 'open',
          userAgent,
          ipAddress: ip,
          timestamp: new Date()
        }
      });

      logger.debug({ messageId }, 'Email open tracked');
    } catch (error) {
      logger.error({
        messageId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to track email open');
    }
  }

  /**
   * Track email click
   */
  async trackEmailClick(
    messageId: string, 
    url: string, 
    userAgent?: string, 
    ip?: string
  ): Promise<void> {
    try {
      await db.emailTracking.create({
        data: {
          messageId,
          eventType: 'click',
          url,
          userAgent,
          ipAddress: ip,
          timestamp: new Date()
        }
      });

      logger.debug({ messageId, url }, 'Email click tracked');
    } catch (error) {
      logger.error({
        messageId,
        url,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to track email click');
    }
  }

  /**
   * Process bounce notifications
   */
  async processBounce(notification: any): Promise<void> {
    try {
      const messageId = notification.messageId;
      const bounceType = notification.bounceType || 'unknown';
      const recipient = notification.bouncedRecipients?.[0]?.emailAddress;

      await db.emailBounce.create({
        data: {
          messageId,
          recipient: recipient || 'unknown',
          bounceType,
          bounceSubType: notification.bounceSubType,
          diagnosticCode: notification.diagnosticCode,
          timestamp: new Date(notification.timestamp)
        }
      });

      // Update user preferences to disable email if permanent bounce
      if (bounceType === 'Permanent' && recipient) {
        await this.disableEmailForRecipient(recipient);
      }

      logger.info({
        messageId,
        recipient,
        bounceType
      }, 'Email bounce processed');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to process email bounce');
    }
  }

  /**
   * Disable email notifications for a recipient
   */
  private async disableEmailForRecipient(email: string): Promise<void> {
    try {
      const user = await db.user.findFirst({
        where: { email },
        include: { preferences: true }
      });

      if (user && user.preferences) {
        const channels = JSON.parse(user.preferences.channels);
        const updatedChannels = channels.filter((channel: string) => channel !== 'email');
        
        await db.userPreference.update({
          where: { userId: user.id },
          data: {
            channels: JSON.stringify(updatedChannels)
          }
        });

        logger.info({ email }, 'Email notifications disabled for bounced recipient');
      }
    } catch (error) {
      logger.error({
        email,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to disable email for recipient');
    }
  }

  /**
   * Get email delivery statistics
   */
  async getDeliveryStats(dateFrom?: Date, dateTo?: Date): Promise<{
    sent: number;
    failed: number;
    opened: number;
    clicked: number;
    bounced: number;
  }> {
    try {
      const whereClause = dateFrom && dateTo ? {
        createdAt: {
          gte: dateFrom,
          lte: dateTo
        }
      } : {};

      const [sent, failed, opened, clicked, bounced] = await Promise.all([
        db.emailLog.count({ where: { ...whereClause, status: 'sent' } }),
        db.emailLog.count({ where: { ...whereClause, status: 'failed' } }),
        db.emailTracking.count({ where: { ...whereClause, eventType: 'open' } }),
        db.emailTracking.count({ where: { ...whereClause, eventType: 'click' } }),
        db.emailBounce.count({ where: whereClause })
      ]);

      return { sent, failed, opened, clicked, bounced };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get email delivery stats');
      
      return { sent: 0, failed: 0, opened: 0, clicked: 0, bounced: 0 };
    }
  }

  /**
   * Close all email transporters
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.transporters.values()).map(transporter => {
      return new Promise<void>((resolve) => {
        transporter.close(() => resolve());
      });
    });

    await Promise.all(closePromises);
    this.transporters.clear();
    
    logger.info('Email service closed');
  }
}

// Simple SMTP email provider configuration from environment
export const SMTP_PROVIDER: EmailProvider = {
  name: 'SMTP',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

// Default email configuration using simple SMTP
export const DEFAULT_EMAIL_CONFIG: EmailProviderConfig = {
  primary: SMTP_PROVIDER,
  fallback: [], // No fallback providers for simplicity
  maxRetries: 3,
  retryDelay: 1000,
  trackDelivery: true,
  trackOpens: true,
  trackClicks: true
};