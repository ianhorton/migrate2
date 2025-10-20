/**
 * AWS Client Factory
 *
 * Provides centralized client creation and management with:
 * - Singleton pattern for client reuse
 * - Consistent configuration across all clients
 * - Easy mocking for testing
 */

import { AwsConfig, BaseAwsClient } from './base-client';
import { CloudFormationClient } from './cloudformation';
import { DynamoDBClient } from './dynamodb';
import { S3Client } from './s3';
import { LogsClient } from './logs';
import { Logger } from '../utils/logger';

/**
 * Factory for creating and managing AWS service clients
 */
export class AwsClientFactory {
  private config: AwsConfig;
  private logger: Logger;
  private clients: Map<string, BaseAwsClient>;

  constructor(config: AwsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.clients = new Map();
  }

  /**
   * Get CloudFormation client (singleton)
   */
  getCloudFormationClient(): CloudFormationClient {
    if (!this.clients.has('cloudformation')) {
      this.logger.debug('Creating new CloudFormation client');
      this.clients.set(
        'cloudformation',
        new CloudFormationClient(this.config, this.logger)
      );
    }
    return this.clients.get('cloudformation') as CloudFormationClient;
  }

  /**
   * Get DynamoDB client (singleton)
   */
  getDynamoDBClient(): DynamoDBClient {
    if (!this.clients.has('dynamodb')) {
      this.logger.debug('Creating new DynamoDB client');
      this.clients.set(
        'dynamodb',
        new DynamoDBClient(this.config, this.logger)
      );
    }
    return this.clients.get('dynamodb') as DynamoDBClient;
  }

  /**
   * Get S3 client (singleton)
   */
  getS3Client(): S3Client {
    if (!this.clients.has('s3')) {
      this.logger.debug('Creating new S3 client');
      this.clients.set('s3', new S3Client(this.config, this.logger));
    }
    return this.clients.get('s3') as S3Client;
  }

  /**
   * Get CloudWatch Logs client (singleton)
   */
  getLogsClient(): LogsClient {
    if (!this.clients.has('logs')) {
      this.logger.debug('Creating new CloudWatch Logs client');
      this.clients.set('logs', new LogsClient(this.config, this.logger));
    }
    return this.clients.get('logs') as LogsClient;
  }

  /**
   * Clear all cached clients (useful for testing or config changes)
   */
  clearClients(): void {
    this.logger.debug('Clearing all cached AWS clients');
    this.clients.clear();
  }

  /**
   * Update configuration and clear clients
   */
  updateConfig(newConfig: Partial<AwsConfig>): void {
    this.logger.debug('Updating AWS client configuration');
    this.config = { ...this.config, ...newConfig };
    this.clearClients();
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): AwsConfig {
    return { ...this.config };
  }
}

/**
 * Create AWS client factory with default configuration
 */
export function createAwsClientFactory(
  config: Partial<AwsConfig> = {},
  logger?: Logger
): AwsClientFactory {
  const defaultConfig: AwsConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    ...config,
  };

  const defaultLogger =
    logger ||
    new Logger('aws-factory');

  return new AwsClientFactory(defaultConfig, defaultLogger);
}
