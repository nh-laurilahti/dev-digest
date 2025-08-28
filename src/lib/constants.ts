// Application Constants and Enums

// Job Status Enum
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
}

// Job Priority Enum
export enum JobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

// Job Type Enum
export enum JobType {
  DIGEST_GENERATION = 'digest_generation',
  REPOSITORY_SYNC = 'repository_sync',
  WEBHOOK_PROCESSING = 'webhook_processing',
  EMAIL_SENDING = 'email_sending',
  CLEANUP = 'cleanup',
  USER_ONBOARDING = 'user_onboarding',
  ANALYTICS_AGGREGATION = 'analytics_aggregation',
}

// User Role Enum
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
  READONLY = 'readonly',
}

// User Status Enum
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  DELETED = 'deleted',
}

// Permission Enum
export enum Permission {
  // User permissions
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  
  // Repository permissions
  REPOSITORY_READ = 'repository:read',
  REPOSITORY_WRITE = 'repository:write',
  REPOSITORY_DELETE = 'repository:delete',
  
  // Digest permissions
  DIGEST_READ = 'digest:read',
  DIGEST_WRITE = 'digest:write',
  DIGEST_DELETE = 'digest:delete',
  DIGEST_GENERATE = 'digest:generate',
  
  // Job permissions
  JOB_READ = 'job:read',
  JOB_WRITE = 'job:write',
  JOB_DELETE = 'job:delete',
  JOB_EXECUTE = 'job:execute',
  
  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SYSTEM = 'admin:system',
  ADMIN_ANALYTICS = 'admin:analytics',
  
  // API permissions
  API_READ = 'api:read',
  API_WRITE = 'api:write',
  
  // Webhook permissions
  WEBHOOK_READ = 'webhook:read',
  WEBHOOK_WRITE = 'webhook:write',
}

// Repository Status Enum
export enum RepositoryStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SYNCING = 'syncing',
  ERROR = 'error',
  ARCHIVED = 'archived',
}

// Digest Schedule Enum
export enum DigestSchedule {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ON_DEMAND = 'on_demand',
}

// Digest Status Enum
export enum DigestStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Notification Type Enum
export enum NotificationType {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  DISCORD = 'discord',
}

// HTTP Status Codes (extending the ones from errors.ts)
export const HTTP_STATUS_CODES = {
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  
  // Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  
  // Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// API Error Codes
export const API_ERROR_CODES = {
  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_NOT_VERIFIED: 'ACCOUNT_NOT_VERIFIED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_IN_USE: 'RESOURCE_IN_USE',
  INVALID_RESOURCE_STATE: 'INVALID_RESOURCE_STATE',
  
  // External service errors
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  GITHUB_RATE_LIMIT: 'GITHUB_RATE_LIMIT',
  GITHUB_UNAUTHORIZED: 'GITHUB_UNAUTHORIZED',
  
  // Database errors
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',
  UNIQUE_CONSTRAINT_VIOLATION: 'UNIQUE_CONSTRAINT_VIOLATION',
  
  // Job errors
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_ALREADY_RUNNING: 'JOB_ALREADY_RUNNING',
  JOB_FAILED: 'JOB_FAILED',
  JOB_TIMEOUT: 'JOB_TIMEOUT',
  
  // File/Upload errors
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
} as const;

// Default Configuration Values
export const DEFAULT_CONFIG = {
  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
  
  // Rate Limiting
  DEFAULT_RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  DEFAULT_RATE_LIMIT_MAX: 100,
  AUTH_RATE_LIMIT_WINDOW: 15 * 60 * 1000,
  AUTH_RATE_LIMIT_MAX: 5,
  
  // File Upload
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  
  // JWT
  JWT_EXPIRES_IN: '24h',
  JWT_REFRESH_EXPIRES_IN: '7d',
  
  // Session
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  
  // Job Processing
  MAX_JOB_RETRIES: 3,
  JOB_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  JOB_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  
  // Repository Sync
  SYNC_INTERVAL: 60 * 60 * 1000, // 1 hour
  MAX_COMMITS_PER_SYNC: 100,
  
  // Digest Generation
  MAX_REPOSITORIES_PER_DIGEST: 50,
  DIGEST_CACHE_TTL: 60 * 60 * 1000, // 1 hour
  
  // Cache
  DEFAULT_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  
  // Monitoring
  HEALTH_CHECK_INTERVAL: 30 * 1000, // 30 seconds
  METRICS_COLLECTION_INTERVAL: 60 * 1000, // 1 minute
} as const;

// GitHub Constants
export const GITHUB = {
  API_BASE_URL: 'https://api.github.com',
  WEBHOOK_EVENTS: [
    'push',
    'pull_request',
    'issues',
    'issue_comment',
    'pull_request_review',
    'pull_request_review_comment',
    'create',
    'delete',
    'fork',
    'watch',
    'star',
    'release',
  ] as const,
  
  RATE_LIMITS: {
    CORE: 5000,
    SEARCH: 30,
    GRAPHQL: 5000,
  },
  
  FILE_EXTENSIONS: {
    JAVASCRIPT: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
    PYTHON: ['.py', '.pyx', '.pyi'],
    JAVA: ['.java'],
    GO: ['.go'],
    RUST: ['.rs'],
    C_CPP: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
    CSHARP: ['.cs'],
    PHP: ['.php'],
    RUBY: ['.rb'],
    SWIFT: ['.swift'],
    KOTLIN: ['.kt', '.kts'],
    SCALA: ['.scala'],
    R: ['.r', '.R'],
    JULIA: ['.jl'],
    MATLAB: ['.m'],
    SHELL: ['.sh', '.bash', '.zsh', '.fish'],
    DOCKERFILE: ['Dockerfile', 'dockerfile'],
    YAML: ['.yml', '.yaml'],
    JSON: ['.json'],
    XML: ['.xml'],
    MARKDOWN: ['.md', '.mdx'],
    SQL: ['.sql'],
  },
} as const;

// Email Templates
export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  VERIFICATION: 'verification',
  PASSWORD_RESET: 'password_reset',
  DIGEST_NOTIFICATION: 'digest_notification',
  JOB_FAILED: 'job_failed',
  ACCOUNT_SUSPENDED: 'account_suspended',
} as const;

// Cache Keys
export const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  USER_SESSION: (sessionId: string) => `session:${sessionId}`,
  REPOSITORY: (id: string) => `repository:${id}`,
  REPOSITORY_COMMITS: (id: string) => `repository:${id}:commits`,
  DIGEST: (id: string) => `digest:${id}`,
  JOB: (id: string) => `job:${id}`,
  API_KEY: (key: string) => `api_key:${key}`,
  RATE_LIMIT: (ip: string) => `rate_limit:${ip}`,
  GITHUB_USER: (username: string) => `github:user:${username}`,
  GITHUB_REPO: (owner: string, repo: string) => `github:repo:${owner}:${repo}`,
} as const;

// Database Table Names
export const TABLES = {
  USERS: 'users',
  USER_SESSIONS: 'user_sessions',
  REPOSITORIES: 'repositories',
  USER_REPOSITORIES: 'user_repositories',
  DIGESTS: 'digests',
  DIGEST_REPOSITORIES: 'digest_repositories',
  DIGEST_ENTRIES: 'digest_entries',
  JOBS: 'jobs',
  API_KEYS: 'api_keys',
  WEBHOOKS: 'webhooks',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  SYSTEM_SETTINGS: 'system_settings',
} as const;

// Queue Names
export const QUEUES = {
  DEFAULT: 'default',
  DIGEST_GENERATION: 'digest-generation',
  REPOSITORY_SYNC: 'repository-sync',
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  CLEANUP: 'cleanup',
  ANALYTICS: 'analytics',
} as const;

// Event Names
export const EVENTS = {
  USER_REGISTERED: 'user.registered',
  USER_VERIFIED: 'user.verified',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  
  REPOSITORY_ADDED: 'repository.added',
  REPOSITORY_REMOVED: 'repository.removed',
  REPOSITORY_SYNCED: 'repository.synced',
  
  DIGEST_CREATED: 'digest.created',
  DIGEST_GENERATED: 'digest.generated',
  DIGEST_SENT: 'digest.sent',
  
  JOB_STARTED: 'job.started',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  
  WEBHOOK_RECEIVED: 'webhook.received',
  WEBHOOK_PROCESSED: 'webhook.processed',
} as const;

// Regex Patterns
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
  GITHUB_REPO_URL: /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  HEX_COLOR: /^#[0-9A-F]{6}$/i,
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  SEMANTIC_VERSION: /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
} as const;

// Time Constants (in milliseconds)
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000,
} as const;

// Role Permissions Mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permission),
  [UserRole.MODERATOR]: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.REPOSITORY_READ,
    Permission.REPOSITORY_WRITE,
    Permission.DIGEST_READ,
    Permission.DIGEST_WRITE,
    Permission.DIGEST_GENERATE,
    Permission.JOB_READ,
    Permission.JOB_WRITE,
    Permission.API_READ,
    Permission.API_WRITE,
    Permission.WEBHOOK_READ,
    Permission.WEBHOOK_WRITE,
  ],
  [UserRole.USER]: [
    Permission.USER_READ,
    Permission.REPOSITORY_READ,
    Permission.REPOSITORY_WRITE,
    Permission.DIGEST_READ,
    Permission.DIGEST_WRITE,
    Permission.DIGEST_GENERATE,
    Permission.JOB_READ,
    Permission.API_READ,
    Permission.WEBHOOK_READ,
  ],
  [UserRole.READONLY]: [
    Permission.USER_READ,
    Permission.REPOSITORY_READ,
    Permission.DIGEST_READ,
    Permission.JOB_READ,
    Permission.API_READ,
  ],
};

// Feature Flags
export const FEATURE_FLAGS = {
  ENABLE_ANALYTICS: true,
  ENABLE_WEBHOOKS: true,
  ENABLE_EMAIL_NOTIFICATIONS: true,
  ENABLE_SLACK_INTEGRATION: false,
  ENABLE_DISCORD_INTEGRATION: false,
  ENABLE_ADVANCED_DIGEST_FEATURES: true,
  ENABLE_API_VERSIONING: true,
  ENABLE_RATE_LIMITING: true,
  ENABLE_CACHING: true,
  ENABLE_METRICS: true,
} as const;

// System Limits
export const LIMITS = {
  MAX_REPOSITORIES_PER_USER: 100,
  MAX_DIGESTS_PER_USER: 50,
  MAX_API_KEYS_PER_USER: 10,
  MAX_WEBHOOKS_PER_USER: 20,
  MAX_CONCURRENT_JOBS: 10,
  MAX_JOB_PAYLOAD_SIZE: 1024 * 1024, // 1MB
  MAX_DIGEST_CONTENT_LENGTH: 1024 * 1024 * 10, // 10MB
  MAX_COMMIT_MESSAGE_LENGTH: 2000,
  MAX_REPOSITORY_NAME_LENGTH: 100,
  MAX_DIGEST_TITLE_LENGTH: 200,
  MAX_USER_BIO_LENGTH: 500,
} as const;