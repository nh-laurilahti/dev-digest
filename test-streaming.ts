#!/usr/bin/env bun

import { AISummaryService } from './src/services/ai-summary';

async function testStreamingOpenAI() {
  console.log('🔄 Testing OpenAI Streaming API with gpt-5-mini...\n');

  try {
    const aiService = new AISummaryService();
    
    console.log('Streaming response:');
    console.log('---');
    
    let chunks: string[] = [];
    const response = await (aiService as any).callOpenAIStreaming(
      'Write a brief summary of what TypeScript is in 2-3 sentences.',
      'You are a technical writer. Provide clear, concise explanations.',
      (chunk: string) => {
        process.stdout.write(chunk);
        chunks.push(chunk);
      }
    );
    
    console.log('\n---');
    console.log(`✅ Streaming completed! Total chunks: ${chunks.length}`);
    console.log(`Full response length: ${response.length} characters`);
    
    return true;
  } catch (error) {
    console.error('❌ OpenAI streaming test failed:', error);
    return false;
  }
}

testStreamingOpenAI();