import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { authService } from '../../src/services/auth';

describe('API Performance Tests', () => {
  let authToken: string;
  let testUser: any;
  let testRepositories: any[] = [];

  beforeAll(async () => {
    // Create test user
    testUser = await db.user.create({
      data: {
        username: 'perftest',
        email: 'perftest@performance.test',
        passwordHash: await require('bcrypt').hash('TestPassword123!', 12),
        fullName: 'Performance Test User',
        isActive: true,
      },
    });

    // Generate auth token
    const tokens = authService.generateTokens(testUser.id);
    authToken = tokens.accessToken;

    // Create test repositories
    for (let i = 0; i < 50; i++) {
      const repo = await db.repository.create({
        data: {
          name: `perf-repo-${i}`,
          fullName: `perftest/perf-repo-${i}`,
          url: `https://github.com/perftest/perf-repo-${i}`,
          description: `Performance test repository ${i}`,
          isPrivate: false,
          defaultBranch: 'main',
          language: i % 2 === 0 ? 'TypeScript' : 'JavaScript',
          stars: Math.floor(Math.random() * 1000),
          forks: Math.floor(Math.random() * 100),
          userId: testUser.id,
          githubId: 100000 + i,
          isActive: true,
        },
      });
      testRepositories.push(repo);
    }
  });

  afterAll(async () => {
    // Clean up test data
    await db.repository.deleteMany({
      where: { userId: testUser.id },
    });
    await db.user.delete({
      where: { id: testUser.id },
    });
  });

  describe('Authentication Performance', () => {
    it('should handle login requests under acceptable response time', async () => {
      const startTime = perfUtils.measureMemoryUsage();
      
      perfUtils.startTimer('login-performance');

      const promises = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'perftest@performance.test',
            password: 'TestPassword123!',
          })
      );

      const responses = await Promise.all(promises);
      const duration = perfUtils.endTimer('login-performance');

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Average response time should be under 500ms
      const averageTime = duration / 10;
      expect(averageTime).toBeLessThan(500);

      const endMemory = perfUtils.measureMemoryUsage();
      console.log(`Login performance: ${averageTime.toFixed(2)}ms average`);
      console.log(`Memory usage: ${(endMemory.heapUsed - startTime.heapUsed) / 1024 / 1024}MB`);
    });

    it('should handle concurrent authentication requests efficiently', async () => {
      const concurrentUsers = 20;
      const testDuration = 5000; // 5 seconds

      const results = await perfUtils.stressTest(async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'perftest@performance.test',
            password: 'TestPassword123!',
          });
        
        if (response.status !== 200) {
          throw new Error(`Login failed with status ${response.status}`);
        }
      }, concurrentUsers, testDuration);

      expect(results.successfulRequests).toBeGreaterThan(0);
      expect(results.failedRequests).toBeLessThan(results.totalRequests * 0.05); // Less than 5% failure rate
      expect(results.averageResponseTime).toBeLessThan(1000); // Under 1 second average
      expect(results.requestsPerSecond).toBeGreaterThan(10); // At least 10 RPS

      console.log('Authentication stress test results:', results);
    });
  });

  describe('Repository API Performance', () => {
    it('should handle repository listing with acceptable performance', async () => {
      perfUtils.startTimer('repo-list-performance');

      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = perfUtils.endTimer('repo-list-performance');

      expect(response.status).toBe(200);
      expect(response.body.data.repositories).toHaveLength(50);

      // Should respond within 200ms for 50 repositories
      expect(duration).toBeLessThan(200);

      console.log(`Repository listing: ${duration.toFixed(2)}ms for 50 repositories`);
    });

    it('should handle paginated repository requests efficiently', async () => {
      const pageSize = 10;
      const totalPages = 5;
      
      perfUtils.startTimer('repo-pagination-performance');

      const promises = [];
      for (let page = 0; page < totalPages; page++) {
        promises.push(
          request(app)
            .get(`/api/repositories?limit=${pageSize}&offset=${page * pageSize}`)
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);
      const duration = perfUtils.endTimer('repo-pagination-performance');

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data.repositories.length).toBeLessThanOrEqual(pageSize);
      });

      const averageTime = duration / totalPages;
      expect(averageTime).toBeLessThan(150);

      console.log(`Paginated requests: ${averageTime.toFixed(2)}ms average per page`);
    });

    it('should handle repository filtering efficiently', async () => {
      const filters = [
        { language: 'TypeScript' },
        { language: 'JavaScript' },
        { active: 'true' },
        { orderBy: 'stars' },
        { orderBy: 'name' },
      ];

      perfUtils.startTimer('repo-filtering-performance');

      const promises = filters.map(filter => {
        const queryString = new URLSearchParams(filter).toString();
        return request(app)
          .get(`/api/repositories?${queryString}`)
          .set('Authorization', `Bearer ${authToken}`);
      });

      const responses = await Promise.all(promises);
      const duration = perfUtils.endTimer('repo-filtering-performance');

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data.repositories).toBeInstanceOf(Array);
      });

      const averageTime = duration / filters.length;
      expect(averageTime).toBeLessThan(250);

      console.log(`Filtered requests: ${averageTime.toFixed(2)}ms average`);
    });
  });

  describe('Digest Generation Performance', () => {
    it('should handle digest creation requests efficiently', async () => {
      const repository = testRepositories[0];
      
      // Create some pull requests for testing
      await db.pullRequest.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          number: i + 1,
          title: `Test PR ${i + 1}`,
          body: `Test pull request ${i + 1} for performance testing`,
          state: 'merged',
          author: 'perftest',
          url: `https://github.com/perftest/repo/pull/${i + 1}`,
          repositoryId: repository.id,
          githubId: 200000 + i,
          additions: Math.floor(Math.random() * 100),
          deletions: Math.floor(Math.random() * 50),
          changedFiles: Math.floor(Math.random() * 10) + 1,
          createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })),
      });

      perfUtils.startTimer('digest-creation-performance');

      const response = await request(app)
        .post(`/api/repositories/${repository.id}/digests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period: 'weekly',
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        });

      const duration = perfUtils.endTimer('digest-creation-performance');

      expect(response.status).toBe(202); // Accepted for background processing
      expect(response.body.data.job).toBeDefined();

      // Job creation should be fast
      expect(duration).toBeLessThan(100);

      console.log(`Digest job creation: ${duration.toFixed(2)}ms`);
    });

    it('should handle concurrent digest requests without overwhelming system', async () => {
      const concurrentRequests = 5;
      const repository = testRepositories[1];

      perfUtils.startTimer('concurrent-digest-performance');

      const promises = Array(concurrentRequests).fill(null).map((_, i) =>
        request(app)
          .post(`/api/repositories/${repository.id}/digests`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            period: 'daily',
            startDate: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          })
      );

      const responses = await Promise.all(promises);
      const duration = perfUtils.endTimer('concurrent-digest-performance');

      // All requests should be accepted
      responses.forEach(response => {
        expect(response.status).toBe(202);
        expect(response.body.data.job).toBeDefined();
      });

      const averageTime = duration / concurrentRequests;
      expect(averageTime).toBeLessThan(200);

      console.log(`Concurrent digest requests: ${averageTime.toFixed(2)}ms average`);
    });
  });

  describe('Database Query Performance', () => {
    it('should handle complex repository queries efficiently', async () => {
      perfUtils.startTimer('complex-query-performance');

      // Simulate complex query with multiple conditions and joins
      const repositories = await db.repository.findMany({
        where: {
          userId: testUser.id,
          isActive: true,
          language: { in: ['TypeScript', 'JavaScript'] },
          stars: { gte: 0 },
        },
        include: {
          user: {
            select: { id: true, username: true, fullName: true },
          },
          digests: {
            select: { id: true, title: true, createdAt: true },
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { digests: true, pullRequests: true },
          },
        },
        orderBy: [
          { stars: 'desc' },
          { name: 'asc' },
        ],
        take: 20,
      });

      const duration = perfUtils.endTimer('complex-query-performance');

      expect(repositories).toBeInstanceOf(Array);
      expect(repositories.length).toBeGreaterThan(0);

      // Complex query should complete within 300ms
      expect(duration).toBeLessThan(300);

      console.log(`Complex repository query: ${duration.toFixed(2)}ms`);
    });

    it('should handle large dataset queries with proper indexing', async () => {
      // Create additional data to test with larger dataset
      const additionalPRs = Array.from({ length: 100 }, (_, i) => ({
        number: i + 100,
        title: `Large dataset PR ${i}`,
        body: `Performance test PR ${i}`,
        state: Math.random() > 0.3 ? 'merged' : 'open',
        author: `author${i % 10}`,
        url: `https://github.com/test/repo/pull/${i + 100}`,
        repositoryId: testRepositories[0].id,
        githubId: 300000 + i,
        additions: Math.floor(Math.random() * 200),
        deletions: Math.floor(Math.random() * 100),
        changedFiles: Math.floor(Math.random() * 15) + 1,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      }));

      await db.pullRequest.createMany({ data: additionalPRs });

      perfUtils.startTimer('large-dataset-query');

      // Query large dataset with filtering
      const pullRequests = await db.pullRequest.findMany({
        where: {
          repositoryId: testRepositories[0].id,
          state: 'merged',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            lte: new Date(),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const duration = perfUtils.endTimer('large-dataset-query');

      expect(pullRequests).toBeInstanceOf(Array);
      expect(pullRequests.length).toBeGreaterThan(0);

      // Large dataset query should complete within 500ms with proper indexing
      expect(duration).toBeLessThan(500);

      console.log(`Large dataset query: ${duration.toFixed(2)}ms for ${pullRequests.length} results`);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = perfUtils.measureMemoryUsage();
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        // Perform memory-intensive operation
        await request(app)
          .get('/api/repositories')
          .set('Authorization', `Bearer ${authToken}`);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = perfUtils.measureMemoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

      console.log(`Memory increase after ${iterations} operations: ${memoryIncrease.toFixed(2)}MB`);

      // Memory increase should be reasonable (less than 10MB for 20 operations)
      expect(memoryIncrease).toBeLessThan(10);
    });

    it('should handle large response data efficiently', async () => {
      const initialMemory = perfUtils.measureMemoryUsage();

      // Request all repositories with full details
      const response = await request(app)
        .get('/api/repositories?include=stats,digests,pullRequests')
        .set('Authorization', `Bearer ${authToken}`);

      const finalMemory = perfUtils.measureMemoryUsage();
      const memoryUsage = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

      expect(response.status).toBe(200);
      expect(response.body.data.repositories).toBeInstanceOf(Array);

      console.log(`Memory usage for large response: ${memoryUsage.toFixed(2)}MB`);

      // Memory usage should be proportional to data size
      const dataSize = JSON.stringify(response.body).length / 1024 / 1024;
      console.log(`Response data size: ${dataSize.toFixed(2)}MB`);

      // Memory overhead should not be excessive
      expect(memoryUsage).toBeLessThan(dataSize * 3);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should handle rate limiting efficiently without blocking valid requests', async () => {
      const requestsPerSecond = 50;
      const testDuration = 2000; // 2 seconds

      const results = await perfUtils.stressTest(async () => {
        const response = await request(app)
          .get('/api/repositories')
          .set('Authorization', `Bearer ${authToken}`);
        
        // Accept both successful and rate-limited responses
        if (response.status !== 200 && response.status !== 429) {
          throw new Error(`Unexpected status ${response.status}`);
        }
      }, requestsPerSecond, testDuration);

      expect(results.totalRequests).toBeGreaterThan(0);
      
      // Some requests should succeed even with rate limiting
      expect(results.successfulRequests).toBeGreaterThan(0);
      
      // Rate limiting should not cause server errors
      expect(results.failedRequests).toBe(0);

      console.log('Rate limiting performance results:', results);
    });
  });

  describe('Concurrent User Performance', () => {
    it('should handle multiple concurrent users efficiently', async () => {
      const concurrentUsers = 10;
      const requestsPerUser = 5;

      // Create additional test users
      const testUsers = [];
      for (let i = 0; i < concurrentUsers; i++) {
        const user = await db.user.create({
          data: {
            username: `concurrenttest${i}`,
            email: `concurrent${i}@performance.test`,
            passwordHash: await require('bcrypt').hash('TestPassword123!', 12),
            fullName: `Concurrent Test User ${i}`,
            isActive: true,
          },
        });

        const tokens = authService.generateTokens(user.id);
        testUsers.push({ user, token: tokens.accessToken });
      }

      try {
        perfUtils.startTimer('concurrent-users-performance');

        // Each user makes multiple requests concurrently
        const allPromises = testUsers.flatMap(({ token }) =>
          Array(requestsPerUser).fill(null).map(() =>
            request(app)
              .get('/api/repositories')
              .set('Authorization', `Bearer ${token}`)
          )
        );

        const responses = await Promise.all(allPromises);
        const duration = perfUtils.endTimer('concurrent-users-performance');

        // All requests should succeed
        const successfulResponses = responses.filter(r => r.status === 200);
        expect(successfulResponses.length).toBe(concurrentUsers * requestsPerUser);

        const averageTime = duration / (concurrentUsers * requestsPerUser);
        expect(averageTime).toBeLessThan(500);

        console.log(`Concurrent users: ${concurrentUsers} users, ${averageTime.toFixed(2)}ms average`);

      } finally {
        // Clean up test users
        await db.user.deleteMany({
          where: { email: { contains: '@performance.test' } },
        });
      }
    });
  });
});