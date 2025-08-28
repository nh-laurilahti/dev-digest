# Production Deployment Guide

This guide covers deploying Daily Dev Digest to production environments with best practices for security, performance, and reliability.

## Table of Contents

- [Deployment Options](#deployment-options)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Container Deployment](#container-deployment)
- [Cloud Platform Guides](#cloud-platform-guides)
- [Load Balancing & Scaling](#load-balancing--scaling)
- [Security Configuration](#security-configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Backup & Recovery](#backup--recovery)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

## Deployment Options

### 1. Docker Container (Recommended)
- **Best for**: Most production environments
- **Pros**: Consistent, isolated, easy to scale
- **Cons**: Requires container orchestration knowledge

### 2. Cloud Platform (PaaS)
- **Best for**: Quick deployment, managed infrastructure
- **Platforms**: Heroku, Railway, Render, DigitalOcean App Platform
- **Pros**: Minimal configuration, automatic scaling
- **Cons**: Platform lock-in, potentially higher costs

### 3. Virtual Machine / VPS
- **Best for**: Full control, custom configurations
- **Pros**: Complete control, cost-effective
- **Cons**: More maintenance, manual scaling

### 4. Kubernetes
- **Best for**: Large-scale, enterprise deployments
- **Pros**: Auto-scaling, high availability, cloud-native
- **Cons**: Complex setup, requires K8s expertise

## Prerequisites

### System Requirements
- **CPU**: 2+ cores recommended
- **Memory**: 4GB+ RAM recommended
- **Storage**: 20GB+ available space
- **Network**: Outbound HTTPS access to GitHub, Slack, OpenAI APIs

### Required Services
- **Database**: PostgreSQL 13+ or SQLite (development only)
- **Optional**: Redis (for enhanced rate limiting and caching)
- **Optional**: Reverse proxy (Nginx, Traefik, CloudFlare)

### External Dependencies
- **GitHub Personal Access Token** with repo access
- **SMTP Server** or email service (Gmail, SendGrid, etc.)
- **Slack App** credentials (for Slack notifications)
- **OpenAI API Key** (for AI-powered summaries)

## Environment Configuration

### Production Environment Variables

Create a secure `.env` file or use your platform's environment variable system:

```bash
# Application Core
NODE_ENV=production
JWT_SECRET=your-super-secure-secret-key-min-32-chars
PORT=3000

# Database (PostgreSQL recommended for production)
DATABASE_URL=postgresql://user:password@db-host:5432/devdigest

# GitHub Integration
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# AI Features (Optional)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Slack Integration (Optional)
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_CLIENT_ID=xxxxxxxxx.xxxxxxxxx
SLACK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-app@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
SMTP_FROM_ADDRESS=digest@yourcompany.com

# Performance & Caching
REDIS_URL=redis://redis-host:6379/0

# Security
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Strict

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxxxx
LOG_LEVEL=INFO
```

### Security Best Practices

1. **Secret Management**:
   ```bash
   # Generate secure secret key
   uv run python -c "import secrets; print(secrets.token_urlsafe(32))"
   
   # Use environment-specific secret management
   # - Kubernetes Secrets
   # - Docker Secrets
   # - Cloud provider secret stores (AWS Secrets Manager, etc.)
   ```

2. **Environment Isolation**:
   ```bash
   # Never use development secrets in production
   # Use separate GitHub tokens, Slack apps, etc.
   # Implement proper environment separation
   ```

## Database Setup

### PostgreSQL Production Setup

#### 1. Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 2. Create Database and User
```sql
-- Connect as postgres user
sudo -u postgres psql

-- Create database
CREATE DATABASE devdigest;

-- Create user
CREATE USER devdigest_user WITH PASSWORD 'secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE devdigest TO devdigest_user;

-- Create extensions (if needed)
\c devdigest
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

#### 3. Configure PostgreSQL
Edit `/etc/postgresql/13/main/postgresql.conf`:
```ini
# Connection settings
listen_addresses = 'localhost'  # or '*' for remote connections
max_connections = 200

# Memory settings (adjust based on available RAM)
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB

# Performance settings
random_page_cost = 1.1  # for SSD storage
effective_io_concurrency = 200

# Logging
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_statement = 'all'  # Set to 'none' in production
```

#### 4. Database Migration
```bash
# Run migrations
uv run python -m app.data.migrations upgrade

# Verify setup
uv run python -c "
from app.factory import create_app
from app.data.db import db
app = create_app('production')
with app.app_context():
    db.engine.execute('SELECT 1')
    print('Database connection successful')
"
```

### Cloud Database Options

#### Amazon RDS
```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier devdigest-prod \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username devdigest \
  --master-user-password <secure-password> \
  --allocated-storage 20 \
  --storage-type gp2 \
  --vpc-security-group-ids sg-xxxxxxxxx

# Connection string format
DATABASE_URL=postgresql://devdigest:<password>@devdigest-prod.xxxxxxxxx.us-east-1.rds.amazonaws.com:5432/postgres
```

#### Google Cloud SQL
```bash
# Create Cloud SQL instance
gcloud sql instances create devdigest-prod \
  --database-version=POSTGRES_13 \
  --cpu=2 \
  --memory=7680MB \
  --region=us-central1

# Create database
gcloud sql databases create devdigest --instance=devdigest-prod

# Connection format
DATABASE_URL=postgresql://user:password@/devdigest?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_ID
```

## Container Deployment

### Docker Production Build

#### Optimized Dockerfile
The provided `Dockerfile` is already production-ready with:
- Multi-stage build for smaller images
- Non-root user for security
- Health checks
- Optimized layers

#### Build and Tag
```bash
# Build production image
docker build -t daily-dev-digest:v1.0.0 .

# Tag for registry
docker tag daily-dev-digest:v1.0.0 your-registry.com/daily-dev-digest:v1.0.0

# Push to registry
docker push your-registry.com/daily-dev-digest:v1.0.0
```

### Docker Compose Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    image: your-registry.com/daily-dev-digest:v1.0.0
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - FLASK_ENV=production
      - DATABASE_URL=postgresql://devdigest:${DB_PASSWORD}@db:5432/devdigest
    env_file:
      - .env.production
    depends_on:
      - db
      - redis
    volumes:
      - app-logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:13-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: devdigest
      POSTGRES_USER: devdigest
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devdigest"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app

volumes:
  postgres-data:
  redis-data:
  app-logs:
```

### Nginx Configuration

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:5000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    server {
        listen 80;
        server_name yourapp.com www.yourapp.com;
        
        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourapp.com www.yourapp.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Static files
        location /static/ {
            alias /app/app/ui/static/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # API endpoints with rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Auth endpoints with stricter rate limiting
        location /api/v1/auth/ {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Main application
        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support (if needed)
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Health check
        location /health {
            proxy_pass http://app;
            access_log off;
        }
    }
}
```

## Cloud Platform Guides

### Heroku Deployment

#### 1. Prepare Application
```bash
# Create Procfile
echo "web: uv run python -m gunicorn --bind 0.0.0.0:\$PORT app.wsgi:application" > Procfile

# Create runtime.txt
echo "python-3.11.0" > runtime.txt

# Ensure requirements.txt exists (or use pyproject.toml)
uv export --format requirements-txt > requirements.txt
```

#### 2. Deploy to Heroku
```bash
# Install Heroku CLI and login
heroku login

# Create app
heroku create your-app-name

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini

# Add Redis addon (optional)
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secure-secret-key
heroku config:set GITHUB_TOKEN=your-github-token
# ... set all other required env vars

# Deploy
git push heroku main

# Run migrations
heroku run bun run db:migrate:deploy

# Open app
heroku open
```

### DigitalOcean App Platform

#### app.yaml
```yaml
name: daily-dev-digest
region: nyc

services:
- name: web
  source_dir: /
  github:
    repo: your-username/daily-dev-digest
    branch: main
    deploy_on_push: true
  
  run_command: uv run python -m gunicorn --bind 0.0.0.0:8080 app.wsgi:application
  
  environment_slug: python
  instance_count: 1
  instance_size_slug: basic-xxs
  
  health_check:
    http_path: /health
  
  envs:
  - key: FLASK_ENV
    value: production
  - key: DATABASE_URL
    value: ${db.DATABASE_URL}
  - key: SECRET_KEY
    value: your-secret-key
    type: SECRET
  - key: GITHUB_TOKEN
    value: your-github-token
    type: SECRET

databases:
- name: db
  engine: PG
  version: "13"
  size: db-s-dev-database
```

### AWS ECS Deployment

#### Task Definition
```json
{
  "family": "daily-dev-digest",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "your-registry.com/daily-dev-digest:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {"name": "FLASK_ENV", "value": "production"},
        {"name": "DATABASE_URL", "value": "postgresql://..."}
      ],
      "secrets": [
        {
          "name": "SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:digest-secrets:SECRET_KEY::"
        },
        {
          "name": "GITHUB_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:digest-secrets:GITHUB_TOKEN::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/daily-dev-digest",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

## Kubernetes Deployment

### Namespace and ConfigMap
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: daily-dev-digest

---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: daily-dev-digest
data:
  FLASK_ENV: "production"
  FLASK_DEBUG: "false"
  LOG_LEVEL: "INFO"
```

### Secrets
```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: daily-dev-digest
type: Opaque
data:
  SECRET_KEY: <base64-encoded-secret>
  GITHUB_TOKEN: <base64-encoded-token>
  DATABASE_URL: <base64-encoded-url>
  OPENAI_API_KEY: <base64-encoded-key>
```

### Deployment
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: daily-dev-digest
  namespace: daily-dev-digest
spec:
  replicas: 3
  selector:
    matchLabels:
      app: daily-dev-digest
  template:
    metadata:
      labels:
        app: daily-dev-digest
    spec:
      containers:
      - name: app
        image: your-registry.com/daily-dev-digest:v1.0.0
        ports:
        - containerPort: 5000
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
        
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: daily-dev-digest-service
  namespace: daily-dev-digest
spec:
  selector:
    app: daily-dev-digest
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5000
  type: ClusterIP

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: daily-dev-digest-ingress
  namespace: daily-dev-digest
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - yourapp.com
    secretName: tls-secret
  rules:
  - host: yourapp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: daily-dev-digest-service
            port:
              number: 80
```

## Security Configuration

### SSL/TLS Setup

#### Let's Encrypt with Certbot
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d yourapp.com -d www.yourapp.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### Manual SSL Certificate
```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate CSR
openssl req -new -key private.key -out certificate.csr

# Install certificate files
sudo cp certificate.crt /etc/ssl/certs/
sudo cp private.key /etc/ssl/private/
sudo chmod 600 /etc/ssl/private/private.key
```

### Firewall Configuration
```bash
# Ubuntu/Debian (UFW)
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### Application Security

#### Content Security Policy
```python
# In app configuration
CSP = {
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline' cdn.jsdelivr.net",
    'style-src': "'self' 'unsafe-inline' fonts.googleapis.com",
    'font-src': "'self' fonts.gstatic.com",
    'img-src': "'self' data: https:",
    'connect-src': "'self'",
    'frame-ancestors': "'none'",
    'form-action': "'self'",
    'base-uri': "'self'"
}
```

#### Security Headers
```nginx
# In nginx configuration
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
```

## Monitoring & Observability

### Application Monitoring

#### Prometheus + Grafana
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'daily-dev-digest'
    static_configs:
      - targets: ['app:5000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

#### Sentry Integration
```python
# Add to app configuration
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn=os.getenv('SENTRY_DSN'),
    integrations=[FlaskIntegration()],
    traces_sample_rate=0.1,
    environment=os.getenv('FLASK_ENV', 'production')
)
```

### Health Checks

#### Comprehensive Health Check
```python
# Enhanced health check endpoint
@app.route('/health/detailed')
def detailed_health():
    checks = {
        'database': check_database_connection(),
        'github_api': check_github_api(),
        'slack_api': check_slack_api(),
        'email_smtp': check_email_connection(),
        'disk_space': check_disk_space(),
        'memory_usage': check_memory_usage()
    }
    
    all_healthy = all(checks.values())
    status_code = 200 if all_healthy else 503
    
    return jsonify({
        'status': 'healthy' if all_healthy else 'unhealthy',
        'checks': checks,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': app.config.get('VERSION', '1.0.0')
    }), status_code
```

### Logging Configuration

#### Structured Logging
```python
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'line': record.lineno
        }
        
        if hasattr(record, 'request_id'):
            log_entry['request_id'] = record.request_id
            
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
            
        return json.dumps(log_entry)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/app/logs/app.log')
    ]
)

for handler in logging.getLogger().handlers:
    handler.setFormatter(JSONFormatter())
```

## Backup & Recovery

### Database Backup

#### Automated PostgreSQL Backup
```bash
#!/bin/bash
# backup-db.sh

DB_NAME="devdigest"
DB_USER="devdigest"
DB_HOST="localhost"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --format=custom --compress=9 \
  --file="$BACKUP_DIR/devdigest_$DATE.dump"

# Keep only last 7 days
find $BACKUP_DIR -name "devdigest_*.dump" -mtime +7 -delete

# Upload to S3 (optional)
aws s3 cp "$BACKUP_DIR/devdigest_$DATE.dump" \
  s3://your-backup-bucket/database/
```

#### Restore from Backup
```bash
# Restore database
pg_restore -h localhost -U devdigest -d devdigest \
  --clean --if-exists /backups/devdigest_20240115_120000.dump
```

### Application Data Backup

#### File System Backup
```bash
#!/bin/bash
# backup-files.sh

APP_DIR="/app"
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create tar archive
tar -czf "$BACKUP_DIR/app_data_$DATE.tar.gz" \
  "$APP_DIR/logs" \
  "$APP_DIR/uploads" \
  "$APP_DIR/.env"

# Upload to cloud storage
rclone copy "$BACKUP_DIR/app_data_$DATE.tar.gz" \
  remote:backup-bucket/application/
```

## CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    
    - name: Install UV
      run: curl -LsSf https://astral.sh/uv/install.sh | sh
    
    - name: Install dependencies
      run: uv sync
    
    - name: Run tests
      run: uv run pytest --cov=app
      env:
        DATABASE_URL: postgresql://postgres:test@localhost:5432/test
    
    - name: Code quality checks
      run: |
        uv run black --check app/ tests/
        uv run ruff check app/ tests/
        uv run mypy app/

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Login to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: |
          ghcr.io/${{ github.repository }}:latest
          ghcr.io/${{ github.repository }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: [test, build]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - name: Deploy to production
      uses: appleboy/ssh-action@v1.0.0
      with:
        host: ${{ secrets.PRODUCTION_HOST }}
        username: ${{ secrets.PRODUCTION_USER }}
        key: ${{ secrets.PRODUCTION_SSH_KEY }}
        script: |
          cd /opt/daily-dev-digest
          docker-compose pull
          docker-compose up -d --remove-orphans
          docker image prune -f
```

### GitLab CI/CD

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  POSTGRES_DB: test
  POSTGRES_USER: test
  POSTGRES_PASSWORD: test

test:
  stage: test
  image: python:3.11
  services:
    - postgres:13-alpine
  variables:
    DATABASE_URL: postgresql://test:test@postgres:5432/test
  before_script:
    - curl -LsSf https://astral.sh/uv/install.sh | sh
    - uv sync
  script:
    - uv run pytest --cov=app
    - uv run black --check app/ tests/
    - uv run ruff check app/ tests/
    - uv run mypy app/

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker push $DOCKER_IMAGE
  only:
    - main
    - tags

deploy_production:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$PRODUCTION_SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - ssh-keyscan $PRODUCTION_HOST >> ~/.ssh/known_hosts
  script:
    - ssh $PRODUCTION_USER@$PRODUCTION_HOST "
        cd /opt/daily-dev-digest &&
        docker-compose pull &&
        docker-compose up -d --remove-orphans &&
        docker image prune -f"
  only:
    - main
  environment:
    name: production
    url: https://yourapp.com
```

## Performance Optimization

### Database Optimization

#### Connection Pooling
```python
# In production settings
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_size': 20,
    'pool_recycle': 300,
    'pool_pre_ping': True,
    'max_overflow': 30
}
```

#### Query Optimization
```python
# Add database indexes for common queries
class Digest(Base):
    # ... existing fields ...
    
    __table_args__ = (
        Index('idx_digest_repo_created', 'repo_id', 'created_at'),
        Index('idx_digest_date_range', 'date_from', 'date_to'),
        Index('idx_digest_created_by', 'created_by_id'),
    )
```

### Caching Strategy

#### Redis Caching
```python
import redis
from flask_caching import Cache

# Configure caching
cache = Cache(app, config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': os.getenv('REDIS_URL'),
    'CACHE_DEFAULT_TIMEOUT': 300
})

# Cache expensive operations
@cache.memoize(timeout=3600)
def get_repository_stats(repo_id):
    # Expensive database query
    return compute_repo_statistics(repo_id)
```

### Load Balancing

#### HAProxy Configuration
```
# haproxy.cfg
global
    daemon
    maxconn 4096

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend web_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/yourapp.pem
    redirect scheme https if !{ ssl_fc }
    default_backend web_servers

backend web_servers
    balance roundrobin
    option httpchk GET /health
    server app1 app1:5000 check
    server app2 app2:5000 check
    server app3 app3:5000 check
```

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database connectivity
pg_isready -h localhost -p 5432 -U devdigest

# Check connection from application
uv run python -c "
import psycopg2
try:
    conn = psycopg2.connect('postgresql://user:pass@host:5432/db')
    print('Database connection successful')
    conn.close()
except Exception as e:
    print(f'Connection failed: {e}')
"
```

#### Memory Issues
```bash
# Monitor memory usage
docker stats --no-stream

# Check application memory
ps aux | grep python | grep -v grep

# Analyze memory leaks
uv add --dev memory-profiler
uv run --with memory-profiler dev
```

#### Performance Issues
```bash
# Check slow queries
# In PostgreSQL:
# log_min_duration_statement = 1000  # Log queries > 1 second

# Monitor application performance
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:5000/api/v1/digests"

# curl-format.txt:
#     time_namelookup:  %{time_namelookup}\n
#     time_connect:     %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#     time_pretransfer: %{time_pretransfer}\n
#     time_redirect:    %{time_redirect}\n
#     time_starttransfer: %{time_starttransfer}\n
#     ----------\n
#     time_total:       %{time_total}\n
```

### Debugging Tools

#### Application Debugging
```bash
# Enable debug mode temporarily
export FLASK_DEBUG=true
export LOG_LEVEL=DEBUG

# Check application logs
docker-compose logs -f app

# Access application shell
docker-compose exec app uv run python -c "
from app.factory import create_app
from app.data.db import db
app = create_app()
with app.app_context():
    # Debug database issues
    print(db.engine.execute('SELECT version()').fetchone())
"
```

This comprehensive deployment guide provides everything needed to successfully deploy Daily Dev Digest to production environments with best practices for security, performance, and reliability.