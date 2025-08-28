import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { apiKeyService } from '../../src/services/api-keys';
import { db } from '../../src/db';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../src/lib/errors';

// Mock the database
vi.mock('../../src/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe('ApiKeyService', () => {
  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    isActive: true,
  };

  const mockApiKey = {
    id: 'ak_test123',
    name: 'Test API Key',
    keyHash: 'hashed_key',
    userId: 1,
    isActive: true,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    user: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createApiKey', () => {
    it('should create API key successfully', async () => {
      const createData = {
        name: 'Test Key',
        userId: 1,
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed_key');
      vi.mocked(db.apiKey.create).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.createApiKey(createData);

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: createData.userId },
      });
      expect(db.apiKey.findFirst).toHaveBeenCalledWith({
        where: {
          userId: createData.userId,
          name: createData.name,
        },
      });
      expect(result.apiKey.name).toBe(createData.name);
      expect(result.key).toMatch(/^dd_[a-f0-9]{64}$/);
    });

    it('should throw error for inactive user', async () => {
      const createData = {
        name: 'Test Key',
        userId: 1,
      };

      vi.mocked(db.user.findUnique).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(apiKeyService.createApiKey(createData)).rejects.toThrow(ValidationError);
    });

    it('should throw error for duplicate API key name', async () => {
      const createData = {
        name: 'Existing Key',
        userId: 1,
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(mockApiKey);

      await expect(apiKeyService.createApiKey(createData)).rejects.toThrow(ConflictError);
    });
  });

  describe('getUserApiKeys', () => {
    it('should return user API keys', async () => {
      const userId = 1;
      const apiKeys = [mockApiKey];

      vi.mocked(db.apiKey.findMany).mockResolvedValue(apiKeys);

      const result = await apiKeyService.getUserApiKeys(userId);

      expect(db.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(mockApiKey.name);
    });
  });

  describe('getApiKey', () => {
    it('should return API key by ID', async () => {
      const id = 'ak_test123';

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.getApiKey(id);

      expect(db.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
    });

    it('should return null for non-existent API key', async () => {
      const id = 'nonexistent';

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(null);

      const result = await apiKeyService.getApiKey(id);

      expect(result).toBeNull();
    });

    it('should filter by userId when provided', async () => {
      const id = 'ak_test123';
      const userId = 1;

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.getApiKey(id, userId);

      expect(db.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id, userId },
      });
    });
  });

  describe('updateApiKey', () => {
    it('should update API key successfully', async () => {
      const id = 'ak_test123';
      const updateData = {
        name: 'Updated Key',
        isActive: false,
      };

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(null);
      vi.mocked(db.apiKey.update).mockResolvedValue({
        ...mockApiKey,
        ...updateData,
      });

      const result = await apiKeyService.updateApiKey(id, updateData);

      expect(db.apiKey.update).toHaveBeenCalledWith({
        where: { id },
        data: updateData,
      });
      expect(result.name).toBe(updateData.name);
      expect(result.isActive).toBe(updateData.isActive);
    });

    it('should throw error for non-existent API key', async () => {
      const id = 'nonexistent';
      const updateData = { name: 'Updated Key' };

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(null);

      await expect(apiKeyService.updateApiKey(id, updateData)).rejects.toThrow(NotFoundError);
    });

    it('should throw error for duplicate name', async () => {
      const id = 'ak_test123';
      const updateData = { name: 'Duplicate Key' };
      const conflictingKey = { ...mockApiKey, id: 'ak_other123', name: 'Duplicate Key' };

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(conflictingKey);

      await expect(apiKeyService.updateApiKey(id, updateData)).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete API key successfully', async () => {
      const id = 'ak_test123';

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);
      vi.mocked(db.apiKey.delete).mockResolvedValue(mockApiKey);

      await apiKeyService.deleteApiKey(id);

      expect(db.apiKey.delete).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should throw error for non-existent API key', async () => {
      const id = 'nonexistent';

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(null);

      await expect(apiKeyService.deleteApiKey(id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('authenticateApiKey', () => {
    it('should authenticate valid API key', async () => {
      const key = 'dd_validkey123';
      const apiKeys = [mockApiKey];

      vi.mocked(db.apiKey.findMany).mockResolvedValue(apiKeys);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(db.apiKey.update).mockResolvedValue(mockApiKey);

      const result = await apiKeyService.authenticateApiKey(key);

      expect(result).toBeDefined();
      expect(result!.user.id).toBe(mockUser.id);
      expect(result!.apiKey.id).toBe(mockApiKey.id);
    });

    it('should return null for invalid API key format', async () => {
      const key = 'invalid_key';

      const result = await apiKeyService.authenticateApiKey(key);

      expect(result).toBeNull();
    });

    it('should return null for non-matching API key', async () => {
      const key = 'dd_invalidkey123';
      const apiKeys = [mockApiKey];

      vi.mocked(db.apiKey.findMany).mockResolvedValue(apiKeys);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      const result = await apiKeyService.authenticateApiKey(key);

      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      const key = 'dd_validkey123';
      const apiKeyWithInactiveUser = {
        ...mockApiKey,
        user: { ...mockUser, isActive: false },
      };

      vi.mocked(db.apiKey.findMany).mockResolvedValue([apiKeyWithInactiveUser]);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      const result = await apiKeyService.authenticateApiKey(key);

      expect(result).toBeNull();
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate API key successfully', async () => {
      const id = 'ak_test123';
      const newApiKey = { ...mockApiKey, id: 'ak_new123' };

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(mockApiKey);
      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('new_hashed_key');
      vi.mocked(db.apiKey.create).mockResolvedValue(newApiKey);
      vi.mocked(db.apiKey.update).mockResolvedValue({
        ...mockApiKey,
        isActive: false,
      });

      const result = await apiKeyService.rotateApiKey(id);

      expect(db.apiKey.update).toHaveBeenCalledWith({
        where: { id },
        data: { isActive: false },
      });
      expect(result.apiKey.id).toBe(newApiKey.id);
      expect(result.key).toMatch(/^dd_[a-f0-9]{64}$/);
    });

    it('should throw error for non-existent API key', async () => {
      const id = 'nonexistent';

      vi.mocked(db.apiKey.findUnique).mockResolvedValue(null);

      await expect(apiKeyService.rotateApiKey(id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should deactivate expired API keys', async () => {
      vi.mocked(db.apiKey.updateMany).mockResolvedValue({ count: 3 });

      await apiKeyService.cleanupExpiredKeys();

      expect(db.apiKey.updateMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          expiresAt: {
            lt: expect.any(Date),
          },
        },
        data: {
          isActive: false,
        },
      });
    });
  });

  describe('getApiKeyStats', () => {
    it('should return API key statistics', async () => {
      const stats = {
        total: 10,
        active: 8,
        expired: 2,
        lastUsed: new Date(),
      };

      vi.mocked(db.apiKey.count)
        .mockResolvedValueOnce(stats.total)
        .mockResolvedValueOnce(stats.active)
        .mockResolvedValueOnce(stats.expired);

      vi.mocked(db.apiKey.findFirst).mockResolvedValue({
        lastUsedAt: stats.lastUsed,
      });

      const result = await apiKeyService.getApiKeyStats();

      expect(result.total).toBe(stats.total);
      expect(result.active).toBe(stats.active);
      expect(result.expired).toBe(stats.expired);
      expect(result.lastUsed).toBe(stats.lastUsed);
    });

    it('should filter by userId when provided', async () => {
      const userId = 1;

      vi.mocked(db.apiKey.count).mockResolvedValue(5);
      vi.mocked(db.apiKey.findFirst).mockResolvedValue(null);

      await apiKeyService.getApiKeyStats(userId);

      expect(db.apiKey.count).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });
});