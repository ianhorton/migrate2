/**
 * Unit tests for AWSResourceDiscovery
 */

import { AWSResourceDiscovery } from '../../../src/modules/discovery/aws-resource-discovery';
import { DiscoveredResource } from '../../../src/types/discovery';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-cloudwatch-logs');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-iam');

import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  ListTagsOfResourceCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { CloudWatchLogsClient, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { IAMClient, ListRolesCommand } from '@aws-sdk/client-iam';

describe('AWSResourceDiscovery', () => {
  let discovery: AWSResourceDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();
    discovery = new AWSResourceDiscovery('us-east-1');
  });

  describe('discoverDynamoDBTables', () => {
    it('should discover DynamoDB tables', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      // Mock ListTables response
      mockSend.mockResolvedValueOnce({
        TableNames: ['users-table', 'products-table'],
      });

      // Mock DescribeTable responses
      mockSend
        .mockResolvedValueOnce({
          Table: {
            TableName: 'users-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/users-table',
            CreationDateTime: new Date('2024-01-15'),
            KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
            BillingModeSummary: { BillingMode: 'PAY_PER_REQUEST' },
            ItemCount: 1000,
            TableSizeBytes: 50000,
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
            TableName: 'products-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/products-table',
            CreationDateTime: new Date('2024-01-10'),
            KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
            BillingModeSummary: { BillingMode: 'PROVISIONED' },
            ItemCount: 500,
            TableSizeBytes: 25000,
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({
          Tags: [],
        });

      const tables = await discovery.discoverDynamoDBTables();

      expect(tables).toHaveLength(2);
      expect(tables[0].physicalId).toBe('users-table');
      expect(tables[0].resourceType).toBe('AWS::DynamoDB::Table');
      expect(tables[0].tags).toEqual({ Environment: 'dev', App: 'myapp' });
      expect(tables[0].metadata.billingMode).toBe('PAY_PER_REQUEST');
    });

    it('should handle empty table list', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({ TableNames: [] });

      const tables = await discovery.discoverDynamoDBTables();

      expect(tables).toHaveLength(0);
    });
  });

  describe('discoverS3Buckets', () => {
    it('should discover S3 buckets', async () => {
      const mockSend = jest.fn();
      (S3Client as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({
        Buckets: [
          { Name: 'my-bucket-dev', CreationDate: new Date('2024-01-15') },
          { Name: 'my-bucket-prod', CreationDate: new Date('2023-12-01') },
        ],
      });

      // Mock GetBucketLocation and GetBucketTagging for each bucket
      mockSend
        .mockResolvedValueOnce({ LocationConstraint: 'us-east-1' })
        .mockResolvedValueOnce({
          TagSet: [
            { Key: 'Environment', Value: 'dev' },
          ],
        })
        .mockResolvedValueOnce({ LocationConstraint: 'us-west-2' })
        .mockResolvedValueOnce({
          TagSet: [],
        });

      const buckets = await discovery.discoverS3Buckets();

      expect(buckets).toHaveLength(2);
      expect(buckets[0].physicalId).toBe('my-bucket-dev');
      expect(buckets[0].resourceType).toBe('AWS::S3::Bucket');
      expect(buckets[0].region).toBe('us-east-1');
    });
  });

  describe('discoverLogGroups', () => {
    it('should discover CloudWatch LogGroups', async () => {
      const mockSend = jest.fn();
      (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({
        logGroups: [
          {
            logGroupName: '/aws/lambda/my-function',
            arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/my-function',
            creationTime: Date.now() - 86400000,
            retentionInDays: 7,
            storedBytes: 1000000,
          },
        ],
      });

      mockSend.mockResolvedValueOnce({
        tags: { Environment: 'dev' },
      });

      const logGroups = await discovery.discoverLogGroups();

      expect(logGroups).toHaveLength(1);
      expect(logGroups[0].physicalId).toBe('/aws/lambda/my-function');
      expect(logGroups[0].resourceType).toBe('AWS::Logs::LogGroup');
      expect(logGroups[0].metadata.retentionInDays).toBe(7);
    });

    it('should filter by prefix', async () => {
      const mockSend = jest.fn();
      (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({
        logGroups: [
          {
            logGroupName: '/aws/lambda/my-function',
            arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/my-function',
            creationTime: Date.now(),
          },
        ],
      });

      mockSend.mockResolvedValueOnce({ tags: {} });

      await discovery.discoverLogGroups('/aws/lambda');

      const describeCommand = mockSend.mock.calls[0][0];
      expect(describeCommand.input.logGroupNamePrefix).toBe('/aws/lambda');
    });
  });

  describe('discoverLambdaFunctions', () => {
    it('should discover Lambda functions', async () => {
      const mockSend = jest.fn();
      (LambdaClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({
        Functions: [
          {
            FunctionName: 'my-function',
            FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-function',
            Runtime: 'nodejs18.x',
            Handler: 'index.handler',
            MemorySize: 256,
            Timeout: 30,
            Role: 'arn:aws:iam::123456789012:role/lambda-role',
            LastModified: '2024-01-15',
          },
        ],
      });

      mockSend.mockResolvedValueOnce({
        Tags: { Environment: 'dev' },
      });

      const functions = await discovery.discoverLambdaFunctions();

      expect(functions).toHaveLength(1);
      expect(functions[0].physicalId).toBe('my-function');
      expect(functions[0].resourceType).toBe('AWS::Lambda::Function');
      expect(functions[0].metadata.runtime).toBe('nodejs18.x');
    });
  });

  describe('discoverIAMRoles', () => {
    it('should discover IAM roles', async () => {
      const mockSend = jest.fn();
      (IAMClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));

      mockSend.mockResolvedValueOnce({
        Roles: [
          {
            RoleName: 'lambda-execution-role',
            Arn: 'arn:aws:iam::123456789012:role/lambda-execution-role',
            CreateDate: new Date('2024-01-01'),
            Path: '/',
          },
        ],
      });

      mockSend.mockResolvedValueOnce({
        Role: {
          AssumeRolePolicyDocument: '{"Version":"2012-10-17"}',
        },
      });

      mockSend.mockResolvedValueOnce({
        Tags: [{ Key: 'Service', Value: 'lambda' }],
      });

      const roles = await discovery.discoverIAMRoles();

      expect(roles).toHaveLength(1);
      expect(roles[0].physicalId).toBe('lambda-execution-role');
      expect(roles[0].resourceType).toBe('AWS::IAM::Role');
      expect(roles[0].region).toBe('global');
    });
  });

  describe('discoverAll', () => {
    it('should discover multiple resource types in parallel', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));
      (S3Client as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      // Mock responses
      mockSend
        .mockResolvedValueOnce({ TableNames: ['test-table'] })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'test-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/test-table',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] })
        .mockResolvedValueOnce({ Buckets: [{ Name: 'test-bucket', CreationDate: new Date() }] })
        .mockResolvedValueOnce({ LocationConstraint: 'us-east-1' })
        .mockResolvedValueOnce({ TagSet: [] });

      const results = await discovery.discoverAll([
        'AWS::DynamoDB::Table',
        'AWS::S3::Bucket',
      ]);

      expect(results.size).toBe(2);
      expect(results.get('AWS::DynamoDB::Table')).toHaveLength(1);
      expect(results.get('AWS::S3::Bucket')).toHaveLength(1);
    });
  });

  describe('caching', () => {
    it('should cache discovery results', async () => {
      const mockSend = jest.fn();
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      mockSend
        .mockResolvedValueOnce({ TableNames: ['test-table'] })
        .mockResolvedValueOnce({
          Table: {
            TableName: 'test-table',
            TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/test-table',
            CreationDateTime: new Date(),
            KeySchema: [],
            AttributeDefinitions: [],
            TableStatus: 'ACTIVE',
          },
        })
        .mockResolvedValueOnce({ Tags: [] });

      // First call
      await discovery.discoverResourceType('AWS::DynamoDB::Table', undefined, {
        useCache: true,
      });

      // Second call should use cache
      await discovery.discoverResourceType('AWS::DynamoDB::Table', undefined, {
        useCache: true,
      });

      // Should only call AWS API once
      expect(mockSend).toHaveBeenCalledTimes(3); // ListTables + DescribeTable + ListTags
    });

    it('should clear cache', async () => {
      discovery.clearCache();
      // No error should be thrown
    });
  });
});
