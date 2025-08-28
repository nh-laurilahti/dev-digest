#!/usr/bin/env bun

import { GitHubClient } from './src/clients/github';
import { PullRequestService } from './src/services/pull-requests';

async function testGitHubPR() {
  console.log('🔍 Testing GitHub PR Fetching...\n');

  try {
    const client = new GitHubClient();
    const prService = new PullRequestService(client);
    
    // Test with a popular repository - get just 1 PR to avoid rate limits
    console.log('Fetching 1 PR from microsoft/vscode...');
    const prs = await prService.getPullRequests('microsoft', 'vscode', {
      state: 'closed',
      per_page: 1
    });
    
    console.log(`✅ Successfully fetched ${prs.length} PR(s)`);
    
    if (prs.length > 0) {
      const pr = prs[0];
      console.log('\n📋 PR Details:');
      console.log(`   Number: #${pr.number}`);
      console.log(`   Title: ${pr.title}`);
      console.log(`   Author: ${pr.user.login}`);
      console.log(`   State: ${pr.state}`);
      console.log(`   Merged: ${pr.merged || 'unknown'}`);
      console.log(`   Created: ${pr.created_at}`);
      console.log(`   Additions: ${pr.additions || 'unknown'}`);
      console.log(`   Deletions: ${pr.deletions || 'unknown'}`);
      console.log(`   Files: ${pr.changed_files || 'unknown'}`);
      console.log(`   Labels: ${pr.labels.map(l => l.name).join(', ') || 'none'}`);
    }
    
    console.log('\n✅ GitHub PR integration working correctly!');
    return true;
  } catch (error) {
    console.error('❌ GitHub PR test failed:', error);
    return false;
  }
}

testGitHubPR();