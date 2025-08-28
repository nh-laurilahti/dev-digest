# Job Processing System Architecture

## Overview

The job processing system is a comprehensive, scalable background job processing solution designed to handle digest generation and other asynchronous tasks reliably. It provides robust error handling, retry mechanisms, job scheduling, monitoring, and worker pool management.

## System Components

### 1. Job Queue (`job-queue.ts`)
- **Purpose**: In-memory job queue with database persistence backup
- **Features**:
  - Priority-based job queuing
  - Job scheduling and dependency management
  - Retry logic with exponential backoff
  - Job status tracking and persistence
  - Metrics collection and cleanup

### 2. Job Processor (`job-processor.ts`) 
- **Purpose**: Main job processing engine
- **Features**:
  - Concurrent job processing with configurable limits
  - Job handler registration system
  - Error handling and recovery
  - Job timeout management
  - Graceful shutdown support

### 3. Job Handlers (`jobs/`)
- **DigestJobHandler**: Generates repository digests from GitHub data
- **NotificationJobHandler**: Sends email, Slack, and webhook notifications
- **CleanupJobHandler**: Performs database maintenance and cleanup
- **HealthCheckJobHandler**: System monitoring and health checks

### 4. Job Scheduler (`scheduler.ts`)
- **Purpose**: Cron-like job scheduling system
- **Features**:
  - Cron expression parsing and execution
  - Timezone-aware scheduling
  - Recurring job management
  - Schedule conflict resolution
  - Manual schedule triggering

### 5. Job Monitor (`job-monitor.ts`)
- **Purpose**: Real-time monitoring and alerting
- **Features**:
  - Performance metrics collection
  - Health status monitoring
  - Alert rule configuration
  - Failed job analysis
  - Historical data tracking

### 6. Worker Manager (`workers.ts`)
- **Purpose**: Worker pool management and load balancing
- **Features**:
  - Dynamic worker scaling
  - Load balancing strategies
  - Worker health monitoring
  - Graceful worker shutdown
  - Resource management per worker

### 7. Main Job Service (`index.ts`)
- **Purpose**: Orchestrates all components
- **Features**:
  - Centralized service management
  - Component initialization and shutdown
  - Event coordination
  - Configuration management

## Job Types

### Digest Generation
- Repository data fetching from GitHub API
- PR analysis and summary generation
- Digest creation and storage
- User notification scheduling

### Notifications
- Email notifications via SMTP
- Slack messages via API
- Webhook deliveries
- Template-based messaging

### System Maintenance
- Database cleanup and optimization
- Old data removal
- Health monitoring
- Performance analysis

## API Endpoints

### Job Management
- `POST /api/jobs` - Create new job
- `GET /api/jobs` - List jobs with filtering
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/cancel` - Cancel job
- `POST /api/jobs/:id/retry` - Retry failed job

### Monitoring
- `GET /api/jobs/metrics` - Get system metrics
- `GET /api/jobs/performance` - Get performance stats
- `GET /api/jobs/workers` - Get worker status

### Scheduling
- `GET /api/jobs/schedules` - List schedules
- `POST /api/jobs/schedules` - Create schedule
- `POST /api/jobs/schedules/:id/trigger` - Trigger schedule

## Configuration

### Job Queue Configuration
```typescript
{
  maxConcurrentJobs: 50,
  retryDelay: 2000,
  maxRetryDelay: 300000, // 5 minutes
  retryBackoffFactor: 2,
  defaultMaxRetries: 3,
  jobTimeout: 600000, // 10 minutes
  cleanupInterval: 300000, // 5 minutes
  persistenceInterval: 10000, // 10 seconds
  enableMetrics: true
}
```

### Worker Configuration
```typescript
{
  id: 'worker_id',
  maxJobs: 5,
  supportedJobTypes: [JobType.DIGEST_GENERATION],
  enabled: true,
  healthCheckInterval: 30000,
  gracefulShutdownTimeout: 30000
}
```

## Database Schema

The job system uses the existing Prisma schema with the following key models:

### Job Model
```prisma
model Job {
  id          String    @id @default(cuid())
  type        String    // Job type
  status      String    // Job status
  progress    Int       @default(0)
  paramsJson  String    // JSON parameters
  error       String?   // Error message if failed
  startedAt   DateTime?
  finishedAt  DateTime?
  createdAt   DateTime  @default(now())
  createdById Int
  digestId    Int?      // Optional link to digest
}
```

## Event System

The job system emits events for monitoring and integration:

### Job Events
- `job.created` - New job created
- `job.started` - Job processing started
- `job.progress_updated` - Job progress updated
- `job.completed` - Job completed successfully
- `job.failed` - Job failed
- `job.cancelled` - Job cancelled
- `job.retrying` - Job being retried

### System Events
- `worker_added` - New worker added to pool
- `worker_removed` - Worker removed from pool
- `worker_health_changed` - Worker health status changed
- `alert_triggered` - System alert triggered
- `schedule_executed` - Scheduled job executed

## Monitoring and Alerting

### Default Alert Rules
1. **High Queue Length**: Queue > 500 jobs
2. **High Failure Rate**: >20% job failures
3. **Stuck Jobs**: Jobs running >30 minutes
4. **Worker Down**: <2 healthy workers

### Health Checks
- Database connectivity
- Memory usage monitoring
- Queue health status
- Worker pool status
- External API availability

## Scaling and Performance

### Auto-scaling
- Automatic worker pool scaling based on load
- Configurable scaling thresholds
- Maximum worker limits

### Performance Optimizations
- Job batching for bulk operations
- Connection pooling for database operations
- Efficient job querying with indexes
- Background cleanup processes

## Deployment and Operations

### Initialization
```typescript
import { initializeJobService } from './services/startup';
await initializeJobService();
```

### Graceful Shutdown
```typescript
import { shutdownJobService } from './services/startup';
await shutdownJobService();
```

### Monitoring
- Real-time metrics via `/api/jobs/metrics`
- Performance statistics via `/api/jobs/performance`
- Worker status via `/api/jobs/workers`
- Health checks via `/api/health`

## Error Handling

### Retry Strategy
- Exponential backoff with jitter
- Configurable max retry attempts
- Different retry strategies per job type
- Dead letter queue for permanently failed jobs

### Failure Recovery
- Automatic job cleanup on startup
- Worker failure detection and replacement
- Database transaction rollback on failures
- Comprehensive error logging

## Security Considerations

### Authentication
- API key or JWT token authentication
- Role-based access control for job management
- Audit logging for job operations

### Data Protection
- Sensitive job parameters encryption
- Secure webhook deliveries
- Rate limiting for job creation
- Input validation and sanitization

## Future Enhancements

### Planned Features
1. Web UI dashboard for job monitoring
2. Job result caching and persistence
3. Advanced job dependencies and workflows
4. Integration with external job queues (Redis, RabbitMQ)
5. Multi-tenant job isolation
6. Advanced analytics and reporting
7. Job template system
8. Batch job processing optimization

### Integration Points
- GitHub API for repository data
- Email services (SMTP, SendGrid, etc.)
- Slack API for notifications
- Webhook endpoints for external integrations
- Database for job persistence
- File storage for job artifacts

This job processing system provides a solid foundation for reliable background task processing while maintaining flexibility for future enhancements and scaling needs.