/**
 * Jest test setup file
 * Runs before each test suite
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCOUNT_ID = '123456789012';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudformation');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-logs');

// Global test timeout
jest.setTimeout(30000);

// Suppress console logs during tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Add custom matchers if needed
expect.extend({
  toBeValidCloudFormationTemplate(received) {
    const hasVersion = received.AWSTemplateFormatVersion !== undefined;
    const hasResources = received.Resources !== undefined;

    if (hasVersion && hasResources) {
      return {
        message: () => 'Expected not to be a valid CloudFormation template',
        pass: true,
      };
    }

    return {
      message: () => `Expected valid CloudFormation template with AWSTemplateFormatVersion and Resources`,
      pass: false,
    };
  },
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});
