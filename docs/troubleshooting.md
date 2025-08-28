# Troubleshooting Guide

This guide covers common issues, error scenarios, and solutions for the Daily Dev Digest application. It includes diagnostics, debugging steps, and recovery procedures for both development and production environments.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Database Issues](#database-issues)
- [GitHub Integration Issues](#github-integration-issues)
- [Slack Integration Issues](#slack-integration-issues)
- [Email Notification Issues](#email-notification-issues)
- [Performance Issues](#performance-issues)
- [Job Processing Issues](#job-processing-issues)
- [Authentication Issues](#authentication-issues)
- [Frontend Issues](#frontend-issues)
- [Production Issues](#production-issues)
- [Error Reference](#error-reference)
- [Recovery Procedures](#recovery-procedures)
- [Monitoring & Alerting](#monitoring--alerting)

## Quick Diagnostics

### Health Check Commands

```bash
# Check application health
curl http://localhost:3000/health

# Check database connection
python -c "
from app.factory import create_app
from app.data.db import db
app = create_app()
with app.app_context():
    try:
        db.engine.execute('SELECT 1')
        print('✅ Database connection successful')
    except Exception as e:
        print(f'❌ Database connection failed: {e}')
"

# Check GitHub API connectivity
python -c "
import os
from app.clients.github import GitHubClient
try:
    client = GitHubClient(os.getenv('GITHUB_TOKEN'))
    rate_limit = client.get_rate_limit()
    print(f'✅ GitHub API: {rate_limit[\"remaining\"]}/{rate_limit[\"limit\"]} requests remaining')
except Exception as e:
    print(f'❌ GitHub API failed: {e}')
"

# Check environment variables
python -c "
import os
required = ['SECRET_KEY', 'GITHUB_TOKEN']
optional = ['OPENAI_API_KEY', 'SLACK_BOT_TOKEN', 'SMTP_HOST']

print('Required environment variables:')
for var in required:
    status = '✅' if os.getenv(var) else '❌'
    print(f'  {status} {var}')

print('\\nOptional environment variables:')
for var in optional:
    status = '✅' if os.getenv(var) else '⚠️ '
    print(f'  {status} {var}')
"
```

### System Information

```bash
# Check system resources
python -c "
import psutil
import platform

print(f'Python version: {platform.python_version()}')
print(f'Platform: {platform.platform()}')
print(f'CPU cores: {psutil.cpu_count()}')
print(f'Memory: {psutil.virtual_memory().total // (1024**3)}GB total, {psutil.virtual_memory().percent}% used')
print(f'Disk: {psutil.disk_usage(\"/\").percent}% used')
"

# Check dependencies
uv pip list | grep -E "(flask|sqlalchemy|requests|pygithub)"
```

## Installation Issues

### Virtual Environment Problems

**Issue**: `uv venv` fails or virtual environment not activating

**Solutions**:
```bash
# Ensure UV is properly installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clear existing virtual environment
rm -rf .venv
uv venv --python 3.11

# Manual activation if automatic fails
# Windows
.venv\Scripts\activate.bat
# Unix/MacOS
source .venv/bin/activate

# Verify activation
which python  # Should point to .venv/bin/python
python --version  # Should be 3.11+
```

### Dependency Installation Issues

**Issue**: `uv sync` fails with package conflicts

**Solutions**:
```bash
# Clear UV cache
uv cache clean

# Force reinstall all dependencies
uv sync --reinstall

# Clear cache and reinstall
rm -rf ~/.cache/uv
uv sync

# If specific package fails, add individually
uv add flask==3.0.0
uv add sqlalchemy==2.0.0

# Check for conflicting packages
uv pip list
# Remove problematic packages
uv remove flask sqlalchemy && uv add flask sqlalchemy
```

### Python Version Issues

**Issue**: Application requires Python 3.11+ but older version is installed

**Solutions**:
```bash
# Check Python version
python --version

# Install Python 3.11 using pyenv (Unix/MacOS)
curl https://pyenv.run | bash
pyenv install 3.11.0
pyenv global 3.11.0

# Windows: Download from python.org or use Microsoft Store
# Or use UV to manage Python versions
uv python install 3.11

# Create venv with specific Python version
uv venv --python 3.11
```

### Import Errors

**Issue**: `ModuleNotFoundError` when importing app modules

**Solutions**:
```bash
# Ensure you're in the correct directory
pwd  # Should be in digest2 directory

# Set PYTHONPATH manually
export PYTHONPATH=/path/to/digest2:$PYTHONPATH

# Verify installation
python -c "import app; print('✅ App module imports successfully')"

# Reinstall in editable mode
uv sync

# Check for __init__.py files
find app/ -name "__init__.py"
```

## Database Issues

### SQLite Issues

**Issue**: Database locked or permission errors

**Solutions**:
```bash
# Check database file permissions
ls -la devdigest.db

# Kill processes using the database
lsof devdigest.db  # List processes using file
kill -9 <PID>      # Kill if necessary

# Remove lock file if exists
rm devdigest.db-journal
rm devdigest.db-wal
rm devdigest.db-shm

# Reset database
rm devdigest.db
python -m app.data.migrations init
```

**Issue**: Database corruption

**Solutions**:
```bash
# Check database integrity
sqlite3 devdigest.db "PRAGMA integrity_check;"

# Backup and repair
cp devdigest.db devdigest.db.backup
sqlite3 devdigest.db ".recover" | sqlite3 devdigest_recovered.db

# If corruption is severe, recreate database
mv devdigest.db devdigest.db.corrupt
python -m app.data.migrations init
python -m app.data.seed
```

### PostgreSQL Issues

**Issue**: Connection refused to PostgreSQL

**Solutions**:
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql
# Start if not running
sudo systemctl start postgresql

# Check connection parameters
psql "postgresql://user:pass@host:5432/dbname"

# Test connection from Python
python -c "
import psycopg2
try:
    conn = psycopg2.connect('postgresql://user:pass@host:5432/dbname')
    print('✅ PostgreSQL connection successful')
    conn.close()
except Exception as e:
    print(f'❌ PostgreSQL connection failed: {e}')
"

# Check database exists
sudo -u postgres psql -l | grep devdigest
```

**Issue**: Migration failures

**Solutions**:
```bash
# Check migration status
python -c "
from app.data.migrations import get_migration_status
print(get_migration_status())
"

# Reset migrations (CAUTION: destroys data)
python -c "
from app.data.db import db
from app.factory import create_app
app = create_app()
with app.app_context():
    db.drop_all()
    db.create_all()
"

# Manual migration
python -m app.data.migrations upgrade

# Check for pending migrations
python -m app.data.migrations show
```

### Database Performance Issues

**Issue**: Slow database queries

**Solutions**:
```bash
# Enable query logging (PostgreSQL)
# In postgresql.conf:
# log_statement = 'all'
# log_min_duration_statement = 1000

# For SQLite, add to app config:
# SQLALCHEMY_ECHO = True

# Analyze slow queries
python -c "
from app.data.db import db
from app.factory import create_app
app = create_app()
with app.app_context():
    # Check database statistics
    result = db.engine.execute('SELECT * FROM sqlite_master WHERE type=\"table\"')
    for row in result:
        print(row)
"

# Add missing indexes
python -c "
from app.data.models import *
from app.data.db import db
from app.factory import create_app
app = create_app()
with app.app_context():
    # Create missing indexes
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_digest_created ON digests(created_at)')
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_job_status ON jobs(status)')
"
```

## GitHub Integration Issues

### Authentication Errors

**Issue**: GitHub API returns 401 Unauthorized

**Solutions**:
```bash
# Verify token format and validity
echo $GITHUB_TOKEN | cut -c1-4  # Should start with 'ghp_'

# Test token manually
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/user

# Check token permissions
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/applications/<client_id>/tokens/$GITHUB_TOKEN

# Generate new token at https://github.com/settings/tokens
# Required scopes: repo (for private repos) or public_repo (for public repos)
```

**Issue**: Repository not found (404)

**Solutions**:
```bash
# Verify repository path format
echo "facebook/react"  # Correct: owner/repository
echo "facebook/react/" # Incorrect: trailing slash

# Check if repository exists and is accessible
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/repos/facebook/react

# Check token permissions for private repositories
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/repos/your-org/private-repo
```

### Rate Limiting Issues

**Issue**: GitHub API rate limit exceeded (403)

**Solutions**:
```bash
# Check current rate limit status
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/rate_limit

# Calculate wait time
python -c "
import requests, time
response = requests.get('https://api.github.com/rate_limit',
                       headers={'Authorization': 'token $GITHUB_TOKEN'})
rate_limit = response.json()
reset_time = rate_limit['resources']['core']['reset']
wait_seconds = max(0, reset_time - time.time())
print(f'Wait {wait_seconds:.0f} seconds ({wait_seconds/60:.1f} minutes)')
"

# Implement exponential backoff in code
# Add to GitHub client:
import time
import random

def retry_with_backoff(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except RateLimitError:
            if attempt == max_retries - 1:
                raise
            wait_time = (2 ** attempt) + random.uniform(0, 1)
            time.sleep(wait_time)
```

### Data Quality Issues

**Issue**: Missing or malformed PR data

**Solutions**:
```python
# Add data validation to GitHub client
def validate_pr_data(pr_data):
    required_fields = ['number', 'title', 'user', 'created_at']
    missing_fields = [field for field in required_fields 
                     if field not in pr_data or pr_data[field] is None]
    
    if missing_fields:
        logger.warning(f"PR data missing fields: {missing_fields}")
        return False
    return True

# Filter invalid data
valid_prs = [pr for pr in prs if validate_pr_data(pr)]
```

## Slack Integration Issues

### Bot Token Issues

**Issue**: Slack API returns "invalid_auth" or "not_authed"

**Solutions**:
```bash
# Verify token format
echo $SLACK_BOT_TOKEN | cut -c1-4  # Should start with 'xoxb-'

# Test token validity
curl -X POST https://slack.com/api/auth.test \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN"

# Check bot permissions in Slack app settings
# Required scopes: chat:write, users:read, channels:read

# Reinstall bot to workspace if token is revoked
# Go to https://api.slack.com/apps -> Your App -> Install App
```

**Issue**: Channel or user not found

**Solutions**:
```bash
# List available channels
curl -X GET "https://slack.com/api/conversations.list" \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN"

# Find user by email
curl -X GET "https://slack.com/api/users.lookupByEmail?email=user@example.com" \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN"

# Test sending message to yourself
curl -X POST https://slack.com/api/chat.postMessage \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "channel": "@your-username",
       "text": "Test message from Daily Dev Digest"
     }'
```

### Message Formatting Issues

**Issue**: Slack blocks or attachments not displaying correctly

**Solutions**:
```python
# Validate Slack message format using Block Kit Builder
# https://app.slack.com/block-kit-builder

# Test message payload
import json

def validate_slack_blocks(blocks):
    """Validate Slack block structure."""
    try:
        # Basic validation
        if not isinstance(blocks, list):
            return False, "Blocks must be a list"
        
        for block in blocks:
            if 'type' not in block:
                return False, "Each block must have a type"
            
        return True, "Valid"
    except Exception as e:
        return False, str(e)

# Example usage
valid, message = validate_slack_blocks(your_blocks)
if not valid:
    logger.error(f"Invalid Slack blocks: {message}")
```

## Email Notification Issues

### SMTP Connection Issues

**Issue**: SMTP connection refused or timeout

**Solutions**:
```bash
# Test SMTP connection manually
python -c "
import smtplib
try:
    server = smtplib.SMTP('$SMTP_HOST', $SMTP_PORT)
    server.starttls()
    server.login('$SMTP_USERNAME', '$SMTP_PASSWORD')
    print('✅ SMTP connection successful')
    server.quit()
except Exception as e:
    print(f'❌ SMTP connection failed: {e}')
"

# Check firewall and network connectivity
telnet $SMTP_HOST $SMTP_PORT
# Or using nc (netcat)
nc -zv $SMTP_HOST $SMTP_PORT

# Test with different SMTP settings
# Gmail: smtp.gmail.com:587 with app password
# Outlook: smtp-mail.outlook.com:587
# SendGrid: smtp.sendgrid.net:587
```

**Issue**: Authentication failed

**Solutions**:
```bash
# For Gmail, ensure app password is used (not regular password)
# 1. Enable 2FA on Google account
# 2. Generate app password at https://myaccount.google.com/apppasswords
# 3. Use app password in SMTP_PASSWORD

# Test authentication
python -c "
import smtplib
server = smtplib.SMTP('smtp.gmail.com', 587)
server.starttls()
try:
    server.login('your-email@gmail.com', 'your-app-password')
    print('✅ Authentication successful')
except Exception as e:
    print(f'❌ Authentication failed: {e}')
server.quit()
"
```

### Email Delivery Issues

**Issue**: Emails going to spam or not delivered

**Solutions**:
```bash
# Check email headers and SPF/DKIM records
dig TXT your-domain.com | grep spf
dig TXT default._domainkey.your-domain.com

# Use email testing service
# 1. Send test email to mail-tester.com
# 2. Check spam score and recommendations

# Improve email deliverability
# - Use proper from address with your domain
# - Include text version alongside HTML
# - Avoid spam trigger words
# - Set proper email headers
```

## Performance Issues

### Slow Application Response

**Issue**: Application responds slowly to requests

**Solutions**:
```bash
# Profile application performance  
uv add --group dev py-spy
py-spy top --pid $(pgrep -f "flask run")

# Check database query performance
# Add to Flask app config for development:
SQLALCHEMY_ECHO = True

# Monitor system resources
top -p $(pgrep -f "flask run")
htop

# Profile specific functions
uv add --group dev line_profiler
# Add @profile decorator to functions
kernprof -l -v your_script.py
```

### Memory Issues

**Issue**: High memory usage or memory leaks

**Solutions**:
```bash
# Monitor memory usage
python -c "
import psutil
import os
process = psutil.Process(os.getpid())
print(f'Memory usage: {process.memory_info().rss / 1024 / 1024:.2f} MB')
"

# Profile memory usage
uv add --group dev memory-profiler
@profile
def your_function():
    # Function code
    pass

python -m memory_profiler your_script.py

# Check for common memory leaks
# - Unclosed database connections
# - Large objects kept in memory
# - Circular references
```

### Database Performance

**Issue**: Slow database queries

**Solutions**:
```sql
-- PostgreSQL: Enable query logging
-- In postgresql.conf:
log_statement = 'all'
log_min_duration_statement = 1000

-- Check slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Analyze table statistics
ANALYZE digests;
EXPLAIN ANALYZE SELECT * FROM digests WHERE repo_id = 1;
```

```python
# Add database indexes
from app.data.models import *
from app.data.db import db

# Create indexes for common queries
db.engine.execute('''
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_digest_repo_created 
    ON digests(repo_id, created_at DESC)
''')

db.engine.execute('''
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_status_created
    ON jobs(status, created_at DESC)
''')
```

## Job Processing Issues

### Jobs Stuck in PENDING State

**Issue**: Digest jobs remain in PENDING status indefinitely

**Solutions**:
```python
# Check job queue status
from app.services.jobs import JobProcessor
from app.data.models import Job, JobStatus

def diagnose_stuck_jobs():
    stuck_jobs = db.session.query(Job).filter(
        Job.status == JobStatus.PENDING,
        Job.created_at < datetime.now(timezone.utc) - timedelta(minutes=30)
    ).all()
    
    for job in stuck_jobs:
        print(f"Stuck job {job.id}: created {job.created_at}")
        
    # Restart stuck jobs
    for job in stuck_jobs:
        job.status = JobStatus.PENDING
        job.error = None
    db.session.commit()

# Run job processor manually
processor = JobProcessor()
for job in stuck_jobs:
    processor.process_job_async(job.id)
```

### Job Processing Errors

**Issue**: Jobs fail with various errors

**Solutions**:
```python
# Check job error details
failed_jobs = db.session.query(Job).filter(
    Job.status == JobStatus.FAILED
).order_by(Job.finished_at.desc()).limit(10)

for job in failed_jobs:
    print(f"Job {job.id} failed: {job.error}")
    
# Common error patterns and solutions
def retry_failed_jobs():
    retryable_errors = [
        "rate limit",
        "connection timeout",
        "temporary failure"
    ]
    
    for job in failed_jobs:
        if any(error in job.error.lower() for error in retryable_errors):
            print(f"Retrying job {job.id}")
            job.status = JobStatus.PENDING
            job.error = None
            job.started_at = None
            job.finished_at = None
    
    db.session.commit()
```

## Authentication Issues

### Session Problems

**Issue**: Users getting logged out frequently

**Solutions**:
```python
# Check session configuration
from app.factory import create_app
app = create_app()

print(f"Session timeout: {app.config['PERMANENT_SESSION_LIFETIME']}")
print(f"Cookie secure: {app.config['SESSION_COOKIE_SECURE']}")
print(f"Cookie httponly: {app.config['SESSION_COOKIE_HTTPONLY']}")

# Extend session lifetime in production
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 hours
```

### Permission Errors

**Issue**: Users getting 403 Forbidden for allowed actions

**Solutions**:
```python
# Debug user permissions
def debug_user_permissions(user_id):
    user = db.session.query(User).get(user_id)
    print(f"User: {user.username}")
    print(f"Roles: {[role.name for role in user.roles]}")
    print(f"Permissions: {user.get_all_permissions()}")
    
# Check role assignments
def verify_role_permissions():
    roles = db.session.query(Role).all()
    for role in roles:
        print(f"Role {role.name}: {role.permissions}")

# Reset user roles if needed
def reset_admin_role(user_id):
    user = db.session.query(User).get(user_id)
    admin_role = db.session.query(Role).filter(Role.name == 'admin').first()
    if admin_role not in user.roles:
        user.roles.append(admin_role)
        db.session.commit()
```

## Frontend Issues

### HTMX Not Working

**Issue**: HTMX requests not triggering or updating content

**Solutions**:
```html
<!-- Check HTMX is loaded -->
<script>
if (typeof htmx === 'undefined') {
    console.error('HTMX not loaded');
    // Load HTMX
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/htmx.org@1.9.10';
    document.head.appendChild(script);
}
</script>

<!-- Debug HTMX requests -->
<script>
htmx.on('htmx:configRequest', function(e) {
    console.log('HTMX request:', e.detail);
});

htmx.on('htmx:responseError', function(e) {
    console.error('HTMX error:', e.detail);
});
</script>

<!-- Verify target elements exist -->
<script>
htmx.on('htmx:afterRequest', function(e) {
    const target = e.detail.target;
    if (!target) {
        console.error('HTMX target not found');
    }
});
</script>
```

### CSS/Styling Issues

**Issue**: Styles not loading or displaying incorrectly

**Solutions**:
```bash
# Check static file serving
curl -I http://localhost:5000/static/css/app.css

# Verify file paths
ls -la app/ui/static/css/
ls -la app/ui/static/js/

# Clear browser cache
# Chrome: Ctrl+Shift+R
# Firefox: Ctrl+F5

# Check Flask static file configuration
# In Flask app:
app.static_folder = 'ui/static'
app.static_url_path = '/static'
```

## Production Issues

### Container Issues

**Issue**: Docker container crashes or won't start

**Solutions**:
```bash
# Check container logs
docker logs <container-id> --tail 100

# Debug container interactively
docker run -it --entrypoint /bin/bash your-image

# Check resource limits
docker stats <container-id>

# Verify environment variables
docker exec <container-id> env | grep -E "(FLASK|DATABASE|GITHUB)"

# Check health status
docker exec <container-id> curl -f http://localhost:5000/health
```

### Load Balancer Issues

**Issue**: 502/503 errors from load balancer

**Solutions**:
```bash
# Check backend health
curl -I http://backend-server:5000/health

# Verify load balancer configuration
# For Nginx:
sudo nginx -t
sudo systemctl reload nginx

# Check upstream servers
cat /etc/nginx/sites-enabled/digest2

# Monitor backend servers
for server in server1:5000 server2:5000; do
    echo "Checking $server"
    curl -w "%{http_code}" -s -o /dev/null http://$server/health
done
```

### SSL/TLS Issues

**Issue**: SSL certificate errors or HTTPS not working

**Solutions**:
```bash
# Check certificate validity
openssl x509 -in /path/to/cert.pem -text -noout
openssl x509 -in /path/to/cert.pem -enddate -noout

# Test SSL connection
openssl s_client -connect yoursite.com:443 -servername yoursite.com

# Renew Let's Encrypt certificate
sudo certbot renew --dry-run
sudo certbot renew

# Check certificate chain
curl -I https://yoursite.com
```

## Error Reference

### Common Error Codes and Solutions

| Error Code | Description | Solution |
|------------|-------------|----------|
| `DATABASE_CONNECTION_ERROR` | Cannot connect to database | Check DATABASE_URL, ensure database is running |
| `GITHUB_RATE_LIMIT_EXCEEDED` | GitHub API rate limit hit | Wait for reset or use authenticated requests |
| `GITHUB_REPOSITORY_NOT_FOUND` | Repository not accessible | Verify repository path and token permissions |
| `SLACK_INVALID_TOKEN` | Slack bot token invalid | Check token format, regenerate if needed |
| `SMTP_AUTH_FAILED` | Email authentication failed | Verify SMTP credentials, use app password for Gmail |
| `JOB_PROCESSING_TIMEOUT` | Job exceeded maximum runtime | Increase timeout or optimize processing logic |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions | Check user roles and permission assignments |
| `VALIDATION_ERROR` | Invalid input data | Check request format and required fields |

### Application-Specific Errors

```python
# Custom exception handling
class DigestError(Exception):
    """Base exception for digest-related errors."""
    pass

class GitHubRateLimitError(DigestError):
    """GitHub API rate limit exceeded."""
    def __init__(self, reset_time):
        self.reset_time = reset_time
        super().__init__(f"Rate limit exceeded, resets at {reset_time}")

class RepositoryAccessError(DigestError):
    """Repository not found or not accessible."""
    def __init__(self, repo_path, reason="unknown"):
        self.repo_path = repo_path
        self.reason = reason
        super().__init__(f"Cannot access repository {repo_path}: {reason}")

# Error handling in services
def handle_github_errors(func):
    """Decorator to handle GitHub API errors."""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                raise GitHubRateLimitError(e.response.headers.get('X-RateLimit-Reset'))
            elif e.response.status_code == 404:
                raise RepositoryAccessError(args[1], "not found")
            else:
                raise DigestError(f"GitHub API error: {e}")
    return wrapper
```

## Recovery Procedures

### Database Recovery

```bash
# 1. Backup current database
cp devdigest.db devdigest.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. Restore from backup
cp devdigest.db.backup.20240115_120000 devdigest.db

# 3. Verify database integrity
python -c "
from app.factory import create_app
from app.data.db import db
app = create_app()
with app.app_context():
    result = db.engine.execute('PRAGMA integrity_check')
    print(result.fetchone()[0])  # Should be 'ok'
"

# 4. If database is corrupted, reinitialize
mv devdigest.db devdigest.db.corrupt
python -m app.data.migrations init
python -m app.data.seed
```

### Application Recovery

```bash
# 1. Stop application
sudo systemctl stop digest2
# or
docker stop digest2-container

# 2. Check logs for errors
tail -100 /var/log/digest2/app.log

# 3. Clear temporary files
rm -rf /tmp/digest2-*
rm -rf app/__pycache__/*

# 4. Update environment variables if needed
vi /etc/digest2/.env

# 5. Restart application
sudo systemctl start digest2
# or
docker start digest2-container

# 6. Verify health
curl http://localhost:3000/health
```

### Data Recovery

```python
# Recover lost digest data from GitHub
def recover_digest_data(repo_path, start_date, end_date):
    """Recreate digest from GitHub data."""
    from app.services.digests import DigestService
    from app.clients.github import GitHubClient
    
    github_client = GitHubClient(os.getenv('GITHUB_TOKEN'))
    digest_service = DigestService()
    
    # Fetch PR data for date range
    prs = github_client.get_pull_requests(repo_path, start_date, end_date)
    
    # Recreate digest
    digest = digest_service.create_digest_from_prs(
        repo_path=repo_path,
        prs=prs,
        date_from=start_date,
        date_to=end_date
    )
    
    return digest

# Example usage
from datetime import datetime, timedelta
end_date = datetime.now()
start_date = end_date - timedelta(days=7)
recovered_digest = recover_digest_data('facebook/react', start_date, end_date)
```

## Monitoring & Alerting

### Health Check Monitoring

```bash
#!/bin/bash
# health_check.sh - Run every 5 minutes via cron

APP_URL="http://localhost:5000"
LOG_FILE="/var/log/digest2/health.log"
ALERT_EMAIL="admin@yourcompany.com"

# Check application health
HEALTH_STATUS=$(curl -s -w "%{http_code}" -o /dev/null $APP_URL/health)

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "$(date): Health check failed - HTTP $HEALTH_STATUS" >> $LOG_FILE
    
    # Send alert
    echo "Daily Dev Digest health check failed at $(date)" | \
        mail -s "ALERT: Digest2 Health Check Failed" $ALERT_EMAIL
    
    # Try to restart service
    sudo systemctl restart digest2
    sleep 30
    
    # Check again
    RETRY_STATUS=$(curl -s -w "%{http_code}" -o /dev/null $APP_URL/health)
    if [ "$RETRY_STATUS" != "200" ]; then
        echo "$(date): Restart failed - HTTP $RETRY_STATUS" >> $LOG_FILE
        echo "Daily Dev Digest restart failed at $(date)" | \
            mail -s "CRITICAL: Digest2 Restart Failed" $ALERT_EMAIL
    else
        echo "$(date): Service restarted successfully" >> $LOG_FILE
    fi
else
    echo "$(date): Health check passed" >> $LOG_FILE
fi

# Add to crontab:
# */5 * * * * /path/to/health_check.sh
```

### Log Monitoring

```python
# log_monitor.py - Monitor for error patterns
import re
import subprocess
from datetime import datetime, timedelta

def monitor_logs():
    """Monitor logs for error patterns."""
    error_patterns = [
        r'ERROR.*Database',
        r'CRITICAL.*GitHub',
        r'ERROR.*Job.*failed',
        r'ERROR.*SMTP',
    ]
    
    # Get logs from last 15 minutes
    since_time = datetime.now() - timedelta(minutes=15)
    cmd = f"journalctl -u digest2 --since='{since_time}'"
    
    try:
        output = subprocess.check_output(cmd, shell=True, text=True)
        
        alerts = []
        for pattern in error_patterns:
            matches = re.findall(pattern, output, re.IGNORECASE)
            if matches:
                alerts.append(f"Found {len(matches)} instances of: {pattern}")
        
        if alerts:
            alert_message = f"Log alerts at {datetime.now()}:\n" + "\n".join(alerts)
            send_alert(alert_message)
            
    except subprocess.CalledProcessError as e:
        print(f"Error reading logs: {e}")

def send_alert(message):
    """Send alert via email or Slack."""
    # Implementation depends on your alerting system
    pass

# Run every 15 minutes
if __name__ == "__main__":
    monitor_logs()
```

### Performance Monitoring

```python
# performance_monitor.py
import psutil
import requests
import time
from datetime import datetime

def monitor_performance():
    """Monitor system and application performance."""
    metrics = {}
    
    # System metrics
    metrics['cpu_percent'] = psutil.cpu_percent(interval=1)
    metrics['memory_percent'] = psutil.virtual_memory().percent
    metrics['disk_percent'] = psutil.disk_usage('/').percent
    
    # Application metrics
    try:
        start_time = time.time()
        response = requests.get('http://localhost:5000/health', timeout=10)
        metrics['response_time'] = (time.time() - start_time) * 1000
        metrics['http_status'] = response.status_code
    except Exception as e:
        metrics['response_time'] = None
        metrics['http_status'] = 0
        metrics['error'] = str(e)
    
    # Database metrics
    try:
        from app.factory import create_app
        from app.data.db import db
        app = create_app()
        with app.app_context():
            start_time = time.time()
            db.engine.execute('SELECT 1')
            metrics['db_response_time'] = (time.time() - start_time) * 1000
    except Exception as e:
        metrics['db_response_time'] = None
        metrics['db_error'] = str(e)
    
    # Log metrics
    timestamp = datetime.now().isoformat()
    print(f"{timestamp}: {metrics}")
    
    # Alert if thresholds exceeded
    if metrics['cpu_percent'] > 80:
        send_alert(f"High CPU usage: {metrics['cpu_percent']}%")
    if metrics['memory_percent'] > 85:
        send_alert(f"High memory usage: {metrics['memory_percent']}%")
    if metrics['response_time'] and metrics['response_time'] > 5000:
        send_alert(f"Slow response time: {metrics['response_time']}ms")

if __name__ == "__main__":
    monitor_performance()
```

This comprehensive troubleshooting guide should help diagnose and resolve most issues encountered with the Daily Dev Digest application. For issues not covered here, check the application logs and consider reaching out to the development team with specific error messages and context.