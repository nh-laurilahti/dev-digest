import { z } from 'zod';
import { loadEnvFile } from './env-loader';

// Environment validation schema
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server configuration
  PORT: z.string().transform(Number).pipe(z.number().int().min(1000).max(65535)).default('3000'),
  HOST: z.string().default('localhost'),
  
  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),
  DATABASE_MAX_CONNECTIONS: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
  
  // Redis
  REDIS_URL: z.string().url('Invalid Redis URL').optional(),
  REDIS_PASSWORD: z.string().optional(),
  
  // JWT Authentication
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // GitHub Integration
  GITHUB_TOKEN: z.string().min(1, 'GitHub token is required'),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  
  // API Configuration
  API_RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().int().min(60000)).default('900000'), // 15 minutes
  API_RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().int().min(1)).default('100'),
  
  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  CORS_CREDENTIALS: z.string().transform(val => val.toLowerCase() === 'true').default('true'),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.string().transform(val => val.toLowerCase() === 'true').default('true'),
  
  // Email Configuration (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).pipe(z.number().int().min(1).max(65535)).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  
  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),
  
  // External API Keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // File Storage
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

// Parse and validate environment variables
function validateEnv() {
  // Force load .env file to ensure it takes precedence
  loadEnvFile();
  
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      
      console.error('❌ Environment validation failed:');
      errorMessages.forEach(msg => console.error(`  - ${msg}`));
      process.exit(1);
    }
    throw error;
  }
}

// Export validated configuration
export const config = validateEnv();

// Type for configuration object
export type Config = z.infer<typeof envSchema>;

// Helper functions
export const isProduction = () => config.NODE_ENV === 'production';
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isTest = () => config.NODE_ENV === 'test';

// Database configuration
export const getDatabaseConfig = () => ({
  url: config.DATABASE_URL,
  maxConnections: config.DATABASE_MAX_CONNECTIONS,
});

// Redis configuration
export const getRedisConfig = () => ({
  url: config.REDIS_URL,
  password: config.REDIS_PASSWORD,
});

// JWT configuration
export const getJwtConfig = () => ({
  secret: config.JWT_SECRET,
  expiresIn: config.JWT_EXPIRES_IN,
  refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
});

// CORS configuration
export const getCorsConfig = () => ({
  origin: config.CORS_ORIGIN,
  credentials: config.CORS_CREDENTIALS,
});

// Rate limiting configuration
export const getRateLimitConfig = () => ({
  windowMs: config.API_RATE_LIMIT_WINDOW_MS,
  max: config.API_RATE_LIMIT_MAX,
});

// Logging configuration
export const getLogConfig = () => ({
  level: config.LOG_LEVEL,
  pretty: config.LOG_PRETTY && isDevelopment(),
});

// SMTP configuration
export const getSmtpConfig = () => {
  if (!config.SMTP_HOST || !config.SMTP_PORT) {
    return null;
  }
  
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER && config.SMTP_PASSWORD ? {
      user: config.SMTP_USER,
      pass: config.SMTP_PASSWORD,
    } : undefined,
    from: config.SMTP_FROM,
  };
};