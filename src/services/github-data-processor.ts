import { GitHubClient } from '../clients/github';
import { RepositoryService } from './repositories';
import { PullRequestService } from './pull-requests';
import { Logger, createLogger } from '../lib/logger';
import {
  GitHubRepository,
  GitHubPullRequest,
  GitHubIssue,
  GitHubCommit,
  GitHubUser,
  ContributorAnalysis,
  RepositoryStatistics,
  EnhancedPullRequest,
} from '../types/github';
import { ExternalServiceError } from '../lib/errors';

export interface DigestData {
  repository: GitHubRepository;
  period: {
    start: string;
    end: string;
    days: number;
  };
  summary: {
    totalCommits: number;
    totalPullRequests: number;
    totalIssues: number;
    totalContributors: number;
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
    activity_score: number;
  };
  pullRequests: {
    opened: EnhancedPullRequest[];
    merged: EnhancedPullRequest[];
    closed: EnhancedPullRequest[];
    inProgress: EnhancedPullRequest[];
    stats: {
      avgTimeToMerge: number;
      avgLinesChanged: number;
      avgFilesChanged: number;
      mostActiveContributor: string | null;
      mostActiveReviewer: string | null;
    };
  };
  commits: {
    recent: GitHubCommit[];
    byAuthor: Record<string, GitHubCommit[]>;
    stats: {
      dailyActivity: Record<string, number>;
      topContributors: Array<{
        author: string;
        commits: number;
        additions: number;
        deletions: number;
      }>;
    };
  };
  contributors: {
    active: ContributorAnalysis[];
    new: GitHubUser[];
    stats: {
      totalActive: number;
      totalNew: number;
      collaborationIndex: number;
    };
  };
  insights: {
    trends: {
      activity: 'increasing' | 'decreasing' | 'stable';
      codeHealth: 'improving' | 'declining' | 'stable';
      collaboration: 'increasing' | 'decreasing' | 'stable';
    };
    highlights: string[];
    concerns: string[];
    recommendations: string[];
  };
  metadata: {
    generatedAt: string;
    dataFreshness: string;
    coverageComplete: boolean;
    apiCallsUsed: number;
  };
}

export interface DataProcessingOptions {
  period: {
    start: string;
    end: string;
  };
  includeDetailed?: boolean;
  maxPullRequests?: number;
  maxCommits?: number;
  includeInsights?: boolean;
}

export class GitHubDataProcessor {
  private client: GitHubClient;
  private repositoryService: RepositoryService;
  private pullRequestService: PullRequestService;
  private logger: Logger;
  private apiCallsCounter: number = 0;

  constructor(client: GitHubClient) {
    this.client = client;
    this.repositoryService = new RepositoryService(client);
    this.pullRequestService = new PullRequestService(client);
    this.logger = createLogger({ component: 'github-data-processor' });
  }

  /**
   * Generate comprehensive digest data for a repository
   */
  async generateDigest(
    owner: string,
    repo: string,
    options: DataProcessingOptions
  ): Promise<DigestData> {
    const startTime = Date.now();
    this.apiCallsCounter = 0;

    this.logger.info({ 
      owner, 
      repo, 
      period: options.period 
    }, 'Starting digest generation');

    try {
      // 1. Get repository information
      const repository = await this.repositoryService.getRepository(owner, repo);
      this.incrementApiCalls();

      // 2. Calculate period information
      const startDate = new Date(options.period.start);
      const endDate = new Date(options.period.end);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 3. Fetch data in parallel
      const [pullRequestsData, commits, contributors] = await Promise.all([
        this.fetchPullRequestsData(owner, repo, options),
        this.fetchCommitsData(owner, repo, options),
        this.fetchContributorsData(owner, repo, options),
      ]);

      // 4. Process and enhance data
      const processedData: DigestData = {
        repository,
        period: {
          start: options.period.start,
          end: options.period.end,
          days: diffDays,
        },
        summary: this.calculateSummary(pullRequestsData, commits, contributors),
        pullRequests: await this.processPullRequestsData(pullRequestsData, options),
        commits: this.processCommitsData(commits),
        contributors: this.processContributorsData(contributors, pullRequestsData.pullRequests),
        insights: options.includeInsights ? 
          await this.generateInsights(owner, repo, pullRequestsData, commits, contributors) :
          { trends: { activity: 'stable', codeHealth: 'stable', collaboration: 'stable' }, highlights: [], concerns: [], recommendations: [] },
        metadata: {
          generatedAt: new Date().toISOString(),
          dataFreshness: this.calculateDataFreshness(repository.updated_at),
          coverageComplete: true, // TODO: Implement coverage detection
          apiCallsUsed: this.apiCallsCounter,
        },
      };

      const duration = Date.now() - startTime;
      this.logger.info({ 
        owner, 
        repo,
        duration,
        apiCalls: this.apiCallsCounter,
        pullRequests: processedData.pullRequests.opened.length + processedData.pullRequests.merged.length,
        commits: processedData.commits.recent.length,
        contributors: processedData.contributors.active.length
      }, 'Digest generation completed');

      return processedData;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Digest generation failed');
      throw new ExternalServiceError('GitHub', `Digest generation failed: ${error}`);
    }
  }

  /**
   * Generate lightweight digest with essential data only
   */
  async generateLightweightDigest(
    owner: string,
    repo: string,
    options: Omit<DataProcessingOptions, 'includeDetailed'>
  ): Promise<Partial<DigestData>> {
    return this.generateDigest(owner, repo, {
      ...options,
      includeDetailed: false,
      maxPullRequests: 20,
      maxCommits: 50,
      includeInsights: false,
    });
  }

  /**
   * Get repository activity summary for a period
   */
  async getActivitySummary(
    owner: string,
    repo: string,
    period: { start: string; end: string }
  ): Promise<{
    commits: number;
    pullRequests: number;
    issues: number;
    contributors: number;
    linesChanged: number;
    activityScore: number;
  }> {
    try {
      this.logger.debug({ owner, repo, period }, 'Generating activity summary');

      const [pullRequests, commits] = await Promise.all([
        this.pullRequestService.getPullRequests(owner, repo, {
          state: 'all',
          since: period.start,
          until: period.end,
          per_page: 100,
        }),
        this.repositoryService.getCommits(owner, repo, {
          since: period.start,
          until: period.end,
          per_page: 100,
        }),
      ]);

      const contributors = new Set(
        [...pullRequests.map(pr => pr.user.login)]
      );

      const linesChanged = pullRequests.reduce((sum, pr) => 
        sum + (pr.additions || 0) + (pr.deletions || 0), 0
      );

      // Calculate activity score based on various metrics
      const activityScore = this.calculateActivityScore({
        commits: commits.length,
        pullRequests: pullRequests.length,
        contributors: contributors.size,
        linesChanged,
        period: Math.ceil((new Date(period.end).getTime() - new Date(period.start).getTime()) / (1000 * 60 * 60 * 24)),
      });

      return {
        commits: commits.length,
        pullRequests: pullRequests.length,
        issues: 0, // TODO: Implement issue fetching
        contributors: contributors.size,
        linesChanged,
        activityScore,
      };
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to generate activity summary');
      throw new ExternalServiceError('GitHub', `Failed to generate activity summary: ${error}`);
    }
  }

  /**
   * Compare repository activity across different periods
   */
  async compareActivityPeriods(
    owner: string,
    repo: string,
    periods: Array<{ name: string; start: string; end: string }>
  ): Promise<Record<string, {
    summary: any;
    comparison: {
      vsAverage: number;
      trend: 'up' | 'down' | 'stable';
    };
  }>> {
    try {
      this.logger.debug({ owner, repo, periodsCount: periods.length }, 'Comparing activity periods');

      const summaries = await Promise.all(
        periods.map(async period => ({
          name: period.name,
          summary: await this.getActivitySummary(owner, repo, {
            start: period.start,
            end: period.end,
          }),
        }))
      );

      // Calculate comparisons
      const avgActivityScore = summaries.reduce((sum, s) => 
        sum + s.summary.activityScore, 0) / summaries.length;

      const results: Record<string, any> = {};

      for (const { name, summary } of summaries) {
        const vsAverage = ((summary.activityScore - avgActivityScore) / avgActivityScore) * 100;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        
        if (Math.abs(vsAverage) > 10) {
          trend = vsAverage > 0 ? 'up' : 'down';
        }

        results[name] = {
          summary,
          comparison: {
            vsAverage: Math.round(vsAverage),
            trend,
          },
        };
      }

      this.logger.info({ owner, repo, periodsCompared: periods.length }, 'Period comparison completed');
      return results;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to compare activity periods');
      throw new ExternalServiceError('GitHub', `Failed to compare activity periods: ${error}`);
    }
  }

  // Private helper methods

  private async fetchPullRequestsData(
    owner: string,
    repo: string,
    options: DataProcessingOptions
  ) {
    const { pullRequests, statistics } = await this.pullRequestService.getPullRequestsWithStats(
      owner, repo, {
        since: options.period.start,
        until: options.period.end,
        state: 'all',
        includeEnhanced: options.includeDetailed,
      }
    );
    
    this.incrementApiCalls(3); // Approximate API calls for PR data
    return { pullRequests, statistics };
  }

  private async fetchCommitsData(
    owner: string,
    repo: string,
    options: DataProcessingOptions
  ) {
    const commits = await this.repositoryService.getCommits(owner, repo, {
      since: options.period.start,
      until: options.period.end,
      per_page: Math.min(options.maxCommits || 100, 100),
    });
    
    this.incrementApiCalls();
    return commits;
  }

  private async fetchContributorsData(
    owner: string,
    repo: string,
    options: DataProcessingOptions
  ) {
    const contributors = await this.pullRequestService.analyzeContributorActivity(
      owner, repo, {
        since: options.period.start,
        until: options.period.end,
      }
    );
    
    this.incrementApiCalls(2); // Approximate API calls for contributor analysis
    return contributors;
  }

  private calculateSummary(
    pullRequestsData: any,
    commits: GitHubCommit[],
    contributors: ContributorAnalysis[]
  ) {
    const { pullRequests, statistics } = pullRequestsData;

    return {
      totalCommits: commits.length,
      totalPullRequests: pullRequests.length,
      totalIssues: 0, // TODO: Add issues data
      totalContributors: contributors.length,
      totalAdditions: statistics.totalAdditions,
      totalDeletions: statistics.totalDeletions,
      filesChanged: statistics.totalFilesChanged,
      activity_score: this.calculateActivityScore({
        commits: commits.length,
        pullRequests: pullRequests.length,
        contributors: contributors.length,
        linesChanged: statistics.totalAdditions + statistics.totalDeletions,
        period: 7, // TODO: Calculate actual period
      }),
    };
  }

  private async processPullRequestsData(
    pullRequestsData: any,
    options: DataProcessingOptions
  ) {
    const { pullRequests, statistics } = pullRequestsData;

    // Categorize pull requests
    const opened = pullRequests.filter((pr: GitHubPullRequest) => 
      pr.state === 'open' && new Date(pr.created_at) >= new Date(options.period.start)
    );
    
    const merged = pullRequests.filter((pr: GitHubPullRequest) => 
      pr.merged && pr.merged_at && new Date(pr.merged_at) >= new Date(options.period.start)
    );
    
    const closed = pullRequests.filter((pr: GitHubPullRequest) => 
      pr.state === 'closed' && !pr.merged && pr.closed_at && new Date(pr.closed_at) >= new Date(options.period.start)
    );
    
    const inProgress = pullRequests.filter((pr: GitHubPullRequest) => 
      pr.state === 'open' && new Date(pr.created_at) < new Date(options.period.start)
    );

    // Calculate stats
    const mergedPRs = merged.filter((pr: GitHubPullRequest) => pr.merged_at);
    const avgTimeToMerge = mergedPRs.length > 0 ? 
      mergedPRs.reduce((sum: number, pr: GitHubPullRequest) => {
        const created = new Date(pr.created_at).getTime();
        const merged = new Date(pr.merged_at!).getTime();
        return sum + (merged - created);
      }, 0) / mergedPRs.length / (1000 * 60 * 60 * 24) : 0; // Convert to days

    return {
      opened: opened.slice(0, options.maxPullRequests),
      merged: merged.slice(0, options.maxPullRequests),
      closed,
      inProgress,
      stats: {
        avgTimeToMerge: Math.round(avgTimeToMerge * 10) / 10,
        avgLinesChanged: statistics.averageSize,
        avgFilesChanged: statistics.totalFilesChanged / Math.max(pullRequests.length, 1),
        mostActiveContributor: statistics.mostActiveContributor,
        mostActiveReviewer: statistics.mostActiveReviewer,
      },
    };
  }

  private processCommitsData(commits: GitHubCommit[]) {
    // Group commits by author
    const byAuthor: Record<string, GitHubCommit[]> = {};
    const dailyActivity: Record<string, number> = {};

    for (const commit of commits) {
      const author = commit.author?.name || commit.committer?.name || 'Unknown';
      if (!byAuthor[author]) {
        byAuthor[author] = [];
      }
      byAuthor[author].push(commit);

      // Track daily activity
      const date = commit.author?.date || commit.committer?.date;
      if (date) {
        const day = date.split('T')[0];
        dailyActivity[day] = (dailyActivity[day] || 0) + 1;
      }
    }

    // Calculate top contributors
    const topContributors = Object.entries(byAuthor)
      .map(([author, authorCommits]) => ({
        author,
        commits: authorCommits.length,
        additions: authorCommits.reduce((sum, c) => sum + (c.stats?.additions || 0), 0),
        deletions: authorCommits.reduce((sum, c) => sum + (c.stats?.deletions || 0), 0),
      }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10);

    return {
      recent: commits.slice(0, 50),
      byAuthor,
      stats: {
        dailyActivity,
        topContributors,
      },
    };
  }

  private processContributorsData(
    contributors: ContributorAnalysis[],
    pullRequests: GitHubPullRequest[]
  ) {
    // Find new contributors (first contribution in the period)
    const existingContributors = new Set(contributors.map(c => c.user.login));
    const newContributors = pullRequests
      .map(pr => pr.user)
      .filter(user => !existingContributors.has(user.login));

    // Remove duplicates
    const uniqueNewContributors = Array.from(
      new Map(newContributors.map(user => [user.login, user])).values()
    );

    // Calculate collaboration index
    const totalContributions = contributors.reduce((sum, c) => sum + c.total_contributions, 0);
    const avgContributions = totalContributions / Math.max(contributors.length, 1);
    const collaborationIndex = Math.min(100, 
      (contributors.reduce((sum, c) => sum + c.collaboration_score, 0) / Math.max(contributors.length, 1))
    );

    return {
      active: contributors.slice(0, 20), // Top 20 most active
      new: uniqueNewContributors,
      stats: {
        totalActive: contributors.length,
        totalNew: uniqueNewContributors.length,
        collaborationIndex: Math.round(collaborationIndex),
      },
    };
  }

  private async generateInsights(
    owner: string,
    repo: string,
    pullRequestsData: any,
    commits: GitHubCommit[],
    contributors: ContributorAnalysis[]
  ) {
    const highlights: string[] = [];
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Activity trend analysis
    const recentActivity = commits.length + pullRequestsData.pullRequests.length;
    let activityTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (recentActivity > 50) {
      activityTrend = 'increasing';
      highlights.push(`High activity period with ${recentActivity} total events`);
    } else if (recentActivity < 10) {
      activityTrend = 'decreasing';
      concerns.push('Low recent activity detected');
      recommendations.push('Consider investigating reasons for reduced activity');
    }

    // Code health analysis
    const linesChanged = pullRequestsData.statistics.totalAdditions + pullRequestsData.statistics.totalDeletions;
    const avgPRSize = linesChanged / Math.max(pullRequestsData.pullRequests.length, 1);
    let codeHealthTrend: 'improving' | 'declining' | 'stable' = 'stable';

    if (avgPRSize > 500) {
      codeHealthTrend = 'declining';
      concerns.push('Large average PR size detected');
      recommendations.push('Consider breaking down large changes into smaller PRs');
    } else if (avgPRSize < 100) {
      codeHealthTrend = 'improving';
      highlights.push('Good practice: Small, focused PRs');
    }

    // Collaboration analysis
    const activeContributors = contributors.filter(c => c.total_contributions > 1).length;
    let collaborationTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';

    if (activeContributors > 5) {
      collaborationTrend = 'increasing';
      highlights.push(`Strong collaboration with ${activeContributors} active contributors`);
    } else if (activeContributors < 2) {
      collaborationTrend = 'decreasing';
      concerns.push('Limited contributor diversity');
      recommendations.push('Consider ways to encourage more contributions');
    }

    // Pull request analysis
    const { merged, opened } = pullRequestsData.statistics;
    const mergeRate = merged / Math.max(opened, 1);
    
    if (mergeRate > 0.8) {
      highlights.push('Excellent PR merge rate');
    } else if (mergeRate < 0.5) {
      concerns.push('Low PR merge rate');
      recommendations.push('Review PR approval process and contributor onboarding');
    }

    return {
      trends: {
        activity: activityTrend,
        codeHealth: codeHealthTrend,
        collaboration: collaborationTrend,
      },
      highlights,
      concerns,
      recommendations,
    };
  }

  private calculateActivityScore(metrics: {
    commits: number;
    pullRequests: number;
    contributors: number;
    linesChanged: number;
    period: number;
  }): number {
    const { commits, pullRequests, contributors, linesChanged, period } = metrics;
    
    // Normalize metrics per day
    const dailyCommits = commits / period;
    const dailyPRs = pullRequests / period;
    const dailyLinesChanged = linesChanged / period;

    // Calculate weighted score
    let score = 0;
    score += dailyCommits * 10; // 10 points per commit per day
    score += dailyPRs * 25; // 25 points per PR per day
    score += contributors * 15; // 15 points per contributor
    score += Math.min(dailyLinesChanged / 100, 20); // Up to 20 points for lines changed

    // Bonus for consistent activity
    if (dailyCommits > 0 && dailyPRs > 0) {
      score += 50; // Bonus for having both commits and PRs
    }

    return Math.round(Math.min(score, 1000)); // Cap at 1000
  }

  private calculateDataFreshness(lastUpdate: string): string {
    const lastUpdateTime = new Date(lastUpdate).getTime();
    const now = Date.now();
    const diffHours = Math.floor((now - lastUpdateTime) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'very-fresh';
    if (diffHours < 6) return 'fresh';
    if (diffHours < 24) return 'moderate';
    if (diffHours < 72) return 'stale';
    return 'very-stale';
  }

  private incrementApiCalls(count: number = 1): void {
    this.apiCallsCounter += count;
  }

  /**
   * Get current API usage statistics
   */
  getApiUsageStats(): {
    callsInCurrentSession: number;
    rateLimitInfo: Promise<Record<string, any>>;
  } {
    return {
      callsInCurrentSession: this.apiCallsCounter,
      rateLimitInfo: this.client.getRateLimit(),
    };
  }

  /**
   * Reset API call counter
   */
  resetApiCallCounter(): void {
    this.apiCallsCounter = 0;
  }
}