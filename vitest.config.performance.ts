import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    name: 'performance',
    include: ['tests/performance/**/*.test.ts'],
    exclude: ['tests/unit/**', 'tests/integration/**', 'tests/e2e/**'],
    setupFiles: ['./tests/setup.performance.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
      },
    },
    testTimeout: 60000,
    hookTimeout: 30000,
    maxConcurrency: 4,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});