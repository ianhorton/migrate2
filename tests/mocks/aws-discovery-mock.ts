/**
 * Mock AWS SDK for Discovery and Intervention Testing
 * Simulates AWS resource discovery, drift detection, and CloudFormation operations
 */

import mockResources from '../fixtures/messy-environment/mock-aws-resources.json';

export interface MockDiscoveredResource {
  physicalId: string;
  resourceType: string;
  region: string;
  arn: string;
  tags: Record<string, string>;
  createdAt?: Date;
  metadata: Record<string, any>;
}

export interface MockDriftInfo {
  resourceId: string;
  drifted: boolean;
  driftStatus: 'IN_SYNC' | 'MODIFIED' | 'DELETED' | 'NOT_CHECKED';
  propertyDifferences?: Array<{
    propertyPath: string;
    expectedValue: any;
    actualValue: any;
    differenceType: 'ADD' | 'REMOVE' | 'MODIFY';
  }>;
}

/**
 * Mock DynamoDB Client
 */
export class MockDynamoDBClient {
  async listTables(): Promise<{ TableNames: string[] }> {
    return {
      TableNames: mockResources.dynamoDbTables.map(t => t.physicalId)
    };
  }

  async describeTable(params: { TableName: string }): Promise<any> {
    const table = mockResources.dynamoDbTables.find(
      t => t.physicalId === params.TableName
    );

    if (!table) {
      throw new Error(`Table not found: ${params.TableName}`);
    }

    return {
      Table: {
        TableName: table.physicalId,
        TableArn: table.arn,
        CreationDateTime: new Date(table.createdAt),
        KeySchema: table.metadata.keySchema,
        BillingModeSummary: {
          BillingMode: table.metadata.billingMode
        },
        ItemCount: table.metadata.itemCount,
        GlobalSecondaryIndexes: table.metadata.globalSecondaryIndexes
      }
    };
  }

  async listTagsOfResource(params: { ResourceArn: string }): Promise<any> {
    const table = mockResources.dynamoDbTables.find(
      t => t.arn === params.ResourceArn
    );

    return {
      Tags: Object.entries(table?.tags || {}).map(([Key, Value]) => ({
        Key,
        Value
      }))
    };
  }
}

/**
 * Mock S3 Client
 */
export class MockS3Client {
  async listBuckets(): Promise<{ Buckets: Array<{ Name: string; CreationDate: Date }> }> {
    return {
      Buckets: mockResources.s3Buckets.map(b => ({
        Name: b.physicalId,
        CreationDate: new Date(b.createdAt)
      }))
    };
  }

  async getBucketTagging(params: { Bucket: string }): Promise<any> {
    const bucket = mockResources.s3Buckets.find(
      b => b.physicalId === params.Bucket
    );

    return {
      TagSet: Object.entries(bucket?.tags || {}).map(([Key, Value]) => ({
        Key,
        Value
      }))
    };
  }

  async getBucketVersioning(params: { Bucket: string }): Promise<any> {
    const bucket = mockResources.s3Buckets.find(
      b => b.physicalId === params.Bucket
    );

    return {
      Status: bucket?.metadata.versioning || 'Disabled'
    };
  }
}

/**
 * Mock IAM Client
 */
export class MockIAMClient {
  async listRoles(params?: { PathPrefix?: string }): Promise<any> {
    return {
      Roles: mockResources.iamRoles.map(r => ({
        RoleName: r.physicalId,
        Arn: r.arn,
        CreateDate: new Date(r.createdAt)
      }))
    };
  }

  async getRole(params: { RoleName: string }): Promise<any> {
    const role = mockResources.iamRoles.find(
      r => r.physicalId === params.RoleName
    );

    if (!role) {
      throw new Error(`Role not found: ${params.RoleName}`);
    }

    return {
      Role: {
        RoleName: role.physicalId,
        Arn: role.arn,
        CreateDate: new Date(role.createdAt)
      }
    };
  }

  async listAttachedRolePolicies(params: { RoleName: string }): Promise<any> {
    const role = mockResources.iamRoles.find(
      r => r.physicalId === params.RoleName
    );

    return {
      AttachedPolicies: (role?.metadata.managedPolicies || []).map(arn => ({
        PolicyArn: arn
      }))
    };
  }

  async listRolePolicies(params: { RoleName: string }): Promise<any> {
    const role = mockResources.iamRoles.find(
      r => r.physicalId === params.RoleName
    );

    return {
      PolicyNames: (role?.metadata.inlinePolicies || []).map(p => p.name)
    };
  }
}

/**
 * Mock CloudWatch Logs Client
 */
export class MockLogsClient {
  async describeLogGroups(params?: { logGroupNamePrefix?: string }): Promise<any> {
    let groups = mockResources.logGroups;

    if (params?.logGroupNamePrefix) {
      groups = groups.filter(g =>
        g.physicalId.startsWith(params.logGroupNamePrefix!)
      );
    }

    return {
      logGroups: groups.map(g => ({
        logGroupName: g.physicalId,
        arn: g.arn,
        creationTime: new Date(g.createdAt).getTime(),
        retentionInDays: g.metadata.retentionInDays
      }))
    };
  }
}

/**
 * Mock CloudFormation Client
 */
export class MockCloudFormationClient {
  async detectStackDrift(params: { StackName: string }): Promise<any> {
    return {
      StackDriftDetectionId: 'mock-drift-id-123'
    };
  }

  async describeStackDriftDetectionStatus(params: { StackDriftDetectionId: string }): Promise<any> {
    return {
      StackDriftDetectionStatus: 'DETECTION_COMPLETE',
      StackDriftStatus: mockResources.cloudFormationDrift.driftStatus
    };
  }

  async describeStackResourceDrifts(params: { StackName: string }): Promise<any> {
    return {
      StackResourceDrifts: mockResources.cloudFormationDrift.driftedResources.map(r => ({
        LogicalResourceId: r.logicalResourceId,
        PhysicalResourceId: r.physicalResourceId,
        ResourceType: r.resourceType,
        StackResourceDriftStatus: r.driftStatus,
        PropertyDifferences: r.propertyDifferences
      }))
    };
  }

  async describeStackResources(params: { StackName: string }): Promise<any> {
    return {
      StackResources: [
        {
          LogicalResourceId: 'UsersTable',
          PhysicalResourceId: 'users-table-dev',
          ResourceType: 'AWS::DynamoDB::Table',
          ResourceStatus: 'UPDATE_COMPLETE'
        },
        {
          LogicalResourceId: 'ApiLambdaRole',
          PhysicalResourceId: 'messy-app-api-role-dev',
          ResourceType: 'AWS::IAM::Role',
          ResourceStatus: 'UPDATE_COMPLETE'
        }
      ]
    };
  }
}

/**
 * Mock User Intervention Responses
 */
export class MockInterventionManager {
  private responses: Map<string, any> = new Map();

  /**
   * Set predefined responses for automated testing
   */
  setResponse(promptId: string, response: any): void {
    this.responses.set(promptId, response);
  }

  /**
   * Simulate user selecting physical ID
   */
  async promptForPhysicalId(
    logicalId: string,
    resourceType: string,
    candidates: any[]
  ): Promise<string> {
    const key = `${logicalId}.physicalId`;
    const response = this.responses.get(key);

    if (response) {
      return response;
    }

    // Default: return first candidate
    return candidates[0]?.physicalId || 'manual-entry';
  }

  /**
   * Simulate user confirming critical difference
   */
  async confirmCriticalDifference(
    resourceId: string,
    differences: any[]
  ): Promise<'proceed' | 'abort' | 'manual'> {
    const key = `${resourceId}.criticalDifference`;
    return this.responses.get(key) || 'proceed';
  }

  /**
   * Simulate user resolving drift
   */
  async resolveDrift(
    resourceId: string,
    drift: MockDriftInfo
  ): Promise<'use-aws' | 'use-template' | 'manual'> {
    const key = `${resourceId}.drift`;
    return this.responses.get(key) || 'use-aws';
  }

  /**
   * Clear all responses
   */
  clearResponses(): void {
    this.responses.clear();
  }
}

/**
 * Create mock AWS clients for testing
 */
export function createMockAwsClients() {
  return {
    dynamodb: new MockDynamoDBClient(),
    s3: new MockS3Client(),
    iam: new MockIAMClient(),
    logs: new MockLogsClient(),
    cloudformation: new MockCloudFormationClient()
  };
}

/**
 * Create mock intervention manager for testing
 */
export function createMockInterventionManager() {
  return new MockInterventionManager();
}

/**
 * Get mock resources for specific tests
 */
export function getMockResources() {
  return mockResources;
}

/**
 * Helper to convert mock resources to DiscoveredResource format
 */
export function convertToDiscoveredResources(
  resourceType: 'dynamoDbTables' | 's3Buckets' | 'iamRoles' | 'logGroups'
): MockDiscoveredResource[] {
  const resources = mockResources[resourceType];

  return resources.map(r => ({
    ...r,
    resourceType: getResourceType(resourceType),
    createdAt: r.createdAt ? new Date(r.createdAt) : undefined
  }));
}

function getResourceType(category: string): string {
  const mapping: Record<string, string> = {
    dynamoDbTables: 'AWS::DynamoDB::Table',
    s3Buckets: 'AWS::S3::Bucket',
    iamRoles: 'AWS::IAM::Role',
    logGroups: 'AWS::Logs::LogGroup'
  };

  return mapping[category] || category;
}
