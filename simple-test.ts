#!/usr/bin/env bun

import { GitHubClient } from './src/clients/github';
import { config } from './src/lib/config';

async function quickTest() {
  console.log('🧪 Running Quick Integration Test\n');

  // Test 1: Environment variables
  console.log('1. Environment Variables:');
  console.log(`   GITHUB_TOKEN: ${config.GITHUB_TOKEN ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`   OPENAI_API_KEY: ${config.OPENAI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);

  // Test 2: GitHub Client Connection
  console.log('\n2. GitHub API Connection:');
  try {
    const client = new GitHubClient();
    const connectionTest = await client.testConnection();
    
    if (connectionTest.connected) {
      console.log(`   ✅ Connected as: ${connectionTest.user}`);
      console.log(`   ✅ Token scopes: ${connectionTest.scopes?.join(', ') || 'none'}`);
      console.log(`   ✅ Rate limit: ${connectionTest.rateLimit?.remaining}/${connectionTest.rateLimit?.limit}`);
    } else {
      console.log(`   ❌ Connection failed: ${connectionTest.error}`);
    }
  } catch (error) {
    console.log(`   ❌ GitHub test failed: ${error}`);
  }

  // Test 3: Simple OpenAI call
  console.log('\n3. OpenAI API Test:');
  if (config.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "API test successful" in exactly 3 words.' }],
          max_tokens: 10,
          temperature: 0
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ OpenAI Response: ${data.choices[0]?.message?.content}`);
        console.log(`   ✅ Model: ${data.model}`);
      } else if (response.status === 429) {
        console.log(`   ⚠️  Rate limited (expected for new key): HTTP ${response.status}`);
      } else {
        const error = await response.text();
        console.log(`   ❌ OpenAI error: HTTP ${response.status} - ${error}`);
      }
    } catch (error) {
      console.log(`   ❌ OpenAI test failed: ${error}`);
    }
  } else {
    console.log('   ⚠️  OpenAI API key not configured');
  }

  console.log('\n📊 Quick test completed!');
}

quickTest().catch(console.error);