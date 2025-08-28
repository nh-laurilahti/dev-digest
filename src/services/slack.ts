/**
 * Slack Service
 * Provides Slack messaging with Bot API integration, rich formatting, and interactive components
 */

import { WebClient, ChatPostMessageArguments, Block, KnownBlock } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import { logger } from '../lib/logger';
import { db } from '../db';
import { config } from '../lib/config';
import * as crypto from 'crypto';

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: (Block | KnownBlock)[];
  attachments?: SlackAttachment[];
  threadTs?: string;
  replyBroadcast?: boolean;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
  iconEmoji?: string;
  iconUrl?: string;
  username?: string;
  asUser?: boolean;
  linkNames?: boolean;
  parse?: 'full' | 'none';
}

export interface SlackAttachment {
  fallback: string;
  color?: string;
  pretext?: string;
  authorName?: string;
  authorLink?: string;
  authorIcon?: string;
  title?: string;
  titleLink?: string;
  text?: string;
  fields?: SlackField[];
  imageUrl?: string;
  thumbUrl?: string;
  footer?: string;
  footerIcon?: string;
  ts?: number;
  actions?: SlackAction[];
}

export interface SlackField {
  title: string;
  value: string;
  short?: boolean;
}

export interface SlackAction {
  type: string;
  text: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
  confirm?: SlackConfirmation;
}

export interface SlackConfirmation {
  title: string;
  text: string;
  okText?: string;
  dismissText?: string;
}

export interface SlackFile {
  file: Buffer | string;
  filename: string;
  filetype?: string;
  title?: string;
  initialComment?: string;
  channels?: string;
  threadTs?: string;
}

export interface SlackResult {
  success: boolean;
  messageId?: string;
  timestamp?: string;
  error?: string;
  channel?: string;
  permalink?: string;
}

export interface SlackBot {
  token: string;
  appToken?: string;
  signingSecret: string;
  verificationToken?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes: string[];
}

export interface SlackWorkspace {
  id: string;
  name: string;
  domain: string;
  botToken: string;
  userToken?: string;
  teamId: string;
  isActive: boolean;
  installedAt: Date;
  scopes: string[];
}

export class SlackService {
  private clients: Map<string, WebClient> = new Map();
  private botConfig: SlackBot;
  private eventAdapter: any;
  private templateCache: Map<string, any> = new Map();

  constructor(botConfig: SlackBot) {
    this.botConfig = botConfig;
    this.initializeEventAdapter();
  }

  /**
   * Initialize Slack Events API adapter
   */
  private initializeEventAdapter(): void {
    try {
      this.eventAdapter = createEventAdapter(this.botConfig.signingSecret);
      
      // Handle various Slack events
      this.eventAdapter.on('message', this.handleMessage.bind(this));
      this.eventAdapter.on('app_mention', this.handleMention.bind(this));
      this.eventAdapter.on('reaction_added', this.handleReaction.bind(this));
      
      logger.info('Slack Events API adapter initialized');
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to initialize Slack Events API adapter');
    }
  }

  /**
   * Add a workspace client
   */
  async addWorkspace(workspace: SlackWorkspace): Promise<void> {
    try {
      const client = new WebClient(workspace.botToken);
      
      // Test the connection
      const authResult = await client.auth.test();
      if (!authResult.ok) {
        throw new Error(`Slack auth test failed: ${authResult.error}`);
      }

      this.clients.set(workspace.id, client);
      
      // Store workspace in database
      await db.slackWorkspace.upsert({
        where: { id: workspace.id },
        create: {
          id: workspace.id,
          name: workspace.name,
          domain: workspace.domain,
          botToken: this.encryptToken(workspace.botToken),
          userToken: workspace.userToken ? this.encryptToken(workspace.userToken) : null,
          teamId: workspace.teamId,
          isActive: workspace.isActive,
          installedAt: workspace.installedAt,
          scopes: JSON.stringify(workspace.scopes)
        },
        update: {
          name: workspace.name,
          domain: workspace.domain,
          botToken: this.encryptToken(workspace.botToken),
          userToken: workspace.userToken ? this.encryptToken(workspace.userToken) : null,
          isActive: workspace.isActive,
          scopes: JSON.stringify(workspace.scopes)
        }
      });

      logger.info({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        teamId: workspace.teamId
      }, 'Slack workspace added');
    } catch (error) {
      logger.error({
        workspaceId: workspace.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to add Slack workspace');
      throw error;
    }
  }

  /**
   * Send a message to a Slack channel or user
   */
  async sendMessage(
    workspaceId: string, 
    message: SlackMessage, 
    template?: string, 
    templateData?: Record<string, any>
  ): Promise<SlackResult> {
    try {
      let client = this.clients.get(workspaceId);
      if (!client) {
        // Fallback: use bot token to create a default client when workspace is unknown
        if (this.botConfig.token) {
          client = new WebClient(this.botConfig.token);
          this.clients.set(workspaceId || 'default', client);
          logger.warn({ workspaceId }, 'Slack workspace client missing; using default bot token client');
        } else {
          throw new Error(`Slack client not found for workspace: ${workspaceId}`);
        }
      }

      // Process template if specified
      if (template && templateData) {
        const processedMessage = await this.processTemplate(template, templateData, workspaceId);
        message = { ...message, ...processedMessage };
      }

      // Resolve channel name (e.g., "#digest") to channel ID
      let resolvedChannel = message.channel;
      if (typeof resolvedChannel === 'string' && resolvedChannel.startsWith('#')) {
        const channelName = resolvedChannel.slice(1);
        try {
          const list = await client.conversations.list({ types: 'public_channel,private_channel', limit: 1000 });
          const match = (list.channels || []).find((c: any) => c.name === channelName);
          if (match?.id) {
            resolvedChannel = match.id;
          } else {
            logger.warn({ channelName }, 'Slack channel not found by name; attempting to post using provided value');
          }
        } catch (e) {
          logger.warn({ error: e instanceof Error ? e.message : String(e) }, 'Failed to resolve Slack channel name');
        }
      }

      const messageArgs: ChatPostMessageArguments = {
        channel: resolvedChannel,
        text: message.text,
        blocks: message.blocks,
        attachments: message.attachments as any,
        thread_ts: message.threadTs,
        reply_broadcast: message.replyBroadcast,
        unfurl_links: message.unfurlLinks,
        unfurl_media: message.unfurlMedia,
        icon_emoji: message.iconEmoji,
        icon_url: message.iconUrl,
        username: message.username,
        as_user: message.asUser,
        link_names: message.linkNames,
        parse: message.parse
      };

      const result = await client.chat.postMessage(messageArgs);
      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      // Get permalink for the message
      let permalink: string | undefined;
      try {
        const permaResult = await client.chat.getPermalink({
          channel: result.channel!,
          message_ts: result.ts!
        });
        if (permaResult.ok) {
          permalink = permaResult.permalink;
        }
      } catch (permaError) {
        logger.warn({
          workspaceId,
          channel: result.channel,
          messageTs: result.ts
        }, 'Failed to get message permalink');
      }

      const slackResult: SlackResult = {
        success: true,
        messageId: result.ts!,
        timestamp: result.ts as any,
        channel: result.channel as any,
        permalink
      } as any;

      // Log delivery (best effort)
      try {
        await this.logSlackMessage(workspaceId, { ...message, channel: resolvedChannel }, slackResult, template);
      } catch (logErr) {
        // already handled inside logSlackMessage
      }

      return slackResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({
        workspaceId,
        channel: message.channel,
        error: errMsg
      }, 'Failed to send Slack message');

      return {
        success: false,
        error: errMsg
      } as any;
    }
  }

  /**
   * Upload a file to Slack
   */
  async uploadFile(workspaceId: string, fileData: SlackFile): Promise<SlackResult> {
    try {
      const client = this.clients.get(workspaceId);
      if (!client) {
        throw new Error(`Slack client not found for workspace: ${workspaceId}`);
      }

      const result = await client.files.upload({
        file: fileData.file,
        filename: fileData.filename,
        filetype: fileData.filetype,
        title: fileData.title,
        initial_comment: fileData.initialComment,
        channels: fileData.channels,
        thread_ts: fileData.threadTs
      });

      if (!result.ok) {
        throw new Error(`Slack file upload error: ${result.error}`);
      }

      logger.info({
        workspaceId,
        filename: fileData.filename,
        fileId: result.file?.id
      }, 'File uploaded to Slack successfully');

      return {
        success: true,
        messageId: result.file?.id,
        permalink: result.file?.permalink
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error({
        workspaceId,
        filename: fileData.filename,
        error: errorMessage
      }, 'Failed to upload file to Slack');

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    workspaceId: string,
    channel: string,
    timestamp: string,
    message: Partial<SlackMessage>
  ): Promise<SlackResult> {
    try {
      const client = this.clients.get(workspaceId);
      if (!client) {
        throw new Error(`Slack client not found for workspace: ${workspaceId}`);
      }

      const result = await client.chat.update({
        channel,
        ts: timestamp,
        text: message.text,
        blocks: message.blocks,
        attachments: message.attachments as any
      });

      if (!result.ok) {
        throw new Error(`Slack message update error: ${result.error}`);
      }

      logger.info({
        workspaceId,
        channel,
        messageId: timestamp
      }, 'Slack message updated successfully');

      return {
        success: true,
        messageId: timestamp,
        timestamp,
        channel
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error({
        workspaceId,
        channel,
        messageId: timestamp,
        error: errorMessage
      }, 'Failed to update Slack message');

      return {
        success: false,
        error: errorMessage,
        channel
      };
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(workspaceId: string, channel: string, timestamp: string): Promise<SlackResult> {
    try {
      const client = this.clients.get(workspaceId);
      if (!client) {
        throw new Error(`Slack client not found for workspace: ${workspaceId}`);
      }

      const result = await client.chat.delete({
        channel,
        ts: timestamp
      });

      if (!result.ok) {
        throw new Error(`Slack message delete error: ${result.error}`);
      }

      logger.info({
        workspaceId,
        channel,
        messageId: timestamp
      }, 'Slack message deleted successfully');

      return {
        success: true,
        messageId: timestamp,
        channel
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error({
        workspaceId,
        channel,
        messageId: timestamp,
        error: errorMessage
      }, 'Failed to delete Slack message');

      return {
        success: false,
        error: errorMessage,
        channel
      };
    }
  }

  /**
   * Process Slack message template
   */
  private async processTemplate(
    templateName: string,
    data: Record<string, any>,
    workspaceId: string
  ): Promise<Partial<SlackMessage>> {
    try {
      const cacheKey = `${workspaceId}_${templateName}`;
      let template = this.templateCache.get(cacheKey);

      if (!template) {
        const templateRecord = await db.notificationTemplate.findFirst({
          where: { name: templateName, type: 'slack' }
        });

        if (templateRecord) {
          template = JSON.parse(templateRecord.content);
          this.templateCache.set(cacheKey, template);
        } else {
          // Built-in fallback templates (by normalized key)
          const builtInKey = templateName.trim().toUpperCase();
          const builtIn = (SLACK_MESSAGE_TEMPLATES as any)[builtInKey];
          if (builtIn) {
            template = JSON.parse(JSON.stringify(builtIn));
            this.templateCache.set(cacheKey, template);
          } else {
            throw new Error(`Slack template not found: ${templateName}`);
          }
        }
      }

      // Process template with data substitution
      const processedTemplate = JSON.parse(JSON.stringify(template));

      // Normalize common digest fields to expected placeholders
      const normalizedData = { ...data } as any;
      if (!normalizedData.summaryText && typeof normalizedData.summary === 'string') {
        normalizedData.summaryText = normalizedData.summary;
      }
      if (normalizedData.stats && typeof normalizedData.prCount === 'undefined') {
        if (typeof normalizedData.stats.prCount === 'number') normalizedData.prCount = normalizedData.stats.prCount;
        if (typeof normalizedData.stats.commitCount === 'number') normalizedData.commitCount = normalizedData.stats.commitCount;
        if (typeof normalizedData.stats.contributorCount === 'number') normalizedData.contributorCount = normalizedData.stats.contributorCount;
      }

      this.substituteTemplateVariables(processedTemplate, normalizedData);

      return processedTemplate;
    } catch (error) {
      logger.error({
        templateName,
        workspaceId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to process Slack template');

      // Minimal text fallback using common digest fields
      const repoName = data?.repoName || 'Repository';
      const dateRange = data?.dateRange || '';
      const digestUrl = data?.digestUrl || '';
      return {
        text: `📊 ${repoName} Digest ${dateRange ? '(' + dateRange + ')' : ''} — ${digestUrl}`
      };
    }
  }

  /**
   * Recursively substitute variables in template object
   */
  private substituteTemplateVariables(obj: any, data: Record<string, any>): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(/\{\{(\w+)\}\}/g, (match: string, variable: string) => {
          return data[variable] || match;
        });
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.substituteTemplateVariables(obj[key], data);
      }
    }
  }

  /**
   * Log Slack message delivery
   */
  private async logSlackMessage(
    workspaceId: string,
    message: SlackMessage,
    result: SlackResult,
    template?: string
  ): Promise<void> {
    try {
      await db.slackLog.create({
        data: {
          workspaceId,
          channel: message.channel,
          messageId: result.messageId || `failed_${Date.now()}`,
          status: result.success ? 'sent' : 'failed',
          error: result.error,
          sentAt: result.success ? new Date() : null,
          permalink: result.permalink,
          metadata: JSON.stringify({
            template,
            hasBlocks: !!message.blocks,
            hasAttachments: !!message.attachments,
            threadTs: message.threadTs
          })
        }
      });
    } catch (error) {
      logger.error({
        workspaceId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to log Slack message');
    }
  }

  /**
   * Handle incoming Slack messages
   */
  private async handleMessage(event: any): Promise<void> {
    try {
      // Skip bot messages
      if (event.bot_id) return;

      logger.info({
        channel: event.channel,
        user: event.user,
        text: event.text
      }, 'Received Slack message');

      // Process message for commands or interactions
      // This can be extended based on specific requirements
    } catch (error) {
      logger.error({
        event,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to handle Slack message');
    }
  }

  /**
   * Handle app mentions
   */
  private async handleMention(event: any): Promise<void> {
    try {
      logger.info({
        channel: event.channel,
        user: event.user,
        text: event.text
      }, 'Received app mention');

      // Process mention and respond appropriately
      // This can be extended for interactive features
    } catch (error) {
      logger.error({
        event,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to handle app mention');
    }
  }

  /**
   * Handle emoji reactions
   */
  private async handleReaction(event: any): Promise<void> {
    try {
      logger.debug({
        reaction: event.reaction,
        user: event.user,
        item: event.item
      }, 'Received reaction event');

      // Process reaction for feedback or interaction tracking
    } catch (error) {
      logger.error({
        event,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to handle reaction');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(signature: string, timestamp: string, body: string): boolean {
    try {
      const hmac = crypto.createHmac('sha256', this.botConfig.signingSecret);
      const [version, hash] = signature.split('=');
      
      hmac.update(`${version}:${timestamp}:${body}`);
      const computedHash = hmac.digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(computedHash, 'hex')
      );
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to verify Slack webhook signature');
      return false;
    }
  }

  /**
   * Get workspace information
   */
  async getWorkspaceInfo(workspaceId: string): Promise<any> {
    try {
      const client = this.clients.get(workspaceId);
      if (!client) {
        throw new Error(`Slack client not found for workspace: ${workspaceId}`);
      }

      const result = await client.team.info();
      return result.ok ? result.team : null;
    } catch (error) {
      logger.error({
        workspaceId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get workspace info');
      return null;
    }
  }

  /**
   * Get channel list
   */
  async getChannels(workspaceId: string): Promise<any[]> {
    try {
      const client = this.clients.get(workspaceId);
      if (!client) {
        throw new Error(`Slack client not found for workspace: ${workspaceId}`);
      }

      const result = await client.conversations.list({ types: 'public_channel,private_channel' });
      return result.ok ? (result.channels || []) : [];
    } catch (error) {
      logger.error({
        workspaceId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to get channel list');
      return [];
    }
  }

  /**
   * Encrypt sensitive tokens
   */
  private encryptToken(token: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', config.encryptionKey);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt tokens
   */
  private decryptToken(encryptedToken: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', config.encryptionKey);
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.clients.clear();
    this.templateCache.clear();
    logger.info('Slack service closed');
  }
}

// Predefined Slack message templates
export const SLACK_MESSAGE_TEMPLATES = {
  DIGEST_NOTIFICATION: {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 New Digest Available: {{repoName}}'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*{{summaryTitle}}*\n{{summaryText}}'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*Date Range:*\n{{dateRange}}'
          },
          {
            type: 'mrkdwn',
            text: '*PRs Analyzed:*\n{{prCount}}'
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Full Digest'
            },
            url: '{{digestUrl}}',
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Repository'
            },
            url: '{{repoUrl}}'
          }
        ]
      }
    ]
  },

  SYSTEM_ALERT: {
    attachments: [
      {
        color: 'danger',
        title: '🚨 System Alert: {{alertType}}',
        text: '{{alertMessage}}',
        fields: [
          {
            title: 'Severity',
            value: '{{severity}}',
            short: true
          },
          {
            title: 'Component',
            value: '{{component}}',
            short: true
          }
        ],
        footer: 'Digest System Monitor',
        ts: '{{timestamp}}'
      }
    ]
  },

  WELCOME_MESSAGE: {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '👋 Welcome to the Daily Dev Digest!\n\nI\'ll help you stay updated with the latest repository activities.'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Available Commands:*\n• `/digest` - Generate a new digest\n• `/subscribe` - Subscribe to repository updates\n• `/preferences` - Manage notification settings'
        }
      }
    ]
  }
};