/**
 * Mock AWS SDK clients for testing
 */

export class MockCloudFormationClient {
  send = jest.fn();

  mockDescribeStacks(stackName: string, resources: any[]) {
    this.send.mockResolvedValueOnce({
      Stacks: [{
        StackName: stackName,
        StackStatus: 'UPDATE_COMPLETE',
        CreationTime: new Date(),
      }]
    });
  }

  mockDescribeStackResources(resources: any[]) {
    this.send.mockResolvedValueOnce({
      StackResources: resources
    });
  }

  mockUpdateStack() {
    this.send.mockResolvedValueOnce({
      StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345'
    });
  }

  mockDetectStackDrift(driftStatus: string = 'IN_SYNC') {
    this.send.mockResolvedValueOnce({
      StackDriftDetectionId: 'drift-12345'
    });

    this.send.mockResolvedValueOnce({
      StackDriftStatus: driftStatus,
      DriftedStackResourceCount: 0
    });
  }
}

export class MockDynamoDBClient {
  send = jest.fn();

  mockDescribeTable(tableName: string) {
    this.send.mockResolvedValueOnce({
      Table: {
        TableName: tableName,
        TableStatus: 'ACTIVE',
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' }
        ],
        BillingModeSummary: {
          BillingMode: 'PAY_PER_REQUEST'
        }
      }
    });
  }
}

export class MockS3Client {
  send = jest.fn();

  mockHeadBucket(bucketName: string, exists: boolean = true) {
    if (exists) {
      this.send.mockResolvedValueOnce({});
    } else {
      this.send.mockRejectedValueOnce(new Error('NotFound'));
    }
  }

  mockGetBucketVersioning(status: string = 'Enabled') {
    this.send.mockResolvedValueOnce({
      Status: status
    });
  }
}

export class MockLogsClient {
  send = jest.fn();

  mockDescribeLogGroups(logGroupName: string, exists: boolean = true) {
    if (exists) {
      this.send.mockResolvedValueOnce({
        logGroups: [{
          logGroupName,
          creationTime: Date.now(),
          retentionInDays: 7
        }]
      });
    } else {
      this.send.mockResolvedValueOnce({
        logGroups: []
      });
    }
  }
}

// Export mock instances
export const mockCloudFormationClient = new MockCloudFormationClient();
export const mockDynamoDBClient = new MockDynamoDBClient();
export const mockS3Client = new MockS3Client();
export const mockLogsClient = new MockLogsClient();
