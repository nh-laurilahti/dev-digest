import { 
  DigestOptions, 
  GenerationResult, 
  DigestContent, 
  GitHubPullRequest, 
  PRAnalysis,
  DigestStatistics
} from '../types/digest';
import { PRAnalysisService } from './pr-analysis';
import { StatisticsService } from './statistics';
import { SummaryGeneratorService } from './summary-generator';
import { MarkdownService } from './markdown';
import { AISummaryService } from './ai-summary';
import { TemplateService } from './templates';
import { logger } from '../lib/logger';
import { config } from '../lib/config';

/**
 * Main Digest Service
 * 
 * Orchestrates the entire digest generation process including:
 * - PR data fetching and analysis
 * - Statistics calculation
 * - Summary generation
 * - Template rendering
 * - AI enhancement (optional)
 * - Output formatting
 */
export class DigestService {
  private prAnalysisService: PRAnalysisService;
  private statisticsService: StatisticsService;
  private summaryGeneratorService: SummaryGeneratorService;
  private markdownService: MarkdownService;
  private aiSummaryService: AISummaryService;
  private templateService: TemplateService;

  constructor() {
    this.prAnalysisService = new PRAnalysisService();
    this.statisticsService = new StatisticsService();
    this.summaryGeneratorService = new SummaryGeneratorService();
    this.markdownService = new MarkdownService();
    this.aiSummaryService = new AISummaryService();
    this.templateService = new TemplateService();
  }

  /**
   * Generate a complete digest from GitHub data
   */
  public async generateDigest(
    githubPRs: GitHubPullRequest[],
    options: DigestOptions
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const metadata = {
      processingTime: 0,
      dataPoints: githubPRs.length,
      cacheHits: 0,
      apiCalls: 0
    };

    try {
      logger.info(`Starting digest generation for ${githubPRs.length} PRs`);

      // Step 1: Analyze pull requests
      logger.info('Step 1: Analyzing pull requests...');
      const prAnalyses = await this.prAnalysisService.analyzePRsBatch(githubPRs);
      logger.info(`Analyzed ${prAnalyses.length} PRs`);

      // Step 2: Generate statistics
      logger.info('Step 2: Generating statistics...');
      const repositoryInfo = this.extractRepositoryInfo(options);
      const statistics = await this.statisticsService.generateStatistics(
        repositoryInfo,
        prAnalyses,
        options.dateFrom,
        options.dateTo
      );

      // Step 3: Generate AI insights (if enabled)
      let aiInsights;
      if (options.includeAISummary) {
        try {
          logger.info('Step 3: Generating AI insights...');
          aiInsights = await this.aiSummaryService.generateDigestInsights(
            statistics,
            prAnalyses,
            options
          );
        } catch (error) {
          logger.warn('AI insights generation failed:', error);
          aiInsights = undefined;
        }
      }

      // Step 4: Generate digest content
      logger.info('Step 4: Generating digest content...');
      const digestContent = await this.summaryGeneratorService.generateDigestContent(
        statistics,
        prAnalyses,
        options,
        aiInsights
      );

      // Step 5: Render output formats
      logger.info('Step 5: Rendering output formats...');
      const outputs = await this.renderOutputs(digestContent, options);

      const processingTime = Date.now() - startTime;
      metadata.processingTime = processingTime;

      logger.info(`Digest generation completed in ${processingTime}ms`);

      return {
        success: true,
        digest: digestContent,
        markdown: outputs.markdown,
        html: outputs.html,
        metadata
      };

    } catch (error) {
      logger.error('Digest generation failed:', error);
      
      const processingTime = Date.now() - startTime;
      metadata.processingTime = processingTime;

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'DIGEST_GENERATION_ERROR',
          details: error
        },
        metadata
      };
    }
  }

  /**
   * Generate digest from repository data with automatic PR fetching
   */
  public async generateDigestFromRepository(options: DigestOptions): Promise<GenerationResult> {
    try {
      logger.info(`Fetching PRs for repository: ${options.repository}`);
      
      // Fetch PR data from GitHub
      const githubPRs = await this.fetchGitHubPRs(options);
      
      // Generate digest
      return await this.generateDigest(githubPRs, options);
      
    } catch (error) {
      logger.error('Failed to generate digest from repository:', error);
      
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Repository fetch failed',
          code: 'REPOSITORY_FETCH_ERROR',
          details: error
        },
        metadata: {
          processingTime: 0,
          dataPoints: 0,
          cacheHits: 0,
          apiCalls: 0
        }
      };
    }
  }

  /**
   * Batch generate digests for multiple repositories
   */
  public async generateBatchDigests(
    repositories: Array<{ repository: string; options: Partial<DigestOptions> }>,
    defaultOptions: DigestOptions
  ): Promise<Array<{ repository: string; result: GenerationResult }>> {
    logger.info(`Starting batch digest generation for ${repositories.length} repositories`);
    
    const results: Array<{ repository: string; result: GenerationResult }> = [];
    const batchSize = 5; // Process 5 repositories at a time

    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async ({ repository, options: repoOptions }) => {
        const fullOptions = { ...defaultOptions, ...repoOptions, repository };
        
        try {
          const result = await this.generateDigestFromRepository(fullOptions);
          return { repository, result };
        } catch (error) {
          logger.error(`Failed to generate digest for ${repository}:`, error);
          return {
            repository,
            result: {
              success: false,
              error: {
                message: error instanceof Error ? error.message : 'Batch generation failed',
                code: 'BATCH_GENERATION_ERROR',
                details: error
              },
              metadata: {
                processingTime: 0,
                dataPoints: 0,
                cacheHits: 0,
                apiCalls: 0
              }
            }
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < repositories.length) {
        logger.info(`Completed batch ${Math.floor(i / batchSize) + 1}, waiting before next batch...`);
        await this.delay(2000);
      }
    }

    logger.info(`Completed batch digest generation for ${repositories.length} repositories`);
    return results;
  }

  /**
   * Generate preview digest with limited data
   */
  public async generatePreviewDigest(
    options: DigestOptions,
    maxPRs: number = 20
  ): Promise<GenerationResult> {
    logger.info(`Generating preview digest for ${options.repository}`);
    
    try {
      // Fetch limited PR data
      const githubPRs = await this.fetchGitHubPRs(options, maxPRs);
      
      // Generate with concise options
      const previewOptions: DigestOptions = {
        ...options,
        detailLevel: 'concise',
        includeAISummary: false,
        includeCodeAnalysis: false
      };
      
      return await this.generateDigest(githubPRs, previewOptions);
      
    } catch (error) {
      logger.error('Preview digest generation failed:', error);
      throw error;
    }
  }

  /**
   * Validate digest generation options
   */
  public validateOptions(options: Partial<DigestOptions>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!options.repository) {
      errors.push('Repository is required');
    }

    if (!options.dateFrom || !options.dateTo) {
      errors.push('Date range (dateFrom and dateTo) is required');
    }

    if (options.dateFrom && options.dateTo) {
      if (options.dateFrom >= options.dateTo) {
        errors.push('dateFrom must be before dateTo');
      }

      const daysDiff = Math.ceil((options.dateTo.getTime() - options.dateFrom.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        errors.push('Date range cannot exceed 365 days');
      }
    }

    if (options.customFilters?.minImpact) {
      const validImpacts = ['minor', 'moderate', 'major', 'critical'];
      if (!validImpacts.includes(options.customFilters.minImpact)) {
        errors.push('Invalid minImpact filter value');
      }
    }

    if (options.aiProvider && !['openai', 'anthropic'].includes(options.aiProvider)) {
      errors.push('Invalid AI provider. Must be "openai" or "anthropic"');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get digest generation status
   */
  public async getDigestStatus(digestId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    estimatedCompletion?: Date;
  }> {
    // This would typically query a job queue or database
    // For now, return a placeholder
    return {
      id: digestId,
      status: 'completed',
      progress: 100
    };
  }

  /**
   * Cancel digest generation
   */
  public async cancelDigest(digestId: string): Promise<boolean> {
    logger.info(`Cancelling digest generation: ${digestId}`);
    // Implementation would depend on job queue system
    return true;
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    lastChecked: Date;
  }> {
    const services = {
      prAnalysis: true,
      statistics: true,
      summaryGenerator: true,
      markdown: true,
      aiSummary: !!config.OPENAI_API_KEY || !!config.ANTHROPIC_API_KEY,
      templates: true
    };

    const unhealthyServices = Object.values(services).filter(healthy => !healthy).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyServices > 0) {
      status = unhealthyServices > 2 ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      services,
      lastChecked: new Date()
    };
  }

  /**
   * Extract repository information from options
   */
  private extractRepositoryInfo(options: DigestOptions): {
    name: string;
    path: string;
    defaultBranch: string;
  } {
    const parts = options.repository.split('/');
    const name = parts.length >= 2 ? parts.slice(-2).join('/') : options.repository;
    
    return {
      name,
      path: options.repository,
      defaultBranch: 'main' // Could be fetched from GitHub API
    };
  }

  /**
   * Render digest in different output formats
   */
  private async renderOutputs(
    content: DigestContent,
    options: DigestOptions
  ): Promise<{ markdown?: string; html?: string }> {
    const outputs: { markdown?: string; html?: string } = {};

    try {
      // Use template if specified
      if (options.template) {
        const templateResult = await this.templateService.renderDigest(
          content,
          options.template
        );
        
        if (templateResult.markdown) {
          outputs.markdown = templateResult.markdown;
        }
        if (templateResult.html) {
          outputs.html = templateResult.html;
        }
      } else {
        // Default rendering
        if (options.format === 'markdown' || options.format === 'json') {
          outputs.markdown = await this.markdownService.generateMarkdown(content);
        }
        
        if (options.format === 'html') {
          const markdown = await this.markdownService.generateMarkdown(content);
          outputs.html = await this.markdownService.markdownToHtml(markdown, {
            includeStyles: true,
            theme: 'default'
          });
        }
      }

      return outputs;
    } catch (error) {
      logger.error('Error rendering outputs:', error);
      
      // Fallback to basic markdown
      try {
        outputs.markdown = await this.markdownService.generateMarkdown(content);
        return outputs;
      } catch (fallbackError) {
        logger.error('Fallback rendering also failed:', fallbackError);
        throw new Error('Failed to render digest in any format');
      }
    }
  }

  /**
   * Fetch GitHub pull requests
   */
  private async fetchGitHubPRs(
    options: DigestOptions,
    limit?: number
  ): Promise<GitHubPullRequest[]> {
    const [owner, repo] = options.repository.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Expected "owner/repo"');
    }

    const since = options.dateFrom.toISOString();
    const until = options.dateTo.toISOString();
    
    // Build GitHub API URL
    let url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&since=${since}`;
    if (limit) {
      url += `&per_page=${limit}`;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Daily-Dev-Digest/1.0.0'
    };

    if (config.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
    }

    try {
      logger.info(`Fetching PRs from GitHub: ${url}`);
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const prs = await response.json();
      
      // Filter PRs by date range more precisely
      const filteredPRs = prs.filter((pr: any) => {
        const createdAt = new Date(pr.created_at);
        const updatedAt = new Date(pr.updated_at);
        
        return (createdAt >= options.dateFrom && createdAt <= options.dateTo) ||
               (updatedAt >= options.dateFrom && updatedAt <= options.dateTo);
      });

      // Transform GitHub PR format to our format
      const transformedPRs: GitHubPullRequest[] = filteredPRs.map((pr: any) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        merged: pr.merged_at !== null,
        draft: pr.draft,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        closed_at: pr.closed_at,
        merged_at: pr.merged_at,
        merge_commit_sha: pr.merge_commit_sha,
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha
        },
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha
        },
        user: {
          login: pr.user.login,
          id: pr.user.id,
          avatar_url: pr.user.avatar_url
        },
        assignees: pr.assignees?.map((a: any) => ({
          login: a.login,
          id: a.id
        })) || [],
        labels: pr.labels?.map((l: any) => ({
          name: l.name,
          color: l.color,
          description: l.description
        })) || [],
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changed_files: pr.changed_files || 0,
        commits: pr.commits || 0,
        comments: pr.comments || 0,
        review_comments: pr.review_comments || 0
      }));

      logger.info(`Fetched ${transformedPRs.length} PRs from GitHub`);
      return transformedPRs;

    } catch (error) {
      logger.error('Failed to fetch GitHub PRs:', error);
      throw error;
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service configuration
   */
  public getServiceConfig(): {
    prAnalysis: any;
    ai: any;
    features: {
      aiSummary: boolean;
      codeAnalysis: boolean;
      templates: boolean;
    };
  } {
    return {
      prAnalysis: this.prAnalysisService.getConfig(),
      ai: this.aiSummaryService.getConfig(),
      features: {
        aiSummary: !!config.OPENAI_API_KEY || !!config.ANTHROPIC_API_KEY,
        codeAnalysis: true,
        templates: true
      }
    };
  }

  /**
   * Update service configuration
   */
  public updateServiceConfig(updates: {
    prAnalysis?: any;
    ai?: any;
  }): void {
    if (updates.prAnalysis) {
      this.prAnalysisService.updateConfig(updates.prAnalysis);
    }
    
    if (updates.ai) {
      this.aiSummaryService.updateConfig(updates.ai);
    }
  }

  /**
   * Export digest data for external use
   */
  public async exportDigestData(
    digestContent: DigestContent,
    format: 'json' | 'csv' | 'excel'
  ): Promise<string | Buffer> {
    switch (format) {
      case 'json':
        return JSON.stringify(digestContent, null, 2);
        
      case 'csv':
        return this.statisticsService.exportStatistics(
          digestContent.sections.statistics,
          'csv'
        );
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}