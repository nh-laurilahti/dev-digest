/**
 * GitHub Integration Example
 * 
 * This file demonstrates how to use the comprehensive GitHub integration
 * system for the Daily Dev Digest application.
 */

import { 
  GitHubClient,
  RepositoryService,
  PullRequestService,
  RepoValidationService,
  WebhookService,
  GitHubDataProcessor
} from '../services';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

// Example configuration for different use cases
const EXAMPLE_REPOSITORIES = [
  { owner: 'microsoft', repo: 'vscode' },
  { owner: 'facebook', repo: 'react' },
  { owner: 'nodejs', repo: 'node' },
];

/**
 * Example 1: Basic GitHub Client Setup and Testing
 */
async function example1_basicClientSetup() {
  console.log('\n=== Example 1: Basic GitHub Client Setup ===');
  
  // Initialize the GitHub client
  const client = new GitHubClient({
    token: config.GITHUB_TOKEN,
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 1000,
    },
    rateLimit: {
      enabled: true,
      strategy: 'exponential',
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
    },
  });

  try {
    // Test the connection
    const connectionTest = await client.testConnection();
    console.log('Connection Test Result:', {
      connected: connectionTest.connected,
      user: connectionTest.user,
      scopes: connectionTest.scopes,
      rateLimit: connectionTest.rateLimit,
    });

    // Check current rate limits
    const rateLimits = await client.getRateLimit();
    console.log('Current Rate Limits:', {
      core: rateLimits.core,
      search: rateLimits.search,
      graphql: rateLimits.graphql,
    });

    // Get cache statistics
    const cacheStats = client.getCacheStats();
    console.log('Cache Statistics:', cacheStats);

  } catch (error) {
    console.error('Client setup failed:', error);
  }
}

/**
 * Example 2: Repository Information and Validation
 */
async function example2_repositoryValidation() {
  console.log('\n=== Example 2: Repository Information and Validation ===');
  
  const client = new GitHubClient();
  const repositoryService = new RepositoryService(client);
  const validationService = new RepoValidationService(client);

  try {
    const { owner, repo } = EXAMPLE_REPOSITORIES[0];

    // Get repository information
    const repository = await repositoryService.getRepository(owner, repo);
    console.log('Repository Info:', {
      name: repository.full_name,
      description: repository.description,
      language: repository.language,
      stars: repository.stargazers_count,
      forks: repository.forks_count,
      private: repository.private,
      archived: repository.archived,
    });

    // Validate repository access
    const validation = await validationService.validateRepository(owner, repo, {
      checkPermissions: true,
      checkRateLimit: true,
      checkContent: true,
    });

    console.log('Validation Result:', {
      isValid: validation.isValid,
      permissions: validation.permissions,
      metadata: validation.metadata,
      errors: validation.errors,
      warnings: validation.warnings,
    });

    // Check if repository is ready for digest generation
    const digestValidation = await validationService.validateRepositoryForDigest(owner, repo);
    console.log('Digest Readiness:', digestValidation.digestReadiness);

  } catch (error) {
    console.error('Repository validation failed:', error);
  }
}

/**
 * Example 3: Pull Request Analysis
 */
async function example3_pullRequestAnalysis() {
  console.log('\n=== Example 3: Pull Request Analysis ===');
  
  const client = new GitHubClient();
  const pullRequestService = new PullRequestService(client);

  try {
    const { owner, repo } = EXAMPLE_REPOSITORIES[0];

    // Get recent pull requests
    const pullRequests = await pullRequestService.getPullRequests(owner, repo, {
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 10,
    });

    console.log(`Found ${pullRequests.length} recent pull requests`);

    // Get enhanced PR data for the first PR
    if (pullRequests.length > 0) {
      const enhancedPR = await pullRequestService.getEnhancedPullRequest(
        owner, repo, pullRequests[0].number, {
          includeReviews: true,
          includeFiles: true,
          includeCommits: true,
        }
      );

      console.log('Enhanced PR Analysis:', {
        number: enhancedPR.number,
        title: enhancedPR.title,
        author: enhancedPR.user.login,
        state: enhancedPR.state,
        merged: enhancedPR.merged,
        additions: enhancedPR.additions,
        deletions: enhancedPR.deletions,
        changedFiles: enhancedPR.changed_files,
        reviews: enhancedPR.reviews?.length || 0,
        reviewers: enhancedPR.reviewers?.map(r => r.login) || [],
        activityScore: enhancedPR.activity_score,
        complexityScore: enhancedPR.complexity_score,
        filesChanged: enhancedPR.files_changed?.length || 0,
      });
    }

    // Get PR statistics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const prStats = await pullRequestService.getPullRequestsWithStats(owner, repo, {
      since: thirtyDaysAgo.toISOString(),
      until: new Date().toISOString(),
      state: 'all',
      includeEnhanced: false,
    });

    console.log('30-Day PR Statistics:', prStats.statistics);

  } catch (error) {
    console.error('Pull request analysis failed:', error);
  }
}

/**
 * Example 4: Contributor Analysis
 */
async function example4_contributorAnalysis() {
  console.log('\n=== Example 4: Contributor Analysis ===');
  
  const client = new GitHubClient();
  const pullRequestService = new PullRequestService(client);
  const repositoryService = new RepositoryService(client);

  try {
    const { owner, repo } = EXAMPLE_REPOSITORIES[1];

    // Get repository contributors
    const contributors = await repositoryService.getContributors(owner, repo, {
      per_page: 20,
    });

    console.log(`Found ${contributors.length} contributors`);
    console.log('Top 5 Contributors:', contributors.slice(0, 5).map(c => ({
      login: c.login,
      contributions: c.contributions,
      avatar: c.avatar_url,
    })));

    // Analyze contributor activity over the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const contributorAnalysis = await pullRequestService.analyzeContributorActivity(
      owner, repo, {
        since: ninetyDaysAgo.toISOString(),
        until: new Date().toISOString(),
      }
    );

    if (contributorAnalysis.length > 0) {
      const topContributor = contributorAnalysis[0];
      console.log('Top Contributor Analysis:', {
        user: topContributor.user.login,
        totalContributions: topContributor.total_contributions,
        pullRequests: topContributor.pull_requests,
        reviews: topContributor.reviews,
        expertiseAreas: topContributor.expertise_areas.slice(0, 5),
        collaborationScore: topContributor.collaboration_score,
      });
    }

  } catch (error) {
    console.error('Contributor analysis failed:', error);
  }
}

/**
 * Example 5: Comprehensive Digest Generation
 */
async function example5_digestGeneration() {
  console.log('\n=== Example 5: Comprehensive Digest Generation ===');
  
  const client = new GitHubClient();
  const dataProcessor = new GitHubDataProcessor(client);

  try {
    const { owner, repo } = EXAMPLE_REPOSITORIES[2];

    // Generate digest for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const digest = await dataProcessor.generateDigest(owner, repo, {
      period: {
        start: sevenDaysAgo.toISOString(),
        end: new Date().toISOString(),
      },
      includeDetailed: true,
      maxPullRequests: 20,
      maxCommits: 50,
      includeInsights: true,
    });

    console.log('Digest Summary:', {
      repository: digest.repository.full_name,
      period: digest.period,
      summary: digest.summary,
      pullRequestsOpened: digest.pullRequests.opened.length,
      pullRequestsMerged: digest.pullRequests.merged.length,
      recentCommits: digest.commits.recent.length,
      activeContributors: digest.contributors.active.length,
      newContributors: digest.contributors.new.length,
      trends: digest.insights.trends,
      highlights: digest.insights.highlights,
      concerns: digest.insights.concerns,
      apiCallsUsed: digest.metadata.apiCallsUsed,
    });

    // Generate activity summary
    const activitySummary = await dataProcessor.getActivitySummary(owner, repo, {
      start: sevenDaysAgo.toISOString(),
      end: new Date().toISOString(),
    });

    console.log('Activity Summary:', activitySummary);

  } catch (error) {
    console.error('Digest generation failed:', error);
  }
}

/**
 * Example 6: Webhook Management
 */
async function example6_webhookManagement() {
  console.log('\n=== Example 6: Webhook Management ===');
  
  const client = new GitHubClient();
  const webhookService = new WebhookService(client);

  try {
    const { owner, repo } = { owner: 'your-username', repo: 'your-repo' }; // Use your own repo

    // Setup webhook (commented out to avoid actual webhook creation)
    /*
    const webhook = await webhookService.setupRepositoryWebhook(owner, repo, {
      url: 'https://your-app.com/webhooks/github',
      secret: 'your-webhook-secret',
      events: [
        'push',
        'pull_request',
        'pull_request_review',
        'issues',
        'release',
      ],
      active: true,
    });

    console.log('Webhook created:', webhook);
    */

    // Get existing webhooks
    const webhooks = await webhookService.getRepositoryWebhooks(owner, repo);
    console.log(`Found ${webhooks.length} webhooks for ${owner}/${repo}`);

    // Process a mock webhook event
    const mockPayload = {
      action: 'opened',
      pull_request: {
        id: 123,
        number: 1,
        title: 'Test PR',
        user: { login: 'testuser' },
        state: 'open',
        draft: false,
      },
      repository: {
        id: 456,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: { login: owner },
        private: false,
      },
      sender: { login: 'testuser', type: 'User' },
    };

    // Verify webhook signature (using a test signature)
    const testSignature = 'sha256=test-signature';
    const verification = webhookService.verifySignature(
      JSON.stringify(mockPayload),
      testSignature,
      'test-secret'
    );

    console.log('Webhook verification (test):', verification);

  } catch (error) {
    console.error('Webhook management failed:', error);
  }
}

/**
 * Example 7: Batch Repository Analysis
 */
async function example7_batchAnalysis() {
  console.log('\n=== Example 7: Batch Repository Analysis ===');
  
  const client = new GitHubClient();
  const validationService = new RepoValidationService(client);
  const dataProcessor = new GitHubDataProcessor(client);

  try {
    // Validate multiple repositories
    const validations = await validationService.validateRepositories(
      EXAMPLE_REPOSITORIES.slice(0, 2),
      {
        checkPermissions: true,
        checkRateLimit: false, // Skip rate limit check for batch
        checkContent: false,
      }
    );

    console.log('Batch Validation Results:');
    for (const [repoKey, validation] of validations) {
      console.log(`${repoKey}:`, {
        valid: validation.isValid,
        private: validation.metadata.private,
        archived: validation.metadata.archived,
        language: validation.metadata.language,
        errors: validation.errors.length,
        warnings: validation.warnings.length,
      });
    }

    // Compare activity across different time periods
    const { owner, repo } = EXAMPLE_REPOSITORIES[0];
    
    const periods = [
      {
        name: 'Last 7 days',
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      {
        name: 'Previous 7 days',
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const comparison = await dataProcessor.compareActivityPeriods(owner, repo, periods);
    
    console.log('Activity Period Comparison:');
    for (const [periodName, data] of Object.entries(comparison)) {
      console.log(`${periodName}:`, {
        commits: data.summary.commits,
        pullRequests: data.summary.pullRequests,
        contributors: data.summary.contributors,
        activityScore: data.summary.activityScore,
        trend: data.comparison.trend,
        vsAverage: `${data.comparison.vsAverage}%`,
      });
    }

  } catch (error) {
    console.error('Batch analysis failed:', error);
  }
}

/**
 * Example 8: Error Handling and Rate Limiting
 */
async function example8_errorHandling() {
  console.log('\n=== Example 8: Error Handling and Rate Limiting ===');
  
  const client = new GitHubClient({
    rateLimit: {
      enabled: true,
      strategy: 'exponential',
      maxRetries: 2,
      initialDelay: 500,
      maxDelay: 5000,
    },
  });

  try {
    // Test with a non-existent repository
    const repositoryService = new RepositoryService(client);
    
    try {
      await repositoryService.getRepository('nonexistent-user', 'nonexistent-repo');
    } catch (error) {
      console.log('Expected error for non-existent repo:', {
        name: error.name,
        message: error.message,
        status: error.status,
      });
    }

    // Test rate limit handling
    console.log('Testing rate limit handling...');
    const rateLimits = await client.getRateLimit();
    
    console.log('Current rate limits:', {
      remaining: rateLimits.core?.remaining,
      limit: rateLimits.core?.limit,
      reset: rateLimits.core?.reset,
    });

    // Check if we can make requests
    const canMakeRequest = client.canMakeRequest('core');
    console.log('Can make request:', canMakeRequest);

    if (!canMakeRequest) {
      const timeUntilReset = client.getTimeUntilReset('core');
      console.log('Time until reset (ms):', timeUntilReset);
    }

  } catch (error) {
    console.error('Error handling test failed:', error);
  }
}

/**
 * Main execution function
 */
async function runExamples() {
  console.log('🚀 GitHub Integration Examples');
  console.log('==============================');

  try {
    await example1_basicClientSetup();
    await example2_repositoryValidation();
    await example3_pullRequestAnalysis();
    await example4_contributorAnalysis();
    await example5_digestGeneration();
    await example6_webhookManagement();
    await example7_batchAnalysis();
    await example8_errorHandling();

    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('❌ Examples failed:', error);
  }
}

// Export for use in other files
export {
  example1_basicClientSetup,
  example2_repositoryValidation,
  example3_pullRequestAnalysis,
  example4_contributorAnalysis,
  example5_digestGeneration,
  example6_webhookManagement,
  example7_batchAnalysis,
  example8_errorHandling,
  runExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}