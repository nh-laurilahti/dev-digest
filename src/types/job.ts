/**
 * Job Processing System Types and Interfaces
 */

// Job Status Enumeration
export enum JobStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED', 
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PAUSED = 'PAUSED',
  RETRYING = 'RETRYING'
}

// Job Priority Levels
export enum JobPriority {
  LOW = 0,
  NORMAL = 10,
  HIGH = 20,
  CRITICAL = 30
}

// Job Types
export enum JobType {
  DIGEST_GENERATION = 'digest_generation',
  NOTIFICATION = 'notification',
  CLEANUP = 'cleanup',
  HEALTH_CHECK = 'health_check',
  WEBHOOK_DELIVERY = 'webhook_delivery',
  DATA_SYNC = 'data_sync',
  BACKUP = 'backup'
}

// Base Job Interface
export interface BaseJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  params: Record<string, any>;
  progress: number;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdById: number;
  digestId?: number;
  retryCount: number;
  maxRetries: number;
  scheduleTime?: Date;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

// Job Creation Parameters
export interface CreateJobOptions {
  type: JobType;
  params: Record<string, any>;
  priority?: JobPriority;
  scheduleTime?: Date;
  maxRetries?: number;
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  createdById: number;
  digestId?: number;
}

// Job Update Parameters
export interface UpdateJobOptions {
  status?: JobStatus;
  progress?: number;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  retryCount?: number;
  metadata?: Record<string, any>;
  digestId?: number;
}

// Job Query Filters
export interface JobQueryFilters {
  status?: JobStatus[];
  type?: JobType[];
  priority?: JobPriority[];
  createdById?: number;
  digestId?: number;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'scheduleTime';
  sortOrder?: 'asc' | 'desc';
}

// Job Result Interface
export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

// Job Handler Interface
export interface JobHandler {
  type: JobType;
  handle: (job: BaseJob) => Promise<JobResult>;
  validate?: (params: Record<string, any>) => boolean;
  estimateTime?: (params: any) => number; // seconds
}

// Job Queue Configuration
export interface JobQueueConfig {
  maxConcurrentJobs: number;
  retryDelay: number; // milliseconds
  maxRetryDelay: number; // milliseconds
  retryBackoffFactor: number;
  defaultMaxRetries: number;
  jobTimeout: number; // milliseconds
  cleanupInterval: number; // milliseconds
  persistenceInterval: number; // milliseconds
  enableMetrics: boolean;
}

// Worker Configuration
export interface WorkerConfig {
  id: string;
  maxJobs: number;
  supportedJobTypes: JobType[];
  enabled: boolean;
  healthCheckInterval: number;
  gracefulShutdownTimeout: number;
}

// Job Metrics
export interface JobMetrics {
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  successRate: number;
  queueLength: number;
  activeWorkers: number;
  lastUpdated: Date;
}

// Schedule Configuration
export interface ScheduleConfig {
  id: string;
  name: string;
  cron: string;
  jobType: JobType;
  jobParams: Record<string, any>;
  enabled: boolean;
  timezone?: string;
  maxConcurrentRuns?: number;
  createdById: number;
  nextRun?: Date;
  lastRun?: Date;
}

// Job Event Types
export enum JobEvent {
  CREATED = 'job.created',
  STARTED = 'job.started',
  PROGRESS_UPDATED = 'job.progress_updated',
  COMPLETED = 'job.completed',
  FAILED = 'job.failed',
  CANCELLED = 'job.cancelled',
  RETRYING = 'job.retrying',
  TIMEOUT = 'job.timeout'
}

// Job Event Data
export interface JobEventData {
  event: JobEvent;
  jobId: string;
  job: BaseJob;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Job Health Check Result
export interface JobHealthCheck {
  healthy: boolean;
  queueLength: number;
  activeJobs: number;
  failedJobs: number;
  oldestPendingJob?: Date;
  workerStatus: WorkerStatus[];
  lastProcessedJob?: Date;
  errors: string[];
  warnings: string[];
}

// Worker Status
export interface WorkerStatus {
  id: string;
  healthy: boolean;
  activeJobs: number;
  totalProcessed: number;
  lastActivity: Date;
  supportedJobTypes: JobType[];
  errors: string[];
  cpuUsage?: number;
  memoryUsage?: number;
}

// Specific Job Params Interfaces

export interface DigestGenerationJobParams {
  repoId: number;
  dateFrom: Date;
  dateTo: Date;
  includePRs: boolean;
  includeIssues: boolean;
  includeCommits: boolean;
  summaryType: 'concise' | 'detailed';
  summaryStyle?: 'concise' | 'frontend' | 'engaging-story' | 'executive' | 'technical' | 'custom';
  customPrompt?: string;
  notifyUsers?: number[];
}

export interface NotificationJobParams {
  type: 'email' | 'slack' | 'webhook';
  recipients: string[];
  subject?: string;
  message: string;
  template?: string;
  data?: Record<string, any>;
  digestId?: number;
}

export interface CleanupJobParams {
  targetTable: string;
  olderThan: Date;
  batchSize?: number;
  dryRun?: boolean;
}

export interface HealthCheckJobParams {
  checks: string[];
  alertOnFailure: boolean;
  alertRecipients?: string[];
}

export interface WebhookDeliveryJobParams {
  webhookConfigId: number;
  event: string;
  payload: Record<string, any>;
  retryCount?: number;
}

export interface DataSyncJobParams {
  source: string;
  destination: string;
  entityType: string;
  filters?: Record<string, any>;
  batchSize?: number;
}

export interface BackupJobParams {
  tables: string[];
  destination: string;
  compression: boolean;
  retention?: number; // days
}

// Export utility types
export type JobParams = 
  | DigestGenerationJobParams
  | NotificationJobParams
  | CleanupJobParams
  | HealthCheckJobParams
  | WebhookDeliveryJobParams
  | DataSyncJobParams
  | BackupJobParams
  | Record<string, any>;