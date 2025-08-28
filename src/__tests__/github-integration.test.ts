/**
 * GitHub Integration Test Suite
 * 
 * This test suite demonstrates how to test the GitHub integration
 * components with proper mocking and error handling.
 */

import { jest } from '@jest/globals';
import {
  GitHubClient,
  RepositoryService,
  PullRequestService,
  RepoValidationService,
  WebhookService,
  GitHubDataProcessor,
} from '../services';
import {
  GitHubRepository,
  GitHubPullRequest,
  GitHubUser,
  GitHubCommit,
} from '../types/github';

// Mock the Octokit REST API
const mockOctokit = {
  rest: {
    users: {
      getAuthenticated: jest.fn(),
    },
    repos: {
      get: jest.fn(),
      listForUser: jest.fn(),
      listContributors: jest.fn(),
      listCommits: jest.fn(),
      getCommit: jest.fn(),
      listLanguages: jest.fn(),
      getAllTopics: jest.fn(),
      getContent: jest.fn(),
      listWebhooks: jest.fn(),
      createWebhook: jest.fn(),
      updateWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      pingWebhook: jest.fn(),
      listWebhookDeliveries: jest.fn(),
    },
    pulls: {
      list: jest.fn(),
      get: jest.fn(),
      listReviews: jest.fn(),
      listFiles: jest.fn(),
      listCommits: jest.fn(),
    },
    search: {
      repos: jest.fn(),
    },
    rateLimit: {
      get: jest.fn(),
    },
  },
};

// Mock the GitHubClient
jest.mock('../clients/github', () => ({
  GitHubClient: jest.fn().mockImplementation(() => ({
    getOctokit: () => mockOctokit,
    testConnection: jest.fn(),
    getRateLimit: jest.fn(),
    canMakeRequest: jest.fn(),
    getTimeUntilReset: jest.fn(),
    getCacheStats: jest.fn(),
    clearCache: jest.fn(),
    dispose: jest.fn(),
  })),
}));

// Test data
const mockRepository: GitHubRepository = {
  id: 123,
  name: 'test-repo',
  full_name: 'test-owner/test-repo',
  description: 'Test repository',
  html_url: 'https://github.com/test-owner/test-repo',
  clone_url: 'https://github.com/test-owner/test-repo.git',
  ssh_url: 'git@github.com:test-owner/test-repo.git',
  owner: {
    id: 456,
    login: 'test-owner',
    name: 'Test Owner',
    email: 'test@example.com',
    avatar_url: 'https://github.com/images/error/octocat_happy.gif',
    html_url: 'https://github.com/test-owner',
    type: 'User',
    site_admin: false,
  },
  private: false,
  default_branch: 'main',
  language: 'TypeScript',
  languages_url: 'https://api.github.com/repos/test-owner/test-repo/languages',
  stargazers_count: 100,
  watchers_count: 50,
  forks_count: 25,
  open_issues_count: 5,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-12-01T00:00:00Z',
  pushed_at: '2023-12-01T12:00:00Z',
  archived: false,
  disabled: false,
  visibility: 'public',
  fork: false,
  has_issues: true,
  has_projects: true,
  has_wiki: true,
  has_pages: false,
  size: 1000,
};

const mockUser: GitHubUser = {
  id: 789,
  login: 'test-contributor',
  name: 'Test Contributor',
  email: 'contributor@example.com',
  avatar_url: 'https://github.com/images/error/octocat_happy.gif',
  html_url: 'https://github.com/test-contributor',
  type: 'User',
  site_admin: false,
};

const mockPullRequest: GitHubPullRequest = {
  id: 101112,
  number: 1,
  title: 'Test Pull Request',
  body: 'This is a test pull request',
  html_url: 'https://github.com/test-owner/test-repo/pull/1',
  state: 'open',
  draft: false,
  merged: false,
  mergeable: true,
  mergeable_state: 'clean',
  merged_at: null,
  merge_commit_sha: null,
  user: mockUser,
  assignee: null,
  assignees: [],
  requested_reviewers: [],
  labels: [],
  milestone: null,
  head: {
    label: 'test-contributor:feature-branch',
    ref: 'feature-branch',
    sha: 'abc123',
    repo: mockRepository,
    user: mockUser,
  },
  base: {
    label: 'test-owner:main',
    ref: 'main',
    sha: 'def456',
    repo: mockRepository,
    user: mockRepository.owner,
  },
  created_at: '2023-12-01T10:00:00Z',
  updated_at: '2023-12-01T12:00:00Z',
  closed_at: null,
  additions: 100,
  deletions: 50,
  changed_files: 5,
  commits: 3,
  review_comments: 2,
  comments: 1,
};

const mockCommit: GitHubCommit = {
  sha: 'abc123def456',
  url: 'https://api.github.com/repos/test-owner/test-repo/commits/abc123def456',
  html_url: 'https://github.com/test-owner/test-repo/commit/abc123def456',
  author: {
    name: 'Test Contributor',
    email: 'contributor@example.com',
    date: '2023-12-01T12:00:00Z',
  },
  committer: {
    name: 'Test Contributor',
    email: 'contributor@example.com',
    date: '2023-12-01T12:00:00Z',
  },
  message: 'Test commit message',
  tree: {
    sha: 'tree123',
    url: 'https://api.github.com/repos/test-owner/test-repo/git/trees/tree123',
  },
  parents: [],
  stats: {
    additions: 10,
    deletions: 5,
    total: 15,
  },
  files: [
    {
      filename: 'src/test.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      changes: 15,
      blob_url: 'https://github.com/test-owner/test-repo/blob/abc123def456/src/test.ts',
      raw_url: 'https://github.com/test-owner/test-repo/raw/abc123def456/src/test.ts',
      contents_url: 'https://api.github.com/repos/test-owner/test-repo/contents/src/test.ts?ref=abc123def456',
      patch: '@@ -1,5 +1,10 @@\n test content',
    },
  ],
};

describe('GitHub Integration', () => {
  let client: GitHubClient;
  let repositoryService: RepositoryService;
  let pullRequestService: PullRequestService;
  let validationService: RepoValidationService;
  let webhookService: WebhookService;
  let dataProcessor: GitHubDataProcessor;

  beforeEach(() => {
    client = new GitHubClient();
    repositoryService = new RepositoryService(client);
    pullRequestService = new PullRequestService(client);
    validationService = new RepoValidationService(client);
    webhookService = new WebhookService(client);
    dataProcessor = new GitHubDataProcessor(client);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GitHubClient', () => {
    it('should test connection successfully', async () => {
      const mockTestConnection = client.testConnection as jest.MockedFunction<typeof client.testConnection>;
      mockTestConnection.mockResolvedValue({
        connected: true,
        user: 'test-user',
        scopes: ['repo', 'user'],
        rateLimit: {
          limit: 5000,
          remaining: 4999,
          reset: new Date(),
          used: 1,
          resource: 'core',
        },
      });

      const result = await client.testConnection();

      expect(result.connected).toBe(true);
      expect(result.user).toBe('test-user');
      expect(result.scopes).toContain('repo');
    });

    it('should handle rate limit information', async () => {
      const mockGetRateLimit = client.getRateLimit as jest.MockedFunction<typeof client.getRateLimit>;
      mockGetRateLimit.mockResolvedValue({
        core: {
          limit: 5000,
          remaining: 4500,
          reset: new Date(Date.now() + 3600000),
          used: 500,
          resource: 'core',
        },
        search: {
          limit: 30,
          remaining: 25,
          reset: new Date(Date.now() + 3600000),
          used: 5,
          resource: 'search',
        },
      });

      const rateLimit = await client.getRateLimit();

      expect(rateLimit.core.limit).toBe(5000);
      expect(rateLimit.core.remaining).toBe(4500);
      expect(rateLimit.search.limit).toBe(30);
    });
  });

  describe('RepositoryService', () => {
    it('should get repository information', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: mockRepository,
      });

      const result = await repositoryService.getRepository('test-owner', 'test-repo');

      expect(result.name).toBe('test-repo');
      expect(result.full_name).toBe('test-owner/test-repo');
      expect(result.owner.login).toBe('test-owner');
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });
    });

    it('should handle repository not found error', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('Not Found'));

      await expect(repositoryService.getRepository('nonexistent', 'repo'))
        .rejects.toThrow('Repository nonexistent/repo not found');
    });

    it('should get repository commits', async () => {
      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [mockCommit],
      });

      const commits = await repositoryService.getCommits('test-owner', 'test-repo');

      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123def456');
      expect(commits[0].message).toBe('Test commit message');
    });

    it('should get repository contributors', async () => {
      mockOctokit.rest.repos.listContributors.mockResolvedValue({
        data: [{ ...mockUser, contributions: 42 }],
      });

      const contributors = await repositoryService.getContributors('test-owner', 'test-repo');

      expect(contributors).toHaveLength(1);
      expect(contributors[0].login).toBe('test-contributor');
      expect(contributors[0].contributions).toBe(42);
    });
  });

  describe('PullRequestService', () => {
    it('should get pull requests', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [mockPullRequest],
      });

      const pullRequests = await pullRequestService.getPullRequests('test-owner', 'test-repo');

      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].number).toBe(1);
      expect(pullRequests[0].title).toBe('Test Pull Request');
    });

    it('should get enhanced pull request data', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: mockPullRequest,
      });

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/test.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
            patch: '@@ -1,5 +1,10 @@\n test content',
          },
        ],
      });

      mockOctokit.rest.pulls.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'abc123',
            commit: {
              message: 'Test commit',
              author: {
                name: 'Test Author',
                email: 'test@example.com',
                date: '2023-12-01T12:00:00Z',
              },
            },
            author: mockUser,
          },
        ],
      });

      const enhancedPR = await pullRequestService.getEnhancedPullRequest(
        'test-owner',
        'test-repo',
        1,
        {
          includeReviews: true,
          includeFiles: true,
          includeCommits: true,
        }
      );

      expect(enhancedPR.number).toBe(1);
      expect(enhancedPR.files_changed).toHaveLength(1);
      expect(enhancedPR.commit_messages).toHaveLength(1);
      expect(enhancedPR.activity_score).toBeGreaterThan(0);
      expect(enhancedPR.complexity_score).toBeGreaterThan(0);
    });

    it('should filter pull requests by author', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [mockPullRequest],
      });

      const pullRequests = await pullRequestService.getPullRequestsByAuthor(
        'test-owner',
        'test-repo',
        'test-contributor'
      );

      expect(pullRequests).toHaveLength(1);
      expect(pullRequests[0].user.login).toBe('test-contributor');
    });
  });

  describe('RepoValidationService', () => {
    it('should validate repository successfully', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { ...mockRepository, permissions: { admin: true, push: true, pull: true } },
      });

      const mockGetRateLimit = client.getRateLimit as jest.MockedFunction<typeof client.getRateLimit>;
      mockGetRateLimit.mockResolvedValue({
        core: {
          limit: 5000,
          remaining: 4500,
          reset: new Date(),
          used: 500,
          resource: 'core',
        },
      });

      const result = await validationService.validateRepository('test-owner', 'test-repo', {
        checkPermissions: true,
        checkRateLimit: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.metadata.exists).toBe(true);
      expect(result.metadata.accessible).toBe(true);
      expect(result.permissions.canRead).toBe(true);
      expect(result.permissions.canWrite).toBe(true);
      expect(result.permissions.canAdmin).toBe(true);
    });

    it('should validate GitHub token', async () => {
      const mockTestConnection = client.testConnection as jest.MockedFunction<typeof client.testConnection>;
      mockTestConnection.mockResolvedValue({
        connected: true,
        user: 'test-user',
        scopes: ['repo', 'user'],
      });

      const mockGetRateLimit = client.getRateLimit as jest.MockedFunction<typeof client.getRateLimit>;
      mockGetRateLimit.mockResolvedValue({
        core: {
          limit: 5000,
          remaining: 4500,
          reset: new Date(),
          used: 500,
          resource: 'core',
        },
      });

      const result = await validationService.validateToken();

      expect(result.isValid).toBe(true);
      expect(result.user).toBe('test-user');
      expect(result.scopes).toContain('repo');
      expect(result.permissions.canReadRepos).toBe(true);
    });
  });

  describe('WebhookService', () => {
    it('should verify webhook signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const validSignature = 'sha256=52b582138706ac0c597c80cfe59d7fea146af2f4ba8ad9c70e9b7deabbe9a3c4';

      const result = webhookService.verifySignature(payload, validSignature, secret);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid webhook signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      const invalidSignature = 'sha256=invalid-signature';

      const result = webhookService.verifySignature(payload, invalidSignature, secret);

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should setup repository webhook', async () => {
      mockOctokit.rest.repos.listWebhooks.mockResolvedValue({
        data: [],
      });

      mockOctokit.rest.repos.createWebhook.mockResolvedValue({
        data: {
          id: 12345,
          config: { url: 'https://example.com/webhook' },
          events: ['push', 'pull_request'],
          active: true,
          created_at: '2023-12-01T00:00:00Z',
        },
      });

      const result = await webhookService.setupRepositoryWebhook('test-owner', 'test-repo', {
        url: 'https://example.com/webhook',
        secret: 'webhook-secret',
        events: ['push', 'pull_request'],
        active: true,
      });

      expect(result.id).toBe(12345);
      expect(result.url).toBe('https://example.com/webhook');
      expect(result.events).toEqual(['push', 'pull_request']);
    });
  });

  describe('GitHubDataProcessor', () => {
    it('should generate activity summary', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [mockPullRequest],
      });

      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [mockCommit],
      });

      const summary = await dataProcessor.getActivitySummary('test-owner', 'test-repo', {
        start: '2023-11-01T00:00:00Z',
        end: '2023-12-01T00:00:00Z',
      });

      expect(summary.commits).toBe(1);
      expect(summary.pullRequests).toBe(1);
      expect(summary.contributors).toBe(1);
      expect(summary.linesChanged).toBe(150); // 100 additions + 50 deletions
      expect(summary.activityScore).toBeGreaterThan(0);
    });

    it('should generate comprehensive digest', async () => {
      // Mock all the required API calls
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: mockRepository,
      });

      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [mockPullRequest],
      });

      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [mockCommit],
      });

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      });

      const digest = await dataProcessor.generateDigest('test-owner', 'test-repo', {
        period: {
          start: '2023-11-01T00:00:00Z',
          end: '2023-12-01T00:00:00Z',
        },
        includeDetailed: false,
        maxPullRequests: 10,
        maxCommits: 50,
        includeInsights: true,
      });

      expect(digest.repository.name).toBe('test-repo');
      expect(digest.period.days).toBeGreaterThan(0);
      expect(digest.summary.totalCommits).toBe(1);
      expect(digest.summary.totalPullRequests).toBe(1);
      expect(digest.metadata.generatedAt).toBeDefined();
      expect(digest.metadata.apiCallsUsed).toBeGreaterThan(0);
    });

    it('should compare activity across periods', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({
        data: [mockPullRequest],
      });

      mockOctokit.rest.repos.listCommits.mockResolvedValue({
        data: [mockCommit],
      });

      const periods = [
        {
          name: 'Week 1',
          start: '2023-11-01T00:00:00Z',
          end: '2023-11-08T00:00:00Z',
        },
        {
          name: 'Week 2',
          start: '2023-11-08T00:00:00Z',
          end: '2023-11-15T00:00:00Z',
        },
      ];

      const comparison = await dataProcessor.compareActivityPeriods('test-owner', 'test-repo', periods);

      expect(comparison['Week 1']).toBeDefined();
      expect(comparison['Week 2']).toBeDefined();
      expect(comparison['Week 1'].summary.commits).toBe(1);
      expect(comparison['Week 1'].comparison.trend).toMatch(/up|down|stable/);
    });
  });

  describe('Error Handling', () => {
    it('should handle API rate limit errors', async () => {
      const rateLimitError = new Error('API rate limit exceeded');
      (rateLimitError as any).status = 403;
      (rateLimitError as any).message = 'API rate limit exceeded';

      mockOctokit.rest.repos.get.mockRejectedValue(rateLimitError);

      await expect(repositoryService.getRepository('test-owner', 'test-repo'))
        .rejects.toThrow('Failed to fetch repository');
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockOctokit.rest.repos.get.mockRejectedValue(networkError);

      await expect(repositoryService.getRepository('test-owner', 'test-repo'))
        .rejects.toThrow('Failed to fetch repository');
    });

    it('should handle malformed API responses', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({
        data: { invalid: 'response' },
      });

      await expect(repositoryService.getRepository('test-owner', 'test-repo'))
        .rejects.toThrow();
    });
  });

  describe('Performance and Caching', () => {
    it('should provide cache statistics', () => {
      const mockGetCacheStats = client.getCacheStats as jest.MockedFunction<typeof client.getCacheStats>;
      mockGetCacheStats.mockReturnValue({
        size: 10,
        maxSize: 1000,
        hitRate: 0.85,
        entries: [
          {
            key: 'test-key',
            expires: new Date(),
            size: 1024,
          },
        ],
      });

      const stats = client.getCacheStats();

      expect(stats.size).toBe(10);
      expect(stats.maxSize).toBe(1000);
      expect(stats.hitRate).toBe(0.85);
      expect(stats.entries).toHaveLength(1);
    });

    it('should track API usage in data processor', async () => {
      const usageStats = dataProcessor.getApiUsageStats();

      expect(usageStats.callsInCurrentSession).toBeDefined();
      expect(usageStats.rateLimitInfo).toBeInstanceOf(Promise);
    });
  });
});