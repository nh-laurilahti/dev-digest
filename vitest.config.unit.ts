import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    name: 'unit',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/e2e/**', 'tests/performance/**'],
    setupFiles: ['./tests/setup.unit.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/unit',
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
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});