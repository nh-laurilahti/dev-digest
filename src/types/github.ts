import { z } from 'zod';

// GitHub API response types
export const GitHubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  avatar_url: z.string(),
  html_url: z.string(),
  type: z.string(),
  site_admin: z.boolean(),
});

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  clone_url: z.string(),
  ssh_url: z.string(),
  owner: GitHubUserSchema,
  private: z.boolean(),
  default_branch: z.string(),
  language: z.string().nullable(),
  languages_url: z.string(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string().nullable(),
  archived: z.boolean(),
  disabled: z.boolean(),
  visibility: z.string(),
  permissions: z.object({
    admin: z.boolean(),
    maintain: z.boolean().optional(),
    push: z.boolean(),
    triage: z.boolean().optional(),
    pull: z.boolean(),
  }).optional(),
});

export const GitHubBranchSchema = z.object({
  name: z.string(),
  commit: z.object({
    sha: z.string(),
    url: z.string(),
  }),
  protected: z.boolean(),
});

export const GitHubCommitSchema = z.object({
  sha: z.string(),
  url: z.string(),
  html_url: z.string(),
  author: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    date: z.string(),
  }).nullable(),
  committer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    date: z.string(),
  }).nullable(),
  message: z.string(),
  tree: z.object({
    sha: z.string(),
    url: z.string(),
  }),
  parents: z.array(z.object({
    sha: z.string(),
    url: z.string(),
    html_url: z.string(),
  })),
  stats: z.object({
    additions: z.number(),
    deletions: z.number(),
    total: z.number(),
  }).optional(),
  files: z.array(z.object({
    filename: z.string(),
    status: z.string(),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
    blob_url: z.string().optional(),
    raw_url: z.string().optional(),
    contents_url: z.string().optional(),
    patch: z.string().optional(),
  })).optional(),
});

export const GitHubPullRequestSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string(),
  state: z.enum(['open', 'closed', 'draft']),
  draft: z.boolean(),
  merged: z.boolean().nullable().optional(),
  mergeable: z.boolean().nullable().optional(),
  mergeable_state: z.string().nullable().optional(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  user: GitHubUserSchema,
  assignee: GitHubUserSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  requested_reviewers: z.array(GitHubUserSchema),
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
    description: z.string().nullable(),
  })),
  milestone: z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    state: z.string(),
    due_on: z.string().nullable(),
  }).nullable(),
  head: z.object({
    label: z.string(),
    ref: z.string(),
    sha: z.string(),
    repo: GitHubRepositorySchema.nullable(),
    user: GitHubUserSchema,
  }),
  base: z.object({
    label: z.string(),
    ref: z.string(),
    sha: z.string(),
    repo: GitHubRepositorySchema,
    user: GitHubUserSchema,
  }),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  changed_files: z.number().optional(),
  commits: z.number().optional(),
  review_comments: z.number().optional(),
  comments: z.number().optional(),
});

export const GitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: z.string(),
  published_at: z.string().nullable(),
  author: GitHubUserSchema,
  html_url: z.string(),
  tarball_url: z.string(),
  zipball_url: z.string(),
  assets: z.array(z.object({
    id: z.number(),
    name: z.string(),
    label: z.string().nullable(),
    size: z.number(),
    download_count: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
    browser_download_url: z.string(),
  })),
});

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string(),
  state: z.enum(['open', 'closed']),
  state_reason: z.string().nullable(),
  user: GitHubUserSchema,
  assignee: GitHubUserSchema.nullable(),
  assignees: z.array(GitHubUserSchema),
  labels: z.array(z.object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
    description: z.string().nullable(),
  })),
  milestone: z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    state: z.string(),
    due_on: z.string().nullable(),
  }).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  comments: z.number(),
});

export const GitHubReviewSchema = z.object({
  id: z.number(),
  user: GitHubUserSchema,
  body: z.string().nullable(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING']),
  html_url: z.string(),
  pull_request_url: z.string(),
  submitted_at: z.string().nullable(),
  commit_id: z.string(),
});

// Internal types
export type GitHubUser = z.infer<typeof GitHubUserSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
export type GitHubBranch = z.infer<typeof GitHubBranchSchema>;
export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubReview = z.infer<typeof GitHubReviewSchema>;

// Enhanced internal types with additional processing
export interface EnhancedPullRequest extends GitHubPullRequest {
  reviews?: GitHubReview[];
  reviewers?: GitHubUser[];
  files_changed?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>;
  commit_messages?: string[];
  activity_score?: number;
  complexity_score?: number;
}

export interface RepositoryStatistics {
  repository: GitHubRepository;
  total_commits: number;
  total_pull_requests: number;
  total_issues: number;
  total_releases: number;
  contributors: Array<{
    user: GitHubUser;
    contributions: number;
    commits: number;
    pull_requests: number;
    issues: number;
  }>;
  languages: Record<string, number>;
  activity_by_date: Record<string, {
    commits: number;
    pull_requests: number;
    issues: number;
  }>;
  last_updated: string;
}

export interface ContributorAnalysis {
  user: GitHubUser;
  total_contributions: number;
  commits: {
    count: number;
    additions: number;
    deletions: number;
    files_changed: number;
  };
  pull_requests: {
    count: number;
    merged: number;
    closed: number;
    avg_additions: number;
    avg_deletions: number;
    avg_files_changed: number;
  };
  reviews: {
    count: number;
    approved: number;
    changes_requested: number;
    commented: number;
  };
  issues: {
    created: number;
    closed: number;
  };
  activity_periods: Array<{
    date: string;
    commits: number;
    pull_requests: number;
    reviews: number;
  }>;
  expertise_areas: string[];
  collaboration_score: number;
}

// Rate limiting and caching
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
  resource: string;
}

export interface CacheOptions {
  ttl: number; // Time to live in seconds
  key_prefix: string;
  compress?: boolean;
}

// API request options
export interface GitHubApiOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  state?: 'open' | 'closed' | 'all';
  since?: string;
  until?: string;
}

export interface PullRequestFilters extends GitHubApiOptions {
  author?: string;
  assignee?: string;
  reviewer?: string;
  label?: string;
  milestone?: string;
  head?: string;
  base?: string;
  merged?: boolean;
}

export interface CommitFilters extends GitHubApiOptions {
  author?: string;
  path?: string;
  sha?: string;
}

export interface IssueFilters extends GitHubApiOptions {
  assignee?: string;
  creator?: string;
  mentioned?: string;
  labels?: string;
  milestone?: string;
}

// Webhook types
export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
}

export interface WebhookEvent {
  action: string;
  repository: GitHubRepository;
  sender: GitHubUser;
  pull_request?: GitHubPullRequest;
  issue?: GitHubIssue;
  release?: GitHubRelease;
  ref?: string;
  commits?: GitHubCommit[];
  before?: string;
  after?: string;
  created?: boolean;
  deleted?: boolean;
  forced?: boolean;
  compare?: string;
}

// Configuration types
export interface GitHubClientConfig {
  token: string;
  userAgent?: string;
  baseUrl?: string;
  previews?: string[];
  timeout?: number;
  retries?: {
    enabled: boolean;
    retries: number;
    retryAfter: number;
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  rateLimit?: {
    enabled: boolean;
    strategy: 'exponential' | 'linear' | 'fixed';
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
  };
}

// Error types
export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly response?: any;
  public readonly request?: any;
  public readonly documentation_url?: string;

  constructor(
    message: string,
    status: number,
    response?: any,
    request?: any,
    documentation_url?: string
  ) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.response = response;
    this.request = request;
    this.documentation_url = documentation_url;
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  public readonly resetDate: Date;
  public readonly remaining: number;

  constructor(
    message: string,
    resetDate: Date,
    remaining: number,
    response?: any
  ) {
    super(message, 429, response);
    this.name = 'GitHubRateLimitError';
    this.resetDate = resetDate;
    this.remaining = remaining;
  }
}

export class GitHubValidationError extends Error {
  public readonly field: string;
  public readonly value: any;

  constructor(message: string, field: string, value: any) {
    super(message);
    this.name = 'GitHubValidationError';
    this.field = field;
    this.value = value;
  }
}