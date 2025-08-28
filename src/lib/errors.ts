import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger, logError } from './logger';
import { isProduction } from './config';

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Base application error class
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    code?: string,
    context?: Record<string, any>
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.context = context;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.code && { code: this.code }),
      ...(this.context && { context: this.context }),
      ...((!isProduction() && this.stack) && { stack: this.stack }),
    };
  }
}

// Specific error classes
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', context?: Record<string, any>) {
    super(message, HTTP_STATUS.BAD_REQUEST, true, 'VALIDATION_ERROR', context);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, HTTP_STATUS.UNAUTHORIZED, true, 'AUTHENTICATION_ERROR', context);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: Record<string, any>) {
    super(message, HTTP_STATUS.FORBIDDEN, true, 'AUTHORIZATION_ERROR', context);
  }
}

// Backward-compatible aliases
export class UnauthorizedError extends AuthenticationError {}
export class ForbiddenError extends AuthorizationError {}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', context?: Record<string, any>) {
    super(`${resource} not found`, HTTP_STATUS.NOT_FOUND, true, 'NOT_FOUND_ERROR', context);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', context?: Record<string, any>) {
    super(message, HTTP_STATUS.CONFLICT, true, 'CONFLICT_ERROR', context);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', context?: Record<string, any>) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, true, 'RATE_LIMIT_ERROR', context);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', context?: Record<string, any>) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, true, 'DATABASE_ERROR', context);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string, context?: Record<string, any>) {
    super(
      message || `External service error: ${service}`,
      HTTP_STATUS.BAD_GATEWAY,
      true,
      'EXTERNAL_SERVICE_ERROR',
      { service, ...context }
    );
  }
}

export class JobError extends AppError {
  constructor(jobType: string, message?: string, context?: Record<string, any>) {
    super(
      message || `Job failed: ${jobType}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      true,
      'JOB_ERROR',
      { jobType, ...context }
    );
  }
}

// Error response interface
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
  };
  timestamp: string;
}

// Format error response
export const formatErrorResponse = (
  error: Error,
  requestId?: string
): ErrorResponse => {
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  if (error instanceof AppError) {
    code = error.code || error.name;
    message = error.message;
    if (!isProduction() && error.context) {
      details = error.context;
    }
  } else if (error instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
  }

  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(requestId && { requestId }),
    },
    timestamp: new Date().toISOString(),
  };
};

// Convert various error types to AppError
export const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationError('Validation failed', { zodErrors: error.errors });
  }

  if (error instanceof Error) {
    // Check for specific database errors
    if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
      return new ConflictError('Resource already exists', { originalError: error.message });
    }

    if (error.message.includes('foreign key constraint')) {
      return new ValidationError('Invalid reference', { originalError: error.message });
    }

    if (error.message.includes('not found')) {
      return new NotFoundError('Resource', { originalError: error.message });
    }

    // Generic error conversion
    return new AppError(
      isProduction() ? 'An unexpected error occurred' : error.message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      false,
      'UNKNOWN_ERROR',
      { originalError: error.message }
    );
  }

  // Handle non-Error objects
  return new AppError(
    'An unexpected error occurred',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    false,
    'UNKNOWN_ERROR',
    { originalError: String(error) }
  );
};

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const normalizedError = normalizeError(error);
  const requestId = req.headers['x-request-id'] as string;

  // Log the error
  logError(normalizedError, {
    requestId,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  // Don't send error response if headers already sent
  if (res.headersSent) {
    return next(error);
  }

  // Send error response
  const errorResponse = formatErrorResponse(normalizedError, requestId);
  res.status(normalizedError.statusCode).json(errorResponse);
};

// Async error wrapper for route handlers
export const asyncHandler = <T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) => {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new NotFoundError('Endpoint', { 
    method: req.method, 
    path: req.path 
  });
  next(error);
};

// Process error handlers
export const handleUncaughtException = (error: Error): void => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
};

export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.fatal({ err: reason, promise }, 'Unhandled promise rejection');
  process.exit(1);
};

// Setup process error handlers
export const setupProcessErrorHandlers = (): void => {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
};

// Error assertion helpers
export const assert = (condition: boolean, message: string, ErrorClass = AppError): void => {
  if (!condition) {
    throw new ErrorClass(message);
  }
};

export const assertFound = <T>(value: T | null | undefined, resource: string = 'Resource'): T => {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource);
  }
  return value;
};

export const assertAuthorized = (condition: boolean, message?: string): void => {
  if (!condition) {
    throw new AuthorizationError(message);
  }
};

export const assertAuthenticated = (condition: boolean, message?: string): void => {
  if (!condition) {
    throw new AuthenticationError(message);
  }
};