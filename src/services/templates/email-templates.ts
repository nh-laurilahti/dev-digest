/**
 * Email Templates
 * Pre-defined email templates for various notification types
 */

export const EMAIL_TEMPLATES = {
  // Welcome email template
  WELCOME: {
    name: 'welcome_email',
    subject: 'Welcome to Daily Dev Digest! 🎉',
    content: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Daily Dev Digest</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #e9ecef; }
        .logo { font-size: 24px; font-weight: bold; color: #007bff; }
        .content { padding: 30px 0; }
        .welcome-text { font-size: 18px; margin-bottom: 20px; }
        .features { background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .feature { margin-bottom: 15px; }
        .feature-icon { display: inline-block; width: 24px; height: 24px; margin-right: 10px; vertical-align: middle; }
        .cta { text-align: center; margin: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📊 Daily Dev Digest</div>
        </div>
        
        <div class="content">
            <div class="welcome-text">
                Hi {{userName}},
            </div>
            
            <p>Welcome to Daily Dev Digest! We're excited to help you stay on top of your repository activities with intelligent, automated summaries.</p>
            
            <div class="features">
                <h3>What you can do:</h3>
                <div class="feature">
                    <span class="feature-icon">🔍</span>
                    <strong>Smart Analysis:</strong> Get AI-powered summaries of pull requests, commits, and issues
                </div>
                <div class="feature">
                    <span class="feature-icon">📅</span>
                    <strong>Flexible Scheduling:</strong> Choose daily, weekly, or custom digest frequencies
                </div>
                <div class="feature">
                    <span class="feature-icon">🔔</span>
                    <strong>Multi-Channel Notifications:</strong> Receive updates via email, Slack, or webhooks
                </div>
                <div class="feature">
                    <span class="feature-icon">📈</span>
                    <strong>Detailed Insights:</strong> Track trends, contributor activity, and project health
                </div>
            </div>
            
            <div class="cta">
                <a href="{{baseUrl}}/dashboard" class="button">Get Started</a>
            </div>
            
            <p>Need help getting started? Check out our <a href="{{baseUrl}}/docs">documentation</a> or <a href="{{supportUrl}}">contact support</a>.</p>
        </div>
        
        <div class="footer">
            <p>You're receiving this email because you signed up for Daily Dev Digest.</p>
            <p><a href="{{baseUrl}}/unsubscribe/{{unsubscribeToken}}">Unsubscribe</a> | <a href="{{baseUrl}}/preferences">Manage Preferences</a></p>
        </div>
    </div>
</body>
</html>
    `,
    variables: ['userName', 'baseUrl', 'supportUrl', 'unsubscribeToken'],
    metadata: {
      requiredVariables: ['userName'],
      category: 'onboarding',
      tags: ['welcome', 'getting-started']
    }
  },

  // Digest delivery template
  DIGEST_DELIVERY: {
    name: 'digest_delivery',
    subject: '📊 {{repoName}} Digest - {{dateRange}}',
    content: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{repoName}} Digest</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 700px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .repo-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
        .date-range { font-size: 16px; opacity: 0.9; }
        .summary { padding: 30px 20px; background-color: #f8f9fa; }
        .summary h2 { margin-top: 0; color: #495057; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat { text-align: center; padding: 15px; background-color: white; border-radius: 6px; border: 1px solid #e9ecef; }
        .stat-number { font-size: 24px; font-weight: bold; color: #007bff; }
        .stat-label { font-size: 14px; color: #6c757d; margin-top: 5px; }
        .content { padding: 20px; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #495057; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; }
        .pr-item { border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; margin-bottom: 15px; background-color: #f8f9fa; }
        .pr-title { font-weight: 600; margin-bottom: 5px; }
        .pr-meta { font-size: 14px; color: #6c757d; margin-bottom: 10px; }
        .pr-summary { font-size: 14px; line-height: 1.5; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef; }
        .cta { margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 0 10px; }
        .button:hover { background-color: #0056b3; }
        .unsubscribe { font-size: 12px; color: #6c757d; margin-top: 20px; }
        .trend-up { color: #28a745; }
        .trend-down { color: #dc3545; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="repo-name">{{repoName}}</div>
            <div class="date-range">{{dateRange}}</div>
        </div>
        
        {{#if summary}}
        <div class="summary">
            <h2>📝 Summary</h2>
            <p>{{summary}}</p>
        </div>
        {{/if}}
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number">{{stats.prCount}}</div>
                <div class="stat-label">Pull Requests</div>
            </div>
            <div class="stat">
                <div class="stat-number">{{stats.commitCount}}</div>
                <div class="stat-label">Commits</div>
            </div>
            <div class="stat">
                <div class="stat-number">{{stats.contributorCount}}</div>
                <div class="stat-label">Contributors</div>
            </div>
            <div class="stat">
                <div class="stat-number">{{stats.filesChanged}}</div>
                <div class="stat-label">Files Changed</div>
            </div>
        </div>
        
        <div class="content">
            {{#if pullRequests}}
            <div class="section">
                <h3>🔀 Notable Pull Requests</h3>
                {{#each pullRequests}}
                <div class="pr-item">
                    <div class="pr-title">
                        <a href="{{url}}" style="color: #007bff; text-decoration: none;">#{{number}} {{title}}</a>
                    </div>
                    <div class="pr-meta">
                        by {{author}} • {{status}} • 
                        <span class="{{#if (gt linesAdded linesRemoved)}}trend-up{{else}}trend-down{{/if}}">
                            +{{linesAdded}} -{{linesRemoved}}
                        </span>
                    </div>
                    {{#if aiSummary}}
                    <div class="pr-summary">{{aiSummary}}</div>
                    {{/if}}
                </div>
                {{/each}}
            </div>
            {{/if}}
            
            {{#if topContributors}}
            <div class="section">
                <h3>🏆 Top Contributors</h3>
                {{#each topContributors}}
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #e9ecef;">
                    <div>
                        <strong>{{name}}</strong>
                        {{#if isNewContributor}}<span style="background-color: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-left: 8px;">NEW</span>{{/if}}
                    </div>
                    <div style="color: #6c757d; font-size: 14px;">{{commits}} commits • {{linesChanged}} lines</div>
                </div>
                {{/each}}
            </div>
            {{/if}}
            
            {{#if insights}}
            <div class="section">
                <h3>📈 Key Insights</h3>
                <ul>
                    {{#each insights}}
                    <li>{{this}}</li>
                    {{/each}}
                </ul>
            </div>
            {{/if}}
        </div>
        
        <div class="footer">
            <div class="cta">
                <a href="{{digestUrl}}" class="button">View Full Digest</a>
                <a href="{{repoUrl}}" class="button">Visit Repository</a>
            </div>
            
            <div class="unsubscribe">
                <p>You're receiving this digest because you're subscribed to {{repoName}}.</p>
                <p><a href="{{baseUrl}}/unsubscribe/{{unsubscribeToken}}">Unsubscribe</a> | <a href="{{baseUrl}}/preferences">Manage Preferences</a></p>
            </div>
        </div>
    </div>
</body>
</html>
    `,
    variables: [
      'repoName', 'dateRange', 'summary', 'stats', 'pullRequests', 
      'topContributors', 'insights', 'digestUrl', 'repoUrl', 
      'baseUrl', 'unsubscribeToken'
    ],
    metadata: {
      requiredVariables: ['repoName', 'dateRange'],
      category: 'digest',
      tags: ['digest', 'repository', 'summary']
    }
  },

  // Password reset template
  PASSWORD_RESET: {
    name: 'password_reset',
    subject: 'Reset Your Password - Daily Dev Digest',
    content: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 500px; margin: 50px auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
        .title { font-size: 20px; color: #495057; }
        .content { text-align: left; }
        .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; color: #856404; }
        .cta { text-align: center; margin: 30px 0; }
        .button { display: inline-block; padding: 15px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px; }
        .button:hover { background-color: #0056b3; }
        .expiry { font-size: 14px; color: #6c757d; text-align: center; margin-top: 15px; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef; }
        .security-note { background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🔒 Daily Dev Digest</div>
            <div class="title">Reset Your Password</div>
        </div>
        
        <div class="content">
            <p>Hi {{userName}},</p>
            
            <p>We received a request to reset your password for your Daily Dev Digest account. If you made this request, click the button below to set a new password.</p>
            
            <div class="cta">
                <a href="{{resetUrl}}" class="button">Reset Password</a>
            </div>
            
            <div class="expiry">
                This link will expire in {{expiryHours}} hours ({{formatDate expiryTime 'datetime'}})
            </div>
            
            <div class="security-note">
                <strong>Security tip:</strong> For your protection, this password reset link can only be used once. If you don't use it within {{expiryHours}} hours, you'll need to request a new one.
            </div>
            
            <div class="alert">
                <strong>Didn't request this?</strong> If you didn't request a password reset, you can safely ignore this email. Your account is secure and no changes have been made.
            </div>
            
            <p>If the button above doesn't work, you can copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px;">{{resetUrl}}</p>
        </div>
        
        <div class="footer">
            <p style="color: #6c757d; font-size: 14px; margin: 0;">
                For security reasons, this email was sent from an automated system. Please do not reply to this email.
            </p>
        </div>
    </div>
</body>
</html>
    `,
    variables: ['userName', 'resetUrl', 'expiryHours', 'expiryTime'],
    metadata: {
      requiredVariables: ['userName', 'resetUrl', 'expiryHours'],
      category: 'security',
      tags: ['password-reset', 'security', 'authentication']
    }
  },

  // System alert template
  SYSTEM_ALERT: {
    name: 'system_alert',
    subject: '🚨 System Alert: {{alertTitle}}',
    content: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Alert</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { padding: 20px; text-align: center; color: white; }
        .header.critical { background-color: #dc3545; }
        .header.warning { background-color: #fd7e14; }
        .header.info { background-color: #007bff; }
        .alert-title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
        .alert-time { font-size: 14px; opacity: 0.9; }
        .content { padding: 30px 20px; }
        .alert-details { background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e9ecef; }
        .detail-row:last-child { border-bottom: none; margin-bottom: 0; }
        .detail-label { font-weight: 600; color: #495057; }
        .detail-value { color: #6c757d; }
        .actions { background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 6px; }
        .actions h4 { margin-top: 0; color: #495057; }
        .actions ul { margin-bottom: 0; }
        .footer { background-color: #f8f9fa; padding: 15px 20px; text-align: center; border-top: 1px solid #e9ecef; font-size: 14px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header {{severity}}">
            <div class="alert-title">{{alertTitle}}</div>
            <div class="alert-time">{{formatDate timestamp 'datetime'}}</div>
        </div>
        
        <div class="content">
            <p><strong>{{alertType}}</strong></p>
            <p>{{description}}</p>
            
            {{#if details}}
            <div class="alert-details">
                {{#each details}}
                <div class="detail-row">
                    <span class="detail-label">{{@key}}:</span>
                    <span class="detail-value">{{this}}</span>
                </div>
                {{/each}}
            </div>
            {{/if}}
            
            {{#if metrics}}
            <div class="alert-details">
                <h4>📊 Current Metrics:</h4>
                {{#each metrics}}
                <div class="detail-row">
                    <span class="detail-label">{{name}}:</span>
                    <span class="detail-value">{{value}} {{unit}}</span>
                </div>
                {{/each}}
            </div>
            {{/if}}
            
            {{#if recommendedActions}}
            <div class="actions">
                <h4>🔧 Recommended Actions:</h4>
                <ul>
                    {{#each recommendedActions}}
                    <li>{{this}}</li>
                    {{/each}}
                </ul>
            </div>
            {{/if}}
            
            {{#if affectedComponents}}
            <p><strong>Affected Components:</strong> {{join affectedComponents ", "}}</p>
            {{/if}}
            
            {{#if incidentUrl}}
            <p><strong>Incident Details:</strong> <a href="{{incidentUrl}}">View incident report</a></p>
            {{/if}}
        </div>
        
        <div class="footer">
            <p>This alert was generated automatically by the Daily Dev Digest monitoring system.</p>
            {{#if escalationInfo}}
            <p>Escalation: {{escalationInfo}}</p>
            {{/if}}
        </div>
    </div>
</body>
</html>
    `,
    variables: [
      'alertTitle', 'alertType', 'severity', 'description', 'timestamp',
      'details', 'metrics', 'recommendedActions', 'affectedComponents',
      'incidentUrl', 'escalationInfo'
    ],
    metadata: {
      requiredVariables: ['alertTitle', 'alertType', 'severity', 'description'],
      category: 'alerts',
      tags: ['system', 'alert', 'monitoring', 'incident']
    }
  },

  // Job completion notification
  JOB_COMPLETION: {
    name: 'job_completion',
    subject: '{{#if success}}✅{{else}}❌{{/if}} Job {{jobType}} {{#if success}}Completed{{else}}Failed{{/if}}',
    content: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job {{#if success}}Completed{{else}}Failed{{/if}}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { padding: 20px; text-align: center; color: white; }
        .header.success { background-color: #28a745; }
        .header.failed { background-color: #dc3545; }
        .job-title { font-size: 20px; font-weight: bold; }
        .content { padding: 20px; }
        .job-details { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .detail-label { font-weight: 600; color: #495057; }
        .detail-value { color: #6c757d; font-family: monospace; }
        .error-details { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 6px; margin: 15px 0; color: #721c24; }
        .logs { background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 6px; margin: 15px 0; font-family: monospace; font-size: 14px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
        .footer { background-color: #f8f9fa; padding: 15px 20px; text-align: center; border-top: 1px solid #e9ecef; font-size: 14px; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header {{#if success}}success{{else}}failed{{/if}}">
            <div class="job-title">
                {{#if success}}✅ Job Completed{{else}}❌ Job Failed{{/if}}
            </div>
        </div>
        
        <div class="content">
            <div class="job-details">
                <div class="detail-row">
                    <span class="detail-label">Job ID:</span>
                    <span class="detail-value">{{jobId}}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">{{jobType}}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Started:</span>
                    <span class="detail-value">{{formatDate startedAt 'datetime'}}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">{{#if success}}Completed{{else}}Failed{{/if}}:</span>
                    <span class="detail-value">{{formatDate finishedAt 'datetime'}}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Duration:</span>
                    <span class="detail-value">{{duration}}</span>
                </div>
                {{#if retryCount}}
                <div class="detail-row">
                    <span class="detail-label">Retry Attempts:</span>
                    <span class="detail-value">{{retryCount}}</span>
                </div>
                {{/if}}
            </div>
            
            {{#unless success}}
            {{#if error}}
            <div class="error-details">
                <h4>Error Details:</h4>
                <p>{{error}}</p>
            </div>
            {{/if}}
            {{/unless}}
            
            {{#if result}}
            <div class="job-details">
                <h4>{{#if success}}Results{{else}}Failure Information{{/if}}:</h4>
                {{#each result}}
                <div class="detail-row">
                    <span class="detail-label">{{@key}}:</span>
                    <span class="detail-value">{{this}}</span>
                </div>
                {{/each}}
            </div>
            {{/if}}
            
            {{#if logs}}
            <div>
                <h4>Execution Logs:</h4>
                <div class="logs">{{logs}}</div>
            </div>
            {{/if}}
            
            {{#if dashboardUrl}}
            <p><a href="{{dashboardUrl}}">View in Dashboard</a></p>
            {{/if}}
        </div>
        
        <div class="footer">
            <p>This notification was generated automatically by the Daily Dev Digest job processing system.</p>
        </div>
    </div>
</body>
</html>
    `,
    variables: [
      'success', 'jobId', 'jobType', 'startedAt', 'finishedAt', 
      'duration', 'retryCount', 'error', 'result', 'logs', 'dashboardUrl'
    ],
    metadata: {
      requiredVariables: ['success', 'jobId', 'jobType'],
      category: 'job-notifications',
      tags: ['job', 'completion', 'status', 'notification']
    }
  }
};

// Text-only versions for plain text emails
export const EMAIL_TEXT_TEMPLATES = {
  WELCOME: `
Hi {{userName}},

Welcome to Daily Dev Digest! We're excited to help you stay on top of your repository activities with intelligent, automated summaries.

What you can do:
• Smart Analysis: Get AI-powered summaries of pull requests, commits, and issues
• Flexible Scheduling: Choose daily, weekly, or custom digest frequencies
• Multi-Channel Notifications: Receive updates via email, Slack, or webhooks
• Detailed Insights: Track trends, contributor activity, and project health

Get started: {{baseUrl}}/dashboard
Documentation: {{baseUrl}}/docs
Support: {{supportUrl}}

---
You're receiving this email because you signed up for Daily Dev Digest.
Unsubscribe: {{baseUrl}}/unsubscribe/{{unsubscribeToken}}
Manage Preferences: {{baseUrl}}/preferences
  `,

  DIGEST_DELIVERY: `
{{repoName}} Digest - {{dateRange}}

{{#if summary}}
Summary: {{summary}}
{{/if}}

Statistics:
• Pull Requests: {{stats.prCount}}
• Commits: {{stats.commitCount}}
• Contributors: {{stats.contributorCount}}
• Files Changed: {{stats.filesChanged}}

{{#if pullRequests}}
Notable Pull Requests:
{{#each pullRequests}}
• #{{number}} {{title}} by {{author}} ({{status}}) - +{{linesAdded}} -{{linesRemoved}}
  {{url}}
  {{#if aiSummary}}{{aiSummary}}{{/if}}

{{/each}}
{{/if}}

{{#if topContributors}}
Top Contributors:
{{#each topContributors}}
• {{name}} - {{commits}} commits, {{linesChanged}} lines{{#if isNewContributor}} (NEW){{/if}}
{{/each}}
{{/if}}

{{#if insights}}
Key Insights:
{{#each insights}}
• {{this}}
{{/each}}
{{/if}}

View Full Digest: {{digestUrl}}
Visit Repository: {{repoUrl}}

---
You're receiving this digest because you're subscribed to {{repoName}}.
Unsubscribe: {{baseUrl}}/unsubscribe/{{unsubscribeToken}}
Manage Preferences: {{baseUrl}}/preferences
  `,

  PASSWORD_RESET: `
Hi {{userName}},

We received a request to reset your password for your Daily Dev Digest account. If you made this request, use the link below to set a new password:

Reset Password: {{resetUrl}}

This link will expire in {{expiryHours}} hours.

SECURITY TIP: For your protection, this password reset link can only be used once. If you don't use it within {{expiryHours}} hours, you'll need to request a new one.

Didn't request this? If you didn't request a password reset, you can safely ignore this email. Your account is secure and no changes have been made.

---
For security reasons, this email was sent from an automated system. Please do not reply to this email.
  `,

  SYSTEM_ALERT: `
SYSTEM ALERT: {{alertTitle}}
Time: {{formatDate timestamp 'datetime'}}
Type: {{alertType}}
Severity: {{severity}}

{{description}}

{{#if details}}
Details:
{{#each details}}
{{@key}}: {{this}}
{{/each}}
{{/if}}

{{#if metrics}}
Current Metrics:
{{#each metrics}}
{{name}}: {{value}} {{unit}}
{{/each}}
{{/if}}

{{#if recommendedActions}}
Recommended Actions:
{{#each recommendedActions}}
• {{this}}
{{/each}}
{{/if}}

{{#if affectedComponents}}
Affected Components: {{join affectedComponents ", "}}
{{/if}}

{{#if incidentUrl}}
Incident Details: {{incidentUrl}}
{{/if}}

---
This alert was generated automatically by the Daily Dev Digest monitoring system.
{{#if escalationInfo}}
Escalation: {{escalationInfo}}
{{/if}}
  `,

  JOB_COMPLETION: `
Job {{#if success}}Completed{{else}}Failed{{/if}}: {{jobType}}

Job ID: {{jobId}}
Type: {{jobType}}
Started: {{formatDate startedAt 'datetime'}}
{{#if success}}Completed{{else}}Failed{{/if}}: {{formatDate finishedAt 'datetime'}}
Duration: {{duration}}
{{#if retryCount}}Retry Attempts: {{retryCount}}{{/if}}

{{#unless success}}
{{#if error}}
Error: {{error}}
{{/if}}
{{/unless}}

{{#if result}}
{{#if success}}Results{{else}}Failure Information{{/if}}:
{{#each result}}
{{@key}}: {{this}}
{{/each}}
{{/if}}

{{#if logs}}
Execution Logs:
{{logs}}
{{/if}}

{{#if dashboardUrl}}
View in Dashboard: {{dashboardUrl}}
{{/if}}

---
This notification was generated automatically by the Daily Dev Digest job processing system.
  `
};