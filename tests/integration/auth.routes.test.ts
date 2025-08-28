import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authService } from '../../src/services/auth';
import { apiKeyService } from '../../src/services/api-keys';
import authRouter from '../../src/routes/auth';
import { errorHandler } from '../../src/lib/errors';
import { PERMISSIONS } from '../../src/lib/auth';

// Mock services
vi.mock('../../src/services/auth');
vi.mock('../../src/services/api-keys');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use(errorHandler);

describe('Auth Routes Integration', () => {
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    fullName: 'Test User',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    roles: [
      {
        id: 1,
        name: 'user',
        permissions: [PERMISSIONS.USER_READ, PERMISSIONS.API_KEY_READ],
      },
    ],
  };

  const mockTokens = {
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_123',
    expiresIn: 86400,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register user successfully', async () => {
      const registerData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'Password123!',
        fullName: 'New User',
      };

      vi.mocked(authService.register).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe(mockUser.username);
      expect(authService.register).toHaveBeenCalledWith(registerData);
    });

    it('should validate registration data', async () => {
      const invalidData = {
        username: 'a', // Too short
        email: 'invalid-email',
        password: '123', // Too weak
      };

      const response = await request(app)
        .post('/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle registration conflict', async () => {
      const registerData = {
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'Password123!',
      };

      vi.mocked(authService.register).mockRejectedValue(
        new Error('Email already registered')
      );

      const response = await request(app)
        .post('/auth/register')
        .send(registerData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /auth/login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'Password123!',
        rememberMe: false,
      };

      const loginResult = {
        user: mockUser,
        tokens: mockTokens,
      };

      vi.mocked(authService.login).mockResolvedValue(loginResult);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(mockUser.id);
      expect(response.body.data.tokens).toEqual(mockTokens);
      expect(authService.login).toHaveBeenCalledWith(
        loginData.email,
        loginData.password,
        loginData.rememberMe
      );
    });

    it('should validate login data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '', // Empty password
      };

      const response = await request(app)
        .post('/auth/login')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle authentication failure', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      vi.mocked(authService.login).mockRejectedValue(
        new Error('Invalid email or password')
      );

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshData = {
        refreshToken: 'valid_refresh_token',
      };

      vi.mocked(authService.refreshToken).mockResolvedValue(mockTokens);

      const response = await request(app)
        .post('/auth/refresh')
        .send(refreshData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toEqual(mockTokens);
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshData.refreshToken);
    });

    it('should validate refresh token', async () => {
      const invalidData = {
        refreshToken: '', // Empty token
      };

      const response = await request(app)
        .post('/auth/refresh')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout user successfully with authentication', async () => {
      const logoutData = {
        refreshToken: 'valid_refresh_token',
      };

      // Mock authentication middleware
      vi.mocked(authService.verifyToken).mockReturnValue({ userId: 1 });
      vi.mocked(authService.getUserWithRoles).mockResolvedValue(mockUser);
      vi.mocked(authService.logout).mockResolvedValue();

      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid_access_token')
        .send(logoutData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Logout successful');
    });

    it('should require authentication for logout', async () => {
      const logoutData = {
        refreshToken: 'valid_refresh_token',
      };

      const response = await request(app)
        .post('/auth/logout')
        .send(logoutData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should request password reset successfully', async () => {
      const forgotData = {
        email: 'test@example.com',
      };

      vi.mocked(authService.requestPasswordReset).mockResolvedValue();

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(forgotData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Password reset instructions sent to email');
      expect(authService.requestPasswordReset).toHaveBeenCalledWith(forgotData.email);
    });

    it('should validate email format', async () => {
      const invalidData = {
        email: 'invalid-email',
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    it('should return current user profile with JWT authentication', async () => {
      // Mock authentication
      vi.mocked(authService.verifyToken).mockReturnValue({ userId: 1 });
      vi.mocked(authService.getUserWithRoles).mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer valid_access_token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(mockUser.id);
      expect(response.body.data.authMethod).toBe('jwt');
    });

    it('should return current user profile with API key authentication', async () => {
      // Mock API key authentication
      const mockApiKeyAuth = {
        user: { id: 1, username: 'testuser', email: 'test@example.com', isActive: true },
        apiKey: { id: 'ak_123', name: 'Test Key', userId: 1 },
      };

      vi.mocked(apiKeyService.authenticateApiKey).mockResolvedValue(mockApiKeyAuth);
      vi.mocked(authService.getUserWithRoles).mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer dd_validapikey123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(mockUser.id);
      expect(response.body.data.authMethod).toBe('api_key');
      expect(response.body.data.apiKey).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('POST /auth/change-password', () => {
    it('should change password successfully', async () => {
      const changePasswordData = {
        currentPassword: 'oldPassword123!',
        newPassword: 'newPassword123!',
      };

      // Mock authentication
      vi.mocked(authService.verifyToken).mockReturnValue({ userId: 1 });
      vi.mocked(authService.getUserWithRoles).mockResolvedValue(mockUser);
      vi.mocked(authService.changePassword).mockResolvedValue();

      const response = await request(app)
        .post('/auth/change-password')
        .set('Authorization', 'Bearer valid_access_token')
        .send(changePasswordData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Password changed successfully');
      expect(authService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        changePasswordData.currentPassword,
        changePasswordData.newPassword
      );
    });

    it('should validate password strength', async () => {
      const invalidData = {
        currentPassword: 'oldPassword123!',
        newPassword: '123', // Too weak
      };

      // Mock authentication
      vi.mocked(authService.verifyToken).mockReturnValue({ userId: 1 });
      vi.mocked(authService.getUserWithRoles).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/auth/change-password')
        .set('Authorization', 'Bearer valid_access_token')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('API Key Routes', () => {
    const mockApiKey = {
      id: 'ak_test123',
      name: 'Test API Key',
      userId: 1,
      isActive: true,
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      // Mock authentication for API key routes
      vi.mocked(authService.verifyToken).mockReturnValue({ userId: 1 });
      vi.mocked(authService.getUserWithRoles).mockResolvedValue({
        ...mockUser,
        roles: [
          {
            id: 1,
            name: 'user',
            permissions: [
              PERMISSIONS.USER_READ,
              PERMISSIONS.API_KEY_READ,
              PERMISSIONS.API_KEY_WRITE,
              PERMISSIONS.API_KEY_DELETE,
            ],
          },
        ],
      });
    });

    describe('POST /auth/api-keys', () => {
      it('should create API key successfully', async () => {
        const createData = {
          name: 'Test API Key',
        };

        const createResult = {
          apiKey: mockApiKey,
          key: 'dd_generatedkey123',
        };

        vi.mocked(apiKeyService.createApiKey).mockResolvedValue(createResult);

        const response = await request(app)
          .post('/auth/api-keys')
          .set('Authorization', 'Bearer valid_access_token')
          .send(createData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.apiKey.name).toBe(mockApiKey.name);
        expect(response.body.data.key).toBe(createResult.key);
        expect(apiKeyService.createApiKey).toHaveBeenCalledWith({
          name: createData.name,
          userId: mockUser.id,
          expiresAt: undefined,
        });
      });
    });

    describe('GET /auth/api-keys', () => {
      it('should return user API keys', async () => {
        const apiKeys = [mockApiKey];

        vi.mocked(apiKeyService.getUserApiKeys).mockResolvedValue(apiKeys);

        const response = await request(app)
          .get('/auth/api-keys')
          .set('Authorization', 'Bearer valid_access_token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.apiKeys).toHaveLength(1);
        expect(response.body.data.apiKeys[0].name).toBe(mockApiKey.name);
        expect(apiKeyService.getUserApiKeys).toHaveBeenCalledWith(mockUser.id);
      });
    });

    describe('GET /auth/api-keys/:id', () => {
      it('should return specific API key', async () => {
        const apiKeyId = 'ak_test123';

        vi.mocked(apiKeyService.getApiKey).mockResolvedValue(mockApiKey);

        const response = await request(app)
          .get(`/auth/api-keys/${apiKeyId}`)
          .set('Authorization', 'Bearer valid_access_token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.apiKey.id).toBe(apiKeyId);
        expect(apiKeyService.getApiKey).toHaveBeenCalledWith(apiKeyId, mockUser.id);
      });

      it('should return 404 for non-existent API key', async () => {
        const apiKeyId = 'nonexistent';

        vi.mocked(apiKeyService.getApiKey).mockResolvedValue(null);

        const response = await request(app)
          .get(`/auth/api-keys/${apiKeyId}`)
          .set('Authorization', 'Bearer valid_access_token')
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('PATCH /auth/api-keys/:id', () => {
      it('should update API key successfully', async () => {
        const apiKeyId = 'ak_test123';
        const updateData = {
          name: 'Updated API Key',
          isActive: false,
        };

        vi.mocked(apiKeyService.updateApiKey).mockResolvedValue({
          ...mockApiKey,
          ...updateData,
        });

        const response = await request(app)
          .patch(`/auth/api-keys/${apiKeyId}`)
          .set('Authorization', 'Bearer valid_access_token')
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.apiKey.name).toBe(updateData.name);
        expect(response.body.data.apiKey.isActive).toBe(updateData.isActive);
        expect(apiKeyService.updateApiKey).toHaveBeenCalledWith(
          apiKeyId,
          updateData,
          mockUser.id
        );
      });
    });

    describe('DELETE /auth/api-keys/:id', () => {
      it('should delete API key successfully', async () => {
        const apiKeyId = 'ak_test123';

        vi.mocked(apiKeyService.deleteApiKey).mockResolvedValue();

        const response = await request(app)
          .delete(`/auth/api-keys/${apiKeyId}`)
          .set('Authorization', 'Bearer valid_access_token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('API key deleted successfully');
        expect(apiKeyService.deleteApiKey).toHaveBeenCalledWith(apiKeyId, mockUser.id);
      });
    });

    describe('POST /auth/api-keys/:id/rotate', () => {
      it('should rotate API key successfully', async () => {
        const apiKeyId = 'ak_test123';
        const rotateResult = {
          apiKey: { ...mockApiKey, id: 'ak_new123' },
          key: 'dd_newgeneratedkey123',
        };

        vi.mocked(apiKeyService.rotateApiKey).mockResolvedValue(rotateResult);

        const response = await request(app)
          .post(`/auth/api-keys/${apiKeyId}/rotate`)
          .set('Authorization', 'Bearer valid_access_token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.apiKey.id).toBe(rotateResult.apiKey.id);
        expect(response.body.data.key).toBe(rotateResult.key);
        expect(apiKeyService.rotateApiKey).toHaveBeenCalledWith(apiKeyId, mockUser.id);
      });
    });

    describe('GET /auth/stats', () => {
      it('should return API key statistics', async () => {
        const stats = {
          total: 5,
          active: 4,
          expired: 1,
          lastUsed: new Date(),
        };

        vi.mocked(apiKeyService.getApiKeyStats).mockResolvedValue(stats);

        const response = await request(app)
          .get('/auth/stats')
          .set('Authorization', 'Bearer valid_access_token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.stats).toEqual(stats);
        expect(apiKeyService.getApiKeyStats).toHaveBeenCalledWith(mockUser.id);
      });
    });
  });
});