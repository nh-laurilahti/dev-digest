import { GitHubClient } from '../clients/github';
import { Logger, createLogger } from '../lib/logger';
import {
  GitHubRepository,
  GitHubBranch,
  GitHubCommit,
  GitHubUser,
  RepositoryStatistics,
  GitHubApiOptions,
  CommitFilters,
  GitHubRepositorySchema,
  GitHubBranchSchema,
  GitHubCommitSchema,
} from '../types/github';
import { NotFoundError, ValidationError, ExternalServiceError } from '../lib/errors';

export class RepositoryService {
  private client: GitHubClient;
  private logger: Logger;

  constructor(client: GitHubClient) {
    this.client = client;
    this.logger = createLogger({ component: 'repository-service' });
  }

  /**
   * Get repository information by owner and name
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    try {
      this.logger.debug({ owner, repo }, 'Fetching repository');

      const response = await this.client.getOctokit().rest.repos.get({
        owner,
        repo,
      });

      const repository = GitHubRepositorySchema.parse(response.data);
      
      this.logger.info({ 
        owner, 
        repo, 
        private: repository.private,
        language: repository.language 
      }, 'Repository fetched successfully');

      return repository;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch repository');
      
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw new NotFoundError(`Repository ${owner}/${repo}`);
      }
      
      throw new ExternalServiceError('GitHub', `Failed to fetch repository: ${error}`);
    }
  }

  /**
   * Get multiple repositories for a user or organization
   */
  async getRepositories(
    owner: string,
    options: GitHubApiOptions & {
      type?: 'all' | 'owner' | 'member';
      visibility?: 'all' | 'public' | 'private';
      affiliation?: 'owner' | 'collaborator' | 'organization_member';
    } = {}
  ): Promise<GitHubRepository[]> {
    try {
      this.logger.debug({ owner, options }, 'Fetching repositories');

      const octokit = this.client.getOctokit();
      const params = {
        username: owner,
        type: options.type || 'owner',
        sort: options.sort || 'updated',
        direction: options.direction || 'desc',
        per_page: Math.min(options.per_page || 30, 100),
        page: options.page || 1,
      };

      const response = await octokit.rest.repos.listForUser(params);
      
      const repositories = response.data.map(repo => 
        GitHubRepositorySchema.parse(repo)
      );

      this.logger.info({ 
        owner, 
        count: repositories.length,
        page: params.page
      }, 'Repositories fetched successfully');

      return repositories;
    } catch (error) {
      this.logger.error({ err: error, owner }, 'Failed to fetch repositories');
      throw new ExternalServiceError('GitHub', `Failed to fetch repositories: ${error}`);
    }
  }

  /**
   * Search repositories with query
   */
  async searchRepositories(
    query: string,
    options: GitHubApiOptions & {
      in?: 'name' | 'description' | 'topics' | 'readme';
      size?: string;
      followers?: string;
      language?: string;
      topic?: string;
      license?: string;
      is?: 'public' | 'private' | 'internal';
      mirror?: boolean;
      archived?: boolean;
      good_first_issues?: string;
      help_wanted_issues?: string;
    } = {}
  ): Promise<{
    repositories: GitHubRepository[];
    total_count: number;
    incomplete_results: boolean;
  }> {
    try {
      this.logger.debug({ query, options }, 'Searching repositories');

      const octokit = this.client.getOctokit();
      
      // Build search query with filters
      let searchQuery = query;
      if (options.language) searchQuery += ` language:${options.language}`;
      if (options.topic) searchQuery += ` topic:${options.topic}`;
      if (options.license) searchQuery += ` license:${options.license}`;
      if (options.is) searchQuery += ` is:${options.is}`;
      if (options.archived !== undefined) searchQuery += ` archived:${options.archived}`;
      if (options.mirror !== undefined) searchQuery += ` mirror:${options.mirror}`;

      const response = await octokit.rest.search.repos({
        q: searchQuery,
        sort: options.sort as any || 'updated',
        order: options.direction || 'desc',
        per_page: Math.min(options.per_page || 30, 100),
        page: options.page || 1,
      });

      const repositories = response.data.items.map(repo => 
        GitHubRepositorySchema.parse(repo)
      );

      this.logger.info({ 
        query: searchQuery, 
        total: response.data.total_count,
        returned: repositories.length 
      }, 'Repository search completed');

      return {
        repositories,
        total_count: response.data.total_count,
        incomplete_results: response.data.incomplete_results,
      };
    } catch (error) {
      this.logger.error({ err: error, query }, 'Repository search failed');
      throw new ExternalServiceError('GitHub', `Repository search failed: ${error}`);
    }
  }

  /**
   * Get repository branches
   */
  async getBranches(
    owner: string, 
    repo: string,
    options: GitHubApiOptions = {}
  ): Promise<GitHubBranch[]> {
    try {
      this.logger.debug({ owner, repo, options }, 'Fetching repository branches');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: Math.min(options.per_page || 30, 100),
        page: options.page || 1,
      });

      const branches = response.data.map(branch => 
        GitHubBranchSchema.parse(branch)
      );

      this.logger.info({ owner, repo, count: branches.length }, 'Branches fetched successfully');

      return branches;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch branches');
      throw new ExternalServiceError('GitHub', `Failed to fetch branches: ${error}`);
    }
  }

  /**
   * Get a specific branch
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubBranch> {
    try {
      this.logger.debug({ owner, repo, branch }, 'Fetching branch');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch,
      });

      const branchData = GitHubBranchSchema.parse(response.data);
      
      this.logger.info({ owner, repo, branch }, 'Branch fetched successfully');

      return branchData;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, branch }, 'Failed to fetch branch');
      
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw new NotFoundError(`Branch ${branch} in ${owner}/${repo}`);
      }
      
      throw new ExternalServiceError('GitHub', `Failed to fetch branch: ${error}`);
    }
  }

  /**
   * Get repository commits
   */
  async getCommits(
    owner: string,
    repo: string,
    filters: CommitFilters = {}
  ): Promise<GitHubCommit[]> {
    try {
      this.logger.debug({ owner, repo, filters }, 'Fetching repository commits');

      const octokit = this.client.getOctokit();
      const params: any = {
        owner,
        repo,
        per_page: Math.min(filters.per_page || 30, 100),
        page: filters.page || 1,
      };

      if (filters.sha) params.sha = filters.sha;
      if (filters.path) params.path = filters.path;
      if (filters.author) params.author = filters.author;
      if (filters.since) params.since = filters.since;
      if (filters.until) params.until = filters.until;

      const response = await octokit.rest.repos.listCommits(params);

      const commits = response.data.map((apiCommit: any) => {
        const nested = apiCommit.commit || {};
        const normalized = {
          sha: apiCommit.sha,
          url: apiCommit.url,
          html_url: apiCommit.html_url || `https://github.com/${owner}/${repo}/commit/${apiCommit.sha}`,
          author: nested.author ? {
            name: nested.author.name ?? null,
            email: nested.author.email ?? null,
            date: nested.author.date ?? new Date().toISOString(),
          } : null,
          committer: nested.committer ? {
            name: nested.committer.name ?? null,
            email: nested.committer.email ?? null,
            date: nested.committer.date ?? new Date().toISOString(),
          } : null,
          message: nested.message || '',
          tree: nested.tree || { sha: apiCommit.sha, url: apiCommit.url },
          parents: Array.isArray(apiCommit.parents) ? apiCommit.parents.map((p: any) => ({
            sha: p.sha,
            url: p.url,
            html_url: p.html_url || `https://github.com/${owner}/${repo}/commit/${p.sha}`,
          })) : [],
          stats: apiCommit.stats,
          files: apiCommit.files,
        };
        return GitHubCommitSchema.parse(normalized);
      });

      this.logger.info({ 
        owner, 
        repo, 
        count: commits.length,
        filters 
      }, 'Commits fetched successfully');

      return commits;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, filters }, 'Failed to fetch commits');
      throw new ExternalServiceError('GitHub', `Failed to fetch commits: ${error}`);
    }
  }

  /**
   * Get a specific commit with detailed information
   */
  async getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit> {
    try {
      this.logger.debug({ owner, repo, sha }, 'Fetching commit details');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: sha,
      });

      const apiCommit: any = response.data;
      const nested = apiCommit.commit || {};
      const normalized = {
        sha: apiCommit.sha,
        url: apiCommit.url,
        html_url: apiCommit.html_url || `https://github.com/${owner}/${repo}/commit/${apiCommit.sha}`,
        author: nested.author ? {
          name: nested.author.name ?? null,
          email: nested.author.email ?? null,
          date: nested.author.date ?? new Date().toISOString(),
        } : null,
        committer: nested.committer ? {
          name: nested.committer.name ?? null,
          email: nested.committer.email ?? null,
          date: nested.committer.date ?? new Date().toISOString(),
        } : null,
        message: nested.message || '',
        tree: nested.tree || { sha: apiCommit.sha, url: apiCommit.url },
        parents: Array.isArray(apiCommit.parents) ? apiCommit.parents.map((p: any) => ({
          sha: p.sha,
          url: p.url,
          html_url: p.html_url || `https://github.com/${owner}/${repo}/commit/${p.sha}`,
        })) : [],
        stats: apiCommit.stats,
        files: apiCommit.files,
      };
      const commit = GitHubCommitSchema.parse(normalized);
      
      this.logger.info({ 
        owner, 
        repo, 
        sha,
        additions: commit.stats?.additions,
        deletions: commit.stats?.deletions,
        files: commit.files?.length
      }, 'Commit fetched successfully');

      return commit;
    } catch (error) {
      this.logger.error({ err: error, owner, repo, sha }, 'Failed to fetch commit');
      
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw new NotFoundError(`Commit ${sha} in ${owner}/${repo}`);
      }
      
      throw new ExternalServiceError('GitHub', `Failed to fetch commit: ${error}`);
    }
  }

  /**
   * Get repository contributors
   */
  async getContributors(
    owner: string,
    repo: string,
    options: GitHubApiOptions = {}
  ): Promise<Array<GitHubUser & { contributions: number }>> {
    try {
      this.logger.debug({ owner, repo, options }, 'Fetching repository contributors');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.listContributors({
        owner,
        repo,
        per_page: Math.min(options.per_page || 30, 100),
        page: options.page || 1,
        anon: false, // Don't include anonymous contributors
      });

      // Parse contributors with their contribution counts
      const contributors = response.data.map(contributor => ({
        ...contributor,
        contributions: contributor.contributions || 0,
      })) as Array<GitHubUser & { contributions: number }>;

      this.logger.info({ 
        owner, 
        repo, 
        count: contributors.length,
        totalContributions: contributors.reduce((sum, c) => sum + c.contributions, 0)
      }, 'Contributors fetched successfully');

      return contributors;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch contributors');
      throw new ExternalServiceError('GitHub', `Failed to fetch contributors: ${error}`);
    }
  }

  /**
   * Get repository languages
   */
  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      this.logger.debug({ owner, repo }, 'Fetching repository languages');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.listLanguages({
        owner,
        repo,
      });

      const languages = response.data;
      const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);

      this.logger.info({ 
        owner, 
        repo, 
        languages: Object.keys(languages),
        totalBytes: total
      }, 'Languages fetched successfully');

      return languages;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch languages');
      throw new ExternalServiceError('GitHub', `Failed to fetch languages: ${error}`);
    }
  }

  /**
   * Get repository topics (tags)
   */
  async getTopics(owner: string, repo: string): Promise<string[]> {
    try {
      this.logger.debug({ owner, repo }, 'Fetching repository topics');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.getAllTopics({
        owner,
        repo,
      });

      const topics = response.data.names;

      this.logger.info({ owner, repo, topics }, 'Topics fetched successfully');

      return topics;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch topics');
      throw new ExternalServiceError('GitHub', `Failed to fetch topics: ${error}`);
    }
  }

  /**
   * Get comprehensive repository statistics
   */
  async getRepositoryStatistics(
    owner: string,
    repo: string,
    options: {
      includeContributors?: boolean;
      includeLanguages?: boolean;
      includeCommitActivity?: boolean;
      dateRange?: {
        since?: string;
        until?: string;
      };
    } = {}
  ): Promise<RepositoryStatistics> {
    try {
      this.logger.debug({ owner, repo, options }, 'Fetching repository statistics');

      const repository = await this.getRepository(owner, repo);

      // Fetch data in parallel
      const promises: Promise<any>[] = [
        this.getCommits(owner, repo, { 
          per_page: 100,
          since: options.dateRange?.since,
          until: options.dateRange?.until,
        }),
      ];

      if (options.includeContributors) {
        promises.push(this.getContributors(owner, repo, { per_page: 100 }));
      }

      if (options.includeLanguages) {
        promises.push(this.getLanguages(owner, repo));
      }

      const [commits, contributors, languages] = await Promise.all(promises);

      // Build statistics
      const statistics: RepositoryStatistics = {
        repository,
        total_commits: commits.length,
        total_pull_requests: repository.open_issues_count, // This is approximate
        total_issues: repository.open_issues_count,
        total_releases: 0, // Will be fetched separately if needed
        contributors: contributors ? contributors.map((contributor: any) => ({
          user: contributor,
          contributions: contributor.contributions,
          commits: 0, // Will be calculated from commits
          pull_requests: 0,
          issues: 0,
        })) : [],
        languages: languages || {},
        activity_by_date: {},
        last_updated: new Date().toISOString(),
      };

      // Process commit activity by date if requested
      if (options.includeCommitActivity) {
        const activityByDate: Record<string, {
          commits: number;
          pull_requests: number;
          issues: number;
        }> = {};

        commits.forEach((commit: GitHubCommit) => {
          if (commit.author?.date) {
            const date = commit.author.date.split('T')[0];
            if (!activityByDate[date]) {
              activityByDate[date] = { commits: 0, pull_requests: 0, issues: 0 };
            }
            activityByDate[date].commits++;
          }
        });

        statistics.activity_by_date = activityByDate;
      }

      this.logger.info({ 
        owner, 
        repo,
        totalCommits: statistics.total_commits,
        contributorsCount: statistics.contributors.length,
        languagesCount: Object.keys(statistics.languages).length
      }, 'Repository statistics compiled successfully');

      return statistics;
    } catch (error) {
      this.logger.error({ err: error, owner, repo }, 'Failed to fetch repository statistics');
      throw new ExternalServiceError('GitHub', `Failed to fetch repository statistics: ${error}`);
    }
  }

  /**
   * Validate repository access and permissions
   */
  async validateRepositoryAccess(
    owner: string,
    repo: string
  ): Promise<{
    exists: boolean;
    accessible: boolean;
    permissions: {
      admin: boolean;
      maintain?: boolean;
      push: boolean;
      triage?: boolean;
      pull: boolean;
    };
    private: boolean;
    archived: boolean;
    disabled: boolean;
  }> {
    try {
      this.logger.debug({ owner, repo }, 'Validating repository access');

      const repository = await this.getRepository(owner, repo);

      const result = {
        exists: true,
        accessible: true,
        permissions: repository.permissions || {
          admin: false,
          push: false,
          pull: true,
        },
        private: repository.private,
        archived: repository.archived,
        disabled: repository.disabled,
      };

      this.logger.info({ 
        owner, 
        repo,
        private: result.private,
        archived: result.archived,
        permissions: result.permissions
      }, 'Repository access validated');

      return result;
    } catch (error) {
      this.logger.warn({ err: error, owner, repo }, 'Repository validation failed');

      if (error instanceof NotFoundError) {
        return {
          exists: false,
          accessible: false,
          permissions: {
            admin: false,
            push: false,
            pull: false,
          },
          private: false,
          archived: false,
          disabled: false,
        };
      }

      // If it's a different error, the repo might exist but not be accessible
      return {
        exists: true,
        accessible: false,
        permissions: {
          admin: false,
          push: false,
          pull: false,
        },
        private: true, // Assume private if not accessible
        archived: false,
        disabled: false,
      };
    }
  }

  /**
   * Get repository file contents
   */
  async getFileContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<{
    content: string;
    encoding: string;
    size: number;
    sha: string;
    url: string;
    html_url: string;
    download_url: string;
  }> {
    try {
      this.logger.debug({ owner, repo, path, ref }, 'Fetching file contents');

      const octokit = this.client.getOctokit();
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      const file = response.data;
      
      if (Array.isArray(file) || file.type !== 'file') {
        throw new ValidationError(`Path ${path} is not a file`);
      }

      const content = file.encoding === 'base64' 
        ? Buffer.from(file.content, 'base64').toString('utf8')
        : file.content;

      return {
        content,
        encoding: file.encoding,
        size: file.size,
        sha: file.sha,
        url: file.url,
        html_url: file.html_url,
        download_url: file.download_url || '',
      };
    } catch (error) {
      this.logger.error({ err: error, owner, repo, path }, 'Failed to fetch file contents');
      
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw new NotFoundError(`File ${path} in ${owner}/${repo}`);
      }
      
      throw new ExternalServiceError('GitHub', `Failed to fetch file contents: ${error}`);
    }
  }
}