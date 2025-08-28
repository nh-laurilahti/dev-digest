import { GitHubClient } from '../clients/github';
import { RepositoryService } from './repositories';
import { Logger, createLogger } from '../lib/logger';
import { 
  GitHubValidationError,
  GitHubRepository,
  RateLimitInfo 
} from '../types/github';
import { ValidationError, ExternalServiceError } from '../lib/errors';

export interface RepositoryValidationResult {
  isValid: boolean;
  repository?: GitHubRepository;
  errors: string[];
  warnings: string[];
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
    scopes: string[];
  };
  metadata: {
    exists: boolean;
    accessible: boolean;
    private: boolean;
    archived: boolean;
    disabled: boolean;
    fork: boolean;
    hasIssues: boolean;
    hasPullRequests: boolean;
    hasWiki: boolean;
    hasPages: boolean;
    size: number;
    language: string | null;
    topics: string[];
    lastUpdate: string;
  };
  rateLimit?: RateLimitInfo;
}

export interface TokenValidationResult {
  isValid: boolean;
  user?: string;
  scopes: string[];
  errors: string[];
  permissions: {
    canReadRepos: boolean;
    canReadUser: boolean;
    canReadOrg: boolean;
    canWebhooks: boolean;
  };
  rateLimit: Record<string, RateLimitInfo>;
}

export interface ValidationOptions {
  checkPermissions?: boolean;
  checkRateLimit?: boolean;
  checkContent?: boolean;
  requiredScopes?: string[];
  minimumPermissions?: {
    read?: boolean;
    write?: boolean;
    admin?: boolean;
  };
}

export class RepoValidationService {
  private client: GitHubClient;
  private repositoryService: RepositoryService;
  private logger: Logger;

  constructor(client: GitHubClient) {
    this.client = client;
    this.repositoryService = new RepositoryService(client);
    this.logger = createLogger({ component: 'repo-validation' });
  }

  /**
   * Validate repository access and configuration
   */
  async validateRepository(
    owner: string,
    repo: string,
    options: ValidationOptions = {}
  ): Promise<RepositoryValidationResult> {
    this.logger.debug({ owner, repo, options }, 'Starting repository validation');

    const result: RepositoryValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      permissions: {
        canRead: false,
        canWrite: false,
        canAdmin: false,
        scopes: [],
      },
      metadata: {
        exists: false,
        accessible: false,
        private: false,
        archived: false,
        disabled: false,
        fork: false,
        hasIssues: false,
        hasPullRequests: false,
        hasWiki: false,
        hasPages: false,
        size: 0,
        language: null,
        topics: [],
        lastUpdate: '',
      },
    };

    try {
      // 1. Check if repository exists and is accessible
      await this.validateRepositoryExists(owner, repo, result);

      if (!result.metadata.exists) {
        result.isValid = false;
        return result;
      }

      // 2. Validate permissions if requested
      if (options.checkPermissions) {
        await this.validatePermissions(owner, repo, result, options.minimumPermissions);
      }

      // 3. Check rate limits if requested
      if (options.checkRateLimit) {
        await this.validateRateLimit(result);
      }

      // 4. Check repository content/structure if requested
      if (options.checkContent) {
        await this.validateRepositoryContent(owner, repo, result);
      }

      // 5. Validate token scopes if required
      if (options.requiredScopes && options.requiredScopes.length > 0) {
        await this.validateTokenScopes(result, options.requiredScopes);
      }

      // Set overall validation result
      result.isValid = result.errors.length === 0;

      this.logger.info({ 
        owner, 
        repo,
        isValid: result.isValid,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length
      }, 'Repository validation completed');

      return result;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Repository validation failed');
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
      return result;
    }
  }

  /**
   * Validate GitHub token and its capabilities
   */
  async validateToken(): Promise<TokenValidationResult> {
    this.logger.debug('Validating GitHub token');

    const result: TokenValidationResult = {
      isValid: true,
      scopes: [],
      errors: [],
      permissions: {
        canReadRepos: false,
        canReadUser: false,
        canReadOrg: false,
        canWebhooks: false,
      },
      rateLimit: {},
    };

    try {
      // Test connection and get token info
      const connectionTest = await this.client.testConnection();
      
      if (!connectionTest.connected) {
        result.isValid = false;
        result.errors.push(connectionTest.error || 'Failed to connect to GitHub');
        return result;
      }

      result.user = connectionTest.user;
      result.scopes = connectionTest.scopes || [];
      result.rateLimit = await this.client.getRateLimit();

      // Check permissions based on scopes
      result.permissions = this.analyzeTokenPermissions(result.scopes);

      // Validate minimum required permissions
      if (!result.permissions.canReadRepos) {
        result.errors.push('Token lacks repository read permissions');
      }

      if (!result.permissions.canReadUser) {
        result.warnings.push('Token lacks user read permissions - some features may be limited');
      }

      result.isValid = result.errors.length === 0;

      this.logger.info({
        user: result.user,
        scopes: result.scopes,
        isValid: result.isValid,
        errorsCount: result.errors.length
      }, 'Token validation completed');

      return result;
    } catch (error) {
      this.logger.error({ err: error }, 'Token validation failed');
      result.errors.push(`Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
      return result;
    }
  }

  /**
   * Batch validate multiple repositories
   */
  async validateRepositories(
    repositories: Array<{ owner: string; repo: string }>,
    options: ValidationOptions = {}
  ): Promise<Map<string, RepositoryValidationResult>> {
    this.logger.debug({ 
      count: repositories.length, 
      options 
    }, 'Starting batch repository validation');

    const results = new Map<string, RepositoryValidationResult>();

    // Process in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async ({ owner, repo }) => {
        const key = `${owner}/${repo}`;
        try {
          const result = await this.validateRepository(owner, repo, options);
          return { key, result };
        } catch (error) {
          this.logger.warn({ err: error, owner, repo }, 'Repository validation failed in batch');
          return {
            key,
            result: {
              isValid: false,
              errors: [`Batch validation failed: ${error}`],
              warnings: [],
              permissions: {
                canRead: false,
                canWrite: false,
                canAdmin: false,
                scopes: [],
              },
              metadata: {
                exists: false,
                accessible: false,
                private: false,
                archived: false,
                disabled: false,
                fork: false,
                hasIssues: false,
                hasPullRequests: false,
                hasWiki: false,
                hasPages: false,
                size: 0,
                language: null,
                topics: [],
                lastUpdate: '',
              },
            } as RepositoryValidationResult,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ key, result }) => {
        results.set(key, result);
      });

      // Small delay between batches
      if (i + batchSize < repositories.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.logger.info({ 
      total: repositories.length,
      validated: results.size,
      valid: Array.from(results.values()).filter(r => r.isValid).length
    }, 'Batch repository validation completed');

    return results;
  }

  /**
   * Check repository configuration for digest generation
   */
  async validateRepositoryForDigest(
    owner: string,
    repo: string
  ): Promise<RepositoryValidationResult & {
    digestReadiness: {
      canGenerateDigest: boolean;
      hasPullRequests: boolean;
      hasRecentActivity: boolean;
      hasContributors: boolean;
      issues: string[];
      recommendations: string[];
    };
  }> {
    const baseResult = await this.validateRepository(owner, repo, {
      checkPermissions: true,
      checkContent: true,
      checkRateLimit: true,
    });

    const digestReadiness = {
      canGenerateDigest: true,
      hasPullRequests: false,
      hasRecentActivity: false,
      hasContributors: false,
      issues: [] as string[],
      recommendations: [] as string[],
    };

    try {
      if (baseResult.repository) {
        // Check for recent activity (within last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const lastUpdate = new Date(baseResult.repository.updated_at);
        digestReadiness.hasRecentActivity = lastUpdate > thirtyDaysAgo;

        if (!digestReadiness.hasRecentActivity) {
          digestReadiness.issues.push('Repository has no recent activity (last 30 days)');
          digestReadiness.recommendations.push('Consider checking if this repository is still active');
        }

        // Check for contributors
        try {
          const contributors = await this.repositoryService.getContributors(owner, repo, { per_page: 10 });
          digestReadiness.hasContributors = contributors.length > 0;

          if (!digestReadiness.hasContributors) {
            digestReadiness.issues.push('Repository has no contributors');
          } else if (contributors.length === 1) {
            digestReadiness.recommendations.push('Repository has only one contributor - digest may be limited');
          }
        } catch (error) {
          digestReadiness.issues.push('Could not fetch contributors information');
        }

        // Check if repository is archived or disabled
        if (baseResult.repository.archived) {
          digestReadiness.issues.push('Repository is archived');
          digestReadiness.canGenerateDigest = false;
        }

        if (baseResult.repository.disabled) {
          digestReadiness.issues.push('Repository is disabled');
          digestReadiness.canGenerateDigest = false;
        }

        // Check for private repository limitations
        if (baseResult.repository.private && !baseResult.permissions.canRead) {
          digestReadiness.issues.push('Private repository requires read permissions');
          digestReadiness.canGenerateDigest = false;
        }

        // Set overall digest readiness
        digestReadiness.canGenerateDigest = 
          digestReadiness.canGenerateDigest && 
          digestReadiness.issues.length === 0 &&
          baseResult.isValid;
      }
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to check digest readiness');
      digestReadiness.issues.push('Failed to check digest readiness');
      digestReadiness.canGenerateDigest = false;
    }

    return { ...baseResult, digestReadiness };
  }

  // Private helper methods

  private async validateRepositoryExists(
    owner: string,
    repo: string,
    result: RepositoryValidationResult
  ): Promise<void> {
    try {
      const repository = await this.repositoryService.getRepository(owner, repo);
      result.repository = repository;
      result.metadata.exists = true;
      result.metadata.accessible = true;
      result.metadata.private = repository.private;
      result.metadata.archived = repository.archived;
      result.metadata.disabled = repository.disabled;
      result.metadata.fork = repository.fork || false;
      result.metadata.hasIssues = repository.has_issues || false;
      result.metadata.hasPullRequests = !repository.archived && !repository.disabled;
      result.metadata.hasWiki = repository.has_wiki || false;
      result.metadata.hasPages = repository.has_pages || false;
      result.metadata.size = repository.size || 0;
      result.metadata.language = repository.language;
      result.metadata.lastUpdate = repository.updated_at;

      // Get topics
      try {
        result.metadata.topics = await this.repositoryService.getTopics(owner, repo);
      } catch (error) {
        this.logger.warn({ err: error, owner, repo }, 'Failed to fetch repository topics');
        result.warnings.push('Could not fetch repository topics');
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('Not Found')) {
        result.errors.push(`Repository ${owner}/${repo} does not exist or is not accessible`);
      } else {
        result.errors.push(`Failed to access repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      result.metadata.exists = false;
      result.metadata.accessible = false;
    }
  }

  private async validatePermissions(
    owner: string,
    repo: string,
    result: RepositoryValidationResult,
    minimumPermissions?: {
      read?: boolean;
      write?: boolean;
      admin?: boolean;
    }
  ): Promise<void> {
    try {
      const access = await this.repositoryService.validateRepositoryAccess(owner, repo);
      
      result.permissions.canRead = access.permissions.pull;
      result.permissions.canWrite = access.permissions.push;
      result.permissions.canAdmin = access.permissions.admin;

      // Check minimum permissions if specified
      if (minimumPermissions?.read && !result.permissions.canRead) {
        result.errors.push('Insufficient permissions: read access required');
      }

      if (minimumPermissions?.write && !result.permissions.canWrite) {
        result.errors.push('Insufficient permissions: write access required');
      }

      if (minimumPermissions?.admin && !result.permissions.canAdmin) {
        result.errors.push('Insufficient permissions: admin access required');
      }

      // Warnings for limited permissions
      if (!result.permissions.canWrite) {
        result.warnings.push('Write access not available - some features may be limited');
      }

      if (!result.permissions.canAdmin) {
        result.warnings.push('Admin access not available - webhook setup not possible');
      }

    } catch (error) {
      result.errors.push(`Failed to validate permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateRateLimit(result: RepositoryValidationResult): Promise<void> {
    try {
      const rateLimits = await this.client.getRateLimit();
      const coreLimit = rateLimits.core;
      
      result.rateLimit = coreLimit;

      if (coreLimit.remaining < 100) {
        result.warnings.push(`Low rate limit remaining: ${coreLimit.remaining}/${coreLimit.limit}`);
      }

      if (coreLimit.remaining === 0) {
        result.errors.push('Rate limit exceeded - cannot perform additional requests');
      }

    } catch (error) {
      result.warnings.push(`Failed to check rate limits: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateRepositoryContent(
    owner: string,
    repo: string,
    result: RepositoryValidationResult
  ): Promise<void> {
    try {
      // Check for important files
      const importantFiles = ['README.md', 'README.rst', 'README.txt', 'package.json', 'pom.xml', 'Cargo.toml'];
      
      for (const file of importantFiles) {
        try {
          await this.repositoryService.getFileContents(owner, repo, file);
          result.warnings.push(`Found ${file}`);
          break; // Found at least one important file
        } catch (error) {
          // File doesn't exist, continue checking
        }
      }

      // Check for recent commits
      const commits = await this.repositoryService.getCommits(owner, repo, { per_page: 10 });
      if (commits.length === 0) {
        result.warnings.push('Repository has no commits');
      } else {
        const latestCommit = new Date(commits[0].author?.date || commits[0].committer?.date || '');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (latestCommit < thirtyDaysAgo) {
          result.warnings.push('No recent commits (last 30 days)');
        }
      }

    } catch (error) {
      result.warnings.push(`Failed to validate repository content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateTokenScopes(
    result: RepositoryValidationResult,
    requiredScopes: string[]
  ): Promise<void> {
    try {
      const tokenValidation = await this.validateToken();
      result.permissions.scopes = tokenValidation.scopes;

      const missingScopes = requiredScopes.filter(scope => 
        !tokenValidation.scopes.includes(scope)
      );

      if (missingScopes.length > 0) {
        result.errors.push(`Missing required token scopes: ${missingScopes.join(', ')}`);
      }

    } catch (error) {
      result.errors.push(`Failed to validate token scopes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private analyzeTokenPermissions(scopes: string[]) {
    return {
      canReadRepos: scopes.includes('repo') || scopes.includes('public_repo'),
      canReadUser: scopes.includes('user') || scopes.includes('user:email'),
      canReadOrg: scopes.includes('read:org'),
      canWebhooks: scopes.includes('repo') || scopes.includes('admin:repo_hook'),
    };
  }
}