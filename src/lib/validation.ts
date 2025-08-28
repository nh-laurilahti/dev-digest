import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

// Common validation patterns
export const commonPatterns = {
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  username: z.string().min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  url: z.string().url('Invalid URL format'),
  githubRepo: z.string().regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, 'Must be in owner/repo format (e.g., mattermost/mattermost)'),
  uuid: z.string().uuid('Invalid UUID format'),
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),
  slug: z.string().min(1).max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  phoneNumber: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  positiveInt: z.number().int().positive('Must be a positive integer'),
  nonNegativeInt: z.number().int().nonnegative('Must be a non-negative integer'),
  iso8601Date: z.string().datetime('Invalid ISO 8601 date format'),
  hexColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color format'),
};

// Common query parameters
export const querySchemas = {
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1)
      .pipe(z.number().int().min(1, 'Page must be at least 1')),
    limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      .pipe(z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit must be at most 100')),
    offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0)
      .pipe(z.number().int().min(0, 'Offset must be non-negative')),
  }),
  
  sorting: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
  
  filtering: z.object({
    search: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
    tags: z.string().optional().transform(val => val ? val.split(',').map(tag => tag.trim()) : undefined),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }),
  
  fields: z.object({
    fields: z.string().optional().transform(val => val ? val.split(',').map(field => field.trim()) : undefined),
    include: z.string().optional().transform(val => val ? val.split(',').map(field => field.trim()) : undefined),
    exclude: z.string().optional().transform(val => val ? val.split(',').map(field => field.trim()) : undefined),
  }),
};

// User-related schemas
export const userSchemas = {
  register: z.object({
    email: commonPatterns.email,
    password: commonPatterns.password,
    username: commonPatterns.username,
    firstName: z.string().min(1, 'First name is required').max(50, 'First name must be at most 50 characters'),
    lastName: z.string().min(1, 'Last name is required').max(50, 'Last name must be at most 50 characters'),
    acceptTerms: z.boolean().refine(val => val === true, 'Terms and conditions must be accepted'),
  }),
  
  login: z.object({
    email: commonPatterns.email,
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional().default(false),
  }),
  
  updateProfile: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    username: commonPatterns.username.optional(),
    bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),
    avatar: commonPatterns.url.optional(),
    timezone: z.string().optional(),
    language: z.string().min(2).max(10).optional(),
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonPatterns.password,
    confirmPassword: z.string(),
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  
  resetPassword: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: commonPatterns.password,
    confirmPassword: z.string(),
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }),
  
  forgotPassword: z.object({
    email: commonPatterns.email,
  }),
};

// Repository-related schemas
export const repositorySchemas = {
  add: z.object({
    repository: commonPatterns.githubRepo,
    name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
    description: z.string().max(500, 'Description must be at most 500 characters').optional(),
    tags: z.array(z.string().min(1).max(50)).max(10, 'Maximum 10 tags allowed').optional(),
    isPrivate: z.boolean().optional().default(false),
    watchBranches: z.array(z.string().min(1)).optional().default(['main', 'master']),
  }),
  
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    tags: z.array(z.string().min(1).max(50)).max(10).optional(),
    isPrivate: z.boolean().optional(),
    watchBranches: z.array(z.string().min(1)).optional(),
    isActive: z.boolean().optional(),
  }),
  
  query: querySchemas.pagination.merge(querySchemas.sorting).merge(z.object({
    search: z.string().optional(),
    language: z.string().optional(),
    tags: z.string().optional(),
    isActive: z.string().transform(val => val === 'true').optional(),
  })),
};

// Digest-related schemas
export const digestSchemas = {
  create: z.object({
    title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
    description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
    repositories: z.array(z.number().int().positive()).min(1, 'At least one repository is required'),
    schedule: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    isActive: z.boolean().default(true),
    summaryStyle: z.enum(['concise', 'frontend', 'engaging-story', 'executive', 'technical', 'custom']).optional(),
    summaryPrompt: z.string().max(2000, 'Summary prompt must be at most 2000 characters').optional(),
  }),
  
  update: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    repositories: z.array(z.number().int().positive()).optional(),
    schedule: z.enum(['daily', 'weekly', 'monthly']).optional(),
    isActive: z.boolean().optional(),
  }),
  
  query: querySchemas.pagination.merge(querySchemas.sorting).merge(z.object({
    search: z.string().optional(),
    schedule: z.enum(['daily', 'weekly', 'monthly']).optional(),
    isActive: z.string().transform(val => val === 'true').optional(),
  })),
};

// Job-related schemas
export const jobSchemas = {
  create: z.object({
    type: z.enum(['digest_generation', 'repository_sync', 'cleanup']),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    payload: z.record(z.any()).optional(),
    scheduledFor: z.string().datetime().optional(),
    maxRetries: z.number().int().min(0).max(5).default(3),
  }),
  
  update: z.object({
    status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
    progress: z.number().min(0).max(100).optional(),
    result: z.record(z.any()).optional(),
    error: z.string().optional(),
  }),
  
  query: querySchemas.pagination.merge(querySchemas.sorting).merge(z.object({
    type: z.enum(['digest_generation', 'repository_sync', 'cleanup']).optional(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
  })),
};

// API key schemas
export const apiKeySchemas = {
  create: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
    permissions: z.array(z.string()).min(1, 'At least one permission is required'),
    expiresAt: z.string().datetime().optional(),
  }),
  
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    permissions: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
};

// Webhook schemas
export const webhookSchemas = {
  github: z.object({
    repository: z.object({
      id: z.number(),
      full_name: z.string(),
      private: z.boolean(),
    }),
    commits: z.array(z.object({
      id: z.string(),
      message: z.string(),
      timestamp: z.string().datetime(),
      author: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      modified: z.array(z.string()),
      added: z.array(z.string()),
      removed: z.array(z.string()),
    })),
    ref: z.string(),
    head_commit: z.object({
      id: z.string(),
      message: z.string(),
    }),
  }),
};

// Validation middleware factory
export const validateSchema = <T extends z.ZodType<any, any>>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const validatedData = schema.parse(data);
      req[source] = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        throw new ValidationError('Validation failed', { 
          errors: formattedErrors,
          source 
        });
      }
      throw error;
    }
  };
};

// Validation helper functions
export const validateEmail = (email: string): boolean => {
  return commonPatterns.email.safeParse(email).success;
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const result = commonPatterns.password.safeParse(password);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map(err => err.message),
  };
};

export const validateUrl = (url: string): boolean => {
  return commonPatterns.url.safeParse(url).success;
};

export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const validatePagination = (page?: number, limit?: number) => {
  const validated = querySchemas.pagination.parse({
    page: page?.toString(),
    limit: limit?.toString(),
  });
  
  return {
    ...validated,
    offset: (validated.page - 1) * validated.limit,
  };
};

// Notification-related schemas
export const notificationSchemas = {
  create: z.object({
    type: z.enum(['digest_completed', 'job_failed', 'system_alert', 'user_mention']),
    channel: z.enum(['email', 'slack', 'web', 'webhook']),
    recipientId: z.number().int().positive(),
    digestId: z.number().int().positive().optional(),
    subject: z.string().max(200).optional(),
    message: z.string().min(1).max(1000),
    metadata: z.record(z.any()).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  }),
  
  update: z.object({
    status: z.enum(['pending', 'sent', 'failed', 'read', 'archived']).optional(),
    error: z.string().optional(),
  }),
  
  query: querySchemas.pagination.merge(querySchemas.sorting).merge(z.object({
    type: z.enum(['digest_completed', 'job_failed', 'system_alert', 'user_mention']).optional(),
    channel: z.enum(['email', 'slack', 'web', 'webhook']).optional(),
    status: z.enum(['pending', 'sent', 'failed', 'read', 'archived']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    recipientId: z.string().transform(val => parseInt(val, 10)).optional(),
  })),

  testSlack: z.object({
    channel: z.string().min(1, 'Slack channel is required'),
    message: z.string().min(1).max(1000),
    webhook_url: commonPatterns.url.optional(),
  }),

  testEmail: z.object({
    to: commonPatterns.email,
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    html: z.boolean().optional().default(false),
  }),

  testTeams: z.object({
    webhook_url: z.string().url('Invalid Teams webhook URL'),
    title: z.string().min(1).max(200).optional(),
    message: z.string().min(1).max(5000),
    theme_color: z.string().regex(/^[0-9a-fA-F]{6}$/, 'Theme color must be a valid hex color').optional(),
  }),

  testWebhook: z.object({
    url: z.string().url('Invalid webhook URL'),
    method: z.enum(['POST', 'PUT', 'PATCH']).optional().default('POST'),
    headers: z.string().optional(),
    secret: z.string().optional(),
    message: z.string().optional(),
  }),
};

// Settings-related schemas
export const settingsSchemas = {
  update: z.object({
    notifications: z.object({
      email_enabled: z.boolean().optional(),
      slack_enabled: z.boolean().optional(),
      webhook_enabled: z.boolean().optional(),
      digest_frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
      emailNotifications: z.object({
        enabled: z.boolean(),
        address: commonPatterns.email.optional(),
        frequency: z.enum(['immediate', 'daily', 'weekly']).optional(),
        format: z.enum(['html', 'text']).optional(),
      }).optional(),
      slackNotifications: z.object({
        enabled: z.boolean(),
        channel: z.string().optional(),
        username: z.string().optional(),
      }).optional(),
      teamsNotifications: z.object({
        enabled: z.boolean(),
        webhookUrl: z.string().transform(val => val === '' ? undefined : val).optional().pipe(z.string().url().optional()),
        titleTemplate: z.string().optional(),
        themeColor: z.string().regex(/^[0-9a-fA-F]{6}$/, 'Theme color must be a valid hex color').optional(),
      }).optional(),
      webhookNotifications: z.object({
        enabled: z.boolean(),
        url: z.string().transform(val => val === '' ? undefined : val).optional().pipe(z.string().url().optional()),
        secret: z.string().optional(),
        method: z.enum(['POST', 'PUT', 'PATCH']).optional(),
        headers: z.string().optional(),
      }).optional(),
    }).optional(),
    
    system: z.object({
      maintenance_mode: z.boolean().optional(),
      rate_limit_per_minute: z.number().int().min(1).max(1000).optional(),
      max_repositories_per_user: z.number().int().min(1).max(100).optional(),
      job_retention_days: z.number().int().min(1).max(365).optional(),
    }).optional(),
    
    github: z.object({
      api_timeout: z.number().int().min(1000).max(60000).optional(),
      rate_limit_buffer: z.number().int().min(1).max(100).optional(),
      webhook_secret: z.string().min(8).optional(),
    }).optional(),
    
    ai: z.object({
      provider: z.enum(['openai', 'anthropic']).optional(),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().int().min(100).max(8000).optional(),
    }).optional(),
  }),
  
  query: z.object({
    section: z.enum(['notifications', 'system', 'github', 'ai', 'all']).optional(),
  }),
};

// User preferences schemas
export const userPreferenceSchemas = {
  update: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
    timeOfDay: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:mm format').optional(),
    channels: z.array(z.enum(['email', 'slack', 'web'])).optional(),
    detailLevel: z.enum(['concise', 'detailed', 'comprehensive']).optional(),
    subscribedRepoIds: z.array(z.number().int()).optional(),
    slackUserId: z.string().optional(),
    emailAddress: commonPatterns.email.optional(),
    isEnabled: z.boolean().optional(),
    digestSettings: z.object({
      includeAISummary: z.boolean().optional(),
      includeCodeAnalysis: z.boolean().optional(),
      minImpactLevel: z.enum(['minor', 'moderate', 'major', 'critical']).optional(),
      excludeDrafts: z.boolean().optional(),
      maxPRsPerDigest: z.number().int().min(5).max(200).optional(),
    }).optional(),
    // Enhanced notification settings
    emailNotifications: z.object({
      enabled: z.boolean(),
      address: commonPatterns.email.optional(),
      frequency: z.enum(['immediate', 'daily', 'weekly']).optional(),
      format: z.enum(['html', 'text']).optional(),
    }).optional(),
    slackNotifications: z.object({
      enabled: z.boolean(),
      channel: z.string().optional(),
      username: z.string().optional(),
    }).optional(),
    teamsNotifications: z.object({
      enabled: z.boolean(),
      webhookUrl: z.string().transform(val => val === '' ? undefined : val).optional().pipe(z.string().url().optional()),
      titleTemplate: z.string().optional(),
      themeColor: z.string().regex(/^[0-9a-fA-F]{6}$/, 'Theme color must be a valid hex color').optional(),
    }).optional(),
    webhookNotifications: z.object({
      enabled: z.boolean(),
      url: z.string().transform(val => val === '' ? undefined : val).optional().pipe(z.string().url().optional()),
      secret: z.string().optional(),
      method: z.enum(['POST', 'PUT', 'PATCH']).optional(),
      headers: z.string().optional(),
    }).optional(),
  }),
};

// Statistics and metrics schemas
export const statsSchemas = {
  query: z.object({
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('week'),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).optional(),
    metrics: z.string().optional().transform(val => val ? val.split(',') : undefined),
  }),
  
  digestStats: z.object({
    includeRepositories: z.boolean().optional().default(true),
    includePRBreakdown: z.boolean().optional().default(true),
    includeContributors: z.boolean().optional().default(false),
    includeLanguages: z.boolean().optional().default(false),
  }),
};

// Health check schemas
export const healthSchemas = {
  detailed: z.object({
    includeServices: z.boolean().optional().default(true),
    includeDependencies: z.boolean().optional().default(false),
    includeMetrics: z.boolean().optional().default(false),
  }),
};

// Transform helpers for common patterns
export const transformers = {
  stringToNumber: (val: string) => {
    const num = Number(val);
    if (isNaN(num)) throw new Error('Must be a valid number');
    return num;
  },
  
  stringToBoolean: (val: string) => {
    const lower = val.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    throw new Error('Must be a valid boolean');
  },
  
  csvToArray: (val: string) => {
    return val.split(',').map(item => item.trim()).filter(Boolean);
  },
  
  trimAndLower: (val: string) => val.trim().toLowerCase(),
  
  slugify: (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },
};