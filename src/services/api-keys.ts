import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../db';
import { logger } from '../lib/logger';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthenticationError,
} from '../lib/errors';

// Types
export interface ApiKeyData {
  id: string;
  name: string;
  userId: number;
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface CreateApiKeyData {
  name: string;
  userId: number;
  expiresAt?: Date;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeyData;
  key: string; // The actual key to return to user (only shown once)
}

export interface UpdateApiKeyData {
  name?: string;
  isActive?: boolean;
  expiresAt?: Date;
}

// Configuration
const API_KEY_PREFIX = 'dd_'; // daily-dev prefix
const API_KEY_LENGTH = 32;
const SALT_ROUNDS = 12;

class ApiKeyService {
  /**
   * Generate a new API key
   */
  private generateApiKey(): string {
    const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
    return API_KEY_PREFIX + randomBytes.toString('hex');
  }

  /**
   * Hash an API key for storage
   */
  private async hashApiKey(key: string): Promise<string> {
    return bcrypt.hash(key, SALT_ROUNDS);
  }

  /**
   * Verify an API key against its hash
   */
  private async verifyApiKey(key: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(key, hash);
    } catch (error) {
      logger.error({ error }, 'Failed to verify API key');
      return false;
    }
  }

  /**
   * Create a new API key
   */
  async createApiKey(data: CreateApiKeyData): Promise<CreateApiKeyResult> {
    try {
      // Check if user exists and is active
      const user = await db.user.findUnique({
        where: { id: data.userId },
      });

      if (!user || !user.isActive) {
        throw new ValidationError('Invalid user');
      }

      // Check if API key name already exists for this user
      const existingKey = await db.apiKey.findFirst({
        where: {
          userId: data.userId,
          name: data.name,
        },
      });

      if (existingKey) {
        throw new ConflictError('API key name already exists');
      }

      // Generate API key
      const key = this.generateApiKey();
      const keyHash = await this.hashApiKey(key);

      // Create API key record
      const apiKey = await db.apiKey.create({
        data: {
          name: data.name,
          keyHash,
          userId: data.userId,
          expiresAt: data.expiresAt || null,
        },
      });

      logger.info(
        { apiKeyId: apiKey.id, userId: data.userId, name: data.name },
        'API key created'
      );

      return {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          userId: apiKey.userId,
          isActive: apiKey.isActive,
          expiresAt: apiKey.expiresAt,
          lastUsedAt: apiKey.lastUsedAt,
          createdAt: apiKey.createdAt,
        },
        key, // Return the actual key (only time it's visible)
      };
    } catch (error) {
      logger.error({ error, userId: data.userId, name: data.name }, 'Failed to create API key');
      throw error;
    }
  }

  /**
   * Get API keys for a user
   */
  async getUserApiKeys(userId: number): Promise<ApiKeyData[]> {
    try {
      const apiKeys = await db.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        userId: key.userId,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user API keys');
      throw error;
    }
  }

  /**
   * Get API key by ID
   */
  async getApiKey(id: string, userId?: number): Promise<ApiKeyData | null> {
    try {
      const where: any = { id };
      if (userId !== undefined) {
        where.userId = userId;
      }

      const apiKey = await db.apiKey.findUnique({
        where,
      });

      if (!apiKey) {
        return null;
      }

      return {
        id: apiKey.id,
        name: apiKey.name,
        userId: apiKey.userId,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
      };
    } catch (error) {
      logger.error({ error, id, userId }, 'Failed to get API key');
      throw error;
    }
  }

  /**
   * Update an API key
   */
  async updateApiKey(id: string, data: UpdateApiKeyData, userId?: number): Promise<ApiKeyData> {
    try {
      const where: any = { id };
      if (userId !== undefined) {
        where.userId = userId;
      }

      // Check if API key exists
      const existingKey = await db.apiKey.findUnique({
        where,
      });

      if (!existingKey) {
        throw new NotFoundError('API key');
      }

      // If updating name, check for conflicts
      if (data.name && data.name !== existingKey.name) {
        const conflictingKey = await db.apiKey.findFirst({
          where: {
            userId: existingKey.userId,
            name: data.name,
            id: { not: id },
          },
        });

        if (conflictingKey) {
          throw new ConflictError('API key name already exists');
        }
      }

      // Update API key
      const updatedKey = await db.apiKey.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
        },
      });

      logger.info(
        { apiKeyId: id, userId: existingKey.userId, changes: data },
        'API key updated'
      );

      return {
        id: updatedKey.id,
        name: updatedKey.name,
        userId: updatedKey.userId,
        isActive: updatedKey.isActive,
        expiresAt: updatedKey.expiresAt,
        lastUsedAt: updatedKey.lastUsedAt,
        createdAt: updatedKey.createdAt,
      };
    } catch (error) {
      logger.error({ error, id, data }, 'Failed to update API key');
      throw error;
    }
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(id: string, userId?: number): Promise<void> {
    try {
      const where: any = { id };
      if (userId !== undefined) {
        where.userId = userId;
      }

      // Check if API key exists
      const existingKey = await db.apiKey.findUnique({
        where,
      });

      if (!existingKey) {
        throw new NotFoundError('API key');
      }

      // Delete API key
      await db.apiKey.delete({
        where: { id },
      });

      logger.info(
        { apiKeyId: id, userId: existingKey.userId, name: existingKey.name },
        'API key deleted'
      );
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete API key');
      throw error;
    }
  }

  /**
   * Authenticate user by API key
   */
  async authenticateApiKey(key: string): Promise<{
    user: { id: number; username: string; email: string; isActive: boolean };
    apiKey: ApiKeyData;
  } | null> {
    try {
      if (!key || !key.startsWith(API_KEY_PREFIX)) {
        return null;
      }

      // Get all active API keys
      const apiKeys = await db.apiKey.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          user: true,
        },
      });

      // Check each API key hash
      for (const apiKey of apiKeys) {
        const isValid = await this.verifyApiKey(key, apiKey.keyHash);
        if (isValid) {
          // Check if user is still active
          if (!apiKey.user.isActive) {
            return null;
          }

          // Update last used timestamp
          await this.updateLastUsed(apiKey.id);

          const apiKeyData: ApiKeyData = {
            id: apiKey.id,
            name: apiKey.name,
            userId: apiKey.userId,
            isActive: apiKey.isActive,
            expiresAt: apiKey.expiresAt,
            lastUsedAt: new Date(), // Just updated
            createdAt: apiKey.createdAt,
          };

          return {
            user: {
              id: apiKey.user.id,
              username: apiKey.user.username,
              email: apiKey.user.email,
              isActive: apiKey.user.isActive,
            },
            apiKey: apiKeyData,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'API key authentication failed');
      return null;
    }
  }

  /**
   * Update last used timestamp for an API key
   */
  private async updateLastUsed(id: string): Promise<void> {
    try {
      await db.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      // Log but don't throw - this is not critical
      logger.error({ error, id }, 'Failed to update API key last used timestamp');
    }
  }

  /**
   * Rotate API key (disable old one and create new one)
   */
  async rotateApiKey(id: string, userId?: number): Promise<CreateApiKeyResult> {
    try {
      const where: any = { id };
      if (userId !== undefined) {
        where.userId = userId;
      }

      // Get existing API key
      const existingKey = await db.apiKey.findUnique({
        where,
      });

      if (!existingKey) {
        throw new NotFoundError('API key');
      }

      // Create new API key with same name
      const newApiKey = await this.createApiKey({
        name: existingKey.name,
        userId: existingKey.userId,
        expiresAt: existingKey.expiresAt,
      });

      // Disable old API key
      await db.apiKey.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info(
        { oldKeyId: id, newKeyId: newApiKey.apiKey.id, userId: existingKey.userId },
        'API key rotated'
      );

      return newApiKey;
    } catch (error) {
      logger.error({ error, id }, 'Failed to rotate API key');
      throw error;
    }
  }

  /**
   * Clean up expired API keys
   */
  async cleanupExpiredKeys(): Promise<void> {
    try {
      const result = await db.apiKey.updateMany({
        where: {
          isActive: true,
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          isActive: false,
        },
      });

      logger.info({ deactivatedKeys: result.count }, 'Cleaned up expired API keys');
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired API keys');
    }
  }

  /**
   * Get API key usage statistics
   */
  async getApiKeyStats(userId?: number): Promise<{
    total: number;
    active: number;
    expired: number;
    lastUsed: Date | null;
  }> {
    try {
      const where: any = {};
      if (userId !== undefined) {
        where.userId = userId;
      }

      const [total, active, expired, lastUsedResult] = await Promise.all([
        db.apiKey.count({ where }),
        db.apiKey.count({ 
          where: { 
            ...where, 
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          } 
        }),
        db.apiKey.count({ 
          where: { 
            ...where, 
            expiresAt: { lt: new Date() } 
          } 
        }),
        db.apiKey.findFirst({
          where: {
            ...where,
            lastUsedAt: { not: null },
          },
          orderBy: { lastUsedAt: 'desc' },
          select: { lastUsedAt: true },
        }),
      ]);

      return {
        total,
        active,
        expired,
        lastUsed: lastUsedResult?.lastUsedAt || null,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get API key stats');
      throw error;
    }
  }
}

export const apiKeyService = new ApiKeyService();