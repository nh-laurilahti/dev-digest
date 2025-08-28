import { vi } from 'vitest';

export const mockGitHubRepository = {
  id: 123456,
  name: 'test-repo',
  full_name: 'testuser/test-repo',
  html_url: 'https://github.com/testuser/test-repo',
  description: 'A test repository',
  private: false,
  fork: false,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-12-01T00:00:00Z',
  pushed_at: '2023-12-01T12:00:00Z',
  clone_url: 'https://github.com/testuser/test-repo.git',
  size: 1024,
  stargazers_count: 42,
  watchers_count: 42,
  language: 'TypeScript',
  forks_count: 5,
  open_issues_count: 3,
  default_branch: 'main',
  owner: {
    login: 'testuser',
    id: 12345,
    avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    type: 'User',
  },
};

export const mockGitHubPullRequest = {
  id: 789012,
  number: 42,
  title: 'Add amazing feature',
  body: 'This PR adds an amazing feature that will change everything.',
  state: 'open',
  locked: false,
  user: {
    login: 'contributor',
    id: 67890,
    avatar_url: 'https://github.com/images/error/contributor_happy.gif',
    type: 'User',
  },
  created_at: '2023-12-01T10:00:00Z',
  updated_at: '2023-12-01T11:00:00Z',
  closed_at: null,
  merged_at: null,
  merge_commit_sha: null,
  head: {
    label: 'contributor:feature-branch',
    ref: 'feature-branch',
    sha: 'abc123def456',
    repo: mockGitHubRepository,
  },
  base: {
    label: 'testuser:main',
    ref: 'main',
    sha: 'def456abc123',
    repo: mockGitHubRepository,
  },
  html_url: 'https://github.com/testuser/test-repo/pull/42',
  diff_url: 'https://github.com/testuser/test-repo/pull/42.diff',
  patch_url: 'https://github.com/testuser/test-repo/pull/42.patch',
  mergeable: true,
  mergeable_state: 'clean',
  merged_by: null,
  comments: 2,
  review_comments: 1,
  commits: 3,
  additions: 150,
  deletions: 50,
  changed_files: 5,
};

export const mockGitHubCommit = {
  sha: 'abc123def456',
  commit: {
    author: {
      name: 'Contributor',
      email: 'contributor@example.com',
      date: '2023-12-01T10:00:00Z',
    },
    committer: {
      name: 'Contributor',
      email: 'contributor@example.com',
      date: '2023-12-01T10:00:00Z',
    },
    message: 'feat: add amazing feature\n\nThis commit adds the core functionality for the amazing feature.',
    tree: {
      sha: 'tree123',
      url: 'https://api.github.com/repos/testuser/test-repo/git/trees/tree123',
    },
    verification: {
      verified: false,
      reason: 'unsigned',
    },
  },
  author: {
    login: 'contributor',
    id: 67890,
  },
  committer: {
    login: 'contributor',
    id: 67890,
  },
  html_url: 'https://github.com/testuser/test-repo/commit/abc123def456',
};

export const mockGitHubFile = {
  sha: 'file123',
  filename: 'src/feature.ts',
  status: 'added',
  additions: 100,
  deletions: 0,
  changes: 100,
  blob_url: 'https://github.com/testuser/test-repo/blob/abc123def456/src/feature.ts',
  raw_url: 'https://github.com/testuser/test-repo/raw/abc123def456/src/feature.ts',
  contents_url: 'https://api.github.com/repos/testuser/test-repo/contents/src/feature.ts?ref=abc123def456',
  patch: '@@ -0,0 +1,100 @@\n+export class Feature {\n+  // Amazing feature implementation\n+}',
};

export const mockGitHubReview = {
  id: 345678,
  user: {
    login: 'reviewer',
    id: 11111,
  },
  body: 'Looks good to me! Just a few minor suggestions.',
  state: 'APPROVED',
  html_url: 'https://github.com/testuser/test-repo/pull/42#pullrequestreview-345678',
  submitted_at: '2023-12-01T11:30:00Z',
};

export const mockGitHubUser = {
  login: 'testuser',
  id: 12345,
  name: 'Test User',
  email: 'testuser@example.com',
  bio: 'A test user for unit testing',
  company: 'Test Company',
  location: 'Test City',
  avatar_url: 'https://github.com/images/error/testuser_happy.gif',
  html_url: 'https://github.com/testuser',
  type: 'User',
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2023-12-01T00:00:00Z',
  public_repos: 10,
  public_gists: 5,
  followers: 100,
  following: 50,
};

export const mockRateLimit = {
  rate: {
    limit: 5000,
    remaining: 4999,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 1,
  },
  resources: {
    core: {
      limit: 5000,
      remaining: 4999,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
    search: {
      limit: 30,
      remaining: 30,
      reset: Math.floor(Date.now() / 1000) + 60,
    },
    graphql: {
      limit: 5000,
      remaining: 5000,
      reset: Math.floor(Date.now() / 1000) + 3600,
    },
  },
};

// Mock GitHub client factory
export const createMockGitHubClient = () => ({
  rest: {
    repos: {
      get: vi.fn().mockResolvedValue({ data: mockGitHubRepository }),
      listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [mockGitHubRepository] }),
      checkCollaborator: vi.fn().mockResolvedValue({ status: 204 }),
    },
    pulls: {
      list: vi.fn().mockResolvedValue({ data: [mockGitHubPullRequest] }),
      get: vi.fn().mockResolvedValue({ data: mockGitHubPullRequest }),
      listCommits: vi.fn().mockResolvedValue({ data: [mockGitHubCommit] }),
      listFiles: vi.fn().mockResolvedValue({ data: [mockGitHubFile] }),
      listReviews: vi.fn().mockResolvedValue({ data: [mockGitHubReview] }),
    },
    users: {
      getAuthenticated: vi.fn().mockResolvedValue({ data: mockGitHubUser }),
    },
    rateLimit: {
      get: vi.fn().mockResolvedValue({ data: mockRateLimit }),
    },
  },
  paginate: vi.fn().mockImplementation(async (method, options) => {
    // Mock paginate to return the same data
    const response = await method(options);
    return response.data;
  }),
});

// MSW handlers for GitHub API
export const githubHandlers = [
  // Add MSW handlers here if needed for integration tests
];