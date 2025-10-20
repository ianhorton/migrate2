/**
 * DynamoDB Client Implementation
 *
 * Provides operations for:
 * - Table existence checks
 * - Table description and metadata
 * - Table listing
 * - Resource verification for migration
 */

import {
  DynamoDBClient as DDBClient,
  DescribeTableCommand,
  ListTablesCommand,
  DescribeTimeToLiveCommand,
  DescribeContinuousBackupsCommand,
  ListTagsOfResourceCommand,
  TableDescription,
  AttributeDefinition,
  KeySchemaElement,
  BillingModeSummary,
  StreamSpecification,
  SSEDescription,
  TimeToLiveDescription,
  ContinuousBackupsDescription,
  Tag,
} from '@aws-sdk/client-dynamodb';

import { BaseAwsClient, AwsConfig } from './base-client';
import { Logger } from '../utils/logger';

export interface DynamoDBTableDescription {
  TableName: string;
  TableArn: string;
  TableStatus: string;
  CreationDateTime?: Date;
  KeySchema: KeySchemaElement[];
  AttributeDefinitions: AttributeDefinition[];
  BillingModeSummary?: BillingModeSummary;
  StreamSpecification?: StreamSpecification;
  SSEDescription?: SSEDescription;
  TableSizeBytes?: number;
  ItemCount?: number;
  ProvisionedThroughput?: {
    ReadCapacityUnits: number;
    WriteCapacityUnits: number;
  };
  GlobalSecondaryIndexes?: GlobalSecondaryIndex[];
  LocalSecondaryIndexes?: LocalSecondaryIndex[];
  Tags?: Tag[];
  TimeToLive?: TimeToLiveDescription;
  ContinuousBackups?: ContinuousBackupsDescription;
}

export interface GlobalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: {
    ProjectionType: string;
    NonKeyAttributes?: string[];
  };
  IndexStatus?: string;
  ProvisionedThroughput?: {
    ReadCapacityUnits: number;
    WriteCapacityUnits: number;
  };
}

export interface LocalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: {
    ProjectionType: string;
    NonKeyAttributes?: string[];
  };
}

/**
 * DynamoDB Client for table operations
 */
export class DynamoDBClient extends BaseAwsClient {
  private client: DDBClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.client = new DDBClient({
      region: this.getRegion(),
      endpoint: config.endpoint,
    });
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      await this.describeTable(tableName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (
        err.name === 'ResourceNotFoundException' ||
        err.message.includes('Table not found')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get detailed table description
   */
  async describeTable(tableName: string): Promise<DynamoDBTableDescription> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Describing DynamoDB table: ${tableName}`);

      const response = await this.client.send(
        new DescribeTableCommand({
          TableName: tableName,
        })
      );

      if (!response.Table) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const table = response.Table as DynamoDBTableDescription;

      // Get additional metadata
      try {
        const ttl = await this.getTimeToLive(tableName);
        table.TimeToLive = ttl;
      } catch (error) {
        this.logger.debug(
          `Could not get TTL for table ${tableName}: ${(error as Error).message}`
        );
      }

      try {
        const backups = await this.getContinuousBackups(tableName);
        table.ContinuousBackups = backups;
      } catch (error) {
        this.logger.debug(
          `Could not get backups for table ${tableName}: ${
            (error as Error).message
          }`
        );
      }

      try {
        const tags = await this.listTags(table.TableArn!);
        table.Tags = tags;
      } catch (error) {
        this.logger.debug(
          `Could not get tags for table ${tableName}: ${(error as Error).message}`
        );
      }

      return table;
    });
  }

  /**
   * List all tables in the region
   */
  async listTables(): Promise<string[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug('Listing DynamoDB tables');

      const tables: string[] = [];
      let lastEvaluatedTableName: string | undefined;

      do {
        const response = await this.client.send(
          new ListTablesCommand({
            ExclusiveStartTableName: lastEvaluatedTableName,
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

  /**
   * Get Time to Live configuration
   */
  async getTimeToLive(tableName: string): Promise<TimeToLiveDescription> {
    return this.executeWithRetry(async () => {
      const response = await this.client.send(
        new DescribeTimeToLiveCommand({
          TableName: tableName,
        })
      );

      return response.TimeToLiveDescription || {
        TimeToLiveStatus: 'DISABLED',
      };
    });
  }

  /**
   * Get continuous backup configuration
   */
  async getContinuousBackups(
    tableName: string
  ): Promise<ContinuousBackupsDescription> {
    return this.executeWithRetry(async () => {
      const response = await this.client.send(
        new DescribeContinuousBackupsCommand({
          TableName: tableName,
        })
      );

      return (
        response.ContinuousBackupsDescription || {
          ContinuousBackupsStatus: 'DISABLED',
          PointInTimeRecoveryDescription: {
            PointInTimeRecoveryStatus: 'DISABLED',
          },
        }
      );
    });
  }

  /**
   * List tags for a table
   */
  async listTags(tableArn: string): Promise<Tag[]> {
    return this.executeWithRetry(async () => {
      const tags: Tag[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.client.send(
          new ListTagsOfResourceCommand({
            ResourceArn: tableArn,
            NextToken: nextToken,
          })
        );

        if (response.Tags) {
          tags.push(...response.Tags);
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return tags;
    });
  }

  /**
   * Verify table matches expected configuration
   */
  async verifyTableConfiguration(
    tableName: string,
    expectedConfig: Partial<DynamoDBTableDescription>
  ): Promise<{
    matches: boolean;
    differences: string[];
  }> {
    const table = await this.describeTable(tableName);
    const differences: string[] = [];

    // Check billing mode
    if (
      expectedConfig.BillingModeSummary &&
      table.BillingModeSummary?.BillingMode !==
        expectedConfig.BillingModeSummary.BillingMode
    ) {
      differences.push(
        `Billing mode mismatch: expected ${expectedConfig.BillingModeSummary.BillingMode}, got ${table.BillingModeSummary?.BillingMode}`
      );
    }

    // Check stream specification
    if (
      expectedConfig.StreamSpecification &&
      table.StreamSpecification?.StreamEnabled !==
        expectedConfig.StreamSpecification.StreamEnabled
    ) {
      differences.push(
        `Stream configuration mismatch: expected enabled=${expectedConfig.StreamSpecification.StreamEnabled}, got enabled=${table.StreamSpecification?.StreamEnabled}`
      );
    }

    // Check key schema
    if (expectedConfig.KeySchema) {
      const keySchemaMatches = this.compareKeySchemas(
        table.KeySchema,
        expectedConfig.KeySchema
      );
      if (!keySchemaMatches) {
        differences.push('Key schema does not match expected configuration');
      }
    }

    return {
      matches: differences.length === 0,
      differences,
    };
  }

  /**
   * Compare two key schemas for equality
   */
  private compareKeySchemas(
    actual: KeySchemaElement[],
    expected: KeySchemaElement[]
  ): boolean {
    if (actual.length !== expected.length) {
      return false;
    }

    const actualSorted = [...actual].sort(
      (a, b) => a.AttributeName?.localeCompare(b.AttributeName || '') || 0
    );
    const expectedSorted = [...expected].sort(
      (a, b) => a.AttributeName?.localeCompare(b.AttributeName || '') || 0
    );

    return actualSorted.every(
      (element, index) =>
        element.AttributeName === expectedSorted[index].AttributeName &&
        element.KeyType === expectedSorted[index].KeyType
    );
  }
}
