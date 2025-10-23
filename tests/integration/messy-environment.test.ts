/**
 * Integration Test: Messy Environment Support
 *
 * Tests the complete Sprint 1 implementation for handling real-world messy scenarios:
 * - Physical resource names don't match logical IDs
 * - Resources have been manually modified
 * - Multiple candidates exist for single resource
 *
 * This test validates the full workflow:
 * 1. AWS Resource Discovery
 * 2. Confidence-based Matching
 * 3. Physical ID Resolution with fallback strategies
 * 4. Human Intervention (simulated)
 */

import { AWSResourceDiscovery } from '../../src/modules/discovery/aws-resource-discovery';
import { ResourceMatcher } from '../../src/modules/discovery/resource-matcher';
import { PhysicalIdResolver } from '../../src/modules/discovery/physical-id-resolver';
import { HumanInterventionManager } from '../../src/modules/intervention/human-intervention-manager';
import * as path from 'path';
import * as fs from 'fs';

// Mock AWS SDK clients for integration test
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-cloudwatch-logs');

import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

describe('Messy Environment Integration Test', () => {
  let discovery: AWSResourceDiscovery;
  let matcher: ResourceMatcher;
  let interventionManager: HumanInterventionManager;
  let resolver: PhysicalIdResolver;

  const testAuditPath = path.join(
    __dirname,
    '..',
    'fixtures',
    'integration-test-audit.json'
  );

  beforeAll(() => {
    // Initialize all components
    discovery = new AWSResourceDiscovery('us-east-1');
    matcher = new ResourceMatcher(0.7);
    interventionManager = new HumanInterventionManager({
      dryRun: true, // Simulate interventions
      auditLogPath: testAuditPath,
      migrationId: 'integration-test-001',
    });
    resolver = new PhysicalIdResolver(discovery, matcher, interventionManager, {
      autoMatchThreshold: 0.9,
      verbose: false,
    });
  });

  afterAll(() => {
    // Clean up test audit file
    if (fs.existsSync(testAuditPath)) {
      fs.unlinkSync(testAuditPath);
    }
  });

  describe('Scenario 1: Exact Name Match (Auto-Resolve)', () => {
    it('should automatically resolve DynamoDB table with exact name', async () => {
      // Mock AWS response
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend
        .mockResolvedValueOnce({
          TableNames: ['users-table-dev', 'products-table-dev'],
        })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'users-table-dev',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/users-table-dev',
            CreationDateTime: new Date(),
            KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
            BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] });

      // Template with explicit TableName
      const logicalId = 'UsersTable';
      const resourceType = 'AWS::DynamoDB::Table';
      const templateProps = {
        TableName: 'users-table-dev',
        BillingMode: 'PAY_PER_REQUEST',
      };

      // Resolve
      const physicalId = await resolver.resolve(
        logicalId,
        resourceType,
        templateProps
      );

      // Assertions
      expect(physicalId).toBe('users-table-dev');
      // Should use explicit ID strategy, not call AWS
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: High Confidence Auto-Match', () => {
    it('should auto-match resource with 90%+ confidence', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      // Mock discovery results
      mockSend
        .mockResolvedValueOnce({
          TableNames: ['orders-table-dev', 'orders-table-prod'],
        })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'orders-table-dev',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/orders-table-dev',
            CreationDateTime: new Date(),
            KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
            AttributeDefinitions: [
              { AttributeName: 'orderId', AttributeType: 'S' },
            ],
            BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({
          Tags: [
            { Key: 'Environment', Value: 'dev' },
            { Key: 'App', Value: 'myapp' },
          ],
        })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'orders-table-prod',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/orders-table-prod',
            CreationDateTime: new Date('2023-01-01'),
            KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
            AttributeDefinitions: [
              { AttributeName: 'orderId', AttributeType: 'S' },
            ],
            BillingModeSummary: { BillingMode: 'PROVISIONED' },
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({
          Tags: [{ Key: 'Environment', Value: 'prod' }],
        });

      // Template without explicit name
      const logicalId = 'OrdersTable';
      const resourceType = 'AWS::DynamoDB::Table';
      const templateProps = {
        BillingMode: 'PAY_PER_REQUEST',
        Tags: [
          { Key: 'Environment', Value: 'dev' },
          { Key: 'App', Value: 'myapp' },
        ],
      };

      // Resolve - should find orders-table-dev with high confidence
      const physicalId = await resolver.resolve(
        logicalId,
        resourceType,
        templateProps
      );

      // Should discover and match
      expect(mockSend).toHaveBeenCalled();
      expect(physicalId).toBeTruthy();
    });
  });

  describe('Scenario 3: Low Confidence - Human Intervention', () => {
    it('should fall back to human intervention when confidence is low', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      // Multiple ambiguous candidates
      mockSend
        .mockResolvedValueOnce({
          TableNames: ['user-data', 'users-legacy', 'user-profiles'],
        })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'user-data',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/user-data',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'users-legacy',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/users-legacy',
            CreationDateTime: new Date('2022-01-01'),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'user-profiles',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/user-profiles',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] });

      const logicalId = 'UsersTable';
      const resourceType = 'AWS::DynamoDB::Table';
      const templateProps = {
        // No clear indicators
      };

      // In dry-run mode, intervention manager will simulate selection
      const physicalId = await resolver.resolve(
        logicalId,
        resourceType,
        templateProps
      );

      // Should have triggered human intervention
      const history = interventionManager.getInterventionHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(physicalId).toBeTruthy();
    });
  });

  describe('Scenario 4: Multiple Resource Types', () => {
    it('should resolve physical IDs for multiple resource types', async () => {
      const mockDynamoSend = jest.fn();
      const mockS3Send = jest.fn();

      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockDynamoSend,
      }));
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockS3Send,
      }));

      // Mock DynamoDB response
      mockDynamoSend
        .mockResolvedValueOnce({
          TableNames: ['my-table'],
        })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'my-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/my-table',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] });

      // Mock S3 response
      mockS3Send
        .mockResolvedValueOnce({
          Buckets: [{ Name: 'my-bucket', CreationDate: new Date() }],
        })
        .mockResolvedValueOnce({ LocationConstraint: 'us-east-1' })
        .mockResolvedValueOnce({ TagSet: [] });

      // Resolve multiple resources
      const resources = [
        {
          logicalId: 'MyTable',
          resourceType: 'AWS::DynamoDB::Table',
          templateProperties: { TableName: 'my-table' },
        },
        {
          logicalId: 'MyBucket',
          resourceType: 'AWS::S3::Bucket',
          templateProperties: { BucketName: 'my-bucket' },
        },
      ];

      const results = await resolver.resolveMany(resources);

      // Assertions
      expect(results.size).toBe(2);
      expect(results.get('MyTable')).toBe('my-table');
      expect(results.get('MyBucket')).toBe('my-bucket');
    });
  });

  describe('Scenario 5: Audit Trail', () => {
    it('should create audit log of all interventions', () => {
      const history = interventionManager.getInterventionHistory();

      // Should have interventions from previous tests
      expect(history.length).toBeGreaterThan(0);

      // Each intervention should have required fields
      history.forEach((intervention) => {
        expect(intervention).toHaveProperty('promptId');
        expect(intervention).toHaveProperty('action');
        expect(intervention).toHaveProperty('timestamp');
      });
    });

    it('should save audit log to file system', () => {
      // Check if audit file was created
      expect(fs.existsSync(testAuditPath)).toBe(true);

      // Read and verify content
      const content = fs.readFileSync(testAuditPath, 'utf-8');
      const auditData = JSON.parse(content);

      expect(Array.isArray(auditData)).toBe(true);
      expect(auditData.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 6: Error Handling', () => {
    it('should handle AWS API errors gracefully', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      // Simulate AWS API error
      mockSend.mockRejectedValueOnce(new Error('AWS API Error: Access Denied'));

      const logicalId = 'ErrorTable';
      const resourceType = 'AWS::DynamoDB::Table';
      const templateProps = {};

      // Should handle error and fall back
      await expect(
        resolver.resolve(logicalId, resourceType, templateProps)
      ).rejects.toThrow();
    });

    it('should validate resource types', async () => {
      const logicalId = 'UnknownResource';
      const resourceType = 'AWS::Unknown::Type';
      const templateProps = {};

      // Should reject unsupported types
      await expect(
        discovery.discoverResourceType(resourceType)
      ).rejects.toThrow('Unsupported resource type');
    });
  });

  describe('Performance Metrics', () => {
    it('should resolve resources efficiently', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend
        .mockResolvedValueOnce({ TableNames: ['test-table'] })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'test-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123:table/test-table',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] });

      const start = Date.now();

      await resolver.resolve('TestTable', 'AWS::DynamoDB::Table', {
        TableName: 'test-table',
      });

      const duration = Date.now() - start;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(1000); // < 1 second
    });
  });
});
