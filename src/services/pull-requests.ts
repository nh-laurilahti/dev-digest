import { GitHubClient } from '../clients/github';
import { Logger, createLogger } from '../lib/logger';
import {
  GitHubPullRequest,
  GitHubReview,
  GitHubUser,
  EnhancedPullRequest,
  PullRequestFilters,
  GitHubPullRequestSchema,
  GitHubReviewSchema,
  ContributorAnalysis,
} from '../types/github';
import { NotFoundError, ValidationError, ExternalServiceError } from '../lib/errors';

export class PullRequestService {
  private client: GitHubClient;
  private logger: Logger;

  constructor(client: GitHubClient) {
    this.client = client;
    this.logger = createLogger({ component: 'pull-request-service' });
  }

  /**
   * Get pull requests for a repository
   */
  async getPullRequests(
    owner: string,
    repo: string,
    filters: PullRequestFilters = {}
  ): Promise<GitHubPullRequest[]> {
    try {
      this.logger.debug({ owner, repo, filters }, 'Fetching pull requests');

      const octokit = this.client.getOctokit();
      const params: any = {
        owner,
        repo,
        state: filters.state || 'open',
        sort: filters.sort || 'updated',
        direction: filters.direction || 'desc',
        per_page: Math.min(filters.per_page || 30, 100),
        page: filters.page || 1,
      };

      // Add optional filters
      if (filters.head) params.head = filters.head;
      if (filters.base) params.base = filters.base;

      const response = await octokit.rest.pulls.list(params);

      let pullRequests = response.data.map(pr => 
        GitHubPullRequestSchema.parse(pr)
      );

      // Apply additional filters that GitHub API doesn't support directly
      if (filters.author) {
        pullRequests = pullRequests.filter(pr => pr.user.login === filters.author);
      }

      if (filters.assignee) {
        pullRequests = pullRequests.filter(pr => 
          pr.assignee?.login === filters.assignee ||
          pr.assignees.some(assignee => assignee.login === filters.assignee)
        );
      }

      if (filters.label) {
        pullRequests = pullRequests.filter(pr =>
          pr.labels.some(label => label.name === filters.label)
        );
      }

      if (filters.milestone) {
        pullRequests = pullRequests.filter(pr =>
          pr.milestone?.title === filters.milestone
        );
      }

      // Filter by merged status if specified
      if (filters.merged !== undefined) {
        pullRequests = pullRequests.filter(pr => 
          pr.merged === filters.merged
        );
      }

      // Filter by date range
      if (filters.since) {
        const sinceDate = new Date(filters.since);
        pullRequests = pullRequests.filter(pr =>
          new Date(pr.created_at) >= sinceDate
        );
      }

      if (filters.until) {
        const untilDate = new Date(filters.until);
        pullRequests = pullRequests.filter(pr =>
          new Date(pr.created_at) <= untilDate
        );
      }

      this.logger.info({ 
        owner, 
        repo, 
        count: pullRequests.length,
        filters 
      }, 'Pull requests fetched successfully');

      return pullRequests;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch pull requests');
      throw new ExternalServiceError('GitHub', `Failed to fetch pull requests: ${error}`);
    }
  }

  /**
   * Get a specific pull request with detailed information
   */
  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubPullRequest> {
    try {
      this.logger.debug({ owner, repo, pullNumber }, 'Fetching pull request');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const pullRequest = GitHubPullRequestSchema.parse(response.data);
      
      this.logger.info({ 
        owner, 
        repo, 
        pullNumber,
        state: pullRequest.state,
        merged: pullRequest.merged
      }, 'Pull request fetched successfully');

      return pullRequest;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, pullNumber }, 'Failed to fetch pull request');
      
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw new NotFoundError(`Pull request #${pullNumber} in ${owner}/${repo}`);
      }
      
      throw new ExternalServiceError('GitHub', `Failed to fetch pull request: ${error}`);
    }
  }

  /**
   * Get enhanced pull request with additional data
   */
  async getEnhancedPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options: {
      includeReviews?: boolean;
      includeFiles?: boolean;
      includeCommits?: boolean;
      includeComments?: boolean;
    } = {}
  ): Promise<EnhancedPullRequest> {
    try {
      this.logger.debug({ owner, repo, pullNumber, options }, 'Fetching enhanced pull request');

      const pullRequest = await this.getPullRequest(owner, repo, pullNumber);
      const enhanced: EnhancedPullRequest = { ...pullRequest };

      // Fetch additional data in parallel
      const promises: Promise<any>[] = [];

      if (options.includeReviews) {
        promises.push(this.getPullRequestReviews(owner, repo, pullNumber));
      }

      if (options.includeFiles) {
        promises.push(this.getPullRequestFiles(owner, repo, pullNumber));
      }

      if (options.includeCommits) {
        promises.push(this.getPullRequestCommits(owner, repo, pullNumber));
      }

      const results = await Promise.all(promises);
      let resultIndex = 0;

      if (options.includeReviews) {
        const reviews = results[resultIndex++];
        enhanced.reviews = reviews;
        enhanced.reviewers = this.extractReviewers(reviews);
      }

      if (options.includeFiles) {
        enhanced.files_changed = results[resultIndex++];
      }

      if (options.includeCommits) {
        const commits = results[resultIndex++];
        enhanced.commit_messages = commits.map((commit: any) => commit.commit.message);
      }

      // Calculate scores
      enhanced.activity_score = this.calculateActivityScore(enhanced);
      enhanced.complexity_score = this.calculateComplexityScore(enhanced);

      this.logger.info({ 
        owner, 
        repo, 
        pullNumber,
        activityScore: enhanced.activity_score,
        complexityScore: enhanced.complexity_score
      }, 'Enhanced pull request data compiled');

      return enhanced;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, pullNumber }, 'Failed to fetch enhanced pull request');
      throw new ExternalServiceError('GitHub', `Failed to fetch enhanced pull request: ${error}`);
    }
  }

  /**
   * Get pull request reviews
   */
  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubReview[]> {
    try {
      this.logger.debug({ owner, repo, pullNumber }, 'Fetching pull request reviews');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      const reviews = response.data.map(review => 
        GitHubReviewSchema.parse(review)
      );

      this.logger.debug({ 
        owner, 
        repo, 
        pullNumber, 
        count: reviews.length 
      }, 'Pull request reviews fetched');

      return reviews;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, pullNumber }, 'Failed to fetch pull request reviews');
      throw new ExternalServiceError('GitHub', `Failed to fetch pull request reviews: ${error}`);
    }
  }

  /**
   * Get pull request files
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>> {
    try {
      this.logger.debug({ owner, repo, pullNumber }, 'Fetching pull request files');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      const files = response.data.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
      }));

      this.logger.debug({ 
        owner, 
        repo, 
        pullNumber, 
        filesCount: files.length,
        totalChanges: files.reduce((sum, f) => sum + f.changes, 0)
      }, 'Pull request files fetched');

      return files;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, pullNumber }, 'Failed to fetch pull request files');
      throw new ExternalServiceError('GitHub', `Failed to fetch pull request files: ${error}`);
    }
  }

  /**
   * Get pull request commits
   */
  async getPullRequestCommits(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<Array<{
    sha: string;
    commit: {
      message: string;
      author: {
        name: string;
        email: string;
        date: string;
      };
    };
    author: GitHubUser | null;
  }>> {
    try {
      this.logger.debug({ owner, repo, pullNumber }, 'Fetching pull request commits');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

      const commits = response.data.map(commit => ({
        sha: commit.sha,
        commit: {
          message: commit.commit.message,
          author: commit.commit.author || {
            name: 'Unknown',
            email: 'unknown@example.com',
            date: new Date().toISOString(),
          },
        },
        author: commit.author,
      }));

      this.logger.debug({ 
        owner, 
        repo, 
        pullNumber, 
        commitsCount: commits.length 
      }, 'Pull request commits fetched');

      return commits;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, pullNumber }, 'Failed to fetch pull request commits');
      throw new ExternalServiceError('GitHub', `Failed to fetch pull request commits: ${error}`);
    }
  }

  /**
   * Get pull requests with statistics for a date range
   */
  async getPullRequestsWithStats(
    owner: string,
    repo: string,
    options: {
      since?: string;
      until?: string;
      state?: 'open' | 'closed' | 'all';
      includeEnhanced?: boolean;
    } = {}
  ): Promise<{
    pullRequests: (GitHubPullRequest | EnhancedPullRequest)[];
    statistics: {
      total: number;
      open: number;
      closed: number;
      merged: number;
      draft: number;
      totalAdditions: number;
      totalDeletions: number;
      totalFilesChanged: number;
      averageSize: number;
      contributors: string[];
      reviewers: string[];
      mostActiveContributor: string | null;
      mostActiveReviewer: string | null;
    };
  }> {
    try {
      this.logger.debug({ owner, repo, options }, 'Fetching pull requests with statistics');

      // Get all pull requests for the date range
      const allPullRequests: GitHubPullRequest[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const prs = await this.getPullRequests(owner, repo, {
          state: options.state || 'all',
          since: options.since,
          until: options.until,
          page,
          per_page: 100,
        });

        allPullRequests.push(...prs);
        hasMore = prs.length === 100;
        page++;
      }

      // Enhance pull requests if requested
      let pullRequests: (GitHubPullRequest | EnhancedPullRequest)[];

      if (options.includeEnhanced) {
        // Limit enhanced PRs to avoid rate limits
        const prsByImportance = allPullRequests
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 50); // Limit to most recent 50

        const enhancedPRs = await Promise.all(
          prsByImportance.map(pr => 
            this.getEnhancedPullRequest(owner, repo, pr.number, {
              includeReviews: true,
              includeFiles: true,
            })
          )
        );

        pullRequests = [
          ...enhancedPRs,
          ...allPullRequests.slice(50), // Add remaining as basic PRs
        ];
      } else {
        pullRequests = allPullRequests;
      }

      // Calculate statistics
      const statistics = this.calculatePullRequestStatistics(pullRequests);

      this.logger.info({ 
        owner, 
        repo,
        total: statistics.total,
        merged: statistics.merged,
        contributors: statistics.contributors.length
      }, 'Pull request statistics calculated');

      return {
        pullRequests,
        statistics,
      };
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch pull requests with statistics');
      throw new ExternalServiceError('GitHub', `Failed to fetch pull requests with statistics: ${error}`);
    }
  }

  /**
   * Analyze contributor activity in pull requests
   */
  async analyzeContributorActivity(
    owner: string,
    repo: string,
    options: {
      since?: string;
      until?: string;
      contributor?: string;
    } = {}
  ): Promise<ContributorAnalysis[]> {
    try {
      this.logger.debug({ owner, repo, options }, 'Analyzing contributor activity');

      const { pullRequests } = await this.getPullRequestsWithStats(owner, repo, {
        since: options.since,
        until: options.until,
        state: 'all',
        includeEnhanced: true,
      });

      const contributorMap = new Map<string, {
        user: GitHubUser;
        pullRequests: (GitHubPullRequest | EnhancedPullRequest)[];
        reviews: GitHubReview[];
      }>();

      // Collect data for each contributor
      for (const pr of pullRequests) {
        // Author contributions
        const authorLogin = pr.user.login;
        if (!contributorMap.has(authorLogin)) {
          contributorMap.set(authorLogin, {
            user: pr.user,
            pullRequests: [],
            reviews: [],
          });
        }
        contributorMap.get(authorLogin)!.pullRequests.push(pr);

        // Reviewer contributions
        if ('reviews' in pr && pr.reviews) {
          for (const review of pr.reviews) {
            const reviewerLogin = review.user.login;
            if (!contributorMap.has(reviewerLogin)) {
              contributorMap.set(reviewerLogin, {
                user: review.user,
                pullRequests: [],
                reviews: [],
              });
            }
            contributorMap.get(reviewerLogin)!.reviews.push(review);
          }
        }
      }

      // Build analysis for each contributor
      const analyses: ContributorAnalysis[] = [];

      for (const [login, data] of contributorMap) {
        if (options.contributor && login !== options.contributor) {
          continue;
        }

        const analysis = await this.buildContributorAnalysis(data.user, data.pullRequests, data.reviews);
        analyses.push(analysis);
      }

      // Sort by total contributions
      analyses.sort((a, b) => b.total_contributions - a.total_contributions);

      this.logger.info({ 
        owner, 
        repo,
        contributorsAnalyzed: analyses.length,
        topContributor: analyses[0]?.user.login
      }, 'Contributor activity analysis completed');

      return analyses;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to analyze contributor activity');
      throw new ExternalServiceError('GitHub', `Failed to analyze contributor activity: ${error}`);
    }
  }

  /**
   * Get pull requests by author
   */
  async getPullRequestsByAuthor(
    owner: string,
    repo: string,
    author: string,
    options: PullRequestFilters = {}
  ): Promise<GitHubPullRequest[]> {
    return this.getPullRequests(owner, repo, {
      ...options,
      author,
    });
  }

  /**
   * Get pull requests that need review
   */
  async getPullRequestsNeedingReview(
    owner: string,
    repo: string,
    reviewer?: string
  ): Promise<GitHubPullRequest[]> {
    try {
      const pullRequests = await this.getPullRequests(owner, repo, {
        state: 'open',
        sort: 'updated',
        direction: 'desc',
      });

      // Filter PRs that need review
      let needingReview = pullRequests.filter(pr => !pr.draft);

      if (reviewer) {
        needingReview = needingReview.filter(pr =>
          pr.requested_reviewers.some(r => r.login === reviewer)
        );
      }

      return needingReview;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, reviewer }, 'Failed to get PRs needing review');
      throw new ExternalServiceError('GitHub', `Failed to get PRs needing review: ${error}`);
    }
  }

  // Private helper methods

  private extractReviewers(reviews: GitHubReview[]): GitHubUser[] {
    const reviewerMap = new Map<string, GitHubUser>();
    
    for (const review of reviews) {
      reviewerMap.set(review.user.login, review.user);
    }
    
    return Array.from(reviewerMap.values());
  }

  private calculateActivityScore(pr: EnhancedPullRequest): number {
    let score = 0;
    
    // Base score for creation
    score += 10;
    
    // Comments
    score += (pr.comments || 0) * 2;
    score += (pr.review_comments || 0) * 3;
    
    // Reviews
    if (pr.reviews) {
      score += pr.reviews.length * 5;
    }
    
    // Commits
    if (pr.commits) {
      score += pr.commits * 2;
    }
    
    // Files changed (complexity factor)
    if (pr.files_changed) {
      score += Math.min(pr.files_changed.length, 20) * 1;
    }
    
    return Math.round(score);
  }

  private calculateComplexityScore(pr: EnhancedPullRequest): number {
    let score = 0;
    
    // Code changes
    score += (pr.additions || 0) * 0.1;
    score += (pr.deletions || 0) * 0.1;
    
    // Files changed
    if (pr.files_changed) {
      score += pr.files_changed.length * 2;
      
      // File type complexity
      for (const file of pr.files_changed) {
        if (file.filename.includes('.test.') || file.filename.includes('.spec.')) {
          score += 1; // Test files are less complex
        } else if (file.filename.endsWith('.md') || file.filename.endsWith('.txt')) {
          score += 0.5; // Documentation is less complex
        } else if (file.filename.includes('config') || file.filename.includes('package.json')) {
          score += 1; // Config files are medium complexity
        } else {
          score += 3; // Code files are most complex
        }
      }
    }
    
    return Math.round(score);
  }

  private calculatePullRequestStatistics(
    pullRequests: (GitHubPullRequest | EnhancedPullRequest)[]
  ) {
    const contributors = new Set<string>();
    const reviewers = new Set<string>();
    const contributorCounts = new Map<string, number>();
    const reviewerCounts = new Map<string, number>();

    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalFilesChanged = 0;
    let open = 0;
    let closed = 0;
    let merged = 0;
    let draft = 0;

    for (const pr of pullRequests) {
      contributors.add(pr.user.login);
      contributorCounts.set(pr.user.login, (contributorCounts.get(pr.user.login) || 0) + 1);

      if (pr.state === 'open') open++;
      else closed++;
      
      if (pr.merged) merged++;
      if (pr.draft) draft++;

      totalAdditions += pr.additions || 0;
      totalDeletions += pr.deletions || 0;
      totalFilesChanged += pr.changed_files || 0;

      // Count reviewers
      if ('reviews' in pr && pr.reviews) {
        for (const review of pr.reviews) {
          reviewers.add(review.user.login);
          reviewerCounts.set(review.user.login, (reviewerCounts.get(review.user.login) || 0) + 1);
        }
      }
    }

    const mostActiveContributor = contributorCounts.size > 0
      ? Array.from(contributorCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    const mostActiveReviewer = reviewerCounts.size > 0
      ? Array.from(reviewerCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    return {
      total: pullRequests.length,
      open,
      closed,
      merged,
      draft,
      totalAdditions,
      totalDeletions,
      totalFilesChanged,
      averageSize: pullRequests.length > 0 ? totalAdditions / pullRequests.length : 0,
      contributors: Array.from(contributors),
      reviewers: Array.from(reviewers),
      mostActiveContributor,
      mostActiveReviewer,
    };
  }

  private async buildContributorAnalysis(
    user: GitHubUser,
    pullRequests: (GitHubPullRequest | EnhancedPullRequest)[],
    reviews: GitHubReview[]
  ): Promise<ContributorAnalysis> {
    const userPRs = pullRequests.filter(pr => pr.user.login === user.login);
    
    // Calculate PR stats
    const totalAdditions = userPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const totalDeletions = userPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const totalFilesChanged = userPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0);
    const mergedPRs = userPRs.filter(pr => pr.merged).length;
    const closedPRs = userPRs.filter(pr => pr.state === 'closed' && !pr.merged).length;

    // Calculate review stats
    const approvedReviews = reviews.filter(r => r.state === 'APPROVED').length;
    const changesRequestedReviews = reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
    const commentedReviews = reviews.filter(r => r.state === 'COMMENTED').length;

    // Build activity periods (by day)
    const activityByDate = new Map<string, {
      commits: number;
      pull_requests: number;
      reviews: number;
    }>();

    userPRs.forEach(pr => {
      const date = pr.created_at.split('T')[0];
      if (!activityByDate.has(date)) {
        activityByDate.set(date, { commits: 0, pull_requests: 0, reviews: 0 });
      }
      activityByDate.get(date)!.pull_requests++;
    });

    reviews.forEach(review => {
      if (review.submitted_at) {
        const date = review.submitted_at.split('T')[0];
        if (!activityByDate.has(date)) {
          activityByDate.set(date, { commits: 0, pull_requests: 0, reviews: 0 });
        }
        activityByDate.get(date)!.reviews++;
      }
    });

    // Extract expertise areas from file patterns
    const fileExtensions = new Set<string>();
    const directories = new Set<string>();

    for (const pr of userPRs) {
      if ('files_changed' in pr && pr.files_changed) {
        for (const file of pr.files_changed) {
          const ext = file.filename.split('.').pop();
          if (ext) fileExtensions.add(ext);
          
          const dir = file.filename.split('/')[0];
          if (dir) directories.add(dir);
        }
      }
    }

    const expertiseAreas = [
      ...Array.from(fileExtensions).map(ext => `${ext} files`),
      ...Array.from(directories).map(dir => `${dir}/`),
    ].slice(0, 10); // Limit to top 10

    // Calculate collaboration score
    const collaborationScore = Math.min(100, 
      (reviews.length * 10) + 
      (mergedPRs * 5) + 
      (approvedReviews * 3) +
      Math.min(userPRs.length * 2, 20)
    );

    return {
      user,
      total_contributions: userPRs.length + reviews.length,
      commits: {
        count: 0, // Would need commit data
        additions: totalAdditions,
        deletions: totalDeletions,
        files_changed: totalFilesChanged,
      },
      pull_requests: {
        count: userPRs.length,
        merged: mergedPRs,
        closed: closedPRs,
        avg_additions: userPRs.length > 0 ? totalAdditions / userPRs.length : 0,
        avg_deletions: userPRs.length > 0 ? totalDeletions / userPRs.length : 0,
        avg_files_changed: userPRs.length > 0 ? totalFilesChanged / userPRs.length : 0,
      },
      reviews: {
        count: reviews.length,
        approved: approvedReviews,
        changes_requested: changesRequestedReviews,
        commented: commentedReviews,
      },
      issues: {
        created: 0, // Would need issue data
        closed: 0,
      },
      activity_periods: Array.from(activityByDate.entries()).map(([date, activity]) => ({
        date,
        ...activity,
      })),
      expertise_areas: expertiseAreas,
      collaboration_score: collaborationScore,
    };
  }
}