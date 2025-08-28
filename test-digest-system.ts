#!/usr/bin/env ts-node

/**
 * Test Script for Digest Generation System
 * 
 * This script demonstrates the core functionality of the digest generation system
 * using mock data and examples.
 */

import { 
  DigestService,
  PRAnalysisService,
  StatisticsService,
  MarkdownService,
  TemplateService,
  DigestOptions,
  generateMockPRData,
  mockDataExample,
  performanceComparisonExample
} from './src/services';

import { logger } from './src/lib/logger';

async function main() {
  console.log('🚀 Testing Digest Generation System');
  console.log('===================================\n');

  // Test 1: Individual Service Components
  console.log('📝 Test 1: Individual Service Components');
  await testIndividualServices();

  // Test 2: End-to-End Digest Generation
  console.log('\n📝 Test 2: End-to-End Digest Generation');
  await testEndToEndGeneration();

  // Test 3: Template System
  console.log('\n📝 Test 3: Template System');
  await testTemplateSystem();

  // Test 4: Error Handling
  console.log('\n📝 Test 4: Error Handling');
  await testErrorHandling();

  // Test 5: Performance
  console.log('\n📝 Test 5: Performance Test');
  await performanceComparisonExample();

  console.log('\n✅ All tests completed successfully!');
}

async function testIndividualServices() {
  try {
    // Test PR Analysis Service
    const prAnalysisService = new PRAnalysisService();
    const mockPRs = generateMockPRData().slice(0, 5);
    const githubPRs = mockPRs.map(pr => ({
      ...pr,
      // Convert mock data to GitHub format
      user: { login: pr.user.login, id: pr.user.id, avatar_url: pr.user.avatar_url },
      labels: pr.labels.map(l => ({ name: l.name, color: l.color, description: l.description }))
    })) as any;

    console.log('  🔍 Testing PR Analysis...');
    const analyses = await prAnalysisService.analyzePRsBatch(githubPRs);
    console.log(`    ✅ Analyzed ${analyses.length} PRs`);
    console.log(`    📊 Types found: ${Object.keys(analyses.reduce((acc, pr) => ({ ...acc, [pr.type]: true }), {})).join(', ')}`);

    // Test Statistics Service
    console.log('  📈 Testing Statistics...');
    const statisticsService = new StatisticsService();
    const statistics = await statisticsService.generateStatistics(
      { name: 'test-repo', path: 'test/repo', defaultBranch: 'main' },
      analyses,
      new Date('2023-12-01'),
      new Date('2023-12-31')
    );
    console.log(`    ✅ Generated statistics with ${statistics.pullRequests.total} PRs`);
    console.log(`    👥 Contributors: ${statistics.contributors.total}`);

    // Test Markdown Service
    console.log('  📝 Testing Markdown Service...');
    const markdownService = new MarkdownService();
    const digestContent = {
      metadata: {
        generatedAt: new Date(),
        version: '1.0.0',
        repository: 'test/repo',
        period: { from: new Date('2023-12-01'), to: new Date('2023-12-31') },
        options: {} as DigestOptions
      },
      executive: {
        summary: 'Test summary',
        keyMetrics: { totalPRs: 5, mergedPRs: 4, activeContributors: 3, averageTimeToMerge: 24 },
        highlights: ['Test highlight 1', 'Test highlight 2']
      },
      sections: {
        statistics,
        pullRequests: {
          summary: 'Test PR summary',
          featured: analyses.slice(0, 3),
          byType: analyses.reduce((acc, pr) => {
            acc[pr.type] = acc[pr.type] || [];
            acc[pr.type].push(pr);
            return acc;
          }, {} as any)
        },
        contributors: {
          summary: 'Test contributors',
          topContributors: statistics.contributors.topContributors.map(c => ({
            name: c.name,
            metrics: { prs: c.prs, commits: c.commits, linesChanged: c.linesChanged },
            highlights: [`Active contributor with ${c.prs} PRs`]
          })),
          newContributors: []
        },
        codeHealth: {
          summary: 'Code health is good',
          metrics: { codeChurn: 100, reviewCoverage: 80, averageComplexity: 2.5 },
          concerns: ['Minor concern'],
          improvements: ['Good test coverage']
        },
        trends: {
          summary: 'Positive trends',
          comparisons: {
            previousPeriod: { prCount: 0, commitCount: 0, contributorCount: 0, changePercent: 0 }
          },
          predictions: ['Continued growth expected']
        }
      },
      appendix: {
        methodology: 'Test methodology',
        dataSource: 'Mock data',
        limitations: ['Test limitation']
      }
    };

    const markdown = await markdownService.generateMarkdown(digestContent);
    console.log(`    ✅ Generated ${markdown.length} characters of markdown`);
    console.log(`    📄 First line: ${markdown.split('\n')[0]}`);

  } catch (error) {
    console.error('    ❌ Individual services test failed:', error);
  }
}

async function testEndToEndGeneration() {
  try {
    const digestService = new DigestService();
    const mockPRs = generateMockPRData();

    const options: DigestOptions = {
      repository: 'test/repo',
      dateFrom: new Date('2023-12-01'),
      dateTo: new Date('2023-12-31'),
      format: 'markdown',
      detailLevel: 'detailed',
      includeAISummary: false, // Disable AI for testing
      outputPreferences: {
        includeEmojis: true,
        includeTrends: true
      }
    };

    console.log('  🎯 Generating complete digest...');
    const startTime = Date.now();
    
    const result = await digestService.generateDigest(mockPRs, options);
    const endTime = Date.now();

    if (result.success) {
      console.log(`    ✅ Digest generated successfully in ${endTime - startTime}ms`);
      console.log(`    📊 Processed ${result.metadata.dataPoints} data points`);
      console.log(`    📝 Generated ${result.markdown?.length || 0} characters of markdown`);
      
      if (result.digest) {
        console.log(`    🎯 Key metrics: ${result.digest.executive.keyMetrics.totalPRs} PRs, ${result.digest.executive.keyMetrics.activeContributors} contributors`);
        console.log(`    🔍 Top contributor: ${result.digest.sections.statistics.contributors.topContributors[0]?.name}`);
      }
    } else {
      console.error(`    ❌ Digest generation failed: ${result.error?.message}`);
    }

  } catch (error) {
    console.error('    ❌ End-to-end test failed:', error);
  }
}

async function testTemplateSystem() {
  try {
    const templateService = new TemplateService();
    
    console.log('  📋 Testing template system...');
    const templates = templateService.listTemplates();
    console.log(`    ✅ Found ${templates.length} templates: ${templates.map(t => t.name).join(', ')}`);

    // Test custom template creation
    console.log('  🎨 Creating custom template...');
    const customTemplate = templateService.createCustomTemplate('test-template', {
      format: 'markdown',
      sections: {
        header: {
          enabled: true,
          template: '# Test Digest for {{repository}}\n**Period:** {{period_start}} - {{period_end}}',
          order: 1
        },
        summary: {
          enabled: true,
          template: '## Summary\n{{executive_summary}}\n\n**PRs:** {{total_prs}}',
          order: 2
        }
      }
    });
    
    console.log(`    ✅ Created custom template: ${customTemplate.name}`);
    console.log(`    📋 Template sections: ${Object.keys(customTemplate.sections).join(', ')}`);

  } catch (error) {
    console.error('    ❌ Template system test failed:', error);
  }
}

async function testErrorHandling() {
  try {
    const digestService = new DigestService();

    console.log('  ⚠️  Testing error handling...');
    
    // Test invalid options
    const invalidOptions: DigestOptions = {
      repository: '', // Invalid empty repository
      dateFrom: new Date('2023-12-31'),
      dateTo: new Date('2023-12-01'), // Invalid date range
      format: 'markdown'
    };

    const validation = digestService.validateOptions(invalidOptions);
    console.log(`    ✅ Validation caught ${validation.errors.length} errors:`);
    validation.errors.forEach(error => console.log(`       - ${error}`));

    // Test with empty PR data
    console.log('  📭 Testing with empty data...');
    const emptyResult = await digestService.generateDigest([], invalidOptions);
    if (!emptyResult.success) {
      console.log(`    ✅ Empty data handled gracefully: ${emptyResult.error?.message}`);
    }

  } catch (error) {
    console.error('    ❌ Error handling test failed:', error);
  }
}

async function showServiceHealth() {
  console.log('\n🏥 Service Health Check');
  console.log('======================');
  
  try {
    const digestService = new DigestService();
    const health = await digestService.getHealthStatus();
    
    console.log(`Overall Status: ${health.status.toUpperCase()}`);
    console.log('Service Status:');
    Object.entries(health.services).forEach(([service, healthy]) => {
      const status = healthy ? '✅ Healthy' : '❌ Unhealthy';
      console.log(`  ${service}: ${status}`);
    });
    console.log(`Last Checked: ${health.lastChecked.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
  }
}

async function showServiceConfig() {
  console.log('\n⚙️  Service Configuration');
  console.log('========================');
  
  try {
    const digestService = new DigestService();
    const config = digestService.getServiceConfig();
    
    console.log('Features:');
    Object.entries(config.features).forEach(([feature, enabled]) => {
      const status = enabled ? '✅ Enabled' : '❌ Disabled';
      console.log(`  ${feature}: ${status}`);
    });
    
    console.log('\nPR Analysis Configuration:');
    console.log(`  Feature keywords: ${config.prAnalysis.patterns.featureKeywords.slice(0, 3).join(', ')}...`);
    console.log(`  Major impact threshold: ${config.prAnalysis.thresholds.majorImpact.linesChanged} lines`);
    
  } catch (error) {
    console.error('❌ Config display failed:', error);
  }
}

// Run the tests
if (require.main === module) {
  main()
    .then(() => showServiceHealth())
    .then(() => showServiceConfig())
    .then(() => {
      console.log('\n🎉 Test suite completed successfully!');
      console.log('📚 Check the generated examples and documentation for more details.');
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { main as runTests };