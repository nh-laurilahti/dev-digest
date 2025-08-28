#!/usr/bin/env bun

import { config } from './src/lib/config';

console.log('🔍 Testing Environment Variable Loading...\n');

console.log('NODE_ENV:', config.NODE_ENV);
console.log('GITHUB_TOKEN:', config.GITHUB_TOKEN ? `${config.GITHUB_TOKEN.substring(0, 20)}...` : 'NOT SET');
console.log('OPENAI_API_KEY:', config.OPENAI_API_KEY ? `${config.OPENAI_API_KEY.substring(0, 20)}...` : 'NOT SET');

console.log('\nFull process.env.OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 20)}...` : 'NOT SET');
console.log('Full process.env.GITHUB_TOKEN:', process.env.GITHUB_TOKEN ? `${process.env.GITHUB_TOKEN.substring(0, 20)}...` : 'NOT SET');