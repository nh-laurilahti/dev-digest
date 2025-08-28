import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import crypto from 'crypto';
import { logger } from './logger';
import { config } from './config';
import { RateLimitError, AuthenticationError } from './errors';

// Rate limiter configurations
const rateLimiters = {
  // General API rate limiter
  api: new RateLimiterMemory({
    points: config.API_RATE_LIMIT_MAX, // Number of requests
    duration: Math.floor(config.API_RATE_LIMIT_WINDOW_MS / 1000), // Per duration in seconds
  }),

  // Authentication endpoints - stricter limits
  auth: new RateLimiterMemory({
    points: 5, // 5 attempts
    duration: 15 * 60, // per 15 minutes
    blockDuration: 15 * 60, // block for 15 minutes
  }),

  // Password reset - even stricter
  passwordReset: new RateLimiterMemory({
    points: 3, // 3 attempts
    duration: 60 * 60, // per hour
    blockDuration: 60 * 60, // block for 1 hour
  }),

  // Registration
  registration: new RateLimiterMemory({
    points: 3, // 3 registrations
    duration: 60 * 60, // per hour
    blockDuration: 60 * 60, // block for 1 hour
  }),

  // API key operations
  apiKey: new RateLimiterMemory({
    points: 10, // 10 operations
    duration: 60 * 60, // per hour
  }),
};

// Account lockout tracking
const loginAttempts = new Map<string, {
  attempts: number;
  firstAttempt: number;
  lockedUntil?: number;
}>();

// CSRF token storage (in production, use Redis or database)
const csrfTokens = new Map<string, {
  token: string;
  sessionId: string;
  expiresAt: number;
}>();

// Security configuration
const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  LOCKOUT_WINDOW: 15 * 60 * 1000, // 15 minutes window for attempts
  CSRF_TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Create rate limiting middleware
 */
export const createRateLimit = (limiterName: keyof typeof rateLimiters) => {
  const limiter = rateLimiters[limiterName];
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.ip || 'unknown';
      
      await limiter.consume(key);
      next();
    } catch (rateLimiterRes: any) {
      const remainingMs = rateLimiterRes?.msBeforeNext || 0;
      const remainingSec = Math.ceil(remainingMs / 1000);
      
      logger.warn({
        ip: req.ip,
        endpoint: req.path,
        remainingSec,
      }, 'Rate limit exceeded');

      res.set('Retry-After', String(remainingSec));
      
      throw new RateLimitError(`Rate limit exceeded. Try again in ${remainingSec} seconds.`);
    }
  };
};

/**
 * Account lockout middleware for login attempts
 */
export const accountLockout = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = req.body.email || req.body.username;
  if (!identifier) {
    return next();
  }

  const key = `login:${identifier}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (attempt) {
    // Check if still locked
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      const remainingSec = Math.ceil((attempt.lockedUntil - now) / 1000);
      
      logger.warn({
        identifier,
        ip: req.ip,
        remainingSec,
      }, 'Account temporarily locked');

      throw new AuthenticationError(`Account temporarily locked. Try again in ${remainingSec} seconds.`);
    }

    // Reset if lockout window has passed
    if (now - attempt.firstAttempt > SECURITY_CONFIG.LOCKOUT_WINDOW) {
      loginAttempts.delete(key);
    }
  }

  // Add middleware to track failed attempts
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    if (res.statusCode === 401 && req.route?.path?.includes('login')) {
      trackFailedLogin(identifier, req.ip);
    } else if (res.statusCode === 200 && req.route?.path?.includes('login')) {
      // Clear attempts on successful login
      loginAttempts.delete(key);
    }
    
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Track failed login attempts
 */
function trackFailedLogin(identifier: string, ip: string): void {
  const key = `login:${identifier}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt) {
    loginAttempts.set(key, {
      attempts: 1,
      firstAttempt: now,
    });
    return;
  }

  attempt.attempts++;

  if (attempt.attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    attempt.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
    
    logger.warn({
      identifier,
      ip,
      attempts: attempt.attempts,
      lockedUntil: new Date(attempt.lockedUntil).toISOString(),
    }, 'Account locked due to too many failed login attempts');
  }

  loginAttempts.set(key, attempt);
}

/**
 * Generate CSRF token
 */
export const generateCSRFToken = (sessionId: string): string => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SECURITY_CONFIG.CSRF_TOKEN_EXPIRY;
  
  csrfTokens.set(token, {
    token,
    sessionId,
    expiresAt,
  });

  return token;
};

/**
 * Validate CSRF token
 */
export const validateCSRFToken = (token: string, sessionId: string): boolean => {
  const stored = csrfTokens.get(token);
  
  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    csrfTokens.delete(token);
    return false;
  }

  if (stored.sessionId !== sessionId) {
    return false;
  }

  return true;
};

/**
 * CSRF protection middleware
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API key authentication
  if (req.headers.authorization?.startsWith('dd_') || req.headers['x-api-key']) {
    return next();
  }

  const token = req.headers['x-csrf-token'] as string || req.body._csrf;
  const sessionId = req.headers['x-session-id'] as string;

  if (!token) {
    throw new AuthenticationError('CSRF token required');
  }

  if (!sessionId) {
    throw new AuthenticationError('Session ID required');
  }

  if (!validateCSRFToken(token, sessionId)) {
    throw new AuthenticationError('Invalid CSRF token');
  }

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Force HTTPS (in production)
  if (config.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Adjust based on your needs
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
  ].join(', '));
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

/**
 * Password strength validator
 */
export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Password must be at least 8 characters long');

  if (password.length >= 12) score += 1;
  else if (password.length >= 8) feedback.push('Consider using a longer password (12+ characters)');

  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('Include special characters');

  // Common patterns to avoid
  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push('Avoid repeating characters');

  if (!/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/.test(password.toLowerCase())) {
    score += 1;
  } else {
    feedback.push('Avoid sequential characters');
  }

  // Common words check (simplified)
  const commonWords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome'];
  if (!commonWords.some(word => password.toLowerCase().includes(word))) {
    score += 1;
  } else {
    feedback.push('Avoid common words and patterns');
  }

  return {
    isValid: score >= 6,
    score,
    feedback: feedback.slice(0, 3), // Limit feedback to 3 items
  };
};

/**
 * Secure password hashing with timing attack protection
 */
export const secureCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
};

/**
 * Generate secure random token
 */
export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Hash token for storage
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Clean up expired security tokens
 */
export const cleanupExpiredTokens = (): void => {
  const now = Date.now();
  
  // Clean up CSRF tokens
  for (const [token, data] of csrfTokens.entries()) {
    if (now > data.expiresAt) {
      csrfTokens.delete(token);
    }
  }
  
  // Clean up login attempts
  for (const [key, attempt] of loginAttempts.entries()) {
    if (attempt.lockedUntil && now > attempt.lockedUntil) {
      loginAttempts.delete(key);
    } else if (now - attempt.firstAttempt > SECURITY_CONFIG.LOCKOUT_WINDOW) {
      loginAttempts.delete(key);
    }
  }
  
  logger.debug('Security tokens cleaned up');
};

/**
 * Start security cleanup scheduler
 */
export const startSecurityCleanup = (): void => {
  // Clean up every 15 minutes
  setInterval(cleanupExpiredTokens, 15 * 60 * 1000);
  logger.info('Security cleanup scheduler started');
};

/**
 * Middleware to add security context to requests
 */
export const addSecurityContext = (req: Request, res: Response, next: NextFunction): void => {
  // Add request ID for tracing
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = crypto.randomUUID();
  }
  
  // Add timestamp
  (req as any).securityContext = {
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };
  
  next();
};

// Export rate limiters for specific use
export const apiRateLimit = createRateLimit('api');
export const authRateLimit = createRateLimit('auth');
export const passwordResetRateLimit = createRateLimit('passwordReset');
export const registrationRateLimit = createRateLimit('registration');
export const apiKeyRateLimit = createRateLimit('apiKey');