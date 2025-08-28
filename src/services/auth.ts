import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db';
import { config, getJwtConfig } from '../lib/config';
import { logger } from '../lib/logger';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  assertFound,
} from '../lib/errors';

// Types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserWithRoles {
  id: number;
  username: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: Array<{
    id: number;
    name: string;
    permissions: string[];
  }>;
}

export interface LoginResult {
  user: UserWithRoles;
  tokens: AuthTokens;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

// Configuration
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000; // 1 hour

class AuthService {
  private jwtConfig = getJwtConfig();

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, SALT_ROUNDS);
    } catch (error) {
      logger.error({ error }, 'Failed to hash password');
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error({ error }, 'Failed to verify password');
      return false;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  generateTokens(userId: number): AuthTokens {
    const payload = { userId, type: 'access' };
    const refreshPayload = { userId, type: 'refresh' };

    const accessToken = jwt.sign(payload, this.jwtConfig.secret, {
      expiresIn: this.jwtConfig.expiresIn,
      issuer: 'daily-dev-digest',
      subject: userId.toString(),
    });

    const refreshToken = jwt.sign(refreshPayload, this.jwtConfig.secret, {
      expiresIn: this.jwtConfig.refreshExpiresIn,
      issuer: 'daily-dev-digest',
      subject: userId.toString(),
    });

    // Calculate expiration time in seconds
    const expiresIn = this.parseJwtExpiry(this.jwtConfig.expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify and decode JWT token
   */
  verifyToken(token: string, type: 'access' | 'refresh' = 'access'): { userId: number } {
    try {
      const decoded = jwt.verify(token, this.jwtConfig.secret) as any;
      
      if (decoded.type !== type) {
        throw new AuthenticationError('Invalid token type');
      }

      return { userId: decoded.userId };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Get user with roles by ID
   */
  async getUserWithRoles(userId: number): Promise<UserWithRoles | null> {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        roles: user.roles.map(userRole => ({
          id: userRole.role.id,
          name: userRole.role.name,
          permissions: JSON.parse(userRole.role.permissions),
        })),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user with roles');
      throw error;
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<UserWithRoles> {
    try {
      // Check if user already exists
      const existingUser = await db.user.findFirst({
        where: {
          OR: [
            { email: data.email },
            { username: data.username },
          ],
        },
      });

      if (existingUser) {
        if (existingUser.email === data.email) {
          throw new ConflictError('Email already registered');
        } else {
          throw new ConflictError('Username already taken');
        }
      }

      // Hash password
      const passwordHash = await this.hashPassword(data.password);

      // Create user
      const user = await db.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          fullName: data.fullName || null,
        },
      });

      // Assign default "user" role
      const userRole = await db.role.findUnique({
        where: { name: 'user' },
      });

      if (userRole) {
        await db.userRole.create({
          data: {
            userId: user.id,
            roleId: userRole.id,
          },
        });
      }

      logger.info({ userId: user.id, username: user.username }, 'User registered successfully');

      // Return user with roles
      const userWithRoles = await this.getUserWithRoles(user.id);
      return assertFound(userWithRoles, 'User');
    } catch (error) {
      logger.error({ error, email: data.email }, 'User registration failed');
      throw error;
    }
  }

  /**
   * Authenticate user and return tokens
   */
  async login(email: string, password: string, rememberMe: boolean = false): Promise<LoginResult> {
    try {
      // Find user
      const user = await db.user.findUnique({
        where: { email },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      if (!user.isActive) {
        throw new AuthenticationError('Account is disabled');
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Generate tokens
      const tokens = this.generateTokens(user.id);

      // Update last login
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Create session
      await this.createSession(user.id, tokens.refreshToken, rememberMe);

      const userWithRoles: UserWithRoles = {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        lastLoginAt: new Date(),
        createdAt: user.createdAt,
        roles: user.roles.map(userRole => ({
          id: userRole.role.id,
          name: userRole.role.name,
          permissions: JSON.parse(userRole.role.permissions),
        })),
      };

      logger.info({ userId: user.id, username: user.username }, 'User logged in successfully');

      return {
        user: userWithRoles,
        tokens,
      };
    } catch (error) {
      logger.error({ error, email }, 'Login failed');
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const { userId } = this.verifyToken(refreshToken, 'refresh');

      // Check if session exists
      const session = await db.session.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!session || !session.user.isActive) {
        throw new AuthenticationError('Invalid refresh token');
      }

      if (session.expiresAt < new Date()) {
        // Clean up expired session
        await db.session.delete({ where: { id: session.id } });
        throw new AuthenticationError('Refresh token expired');
      }

      // Generate new tokens
      const tokens = this.generateTokens(userId);

      // Update session with new refresh token
      await db.session.update({
        where: { id: session.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + this.parseJwtExpiry(this.jwtConfig.refreshExpiresIn) * 1000),
        },
      });

      logger.info({ userId }, 'Token refreshed successfully');

      return tokens;
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      throw error;
    }
  }

  /**
   * Logout user by invalidating session
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      await db.session.deleteMany({
        where: { token: refreshToken },
      });

      logger.info('User logged out successfully');
    } catch (error) {
      logger.error({ error }, 'Logout failed');
      throw error;
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await db.user.findUnique({
        where: { email },
      });

      if (!user || !user.isActive) {
        // Don't reveal if user exists
        logger.warn({ email }, 'Password reset requested for non-existent or inactive user');
        return;
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Store reset token (you might want to create a separate table for this)
      // For now, we'll use a simple approach with the user table
      // In production, consider adding a password_reset_tokens table

      logger.info({ userId: user.id, email }, 'Password reset requested');

      // TODO: Send email with reset token
      // await emailService.sendPasswordReset(user.email, resetToken);
    } catch (error) {
      logger.error({ error, email }, 'Password reset request failed');
      throw error;
    }
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(data: ResetPasswordData): Promise<void> {
    try {
      // TODO: Implement token verification and password reset
      // This would involve checking the reset token and updating the password
      
      const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');
      
      // Find user with valid reset token
      // This is a simplified implementation
      
      throw new Error('Password reset not fully implemented');
    } catch (error) {
      logger.error({ error }, 'Password reset failed');
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password
      await db.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Invalidate all sessions for security
      await db.session.deleteMany({
        where: { userId },
      });

      logger.info({ userId }, 'Password changed successfully');
    } catch (error) {
      logger.error({ error, userId }, 'Password change failed');
      throw error;
    }
  }

  /**
   * Create user session
   */
  private async createSession(userId: number, refreshToken: string, rememberMe: boolean): Promise<void> {
    const expiresIn = rememberMe 
      ? this.parseJwtExpiry(this.jwtConfig.refreshExpiresIn)
      : this.parseJwtExpiry(this.jwtConfig.expiresIn);

    await db.session.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
  }

  /**
   * Parse JWT expiry string to seconds
   */
  private parseJwtExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd]?)$/);
    if (!match) {
      throw new Error(`Invalid JWT expiry format: ${expiry}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] || 's';

    const multipliers = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * multipliers[unit as keyof typeof multipliers];
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const result = await db.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      logger.info({ deletedSessions: result.count }, 'Cleaned up expired sessions');
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired sessions');
    }
  }

  /**
   * Validate user session
   */
  async validateSession(sessionId: string): Promise<UserWithRoles | null> {
    try {
      const session = await db.session.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        if (session) {
          await db.session.delete({ where: { id: sessionId } });
        }
        return null;
      }

      return await this.getUserWithRoles(session.userId);
    } catch (error) {
      logger.error({ error, sessionId }, 'Session validation failed');
      return null;
    }
  }
}

export const authService = new AuthService();