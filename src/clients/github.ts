import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { RequestError } from '@octokit/request-error';
import { Logger } from '../lib/logger';
import { createLogger } from '../lib/logger';
import { config } from '../lib/config';
import { 
  GitHubApiError, 
  GitHubRateLimitError, 
  GitHubClientConfig,
  RateLimitInfo 
} from '../types/github';

export class GitHubClient {
  private octokit: Octokit;
  private logger: Logger;
  private config: GitHubClientConfig;
  private rateLimitInfo: Map<string, RateLimitInfo> = new Map();
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private requestQueue: Array<{
    request: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    priority: number;
  }> = [];
  private isProcessingQueue = false;

  constructor(clientConfig?: Partial<GitHubClientConfig>) {
    this.logger = createLogger({ component: 'github-client' });
    
    this.config = {
      token: config.GITHUB_TOKEN,
      userAgent: 'daily-dev-digest/1.0.0',
      timeout: 30000,
      retries: {
        enabled: true,
        retries: 3,
        retryAfter: 60,
      },
      cache: {
        enabled: true,
        ttl: 300, // 5 minutes
        maxSize: 1000,
      },
      rateLimit: {
        enabled: true,
        strategy: 'exponential',
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 60000,
      },
      ...clientConfig,
    };

    this.octokit = new Octokit({
      auth: this.config.token,
      userAgent: this.config.userAgent,
      baseUrl: this.config.baseUrl,
      previews: this.config.previews,
      timeout: this.config.timeout,
      retry: {
        enabled: this.config.retries.enabled,
        retries: this.config.retries.retries,
      },
      throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
          this.logger.warn({
            retryAfter,
          options,
          retryCount,
        }, `Request quota exhausted for request ${options.method} ${options.url}`);

        if (retryCount < this.config.rateLimit.maxRetries) {
          this.logger.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        this.logger.warn({
          retryAfter,
          options,
        }, `Secondary rate limit hit for request ${options.method} ${options.url}`);
      },
    },
  });

  this.logger.info('GitHub client initialized');
}

/**
 * Get current rate limit status for all resources
 */
async getRateLimit(): Promise<Record<string, RateLimitInfo>> {
  try {
    const response = await this.octokit.rest.rateLimit.get();
    const rateLimits: Record<string, RateLimitInfo> = {};

    for (const [resource, limit] of Object.entries(response.data.resources)) {
      const rateLimitInfo: RateLimitInfo = {
        limit: (limit as any).limit,
        remaining: (limit as any).remaining,
        reset: new Date((limit as any).reset * 1000),
        used: (limit as any).used || ((limit as any).limit - (limit as any).remaining),
        resource,
      };

      rateLimits[resource] = rateLimitInfo;
      this.rateLimitInfo.set(resource, rateLimitInfo);
    }

    return rateLimits;
  } catch (error) {
    this.logger.error({ err: error }, 'Failed to get rate limit status');
    throw this.handleError(error);
  }
}

/**
 * Check if we can make a request to a specific resource
 */
canMakeRequest(resource: string = 'core'): boolean {
  const rateLimitInfo = this.rateLimitInfo.get(resource);
  if (!rateLimitInfo) return true;

  if (rateLimitInfo.remaining <= 0) {
    const now = new Date();
    if (now < rateLimitInfo.reset) {
      return false;
    }
  }

  return true;
}

/**
 * Get time until rate limit resets for a resource
 */
getTimeUntilReset(resource: string = 'core'): number {
  const rateLimitInfo = this.rateLimitInfo.get(resource);
  if (!rateLimitInfo) return 0;

  const now = new Date();
  return Math.max(0, rateLimitInfo.reset.getTime() - now.getTime());
}

/**
 * Make a request with caching and rate limiting
 */
private async makeRequest<T>(
  requestFn: () => Promise<T>,
  cacheKey?: string,
  priority: number = 1
): Promise<T> {
  // Check cache first
  if (cacheKey && this.config.cache.enabled) {
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      this.logger.debug({ cacheKey }, 'Cache hit');
      return cached.data;
    }
  }

  // Add to queue if rate limiting is enabled
  if (this.config.rateLimit.enabled && !this.canMakeRequest()) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        request: requestFn,
        resolve,
        reject,
        priority,
      });
      
      // Sort queue by priority
      this.requestQueue.sort((a, b) => b.priority - a.priority);
      
      this.processQueue();
    });
  }

  try {
    const result = await requestFn();

    // Cache the result
    if (cacheKey && this.config.cache.enabled) {
      this.cache.set(cacheKey, {
        data: result,
        expires: Date.now() + (this.config.cache.ttl * 1000),
      });

      // Clean up cache if it gets too large
      if (this.cache.size > this.config.cache.maxSize) {
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].expires - b[1].expires);
        const toDelete = entries.slice(0, Math.floor(this.config.cache.maxSize * 0.2));
        toDelete.forEach(([key]) => this.cache.delete(key));
      }
    }

    return result;
  } catch (error) {
    throw this.handleError(error);
  }
}

/**
 * Process the request queue
 */
private async processQueue(): Promise<void> {
  if (this.isProcessingQueue || this.requestQueue.length === 0) {
    return;
  }

  this.isProcessingQueue = true;

  while (this.requestQueue.length > 0) {
    if (!this.canMakeRequest()) {
      const waitTime = this.getTimeUntilReset();
      this.logger.info({ waitTime }, 'Waiting for rate limit reset');
      await this.sleep(waitTime);
      continue;
    }

    const queueItem = this.requestQueue.shift();
    if (!queueItem) break;

    try {
      const result = await queueItem.request();
      queueItem.resolve(result);
    } catch (error) {
      queueItem.reject(error);
    }

    // Small delay between requests to be respectful
    await this.sleep(100);
  }

  this.isProcessingQueue = false;
}

/**
 * Sleep for specified milliseconds
 */
private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle GitHub API errors
 */
private handleError(error: any): Error {
  if (error instanceof RequestError) {
    // Update rate limit info from headers
    if (error.response?.headers) {
      const remaining = parseInt(error.response.headers['x-ratelimit-remaining'] || '0');
      const reset = parseInt(error.response.headers['x-ratelimit-reset'] || '0');
      const resource = error.response.headers['x-ratelimit-resource'] || 'core';

      if (reset > 0) {
        this.rateLimitInfo.set(resource, {
          limit: parseInt(error.response.headers['x-ratelimit-limit'] || '0'),
          remaining,
          reset: new Date(reset * 1000),
          used: parseInt(error.response.headers['x-ratelimit-used'] || '0'),
          resource,
        });
      }
    }

    // Handle rate limit errors specially
    if (error.status === 403 && error.message.includes('rate limit')) {
      const resetDate = new Date(
        parseInt(error.response?.headers?.['x-ratelimit-reset'] || '0') * 1000
      );
      const remaining = parseInt(error.response?.headers?.['x-ratelimit-remaining'] || '0');

      return new GitHubRateLimitError(
        'GitHub API rate limit exceeded',
        resetDate,
        remaining,
        error.response
      );
    }

    return new GitHubApiError(
      error.message,
      error.status || 500,
      error.response,
      error.request,
      error.documentation_url
    );
  }

  return error;
}

/**
 * Create a cache key for a request
 */
private createCacheKey(method: string, endpoint: string, params?: any): string {
  const paramString = params ? JSON.stringify(params) : '';
  return `${method}:${endpoint}:${paramString}`;
}

/**
 * Get the raw Octokit instance
 */
getOctokit(): Octokit {
  return this.octokit;
}

/**
 * Test the connection and token validity
 */
async testConnection(): Promise<{
  connected: boolean;
  user?: string;
  scopes?: string[];
  rateLimit?: RateLimitInfo;
  error?: string;
}> {
  try {
    const [userResponse, rateLimitResponse] = await Promise.all([
      this.octokit.rest.users.getAuthenticated(),
      this.getRateLimit(),
    ]);

    return {
      connected: true,
      user: userResponse.data.login,
      scopes: (userResponse.headers['x-oauth-scopes'] || '').split(',').map(s => s.trim()),
      rateLimit: rateLimitResponse.core,
    };
  } catch (error) {
    this.logger.error({ err: error }, 'GitHub connection test failed');
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch requests with automatic retry and rate limiting
 */
async batchRequest<T>(
  requests: Array<() => Promise<T>>,
  batchSize: number = 10,
  delayBetweenBatches: number = 1000
): Promise<T[]> {
  const results: T[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (request, index) => {
      try {
        const result = await this.makeRequest(request, undefined, 1);
        return { index: i + index, result, error: null };
      } catch (error) {
        return { index: i + index, result: null, error: error as Error };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { index, result, error } of batchResults) {
      if (error) {
        errors.push(error);
        this.logger.warn({ err: error, index }, 'Batch request failed');
      } else {
        results[index] = result;
      }
    }

    // Delay between batches
    if (i + batchSize < requests.length && delayBetweenBatches > 0) {
      await this.sleep(delayBetweenBatches);
    }
  }

  if (errors.length > 0) {
    this.logger.warn({ errorCount: errors.length, totalRequests: requests.length }, 
      'Some batch requests failed');
  }

  return results.filter(result => result !== undefined);
}

/**
 * Clear cache
 */
clearCache(): void {
  this.cache.clear();
  this.logger.debug('Cache cleared');
}

/**
 * Get cache statistics
 */
getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
  entries: Array<{ key: string; expires: Date; size: number }>;
} {
  const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
    key,
    expires: new Date(value.expires),
    size: JSON.stringify(value.data).length,
  }));

  return {
    size: this.cache.size,
    maxSize: this.config.cache.maxSize,
    hitRate: 0, // TODO: Implement hit rate tracking
    entries,
  };
}

/**
 * Dispose of the client and clear resources
 */
dispose(): void {
  this.clearCache();
  this.requestQueue.length = 0;
  this.rateLimitInfo.clear();
  this.logger.info('GitHub client disposed');
}
}