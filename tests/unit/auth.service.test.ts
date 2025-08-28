import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authService } from '../../src/services/auth';
import { db } from '../../src/db';
import { config } from '../../src/lib/config';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from '../../src/lib/errors';

// Mock the database
vi.mock('../../src/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    userRole: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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

// Mock jwt
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
    TokenExpiredError: Error,
    JsonWebTokenError: Error,
  },
}));

describe('AuthService', () => {
  const mockUser = {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'testpassword123';
      const hashedPassword = 'hashed_password';
      
      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword);

      const result = await authService.hashPassword(password);

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });

    it('should throw error when hashing fails', async () => {
      const password = 'testpassword123';
      
      vi.mocked(bcrypt.hash).mockRejectedValue(new Error('Hashing failed'));

      await expect(authService.hashPassword(password)).rejects.toThrow('Password hashing failed');
    });
  });

  describe('verifyPassword', () => {
    it('should verify password successfully', async () => {
      const password = 'testpassword123';
      const hash = 'hashed_password';
      
      vi.mocked(bcrypt.compare).mockResolvedValue(true);

      const result = await authService.verifyPassword(password, hash);

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      const password = 'wrongpassword';
      const hash = 'hashed_password';
      
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      const result = await authService.verifyPassword(password, hash);

      expect(result).toBe(false);
    });

    it('should return false when verification fails', async () => {
      const password = 'testpassword123';
      const hash = 'hashed_password';
      
      vi.mocked(bcrypt.compare).mockRejectedValue(new Error('Verification failed'));

      const result = await authService.verifyPassword(password, hash);

      expect(result).toBe(false);
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const userId = 1;
      const accessToken = 'access_token';
      const refreshToken = 'refresh_token';

      vi.mocked(jwt.sign)
        .mockReturnValueOnce(accessToken)
        .mockReturnValueOnce(refreshToken);

      const result = authService.generateTokens(userId);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(result.accessToken).toBe(accessToken);
      expect(result.refreshToken).toBe(refreshToken);
      expect(result.expiresIn).toBeTypeOf('number');
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode valid token', () => {
      const token = 'valid_token';
      const decoded = { userId: 1, type: 'access' };

      vi.mocked(jwt.verify).mockReturnValue(decoded);

      const result = authService.verifyToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, config.JWT_SECRET);
      expect(result).toEqual({ userId: 1 });
    });

    it('should throw error for invalid token type', () => {
      const token = 'valid_token';
      const decoded = { userId: 1, type: 'refresh' };

      vi.mocked(jwt.verify).mockReturnValue(decoded);

      expect(() => authService.verifyToken(token, 'access')).toThrow(AuthenticationError);
    });

    it('should throw error for expired token', () => {
      const token = 'expired_token';

      vi.mocked(jwt.verify).mockImplementation(() => {
        throw new jwt.TokenExpiredError('Token expired', new Date());
      });

      expect(() => authService.verifyToken(token)).toThrow(AuthenticationError);
    });
  });

  describe('register', () => {
    it('should register new user successfully', async () => {
      const registerData = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
      };

      const hashedPassword = 'hashed_password';
      const newUser = { ...mockUser, id: 2, ...registerData, passwordHash: hashedPassword };
      const userRole = { id: 1, name: 'user' };

      vi.mocked(db.user.findFirst).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword);
      vi.mocked(db.user.create).mockResolvedValue(newUser);
      vi.mocked(db.role.findUnique).mockResolvedValue(userRole);
      vi.mocked(db.userRole.create).mockResolvedValue({
        userId: 2,
        roleId: 1,
        assignedAt: new Date(),
      });
      vi.mocked(db.user.findUnique).mockResolvedValue({
        ...newUser,
        roles: [{ role: { id: 1, name: 'user', permissions: '["user:read"]' } }],
      });

      const result = await authService.register(registerData);

      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: registerData.email },
            { username: registerData.username },
          ],
        },
      });
      expect(db.user.create).toHaveBeenCalled();
      expect(result.username).toBe(registerData.username);
    });

    it('should throw error for duplicate email', async () => {
      const registerData = {
        username: 'newuser',
        email: 'existing@example.com',
        password: 'password123',
      };

      vi.mocked(db.user.findFirst).mockResolvedValue({
        ...mockUser,
        email: registerData.email,
      });

      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
    });

    it('should throw error for duplicate username', async () => {
      const registerData = {
        username: 'existinguser',
        email: 'new@example.com',
        password: 'password123',
      };

      vi.mocked(db.user.findFirst).mockResolvedValue({
        ...mockUser,
        username: registerData.username,
      });

      await expect(authService.register(registerData)).rejects.toThrow(ConflictError);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 86400,
      };

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(db.user.update).mockResolvedValue(mockUser);
      vi.mocked(db.session.create).mockResolvedValue({
        id: 'session_id',
        userId: 1,
        token: tokens.refreshToken,
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      vi.mocked(jwt.sign)
        .mockReturnValueOnce(tokens.accessToken)
        .mockReturnValueOnce(tokens.refreshToken);

      const result = await authService.login(email, password);

      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { email },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(password, mockUser.passwordHash);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.tokens).toEqual(tokens);
    });

    it('should throw error for non-existent user', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      await expect(authService.login(email, password)).rejects.toThrow(AuthenticationError);
    });

    it('should throw error for inactive user', async () => {
      const email = 'test@example.com';
      const password = 'password123';

      vi.mocked(db.user.findUnique).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(authService.login(email, password)).rejects.toThrow(AuthenticationError);
    });

    it('should throw error for invalid password', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      await expect(authService.login(email, password)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'valid_refresh_token';
      const decoded = { userId: 1, type: 'refresh' };
      const session = {
        id: 'session_id',
        userId: 1,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 86400000),
        user: mockUser,
      };
      const newTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresIn: 86400,
      };

      vi.mocked(jwt.verify).mockReturnValue(decoded);
      vi.mocked(db.session.findUnique).mockResolvedValue(session);
      vi.mocked(db.session.update).mockResolvedValue(session);
      vi.mocked(jwt.sign)
        .mockReturnValueOnce(newTokens.accessToken)
        .mockReturnValueOnce(newTokens.refreshToken);

      const result = await authService.refreshToken(refreshToken);

      expect(jwt.verify).toHaveBeenCalledWith(refreshToken, config.JWT_SECRET);
      expect(result).toEqual(newTokens);
    });

    it('should throw error for expired session', async () => {
      const refreshToken = 'expired_refresh_token';
      const decoded = { userId: 1, type: 'refresh' };
      const session = {
        id: 'session_id',
        userId: 1,
        token: refreshToken,
        expiresAt: new Date(Date.now() - 86400000), // Expired
        user: mockUser,
      };

      vi.mocked(jwt.verify).mockReturnValue(decoded);
      vi.mocked(db.session.findUnique).mockResolvedValue(session);
      vi.mocked(db.session.delete).mockResolvedValue(session);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const refreshToken = 'valid_refresh_token';

      vi.mocked(db.session.deleteMany).mockResolvedValue({ count: 1 });

      await authService.logout(refreshToken);

      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { token: refreshToken },
      });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userId = 1;
      const currentPassword = 'oldpassword';
      const newPassword = 'newpassword123';
      const newPasswordHash = 'new_hashed_password';

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      vi.mocked(bcrypt.hash).mockResolvedValue(newPasswordHash);
      vi.mocked(db.user.update).mockResolvedValue({
        ...mockUser,
        passwordHash: newPasswordHash,
      });
      vi.mocked(db.session.deleteMany).mockResolvedValue({ count: 2 });

      await authService.changePassword(userId, currentPassword, newPassword);

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });
      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should throw error for non-existent user', async () => {
      const userId = 999;
      const currentPassword = 'oldpassword';
      const newPassword = 'newpassword123';

      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      await expect(authService.changePassword(userId, currentPassword, newPassword))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw error for incorrect current password', async () => {
      const userId = 1;
      const currentPassword = 'wrongpassword';
      const newPassword = 'newpassword123';

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);

      await expect(authService.changePassword(userId, currentPassword, newPassword))
        .rejects.toThrow(AuthenticationError);
    });
  });

  describe('getUserWithRoles', () => {
    it('should return user with roles', async () => {
      const userId = 1;

      vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);

      const result = await authService.getUserWithRoles(userId);

      expect(result).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        fullName: mockUser.fullName,
        isActive: mockUser.isActive,
        lastLoginAt: mockUser.lastLoginAt,
        createdAt: mockUser.createdAt,
        roles: [
          {
            id: 1,
            name: 'user',
            permissions: ['user:read', 'repo:read'],
          },
        ],
      });
    });

    it('should return null for non-existent user', async () => {
      const userId = 999;

      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const result = await authService.getUserWithRoles(userId);

      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      vi.mocked(db.session.deleteMany).mockResolvedValue({ count: 5 });

      await authService.cleanupExpiredSessions();

      expect(db.session.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });
});