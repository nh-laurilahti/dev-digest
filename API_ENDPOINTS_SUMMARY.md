# Daily Dev Digest API Endpoints - Complete Implementation Summary

## Overview

This document provides a comprehensive summary of all implemented REST API endpoints for the Daily Dev Digest application. The API follows RESTful conventions and includes comprehensive error handling, validation, rate limiting, and role-based access control.

## Base URL
```
Production: https://your-domain.com/api/v1
Development: http://localhost:3000/api/v1
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer your-jwt-token-here
```

## API Versioning

The API uses `/api/v1` prefix for all new endpoints. Legacy endpoints without versioning are maintained for backward compatibility.

---

## 1. Authentication Endpoints (`/api/auth`)

These endpoints handle user authentication and session management.

### POST `/api/auth/register`
**Description:** Register a new user account  
**Authentication:** None required  
**Rate Limit:** Standard  

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "acceptTerms": true
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "user@example.com",
      "fullName": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here"
  },
  "message": "User registered successfully"
}
```

### POST `/api/auth/login`
**Description:** Authenticate user and get access token  
**Authentication:** None required  
**Rate Limit:** Standard  

### POST `/api/auth/logout`
**Description:** Invalidate current session  
**Authentication:** Required  
**Rate Limit:** Standard  

### POST `/api/auth/refresh`
**Description:** Refresh access token using refresh token  
**Authentication:** Refresh token required  
**Rate Limit:** Standard  

---

## 2. Health Check Endpoints (`/api/v1/health`)

### GET `/api/v1/health/`
**Description:** Basic health check (public endpoint)  
**Authentication:** None required  
**Rate Limit:** None  

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "uptime": 3600.5,
    "version": "1.0.0",
    "environment": "development",
    "responseTime": 15
  }
}
```

### GET `/api/v1/health/detailed`
**Description:** Detailed health check with service statuses  
**Authentication:** Required (Admin/Health permissions)  
**Rate Limit:** Standard  

**Query Parameters:**
- `includeServices` (boolean): Include service health checks
- `includeDependencies` (boolean): Include external dependency checks  
- `includeMetrics` (boolean): Include system metrics

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "uptime": 3600.5,
    "checks": {
      "database": {
        "status": "healthy",
        "responseTime": 5
      },
      "jobService": {
        "status": "healthy",
        "workers": 4,
        "queueSize": 2
      },
      "github": {
        "status": "healthy",
        "responseTime": 150,
        "rateLimit": {
          "remaining": 4500,
          "limit": 5000
        }
      }
    },
    "metrics": {
      "memory": {...},
      "cpu": {...}
    }
  }
}
```

### GET `/api/v1/health/readiness`
**Description:** Kubernetes readiness probe  
**Authentication:** None required  
**Rate Limit:** None  

### GET `/api/v1/health/liveness`
**Description:** Kubernetes liveness probe  
**Authentication:** None required  
**Rate Limit:** None  

### GET `/api/v1/health/metrics`
**Description:** Prometheus-style metrics  
**Authentication:** Required (Admin/Metrics permissions)  
**Rate Limit:** Standard  

---

## 3. Digest Management Endpoints (`/api/v1/digests`)

### POST `/api/v1/digests`
**Description:** Create a new digest generation job  
**Authentication:** Required (Digest Write permission)  
**Rate Limit:** 5 requests per 15 minutes  

**Request Body:**
```json
{
  "title": "Weekly React Digest",
  "description": "Weekly digest for React repository",
  "repositories": [1, 2, 3],
  "schedule": "weekly",
  "isActive": true
}
```

**Response (202):**
```json
{
  "success": true,
  "data": {
    "digest": {
      "id": 123,
      "repo": {
        "id": 1,
        "path": "facebook/react",
        "name": "React"
      },
      "dateFrom": "2024-01-08T00:00:00.000Z",
      "dateTo": "2024-01-15T00:00:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "job": {
      "id": "job_abc123",
      "status": "pending",
      "progress": 0
    }
  },
  "message": "Digest generation job created successfully"
}
```

### GET `/api/v1/digests`
**Description:** List digests with filtering and pagination  
**Authentication:** Required (Digest Read permission)  
**Rate Limit:** Standard  

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10, max: 100)
- `sortBy` (string): Sort field (default: 'createdAt')
- `sortOrder` (string): 'asc' or 'desc' (default: 'desc')
- `search` (string): Search in repo name/path
- `isActive` (boolean): Filter by active status

**Response (200):**
```json
{
  "success": true,
  "data": {
    "digests": [
      {
        "id": 123,
        "repo": {
          "id": 1,
          "path": "facebook/react",
          "name": "React"
        },
        "dateFrom": "2024-01-08T00:00:00.000Z",
        "dateTo": "2024-01-15T00:00:00.000Z",
        "hasMarkdown": true,
        "hasHtml": true,
        "lastJob": {
          "id": "job_abc123",
          "status": "completed"
        },
        "stats": {
          "totalPRs": 45,
          "mergedPRs": 38
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### GET `/api/v1/digests/:id`
**Description:** Get specific digest details  
**Authentication:** Required (Digest Read permission)  
**Rate Limit:** Standard  

### DELETE `/api/v1/digests/:id`
**Description:** Delete a digest (owner only)  
**Authentication:** Required (Digest Delete permission + ownership)  
**Rate Limit:** Standard  

### GET `/api/v1/digests/:id/stats`
**Description:** Get digest statistics and metrics  
**Authentication:** Required (Digest Read permission)  
**Rate Limit:** Standard  

### POST `/api/v1/digests/:id/regenerate`
**Description:** Regenerate a digest (owner only)  
**Authentication:** Required (Digest Write permission + ownership)  
**Rate Limit:** 5 requests per 15 minutes  

### GET `/api/v1/digests/:id/export`
**Description:** Export digest in various formats  
**Authentication:** Required (Digest Read permission)  
**Rate Limit:** Standard  

**Query Parameters:**
- `format` (string): 'json', 'markdown', 'html', 'pdf' (default: 'json')

---

## 4. Repository Management Endpoints (`/api/v1/repos`)

### GET `/api/v1/repos`
**Description:** List repositories with filtering and pagination  
**Authentication:** Required (Repo Read permission)  
**Rate Limit:** Standard  

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder` (pagination)
- `search` (string): Search in name/path/description
- `language` (string): Filter by programming language
- `isActive` (boolean): Filter by active status

### POST `/api/v1/repos`
**Description:** Add a new repository  
**Authentication:** Required (Repo Write permission)  
**Rate Limit:** 30 requests per 15 minutes  

**Request Body:**
```json
{
  "url": "https://github.com/facebook/react",
  "name": "React",
  "description": "A JavaScript library for building user interfaces",
  "tags": ["javascript", "ui", "frontend"],
  "isPrivate": false,
  "watchBranches": ["main", "develop"]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "repository": {
      "id": 1,
      "path": "facebook/react",
      "name": "React",
      "description": "A JavaScript library for building user interfaces",
      "active": true,
      "defaultBranch": "main"
    },
    "githubInfo": {
      "private": false,
      "language": "JavaScript",
      "stars": 205000,
      "forks": 42000
    },
    "permissions": {
      "admin": false,
      "push": false,
      "pull": true
    }
  }
}
```

### GET `/api/v1/repos/:id`
**Description:** Get repository details with GitHub info  
**Authentication:** Required (Repo Read permission)  
**Rate Limit:** Standard  

### PATCH `/api/v1/repos/:id`
**Description:** Update repository settings  
**Authentication:** Required (Repo Write permission)  
**Rate Limit:** Standard  

### DELETE `/api/v1/repos/:id`
**Description:** Remove repository (if no digests exist)  
**Authentication:** Required (Repo Delete permission)  
**Rate Limit:** Standard  

### POST `/api/v1/repos/validate`
**Description:** Validate repository access before adding  
**Authentication:** Required (Repo Read permission)  
**Rate Limit:** 30 requests per 15 minutes  

**Request Body:**
```json
{
  "url": "https://github.com/facebook/react"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "path": "facebook/react",
    "exists": true,
    "accessible": true,
    "permissions": {
      "admin": false,
      "push": false,
      "pull": true
    },
    "private": false,
    "archived": false,
    "alreadyAdded": false,
    "repositoryInfo": {
      "name": "React",
      "language": "JavaScript",
      "stars": 205000
    }
  }
}
```

### GET `/api/v1/repos/:id/stats`
**Description:** Get comprehensive repository statistics  
**Authentication:** Required (Repo Read permission)  
**Rate Limit:** Standard  

### GET `/api/v1/repos/:id/branches`
**Description:** Get repository branches  
**Authentication:** Required (Repo Read permission)  
**Rate Limit:** Standard  

---

## 5. User Management Endpoints (`/api/v1/users`)

### GET `/api/v1/users/me`
**Description:** Get current user profile  
**Authentication:** Required (User Read permission)  
**Rate Limit:** Standard  

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "fullName": "John Doe",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "roles": [
        {
          "id": 1,
          "name": "user",
          "description": "Standard user"
        }
      ],
      "permissions": ["users:read", "repos:read", "digests:read"],
      "stats": {
        "digestsCreated": 5,
        "jobsCreated": 12,
        "notifications": 45,
        "activeApiKeys": 2
      }
    },
    "preferences": {
      "frequency": "weekly",
      "timeOfDay": "09:00",
      "channels": ["email"],
      "detailLevel": "concise"
    }
  }
}
```

### PATCH `/api/v1/users/me`
**Description:** Update current user profile  
**Authentication:** Required (User Write permission)  
**Rate Limit:** 20 requests per 15 minutes  

### GET `/api/v1/users/me/preferences`
**Description:** Get user preferences  
**Authentication:** Required (User Read permission)  
**Rate Limit:** Standard  

### PATCH `/api/v1/users/me/preferences`
**Description:** Update user preferences  
**Authentication:** Required (User Write permission)  
**Rate Limit:** 20 requests per 15 minutes  

**Request Body:**
```json
{
  "frequency": "daily",
  "timeOfDay": "08:00",
  "channels": ["email", "slack"],
  "detailLevel": "detailed",
  "subscribedRepoIds": [1, 2, 3],
  "slackUserId": "U123456789",
  "isEnabled": true,
  "digestSettings": {
    "includeAISummary": true,
    "includeCodeAnalysis": false,
    "minImpactLevel": "moderate",
    "excludeDrafts": true,
    "maxPRsPerDigest": 50
  }
}
```

### GET `/api/v1/users/me/stats`
**Description:** Get user activity statistics  
**Authentication:** Required (User Read permission)  
**Rate Limit:** Standard  

**Query Parameters:**
- `period` (string): 'day', 'week', 'month', 'quarter', 'year'
- `dateFrom`, `dateTo` (ISO dates): Custom date range
- `groupBy` (string): 'day', 'week', 'month'

### POST `/api/v1/users/me/change-password`
**Description:** Change user password  
**Authentication:** Required (User Write permission)  
**Rate Limit:** 20 requests per 15 minutes  

### GET `/api/v1/users/me/api-keys`
**Description:** Get user API keys (without secrets)  
**Authentication:** Required (User Read permission)  
**Rate Limit:** Standard  

### GET `/api/v1/users/me/sessions`
**Description:** Get active sessions  
**Authentication:** Required (User Read permission)  
**Rate Limit:** Standard  

### DELETE `/api/v1/users/me/sessions/:sessionId`
**Description:** Revoke a specific session  
**Authentication:** Required (User Write permission)  
**Rate Limit:** Standard  

### POST `/api/v1/users/me/sessions/revoke-all`
**Description:** Revoke all sessions except current  
**Authentication:** Required (User Write permission)  
**Rate Limit:** Standard  

---

## 6. Settings Management Endpoints (`/api/v1/settings`)

### GET `/api/v1/settings`
**Description:** Get application settings (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

**Query Parameters:**
- `section` (string): 'notifications', 'system', 'github', 'ai', 'all' (default: 'all')

**Response (200):**
```json
{
  "success": true,
  "data": {
    "settings": {
      "notifications": {
        "email_enabled": true,
        "slack_enabled": false,
        "digest_frequency": "weekly"
      },
      "system": {
        "maintenance_mode": false,
        "rate_limit_per_minute": 60,
        "max_repositories_per_user": 50
      },
      "github": {
        "api_timeout": 30000,
        "rate_limit_buffer": 10
      },
      "ai": {
        "provider": "openai",
        "model": "gpt-3.5-turbo",
        "temperature": 0.7
      }
    },
    "section": "all",
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

### PATCH `/api/v1/settings`
**Description:** Update application settings (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

### GET `/api/v1/settings/public`
**Description:** Get public settings (no admin required)  
**Authentication:** Required (Settings Read permission)  
**Rate Limit:** Standard  

### GET `/api/v1/settings/:section/:key`
**Description:** Get a specific setting value  
**Authentication:** Required (Settings Read permission or Admin for non-public)  
**Rate Limit:** Standard  

### PUT `/api/v1/settings/:section/:key`
**Description:** Set a specific setting value (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

### DELETE `/api/v1/settings/:section/:key`
**Description:** Reset setting to default (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

### POST `/api/v1/settings/reset`
**Description:** Reset all settings to defaults (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

### GET `/api/v1/settings/export`
**Description:** Export all settings as JSON (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** Standard  

### POST `/api/v1/settings/import`
**Description:** Import settings from JSON (admin only)  
**Authentication:** Required (Admin permissions)  
**Rate Limit:** 10 requests per 15 minutes  

---

## 7. Notification Management Endpoints (`/api/v1/notifications`)

### GET `/api/v1/notifications`
**Description:** List notifications with filtering  
**Authentication:** Required (Notification Read permission)  
**Rate Limit:** 50 requests per 15 minutes  

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder` (pagination)
- `type` (string): 'digest_completed', 'job_failed', 'system_alert', 'user_mention'
- `channel` (string): 'email', 'slack', 'web', 'webhook'
- `status` (string): 'pending', 'sent', 'failed', 'read', 'archived'
- `priority` (string): 'low', 'normal', 'high', 'urgent'

**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "type": "digest_completed",
        "channel": "email",
        "status": "sent",
        "subject": "Weekly React Digest Ready",
        "message": "Your digest for React repository is ready",
        "recipient": {
          "id": 1,
          "username": "johndoe"
        },
        "digest": {
          "id": 123,
          "repo": {
            "path": "facebook/react"
          }
        },
        "sentAt": "2024-01-15T10:30:00.000Z",
        "createdAt": "2024-01-15T10:25:00.000Z"
      }
    ],
    "pagination": {...}
  }
}
```

### GET `/api/v1/notifications/:id`
**Description:** Get notification details (owner only)  
**Authentication:** Required (Notification Read permission + ownership)  
**Rate Limit:** Standard  

### PATCH `/api/v1/notifications/:id`
**Description:** Update notification status (owner only)  
**Authentication:** Required (Notification Write permission + ownership)  
**Rate Limit:** 50 requests per 15 minutes  

### DELETE `/api/v1/notifications/:id`
**Description:** Delete notification (owner only)  
**Authentication:** Required (Notification Delete permission + ownership)  
**Rate Limit:** Standard  

### POST `/api/v1/notifications/mark-all-read`
**Description:** Mark all notifications as read  
**Authentication:** Required (Notification Write permission)  
**Rate Limit:** 50 requests per 15 minutes  

### DELETE `/api/v1/notifications/clear-read`
**Description:** Clear all read notifications  
**Authentication:** Required (Notification Delete permission)  
**Rate Limit:** Standard  

### GET `/api/v1/notifications/unread-count`
**Description:** Get count of unread notifications  
**Authentication:** Required (Notification Read permission)  
**Rate Limit:** Standard  

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "byType": {
      "digest_completed": 3,
      "job_failed": 1,
      "system_alert": 1
    },
    "byChannel": {
      "email": 4,
      "web": 1
    }
  }
}
```

### POST `/api/v1/notifications/test-slack`
**Description:** Test Slack notification  
**Authentication:** Required (Notification Write permission)  
**Rate Limit:** 10 requests per hour  

**Request Body:**
```json
{
  "channel": "#general",
  "message": "Test notification from Daily Dev Digest",
  "webhook_url": "https://hooks.slack.com/services/..." // optional
}
```

### POST `/api/v1/notifications/test-email`
**Description:** Test email notification  
**Authentication:** Required (Notification Write permission)  
**Rate Limit:** 10 requests per hour  

**Request Body:**
```json
{
  "to": "user@example.com",
  "subject": "Test Email from Daily Dev Digest",
  "message": "This is a test email notification",
  "html": false
}
```

### GET `/api/v1/notifications/stats`
**Description:** Get notification statistics  
**Authentication:** Required (Notification Read permission)  
**Rate Limit:** Standard  

---

## 8. Job Management Endpoints (Legacy - `/api`)

### GET `/api/jobs`
**Description:** List jobs (legacy endpoint)  
**Authentication:** Required (Job Read permission)  
**Rate Limit:** Standard  

### POST `/api/jobs`
**Description:** Create job (legacy endpoint)  
**Authentication:** Required (Job Write permission)  
**Rate Limit:** Standard  

### GET `/api/jobs/:id`
**Description:** Get job details (legacy endpoint)  
**Authentication:** Required (Job Read permission)  
**Rate Limit:** Standard  

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {...}, // Optional additional details
    "requestId": "req_123456789"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Common Error Codes:
- `VALIDATION_ERROR`: Request data validation failed
- `AUTHENTICATION_REQUIRED`: No valid authentication token provided
- `FORBIDDEN`: User lacks required permissions
- `NOT_FOUND`: Requested resource does not exist
- `CONFLICT`: Resource conflict (e.g., duplicate username)
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `EXTERNAL_SERVICE_ERROR`: External service (GitHub, etc.) error
- `INTERNAL_SERVER_ERROR`: Unexpected server error

### HTTP Status Codes:
- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `202 Accepted`: Request accepted for async processing
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

---

## Rate Limiting

Different endpoints have different rate limits based on their resource intensity:

- **Standard**: 60 requests per minute per user
- **Digest Operations**: 5 requests per 15 minutes
- **Settings Updates**: 10 requests per 15 minutes  
- **User Updates**: 20 requests per 15 minutes
- **Repository Operations**: 30 requests per 15 minutes
- **Notification Operations**: 50 requests per 15 minutes
- **Test Notifications**: 10 requests per hour

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2024-01-15T10:31:00.000Z
```

---

## Permissions and Authorization

The API uses role-based access control (RBAC) with the following roles:

### Roles:
- **user**: Standard user with basic access
- **moderator**: Elevated permissions for content management
- **admin**: Full system access

### Permission Categories:
- **users:*** - User management permissions
- **repos:*** - Repository management permissions  
- **digests:*** - Digest management permissions
- **jobs:*** - Job management permissions
- **settings:*** - Settings management permissions
- **notifications:*** - Notification management permissions
- **system:*** - System administration permissions

### Resource Ownership:
Many endpoints implement ownership checks, allowing users to access/modify only their own resources (digests, notifications, etc.) unless they have admin privileges.

---

## Integration Examples

### Creating and Managing a Digest Workflow:

1. **Add Repository:**
```bash
POST /api/v1/repos
{
  "url": "https://github.com/facebook/react",
  "name": "React"
}
```

2. **Create Digest:**
```bash
POST /api/v1/digests  
{
  "title": "Weekly React Digest",
  "repositories": [1]
}
```

3. **Monitor Progress:**
```bash
GET /api/v1/digests/123
```

4. **Export Results:**
```bash
GET /api/v1/digests/123/export?format=markdown
```

### User Management Workflow:

1. **Get Profile:**
```bash
GET /api/v1/users/me
```

2. **Update Preferences:**
```bash
PATCH /api/v1/users/me/preferences
{
  "frequency": "daily",
  "channels": ["email", "slack"]
}
```

3. **Check Statistics:**
```bash
GET /api/v1/users/me/stats?period=month
```

---

## Development and Testing

### Health Checks:
- Use `/health` for basic status
- Use `/api/v1/health/detailed` for comprehensive service monitoring
- Use `/api/v1/health/readiness` and `/api/v1/health/liveness` for Kubernetes

### Test Notifications:
Use test endpoints to verify notification configurations:
```bash
POST /api/v1/notifications/test-email
POST /api/v1/notifications/test-slack
```

### API Documentation:
Access interactive documentation at `/docs` endpoint.

---

This comprehensive API implementation provides a robust, secure, and scalable foundation for the Daily Dev Digest application with proper error handling, validation, authentication, and monitoring capabilities.