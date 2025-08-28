/**
 * Slack Templates
 * Pre-defined Slack message templates with blocks and attachments
 */

export const SLACK_TEMPLATES = {
  // Digest notification template
  DIGEST_NOTIFICATION: {
    name: 'digest_notification',
    content: JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 New Digest Available: {{repoName}}'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '{{dateRange}} • Generated {{formatDate _system.timestamp "relative"}}'
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#if summary}}*Summary:*\n{{summary}}{{else}}Here\'s what happened in {{repoName}} during {{dateRange}}.{{/if}}'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Pull Requests:*\n{{stats.prCount}}'
            },
            {
              type: 'mrkdwn',
              text: '*Commits:*\n{{stats.commitCount}}'
            },
            {
              type: 'mrkdwn',
              text: '*Contributors:*\n{{stats.contributorCount}}'
            },
            {
              type: 'mrkdwn',
              text: '*Files Changed:*\n{{stats.filesChanged}}'
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔀 Notable Pull Requests*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#each (limit pullRequests 3)}}>*<{{url}}|#{{number}} {{truncate title 60}}>*\n>by {{author}} • {{status}} • +{{linesAdded}} -{{linesRemoved}}\n>{{#if aiSummary}}{{truncate aiSummary 100}}{{/if}}\n\n{{/each}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Full Digest'
              },
              url: '{{digestUrl}}',
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Repository'
              },
              url: '{{repoUrl}}'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Unsubscribe'
              },
              url: '{{baseUrl}}/unsubscribe/{{unsubscribeToken}}'
            }
          ]
        }
      ]
    }),
    variables: [
      'repoName', 'dateRange', 'summary', 'stats', 'pullRequests',
      'digestUrl', 'repoUrl', 'baseUrl', 'unsubscribeToken'
    ],
    metadata: {
      requiredVariables: ['repoName', 'dateRange', 'stats'],
      category: 'digest',
      tags: ['digest', 'repository', 'summary']
    }
  },

  // System alert template
  SYSTEM_ALERT: {
    name: 'system_alert',
    content: JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 System Alert'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*{{alertType}}:* {{alertTitle}}\n*Severity:* {{capitalize severity}}\n*Time:* {{formatDate timestamp "datetime"}}'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{description}}'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Component:*\n{{component}}'
            },
            {
              type: 'mrkdwn',
              text: '*Environment:*\n{{environment}}'
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📊 Current Metrics*\n{{#each metrics}}>{{name}}: *{{value}}* {{unit}}\n{{/each}}'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔧 Recommended Actions*\n{{#each recommendedActions}}>• {{this}}\n{{/each}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Incident'
              },
              url: '{{incidentUrl}}',
              style: 'danger'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Dashboard'
              },
              url: '{{dashboardUrl}}'
            }
          ]
        }
      ]
    }),
    variables: [
      'alertType', 'alertTitle', 'severity', 'timestamp', 'description',
      'component', 'environment', 'metrics', 'recommendedActions',
      'incidentUrl', 'dashboardUrl'
    ],
    metadata: {
      requiredVariables: ['alertType', 'alertTitle', 'severity', 'description'],
      category: 'alerts',
      tags: ['system', 'alert', 'monitoring']
    }
  },

  // Welcome message template
  WELCOME_MESSAGE: {
    name: 'welcome_message',
    content: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '👋 Hey {{userName}}! Welcome to *Daily Dev Digest*!\n\nI\'m here to help you stay updated with the latest repository activities through intelligent, automated summaries.'
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🚀 What I can do for you:*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '• *🔍 Smart Analysis* - AI-powered summaries of PRs, commits, and issues\n• *📅 Flexible Scheduling* - Daily, weekly, or custom digest frequencies\n• *🔔 Multi-Channel Notifications* - Email, Slack, and webhook integrations\n• *📈 Detailed Insights* - Track trends, contributor activity, and project health'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🛠️ Available Commands:*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '• `/digest create` - Generate a new digest for a repository\n• `/digest subscribe` - Subscribe to repository updates\n• `/digest preferences` - Manage your notification settings\n• `/digest help` - Show all available commands'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Get Started'
              },
              url: '{{baseUrl}}/dashboard',
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Documentation'
              },
              url: '{{baseUrl}}/docs'
            }
          ]
        }
      ]
    }),
    variables: ['userName', 'baseUrl'],
    metadata: {
      requiredVariables: ['userName'],
      category: 'onboarding',
      tags: ['welcome', 'getting-started']
    }
  },

  // Job completion notification
  JOB_COMPLETION: {
    name: 'job_completion',
    content: JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '{{#if success}}✅ Job Completed{{else}}❌ Job Failed{{/if}}'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Job ID:*\n`{{jobId}}`'
            },
            {
              type: 'mrkdwn',
              text: '*Type:*\n{{capitalize jobType}}'
            },
            {
              type: 'mrkdwn',
              text: '*Duration:*\n{{duration}}'
            },
            {
              type: 'mrkdwn',
              text: '*Status:*\n{{#if success}}:white_check_mark: Success{{else}}:x: Failed{{/if}}'
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Started: {{formatDate startedAt "datetime"}} • Finished: {{formatDate finishedAt "datetime"}}'
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#if success}}*Results:*\n{{#each result}}>{{@key}}: {{this}}\n{{/each}}{{else}}*Error:*\n```{{error}}```{{/if}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Details'
              },
              url: '{{dashboardUrl}}/jobs/{{jobId}}'
            }
          ]
        }
      ]
    }),
    variables: [
      'success', 'jobId', 'jobType', 'duration', 'startedAt', 
      'finishedAt', 'result', 'error', 'dashboardUrl'
    ],
    metadata: {
      requiredVariables: ['success', 'jobId', 'jobType'],
      category: 'job-notifications',
      tags: ['job', 'completion', 'status']
    }
  },

  // PR summary notification
  PR_SUMMARY: {
    name: 'pr_summary',
    content: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔀 Pull Request Summary*\n<{{url}}|#{{number}} {{title}}>'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'by {{author}} in {{repoName}} • {{status}} • {{formatDate createdAt "relative"}}'
            }
          ]
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Changes:*\n+{{linesAdded}} -{{linesRemoved}}'
            },
            {
              type: 'mrkdwn',
              text: '*Files:*\n{{filesChanged}}'
            },
            {
              type: 'mrkdwn',
              text: '*Reviews:*\n{{reviewCount}}'
            },
            {
              type: 'mrkdwn',
              text: '*Comments:*\n{{commentCount}}'
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📝 AI Summary:*\n{{aiSummary}}'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🏷️ Labels:*\n{{#each labels}}`{{name}}` {{/each}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View PR'
              },
              url: '{{url}}',
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Diff'
              },
              url: '{{url}}/files'
            }
          ]
        }
      ]
    }),
    variables: [
      'number', 'title', 'url', 'author', 'repoName', 'status', 
      'createdAt', 'linesAdded', 'linesRemoved', 'filesChanged',
      'reviewCount', 'commentCount', 'aiSummary', 'labels'
    ],
    metadata: {
      requiredVariables: ['number', 'title', 'url', 'author', 'repoName'],
      category: 'pr-notifications',
      tags: ['pull-request', 'summary', 'code-review']
    }
  },

  // Daily standup template
  DAILY_STANDUP: {
    name: 'daily_standup',
    content: JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📅 Daily Development Update'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '{{formatDate date "long"}} • {{teamName}}'
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🚀 Yesterday\'s Highlights*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#each yesterday.highlights}}>• {{this}}\n{{/each}}'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*PRs Merged:*\n{{yesterday.prsMerged}}'
            },
            {
              type: 'mrkdwn',
              text: '*Issues Closed:*\n{{yesterday.issuesClosed}}'
            },
            {
              type: 'mrkdwn',
              text: '*New Commits:*\n{{yesterday.commits}}'
            },
            {
              type: 'mrkdwn',
              text: '*Active Contributors:*\n{{yesterday.contributors}}'
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎯 Today\'s Focus*'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#each today.priorities}}>• {{this}}\n{{/each}}'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🚧 Blockers & Issues*\n{{#if blockers}}{{#each blockers}}>⚠️ {{this}}\n{{/each}}{{else}}>✅ No blockers reported{{/if}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Dashboard'
              },
              url: '{{dashboardUrl}}'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Add Update'
              },
              url: '{{updateUrl}}'
            }
          ]
        }
      ]
    }),
    variables: [
      'date', 'teamName', 'yesterday', 'today', 'blockers',
      'dashboardUrl', 'updateUrl'
    ],
    metadata: {
      requiredVariables: ['date', 'yesterday', 'today'],
      category: 'standup',
      tags: ['daily', 'standup', 'team', 'progress']
    }
  },

  // Deployment notification
  DEPLOYMENT_NOTIFICATION: {
    name: 'deployment_notification',
    content: JSON.stringify({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 Deployment {{#if success}}Successful{{else}}Failed{{/if}}'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '*Application:*\n{{appName}}'
            },
            {
              type: 'mrkdwn',
              text: '*Environment:*\n{{environment}}'
            },
            {
              type: 'mrkdwn',
              text: '*Version:*\n`{{version}}`'
            },
            {
              type: 'mrkdwn',
              text: '*Duration:*\n{{duration}}'
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Deployed by {{deployedBy}} • {{formatDate timestamp "datetime"}}'
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📋 Changes in this release:*\n{{#each changes}}>• {{this}}\n{{/each}}'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '{{#if success}}*✅ Deployment completed successfully!*\n\n*Health checks:*\n{{#each healthChecks}}>{{#if passed}}✅{{else}}❌{{/if}} {{name}}: {{status}}\n{{/each}}{{else}}*❌ Deployment failed*\n\n*Error:*\n```{{error}}```\n\n*Rollback status:* {{rollbackStatus}}{{/if}}'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '{{#if success}}View Application{{else}}View Logs{{/if}}'
              },
              url: '{{#if success}}{{appUrl}}{{else}}{{logsUrl}}{{/if}}',
              style: '{{#if success}}primary{{else}}danger{{/if}}'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Monitoring'
              },
              url: '{{monitoringUrl}}'
            }
          ]
        }
      ]
    }),
    variables: [
      'success', 'appName', 'environment', 'version', 'duration',
      'deployedBy', 'timestamp', 'changes', 'healthChecks',
      'error', 'rollbackStatus', 'appUrl', 'logsUrl', 'monitoringUrl'
    ],
    metadata: {
      requiredVariables: ['success', 'appName', 'environment', 'version'],
      category: 'deployment',
      tags: ['deployment', 'release', 'devops']
    }
  },

  // User mention template
  USER_MENTION: {
    name: 'user_mention',
    content: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '👋 Hey {{slackMention userId}}! You were mentioned in {{context}}:'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '>{{message}}'
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'From {{mentionedBy}} • {{formatDate timestamp "relative"}}'
            }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Context'
              },
              url: '{{contextUrl}}',
              style: 'primary'
            }
          ]
        }
      ]
    }),
    variables: ['userId', 'context', 'message', 'mentionedBy', 'timestamp', 'contextUrl'],
    metadata: {
      requiredVariables: ['userId', 'context', 'message'],
      category: 'mentions',
      tags: ['mention', 'user', 'notification']
    }
  }
};

// Simple text-based templates for fallback
export const SLACK_TEXT_TEMPLATES = {
  DIGEST_NOTIFICATION: `📊 *{{repoName}} Digest* ({{dateRange}})

{{#if summary}}{{summary}}{{else}}Here's what happened in {{repoName}} during {{dateRange}}.{{/if}}

*Stats:* {{stats.prCount}} PRs • {{stats.commitCount}} commits • {{stats.contributorCount}} contributors

*Notable PRs:*
{{#each (limit pullRequests 3)}}• <{{url}}|#{{number}} {{title}}> by {{author}} (+{{linesAdded}} -{{linesRemoved}})
{{/each}}

<{{digestUrl}}|View Full Digest> | <{{repoUrl}}|Repository>`,

  SYSTEM_ALERT: `🚨 *SYSTEM ALERT*
*{{alertType}}:* {{alertTitle}}
*Severity:* {{severity}}
*Time:* {{formatDate timestamp "datetime"}}

{{description}}

*Metrics:*
{{#each metrics}}{{name}}: {{value}} {{unit}}
{{/each}}

*Actions:*
{{#each recommendedActions}}• {{this}}
{{/each}}`,

  WELCOME_MESSAGE: `👋 Hey {{userName}}! Welcome to *Daily Dev Digest*!

I'm here to help you stay updated with repository activities through intelligent summaries.

*Commands:*
• \`/digest create\` - Generate new digest
• \`/digest subscribe\` - Subscribe to updates  
• \`/digest preferences\` - Manage settings
• \`/digest help\` - Show all commands

<{{baseUrl}}/dashboard|Get Started> | <{{baseUrl}}/docs|Documentation>`,

  JOB_COMPLETION: `{{#if success}}✅{{else}}❌{{/if}} *Job {{#if success}}Completed{{else}}Failed{{/if}}*

*ID:* \`{{jobId}}\`
*Type:* {{jobType}}
*Duration:* {{duration}}

{{#if success}}*Results:*
{{#each result}}{{@key}}: {{this}}
{{/each}}{{else}}*Error:* {{error}}{{/if}}

<{{dashboardUrl}}/jobs/{{jobId}}|View Details>`,

  PR_SUMMARY: `🔀 *Pull Request Summary*
<{{url}}|#{{number}} {{title}}>

*Author:* {{author}} • *Status:* {{status}}
*Changes:* +{{linesAdded}} -{{linesRemoved}} • {{filesChanged}} files

*AI Summary:* {{aiSummary}}

<{{url}}|View PR> | <{{url}}/files|View Diff>`
};