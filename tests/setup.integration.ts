import { beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '@/db';

const execAsync = promisify(exec);

// Integration test setup with real database
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
  process.env.API_KEY_SALT = 'test-salt-for-integration-tests';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/digest_integration_test';
  
  // Ensure test database exists and is migrated
  try {
    await execAsync('createdb digest_integration_test || true');
    await execAsync('DATABASE_URL=postgresql://test:test@localhost:5432/digest_integration_test npx prisma migrate deploy');
    await execAsync('DATABASE_URL=postgresql://test:test@localhost:5432/digest_integration_test npx prisma generate');
  } catch (error) {
    console.warn('Database setup warning:', error);
  }

  // Connect to database
  try {
    await db.$connect();
    console.log('Connected to integration test database');
  } catch (error) {
    console.error('Failed to connect to integration test database:', error);
    throw error;
  }
});

afterAll(async () => {
  try {
    // Clean up and disconnect
    await db.$disconnect();
    console.log('Integration test cleanup completed');
  } catch (error) {
    console.error('Error during integration test cleanup:', error);
  }
});

beforeEach(async () => {
  // Clean up all test data before each test
  await cleanupTestData();
});

afterEach(async () => {
  // Clean up all test data after each test
  await cleanupTestData();
});

async function cleanupTestData() {
  try {
    // Delete in correct order to avoid foreign key constraints
    await db.job.deleteMany({ where: { id: { startsWith: 'test_' } } });
    await db.pullRequest.deleteMany({ where: { repositoryId: { in: await getTestRepositoryIds() } } });
    await db.digest.deleteMany({ where: { id: { startsWith: 'test_' } } });
    await db.repository.deleteMany({ where: { name: { startsWith: 'test-' } } });
    await db.session.deleteMany({ where: { userId: { in: await getTestUserIds() } } });
    await db.apiKey.deleteMany({ where: { id: { startsWith: 'test_' } } });
    await db.userRole.deleteMany({ where: { userId: { in: await getTestUserIds() } } });
    await db.user.deleteMany({ where: { email: { contains: '@test.example' } } });
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}

async function getTestUserIds(): Promise<number[]> {
  try {
    const users = await db.user.findMany({
      where: { email: { contains: '@test.example' } },
      select: { id: true },
    });
    return users.map(u => u.id);
  } catch {
    return [];
  }
}

async function getTestRepositoryIds(): Promise<number[]> {
  try {
    const repos = await db.repository.findMany({
      where: { name: { startsWith: 'test-' } },
      select: { id: true },
    });
    return repos.map(r => r.id);
  } catch {
    return [];
  }
}

// Integration test utilities
declare global {
  var integrationUtils: {
    createTestUser: (overrides?: any) => Promise<any>;
    createTestRepository: (userId: number, overrides?: any) => Promise<any>;
    createTestApiKey: (userId: number, overrides?: any) => Promise<any>;
    createTestDigest: (repositoryId: number, userId: number, overrides?: any) => Promise<any>;
    createTestJob: (overrides?: any) => Promise<any>;
    cleanupTestData: () => Promise<void>;
  };
}

globalThis.integrationUtils = {
  createTestUser: async (overrides = {}) => {
    return await db.user.create({
      data: {
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@test.example`,
        passwordHash: 'hashed_test_password',
        fullName: 'Integration Test User',
        isActive: true,
        ...overrides,
      },
    });
  },

  createTestRepository: async (userId: number, overrides = {}) => {
    return await db.repository.create({
      data: {
        name: `test-repo-${Date.now()}`,
        fullName: `testuser/test-repo-${Date.now()}`,
        url: `https://github.com/testuser/test-repo-${Date.now()}`,
        description: 'Integration test repository',
        isPrivate: false,
        defaultBranch: 'main',
        language: 'TypeScript',
        stars: 0,
        forks: 0,
        userId,
        githubId: Math.floor(Math.random() * 1000000),
        isActive: true,
        ...overrides,
      },
    });
  },

  createTestApiKey: async (userId: number, overrides = {}) => {
    return await db.apiKey.create({
      data: {
        id: `test_ak_${Date.now()}`,
        name: `Test API Key ${Date.now()}`,
        keyHash: 'hashed_test_key',
        userId,
        isActive: true,
        ...overrides,
      },
    });
  },

  createTestDigest: async (repositoryId: number, userId: number, overrides = {}) => {
    return await db.digest.create({
      data: {
        id: `test_digest_${Date.now()}`,
        title: `Test Digest ${Date.now()}`,
        content: 'Integration test digest content',
        summary: 'Test summary',
        repositoryId,
        userId,
        period: 'daily',
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(),
        stats: { totalPRs: 0, authors: 0, linesChanged: 0 },
        status: 'completed',
        ...overrides,
      },
    });
  },

  createTestJob: async (overrides = {}) => {
    return await db.job.create({
      data: {
        id: `test_job_${Date.now()}`,
        type: 'digest_generation',
        status: 'pending',
        data: { test: true },
        attempts: 0,
        maxRetries: 3,
        scheduledFor: new Date(),
        priority: 5,
        ...overrides,
      },
    });
  },

  cleanupTestData,
};