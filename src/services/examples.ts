import { DigestService } from './digests';
import { DigestOptions, GitHubPullRequest, GenerationResult } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * Examples and Usage Demonstrations
 * 
 * This file contains practical examples of how to use the digest generation system
 * for various use cases and scenarios.
 */

/**
 * Example: Basic digest generation
 */
export async function basicDigestExample(): Promise<void> {
  logger.info('Running basic digest example...');

  const digestService = new DigestService();

  const options: DigestOptions = {
    repository: 'facebook/react',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-31'),
    detailLevel: 'detailed',
    format: 'markdown',
    includeAISummary: false
  };

  try {
    const result = await digestService.generateDigestFromRepository(options);
    
    if (result.success) {
      console.log('✅ Digest generated successfully!');
      console.log(`Processing time: ${result.metadata.processingTime}ms`);
      console.log(`Data points processed: ${result.metadata.dataPoints}`);
      console.log('First 500 characters of markdown:');
      console.log(result.markdown?.substring(0, 500) + '...');
    } else {
      console.error('❌ Digest generation failed:', result.error?.message);
    }
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

/**
 * Example: AI-enhanced digest generation
 */
export async function aiEnhancedDigestExample(): Promise<void> {
  logger.info('Running AI-enhanced digest example...');

  const digestService = new DigestService();

  const options: DigestOptions = {
    repository: 'microsoft/vscode',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-07'),
    detailLevel: 'comprehensive',
    format: 'html',
    includeAISummary: true,
    includeCodeAnalysis: true,
    aiProvider: 'openai',
    outputPreferences: {
      includeEmojis: true,
      includeCharts: true,
      includeTrends: true
    }
  };

  try {
    const result = await digestService.generateDigestFromRepository(options);
    
    if (result.success && result.digest?.aiInsights) {
      console.log('✅ AI-enhanced digest generated!');
      console.log('AI Summary:', result.digest.aiInsights.summary);
      console.log('Risk Level:', result.digest.aiInsights.riskAssessment.level);
      console.log('Recommendations:', result.digest.aiInsights.recommendations.slice(0, 3));
    } else {
      console.log('⚠️ Digest generated but without AI insights');
    }
  } catch (error) {
    console.error('❌ AI example failed:', error);
  }
}

/**
 * Example: Custom template usage
 */
export async function customTemplateExample(): Promise<void> {
  logger.info('Running custom template example...');

  const digestService = new DigestService();

  const options: DigestOptions = {
    repository: 'nodejs/node',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-07'),
    template: 'email', // Use email template
    detailLevel: 'concise',
    format: 'html',
    outputPreferences: {
      includeEmojis: false // Professional email style
    }
  };

  try {
    const result = await digestService.generateDigestFromRepository(options);
    
    if (result.success) {
      console.log('✅ Email-formatted digest generated!');
      console.log('HTML length:', result.html?.length);
      
      // Save to file for demo
      if (result.html) {
        const fs = await import('fs/promises');
        await fs.writeFile('digest-email-example.html', result.html);
        console.log('📧 Email digest saved to digest-email-example.html');
      }
    }
  } catch (error) {
    console.error('❌ Template example failed:', error);
  }
}

/**
 * Example: Batch digest generation
 */
export async function batchDigestExample(): Promise<void> {
  logger.info('Running batch digest example...');

  const digestService = new DigestService();

  const repositories = [
    {
      repository: 'facebook/react',
      options: { template: 'concise' }
    },
    {
      repository: 'microsoft/typescript',
      options: { detailLevel: 'detailed' as const }
    },
    {
      repository: 'nodejs/node',
      options: { includeAISummary: true }
    }
  ];

  const defaultOptions: DigestOptions = {
    repository: '', // Will be overridden
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-07'),
    format: 'markdown',
    detailLevel: 'detailed'
  };

  try {
    const results = await digestService.generateBatchDigests(repositories, defaultOptions);
    
    console.log(`✅ Batch generation completed for ${results.length} repositories:`);
    
    results.forEach(({ repository, result }) => {
      if (result.success) {
        console.log(`  ✅ ${repository}: ${result.metadata.dataPoints} PRs processed`);
      } else {
        console.log(`  ❌ ${repository}: ${result.error?.message}`);
      }
    });
  } catch (error) {
    console.error('❌ Batch example failed:', error);
  }
}

/**
 * Example: Custom filtering and analysis
 */
export async function customFilteringExample(): Promise<void> {
  logger.info('Running custom filtering example...');

  const digestService = new DigestService();

  const options: DigestOptions = {
    repository: 'golang/go',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-31'),
    detailLevel: 'comprehensive',
    customFilters: {
      authors: ['bradfitz', 'rsc'], // Only these authors
      labels: ['security', 'performance'], // Only security/performance PRs
      prTypes: ['feature', 'bugfix'], // Only features and bug fixes
      minImpact: 'moderate' // Only moderate+ impact
    },
    outputPreferences: {
      includeCodeSnippets: true,
      includeTrends: true
    }
  };

  try {
    const result = await digestService.generateDigestFromRepository(options);
    
    if (result.success) {
      console.log('✅ Filtered digest generated!');
      
      const stats = result.digest?.sections.statistics;
      if (stats) {
        console.log('Filtered results:');
        console.log(`- Total PRs: ${stats.pullRequests.total}`);
        console.log(`- Feature PRs: ${stats.pullRequests.byType.feature}`);
        console.log(`- Bug fixes: ${stats.pullRequests.byType.bugfix}`);
        console.log(`- Major+ impact: ${stats.pullRequests.byImpact.major + stats.pullRequests.byImpact.critical}`);
      }
    }
  } catch (error) {
    console.error('❌ Filtering example failed:', error);
  }
}

/**
 * Example: Mock data digest generation (for testing)
 */
export async function mockDataExample(): Promise<void> {
  logger.info('Running mock data example...');

  const digestService = new DigestService();
  const mockPRs = generateMockPRData();

  const options: DigestOptions = {
    repository: 'example/test-repo',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-31'),
    format: 'markdown',
    detailLevel: 'detailed',
    includeAISummary: false
  };

  try {
    const result = await digestService.generateDigest(mockPRs, options);
    
    if (result.success) {
      console.log('✅ Mock data digest generated!');
      console.log(`Processed ${mockPRs.length} mock PRs`);
      
      const stats = result.digest?.sections.statistics;
      if (stats) {
        console.log('Mock statistics:');
        console.log(`- Merged PRs: ${stats.pullRequests.merged}/${stats.pullRequests.total}`);
        console.log(`- Top contributor: ${stats.contributors.topContributors[0]?.name}`);
        console.log(`- Average merge time: ${stats.pullRequests.averageTimeToMerge}h`);
      }
      
      // Show first few lines of generated markdown
      if (result.markdown) {
        const lines = result.markdown.split('\n').slice(0, 10);
        console.log('\nFirst 10 lines of markdown:');
        lines.forEach((line, i) => console.log(`${i + 1}: ${line}`));
      }
    }
  } catch (error) {
    console.error('❌ Mock data example failed:', error);
  }
}

/**
 * Example: Real-time digest generation with progress updates
 */
export async function realTimeDigestExample(): Promise<void> {
  logger.info('Running real-time digest example...');

  const digestService = new DigestService();

  const options: DigestOptions = {
    repository: 'facebook/react',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-07'),
    format: 'markdown',
    detailLevel: 'detailed'
  };

  try {
    console.log('🚀 Starting digest generation...');
    console.log(`📊 Repository: ${options.repository}`);
    console.log(`📅 Period: ${options.dateFrom.toLocaleDateString()} - ${options.dateTo.toLocaleDateString()}`);
    
    const startTime = Date.now();
    
    // Simulate progress updates (in real implementation, these would come from the service)
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      console.log(`⏱️  Processing... (${Math.round(elapsed / 1000)}s elapsed)`);
    }, 2000);

    const result = await digestService.generateDigestFromRepository(options);
    
    clearInterval(progressInterval);
    
    if (result.success) {
      console.log(`✅ Generation completed in ${result.metadata.processingTime}ms`);
      console.log(`📈 Processed ${result.metadata.dataPoints} data points`);
      console.log(`🔧 Made ${result.metadata.apiCalls} API calls`);
      
      // Show summary
      const executive = result.digest?.executive;
      if (executive) {
        console.log('\n📋 Executive Summary:');
        console.log(executive.summary.substring(0, 200) + '...');
        console.log('\n🎯 Key Highlights:');
        executive.highlights.slice(0, 3).forEach((highlight, i) => {
          console.log(`  ${i + 1}. ${highlight}`);
        });
      }
    } else {
      console.error('❌ Generation failed:', result.error?.message);
    }
  } catch (error) {
    console.error('❌ Real-time example failed:', error);
  }
}

/**
 * Example: Performance comparison between templates
 */
export async function performanceComparisonExample(): Promise<void> {
  logger.info('Running performance comparison example...');

  const digestService = new DigestService();
  const templates = ['default', 'concise', 'email'];
  const mockPRs = generateMockPRData();

  const baseOptions: DigestOptions = {
    repository: 'example/perf-test',
    dateFrom: new Date('2023-12-01'),
    dateTo: new Date('2023-12-31'),
    format: 'markdown',
    detailLevel: 'detailed'
  };

  console.log('🏃 Performance comparison across templates:');
  console.log('Template        | Time (ms) | Memory | Output Size');
  console.log('----------------|-----------|--------|------------');

  for (const template of templates) {
    const options = { ...baseOptions, template };
    
    try {
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      
      const result = await digestService.generateDigest(mockPRs, options);
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      if (result.success) {
        const time = endTime - startTime;
        const memory = Math.round((endMemory - startMemory) / 1024);
        const outputSize = result.markdown?.length || 0;
        
        console.log(`${template.padEnd(15)} | ${time.toString().padEnd(9)} | ${memory.toString().padEnd(6)} | ${outputSize}`);
      } else {
        console.log(`${template.padEnd(15)} | ERROR     | -      | -`);
      }
    } catch (error) {
      console.log(`${template.padEnd(15)} | FAILED    | -      | -`);
    }
  }
}

/**
 * Generate mock PR data for testing
 */
function generateMockPRData(): GitHubPullRequest[] {
  const authors = ['alice', 'bob', 'charlie', 'diana', 'eve'];
  const types = ['feature', 'bugfix', 'docs', 'test', 'refactor'];
  const mockPRs: GitHubPullRequest[] = [];

  for (let i = 1; i <= 50; i++) {
    const author = authors[Math.floor(Math.random() * authors.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const createdDate = new Date(2023, 11, Math.floor(Math.random() * 30) + 1);
    const mergedDate = Math.random() > 0.2 ? new Date(createdDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000) : null;

    mockPRs.push({
      id: 1000 + i,
      number: i,
      title: `${type}: Mock PR #${i} - Implement ${type} functionality`,
      body: `This is a mock PR for testing purposes. It demonstrates a ${type} change with various characteristics.`,
      state: mergedDate ? 'closed' : 'open',
      merged: !!mergedDate,
      draft: Math.random() > 0.9,
      created_at: createdDate.toISOString(),
      updated_at: (mergedDate || createdDate).toISOString(),
      closed_at: mergedDate?.toISOString() || null,
      merged_at: mergedDate?.toISOString() || null,
      merge_commit_sha: mergedDate ? `abc123${i}` : null,
      base: {
        ref: 'main',
        sha: `base${i}`
      },
      head: {
        ref: `feature/pr-${i}`,
        sha: `head${i}`
      },
      user: {
        login: author,
        id: 100 + authors.indexOf(author),
        avatar_url: `https://github.com/${author}.png`
      },
      assignees: Math.random() > 0.5 ? [{
        login: author,
        id: 100 + authors.indexOf(author)
      }] : [],
      labels: Math.random() > 0.5 ? [{
        name: type,
        color: 'blue',
        description: `${type} related changes`
      }] : [],
      additions: Math.floor(Math.random() * 500) + 10,
      deletions: Math.floor(Math.random() * 200) + 5,
      changed_files: Math.floor(Math.random() * 20) + 1,
      commits: Math.floor(Math.random() * 10) + 1,
      comments: Math.floor(Math.random() * 15),
      review_comments: Math.floor(Math.random() * 10)
    });
  }

  return mockPRs;
}

/**
 * Run all examples
 */
export async function runAllExamples(): Promise<void> {
  console.log('🎯 Running all digest generation examples...\n');

  const examples = [
    { name: 'Mock Data Example', fn: mockDataExample },
    { name: 'Performance Comparison', fn: performanceComparisonExample },
    { name: 'Custom Filtering', fn: customFilteringExample },
    { name: 'Custom Template', fn: customTemplateExample }
  ];

  for (const example of examples) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎯 ${example.name}`);
    console.log('='.repeat(50));
    
    try {
      await example.fn();
    } catch (error) {
      console.error(`❌ ${example.name} failed:`, error);
    }
    
    console.log(`✅ ${example.name} completed`);
  }

  console.log('\n🎉 All examples completed!');
}

// Export example data for external use
export { generateMockPRData };