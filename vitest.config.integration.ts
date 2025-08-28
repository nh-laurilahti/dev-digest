import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/unit/**', 'tests/e2e/**', 'tests/performance/**'],
    setupFiles: ['./tests/setup.integration.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration',
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'src/db/generated/',
        'src/examples/',
        'src/__tests__/',
      ],
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    maxConcurrency: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});