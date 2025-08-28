#!/usr/bin/env bun

import { AISummaryService } from './src/services/ai-summary';

async function testOpenAI() {
  console.log('🤖 Testing OpenAI API with gpt-5-mini...\n');

  try {
    const aiService = new AISummaryService();
    
    // Test basic AI call
    console.log('Making OpenAI API call...');
    const testResponse = await (aiService as any).callOpenAI(
      'Explain what a pull request is in software development in one sentence.',
      'You are a technical documentation expert. Provide clear, concise explanations.'
    );
    
    console.log('✅ OpenAI API Response:', testResponse);
    console.log('\n✅ OpenAI API with gpt-5-mini working correctly!');
    return true;
  } catch (error) {
    console.error('❌ OpenAI API test failed:', error);
    return false;
  }
}

testOpenAI();