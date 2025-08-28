// Main database exports
export { prisma, default as db } from './client';

// Database client and types
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
  Prisma,
  TransactionClient,
  DatabaseClient
} from './client';

// Database utilities
export * from './utils';

// Migration utilities
export { DatabaseMigrator, runMigrationCommand } from './migrate';

// Seed utilities
export { seed } from './seed';