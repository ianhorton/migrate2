/**
 * AWS Resource Discovery
 *
 * Scans AWS account to find actual physical resources using AWS SDK v3.
 * Supports discovering DynamoDB tables, S3 buckets, CloudWatch LogGroups,
 * Lambda functions, and IAM roles.
 *
 * Features:
 * - AWS SDK v3 integration
 * - Parallel resource discovery
 * - Comprehensive metadata collection
 * - Error handling and retry logic
 * - Result caching
 */

import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  ListTagsOfResourceCommand,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketTaggingCommand,
  GetBucketLocationCommand,
} from '@aws-sdk/client-s3';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { IAMClient, ListRolesCommand, GetRoleCommand, ListRoleTagsCommand } from '@aws-sdk/client-iam';
import { DiscoveredResource, DiscoveryOptions } from '../../types/discovery';

export class AWSResourceDiscovery {
  private readonly region: string;
  private readonly cache: Map<string, { resources: DiscoveredResource[]; timestamp: number }>;
  private readonly cacheExpiry: number;
  private readonly clientPool: Map<string, any> = new Map();
  private signalHandlersRegistered: boolean = false;

  constructor(region: string = 'us-east-1', options: DiscoveryOptions = {}) {
    this.region = region;
    this.cache = new Map();
    this.cacheExpiry = options.cacheExpiry || 5 * 60 * 1000; // 5 minutes default
    this.registerSignalHandlers();
  }

  /**
   * Discover all resources of a specific type
   */
  async discoverResourceType(
    resourceType: string,
    region?: string,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveredResource[]> {
    const targetRegion = region || this.region;
    const cacheKey = `${resourceType}-${targetRegion}`;

    // Check cache
    if (options.useCache !== false) {
      const cached = this.getCached(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let resources: DiscoveredResource[] = [];

    switch (resourceType) {
      case 'AWS::DynamoDB::Table':
        resources = await this.discoverDynamoDBTables(targetRegion);
        break;
      case 'AWS::S3::Bucket':
        resources = await this.discoverS3Buckets();
        break;
      case 'AWS::Logs::LogGroup':
        resources = await this.discoverLogGroups(undefined, targetRegion);
        break;
      case 'AWS::Lambda::Function':
        resources = await this.discoverLambdaFunctions(targetRegion);
        break;
      case 'AWS::IAM::Role':
        resources = await this.discoverIAMRoles();
        break;
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    // Cache results
    this.setCached(cacheKey, resources);

    return resources;
  }

  /**
   * Discover DynamoDB tables
   */
  async discoverDynamoDBTables(region?: string): Promise<DiscoveredResource[]> {
    const targetRegion = region || this.region;
    const client = this.getOrCreateClient('dynamodb', targetRegion, () =>
      new DynamoDBClient({ region: targetRegion })
    );
    const resources: DiscoveredResource[] = [];

    try {
      // List all tables
      const listCommand = new ListTablesCommand({});
      const listResponse = await client.send(listCommand);

      if (!listResponse.TableNames || listResponse.TableNames.length === 0) {
        return resources;
      }

      // Get details for each table
      for (const tableName of listResponse.TableNames) {
        try {
          const describeCommand = new DescribeTableCommand({ TableName: tableName });
          const tableDetails = await client.send(describeCommand);

          if (!tableDetails.Table) continue;

          // Get tags
          let tags: Record<string, string> = {};
          if (tableDetails.Table.TableArn) {
            try {
              const tagsCommand = new ListTagsOfResourceCommand({
                ResourceArn: tableDetails.Table.TableArn,
              });
              const tagsResponse = await client.send(tagsCommand);
              tags = (tagsResponse.Tags || []).reduce(
                (acc, tag) => ({
                  ...acc,
                  [tag.Key || '']: tag.Value || '',
                }),
                {}
              );
            } catch (error) {
              // Tags may not be accessible, continue without them
            }
          }

          resources.push({
            physicalId: tableName,
            resourceType: 'AWS::DynamoDB::Table',
            region: targetRegion,
            arn: tableDetails.Table.TableArn || '',
            tags,
            createdAt: tableDetails.Table.CreationDateTime,
            metadata: {
              keySchema: tableDetails.Table.KeySchema,
              attributeDefinitions: tableDetails.Table.AttributeDefinitions,
              billingMode: tableDetails.Table.BillingModeSummary?.BillingMode,
              itemCount: tableDetails.Table.ItemCount,
              tableSizeBytes: tableDetails.Table.TableSizeBytes,
              tableStatus: tableDetails.Table.TableStatus,
              globalSecondaryIndexes: tableDetails.Table.GlobalSecondaryIndexes?.map((gsi) => ({
                indexName: gsi.IndexName,
                keySchema: gsi.KeySchema,
              })),
              localSecondaryIndexes: tableDetails.Table.LocalSecondaryIndexes?.map((lsi) => ({
                indexName: lsi.IndexName,
                keySchema: lsi.KeySchema,
              })),
            },
          });
        } catch (error) {
          console.error(`Failed to describe table ${tableName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to list DynamoDB tables:', error);
      throw error;
    }

    return resources;
  }

  /**
   * Discover S3 buckets
   */
  async discoverS3Buckets(): Promise<DiscoveredResource[]> {
    const client = this.getOrCreateClient('s3', this.region, () =>
      new S3Client({ region: this.region })
    );
    const resources: DiscoveredResource[] = [];

    try {
      const listCommand = new ListBucketsCommand({});
      const listResponse = await client.send(listCommand);

      if (!listResponse.Buckets) {
        return resources;
      }

      for (const bucket of listResponse.Buckets) {
        if (!bucket.Name) continue;

        try {
          // Get bucket location
          let bucketRegion = this.region;
          try {
            const locationCommand = new GetBucketLocationCommand({ Bucket: bucket.Name });
            const locationResponse = await client.send(locationCommand);
            bucketRegion = locationResponse.LocationConstraint || 'us-east-1';
          } catch (error) {
            // Location may not be accessible
          }

          // Get tags
          let tags: Record<string, string> = {};
          try {
            const tagsCommand = new GetBucketTaggingCommand({ Bucket: bucket.Name });
            const tagsResponse = await client.send(tagsCommand);
            tags = (tagsResponse.TagSet || []).reduce(
              (acc, tag) => ({
                ...acc,
                [tag.Key || '']: tag.Value || '',
              }),
              {}
            );
          } catch (error) {
            // Bucket may not have tags
          }

          resources.push({
            physicalId: bucket.Name,
            resourceType: 'AWS::S3::Bucket',
            region: bucketRegion,
            arn: `arn:aws:s3:::${bucket.Name}`,
            tags,
            createdAt: bucket.CreationDate,
            metadata: {
              creationDate: bucket.CreationDate,
            },
          });
        } catch (error) {
          console.error(`Failed to describe bucket ${bucket.Name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to list S3 buckets:', error);
      throw error;
    }

    return resources;
  }

  /**
   * Discover CloudWatch LogGroups
   */
  async discoverLogGroups(prefix?: string, region?: string): Promise<DiscoveredResource[]> {
    const targetRegion = region || this.region;
    const client = this.getOrCreateClient('cloudwatch-logs', targetRegion, () =>
      new CloudWatchLogsClient({ region: targetRegion })
    );
    const resources: DiscoveredResource[] = [];

    try {
      const command = new DescribeLogGroupsCommand({
        logGroupNamePrefix: prefix,
      });
      const response = await client.send(command);

      if (!response.logGroups) {
        return resources;
      }

      for (const logGroup of response.logGroups) {
        if (!logGroup.logGroupName) continue;

        // Get tags
        let tags: Record<string, string> = {};
        if (logGroup.arn) {
          try {
            const tagsCommand = new ListTagsForResourceCommand({
              resourceArn: logGroup.arn,
            });
            const tagsResponse = await client.send(tagsCommand);
            tags = tagsResponse.tags || {};
          } catch (error) {
            // Tags may not be accessible
          }
        }

        resources.push({
          physicalId: logGroup.logGroupName,
          resourceType: 'AWS::Logs::LogGroup',
          region: targetRegion,
          arn: logGroup.arn || '',
          tags,
          createdAt: logGroup.creationTime ? new Date(logGroup.creationTime) : undefined,
          metadata: {
            retentionInDays: logGroup.retentionInDays,
            storedBytes: logGroup.storedBytes,
            kmsKeyId: logGroup.kmsKeyId,
          },
        });
      }
    } catch (error) {
      console.error('Failed to list CloudWatch LogGroups:', error);
      throw error;
    }

    return resources;
  }

  /**
   * Discover Lambda functions
   */
  async discoverLambdaFunctions(region?: string): Promise<DiscoveredResource[]> {
    const targetRegion = region || this.region;
    const client = this.getOrCreateClient('lambda', targetRegion, () =>
      new LambdaClient({ region: targetRegion })
    );
    const resources: DiscoveredResource[] = [];

    try {
      const listCommand = new ListFunctionsCommand({});
      const listResponse = await client.send(listCommand);

      if (!listResponse.Functions) {
        return resources;
      }

      for (const func of listResponse.Functions) {
        if (!func.FunctionName) continue;

        try {
          // Get function details
          const getCommand = new GetFunctionCommand({ FunctionName: func.FunctionName });
          const funcDetails = await client.send(getCommand);

          resources.push({
            physicalId: func.FunctionName,
            resourceType: 'AWS::Lambda::Function',
            region: targetRegion,
            arn: func.FunctionArn || '',
            tags: funcDetails.Tags || {},
            createdAt: func.LastModified ? new Date(func.LastModified) : undefined,
            metadata: {
              runtime: func.Runtime,
              handler: func.Handler,
              memorySize: func.MemorySize,
              timeout: func.Timeout,
              role: func.Role,
              environment: func.Environment,
              layers: func.Layers,
            },
          });
        } catch (error) {
          console.error(`Failed to get function ${func.FunctionName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to list Lambda functions:', error);
      throw error;
    }

    return resources;
  }

  /**
   * Discover IAM roles
   */
  async discoverIAMRoles(pathPrefix?: string): Promise<DiscoveredResource[]> {
    const client = this.getOrCreateClient('iam', this.region, () =>
      new IAMClient({ region: this.region })
    );
    const resources: DiscoveredResource[] = [];

    try {
      const listCommand = new ListRolesCommand({
        PathPrefix: pathPrefix,
      });
      const listResponse = await client.send(listCommand);

      if (!listResponse.Roles) {
        return resources;
      }

      for (const role of listResponse.Roles) {
        if (!role.RoleName) continue;

        try {
          // Get role details
          const getCommand = new GetRoleCommand({ RoleName: role.RoleName });
          const roleDetails = await client.send(getCommand);

          // Get tags
          let tags: Record<string, string> = {};
          try {
            const tagsCommand = new ListRoleTagsCommand({ RoleName: role.RoleName });
            const tagsResponse = await client.send(tagsCommand);
            tags = (tagsResponse.Tags || []).reduce(
              (acc: Record<string, string>, tag) => ({
                ...acc,
                [tag.Key || '']: tag.Value || '',
              }),
              {} as Record<string, string>
            );
          } catch (error) {
            // Tags may not be accessible
          }

          resources.push({
            physicalId: role.RoleName,
            resourceType: 'AWS::IAM::Role',
            region: 'global', // IAM is global
            arn: role.Arn || '',
            tags,
            createdAt: role.CreateDate,
            metadata: {
              path: role.Path,
              assumeRolePolicyDocument: roleDetails.Role?.AssumeRolePolicyDocument,
              description: role.Description,
              maxSessionDuration: role.MaxSessionDuration,
            },
          });
        } catch (error) {
          console.error(`Failed to get role ${role.RoleName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to list IAM roles:', error);
      throw error;
    }

    return resources;
  }

  /**
   * Batch discover all resource types
   */
  async discoverAll(
    resourceTypes: string[],
    region?: string
  ): Promise<Map<string, DiscoveredResource[]>> {
    const results = new Map<string, DiscoveredResource[]>();

    try {
      await Promise.all(
        resourceTypes.map(async (resourceType) => {
          try {
            const resources = await this.discoverResourceType(resourceType, region);
            results.set(resourceType, resources);
          } catch (error) {
            console.error(`Failed to discover ${resourceType}:`, error);
            results.set(resourceType, []);
          }
        })
      );
    } catch (error) {
      console.error('Error during batch discovery:', error);
      throw error;
    } finally {
      // Clean up clients after batch operation
      await this.cleanupClients();
    }

    return results;
  }

  /**
   * Get cached resources
   */
  private getCached(key: string): DiscoveredResource[] | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.resources;
  }

  /**
   * Set cached resources
   */
  private setCached(key: string, resources: DiscoveredResource[]): void {
    this.cache.set(key, {
      resources,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get or create AWS SDK client (connection pooling)
   */
  private getOrCreateClient<T>(
    clientType: string,
    region: string,
    factory: () => T
  ): T {
    const key = `${clientType}-${region}`;

    if (!this.clientPool.has(key)) {
      this.clientPool.set(key, factory());
    }

    return this.clientPool.get(key) as T;
  }

  /**
   * Clean up AWS SDK clients
   */
  private async cleanupClients(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    for (const [key, client] of this.clientPool.entries()) {
      try {
        // AWS SDK v3 clients have a destroy method
        if (client && typeof client.destroy === 'function') {
          cleanupPromises.push(
            Promise.resolve(client.destroy()).catch((error) => {
              console.error(`Failed to destroy client ${key}:`, error);
            })
          );
        }
      } catch (error) {
        console.error(`Error cleaning up client ${key}:`, error);
      }
    }

    await Promise.all(cleanupPromises);
    this.clientPool.clear();
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;

    const handleShutdown = async () => {
      console.log('Received shutdown signal, cleaning up AWS clients...');
      await this.dispose();
      process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
    this.signalHandlersRegistered = true;
  }

  /**
   * Dispose of all resources
   */
  public async dispose(): Promise<void> {
    // Clean up AWS SDK clients
    await this.cleanupClients();

    // Clear cache to free memory
    this.clearCache();
  }
}
