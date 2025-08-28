import { beforeAll, afterAll, afterEach } from 'vitest';

// Test environment setup
beforeAll(async () => {
  // Setup test database, mock external services, etc.
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
});

afterAll(async () => {
  // Cleanup after all tests
});

afterEach(async () => {
  // Cleanup after each test
  // Reset database state, clear mocks, etc.
});

// Global test utilities can be added here