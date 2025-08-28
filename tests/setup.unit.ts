import { beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { config } from '@/lib/config';

// Mock environment for unit tests
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';
  process.env.API_KEY_SALT = 'test-salt-for-unit-tests-only';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/digest_unit_test';
  
  // Mock external dependencies at the module level
  vi.mock('@/db', () => ({
    db: {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $transaction: vi.fn(),
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      apiKey: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      role: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userRole: {
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      session: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      repository: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      digest: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      pullRequest: {
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      job: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  }));

  // Mock GitHub client
  vi.mock('@octokit/rest', () => ({
    Octokit: vi.fn().mockImplementation(() => ({
      rest: {
        repos: {
          get: vi.fn(),
          listForAuthenticatedUser: vi.fn(),
          checkCollaborator: vi.fn(),
        },
        pulls: {
          list: vi.fn(),
          get: vi.fn(),
          listCommits: vi.fn(),
          listFiles: vi.fn(),
          listReviews: vi.fn(),
        },
        users: {
          getAuthenticated: vi.fn(),
        },
        rateLimit: {
          get: vi.fn(),
        },
      },
      paginate: vi.fn(),
    })),
  }));

  // Mock external services
  vi.mock('nodemailer', () => ({
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
      verify: vi.fn().mockResolvedValue(true),
    }),
  }));

  // Mock Slack client
  vi.mock('@slack/web-api', () => ({
    WebClient: vi.fn().mockImplementation(() => ({
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.123456' }),
      },
      auth: {
        test: vi.fn().mockResolvedValue({ ok: true }),
      },
    })),
  }));

  // Mock crypto functions
  vi.mock('crypto', async () => {
    const actual = await vi.importActual('crypto');
    return {
      ...actual,
      randomBytes: vi.fn().mockReturnValue(Buffer.from('mock-random-bytes')),
      createHash: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('mock-hash'),
      }),
    };
  });

  console.log('Unit test environment initialized');
});

afterAll(async () => {
  console.log('Unit test cleanup completed');
});

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Additional cleanup after each test if needed
});

// Global test utilities
declare global {
  var testUtils: {
    createMockUser: () => any;
    createMockApiKey: () => any;
    createMockRepository: () => any;
    createMockDigest: () => any;
    createMockPullRequest: () => any;
    createMockJob: () => any;
  };
}

globalThis.testUtils = {
  createMockUser: () => ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed_password',
    fullName: 'Test User',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [
      {
        role: {
          id: 1,
          name: 'user',
          permissions: '["user:read", "repo:read"]',
        },
      },
    ],
  }),

  createMockApiKey: () => ({
    id: 'ak_test123',
    name: 'Test API Key',
    keyHash: 'hashed_key',
    userId: 1,
    isActive: true,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
  }),

  createMockRepository: () => ({
    id: 1,
    name: 'test-repo',
    fullName: 'testuser/test-repo',
    url: 'https://github.com/testuser/test-repo',
    description: 'Test repository',
    isPrivate: false,
    defaultBranch: 'main',
    language: 'TypeScript',
    stars: 10,
    forks: 2,
    userId: 1,
    githubId: 123456,
    isActive: true,
    lastSyncAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  createMockDigest: () => ({
    id: 'digest_123',
    title: 'Test Digest',
    content: 'Test digest content',
    summary: 'Test summary',
    repositoryId: 1,
    userId: 1,
    period: 'daily',
    startDate: new Date(),
    endDate: new Date(),
    stats: { totalPRs: 5, authors: 2, linesChanged: 100 },
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  createMockPullRequest: () => ({
    id: 1,
    number: 123,
    title: 'Test PR',
    body: 'Test PR description',
    state: 'open',
    author: 'testuser',
    url: 'https://github.com/testuser/test-repo/pull/123',
    createdAt: new Date(),
    updatedAt: new Date(),
    mergedAt: null,
    repositoryId: 1,
    githubId: 789012,
    additions: 50,
    deletions: 25,
    changedFiles: 3,
  }),

  createMockJob: () => ({
    id: 'job_123',
    type: 'digest_generation',
    status: 'pending',
    data: { repositoryId: 1, period: 'daily' },
    result: null,
    error: null,
    attempts: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    scheduledFor: new Date(),
    startedAt: null,
    completedAt: null,
    priority: 5,
  }),
};