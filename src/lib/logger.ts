import pino, { Logger as PinoLogger } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
import { getLogConfig, isProduction } from './config';

// Context for request correlation
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

// Base logger configuration
const logConfig = getLogConfig();

const baseConfig = {
  level: logConfig.level,
  ...(logConfig.pretty && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        singleLine: false,
      },
    },
  }),
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
    log: (object: any) => {
      const context = requestContext.getStore();
      if (context?.requestId) {
        object.requestId = context.requestId;
      }
      return object;
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers?.host,
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.headers?.['content-type'],
        'content-length': res.headers?.['content-length'],
      },
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create base logger
const baseLogger = pino(baseConfig);

// Logger interface
export interface Logger extends PinoLogger {
  withContext: (context: Record<string, any>) => Logger;
  withRequestId: (requestId: string) => Logger;
}

// Enhanced logger with additional methods
export const createLogger = (context?: Record<string, any>): Logger => {
  const logger = context ? baseLogger.child(context) : baseLogger;
  
  return Object.assign(logger, {
    withContext: (newContext: Record<string, any>) => {
      return createLogger({ ...context, ...newContext });
    },
    withRequestId: (requestId: string) => {
      return createLogger({ ...context, requestId });
    },
  }) as Logger;
};

// Default logger instance
export const logger = createLogger();

// Specialized loggers for different components
export const dbLogger = createLogger({ component: 'database' });
export const authLogger = createLogger({ component: 'auth' });
export const apiLogger = createLogger({ component: 'api' });
export const jobLogger = createLogger({ component: 'jobs' });
export const cacheLogger = createLogger({ component: 'cache' });

// Helper functions for common logging patterns
export const logRequest = (req: any, res: any, responseTime: number) => {
  const level = res.statusCode >= 400 ? 'warn' : 'info';
  apiLogger[level]({
    req,
    res,
    responseTime,
  }, 'Request completed');
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error({ err: error, ...context }, 'Error occurred');
};

export const logUserAction = (userId: string, action: string, details?: Record<string, any>) => {
  logger.info({
    userId,
    action,
    ...details,
  }, 'User action performed');
};

export const logJobStart = (jobId: string, jobType: string, payload?: any) => {
  jobLogger.info({
    jobId,
    jobType,
    payload: isProduction() ? undefined : payload,
  }, 'Job started');
};

export const logJobComplete = (jobId: string, jobType: string, duration: number, result?: any) => {
  jobLogger.info({
    jobId,
    jobType,
    duration,
    result: isProduction() ? undefined : result,
  }, 'Job completed');
};

export const logJobError = (jobId: string, jobType: string, error: Error, duration?: number) => {
  jobLogger.error({
    jobId,
    jobType,
    duration,
    err: error,
  }, 'Job failed');
};

export const logDatabaseQuery = (query: string, params?: any[], duration?: number) => {
  if (!isProduction()) {
    dbLogger.debug({
      query,
      params,
      duration,
    }, 'Database query executed');
  }
};

export const logCacheHit = (key: string, operation: 'get' | 'set' | 'del') => {
  cacheLogger.debug({ key, operation }, 'Cache operation');
};

export const logAuthEvent = (event: string, userId?: string, details?: Record<string, any>) => {
  authLogger.info({
    event,
    userId,
    ...details,
  }, 'Authentication event');
};

// Performance logging
export const createPerformanceLogger = (operation: string) => {
  const start = Date.now();
  
  return {
    end: (context?: Record<string, any>) => {
      const duration = Date.now() - start;
      logger.info({
        operation,
        duration,
        ...context,
      }, 'Operation completed');
      return duration;
    },
    error: (error: Error, context?: Record<string, any>) => {
      const duration = Date.now() - start;
      logger.error({
        operation,
        duration,
        err: error,
        ...context,
      }, 'Operation failed');
      return duration;
    },
  };
};

// Request ID middleware helper
export const withRequestId = <T>(requestId: string, fn: () => T): T => {
  return requestContext.run({ requestId }, fn);
};