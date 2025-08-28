import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { GitHubClient } from '../../src/clients/github';
import { 
  createMockGitHubClient,
  mockGitHubRepository,
  mockGitHubPullRequest,
  mockGitHubCommit,
  mockGitHubFile,
  mockGitHubReview,
  mockGitHubUser,
  mockRateLimit
} from '../mocks/github.mock';
import { 
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ExternalServiceError
} from '../../src/lib/errors';

// Mock the Octokit constructor
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(),
}));

describe('GitHubClient', () => {
  let githubClient: GitHubClient;
  let mockOctokit: ReturnType<typeof createMockGitHubClient>;

  beforeAll(() => {
    process.env.GITHUB_TOKEN = 'test-github-token';
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key';
  });

  beforeEach(() => {
    mockOctokit = createMockGitHubClient();
    
    // Mock the Octokit constructor to return our mock
    const { Octokit } = require('@octokit/rest');
    vi.mocked(Octokit).mockReturnValue(mockOctokit);
    
    githubClient = new GitHubClient({
      token: 'test-token',
    });

    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create GitHub client with token authentication', () => {
      const client = new GitHubClient({ token: 'test-token' });
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should create GitHub client with app authentication', () => {
      const client = new GitHubClient({
        appId: 'test-app-id',
        privateKey: 'test-private-key',
        installationId: 12345,
      });
      expect(client).toBeInstanceOf(GitHubClient);
    });

    it('should throw error with invalid configuration', () => {
      expect(() => new GitHubClient({})).toThrow('GitHub client configuration is required');
    });
  });

  describe('getRepository', () => {
    it('should fetch repository successfully', async () => {
      const result = await githubClient.getRepository('testuser', 'test-repo');

      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
      });
      expect(result).toEqual(mockGitHubRepository);
    });

    it('should handle repository not found', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      await expect(githubClient.getRepository('nonexistent', 'repo'))
        .rejects.toThrow(NotFoundError);
    });

    it('should handle rate limit error', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({
        status: 403,
        message: 'API rate limit exceeded',
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1640995200',
          },
        },
      });

      await expect(githubClient.getRepository('testuser', 'test-repo'))
        .rejects.toThrow(RateLimitError);
    });

    it('should handle authentication error', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({
        status: 401,
        message: 'Bad credentials',
      });

      await expect(githubClient.getRepository('testuser', 'test-repo'))
        .rejects.toThrow(AuthenticationError);
    });
  });

  describe('getUserRepositories', () => {
    it('should fetch user repositories successfully', async () => {
      const result = await githubClient.getUserRepositories();

      expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      });
      expect(result).toEqual([mockGitHubRepository]);
    });

    it('should handle pagination', async () => {
      mockOctokit.paginate.mockResolvedValue([mockGitHubRepository, mockGitHubRepository]);

      const result = await githubClient.getUserRepositories();

      expect(result).toHaveLength(2);
    });

    it('should filter by type and visibility', async () => {
      await githubClient.getUserRepositories({
        type: 'owner',
        visibility: 'private',
      });

      expect(mockOctokit.rest.repos.listForAuthenticatedUser).toHaveBeenCalledWith({
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
        type: 'owner',
        visibility: 'private',
      });
    });
  });

  describe('getPullRequests', () => {
    it('should fetch pull requests successfully', async () => {
      const result = await githubClient.getPullRequests('testuser', 'test-repo');

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      });
      expect(result).toEqual([mockGitHubPullRequest]);
    });

    it('should filter by state and date range', async () => {
      const since = new Date('2023-12-01');
      const until = new Date('2023-12-02');

      await githubClient.getPullRequests('testuser', 'test-repo', {
        state: 'open',
        since,
        until,
      });

      expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      });
    });

    it('should handle empty results', async () => {
      mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

      const result = await githubClient.getPullRequests('testuser', 'test-repo');

      expect(result).toEqual([]);
    });
  });

  describe('getPullRequestDetails', () => {
    it('should fetch pull request details successfully', async () => {
      const result = await githubClient.getPullRequestDetails('testuser', 'test-repo', 42);

      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 42,
      });
      expect(result).toEqual(mockGitHubPullRequest);
    });

    it('should handle non-existent pull request', async () => {
      mockOctokit.rest.pulls.get.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      await expect(githubClient.getPullRequestDetails('testuser', 'test-repo', 999))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('getPullRequestCommits', () => {
    it('should fetch pull request commits successfully', async () => {
      const result = await githubClient.getPullRequestCommits('testuser', 'test-repo', 42);

      expect(mockOctokit.rest.pulls.listCommits).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 42,
        per_page: 100,
      });
      expect(result).toEqual([mockGitHubCommit]);
    });

    it('should handle large number of commits with pagination', async () => {
      mockOctokit.paginate.mockResolvedValue(Array(250).fill(mockGitHubCommit));

      const result = await githubClient.getPullRequestCommits('testuser', 'test-repo', 42);

      expect(result).toHaveLength(250);
    });
  });

  describe('getPullRequestFiles', () => {
    it('should fetch pull request files successfully', async () => {
      const result = await githubClient.getPullRequestFiles('testuser', 'test-repo', 42);

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 42,
        per_page: 100,
      });
      expect(result).toEqual([mockGitHubFile]);
    });
  });

  describe('getPullRequestReviews', () => {
    it('should fetch pull request reviews successfully', async () => {
      const result = await githubClient.getPullRequestReviews('testuser', 'test-repo', 42);

      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        pull_number: 42,
        per_page: 100,
      });
      expect(result).toEqual([mockGitHubReview]);
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should fetch authenticated user successfully', async () => {
      const result = await githubClient.getAuthenticatedUser();

      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
      expect(result).toEqual(mockGitHubUser);
    });

    it('should handle authentication failure', async () => {
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue({
        status: 401,
        message: 'Bad credentials',
      });

      await expect(githubClient.getAuthenticatedUser())
        .rejects.toThrow(AuthenticationError);
    });
  });

  describe('checkRepositoryAccess', () => {
    it('should return true for accessible repository', async () => {
      const result = await githubClient.checkRepositoryAccess('testuser', 'test-repo');

      expect(mockOctokit.rest.repos.checkCollaborator).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        username: mockGitHubUser.login,
      });
      expect(result).toBe(true);
    });

    it('should return false for inaccessible repository', async () => {
      mockOctokit.rest.repos.checkCollaborator.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      const result = await githubClient.checkRepositoryAccess('testuser', 'test-repo');

      expect(result).toBe(false);
    });
  });

  describe('getRateLimit', () => {
    it('should fetch rate limit information successfully', async () => {
      const result = await githubClient.getRateLimit();

      expect(mockOctokit.rest.rateLimit.get).toHaveBeenCalled();
      expect(result).toEqual(mockRateLimit);
    });

    it('should handle rate limit check failure', async () => {
      mockOctokit.rest.rateLimit.get.mockRejectedValue({
        status: 500,
        message: 'Internal Server Error',
      });

      await expect(githubClient.getRateLimit())
        .rejects.toThrow(ExternalServiceError);
    });
  });

  describe('validateRepository', () => {
    it('should validate repository successfully', async () => {
      const result = await githubClient.validateRepository('testuser/test-repo');

      expect(result).toEqual({
        valid: true,
        repository: mockGitHubRepository,
        accessible: true,
      });
    });

    it('should handle invalid repository format', async () => {
      const result = await githubClient.validateRepository('invalid-format');

      expect(result).toEqual({
        valid: false,
        error: 'Invalid repository format. Expected format: owner/repo',
        accessible: false,
      });
    });

    it('should handle non-existent repository', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      const result = await githubClient.validateRepository('nonexistent/repo');

      expect(result).toEqual({
        valid: false,
        error: 'Repository not found or not accessible',
        accessible: false,
      });
    });
  });

  describe('error handling', () => {
    it('should properly categorize GitHub API errors', async () => {
      const testCases = [
        { status: 401, expectedError: AuthenticationError },
        { status: 403, expectedError: RateLimitError, headers: { 'x-ratelimit-remaining': '0' } },
        { status: 404, expectedError: NotFoundError },
        { status: 500, expectedError: ExternalServiceError },
        { status: 422, expectedError: ExternalServiceError },
      ];

      for (const testCase of testCases) {
        mockOctokit.rest.repos.get.mockRejectedValue({
          status: testCase.status,
          message: 'Test error',
          response: { headers: testCase.headers || {} },
        });

        await expect(githubClient.getRepository('test', 'repo'))
          .rejects.toThrow(testCase.expectedError);
      }
    });

    it('should handle network errors', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('Network error'));

      await expect(githubClient.getRepository('test', 'repo'))
        .rejects.toThrow(ExternalServiceError);
    });

    it('should handle timeout errors', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'Request timeout',
      });

      await expect(githubClient.getRepository('test', 'repo'))
        .rejects.toThrow(ExternalServiceError);
    });
  });

  describe('rate limiting', () => {
    it('should handle rate limit with proper retry after', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      mockOctokit.rest.repos.get.mockRejectedValue({
        status: 403,
        message: 'API rate limit exceeded',
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': resetTime.toString(),
          },
        },
      });

      try {
        await githubClient.getRepository('test', 'repo');
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.retryAfter).toBeGreaterThan(0);
      }
    });

    it('should check rate limit status', async () => {
      const status = await githubClient.getRateLimitStatus();

      expect(status.remaining).toBe(mockRateLimit.rate.remaining);
      expect(status.limit).toBe(mockRateLimit.rate.limit);
      expect(status.resetTime).toBeInstanceOf(Date);
    });
  });

  describe('batch operations', () => {
    it('should fetch multiple repositories in batch', async () => {
      const repositories = [
        { owner: 'user1', name: 'repo1' },
        { owner: 'user2', name: 'repo2' },
      ];

      const results = await githubClient.batchGetRepositories(repositories);

      expect(results).toHaveLength(2);
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch operations', async () => {
      const repositories = [
        { owner: 'user1', name: 'repo1' },
        { owner: 'user2', name: 'nonexistent' },
      ];

      mockOctokit.rest.repos.get
        .mockResolvedValueOnce({ data: mockGitHubRepository })
        .mockRejectedValueOnce({ status: 404, message: 'Not Found' });

      const results = await githubClient.batchGetRepositories(repositories);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
});