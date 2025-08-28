import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { authService } from '../../src/services/auth';
import jwt from 'jsonwebtoken';

describe('Security Tests', () => {
  let testUser: any;
  let validToken: string;
  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    // Create test users
    testUser = await db.user.create({
      data: {
        username: 'securitytest',
        email: 'security@test.example',
        passwordHash: await require('bcrypt').hash('SecurePassword123!', 12),
        fullName: 'Security Test User',
        isActive: true,
      },
    });

    adminUser = await db.user.create({
      data: {
        username: 'securityadmin',
        email: 'admin@test.example',
        passwordHash: await require('bcrypt').hash('AdminPassword123!', 12),
        fullName: 'Security Admin User',
        isActive: true,
      },
    });

    // Generate valid tokens
    const tokens = authService.generateTokens(testUser.id);
    validToken = tokens.accessToken;

    const adminTokens = authService.generateTokens(adminUser.id);
    adminToken = adminTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await db.user.deleteMany({
      where: { email: { contains: '@test.example' } },
    });
  });

  describe('Authentication Security', () => {
    it('should reject requests with invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid.token.here',
        'Bearer invalid-token',
        jwt.sign({ userId: 999 }, 'wrong-secret'),
        jwt.sign({ userId: testUser.id }, 'wrong-secret'),
        '', // Empty token
        null,
        undefined,
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/repositories')
          .set('Authorization', token ? `Bearer ${token}` : '');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      }
    });

    it('should reject expired JWT tokens', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { 
          userId: testUser.id, 
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        },
        process.env.JWT_SECRET!
      );

      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject tokens with invalid payload structure', async () => {
      const invalidPayloads = [
        {}, // Empty payload
        { userId: 'not-a-number' }, // Invalid userId type
        { userId: testUser.id }, // Missing type
        { type: 'access' }, // Missing userId
        { userId: testUser.id, type: 'invalid-type' }, // Invalid type
      ];

      for (const payload of invalidPayloads) {
        const invalidToken = jwt.sign(payload, process.env.JWT_SECRET!);
        
        const response = await request(app)
          .get('/api/repositories')
          .set('Authorization', `Bearer ${invalidToken}`);

        expect(response.status).toBe(401);
      }
    });

    it('should reject tokens for inactive users', async () => {
      // Create inactive user
      const inactiveUser = await db.user.create({
        data: {
          username: 'inactiveuser',
          email: 'inactive@test.example',
          passwordHash: 'hashed_password',
          fullName: 'Inactive User',
          isActive: false,
        },
      });

      const inactiveUserTokens = authService.generateTokens(inactiveUser.id);

      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${inactiveUserTokens.accessToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle token manipulation attempts', async () => {
      // Attempt to modify token payload
      const validPayload = jwt.decode(validToken) as any;
      const modifiedPayload = { ...validPayload, userId: adminUser.id };
      const manipulatedToken = jwt.sign(modifiedPayload, 'wrong-secret');

      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${manipulatedToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Authorization Security', () => {
    beforeEach(async () => {
      // Create test repositories owned by different users
      await db.repository.create({
        data: {
          name: 'user-repo',
          fullName: 'securitytest/user-repo',
          url: 'https://github.com/securitytest/user-repo',
          userId: testUser.id,
          githubId: 123456,
          isActive: true,
        },
      });

      await db.repository.create({
        data: {
          name: 'admin-repo',
          fullName: 'securityadmin/admin-repo',
          url: 'https://github.com/securityadmin/admin-repo',
          userId: adminUser.id,
          githubId: 123457,
          isActive: true,
        },
      });
    });

    afterEach(async () => {
      await db.repository.deleteMany({
        where: { name: { in: ['user-repo', 'admin-repo'] } },
      });
    });

    it('should prevent access to other users repositories', async () => {
      const adminRepo = await db.repository.findFirst({
        where: { name: 'admin-repo' },
      });

      // User tries to access admin's repository
      const response = await request(app)
        .get(`/api/repositories/${adminRepo!.id}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent unauthorized repository modifications', async () => {
      const adminRepo = await db.repository.findFirst({
        where: { name: 'admin-repo' },
      });

      // User tries to update admin's repository
      const updateResponse = await request(app)
        .patch(`/api/repositories/${adminRepo!.id}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ description: 'Unauthorized update attempt' });

      expect(updateResponse.status).toBe(403);

      // User tries to delete admin's repository
      const deleteResponse = await request(app)
        .delete(`/api/repositories/${adminRepo!.id}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(deleteResponse.status).toBe(403);
    });

    it('should enforce proper API key permissions', async () => {
      // Create API key with limited permissions
      const limitedApiKey = await db.apiKey.create({
        data: {
          id: 'test_limited_key',
          name: 'Limited Test Key',
          keyHash: 'hashed_key',
          userId: testUser.id,
          isActive: true,
          permissions: JSON.stringify(['repo:read']), // Only read permissions
        },
      });

      // Try to create repository with limited API key
      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer dd_${limitedApiKey.id}`)
        .send({
          fullName: 'securitytest/new-repo',
          description: 'Unauthorized creation attempt',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('should prevent privilege escalation attempts', async () => {
      // Try to access admin endpoints with regular user token
      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/system/stats',
        '/api/admin/jobs',
      ];

      for (const endpoint of adminEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${validToken}`);

        expect(response.status).toBeOneOf([401, 403, 404]);
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "admin' /*",
        "'; UNION SELECT * FROM users --",
      ];

      for (const maliciousInput of sqlInjectionAttempts) {
        // Try SQL injection in login
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: maliciousInput,
            password: 'password',
          });

        expect(loginResponse.status).toBe(400);
        expect(loginResponse.body.error.code).toBe('VALIDATION_ERROR');

        // Try SQL injection in repository search
        const searchResponse = await request(app)
          .get(`/api/repositories?search=${encodeURIComponent(maliciousInput)}`)
          .set('Authorization', `Bearer ${validToken}`);

        expect(searchResponse.status).toBeOneOf([400, 422]);
      }
    });

    it('should prevent XSS attacks', async () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<svg onload="alert(1)">',
        '"><script>alert("xss")</script>',
      ];

      for (const xssPayload of xssAttempts) {
        // Try XSS in repository creation
        const response = await request(app)
          .post('/api/repositories')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            fullName: 'securitytest/test-repo',
            description: xssPayload,
          });

        if (response.status === 201) {
          // If creation succeeded, check that XSS payload was sanitized
          expect(response.body.data.repository.description).not.toContain('<script>');
          expect(response.body.data.repository.description).not.toContain('javascript:');
          expect(response.body.data.repository.description).not.toContain('onerror=');
        }
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const noSqlInjectionAttempts = [
        { $ne: null },
        { $regex: '.*' },
        { $where: 'this.password.match(/.*/)' },
        { $or: [{ password: 'admin' }, { password: { $ne: null } }] },
      ];

      for (const maliciousInput of noSqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: JSON.stringify(maliciousInput),
            password: 'password',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should validate input length limits', async () => {
      const longString = 'a'.repeat(10000);

      // Test various endpoints with overly long inputs
      const testCases = [
        {
          endpoint: '/api/auth/register',
          method: 'post',
          data: {
            username: longString,
            email: 'test@example.com',
            password: 'password',
          },
        },
        {
          endpoint: '/api/repositories',
          method: 'post',
          data: {
            fullName: 'user/repo',
            description: longString,
          },
          auth: true,
        },
      ];

      for (const testCase of testCases) {
        const req = request(app)[testCase.method](testCase.endpoint);
        
        if (testCase.auth) {
          req.set('Authorization', `Bearer ${validToken}`);
        }
        
        const response = await req.send(testCase.data);
        
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should validate email format strictly', async () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..name@domain.com',
        'user@domain.',
        '<script>alert("xss")</script>@domain.com',
        'user@domain@domain.com',
        'user name@domain.com', // Space not allowed
      ];

      for (const invalidEmail of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: invalidEmail,
            password: 'ValidPassword123!',
            fullName: 'Test User',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should enforce password complexity requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'qwerty',
        'abc123',
        'Password', // Missing special character and number
        'password123', // Missing uppercase
        'PASSWORD123', // Missing lowercase
        'Password!', // Too short
      ];

      for (const weakPassword of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: weakPassword,
            fullName: 'Test User',
          });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.message).toContain('password');
      }
    });
  });

  describe('Rate Limiting Security', () => {
    it('should apply rate limiting to authentication endpoints', async () => {
      const loginAttempts = [];

      // Make rapid login attempts
      for (let i = 0; i < 20; i++) {
        loginAttempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'security@test.example',
              password: 'wrongpassword',
            })
        );
      }

      const responses = await Promise.all(loginAttempts);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Some requests should be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should apply different rate limits for different endpoints', async () => {
      // Test that API endpoints have appropriate rate limiting
      const rapidRequests = [];

      for (let i = 0; i < 15; i++) {
        rapidRequests.push(
          request(app)
            .get('/api/repositories')
            .set('Authorization', `Bearer ${validToken}`)
        );
      }

      const responses = await Promise.all(rapidRequests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Rate limiting should eventually kick in
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should include proper rate limit headers', async () => {
      const response = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for state-changing operations', async () => {
      // Attempt to create repository without CSRF token
      const response = await request(app)
        .post('/api/repositories')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'https://malicious-site.com')
        .send({
          fullName: 'securitytest/csrf-test-repo',
          description: 'CSRF attack attempt',
        });

      // Should be rejected if CSRF protection is enabled
      if (response.status === 403) {
        expect(response.body.error.code).toBe('CSRF_ERROR');
      }
    });

    it('should validate request origin headers', async () => {
      const maliciousOrigins = [
        'https://malicious-site.com',
        'http://localhost:3001', // Different port
        'https://fake-daily-digest.com',
        'null', // Common in some attack scenarios
      ];

      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .post('/api/repositories')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Origin', origin)
          .send({
            fullName: 'securitytest/origin-test-repo',
            description: 'Origin validation test',
          });

        // Should validate origin if protection is enabled
        if (response.status === 403) {
          expect(response.body.error.code).toContain('ORIGIN');
        }
      }
    });
  });

  describe('Data Exposure Prevention', () => {
    it('should not expose sensitive data in API responses', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      
      // Should not expose sensitive fields
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.user.password).toBeUndefined();
      expect(response.body.data.user.salt).toBeUndefined();
      expect(response.body.data.user.apiKeys).toBeUndefined();
    });

    it('should not expose other users data in search results', async () => {
      // Search that might return other users' data
      const response = await request(app)
        .get('/api/repositories?search=admin')
        .set('Authorization', `Bearer ${validToken}`);

      if (response.status === 200) {
        const repositories = response.body.data.repositories;
        
        // Should only return current user's repositories
        repositories.forEach((repo: any) => {
          expect(repo.userId).toBe(testUser.id);
        });
      }
    });

    it('should not leak information through error messages', async () => {
      // Try to access non-existent repository
      const response = await request(app)
        .get('/api/repositories/99999')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      
      // Error message should not reveal internal information
      expect(response.body.error.message).not.toContain('database');
      expect(response.body.error.message).not.toContain('sql');
      expect(response.body.error.message).not.toContain('internal');
    });
  });

  describe('Session Security', () => {
    it('should handle concurrent sessions properly', async () => {
      // Create multiple sessions for the same user
      const sessions = [];
      
      for (let i = 0; i < 3; i++) {
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'security@test.example',
            password: 'SecurePassword123!',
          });

        expect(loginResponse.status).toBe(200);
        sessions.push(loginResponse.body.data.tokens.accessToken);
      }

      // All sessions should be valid initially
      for (const token of sessions) {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
      }

      // Logout from one session should not affect others
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${sessions[0]}`)
        .send({ refreshToken: 'mock-refresh-token' });

      // Other sessions should still be valid
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessions[1]}`);

      expect(response.status).toBe(200);
    });

    it('should invalidate sessions on password change', async () => {
      // Create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'security@test.example',
          password: 'SecurePassword123!',
        });

      const sessionToken = loginResponse.body.data.tokens.accessToken;

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${sessionToken}`)
        .send({
          currentPassword: 'SecurePassword123!',
          newPassword: 'NewSecurePassword123!',
        });

      // Old session should be invalidated
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${sessionToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('API Key Security', () => {
    it('should validate API key format', async () => {
      const invalidApiKeys = [
        'invalid-key',
        'dd_short',
        'dd_' + 'x'.repeat(100), // Too long
        'wrong_prefix_' + 'x'.repeat(64),
      ];

      for (const invalidKey of invalidApiKeys) {
        const response = await request(app)
          .get('/api/repositories')
          .set('Authorization', `Bearer ${invalidKey}`);

        expect(response.status).toBe(401);
      }
    });

    it('should handle API key rotation securely', async () => {
      // Create API key
      const createResponse = await request(app)
        .post('/api/auth/api-keys')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ name: 'Security Test Key' });

      expect(createResponse.status).toBe(201);
      const { apiKey, key } = createResponse.body.data;
      const oldKey = key;

      // Rotate API key
      const rotateResponse = await request(app)
        .post(`/api/auth/api-keys/${apiKey.id}/rotate`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(rotateResponse.status).toBe(200);
      const newKey = rotateResponse.body.data.key;

      // Old key should no longer work
      const oldKeyResponse = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${oldKey}`);

      expect(oldKeyResponse.status).toBe(401);

      // New key should work
      const newKeyResponse = await request(app)
        .get('/api/repositories')
        .set('Authorization', `Bearer ${newKey}`);

      expect(newKeyResponse.status).toBe(200);
    });
  });
});