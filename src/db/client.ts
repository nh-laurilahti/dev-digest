import { PrismaClient, Prisma } from './generated';
import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  DATABASE_URL: z.string().default('file:./devdigest.db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

// Database client configuration based on environment
const getDatabaseConfig = (): Prisma.PrismaClientOptions => {
  const baseConfig: Prisma.PrismaClientOptions = {
    datasourceUrl: env.DATABASE_URL,
  };

  if (env.NODE_ENV === 'development') {
    return {
      ...baseConfig,
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        { emit: 'stdout', level: 'info' },
      ],
      errorFormat: 'pretty',
    };
  }

  if (env.NODE_ENV === 'test') {
    return {
      ...baseConfig,
      log: [
        { emit: 'event', level: 'error' },
      ],
    };
  }

  // Production configuration
  return {
    ...baseConfig,
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  };
};

// Create database client instance
const prisma = new PrismaClient(getDatabaseConfig());

// Enhanced logging for development (query logging disabled)
if (env.NODE_ENV === 'development') {
  prisma.$on('error', (e) => {
    console.error(`[${new Date().toISOString()}] Database Error:`, e);
  });

  prisma.$on('warn', (e) => {
    console.warn(`[${new Date().toISOString()}] Database Warning:`, e);
  });
}

// Error logging for all environments
prisma.$on('error', (e) => {
  console.error('[Database Error]:', e);
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('Shutting down database connection...');
  await prisma.$disconnect();
  console.log('Database connection closed.');
};

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

// Database health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// Database connection retry logic
export const connectWithRetry = async (maxRetries = 5, retryDelay = 1000): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      console.log('Database connected successfully');
      return true;
    } catch (error) {
      console.error(`Database connection attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('Max database connection retries reached');
        return false;
      }
      
      console.log(`Retrying in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 2; // Exponential backoff
    }
  }
  return false;
};

// Transaction helper with retry logic
export const executeTransaction = async <T>(
  fn: (prisma: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if error is retryable (e.g., deadlock, timeout)
      const retryableErrors = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'timeout'];
      const isRetryable = retryableErrors.some(code => 
        error instanceof Error && error.message.includes(code)
      );
      
      if (!isRetryable) {
        throw error;
      }
      
      console.warn(`Transaction attempt ${attempt} failed, retrying...`, error);
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  throw new Error('Transaction failed after maximum retries');
};

// Query performance monitoring
export const withQueryMetrics = async <T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  const startTime = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    if (env.NODE_ENV === 'development' && duration > 1000) {
      console.warn(`[Slow Query] ${queryName} took ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Query Error] ${queryName} failed after ${duration}ms:`, error);
    throw error;
  }
};

// Export the client instance and utilities
export { prisma };
export default prisma;

// Export types for convenience
export type {
  User,
  Role,
  UserRole,
  Repo,
  Digest,
  Job,
  Setting,
  Notification,
  UserPreference,
  ApiKey,
  Session,
  WebhookConfig,
  WebhookDelivery,
} from './generated';

// Commonly used Prisma types
export type { Prisma } from './generated';
export type TransactionClient = Prisma.TransactionClient;
export type DatabaseClient = typeof prisma;