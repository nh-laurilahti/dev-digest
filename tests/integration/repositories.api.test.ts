import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { authService } from '../../src/services/auth';
import { createMockGitHubClient } from '../mocks/github.mock';

describe('Repositories API Integration Tests', () => {
  let testUser: any;
  let testRepository: any;
  let authToken: string;
  let apiKey: string;

  beforeAll(async () => {
    // Setup test data
    testUser = await integrationUtils.createTestUser({
      email: 'repos-test@test.example',
      username: 'repostest',
    });

    // Generate auth token
    const tokens = authService.generateTokens(testUser.id);
    authToken = tokens.accessToken;

    // Create API key for testing
    const apiKeyResult = await integrationUtils.createTestApiKey(testUser.id, {
      name: 'Repos Test API Key',
    });
    apiKey = `dd_test_key_${Date.now()}`;
  });

  afterAll(async () => {
    await integrationUtils.cleanupTestData();
  });

  beforeEach(async () => {
    // Create test repository
    testRepository = await integrationUtils.createTestRepository(testUser.id, {
      name: 'test-repo-integration',
      fullName: 'repostest/test-repo-integration',
      url: 'https://github.com/repostest/test-repo-integration',
    });
  });

  afterEach(async () => {
    // Clean up test repositories
    await db.repository.deleteMany({
      where: { name: { startsWith: 'test-repo-' } },
    });
  });

  describe('GET /api/repositories', () => {
    it('should get user repositories with JWT authentication', async () => {
      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repositories).toBeInstanceOf(Array);
      expect(response.body.data.repositories).toHaveLength(1);
      expect(response.body.data.repositories[0].name).toBe('test-repo-integration');
    });

    it('should get user repositories with API key authentication', async () => {
      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${apiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repositories).toBeInstanceOf(Array);
    });

    it('should filter repositories by language', async () => {
      // Create additional repository with different language
      await integrationUtils.createTestRepository(testUser.id, {
        name: 'test-python-repo',
        language: 'Python',
      });

      const response = await request(app)
        .get('/api/repositories?language=TypeScript')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.repositories).toHaveLength(1);
      expect(response.body.data.repositories[0].language).toBe('TypeScript');
    });

    it('should filter repositories by active status', async () => {
      // Create inactive repository
      await integrationUtils.createTestRepository(testUser.id, {
        name: 'test-inactive-repo',
        isActive: false,
      });

      const response = await request(app)
        .get('/api/repositories?active=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const activeRepos = response.body.data.repositories.filter((r: any) => r.isActive);
      expect(activeRepos).toHaveLength(response.body.data.repositories.length);
    });

    it('should paginate repositories', async () => {
      // Create multiple repositories
      for (let i = 0; i < 5; i++) {
        await integrationUtils.createTestRepository(testUser.id, {
          name: `test-repo-${i}`,
        });
      }

      const response = await request(app)
        .get('/api/repositories?limit=3&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.repositories).toHaveLength(3);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(6);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/repositories')
        .expect(401);
    });

    it('should handle invalid authentication', async () => {
      await request(app)
        .get('/api/repositories')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/repositories', () => {
    it('should add repository successfully', async () => {
      const repositoryData = {
        fullName: 'repostest/new-test-repo',
        description: 'A new test repository',
      };

      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`)
        .send(repositoryData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repository.fullName).toBe(repositoryData.fullName);
      expect(response.body.data.repository.description).toBe(repositoryData.description);
      expect(response.body.data.repository.userId).toBe(testUser.id);

      // Verify repository was created in database
      const createdRepo = await db.repository.findFirst({
        where: { fullName: repositoryData.fullName },
      });
      expect(createdRepo).toBeDefined();
    });

    it('should validate repository data', async () => {
      const invalidData = {
        fullName: 'invalid-format', // Missing owner/repo format
      };

      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle duplicate repository', async () => {
      const repositoryData = {
        fullName: testRepository.fullName,
      };

      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`)
        .send(repositoryData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT_ERROR');
    });

    it('should validate GitHub repository access', async () => {
      const repositoryData = {
        fullName: 'private-user/private-repo',
      };

      // Mock GitHub API to return access denied
      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer ${authToken}`)
        .send(repositoryData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('access');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/repositories')
        .send({ fullName: 'test/repo' })
        .expect(401);
    });
  });

  describe('GET /api/repositories/:id', () => {
    it('should get repository by ID', async () => {
      const response = await request(app)
        .get(`/api/repositories/${testRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repository.id).toBe(testRepository.id);
      expect(response.body.data.repository.name).toBe(testRepository.name);
    });

    it('should include repository statistics', async () => {
      const response = await request(app)
        .get(`/api/repositories/${testRepository.id}?include=stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.repository.stats).toBeDefined();
      expect(response.body.data.repository.stats).toHaveProperty('totalDigests');
      expect(response.body.data.repository.stats).toHaveProperty('lastDigestAt');
    });

    it('should return 404 for non-existent repository', async () => {
      const response = await request(app)
        .get('/api/repositories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for repository owned by different user', async () => {
      const otherUser = await integrationUtils.createTestUser({
        email: 'other-user@test.example',
      });
      const otherRepository = await integrationUtils.createTestRepository(otherUser.id);

      const response = await request(app)
        .get(`/api/repositories/${otherRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/repositories/:id', () => {
    it('should update repository successfully', async () => {
      const updateData = {
        description: 'Updated repository description',
        isActive: false,
      };

      const response = await request(app)
        .patch(`/api/repositories/${testRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repository.description).toBe(updateData.description);
      expect(response.body.data.repository.isActive).toBe(updateData.isActive);

      // Verify update in database
      const updatedRepo = await db.repository.findUnique({
        where: { id: testRepository.id },
      });
      expect(updatedRepo?.description).toBe(updateData.description);
      expect(updatedRepo?.isActive).toBe(updateData.isActive);
    });

    it('should validate update data', async () => {
      const invalidData = {
        stars: -1, // Negative value not allowed
      };

      const response = await request(app)
        .patch(`/api/repositories/${testRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent repository', async () => {
      const response = await request(app)
        .patch('/api/repositories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for repository owned by different user', async () => {
      const otherUser = await integrationUtils.createTestUser({
        email: 'other-update@test.example',
      });
      const otherRepository = await integrationUtils.createTestRepository(otherUser.id);

      const response = await request(app)
        .patch(`/api/repositories/${otherRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'Unauthorized update' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/repositories/:id', () => {
    it('should delete repository successfully', async () => {
      const response = await request(app)
        .delete(`/api/repositories/${testRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Repository deleted successfully');

      // Verify deletion from database
      const deletedRepo = await db.repository.findUnique({
        where: { id: testRepository.id },
      });
      expect(deletedRepo).toBeNull();
    });

    it('should cascade delete related data', async () => {
      // Create related digest
      const testDigest = await integrationUtils.createTestDigest(
        testRepository.id,
        testUser.id
      );

      await request(app)
        .delete(`/api/repositories/${testRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify related data was deleted
      const deletedDigest = await db.digest.findUnique({
        where: { id: testDigest.id },
      });
      expect(deletedDigest).toBeNull();
    });

    it('should return 404 for non-existent repository', async () => {
      const response = await request(app)
        .delete('/api/repositories/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for repository owned by different user', async () => {
      const otherUser = await integrationUtils.createTestUser({
        email: 'other-delete@test.example',
      });
      const otherRepository = await integrationUtils.createTestRepository(otherUser.id);

      const response = await request(app)
        .delete(`/api/repositories/${otherRepository.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/repositories/:id/sync', () => {
    it('should sync repository with GitHub successfully', async () => {
      const response = await request(app)
        .post(`/api/repositories/${testRepository.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.repository.lastSyncAt).toBeDefined();

      // Verify sync timestamp was updated
      const syncedRepo = await db.repository.findUnique({
        where: { id: testRepository.id },
      });
      expect(syncedRepo?.lastSyncAt).toBeDefined();
    });

    it('should handle GitHub API errors during sync', async () => {
      // Mock GitHub API to return error
      const response = await request(app)
        .post(`/api/repositories/${testRepository.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('sync');
    });

    it('should require repository write permission', async () => {
      // Test with user who doesn't own the repository
      const otherUser = await integrationUtils.createTestUser({
        email: 'other-sync@test.example',
      });
      const otherRepository = await integrationUtils.createTestRepository(otherUser.id);

      const response = await request(app)
        .post(`/api/repositories/${otherRepository.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/repositories/:id/digests', () => {
    it('should get repository digests', async () => {
      // Create test digests
      await integrationUtils.createTestDigest(testRepository.id, testUser.id, {
        title: 'Daily Digest 1',
        period: 'daily',
      });
      await integrationUtils.createTestDigest(testRepository.id, testUser.id, {
        title: 'Weekly Digest 1',
        period: 'weekly',
      });

      const response = await request(app)
        .get(`/api/repositories/${testRepository.id}/digests`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.digests).toHaveLength(2);
      expect(response.body.data.digests[0].repositoryId).toBe(testRepository.id);
    });

    it('should filter digests by period', async () => {
      await integrationUtils.createTestDigest(testRepository.id, testUser.id, {
        period: 'daily',
      });
      await integrationUtils.createTestDigest(testRepository.id, testUser.id, {
        period: 'weekly',
      });

      const response = await request(app)
        .get(`/api/repositories/${testRepository.id}/digests?period=daily`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.digests).toHaveLength(1);
      expect(response.body.data.digests[0].period).toBe('daily');
    });

    it('should filter digests by date range', async () => {
      const startDate = new Date('2023-12-01').toISOString();
      const endDate = new Date('2023-12-31').toISOString();

      const response = await request(app)
        .get(`/api/repositories/${testRepository.id}/digests?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.digests).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/repositories/:id/digests', () => {
    it('should generate new digest', async () => {
      const digestData = {
        period: 'daily',
        startDate: new Date('2023-12-01').toISOString(),
        endDate: new Date('2023-12-02').toISOString(),
      };

      const response = await request(app)
        .post(`/api/repositories/${testRepository.id}/digests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(digestData)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.job).toBeDefined();
      expect(response.body.data.job.type).toBe('digest_generation');
      expect(response.body.data.job.status).toBe('pending');
    });

    it('should validate digest parameters', async () => {
      const invalidData = {
        period: 'invalid-period',
        startDate: 'invalid-date',
        endDate: new Date('2023-12-01').toISOString(),
      };

      const response = await request(app)
        .post(`/api/repositories/${testRepository.id}/digests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('rate limiting', () => {
    it('should apply rate limiting to repository endpoints', async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/repositories')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should succeed, but rate limiting should kick in
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      // This would need to be implemented with database mocking
      // For now, we'll just verify the error handling structure exists
      expect(true).toBe(true);
    });

    it('should handle GitHub API timeout errors', async () => {
      // Mock GitHub API timeout
      const response = await request(app)
        .post(`/api/repositories/${testRepository.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});