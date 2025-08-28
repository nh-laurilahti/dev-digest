#!/usr/bin/env bun

import { GitHubClient } from './src/clients/github';
import { PullRequestService } from './src/services/pull-requests';
import { AISummaryService } from './src/services/ai-summary';
import { config } from './src/lib/config';
import { logger } from './src/lib/logger';

async function testGitHubIntegration() {
  console.log('🔍 Testing GitHub API integration...');
  
  try {
    const client = new GitHubClient();
    
    // Test connection
    console.log('Testing GitHub connection...');
    const connectionTest = await client.testConnection();
    console.log('GitHub Connection:', connectionTest);
    
    if (!connectionTest.connected) {
      throw new Error('GitHub connection failed');
    }
    
    // Test rate limits
    console.log('Getting rate limits...');
    const rateLimits = await client.getRateLimit();
    console.log('Rate Limits:', {
      core: `${rateLimits.core.remaining}/${rateLimits.core.limit}`,
      search: `${rateLimits.search?.remaining || 0}/${rateLimits.search?.limit || 0}`
    });
    
    // Test repository data fetching
    console.log('Testing repository access...');
    const prService = new PullRequestService(client);
    
    // Test with a popular repository
    const prs = await prService.getPullRequests('microsoft', 'vscode', {
      state: 'closed',
      per_page: 5
    });
    
    console.log(`✅ Successfully fetched ${prs.length} PRs from microsoft/vscode`);
    
    if (prs.length > 0) {
      console.log('Sample PR:', {
        number: prs[0].number,
        title: prs[0].title,
        author: prs[0].user.login,
        merged: prs[0].merged,
        additions: prs[0].additions,
        deletions: prs[0].deletions
      });
      
      // Test enhanced PR data
      console.log('Testing enhanced PR data...');
      const enhanced = await prService.getEnhancedPullRequest('microsoft', 'vscode', prs[0].number, {
        includeFiles: true,
        includeReviews: true
      });
      
      console.log('Enhanced PR data:', {
        filesChanged: enhanced.files_changed?.length || 0,
        reviews: enhanced.reviews?.length || 0,
        activityScore: enhanced.activity_score,
        complexityScore: enhanced.complexity_score
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ GitHub integration test failed:', error);
    return false;
  }
}

async function testOpenAIIntegration() {
  console.log('🤖 Testing OpenAI API integration...');
  
  if (!config.OPENAI_API_KEY) {
    console.log('⚠️ OpenAI API key not configured, skipping test');
    return false;
  }
  
  try {
    const aiService = new AISummaryService();
    
    // Test basic AI call with a simple prompt
    console.log('Testing OpenAI API call...');
    const testResponse = await (aiService as any).callOpenAI(
      'Summarize what a pull request is in software development in one sentence.',
      'You are a technical documentation expert. Provide clear, concise explanations.'
    );
    
    console.log('✅ OpenAI API Response:', testResponse);
    
    // Test with mock PR data for digest insights
    console.log('Testing digest insights generation...');
    const mockStatistics = {
      repository: { name: 'test-repo', owner: 'test-org' },
      period: { from: new Date('2023-11-01'), to: new Date('2023-11-07'), days: 7 },
      pullRequests: {
        total: 10,
        merged: 8,
        byType: { feature: 5, bugfix: 3, refactor: 2 },
        byImpact: { minor: 6, moderate: 3, major: 1 },
        averageTimeToMerge: 24,
        averageLinesPerPR: 150,
        byAuthor: { 'dev1': 4, 'dev2': 3, 'dev3': 3 }
      },
      contributors: {
        total: 3,
        topContributors: [
          { name: 'dev1', prs: 4, linesChanged: 600 },
          { name: 'dev2', prs: 3, linesChanged: 450 }
        ]
      },
      trends: {
        reviewCoverage: 85,
        prVelocity: 1.4,
        commitVelocity: 5.2,
        codeChurnRate: 750
      }
    };
    
    const mockPRAnalyses = [
      {
        id: 123,
        number: 123,
        title: 'Add user authentication feature',
        author: 'dev1',
        type: 'feature',
        impact: 'major',
        complexity: 'complex',
        riskLevel: 'medium',
        linesAdded: 200,
        linesDeleted: 50,
        filesChanged: 8,
        comments: 3,
        reviewComments: 5,
        labels: ['feature', 'auth'],
        description: 'Implements JWT-based authentication with role-based access control'
      } as any
    ];
    
    const insights = await aiService.generateDigestInsights(mockStatistics as any, mockPRAnalyses, {});
    
    console.log('✅ Generated digest insights:');
    console.log('Summary:', insights.summary?.substring(0, 100) + '...');
    console.log('Risk Level:', insights.riskAssessment?.level);
    console.log('Recommendations:', insights.recommendations?.slice(0, 2));
    
    return true;
  } catch (error) {
    console.error('❌ OpenAI integration test failed:', error);
    return false;
  }
}

async function testFullWorkflow() {
  console.log('🔄 Testing full digest generation workflow...');
  
  try {
    const client = new GitHubClient();
    const prService = new PullRequestService(client);
    
    // Get some real PRs for testing
    const prs = await prService.getPullRequestsWithStats('microsoft', 'vscode', {
      state: 'closed',
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
    });
    
    console.log(`Found ${prs.pullRequests.length} PRs from the last 7 days`);
    console.log('Statistics:', {
      total: prs.statistics.total,
      merged: prs.statistics.merged,
      contributors: prs.statistics.contributors.length,
      topContributor: prs.statistics.mostActiveContributor
    });
    
    if (config.OPENAI_API_KEY && prs.pullRequests.length > 0) {
      const aiService = new AISummaryService();
      
      // Convert to the format expected by AI service
      const prAnalyses = prs.pullRequests.slice(0, 3).map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        type: 'feature', // Simplified for test
        impact: 'moderate',
        complexity: 'moderate',
        riskLevel: 'low',
        linesAdded: pr.additions || 0,
        linesDeleted: pr.deletions || 0,
        filesChanged: pr.changed_files || 0,
        comments: pr.comments || 0,
        reviewComments: pr.review_comments || 0,
        labels: pr.labels?.map(l => l.name) || [],
        description: pr.body || ''
      })) as any;
      
      console.log('Generating AI insights for real PR data...');
      const mockStats = {
        repository: { name: 'vscode', owner: 'microsoft' },
        period: { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), to: new Date(), days: 7 },
        pullRequests: {
          total: prs.statistics.total,
          merged: prs.statistics.merged,
          byType: { feature: Math.floor(prs.statistics.total * 0.6), bugfix: Math.floor(prs.statistics.total * 0.4) },
          byImpact: { minor: Math.floor(prs.statistics.total * 0.5), moderate: Math.floor(prs.statistics.total * 0.3), major: Math.floor(prs.statistics.total * 0.2) },
          averageTimeToMerge: 48,
          averageLinesPerPR: prs.statistics.totalAdditions / prs.statistics.total,
          byAuthor: {}
        },
        contributors: {
          total: prs.statistics.contributors.length,
          topContributors: prs.statistics.contributors.slice(0, 5).map(c => ({ name: c, prs: 1, linesChanged: 100 }))
        },
        trends: {
          reviewCoverage: 90,
          prVelocity: prs.statistics.total / 7,
          commitVelocity: 10,
          codeChurnRate: prs.statistics.totalAdditions + prs.statistics.totalDeletions
        }
      };
      
      const insights = await aiService.generateDigestInsights(mockStats as any, prAnalyses, {});
      
      console.log('✅ Full workflow completed!');
      console.log('AI Summary:', insights.summary?.substring(0, 200) + '...');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Full workflow test failed:', error);
    return false;
  }
}

async function main() {
  console.log('🧪 Running Daily Dev Digest Integration Tests\n');
  
  const results = {
    github: await testGitHubIntegration(),
    openai: await testOpenAIIntegration(),
    workflow: await testFullWorkflow()
  };
  
  console.log('\n📊 Test Results:');
  console.log(`GitHub Integration: ${results.github ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`OpenAI Integration: ${results.openai ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Full Workflow: ${results.workflow ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(result => result);
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});