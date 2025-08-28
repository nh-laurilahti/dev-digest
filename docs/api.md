# API Reference

This document provides comprehensive documentation for the Daily Dev Digest REST API. All API endpoints are prefixed with `/api/v1` and return JSON responses.

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Digests API](#digests-api)
  - [Repositories API](#repositories-api)
  - [Jobs API](#jobs-api)
  - [Users API](#users-api)
  - [Authentication API](#authentication-api)
  - [Notifications API](#notifications-api)
  - [Settings API](#settings-api)
- [Webhooks](#webhooks)
- [SDK Examples](#sdk-examples)

## Authentication

The API uses session-based authentication with CSRF protection for web clients and API key authentication for programmatic access.

### Session Authentication (Web)
Used by the web interface:
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

### API Key Authentication (Programmatic)
For API clients, include your API key in headers:
```http
Authorization: Bearer your-api-key-here
X-API-Key: your-api-key-here
```

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Authenticated users**: 1000 requests per hour
- **Anonymous users**: 100 requests per hour
- **Digest creation**: 10 requests per hour per user

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

## Error Handling

Errors return appropriate HTTP status codes with detailed error information:

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "reason": "Invalid email format"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

### Common Error Codes
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Endpoints

## Digests API

### Create Digest

Creates a new digest generation job for the specified repository.

**Endpoint:** `POST /api/v1/digests`

**Permissions Required:** `trigger_digests`

**Request Body:**
```json
{
  "repo_path": "owner/repository",
  "days": 7,
  "date_from": "2024-01-01T00:00:00Z",
  "date_to": "2024-01-08T00:00:00Z",
  "include_ai_summary": true,
  "notify_channels": ["slack", "email"]
}
```

**Parameters:**
- `repo_path` (string, required) - Repository in `owner/name` format
- `days` (integer, optional) - Number of days to include (1-90, default: 7)
- `date_from` (string, optional) - ISO 8601 start date, overrides `days`
- `date_to` (string, optional) - ISO 8601 end date, overrides `days`
- `include_ai_summary` (boolean, optional) - Enable AI summarization (default: false)
- `notify_channels` (array, optional) - Channels to notify on completion

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/v1/digests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "repo_path": "facebook/react",
    "days": 14,
    "include_ai_summary": true,
    "notify_channels": ["slack"]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "job_123456789",
    "status": "PENDING",
    "estimated_completion": "2024-01-15T10:35:00Z"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

### Get Digest

Retrieves a specific digest by ID.

**Endpoint:** `GET /api/v1/digests/{digest_id}`

**Permissions Required:** `view_digests` or ownership

**Example Request:**
```bash
curl http://localhost:3000/api/v1/digests/123 \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "repo": {
      "id": 1,
      "path": "facebook/react",
      "name": "React"
    },
    "date_from": "2024-01-01T00:00:00Z",
    "date_to": "2024-01-08T00:00:00Z",
    "summary_md": "# Weekly Digest\n\n## 🚀 New Features...",
    "summary_html": "<h1>Weekly Digest</h1><h2>🚀 New Features...</h2>",
    "stats": {
      "total_prs": 45,
      "contributors": 12,
      "lines_added": 2430,
      "lines_removed": 890,
      "files_changed": 156
    },
    "pr_data": [...],
    "created_at": "2024-01-08T10:30:00Z",
    "created_by": {
      "id": 1,
      "username": "john_doe",
      "full_name": "John Doe"
    }
  }
}
```

### List Digests

Retrieves a paginated list of digests with optional filtering.

**Endpoint:** `GET /api/v1/digests`

**Query Parameters:**
- `repo` (string, optional) - Filter by repository path
- `from_date` (string, optional) - ISO 8601 date filter
- `to_date` (string, optional) - ISO 8601 date filter
- `created_by` (integer, optional) - Filter by user ID
- `page` (integer, optional) - Page number (default: 1)
- `limit` (integer, optional) - Items per page (1-100, default: 20)
- `sort` (string, optional) - Sort field: `created_at`, `repo_path` (default: `-created_at`)

**Example Request:**
```bash
curl "http://localhost:3000/api/v1/digests?repo=facebook/react&limit=10&page=2" \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "repo": {"id": 1, "path": "facebook/react", "name": "React"},
      "date_from": "2024-01-01T00:00:00Z",
      "date_to": "2024-01-08T00:00:00Z",
      "stats": {"total_prs": 45, "contributors": 12},
      "created_at": "2024-01-08T10:30:00Z",
      "created_by": {"username": "john_doe"}
    }
  ],
  "meta": {
    "pagination": {
      "page": 2,
      "limit": 10,
      "total": 150,
      "pages": 15
    }
  }
}
```

## Repositories API

### List Repositories

**Endpoint:** `GET /api/v1/repos`

**Example Request:**
```bash
curl http://localhost:3000/api/v1/repos \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "path": "facebook/react",
      "name": "React",
      "active": true,
      "default_branch": "main",
      "created_at": "2024-01-01T00:00:00Z",
      "stats": {
        "total_digests": 24,
        "last_digest": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

### Add Repository

**Endpoint:** `POST /api/v1/repos`

**Permissions Required:** `manage_repos`

**Request Body:**
```json
{
  "path": "owner/repository",
  "name": "Display Name",
  "active": true,
  "default_branch": "main"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/v1/repos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "path": "microsoft/typescript",
    "name": "TypeScript",
    "active": true
  }'
```

### Update Repository

**Endpoint:** `PATCH /api/v1/repos/{repo_id}`

**Permissions Required:** `manage_repos`

**Request Body:**
```json
{
  "active": false,
  "name": "New Display Name"
}
```

### Delete Repository

**Endpoint:** `DELETE /api/v1/repos/{repo_id}`

**Permissions Required:** `manage_repos`

**Note:** This will also delete all associated digests and jobs.

## Jobs API

### Get Job Status

**Endpoint:** `GET /api/v1/jobs/{job_id}`

**Example Request:**
```bash
curl http://localhost:5000/api/v1/jobs/job_123456789 \
  -H "Authorization: Bearer your-api-key"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job_123456789",
    "type": "digest",
    "status": "COMPLETED",
    "progress": 100,
    "started_at": "2024-01-15T10:30:00Z",
    "finished_at": "2024-01-15T10:33:45Z",
    "duration_seconds": 225,
    "digest_id": 123,
    "error": null,
    "params": {
      "repo_path": "facebook/react",
      "days": 7
    }
  }
}
```

### List Jobs

**Endpoint:** `GET /api/v1/jobs`

**Query Parameters:**
- `status` (string, optional) - Filter by status: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
- `type` (string, optional) - Filter by job type
- `user_id` (integer, optional) - Filter by creator (admin only)

## Users API

### Get Current User

**Endpoint:** `GET /api/v1/users/me`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "is_active": true,
    "roles": ["admin", "maintainer"],
    "permissions": [
      "manage_settings",
      "manage_repos",
      "trigger_digests",
      "view_all_digests"
    ],
    "preferences": {
      "frequency": "weekly",
      "channels": ["slack", "email"],
      "detail_level": "detailed",
      "repos": [1, 2, 3]
    },
    "created_at": "2024-01-01T00:00:00Z",
    "last_login_at": "2024-01-15T09:00:00Z"
  }
}
```

### Update User Preferences

**Endpoint:** `PATCH /api/v1/users/me/preferences`

**Request Body:**
```json
{
  "frequency": "daily",
  "time_of_day": "09:00",
  "channels": ["slack", "web"],
  "detail_level": "concise",
  "repos": [1, 2],
  "slack_user_id": "U1234567890",
  "email_address": "john@example.com"
}
```

## Authentication API

### Login

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com"
    },
    "expires_at": "2024-01-15T22:30:00Z"
  }
}
```

### Logout

**Endpoint:** `POST /api/v1/auth/logout`

### Create API Key

**Endpoint:** `POST /api/v1/auth/api-keys`

**Request Body:**
```json
{
  "name": "CI/CD Pipeline",
  "expires_at": "2025-01-15T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ak_123456789",
    "name": "CI/CD Pipeline",
    "key": "ddd_ak_1234567890abcdef...",
    "created_at": "2024-01-15T10:30:00Z",
    "expires_at": "2025-01-15T00:00:00Z"
  }
}
```

## Notifications API

### Test Slack Notification

**Endpoint:** `POST /api/v1/notifications/slack/test`

**Permissions Required:** `manage_notifications`

**Request Body:**
```json
{
  "user_id": "U1234567890",
  "message": "Test notification from Daily Dev Digest"
}
```

### Test Email Notification

**Endpoint:** `POST /api/v1/notifications/email/test`

**Permissions Required:** `manage_notifications`

**Request Body:**
```json
{
  "email": "test@example.com",
  "subject": "Test Email",
  "template": "digest_summary"
}
```

### Get Notification History

**Endpoint:** `GET /api/v1/notifications/history`

**Query Parameters:**
- `channel` (string, optional) - Filter by channel: `slack`, `email`, `web`
- `status` (string, optional) - Filter by status: `sent`, `failed`, `pending`
- `user_id` (integer, optional) - Filter by user
- `digest_id` (integer, optional) - Filter by digest

## Settings API

### Get Application Settings

**Endpoint:** `GET /api/v1/settings`

**Permissions Required:** `manage_settings`

**Response:**
```json
{
  "success": true,
  "data": {
    "app_name": "Daily Dev Digest",
    "default_digest_days": 7,
    "max_digest_days": 90,
    "enable_ai_summaries": true,
    "enable_slack_notifications": true,
    "enable_email_notifications": true,
    "default_detail_level": "concise",
    "digest_retention_days": 365,
    "job_timeout_minutes": 30
  }
}
```

### Update Settings

**Endpoint:** `PATCH /api/v1/settings`

**Permissions Required:** `manage_settings`

**Request Body:**
```json
{
  "default_digest_days": 14,
  "enable_ai_summaries": false,
  "app_name": "Our Dev Digest"
}
```

## Webhooks

The application supports webhooks for real-time notifications of digest completions and job status changes.

### Webhook Configuration

Configure webhooks in your application settings:

```json
{
  "webhook_url": "https://your-app.com/webhooks/digest",
  "webhook_secret": "your-secret-key",
  "events": ["digest.completed", "job.failed"]
}
```

### Webhook Events

#### digest.completed
Triggered when a digest generation job completes successfully.

```json
{
  "event": "digest.completed",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "job_id": "job_123456789",
    "digest_id": 123,
    "repo": {"path": "facebook/react"},
    "stats": {"total_prs": 45, "contributors": 12}
  }
}
```

#### job.failed
Triggered when any job fails.

```json
{
  "event": "job.failed",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "job_id": "job_123456789",
    "type": "digest",
    "error": "GitHub API rate limit exceeded"
  }
}
```

## SDK Examples

### TypeScript SDK

```typescript
interface DigestAPIOptions {
  baseUrl: string;
  apiKey: string;
}

interface CreateDigestParams {
  repoPath: string;
  days?: number;
  includeAI?: boolean;
  notifyChannels?: string[];
}

class DigestAPI {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor({ baseUrl, apiKey }: DigestAPIOptions) {
    this.baseUrl = baseUrl;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async createDigest(params: CreateDigestParams) {
    const response = await fetch(`${this.baseUrl}/api/v1/digests`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        repo_path: params.repoPath,
        days: params.days || 7,
        include_ai_summary: params.includeAI || false,
        notify_channels: params.notifyChannels || []
      })
    });
    return await response.json();
  }

  async getDigest(digestId: number) {
    const response = await fetch(`${this.baseUrl}/api/v1/digests/${digestId}`, {
      headers: this.headers
    });
    return await response.json();
  }

  async waitForJob(jobId: string, timeout = 300000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`, {
        headers: this.headers
      });
      const { data: job } = await response.json();
      
      if (['COMPLETED', 'FAILED'].includes(job.status)) {
        return job;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Job did not complete within timeout');
  }
}

// Example usage
const api = new DigestAPI({ 
  baseUrl: 'http://localhost:3000', 
  apiKey: 'your-api-key' 
});

async function generateDigest() {
  try {
    const result = await api.createDigest({
      repoPath: 'facebook/react',
      days: 14,
      includeAI: true,
      notifyChannels: ['slack']
    });
    
    const job = await api.waitForJob(result.data.job_id);
    
    if (job.status === 'COMPLETED') {
      const digest = await api.getDigest(job.digest_id);
      console.log(`Digest created with ${digest.data.stats.total_prs} PRs`);
    }
  } catch (error) {
    console.error('Error generating digest:', error);
  }
}
```

### Bun SDK Example

```typescript
// Using Bun's native HTTP client for better performance
interface DigestClient {
  createDigest(params: CreateDigestParams): Promise<any>;
  getDigest(id: number): Promise<any>;
  waitForJob(jobId: string): Promise<any>;
}

class BunDigestClient implements DigestClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  async createDigest(params: CreateDigestParams) {
    const response = await fetch(`${this.baseUrl}/api/v1/digests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        repo_path: params.repoPath,
        days: params.days || 7,
        include_ai_summary: params.includeAI || false,
        notify_channels: params.notifyChannels || []
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  }

  async getDigest(digestId: number) {
    const response = await fetch(`${this.baseUrl}/api/v1/digests/${digestId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      }
    });
    return await response.json();
  }

  async waitForJob(jobId: string, timeout = 300000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const response = await fetch(`${this.baseUrl}/api/v1/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });
      const { data: job } = await response.json();
      
      if (['COMPLETED', 'FAILED'].includes(job.status)) {
        return job;
      }
      
      // Use Bun's sleep function
      await Bun.sleep(5000);
    }
    
    throw new Error('Job did not complete within timeout');
  }
}

// Example usage with Bun
const client = new BunDigestClient('http://localhost:3000', 'your-api-key');

// You can also use top-level await in Bun
const result = await client.createDigest({
  repoPath: 'facebook/react',
  days: 14,
  includeAI: true
});

const job = await client.waitForJob(result.data.job_id);
if (job.status === 'COMPLETED') {
  const digest = await client.getDigest(job.digest_id);
  console.log(`Digest created with ${digest.data.stats.total_prs} PRs`);
}
```

### cURL Examples

#### Create and Monitor Digest
```bash
#!/bin/bash
API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

# Create digest
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/digests" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_path": "facebook/react",
    "days": 7,
    "include_ai_summary": true
  }')

JOB_ID=$(echo $RESPONSE | jq -r '.data.job_id')
echo "Created job: $JOB_ID"

# Monitor job progress
while true; do
  STATUS=$(curl -s "${BASE_URL}/api/v1/jobs/${JOB_ID}" \
    -H "Authorization: Bearer ${API_KEY}" \
    | jq -r '.data.status')
  
  echo "Job status: $STATUS"
  
  if [[ "$STATUS" == "COMPLETED" ]]; then
    echo "Job completed successfully!"
    break
  elif [[ "$STATUS" == "FAILED" ]]; then
    echo "Job failed!"
    exit 1
  fi
  
  sleep 5
done
```

## Error Reference

### Common Error Scenarios

#### Repository Not Found
```json
{
  "success": false,
  "error": {
    "code": "REPOSITORY_NOT_FOUND",
    "message": "Repository 'nonexistent/repo' not found or not accessible",
    "details": {
      "repo_path": "nonexistent/repo",
      "suggestion": "Verify repository exists and GitHub token has access"
    }
  }
}
```

#### Rate Limit Exceeded
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 1000,
      "reset_at": "2024-01-15T11:30:00Z",
      "retry_after": 1800
    }
  }
}
```

#### Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "errors": [
        {
          "field": "repo_path",
          "message": "Repository path must be in owner/name format"
        },
        {
          "field": "days",
          "message": "Days must be between 1 and 90"
        }
      ]
    }
  }
}
```

This completes the comprehensive API documentation. All endpoints include authentication, permission requirements, request/response examples, and common error scenarios to help developers integrate with the Daily Dev Digest API effectively.