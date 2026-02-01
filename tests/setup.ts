// Test setup file
// This runs before all tests

import { beforeAll, afterAll, afterEach } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.CLAWMOD_DEBUG = '0';
});

// Clean up after each test
afterEach(() => {
  // Reset any mocks
});

// Global teardown
afterAll(() => {
  // Clean up resources
});
