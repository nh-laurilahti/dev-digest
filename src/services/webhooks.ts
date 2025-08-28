import { createHmac, timingSafeEqual } from 'crypto';
import { Webhooks } from '@octokit/webhooks';
import { GitHubClient } from '../clients/github';
import { Logger, createLogger } from '../lib/logger';
import { config } from '../lib/config';
import {
  WebhookValidationResult,
  WebhookEvent,
  GitHubRepository,
  GitHubPullRequest,
  GitHubIssue,
  GitHubUser,
} from '../types/github';
import { ValidationError, ExternalServiceError } from '../lib/errors';

export interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
  insecure_ssl?: boolean;
}

export interface ProcessedWebhookEvent {
  id: string;
  type: string;
  action: string;
  timestamp: string;
  repository: {
    owner: string;
    name: string;
    full_name: string;
  };
  data: any;
  metadata: {
    sender: GitHubUser;
    triggeredByBot: boolean;
    isPublic: boolean;
    impactLevel: 'low' | 'medium' | 'high';
    relevantForDigest: boolean;
  };
}

export class WebhookService {
  private client: GitHubClient;
  private logger: Logger;
  private webhooks: Webhooks;
  private secret: string;

  constructor(client: GitHubClient) {
    this.client = client;
    this.logger = createLogger({ component: 'webhook-service' });
    this.secret = config.GITHUB_WEBHOOK_SECRET || 'default-secret';
    
    this.webhooks = new Webhooks({
      secret: this.secret,
    });

    this.setupEventHandlers();
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret?: string): WebhookValidationResult {
    try {
      const webhookSecret = secret || this.secret;
      
      if (!signature) {
        return {
          isValid: false,
          error: 'Missing signature header',
        };
      }

      // GitHub sends signature as "sha256=<signature>"
      const sigBuffer = Buffer.from(signature.replace('sha256=', ''), 'hex');
      const expectedSig = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest();

      if (sigBuffer.length !== expectedSig.length) {
        return {
          isValid: false,
          error: 'Signature length mismatch',
        };
      }

      const isValid = timingSafeEqual(sigBuffer, expectedSig);

      return {
        isValid,
        error: isValid ? undefined : 'Invalid signature',
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Webhook signature verification failed');
      return {
        isValid: false,
        error: `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Process webhook payload
   */
  async processWebhook(
    eventType: string,
    payload: any,
    signature: string
  ): Promise<ProcessedWebhookEvent | null> {
    try {
      // Verify signature
      const verification = this.verifySignature(JSON.stringify(payload), signature);
      if (!verification.isValid) {
        throw new ValidationError(`Webhook verification failed: ${verification.error}`);
      }

      this.logger.debug({ 
        eventType, 
        action: payload.action,
        repository: payload.repository?.full_name 
      }, 'Processing webhook event');

      // Process the event
      const processedEvent = await this.processEvent(eventType, payload);

      if (processedEvent) {
        this.logger.info({
          eventId: processedEvent.id,
          type: processedEvent.type,
          action: processedEvent.action,
          repository: processedEvent.repository.full_name,
          impactLevel: processedEvent.metadata.impactLevel,
          relevantForDigest: processedEvent.metadata.relevantForDigest,
        }, 'Webhook event processed successfully');
      }

      return processedEvent;
    } catch (error) {
      this.logger.error({ err: error, eventType }, 'Failed to process webhook');
      throw new ExternalServiceError('GitHub', `Failed to process webhook: ${error}`);
    }
  }

  /**
   * Setup webhook for a repository
   */
  async setupRepositoryWebhook(
    owner: string,
    repo: string,
    webhookConfig: WebhookConfig
  ): Promise<{
    id: number;
    url: string;
    events: string[];
    active: boolean;
    created_at: string;
  }> {
    try {
      this.logger.debug({ owner, repo, webhookConfig }, 'Setting up repository webhook');

      const octokit = this.client.getOctokit();
      
      // Check if webhook already exists
      const existingHooks = await octokit.rest.repos.listWebhooks({
        owner,
        repo,
      });

      const existingHook = existingHooks.data.find(hook => 
        hook.config.url === webhookConfig.url
      );

      if (existingHook) {
        this.logger.info({ owner, repo, hookId: existingHook.id }, 'Webhook already exists, updating');
        
        // Update existing webhook
        const response = await octokit.rest.repos.updateWebhook({
          owner,
          repo,
          hook_id: existingHook.id,
          config: {
            url: webhookConfig.url,
            content_type: 'json',
            secret: webhookConfig.secret,
            insecure_ssl: webhookConfig.insecure_ssl ? '1' : '0',
          },
          events: webhookConfig.events,
          active: webhookConfig.active,
        });

        return {
          id: response.data.id,
          url: response.data.config.url || '',
          events: response.data.events,
          active: response.data.active,
          created_at: response.data.created_at,
        };
      } else {
        // Create new webhook
        const response = await octokit.rest.repos.createWebhook({
          owner,
          repo,
          name: 'web',
          config: {
            url: webhookConfig.url,
            content_type: 'json',
            secret: webhookConfig.secret,
            insecure_ssl: webhookConfig.insecure_ssl ? '1' : '0',
          },
          events: webhookConfig.events,
          active: webhookConfig.active,
        });

        this.logger.info({ 
          owner, 
          repo, 
          hookId: response.data.id,
          events: webhookConfig.events 
        }, 'Webhook created successfully');

        return {
          id: response.data.id,
          url: response.data.config.url || '',
          events: response.data.events,
          active: response.data.active,
          created_at: response.data.created_at,
        };
      }
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to setup webhook');
      throw new ExternalServiceError('GitHub', `Failed to setup webhook: ${error}`);
    }
  }

  /**
   * Remove webhook from repository
   */
  async removeRepositoryWebhook(
    owner: string,
    repo: string,
    webhookUrl: string
  ): Promise<boolean> {
    try {
      this.logger.debug({ owner, repo, webhookUrl }, 'Removing repository webhook');

      const octokit = this.client.getOctokit();
      
      // Find webhook by URL
      const hooks = await octokit.rest.repos.listWebhooks({
        owner,
        repo,
      });

      const webhook = hooks.data.find(hook => hook.config.url === webhookUrl);

      if (!webhook) {
        this.logger.warn({ owner, repo, webhookUrl }, 'Webhook not found');
        return false;
      }

      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: webhook.id,
      });

      this.logger.info({ owner, repo, hookId: webhook.id }, 'Webhook removed successfully');
      return true;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to remove webhook');
      throw new ExternalServiceError('GitHub', `Failed to remove webhook: ${error}`);
    }
  }

  /**
   * Test webhook by sending a ping
   */
  async testWebhook(owner: string, repo: string, hookId: number): Promise<boolean> {
    try {
      this.logger.debug({ owner, repo, hookId }, 'Testing webhook');

      const octokit = this.client.getOctokit();
      await octokit.rest.repos.pingWebhook({
        owner,
        repo,
        hook_id: hookId,
      });

      this.logger.info({ owner, repo, hookId }, 'Webhook ping sent successfully');
      return true;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, hookId }, 'Webhook test failed');
      return false;
    }
  }

  /**
   * Get repository webhooks
   */
  async getRepositoryWebhooks(owner: string, repo: string): Promise<Array<{
    id: number;
    url: string;
    events: string[];
    active: boolean;
    created_at: string;
    updated_at: string;
    last_response?: {
      code: number;
      status: string;
      message: string;
    };
  }>> {
    try {
      this.logger.debug({ owner, repo }, 'Fetching repository webhooks');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.listWebhooks({
        owner,
        repo,
      });

      const webhooks = response.data.map(hook => ({
        id: hook.id,
        url: hook.config.url || '',
        events: hook.events,
        active: hook.active,
        created_at: hook.created_at,
        updated_at: hook.updated_at,
        last_response: hook.last_response ? {
          code: hook.last_response.code || 0,
          status: hook.last_response.status || 'unknown',
          message: hook.last_response.message || '',
        } : undefined,
      }));

      this.logger.info({ owner, repo, count: webhooks.length }, 'Repository webhooks fetched');
      return webhooks;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch webhooks');
      throw new ExternalServiceError('GitHub', `Failed to fetch webhooks: ${error}`);
    }
  }

  /**
   * Get webhook delivery attempts
   */
  async getWebhookDeliveries(
    owner: string,
    repo: string,
    hookId: number,
    options: { cursor?: string; per_page?: number } = {}
  ): Promise<Array<{
    id: number;
    guid: string;
    delivered_at: string;
    redelivery: boolean;
    duration: number;
    status: string;
    status_code: number;
    event: string;
    action: string;
    installation_id: number | null;
    repository_id: number;
  }>> {
    try {
      this.logger.debug({ owner, repo, hookId, options }, 'Fetching webhook deliveries');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.listWebhookDeliveries({
        owner,
        repo,
        hook_id: hookId,
        per_page: options.per_page || 30,
        cursor: options.cursor,
      });

      const deliveries = response.data.map(delivery => ({
        id: delivery.id,
        guid: delivery.guid,
        delivered_at: delivery.delivered_at,
        redelivery: delivery.redelivery,
        duration: delivery.duration,
        status: delivery.status,
        status_code: delivery.status_code,
        event: delivery.event,
        action: delivery.action || '',
        installation_id: delivery.installation_id,
        repository_id: delivery.repository_id,
      }));

      this.logger.debug({ 
        owner, 
        repo, 
        hookId, 
        deliveriesCount: deliveries.length 
      }, 'Webhook deliveries fetched');

      return deliveries;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, hookId }, 'Failed to fetch webhook deliveries');
      throw new ExternalServiceError('GitHub', `Failed to fetch webhook deliveries: ${error}`);
    }
  }

  // Private methods

  private setupEventHandlers(): void {
    // Pull request events
    this.webhooks.on('pull_request', async ({ payload }) => {
      this.logger.debug({
        action: payload.action,
        prNumber: payload.pull_request.number,
        repository: payload.repository.full_name,
      }, 'Pull request webhook event received');
    });

    // Push events
    this.webhooks.on('push', async ({ payload }) => {
      this.logger.debug({
        ref: payload.ref,
        commits: payload.commits.length,
        repository: payload.repository.full_name,
      }, 'Push webhook event received');
    });

    // Issue events
    this.webhooks.on('issues', async ({ payload }) => {
      this.logger.debug({
        action: payload.action,
        issueNumber: payload.issue.number,
        repository: payload.repository.full_name,
      }, 'Issue webhook event received');
    });

    // Release events
    this.webhooks.on('release', async ({ payload }) => {
      this.logger.debug({
        action: payload.action,
        tagName: payload.release.tag_name,
        repository: payload.repository.full_name,
      }, 'Release webhook event received');
    });
  }

  private async processEvent(eventType: string, payload: any): Promise<ProcessedWebhookEvent | null> {
    const baseEvent = {
      id: payload.delivery?.id || `${Date.now()}-${Math.random()}`,
      type: eventType,
      action: payload.action || 'unknown',
      timestamp: new Date().toISOString(),
      repository: {
        owner: payload.repository.owner.login,
        name: payload.repository.name,
        full_name: payload.repository.full_name,
      },
      metadata: {
        sender: payload.sender,
        triggeredByBot: payload.sender.type === 'Bot',
        isPublic: !payload.repository.private,
        impactLevel: 'low' as const,
        relevantForDigest: false,
      },
    };

    switch (eventType) {
      case 'pull_request':
        return this.processPullRequestEvent(baseEvent, payload);
      
      case 'push':
        return this.processPushEvent(baseEvent, payload);
      
      case 'issues':
        return this.processIssueEvent(baseEvent, payload);
      
      case 'release':
        return this.processReleaseEvent(baseEvent, payload);
      
      case 'pull_request_review':
        return this.processPullRequestReviewEvent(baseEvent, payload);
      
      default:
        this.logger.debug({ eventType }, 'Unhandled webhook event type');
        return null;
    }
  }

  private processPullRequestEvent(
    baseEvent: Partial<ProcessedWebhookEvent>,
    payload: any
  ): ProcessedWebhookEvent {
    const pullRequest = payload.pull_request;
    
    // Determine impact level
    let impactLevel: 'low' | 'medium' | 'high' = 'medium';
    if (payload.action === 'opened' || payload.action === 'closed') {
      impactLevel = 'high';
    } else if (payload.action === 'synchronize' || payload.action === 'review_requested') {
      impactLevel = 'medium';
    }

    // Determine if relevant for digest
    const relevantActions = ['opened', 'closed', 'merged', 'review_requested', 'ready_for_review'];
    const relevantForDigest = relevantActions.includes(payload.action) && !pullRequest.draft;

    return {
      ...baseEvent,
      data: {
        pull_request: pullRequest,
        changes: payload.action === 'synchronize' ? {
          commits_added: payload.commits?.length || 0,
          files_changed: pullRequest.changed_files || 0,
        } : undefined,
      },
      metadata: {
        ...baseEvent.metadata!,
        impactLevel,
        relevantForDigest,
      },
    } as ProcessedWebhookEvent;
  }

  private processPushEvent(
    baseEvent: Partial<ProcessedWebhookEvent>,
    payload: any
  ): ProcessedWebhookEvent {
    const commits = payload.commits || [];
    const isMainBranch = payload.ref === `refs/heads/${payload.repository.default_branch}`;
    
    // Determine impact level
    let impactLevel: 'low' | 'medium' | 'high' = 'low';
    if (isMainBranch && commits.length > 0) {
      impactLevel = commits.length > 5 ? 'high' : 'medium';
    }

    // Relevant for digest if it's the main branch with commits
    const relevantForDigest = isMainBranch && commits.length > 0;

    return {
      ...baseEvent,
      data: {
        ref: payload.ref,
        before: payload.before,
        after: payload.after,
        commits: commits.map((commit: any) => ({
          id: commit.id,
          message: commit.message,
          author: commit.author,
          added: commit.added,
          removed: commit.removed,
          modified: commit.modified,
        })),
        head_commit: payload.head_commit,
        compare: payload.compare,
        pusher: payload.pusher,
      },
      metadata: {
        ...baseEvent.metadata!,
        impactLevel,
        relevantForDigest,
      },
    } as ProcessedWebhookEvent;
  }

  private processIssueEvent(
    baseEvent: Partial<ProcessedWebhookEvent>,
    payload: any
  ): ProcessedWebhookEvent {
    const issue = payload.issue;
    
    // Determine impact level
    let impactLevel: 'low' | 'medium' | 'high' = 'low';
    if (payload.action === 'opened' || payload.action === 'closed') {
      impactLevel = issue.labels.some((label: any) => 
        label.name.includes('bug') || label.name.includes('critical')
      ) ? 'high' : 'medium';
    }

    // Relevant for digest if opened or closed
    const relevantForDigest = ['opened', 'closed'].includes(payload.action);

    return {
      ...baseEvent,
      data: {
        issue: issue,
        assignee: payload.assignee,
        label: payload.label,
      },
      metadata: {
        ...baseEvent.metadata!,
        impactLevel,
        relevantForDigest,
      },
    } as ProcessedWebhookEvent;
  }

  private processReleaseEvent(
    baseEvent: Partial<ProcessedWebhookEvent>,
    payload: any
  ): ProcessedWebhookEvent {
    const release = payload.release;
    
    // Releases are always high impact and relevant for digest
    const impactLevel: 'high' = 'high';
    const relevantForDigest = ['published', 'created'].includes(payload.action) && !release.prerelease;

    return {
      ...baseEvent,
      data: {
        release: release,
      },
      metadata: {
        ...baseEvent.metadata!,
        impactLevel,
        relevantForDigest,
      },
    } as ProcessedWebhookEvent;
  }

  private processPullRequestReviewEvent(
    baseEvent: Partial<ProcessedWebhookEvent>,
    payload: any
  ): ProcessedWebhookEvent {
    const review = payload.review;
    const pullRequest = payload.pull_request;
    
    // Determine impact level based on review state
    let impactLevel: 'low' | 'medium' | 'high' = 'low';
    if (review.state === 'approved') {
      impactLevel = 'medium';
    } else if (review.state === 'changes_requested') {
      impactLevel = 'medium';
    }

    // Relevant for digest if it's an approval or change request
    const relevantForDigest = ['approved', 'changes_requested'].includes(review.state);

    return {
      ...baseEvent,
      data: {
        review: review,
        pull_request: pullRequest,
      },
      metadata: {
        ...baseEvent.metadata!,
        impactLevel,
        relevantForDigest,
      },
    } as ProcessedWebhookEvent;
  }
}