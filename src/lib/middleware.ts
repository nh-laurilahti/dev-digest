import { Request, Response, NextFunction } from 'express';
import * as cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { getCorsConfig, getRateLimitConfig, isProduction } from './config';
import { apiLogger, withRequestId } from './logger';
import { RateLimitError, ValidationError } from './errors';

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Run the rest of the request in the context of this request ID
  withRequestId(requestId, () => next());
};

// Request logging middleware
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string;

  // Log incoming request
  apiLogger.info({
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: {
      host: req.headers.host,
      'content-type': req.headers['content-type'],
    },
  }, 'Incoming request');

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = (...args: any[]) => {
    const responseTime = Date.now() - start;
    
    apiLogger.info({
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      contentLength: res.get('content-length'),
    }, 'Request completed');

    return originalEnd(...args);
  };

  next();
};

// CORS middleware configuration
export const corsMiddleware = cors({
  ...getCorsConfig(),
  optionsSuccessStatus: 200, // Support legacy browsers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-API-Key',
    'Accept',
    'Origin',
    'User-Agent',
  ],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining', 'X-Rate-Limit-Reset'],
});

// Security headers middleware
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable if causing issues with external resources
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting configuration
const rateLimitConfig = getRateLimitConfig();

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later',
    },
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const error = new RateLimitError('Rate limit exceeded');
    apiLogger.warn({
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
    }, 'Rate limit exceeded');
    
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  },
});

// Stricter rate limiter for authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Speed limiter - placeholder (express-slow-down not available)
export const speedLimiter = (req: Request, _res: Response, next: NextFunction): void => {
  // TODO: Implement speed limiting if needed
  next();
};

// Input sanitization middleware
export const sanitizeInput = [
  // Sanitize common fields
  body('email').optional().normalizeEmail().escape(),
  body('username').optional().trim().escape(),
  body('name').optional().trim().escape(),
  body('title').optional().trim().escape(),
  body('description').optional().trim(),
  body('content').optional().trim(),
  
  // Custom sanitization
  (req: Request, res: Response, next: NextFunction) => {
    // Remove null bytes from all string values
    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj.replace(/\0/g, '');
      }
      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            obj[key] = sanitizeObject(obj[key]);
          }
        }
      }
      return obj;
    };

    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    req.params = sanitizeObject(req.params);
    
    next();
  },
];

// Validation error handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));
    
    throw new ValidationError('Validation failed', { errors: validationErrors });
  }
  next();
};

// Content type validation middleware
export const validateContentType = (expectedType: string = 'application/json') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }

    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes(expectedType)) {
      throw new ValidationError(`Content-Type must be ${expectedType}`);
    }

    next();
  };
};

// Body size limiter
export const bodySizeLimit = (limit: string = '10mb') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const limitInMB = parseInt(limit);
      
      if (sizeInMB > limitInMB) {
        throw new ValidationError(`Request body too large. Maximum size is ${limit}`);
      }
    }
    next();
  };
};

// API key validation middleware
export const validateApiKey = (req: Request, _res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization;

  // Skip validation for certain endpoints
  if (req.path.includes('/health') || req.path.includes('/status')) {
    return next();
  }

  // Check for API key in header or Authorization header
  const providedKey = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!providedKey) {
    throw new ValidationError('API key is required');
  }

  // TODO: Implement actual API key validation against database
  // For now, we'll just check if it's provided
  next();
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        apiLogger.warn({
          requestId: req.headers['x-request-id'],
          method: req.method,
          url: req.url,
          timeout: timeoutMs,
        }, 'Request timeout');

        res.status(408).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
          },
          timestamp: new Date().toISOString(),
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    const originalEnd = res.end.bind(res);
    res.end = (...args: any[]) => {
      clearTimeout(timeout);
      return originalEnd(...args);
    };

    next();
  };
};

// Health check bypass middleware
export const healthCheckBypass = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/health' || req.path === '/status') {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    });
  }
  next();
};

// Development only middleware
export const developmentOnly = (_req: Request, res: Response, next: NextFunction): void => {
  if (isProduction()) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }
  next();
};

// Combine common middleware
export const commonMiddleware = [
  requestIdMiddleware,
  corsMiddleware,
  securityMiddleware,
  requestLoggingMiddleware,
  healthCheckBypass,
  validateContentType(),
  bodySizeLimit(),
  apiRateLimiter,
  speedLimiter,
  ...sanitizeInput,
  handleValidationErrors,
];