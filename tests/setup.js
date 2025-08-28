"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Test environment setup
(0, vitest_1.beforeAll)(async () => {
    // Setup test database, mock external services, etc.
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
});
(0, vitest_1.afterAll)(async () => {
    // Cleanup after all tests
});
(0, vitest_1.afterEach)(async () => {
    // Cleanup after each test
    // Reset database state, clear mocks, etc.
});
// Global test utilities can be added here
//# sourceMappingURL=setup.js.map