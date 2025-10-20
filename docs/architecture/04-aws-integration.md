# AWS Service Integration Layer

## Overview

The AWS Integration Layer provides a clean abstraction over AWS SDK clients, handling authentication, error handling, retries, and rate limiting.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│            AWS Integration Layer                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ CloudFormation│  │   DynamoDB   │  │      S3      │ │
│  │    Client     │  │    Client    │  │    Client    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │    Lambda    │  │     IAM      │  │     Logs     │ │
│  │    Client    │  │    Client    │  │    Client    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Base AWS Client (Common Logic)          │   │
│  │  - Authentication                                │   │
│  │  - Error handling & retries                      │   │
│  │  - Rate limiting                                 │   │
│  │  - Logging & monitoring                          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Base AWS Client

### Interface

```typescript
export interface BaseAwsClient {
  /**
   * Get AWS credentials
   */
  getCredentials(): Promise<AwsCredentials>;

  /**
   * Execute AWS operation with retry logic
   */
  executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;

  /**
   * Check if resource exists
   */
  resourceExists(
    resourceType: string,
    identifier: string
  ): Promise<boolean>;
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: string[];
}
```

### Implementation

```typescript
export class BaseAwsClientImpl implements BaseAwsClient {
  private config: AwsConfig;
  private logger: Logger;

  constructor(config: AwsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getCredentials(): Promise<AwsCredentials> {
    // Try credentials from config first
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
        region: this.config.region || 'us-east-1'
      };
    }

    // Try AWS profile
    if (this.config.profile) {
      return await this.getCredentialsFromProfile(this.config.profile);
    }

    // Try default credentials (environment, instance profile, etc.)
    return await this.getDefaultCredentials();
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      retryableErrors = [
        'TooManyRequestsException',
        'RequestLimitExceeded',
        'Throttling',
        'ThrottlingException',
        'ServiceUnavailable',
        'InternalError'
      ]
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Attempt ${attempt + 1}/${maxRetries + 1}`);
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(
          error as Error,
          retryableErrors
        );

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        // Calculate backoff delay (exponential with jitter)
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          maxDelay
        );

        this.logger.warn(
          `Retryable error: ${(error as Error).message}. ` +
          `Retrying in ${delay}ms...`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(
    error: Error,
    retryableErrors: string[]
  ): boolean {
    const errorName = error.name || '';
    const errorMessage = error.message || '';

    return retryableErrors.some(
      retryable =>
        errorName.includes(retryable) || errorMessage.includes(retryable)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async resourceExists(
    resourceType: string,
    identifier: string
  ): Promise<boolean> {
    // Implementation depends on resource type
    // This is a placeholder that should be overridden
    throw new Error('Not implemented in base class');
  }

  private async getCredentialsFromProfile(
    profile: string
  ): Promise<AwsCredentials> {
    // Use AWS SDK credential provider chain
    const { fromIni } = await import('@aws-sdk/credential-providers');
    const credentials = fromIni({ profile });
    const creds = await credentials();

    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      region: this.config.region || 'us-east-1'
    };
  }

  private async getDefaultCredentials(): Promise<AwsCredentials> {
    const { defaultProvider } = await import(
      '@aws-sdk/credential-provider-node'
    );
    const credentials = defaultProvider();
    const creds = await credentials();

    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      region: this.config.region || 'us-east-1'
    };
  }
}
```

## CloudFormation Client

### Interface

```typescript
export interface CloudFormationClient {
  /**
   * Get stack details
   */
  getStack(stackName: string): Promise<Stack>;

  /**
   * Check if stack exists
   */
  stackExists(stackName: string): Promise<boolean>;

  /**
   * Update stack with new template
   */
  updateStack(
    stackName: string,
    template: CloudFormationTemplate
  ): Promise<StackUpdateResult>;

  /**
   * Get stack resources
   */
  getStackResources(stackName: string): Promise<StackResource[]>;

  /**
   * Detect drift for stack
   */
  detectStackDrift(stackName: string): Promise<DriftDetectionResult>;

  /**
   * Get resource drift details
   */
  getResourceDrift(
    stackName: string,
    logicalResourceId: string
  ): Promise<ResourceDrift>;

  /**
   * Validate template
   */
  validateTemplate(
    template: CloudFormationTemplate
  ): Promise<ValidationResult>;

  /**
   * Get stack events
   */
  getStackEvents(
    stackName: string,
    limit?: number
  ): Promise<StackEvent[]>;
}

export interface Stack {
  StackName: string;
  StackId: string;
  StackStatus: string;
  CreationTime: Date;
  LastUpdatedTime?: Date;
  Parameters?: StackParameter[];
  Outputs?: StackOutput[];
  Tags?: Tag[];
}

export interface StackResource {
  LogicalResourceId: string;
  PhysicalResourceId: string;
  ResourceType: string;
  ResourceStatus: string;
  Timestamp: Date;
}

export interface DriftDetectionResult {
  StackDriftStatus: 'DRIFTED' | 'IN_SYNC' | 'UNKNOWN' | 'NOT_CHECKED';
  DriftedResources: ResourceDrift[];
}

export interface ResourceDrift {
  LogicalResourceId: string;
  PhysicalResourceId: string;
  ResourceType: string;
  StackResourceDriftStatus: string;
  PropertyDifferences?: PropertyDifference[];
}

export interface StackUpdateResult {
  StackId: string;
  ChangeSetId?: string;
  Status: string;
}
```

### Implementation

```typescript
export class CloudFormationClientImpl
  extends BaseAwsClientImpl
  implements CloudFormationClient
{
  private cfnClient: CFNClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.cfnClient = new CFNClient({
      region: config.region
    });
  }

  async getStack(stackName: string): Promise<Stack> {
    return this.executeWithRetry(async () => {
      const response = await this.cfnClient.send(
        new DescribeStacksCommand({
          StackName: stackName
        })
      );

      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(`Stack not found: ${stackName}`);
      }

      return response.Stacks[0] as Stack;
    });
  }

  async stackExists(stackName: string): Promise<boolean> {
    try {
      await this.getStack(stackName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('does not exist')) {
        return false;
      }
      throw error;
    }
  }

  async updateStack(
    stackName: string,
    template: CloudFormationTemplate
  ): Promise<StackUpdateResult> {
    return this.executeWithRetry(async () => {
      const response = await this.cfnClient.send(
        new UpdateStackCommand({
          StackName: stackName,
          TemplateBody: JSON.stringify(template, null, 2),
          Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']
        })
      );

      return {
        StackId: response.StackId || '',
        Status: 'UPDATE_IN_PROGRESS'
      };
    });
  }

  async getStackResources(
    stackName: string
  ): Promise<StackResource[]> {
    return this.executeWithRetry(async () => {
      const resources: StackResource[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.cfnClient.send(
          new ListStackResourcesCommand({
            StackName: stackName,
            NextToken: nextToken
          })
        );

        if (response.StackResourceSummaries) {
          resources.push(...(response.StackResourceSummaries as StackResource[]));
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return resources;
    });
  }

  async detectStackDrift(
    stackName: string
  ): Promise<DriftDetectionResult> {
    return this.executeWithRetry(async () => {
      // Initiate drift detection
      const detectResponse = await this.cfnClient.send(
        new DetectStackDriftCommand({
          StackName: stackName
        })
      );

      const driftDetectionId = detectResponse.StackDriftDetectionId;

      // Poll for completion
      let status = 'DETECTION_IN_PROGRESS';
      while (
        status === 'DETECTION_IN_PROGRESS' ||
        status === 'DETECTION_PENDING'
      ) {
        await this.sleep(2000);

        const statusResponse = await this.cfnClient.send(
          new DescribeStackDriftDetectionStatusCommand({
            StackDriftDetectionId: driftDetectionId
          })
        );

        status = statusResponse.DetectionStatus || '';
      }

      // Get drift results
      const driftResponse = await this.cfnClient.send(
        new DescribeStackResourceDriftsCommand({
          StackName: stackName,
          StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED']
        })
      );

      return {
        StackDriftStatus:
          (status as DriftDetectionResult['StackDriftStatus']) || 'UNKNOWN',
        DriftedResources: (driftResponse.StackResourceDrifts ||
          []) as ResourceDrift[]
      };
    });
  }

  async getResourceDrift(
    stackName: string,
    logicalResourceId: string
  ): Promise<ResourceDrift> {
    return this.executeWithRetry(async () => {
      const response = await this.cfnClient.send(
        new DescribeStackResourceDriftsCommand({
          StackName: stackName
        })
      );

      const drift = response.StackResourceDrifts?.find(
        d => d.LogicalResourceId === logicalResourceId
      );

      if (!drift) {
        throw new Error(
          `Resource drift not found: ${logicalResourceId}`
        );
      }

      return drift as ResourceDrift;
    });
  }

  async validateTemplate(
    template: CloudFormationTemplate
  ): Promise<ValidationResult> {
    return this.executeWithRetry(async () => {
      try {
        await this.cfnClient.send(
          new ValidateTemplateCommand({
            TemplateBody: JSON.stringify(template, null, 2)
          })
        );

        return {
          valid: true,
          errors: [],
          warnings: []
        };
      } catch (error) {
        return {
          valid: false,
          errors: [(error as Error).message],
          warnings: []
        };
      }
    });
  }

  async getStackEvents(
    stackName: string,
    limit: number = 100
  ): Promise<StackEvent[]> {
    return this.executeWithRetry(async () => {
      const events: StackEvent[] = [];
      let nextToken: string | undefined;
      let count = 0;

      do {
        const response = await this.cfnClient.send(
          new DescribeStackEventsCommand({
            StackName: stackName,
            NextToken: nextToken
          })
        );

        if (response.StackEvents) {
          const remaining = limit - count;
          const toAdd = response.StackEvents.slice(0, remaining);
          events.push(...(toAdd as StackEvent[]));
          count += toAdd.length;
        }

        nextToken = response.NextToken;
      } while (nextToken && count < limit);

      return events;
    });
  }
}

export interface StackEvent {
  EventId: string;
  StackName: string;
  LogicalResourceId: string;
  ResourceStatus: string;
  ResourceStatusReason?: string;
  Timestamp: Date;
}
```

## DynamoDB Client

### Interface

```typescript
export interface DynamoDBClient {
  /**
   * Check if table exists
   */
  tableExists(tableName: string): Promise<boolean>;

  /**
   * Get table description
   */
  describeTable(tableName: string): Promise<TableDescription>;

  /**
   * List all tables
   */
  listTables(): Promise<string[]>;
}

export interface TableDescription {
  TableName: string;
  TableArn: string;
  TableStatus: string;
  KeySchema: KeySchemaElement[];
  AttributeDefinitions: AttributeDefinition[];
  BillingModeSummary?: BillingModeSummary;
  StreamSpecification?: StreamSpecification;
}
```

### Implementation

```typescript
export class DynamoDBClientImpl
  extends BaseAwsClientImpl
  implements DynamoDBClient
{
  private ddbClient: DDBClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.ddbClient = new DDBClient({
      region: config.region
    });
  }

  async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.describeTable(tableName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  async describeTable(tableName: string): Promise<TableDescription> {
    return this.executeWithRetry(async () => {
      const response = await this.ddbClient.send(
        new DescribeTableCommand({
          TableName: tableName
        })
      );

      if (!response.Table) {
        throw new Error(`Table not found: ${tableName}`);
      }

      return response.Table as TableDescription;
    });
  }

  async listTables(): Promise<string[]> {
    return this.executeWithRetry(async () => {
      const tables: string[] = [];
      let lastEvaluatedTableName: string | undefined;

      do {
        const response = await this.ddbClient.send(
          new ListTablesCommand({
            ExclusiveStartTableName: lastEvaluatedTableName
          })
        );

        if (response.TableNames) {
          tables.push(...response.TableNames);
        }

        lastEvaluatedTableName = response.LastEvaluatedTableName;
      } while (lastEvaluatedTableName);

      return tables;
    });
  }
}
```

## S3 Client

### Interface

```typescript
export interface S3Client {
  /**
   * Check if bucket exists
   */
  bucketExists(bucketName: string): Promise<boolean>;

  /**
   * Get bucket details
   */
  getBucket(bucketName: string): Promise<BucketDescription>;

  /**
   * Get bucket versioning
   */
  getBucketVersioning(
    bucketName: string
  ): Promise<BucketVersioningConfiguration>;

  /**
   * Get bucket encryption
   */
  getBucketEncryption(
    bucketName: string
  ): Promise<BucketEncryptionConfiguration>;
}

export interface BucketDescription {
  Name: string;
  CreationDate: Date;
}

export interface BucketVersioningConfiguration {
  Status: 'Enabled' | 'Suspended' | undefined;
  MFADelete?: 'Enabled' | 'Disabled';
}

export interface BucketEncryptionConfiguration {
  Rules: ServerSideEncryptionRule[];
}
```

### Implementation

```typescript
export class S3ClientImpl extends BaseAwsClientImpl implements S3Client {
  private s3Client: S3SDKClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.s3Client = new S3SDKClient({
      region: config.region
    });
  }

  async bucketExists(bucketName: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: bucketName
        })
      );
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        return false;
      }
      throw error;
    }
  }

  async getBucket(bucketName: string): Promise<BucketDescription> {
    return this.executeWithRetry(async () => {
      // S3 doesn't have a direct "describe bucket" API
      // We need to list buckets and find the one we want
      const response = await this.s3Client.send(new ListBucketsCommand({}));

      const bucket = response.Buckets?.find(b => b.Name === bucketName);

      if (!bucket) {
        throw new Error(`Bucket not found: ${bucketName}`);
      }

      return {
        Name: bucket.Name || '',
        CreationDate: bucket.CreationDate || new Date()
      };
    });
  }

  async getBucketVersioning(
    bucketName: string
  ): Promise<BucketVersioningConfiguration> {
    return this.executeWithRetry(async () => {
      const response = await this.s3Client.send(
        new GetBucketVersioningCommand({
          Bucket: bucketName
        })
      );

      return {
        Status: response.Status as BucketVersioningConfiguration['Status'],
        MFADelete: response.MFADelete as BucketVersioningConfiguration['MFADelete']
      };
    });
  }

  async getBucketEncryption(
    bucketName: string
  ): Promise<BucketEncryptionConfiguration> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.s3Client.send(
          new GetBucketEncryptionCommand({
            Bucket: bucketName
          })
        );

        return {
          Rules: (response.ServerSideEncryptionConfiguration?.Rules ||
            []) as ServerSideEncryptionRule[]
        };
      } catch (error) {
        const err = error as Error;
        if (err.name === 'ServerSideEncryptionConfigurationNotFoundError') {
          return { Rules: [] };
        }
        throw error;
      }
    });
  }
}
```

## CloudWatch Logs Client

### Interface

```typescript
export interface LogsClient {
  /**
   * Check if log group exists
   */
  logGroupExists(logGroupName: string): Promise<boolean>;

  /**
   * Get log group details
   */
  describeLogGroup(logGroupName: string): Promise<LogGroupDescription>;

  /**
   * List log groups
   */
  listLogGroups(prefix?: string): Promise<LogGroupDescription[]>;
}

export interface LogGroupDescription {
  logGroupName: string;
  creationTime?: number;
  retentionInDays?: number;
  kmsKeyId?: string;
  storedBytes?: number;
}
```

### Implementation

```typescript
export class LogsClientImpl extends BaseAwsClientImpl implements LogsClient {
  private logsClient: LogsSDKClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.logsClient = new LogsSDKClient({
      region: config.region
    });
  }

  async logGroupExists(logGroupName: string): Promise<boolean> {
    try {
      await this.describeLogGroup(logGroupName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  async describeLogGroup(
    logGroupName: string
  ): Promise<LogGroupDescription> {
    return this.executeWithRetry(async () => {
      const response = await this.logsClient.send(
        new DescribeLogGroupsCommand({
          logGroupNamePrefix: logGroupName,
          limit: 1
        })
      );

      const logGroup = response.logGroups?.find(
        lg => lg.logGroupName === logGroupName
      );

      if (!logGroup) {
        throw new Error(`Log group not found: ${logGroupName}`);
      }

      return logGroup as LogGroupDescription;
    });
  }

  async listLogGroups(prefix?: string): Promise<LogGroupDescription[]> {
    return this.executeWithRetry(async () => {
      const logGroups: LogGroupDescription[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.logsClient.send(
          new DescribeLogGroupsCommand({
            logGroupNamePrefix: prefix,
            nextToken
          })
        );

        if (response.logGroups) {
          logGroups.push(...(response.logGroups as LogGroupDescription[]));
        }

        nextToken = response.nextToken;
      } while (nextToken);

      return logGroups;
    });
  }
}
```

## AWS Client Factory

### Factory Pattern

```typescript
export class AwsClientFactory {
  private config: AwsConfig;
  private logger: Logger;
  private clients: Map<string, BaseAwsClient>;

  constructor(config: AwsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.clients = new Map();
  }

  getCloudFormationClient(): CloudFormationClient {
    if (!this.clients.has('cloudformation')) {
      this.clients.set(
        'cloudformation',
        new CloudFormationClientImpl(this.config, this.logger)
      );
    }
    return this.clients.get('cloudformation') as CloudFormationClient;
  }

  getDynamoDBClient(): DynamoDBClient {
    if (!this.clients.has('dynamodb')) {
      this.clients.set(
        'dynamodb',
        new DynamoDBClientImpl(this.config, this.logger)
      );
    }
    return this.clients.get('dynamodb') as DynamoDBClient;
  }

  getS3Client(): S3Client {
    if (!this.clients.has('s3')) {
      this.clients.set('s3', new S3ClientImpl(this.config, this.logger));
    }
    return this.clients.get('s3') as S3Client;
  }

  getLogsClient(): LogsClient {
    if (!this.clients.has('logs')) {
      this.clients.set('logs', new LogsClientImpl(this.config, this.logger));
    }
    return this.clients.get('logs') as LogsClient;
  }
}
```

## Error Handling

### Custom AWS Errors

```typescript
export class AwsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'AwsError';
  }

  static fromSdkError(error: Error): AwsError {
    const sdkError = error as any;
    return new AwsError(
      error.message,
      sdkError.name || 'UnknownError',
      sdkError.$metadata?.httpStatusCode,
      sdkError.$metadata?.requestId
    );
  }
}
```
