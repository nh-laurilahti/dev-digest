# GitHub Integration Documentation

## Overview

The GitHub Integration system provides comprehensive access to GitHub's API for fetching repository data, managing pull requests, analyzing contributors, and generating development digests. It's built with TypeScript for full type safety and includes advanced features like rate limiting, caching, error handling, and webhook support.

## Architecture

### Core Components

1. **GitHubClient** (`src/clients/github.ts`)
   - Wrapper around Octokit with enhanced features
   - Rate limit handling and request queuing
   - Caching layer for improved performance
   - Comprehensive error handling

2. **RepositoryService** (`src/services/repositories.ts`)
   - Repository information and metadata
   - Branch and commit management
   - Contributor analysis
   - Repository validation

3. **PullRequestService** (`src/services/pull-requests.ts`)
   - Pull request fetching and enhancement
   - Review and file analysis
   - Contributor activity tracking
   - Statistics and metrics

4. **RepoValidationService** (`src/services/repo-validation.ts`)
   - Repository access validation
   - Token scope verification
   - Batch validation support
   - Digest readiness assessment

5. **WebhookService** (`src/services/webhooks.ts`)
   - Webhook management and verification
   - Event processing and filtering
   - Signature validation
   - Delivery tracking

6. **GitHubDataProcessor** (`src/services/github-data-processor.ts`)
   - Comprehensive data aggregation
   - Digest generation
   - Activity analysis and insights
   - Performance metrics

## Features

### ✨ Key Capabilities

- **Rate Limit Management**: Smart handling of GitHub's API limits with exponential backoff
- **Caching System**: Intelligent caching with TTL and memory management
- **Type Safety**: Full TypeScript support with Zod validation
- **Error Handling**: Comprehensive error types and graceful degradation
- **Webhook Support**: Complete webhook lifecycle management
- **Batch Operations**: Efficient bulk data processing
- **Performance Monitoring**: API usage tracking and optimization

### 🚀 Advanced Features

- **Activity Scoring**: Algorithmic assessment of repository activity
- **Contributor Analysis**: Detailed contributor profiles and expertise areas
- **Trend Detection**: Automatic identification of development trends
- **Data Insights**: AI-powered analysis of repository health
- **Multi-token Support**: Load balancing across multiple GitHub tokens
- **Real-time Updates**: Webhook-driven data synchronization

## Quick Start

### Basic Setup

```typescript
import { GitHubClient, RepositoryService } from '../services';

// Initialize the client
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  cache: {
    enabled: true,
    ttl: 300, // 5 minutes
    maxSize: 1000,
  },
  rateLimit: {
    enabled: true,
    strategy: 'exponential',
    maxRetries: 3,
  },
});

// Create services
const repositoryService = new RepositoryService(client);

// Fetch repository data
const repository = await repositoryService.getRepository('owner', 'repo');
console.log('Repository:', repository.full_name);
```

### Generate a Repository Digest

```typescript
import { GitHubDataProcessor } from '../services';

const processor = new GitHubDataProcessor(client);

const digest = await processor.generateDigest('owner', 'repo', {
  period: {
    start: '2023-11-01T00:00:00Z',
    end: '2023-12-01T00:00:00Z',
  },
  includeDetailed: true,
  includeInsights: true,
});

console.log('Digest Summary:', digest.summary);
console.log('Pull Requests:', digest.pullRequests.merged.length);
console.log('Contributors:', digest.contributors.active.length);
```

### Validate Repository Access

```typescript
import { RepoValidationService } from '../services';

const validation = new RepoValidationService(client);

const result = await validation.validateRepository('owner', 'repo', {
  checkPermissions: true,
  checkRateLimit: true,
  checkContent: true,
});

if (result.isValid) {
  console.log('Repository is accessible!');
} else {
  console.error('Validation errors:', result.errors);
}
```

## API Reference

### GitHubClient

#### Configuration Options

```typescript
interface GitHubClientConfig {
  token: string;
  userAgent?: string;
  baseUrl?: string;
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
```

#### Methods

- `testConnection()`: Test GitHub connection and token validity
- `getRateLimit()`: Get current rate limit status
- `canMakeRequest(resource?)`: Check if requests can be made
- `getTimeUntilReset(resource?)`: Time until rate limit reset
- `batchRequest(requests, batchSize?, delay?)`: Execute requests in batches
- `getCacheStats()`: Get cache usage statistics
- `clearCache()`: Clear all cached data

### RepositoryService

#### Core Methods

- `getRepository(owner, repo)`: Get repository information
- `getRepositories(owner, options?)`: Get multiple repositories
- `searchRepositories(query, options?)`: Search repositories
- `getBranches(owner, repo, options?)`: Get repository branches
- `getCommits(owner, repo, filters?)`: Get commit history
- `getContributors(owner, repo, options?)`: Get contributors
- `getLanguages(owner, repo)`: Get programming languages
- `getRepositoryStatistics(owner, repo, options?)`: Comprehensive stats
- `validateRepositoryAccess(owner, repo)`: Check permissions

### PullRequestService

#### Core Methods

- `getPullRequests(owner, repo, filters?)`: Get pull requests
- `getPullRequest(owner, repo, number)`: Get specific PR
- `getEnhancedPullRequest(owner, repo, number, options?)`: PR with details
- `getPullRequestReviews(owner, repo, number)`: Get PR reviews
- `getPullRequestFiles(owner, repo, number)`: Get changed files
- `getPullRequestsWithStats(owner, repo, options?)`: PRs with statistics
- `analyzeContributorActivity(owner, repo, options?)`: Contributor analysis
- `getPullRequestsNeedingReview(owner, repo, reviewer?)`: Review queue

### WebhookService

#### Core Methods

- `verifySignature(payload, signature, secret?)`: Verify webhook signature
- `processWebhook(eventType, payload, signature)`: Process webhook event
- `setupRepositoryWebhook(owner, repo, config)`: Create webhook
- `removeRepositoryWebhook(owner, repo, url)`: Delete webhook
- `getRepositoryWebhooks(owner, repo)`: List webhooks
- `testWebhook(owner, repo, hookId)`: Send test ping

### GitHubDataProcessor

#### Core Methods

- `generateDigest(owner, repo, options)`: Generate comprehensive digest
- `generateLightweightDigest(owner, repo, options)`: Basic digest
- `getActivitySummary(owner, repo, period)`: Activity metrics
- `compareActivityPeriods(owner, repo, periods)`: Period comparison
- `getApiUsageStats()`: API usage tracking

## Data Types

### Repository Information

```typescript
interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: GitHubUser;
  private: boolean;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  // ... additional fields
}
```

### Pull Request Data

```typescript
interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'draft';
  user: GitHubUser;
  merged: boolean | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  // ... additional fields
}
```

### Enhanced Pull Request

```typescript
interface EnhancedPullRequest extends GitHubPullRequest {
  reviews?: GitHubReview[];
  reviewers?: GitHubUser[];
  files_changed?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }>;
  commit_messages?: string[];
  activity_score?: number;
  complexity_score?: number;
}
```

### Digest Data

```typescript
interface DigestData {
  repository: GitHubRepository;
  period: {
    start: string;
    end: string;
    days: number;
  };
  summary: {
    totalCommits: number;
    totalPullRequests: number;
    totalContributors: number;
    totalAdditions: number;
    totalDeletions: number;
    activity_score: number;
  };
  pullRequests: {
    opened: EnhancedPullRequest[];
    merged: EnhancedPullRequest[];
    closed: EnhancedPullRequest[];
    inProgress: EnhancedPullRequest[];
    stats: {
      avgTimeToMerge: number;
      avgLinesChanged: number;
      mostActiveContributor: string | null;
    };
  };
  insights: {
    trends: {
      activity: 'increasing' | 'decreasing' | 'stable';
      codeHealth: 'improving' | 'declining' | 'stable';
      collaboration: 'increasing' | 'decreasing' | 'stable';
    };
    highlights: string[];
    concerns: string[];
    recommendations: string[];
  };
  metadata: {
    generatedAt: string;
    dataFreshness: string;
    apiCallsUsed: number;
  };
}
```

## Configuration

### Environment Variables

```bash
# Required
GITHUB_TOKEN=your_github_personal_access_token

# Optional
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### Token Permissions

The GitHub token should have the following scopes:

- `repo` - Full repository access (or `public_repo` for public repos only)
- `user` - User profile information
- `read:org` - Organization membership (for org repositories)

## Error Handling

### Error Types

```typescript
// GitHub-specific errors
class GitHubApiError extends Error {
  status: number;
  response?: any;
  request?: any;
}

class GitHubRateLimitError extends GitHubApiError {
  resetDate: Date;
  remaining: number;
}

class GitHubValidationError extends Error {
  field: string;
  value: any;
}
```

### Error Handling Example

```typescript
import { GitHubApiError, GitHubRateLimitError } from '../types/github';

try {
  const repository = await repositoryService.getRepository('owner', 'repo');
} catch (error) {
  if (error instanceof GitHubRateLimitError) {
    console.log(`Rate limit exceeded. Reset at: ${error.resetDate}`);
    // Implement retry logic
  } else if (error instanceof GitHubApiError) {
    console.log(`API error: ${error.message} (Status: ${error.status})`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Performance Optimization

### Caching Strategy

The system uses a multi-level caching approach:

1. **Memory Cache**: Fast access to recently used data
2. **TTL-based Expiration**: Automatic cache invalidation
3. **LRU Eviction**: Memory management for large datasets

### Rate Limit Management

- **Exponential Backoff**: Progressive delay increases
- **Request Queuing**: Batch processing to maximize throughput
- **Priority System**: Important requests processed first
- **Multi-token Support**: Load balancing across tokens

### Best Practices

1. **Use Filters**: Reduce API calls with targeted queries
2. **Batch Operations**: Process multiple items together
3. **Cache Awareness**: Leverage cached data when possible
4. **Monitor Usage**: Track API consumption patterns

## Webhook Integration

### Supported Events

- `push` - Code pushes to repository
- `pull_request` - PR creation, updates, merging
- `pull_request_review` - Code reviews
- `issues` - Issue creation and updates
- `release` - Release publications

### Event Processing

```typescript
import { WebhookService } from '../services';

const webhookService = new WebhookService(client);

// Process incoming webhook
const processedEvent = await webhookService.processWebhook(
  'pull_request',
  payload,
  signature
);

if (processedEvent?.metadata.relevantForDigest) {
  // Update digest data
  console.log('Processing relevant event:', processedEvent.type);
}
```

## Testing

### Unit Tests

```typescript
import { GitHubClient, RepositoryService } from '../services';

describe('RepositoryService', () => {
  let client: GitHubClient;
  let service: RepositoryService;

  beforeEach(() => {
    client = new GitHubClient();
    service = new RepositoryService(client);
  });

  it('should fetch repository data', async () => {
    const repo = await service.getRepository('owner', 'repo');
    expect(repo.name).toBe('repo');
  });
});
```

### Integration Tests

See `src/__tests__/github-integration.test.ts` for comprehensive test examples.

### Example Usage

See `src/examples/github-integration-example.ts` for complete usage examples.

## Monitoring and Debugging

### Logging

The system uses structured logging with context:

```typescript
import { logger } from '../lib/logger';

logger.info({
  owner,
  repo,
  duration: 1500,
  apiCalls: 15
}, 'Digest generation completed');
```

### Performance Metrics

Track API usage and performance:

```typescript
const processor = new GitHubDataProcessor(client);
const stats = processor.getApiUsageStats();

console.log('API calls made:', stats.callsInCurrentSession);
console.log('Rate limit status:', await stats.rateLimitInfo);
```

## Deployment Considerations

### Production Setup

1. **Token Management**: Use multiple tokens for high-volume applications
2. **Rate Limit Monitoring**: Implement alerting for rate limit exhaustion
3. **Error Handling**: Graceful degradation for API failures
4. **Caching Layer**: Consider Redis for distributed caching
5. **Webhook Reliability**: Implement retry logic for webhook processing

### Scaling

- **Horizontal Scaling**: Multiple instances with shared cache
- **Token Rotation**: Automatic token switching for higher limits
- **Data Partitioning**: Split data processing across services
- **Background Processing**: Queue-based digest generation

## Troubleshooting

### Common Issues

1. **Rate Limit Exceeded**
   - Solution: Implement exponential backoff
   - Prevention: Use caching and batch requests

2. **Authentication Failures**
   - Check token validity and scopes
   - Verify token hasn't expired

3. **Repository Access Denied**
   - Ensure proper permissions
   - Check if repository exists and is accessible

4. **Webhook Verification Failed**
   - Verify webhook secret configuration
   - Check signature calculation

### Debug Mode

Enable detailed logging for debugging:

```typescript
const client = new GitHubClient({
  // ... other options
  debug: true, // Enable debug logging
});
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run tests: `npm test`
5. Build: `npm run build`

### Code Guidelines

- Use TypeScript with strict type checking
- Follow existing code style and patterns
- Add comprehensive tests for new features
- Update documentation for API changes
- Use structured logging for debugging

## License

This GitHub integration is part of the Daily Dev Digest application and follows the same licensing terms.

---

For more information, see the [main project documentation](../README.md) or check the [API documentation](./api.md).