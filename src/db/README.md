# Database Layer Documentation

This directory contains the complete database layer implementation for the Daily Dev Digest application using Prisma ORM.

## 📁 Structure

```
src/db/
├── schema.prisma       # Prisma schema definition
├── client.ts          # Database client configuration
├── utils.ts           # Database utilities and helpers
├── migrate.ts         # Migration commands and utilities
├── seed.ts            # Database seeding with initial data
├── index.ts           # Main exports
├── generated/         # Prisma generated client (auto-generated)
└── README.md          # This file
```

## 🗄️ Database Models

### Core Models

- **User**: Application users with authentication and authorization
- **Role**: User roles with permissions (admin, maintainer, user, viewer)
- **UserRole**: Many-to-many relationship between users and roles
- **ApiKey**: API keys for programmatic access
- **Session**: User sessions for web authentication

### Repository & Digest Models

- **Repo**: GitHub repositories being tracked
- **Digest**: Generated digest summaries for repositories
- **Job**: Background jobs for digest generation and processing

### Notification & Settings Models

- **Notification**: System notifications (email, Slack, web)
- **Setting**: Application configuration settings
- **UserPreference**: User-specific preferences and subscriptions

### Webhook Models

- **WebhookConfig**: Webhook configuration for external integrations
- **WebhookDelivery**: Webhook delivery logs and status

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Initialize Database

```bash
# Complete setup (recommended for first time)
bun run db:setup

# Or step by step:
bun run db:init      # Initialize database schema
bun run db:generate  # Generate Prisma client
bun run db:seed      # Seed with initial data
```

### 4. Start Development

```bash
bun run dev
```

## 📋 Available Commands

### Database Management

```bash
# Setup and initialization
bun run db:setup           # Complete setup (init + generate + seed)
bun run db:init            # Initialize database with current schema
bun run db:generate        # Generate Prisma client

# Migrations (for production)
bun run db:migrate:create  # Create a new migration
bun run db:migrate         # Apply pending migrations
bun run db:reset           # Reset database (dev only)

# Seeding and validation
bun run db:seed            # Seed database with initial data
bun run db:validate        # Validate database connection and schema
bun run db:status          # Show migration status

# Backup and restore (SQLite only)
bun run db:backup          # Create database backup
bun run db:restore         # Restore from backup

# Prisma utilities
bun run prisma:studio      # Open Prisma Studio GUI
bun run prisma:format      # Format Prisma schema
```

## 🔧 Database Configuration

### Environment Variables

Required:
- `DATABASE_URL`: Database connection string
- `NODE_ENV`: Environment (development, production, test)

SQLite (default):
```env
DATABASE_URL="file:./devdigest.db"
```

PostgreSQL (production):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/devdigest"
```

### Client Configuration

The database client is configured with environment-specific settings:

- **Development**: Detailed query logging, pretty error formatting
- **Test**: Minimal logging, isolated database
- **Production**: Error logging only, optimized performance

## 📊 Database Schema

### Key Relationships

```
User ←→ UserRole ←→ Role
User ←→ UserPreference
User ←→ ApiKey
User ←→ Session
User ←→ Digest (created_by)
User ←→ Job (created_by)
User ←→ Notification (recipient)

Repo ←→ Digest
Digest ←→ Job
Digest ←→ Notification

WebhookConfig ←→ WebhookDelivery
```

### Indexes

Performance-critical indexes are added for:
- User lookups (email, username)
- API key authentication
- Repository queries
- Digest filtering and sorting
- Job status queries
- Notification delivery

## 🛠️ Utilities

### Authentication Utilities

```typescript
import { hashPassword, verifyPassword, generateApiKey } from '@/db';

// Password hashing
const hash = await hashPassword('password123');
const isValid = await verifyPassword('password123', hash);

// API key generation
const apiKey = generateApiKey(); // Returns: ddd_ak_...
```

### User Management

```typescript
import { findUserByEmail, getUserPermissions, userHasPermission } from '@/db';

// Find user
const user = await findUserByEmail('user@example.com');

// Check permissions
const permissions = await getUserPermissions(userId);
const canManage = await userHasPermission(userId, 'manage_repos');
```

### Settings Management

```typescript
import { getSetting, setSetting, getMultipleSettings } from '@/db';

// Single setting
const digestDays = await getSetting('default_digest_days', 7);
await setSetting('enable_ai_summaries', true);

// Multiple settings
const settings = await getMultipleSettings(
  ['app_name', 'default_digest_days'],
  { app_name: 'Daily Dev Digest', default_digest_days: 7 }
);
```

### Job Management

```typescript
import { createJob, updateJobStatus, getJobsByStatus } from '@/db';

// Create job
const job = await createJob('digest', userId, { repo: 'owner/name' });

// Update status
await updateJobStatus(job.id, 'RUNNING', 50);
await updateJobStatus(job.id, 'COMPLETED', 100);

// Query jobs
const runningJobs = await getJobsByStatus('RUNNING');
const completedJobs = await getJobsByStatus(['COMPLETED', 'FAILED']);
```

## 🔒 Security Features

### Password Security
- Bcrypt hashing with 12 salt rounds
- Secure password verification

### API Key Security
- Cryptographically secure key generation
- Hashed storage (never store plain keys)
- Expiration support

### Session Management
- Secure session token generation
- Automatic cleanup of expired sessions

## 🧹 Maintenance

### Automated Cleanup

```typescript
import { cleanupExpiredSessions, cleanupOldJobs, cleanupOldNotifications } from '@/db';

// Clean expired sessions (run daily)
const expiredSessions = await cleanupExpiredSessions();

// Clean old completed jobs (run weekly)
const oldJobs = await cleanupOldJobs(30); // 30 days

// Clean old notifications (run weekly)
const oldNotifications = await cleanupOldNotifications(90); // 90 days
```

### Database Statistics

```typescript
import { getDatabaseStats } from '@/db';

const stats = await getDatabaseStats();
console.log(stats);
// {
//   users: { total: 10, active: 8 },
//   repos: { total: 5, active: 4 },
//   digests: { total: 150 },
//   jobs: { running: 2 },
//   notifications: { pending: 3 }
// }
```

## 🐛 Error Handling

### Connection Retry Logic
The client includes automatic retry logic for database connections with exponential backoff.

### Transaction Support
Transactions are wrapped with retry logic for handling SQLite busy/locked states:

```typescript
import { executeTransaction, prisma } from '@/db';

const result = await executeTransaction(async (tx) => {
  const user = await tx.user.create({ data: userData });
  await tx.userPreference.create({ data: { userId: user.id, ...preferences } });
  return user;
});
```

### Query Performance Monitoring
Development mode includes automatic slow query detection and logging.

## 📈 Performance Considerations

### Indexes
All performance-critical queries have appropriate indexes:
- Primary keys (auto-indexed)
- Foreign keys (auto-indexed)
- Unique constraints (email, username, api keys)
- Query filters (status, type, dates)

### Connection Management
- Automatic connection pooling
- Graceful shutdown handling
- Health check utilities

### Query Optimization
- Use select projections to limit data transfer
- Implement pagination for large result sets
- Use transactions for multi-operation consistency

## 🧪 Testing

### Test Database
Use a separate database for testing:

```env
# .env.test
DATABASE_URL="file:./test.db"
NODE_ENV="test"
```

### Test Utilities

```typescript
import { prisma } from '@/db';

// Clean database between tests
beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.repo.deleteMany();
  // ... clean other tables
});
```

## 🚀 Production Deployment

### PostgreSQL Migration

1. Update DATABASE_URL:
```env
DATABASE_URL="postgresql://user:password@host:5432/database"
```

2. Create and apply migrations:
```bash
bun run db:migrate:create initial
bun run db:migrate
```

3. Seed production data:
```bash
NODE_ENV=production bun run db:seed
```

### Performance Tuning

For PostgreSQL production:
- Configure connection pooling
- Set up read replicas for read-heavy workloads
- Monitor query performance
- Set up database backups

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Bun Documentation](https://bun.sh/docs)

## 🤝 Contributing

When modifying the database schema:

1. Update `schema.prisma`
2. Create migration: `bun run db:migrate:create your_change_name`
3. Update seed data if needed
4. Update this documentation
5. Test locally with `bun run db:reset && bun run db:setup`