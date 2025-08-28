# Development Setup & Contribution Guide

This guide covers setting up a development environment for Daily Dev Digest, understanding the codebase architecture, and contributing effectively to the project.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Environment](#development-environment)
- [Project Architecture](#project-architecture)
- [Database Development](#database-development)
- [API Development](#api-development)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Debugging](#debugging)
- [Performance](#performance)
- [External Integrations](#external-integrations)
- [Contributing Workflow](#contributing-workflow)
- [Style Guide](#style-guide)

## Quick Start

### Prerequisites

- **Node.js 18+** (required for modern ESM and performance improvements)
- **Bun** ([Installation](https://bun.sh/docs/installation))
- **Git** for version control
- **GitHub Personal Access Token** for testing GitHub integration
- **Optional**: Docker for containerized development

### 5-Minute Setup

```bash
# Clone the repository
git clone <repository-url>
cd digest3

# Install all dependencies (including dev tools)
bun install

# Create environment file
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN and JWT_SECRET

# Initialize database with sample data
bun run db:migrate
bun run db:seed

# Run the application
bun run dev

# Run tests to verify setup
bun test
```

Visit http://localhost:3000 to see the application running.

## Development Environment

### Environment Variables (.env)

For development, create a `.env` file with minimal required settings:

```bash
# Required for basic functionality
JWT_SECRET=dev-secret-key-change-in-production
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NODE_ENV=development
PORT=3000

# Database (SQLite is fine for development)
DATABASE_URL=file:./devdigest_dev.db

# Optional integrations for testing
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email testing (use Gmail app password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your.test.email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
SMTP_FROM_ADDRESS=your.test.email@gmail.com

# Development settings
LOG_LEVEL=DEBUG
```

### IDE Setup

#### VS Code Configuration

Create `.vscode/settings.json`:
```json
{
    "typescript.preferences.includePackageJsonAutoImports": "on",
    "eslint.enable": true,
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.codeActionsOnSave": {
        "source.organizeImports": true,
        "source.fixAll.eslint": true
    },
    "files.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/.next": true
    },
    "typescript.preferences.quoteStyle": "single",
    "javascript.preferences.quoteStyle": "single"
}
```

Create `.vscode/launch.json` for debugging:
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Express App",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}/src/index.ts",
            "env": {
                "NODE_ENV": "development"
            },
            "runtimeArgs": [
                "--loader", "tsx/esm"
            ],
            "console": "integratedTerminal",
            "restart": true,
            "protocol": "inspector"
        },
        {
            "name": "Run Tests",
            "type": "node",
            "request": "launch",
            "program": "${workspaceFolder}/node_modules/.bin/vitest",
            "args": ["run"],
            "console": "integratedTerminal"
        }
    ]
}
```

#### WebStorm Configuration

1. **Node Interpreter**: Set to system Node.js 18+
2. **Code Style**: 
   - Use Prettier for formatting
   - ESLint for linting
3. **Run Configurations**:
   - Express: Script `dev`, Package.json location `${workspaceFolder}/package.json`
   - Tests: Script `test`, Package.json location `${workspaceFolder}/package.json`

### Docker Development

For consistent development environment:

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build: 
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
    env_file:
      - .env
    depends_on:
      - db
      - redis

  db:
    image: postgres:13-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: devdigest_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpass
    volumes:
      - postgres-dev-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres-dev-data:
  node_modules:
```

```dockerfile
# Dockerfile.dev
FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install

# Copy application code
COPY . .

EXPOSE 3000

CMD ["bun", "run", "dev"]
```

## Project Architecture

### Directory Structure

```
digest3/
├── src/                          # Main application source
│   ├── index.ts                  # Application entry point
│   ├── app.ts                    # Express app configuration
│   ├── routes/                   # REST API endpoints
│   │   ├── auth.ts               # Authentication endpoints
│   │   ├── digests.ts            # Digest CRUD operations
│   │   ├── jobs.ts               # Job status and monitoring
│   │   ├── repos.ts              # Repository management
│   │   ├── users.ts              # User management
│   │   ├── notifications.ts     # Notification endpoints
│   │   └── settings.ts          # Application settings
│   ├── clients/                  # External service integrations
│   │   ├── github.ts             # GitHub API client (@octokit/rest)
│   │   ├── slack.ts              # Slack API client
│   │   ├── email.ts              # Email/SMTP client
│   │   ├── openai.ts             # OpenAI API client
│   │   └── linear.ts             # Linear API client (future)
│   ├── lib/                      # Core utilities and middleware
│   │   ├── auth.ts               # Authentication logic (JWT)
│   │   ├── permissions.ts        # Role-based access control
│   │   ├── errors.ts             # Custom error classes
│   │   ├── logger.ts             # Pino logging configuration
│   │   ├── config.ts             # Settings management
│   │   ├── validation.ts         # Zod schemas
│   │   └── utils.ts              # Utility functions
│   ├── db/                       # Database layer
│   │   ├── schema.prisma         # Prisma schema
│   │   ├── client.ts             # Prisma client configuration
│   │   ├── migrations/           # Prisma migrations
│   │   └── seed.ts               # Sample data seeding
│   ├── services/                 # Business logic layer
│   │   ├── auth.ts               # Authentication service
│   │   ├── digests.ts            # Digest generation logic
│   │   ├── jobs.ts               # Job processing service
│   │   ├── notifications.ts     # Notification service
│   │   ├── repos.ts              # Repository service
│   │   └── linear.ts             # Linear integration (future)
│   └── types/                    # TypeScript type definitions
│       ├── api.ts                # API request/response types
│       ├── database.ts           # Database model types
│       └── github.ts             # GitHub API types
├── client/                       # React frontend (optional)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── tests/                        # Test suite
├── package.json                 # Project configuration
├── tsconfig.json                # TypeScript configuration
└── bun.lockb                    # Bun lockfile
```

### Application Layers

#### 1. Routes Layer (`src/routes/`)
- **Purpose**: HTTP request/response handling, input validation, serialization
- **Responsibilities**: 
  - Parse HTTP requests
  - Validate input data using Zod schemas
  - Call service layer functions
  - Format responses as JSON
  - Handle HTTP-specific errors

```typescript
// Example API endpoint structure
router.post('/', requirePermission('trigger_digests'), async (req, res) => {
  try {
    // Parse and validate input
    const requestData = createDigestSchema.parse(req.body);
    
    // Call service layer
    const job = await digestService.createDigestJob({
      repoPath: requestData.repo_path,
      days: requestData.days,
      userId: req.user.id
    });
    
    // Return formatted response
    res.json({
      success: true,
      data: { job_id: job.id, status: job.status }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.errors });
    } else {
      throw error;
    }
  }
});
```

#### 2. Service Layer (`src/services/`)
- **Purpose**: Business logic implementation, orchestration
- **Responsibilities**:
  - Implement core business rules
  - Orchestrate multiple operations
  - Handle business-level errors
  - Call client libraries for external APIs

```typescript
// Example service function
export class DigestService {
  async createDigestJob(params: {
    repoPath: string;
    days: number;
    userId: string;
  }): Promise<Job> {
    // Validate business rules
    const repo = await this.repoService.getByPath(params.repoPath);
    if (!repo || !repo.active) {
      throw new ValidationError('Repository not found or inactive');
    }
    
    // Create job record
    const job = await prisma.job.create({
      data: {
        type: 'digest',
        repoId: repo.id,
        createdById: params.userId,
        params: JSON.stringify({ days: params.days }),
        status: JobStatus.PENDING
      }
    });
    
    // Queue for processing
    await this.jobQueue.enqueue('processDigestJob', job.id);
    
    return job;
  }
}
```

#### 3. Database Layer (`src/db/`)
- **Purpose**: Database models, queries, migrations
- **Responsibilities**:
  - Define data structures with Prisma schema
  - Handle database operations via Prisma client
  - Manage relationships
  - Database migrations via Prisma

#### 4. Client Layer (`src/clients/`)
- **Purpose**: External service integration
- **Responsibilities**:
  - Handle API authentication
  - Parse external API responses with proper typing
  - Handle rate limiting and retries
  - Abstract external service details

### Design Patterns

#### Repository Pattern
```python
class DigestRepository:
    def __init__(self, db_session):
        self.db = db_session
    
    def create(self, digest_data: dict) -> Digest:
        digest = Digest(**digest_data)
        self.db.add(digest)
        self.db.commit()
        return digest
    
    def get_by_id(self, digest_id: int) -> Optional[Digest]:
        return self.db.query(Digest).filter(Digest.id == digest_id).first()
    
    def get_by_repo(self, repo_id: int, limit: int = 20) -> List[Digest]:
        return (self.db.query(Digest)
                .filter(Digest.repo_id == repo_id)
                .order_by(Digest.created_at.desc())
                .limit(limit)
                .all())
```

#### Factory Pattern
```python
class ClientFactory:
    @staticmethod
    def create_github_client(token: str) -> GitHubClient:
        return GitHubClient(token)
    
    @staticmethod
    def create_slack_client(token: str) -> SlackClient:
        if not token:
            return MockSlackClient()  # For development
        return SlackClient(token)
```

## Database Development

### Model Development

#### Creating New Models
```python
# In app/data/models.py
class NewModel(Base):
    __tablename__ = 'new_models'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user_id = Column(Integer, ForeignKey('users.id'))
    user = relationship("User", back_populates="new_models")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_new_model_name', 'name'),
        Index('idx_new_model_user', 'user_id'),
    )
    
    def __repr__(self):
        return f"<NewModel {self.name}>"

# Add reverse relationship to User model
# In User class:
new_models = relationship("NewModel", back_populates="user")
```

#### Database Migrations
```python
# Create migration
uv run python -m app.data.migrations create "add_new_model_table"

# Generated migration file
"""add_new_model_table

Revision ID: abc123
Revises: def456
Create Date: 2024-01-15 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'new_models',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_new_model_name', 'new_models', ['name'])
    op.create_index('idx_new_model_user', 'new_models', ['user_id'])

def downgrade():
    op.drop_index('idx_new_model_user', table_name='new_models')
    op.drop_index('idx_new_model_name', table_name='new_models')
    op.drop_table('new_models')

# Apply migration
uv run python -m app.data.migrations upgrade
```

### Database Testing

```python
# tests/test_models.py
import pytest
from app.data.models import User, Digest, Job
from app.data.db import db

def test_user_creation(db_session):
    user = User(
        username='testuser',
        email='test@example.com',
        password_hash='hashed_password'
    )
    db_session.add(user)
    db_session.commit()
    
    assert user.id is not None
    assert user.username == 'testuser'

def test_digest_relationships(db_session):
    # Create test data
    user = User(username='creator', email='creator@test.com')
    repo = Repo(path='test/repo', name='Test Repo')
    digest = Digest(
        repo=repo,
        created_by=user,
        date_from=datetime.now(timezone.utc) - timedelta(days=7),
        date_to=datetime.now(timezone.utc),
        summary_md='Test digest',
        summary_html='<p>Test digest</p>',
        stats_json={'total_prs': 5}
    )
    
    db_session.add_all([user, repo, digest])
    db_session.commit()
    
    # Test relationships
    assert digest.repo == repo
    assert digest.created_by == user
    assert repo.digests[0] == digest
```

## API Development

### Creating New Endpoints

#### 1. Define Request/Response Models
```python
# In api endpoint file
from pydantic import BaseModel, Field, validator
from typing import Optional, List

class CreateItemRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: List[str] = Field(default=[], max_items=10)
    
    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()

class ItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: str
    
    class Config:
        orm_mode = True
```

#### 2. Implement Endpoint
```python
@items_bp.route('', methods=['POST'])
@require_permission('create_items')
def create_item():
    """Create a new item."""
    try:
        # Validate input
        request_data = CreateItemRequest(**request.json)
        
        # Call service
        item = item_service.create_item(
            name=request_data.name,
            description=request_data.description,
            tags=request_data.tags,
            user_id=g.current_user.id
        )
        
        # Format response
        response_data = ItemResponse.from_orm(item)
        return jsonify({
            'success': True,
            'data': response_data.dict()
        }), 201
        
    except ValidationError as e:
        return jsonify({
            'success': False,
            'error': {'code': 'VALIDATION_ERROR', 'message': str(e)}
        }), 400
    except ServiceError as e:
        return jsonify({
            'success': False,
            'error': {'code': e.code, 'message': e.message}
        }), e.status_code
```

#### 3. Add Tests
```python
# tests/test_api_items.py
def test_create_item_success(client, auth_headers):
    response = client.post('/api/v1/items', 
                          json={
                              'name': 'Test Item',
                              'description': 'Test description',
                              'tags': ['test', 'api']
                          },
                          headers=auth_headers)
    
    assert response.status_code == 201
    data = response.get_json()
    assert data['success'] is True
    assert data['data']['name'] == 'Test Item'

def test_create_item_validation_error(client, auth_headers):
    response = client.post('/api/v1/items',
                          json={'name': ''},  # Invalid empty name
                          headers=auth_headers)
    
    assert response.status_code == 400
    data = response.get_json()
    assert data['success'] is False
    assert 'VALIDATION_ERROR' in data['error']['code']
```

### Authentication & Permissions

#### Permission Decorator
```python
# app/core/permissions.py
from functools import wraps
from flask import g, jsonify

def require_permission(permission: str):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not g.current_user:
                return jsonify({'error': 'Authentication required'}), 401
            
            if not g.current_user.has_permission(permission):
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Usage in API endpoints
@require_permission('manage_repos')
def delete_repository(repo_id):
    # Implementation
    pass
```

## Frontend Development

### HTMX Integration

#### Dynamic Content Loading
```html
<!-- templates/dashboard.html -->
<div id="digest-list" 
     hx-get="/api/v1/digests?format=html"
     hx-trigger="load, every 30s"
     hx-indicator="#loading">
    <!-- Content loaded via HTMX -->
</div>

<div id="loading" class="htmx-indicator">
    <div class="spinner">Loading...</div>
</div>
```

#### Form Handling
```html
<!-- templates/partials/create_digest_form.html -->
<form hx-post="/api/v1/digests"
      hx-target="#digest-results"
      hx-swap="innerHTML"
      hx-indicator="#form-loading">
    
    <select name="repo_path" required>
        {% for repo in repositories %}
        <option value="{{ repo.path }}">{{ repo.name }}</option>
        {% endfor %}
    </select>
    
    <input type="number" name="days" value="7" min="1" max="90">
    
    <button type="submit">
        <span class="button-text">Create Digest</span>
        <span id="form-loading" class="htmx-indicator">Processing...</span>
    </button>
</form>
```

#### Real-time Updates
```javascript
// static/js/app.js
// Job status polling
function pollJobStatus(jobId) {
    const statusElement = document.getElementById(`job-${jobId}`);
    
    const poll = () => {
        htmx.ajax('GET', `/api/v1/jobs/${jobId}/status`, {
            target: `#job-${jobId}`,
            swap: 'innerHTML'
        }).then(response => {
            const status = response.data.status;
            if (status === 'COMPLETED' || status === 'FAILED') {
                clearInterval(pollInterval);
                // Refresh digest list
                htmx.trigger('#digest-list', 'refresh');
            }
        });
    };
    
    const pollInterval = setInterval(poll, 5000);
    poll(); // Initial poll
}
```

### Template Development

#### Base Template
```html
<!-- templates/base.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}Daily Dev Digest{% endblock %}</title>
    
    <!-- CSS Framework (using Tailwind via CDN for simplicity) -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- HTMX -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    
    <!-- Custom styles -->
    <link rel="stylesheet" href="{{ url_for('static', filename='css/app.css') }}">
</head>
<body class="bg-gray-50">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm">
        <!-- Navigation content -->
    </nav>
    
    <!-- Main content -->
    <main class="container mx-auto px-4 py-8">
        {% block content %}{% endblock %}
    </main>
    
    <!-- Toast notifications -->
    <div id="notifications" class="fixed top-4 right-4 z-50">
        <!-- Toast messages appear here -->
    </div>
    
    <!-- Custom JavaScript -->
    <script src="{{ url_for('static', filename='js/app.js') }}"></script>
</body>
</html>
```

## Testing

### Test Structure

```
tests/
├── conftest.py              # Test configuration and fixtures
├── test_api.py              # API endpoint tests
├── test_services.py         # Business logic tests
├── test_models.py           # Database model tests
├── test_clients.py          # External client tests
├── test_integration.py      # End-to-end integration tests
└── fixtures/               # Test data files
    ├── github_pr_data.json
    └── sample_digests.json
```

### Test Fixtures

```python
# tests/conftest.py
import pytest
from app.factory import create_app
from app.data.db import db
from app.data.models import User, Repo, Role

@pytest.fixture(scope='session')
def app():
    """Create application for testing."""
    app = create_app('testing')
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()

@pytest.fixture
def db_session(app):
    """Create database session for testing."""
    with app.app_context():
        connection = db.engine.connect()
        transaction = connection.begin()
        
        # Configure session to use connection
        session = db.session
        session.configure(bind=connection, binds={})
        
        yield session
        
        transaction.rollback()
        connection.close()

@pytest.fixture
def sample_user(db_session):
    """Create a sample user for testing."""
    user = User(
        username='testuser',
        email='test@example.com',
        password_hash='hashed_password'
    )
    db_session.add(user)
    db_session.commit()
    return user

@pytest.fixture
def auth_headers(sample_user, client):
    """Create authentication headers for API testing."""
    # Login user and get session
    with client.session_transaction() as sess:
        sess['user_id'] = sample_user.id
    
    return {'Content-Type': 'application/json'}
```

### Unit Tests

```python
# tests/test_services.py
import pytest
from unittest.mock import Mock, patch
from app.services.digests import DigestService
from app.data.models import Digest, Repo

class TestDigestService:
    def test_create_digest_job(self, db_session):
        """Test digest job creation."""
        # Setup
        repo = Repo(path='test/repo', name='Test Repo', active=True)
        db_session.add(repo)
        db_session.commit()
        
        service = DigestService(db_session)
        
        # Test
        job = service.create_digest_job('test/repo', days=7, user_id=1)
        
        # Assertions
        assert job.type == 'digest'
        assert job.repo_id == repo.id
        assert job.params['days'] == 7
        assert job.status == 'PENDING'

    @patch('app.clients.github.GitHubClient')
    def test_generate_digest_success(self, mock_github, db_session):
        """Test successful digest generation."""
        # Mock GitHub client
        mock_github.return_value.get_pull_requests.return_value = [
            {'title': 'Test PR', 'number': 1, 'merged': True}
        ]
        
        # Setup test data
        repo = Repo(path='test/repo', name='Test Repo')
        job = Job(type='digest', repo=repo, params={'days': 7})
        db_session.add_all([repo, job])
        db_session.commit()
        
        # Test
        service = DigestService(db_session)
        digest = service.generate_digest(job.id)
        
        # Assertions
        assert digest is not None
        assert 'Test PR' in digest.summary_md
        assert digest.stats['total_prs'] == 1
```

### Integration Tests

```python
# tests/test_integration.py
def test_complete_digest_workflow(client, auth_headers, db_session):
    """Test complete digest creation workflow."""
    # Create repository
    repo = Repo(path='facebook/react', name='React', active=True)
    db_session.add(repo)
    db_session.commit()
    
    # Create digest job
    response = client.post('/api/v1/digests',
                          json={'repo_path': 'facebook/react', 'days': 7},
                          headers=auth_headers)
    
    assert response.status_code == 200
    job_id = response.get_json()['data']['job_id']
    
    # Check job status
    response = client.get(f'/api/v1/jobs/{job_id}', headers=auth_headers)
    assert response.status_code == 200
    
    # Mock job completion (in real scenario, this would be processed by worker)
    # ... test job processing logic ...
    
    # Verify digest was created
    response = client.get('/api/v1/digests', headers=auth_headers)
    assert response.status_code == 200
    digests = response.get_json()['data']
    assert len(digests) > 0
```

### Mock External Services

```python
# tests/mocks.py
class MockGitHubClient:
    def __init__(self, token):
        self.token = token
    
    def get_pull_requests(self, repo_path, since, until):
        """Mock PR data."""
        return [
            {
                'number': 12345,
                'title': 'Add new feature',
                'user': {'login': 'developer1'},
                'merged_at': '2024-01-15T10:30:00Z',
                'additions': 150,
                'deletions': 25,
                'changed_files': 5
            }
        ]
    
    def get_repository(self, repo_path):
        """Mock repository data."""
        return {
            'full_name': repo_path,
            'description': 'Test repository',
            'language': 'Python',
            'stargazers_count': 1000
        }

# Use in tests
@patch('app.clients.github.GitHubClient', MockGitHubClient)
def test_with_mock_github():
    # Test implementation
    pass
```

## Code Quality

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.12.1
    hooks:
      - id: black
        args: [--line-length=100]
        
  - repo: https://github.com/charliermarsh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]
        
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, types-redis]
        
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-merge-conflict

# Install hooks
pre-commit install
```

### Type Checking

```python
# Example with proper type hints
from typing import Optional, List, Dict, Any, Union
from datetime import datetime

def create_digest_summary(
    prs: List[Dict[str, Any]],
    repo_name: str,
    date_range: tuple[datetime, datetime],
    include_stats: bool = True
) -> Dict[str, Union[str, Dict[str, int]]]:
    """Generate digest summary from PR data.
    
    Args:
        prs: List of pull request data dictionaries
        repo_name: Name of the repository
        date_range: Tuple of (start_date, end_date)
        include_stats: Whether to include statistics
        
    Returns:
        Dictionary containing summary markdown and optional stats
        
    Raises:
        ValueError: If PR data is invalid
    """
    if not prs:
        raise ValueError("No pull requests provided")
    
    summary = generate_markdown_summary(prs, repo_name, date_range)
    result: Dict[str, Union[str, Dict[str, int]]] = {"summary": summary}
    
    if include_stats:
        result["stats"] = calculate_pr_stats(prs)
    
    return result
```

### Documentation Standards

```python
class DigestService:
    """Service for managing digest generation and processing.
    
    This service handles the complete lifecycle of digest creation,
    from job queuing to final notification delivery.
    
    Attributes:
        db_session: Database session for data operations
        github_client: Client for GitHub API interactions
        job_queue: Queue for background job processing
        
    Example:
        >>> service = DigestService(db.session)
        >>> job = service.create_digest_job('facebook/react', days=7)
        >>> digest = service.process_job(job.id)
    """
    
    def __init__(self, db_session, github_client=None):
        """Initialize the digest service.
        
        Args:
            db_session: SQLAlchemy database session
            github_client: Optional GitHub client (auto-created if None)
        """
        self.db_session = db_session
        self.github_client = github_client or self._create_github_client()
    
    def create_digest_job(
        self, 
        repo_path: str, 
        days: int,
        user_id: int,
        options: Optional[Dict[str, Any]] = None
    ) -> Job:
        """Create a new digest generation job.
        
        Args:
            repo_path: Repository path in 'owner/name' format
            days: Number of days to include in digest (1-90)
            user_id: ID of user creating the digest
            options: Optional parameters like AI summary, notifications
            
        Returns:
            Job instance with PENDING status
            
        Raises:
            ValidationError: If repository is invalid or inactive
            PermissionError: If user lacks necessary permissions
            
        Example:
            >>> job = service.create_digest_job('facebook/react', 14, user.id)
            >>> assert job.status == JobStatus.PENDING
        """
        # Implementation...
```

## Performance

### Database Query Optimization

```python
# Bad: N+1 query problem
def get_digests_with_repos_bad():
    digests = db.session.query(Digest).all()
    for digest in digests:
        print(f"{digest.repo.name}: {digest.summary_md[:100]}")  # Each access hits DB

# Good: Eager loading
def get_digests_with_repos_good():
    digests = (db.session.query(Digest)
               .options(joinedload(Digest.repo))
               .all())
    for digest in digests:
        print(f"{digest.repo.name}: {digest.summary_md[:100]}")  # No additional queries

# Even better: Specific fields only
def get_digest_summaries():
    results = (db.session.query(Digest.id, Digest.summary_md, Repo.name)
               .join(Repo)
               .all())
    return [{'id': r.id, 'repo': r.name, 'summary': r.summary_md[:100]} 
            for r in results]
```

### Caching Strategy

```python
from functools import lru_cache
from flask_caching import Cache

# Method-level caching
@lru_cache(maxsize=128)
def get_repository_metadata(repo_path: str) -> dict:
    """Cache expensive repository lookups."""
    return github_client.get_repository(repo_path)

# Flask-Cache integration
cache = Cache(app)

@cache.memoize(timeout=3600)  # 1 hour cache
def get_digest_statistics(repo_id: int, days: int) -> dict:
    """Cache digest statistics calculations."""
    return calculate_repository_stats(repo_id, days)

# Cache invalidation
def update_repository(repo_id: int, **updates):
    repo = db.session.query(Repo).get(repo_id)
    for key, value in updates.items():
        setattr(repo, key, value)
    db.session.commit()
    
    # Invalidate related caches
    cache.delete(f'repo_stats_{repo_id}')
    cache.delete_memoized(get_digest_statistics, repo_id)
```

### Background Job Processing

```python
# app/services/jobs.py
import asyncio
from concurrent.futures import ThreadPoolExecutor

class JobProcessor:
    def __init__(self, max_workers=4):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.running_jobs = set()
    
    def process_job_async(self, job_id: int):
        """Process job in background thread."""
        if job_id in self.running_jobs:
            return False  # Already processing
        
        self.running_jobs.add(job_id)
        future = self.executor.submit(self._process_job, job_id)
        future.add_done_callback(lambda f: self.running_jobs.discard(job_id))
        return True
    
    def _process_job(self, job_id: int):
        """Actual job processing logic."""
        try:
            job = db.session.query(Job).get(job_id)
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            db.session.commit()
            
            # Process based on job type
            if job.type == 'digest':
                result = self._process_digest_job(job)
            else:
                raise ValueError(f"Unknown job type: {job.type}")
            
            job.status = JobStatus.COMPLETED
            job.finished_at = datetime.now(timezone.utc)
            job.digest_id = result.id if result else None
            
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.finished_at = datetime.now(timezone.utc)
            logger.exception(f"Job {job_id} failed")
        
        finally:
            db.session.commit()
```

## Debugging

### Logging Configuration

```python
# app/core/logger.py
import logging
import sys
from typing import Any, Dict
from flask import request, g

class ContextualFormatter(logging.Formatter):
    """Add request context to log messages."""
    
    def format(self, record):
        # Add request context if available
        if request:
            record.request_id = getattr(request, 'request_id', 'unknown')
            record.method = request.method
            record.path = request.path
            record.user_id = getattr(g, 'current_user', {}).get('id', 'anonymous')
        
        return super().format(record)

def setup_development_logging():
    """Configure logging for development."""
    formatter = ContextualFormatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s '
        '[%(request_id)s] %(method)s %(path)s (user=%(user_id)s)'
    )
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(handler)
    
    # Reduce noise from external libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
```

### Debug Tools

```python
# app/core/debug.py
import time
import functools
from flask import current_app

def debug_performance(func):
    """Decorator to measure function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if not current_app.debug:
            return func(*args, **kwargs)
        
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        
        current_app.logger.debug(
            f"PERF: {func.__name__} took {end_time - start_time:.3f}s"
        )
        return result
    return wrapper

def debug_sql_queries(func):
    """Decorator to log SQL queries during function execution."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        if not current_app.debug:
            return func(*args, **kwargs)
        
        # Enable SQL query logging
        logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
        
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            # Restore original logging level
            logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
    
    return wrapper

# Usage
@debug_performance
@debug_sql_queries
def expensive_database_operation():
    # Function implementation
    pass
```

### Interactive Debugging

```python
# Add to development routes
@app.route('/debug/shell')
def debug_shell():
    """Interactive shell for debugging (development only)."""
    if not app.debug:
        abort(404)
    
    import code
    import sys
    from app.data.db import db
    from app.data.models import *
    
    # Setup shell context
    shell_context = {
        'app': app,
        'db': db,
        'User': User,
        'Repo': Repo,
        'Digest': Digest,
        'Job': Job
    }
    
    # Start interactive shell
    code.interact(local=shell_context)
```

## External Integrations

### GitHub API Development

```python
# app/clients/github.py - Development considerations
class GitHubClient:
    def __init__(self, token: str, base_url: str = None):
        self.token = token
        self.base_url = base_url or "https://api.github.com"
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json'
        })
    
    def get_pull_requests(self, repo_path: str, since: datetime, until: datetime):
        """Get PR data with rate limit handling."""
        params = {
            'state': 'all',
            'sort': 'updated',
            'direction': 'desc',
            'per_page': 100
        }
        
        prs = []
        page = 1
        
        while True:
            params['page'] = page
            response = self._make_request(f'/repos/{repo_path}/pulls', params)
            
            if not response:
                break
            
            # Filter by date range
            for pr in response:
                pr_date = datetime.fromisoformat(pr['updated_at'].replace('Z', '+00:00'))
                if pr_date < since:
                    return prs  # PRs are sorted by update date
                if pr_date <= until:
                    prs.append(pr)
            
            page += 1
            
            # Respect rate limits
            self._handle_rate_limit()
        
        return prs
    
    def _make_request(self, endpoint: str, params: dict = None):
        """Make API request with error handling."""
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = self.session.get(url, params=params)
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.HTTPError as e:
            if response.status_code == 404:
                logger.warning(f"Repository not found: {endpoint}")
                return None
            elif response.status_code == 403:
                logger.error("GitHub API rate limit exceeded")
                raise RateLimitError("GitHub API rate limit exceeded")
            else:
                logger.error(f"GitHub API error: {e}")
                raise GitHubAPIError(f"API request failed: {e}")
        
        except requests.exceptions.RequestException as e:
            logger.error(f"GitHub API connection error: {e}")
            raise GitHubConnectionError(f"Connection failed: {e}")
    
    def _handle_rate_limit(self):
        """Check and handle rate limiting."""
        response = self.session.get(f"{self.base_url}/rate_limit")
        rate_limit = response.json()
        
        remaining = rate_limit['resources']['core']['remaining']
        reset_time = rate_limit['resources']['core']['reset']
        
        if remaining < 10:  # Low on requests
            sleep_time = reset_time - time.time() + 1
            logger.info(f"Rate limit low, sleeping {sleep_time}s")
            time.sleep(max(0, sleep_time))
```

### Testing External APIs

```python
# tests/test_github_client.py
import responses
import json
from app.clients.github import GitHubClient

class TestGitHubClient:
    @responses.activate
    def test_get_pull_requests_success(self):
        """Test successful PR retrieval."""
        # Mock API response
        responses.add(
            responses.GET,
            'https://api.github.com/repos/test/repo/pulls',
            json=[
                {
                    'number': 1,
                    'title': 'Test PR',
                    'updated_at': '2024-01-15T10:30:00Z',
                    'merged_at': '2024-01-15T11:00:00Z'
                }
            ],
            status=200
        )
        
        # Test
        client = GitHubClient('fake-token')
        prs = client.get_pull_requests('test/repo', 
                                     since=datetime(2024, 1, 1),
                                     until=datetime(2024, 1, 16))
        
        # Assertions
        assert len(prs) == 1
        assert prs[0]['title'] == 'Test PR'
    
    @responses.activate
    def test_rate_limit_handling(self):
        """Test rate limit error handling."""
        responses.add(
            responses.GET,
            'https://api.github.com/repos/test/repo/pulls',
            json={'message': 'API rate limit exceeded'},
            status=403
        )
        
        client = GitHubClient('fake-token')
        
        with pytest.raises(RateLimitError):
            client.get_pull_requests('test/repo',
                                   since=datetime(2024, 1, 1),
                                   until=datetime(2024, 1, 16))
```

## Contributing Workflow

### Branch Strategy

```bash
# Feature development
git checkout main
git pull origin main
git checkout -b feature/add-linear-integration

# Work on feature
git add .
git commit -m "Add Linear API client"
git push origin feature/add-linear-integration

# Create pull request via GitHub CLI
gh pr create --title "Add Linear Integration" --body "Implements Linear API client for issue tracking integration"

# After review and approval
gh pr merge --squash
```

### Commit Message Format

```
type(scope): brief description

More detailed explanation if needed. Wrap at 72 characters.

- List changes if multiple
- Use bullet points for clarity

Closes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(api): add Linear integration endpoints

Implements POST /api/v1/linear/sync for synchronizing issues
and pull requests between GitHub and Linear.

- Add Linear API client
- Create sync service
- Add background job processing
- Update database models

Closes #45

fix(auth): handle expired JWT tokens correctly

Previously, expired tokens would cause 500 errors. Now they
return proper 401 Unauthorized responses.

test(services): add comprehensive digest service tests

Covers edge cases for repository validation, job processing,
and error handling scenarios.
```

### Code Review Checklist

#### For Authors:
- [ ] All tests pass (`uv run pytest`)
- [ ] Code follows style guide (`uv run black`, `uv run ruff`)
- [ ] Type hints are complete (`uv run mypy`)
- [ ] Documentation is updated
- [ ] Migration scripts included if needed
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] Error handling implemented
- [ ] Logging added for debugging

#### For Reviewers:
- [ ] Code solves the stated problem
- [ ] Implementation is clean and maintainable
- [ ] Edge cases are handled
- [ ] Tests cover the functionality
- [ ] Security vulnerabilities checked
- [ ] Performance implications acceptable
- [ ] Documentation is clear
- [ ] API changes are backwards compatible
- [ ] Database changes are safe

### Development Workflow Summary

1. **Setup**: Clone repo, create virtual environment, install dependencies
2. **Feature Branch**: Create feature branch from main
3. **Development**: Write code with tests, ensure quality checks pass
4. **Testing**: Run full test suite, manual testing
5. **Documentation**: Update relevant documentation
6. **Pull Request**: Create PR with clear description
7. **Review**: Address feedback, make necessary changes
8. **Merge**: Squash and merge after approval
9. **Cleanup**: Delete feature branch, update local main

This development guide provides everything needed to contribute effectively to the Daily Dev Digest project, from initial setup through production deployment.