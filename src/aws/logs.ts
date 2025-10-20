/**
 * CloudWatch Logs Client Implementation
 *
 * Provides operations for:
 * - Log group existence checks
 * - Log group description and metadata
 * - Log group listing
 * - Retention policy management
 * - Resource verification for migration
 */

import {
  CloudWatchLogsClient as LogsSDKClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  FilterLogEventsCommand,
  LogGroup,
  LogStream,
  OutputLogEvent,
  FilteredLogEvent,
  DescribeResourcePoliciesCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { BaseAwsClient, AwsConfig } from './base-client';
import { Logger } from '../utils/logger';

export interface LogTag {
  Key: string;
  Value: string;
}

export interface LogGroupDescription {
  logGroupName: string;
  logGroupArn?: string;
  creationTime?: number;
  retentionInDays?: number;
  kmsKeyId?: string;
  storedBytes?: number;
  metricFilterCount?: number;
  tags?: LogTag[];
}

export interface LogStreamDescription extends LogStream {}

export interface LogEvent extends OutputLogEvent {}

export interface LogGroupConfiguration {
  name: string;
  retentionInDays?: number;
  kmsKeyId?: string;
  tags?: LogTag[];
}

/**
 * CloudWatch Logs Client for log group operations
 */
export class LogsClient extends BaseAwsClient {
  private client: LogsSDKClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.client = new LogsSDKClient({
      region: this.getRegion(),
      endpoint: config.endpoint,
    });
  }

  /**
   * Check if log group exists
   */
  async logGroupExists(logGroupName: string): Promise<boolean> {
    try {
      await this.describeLogGroup(logGroupName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (
        err.name === 'ResourceNotFoundException' ||
        err.message.includes('Log group not found')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get detailed log group description
   */
  async describeLogGroup(
    logGroupName: string
  ): Promise<LogGroupDescription> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Describing log group: ${logGroupName}`);

      const response = await this.client.send(
        new DescribeLogGroupsCommand({
          logGroupNamePrefix: logGroupName,
          limit: 50, // Search through first 50 groups
        })
      );

      // Find exact match
      const logGroup = response.logGroups?.find(
        (lg) => lg.logGroupName === logGroupName
      );

      if (!logGroup) {
        throw new Error(`Log group not found: ${logGroupName}`);
      }

      const description: LogGroupDescription = {
        logGroupName: logGroup.logGroupName || '',
        logGroupArn: logGroup.arn,
        creationTime: logGroup.creationTime,
        retentionInDays: logGroup.retentionInDays,
        kmsKeyId: logGroup.kmsKeyId,
        storedBytes: logGroup.storedBytes,
        metricFilterCount: logGroup.metricFilterCount,
      };

      // Get tags if available
      if (logGroup.arn) {
        try {
          const tags = await this.listTags(logGroup.arn);
          description.tags = tags;
        } catch (error) {
          this.logger.debug(
            `Could not get tags for log group ${logGroupName}: ${
              (error as Error).message
            }`
          );
        }
      }

      return description;
    });
  }

  /**
   * List log groups with optional prefix filter
   */
  async listLogGroups(prefix?: string): Promise<LogGroupDescription[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(
        `Listing log groups${prefix ? ` with prefix: ${prefix}` : ''}`
      );

      const logGroups: LogGroupDescription[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.client.send(
          new DescribeLogGroupsCommand({
            logGroupNamePrefix: prefix,
            nextToken,
          })
        );

        if (response.logGroups) {
          const descriptions = response.logGroups.map((lg) => ({
            logGroupName: lg.logGroupName || '',
            logGroupArn: lg.arn,
            creationTime: lg.creationTime,
            retentionInDays: lg.retentionInDays,
            kmsKeyId: lg.kmsKeyId,
            storedBytes: lg.storedBytes,
            metricFilterCount: lg.metricFilterCount,
          }));
          logGroups.push(...descriptions);
        }

        nextToken = response.nextToken;
      } while (nextToken);

      return logGroups;
    });
  }

  /**
   * List log streams in a log group
   */
  async listLogStreams(
    logGroupName: string,
    limit?: number
  ): Promise<LogStreamDescription[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Listing log streams for: ${logGroupName}`);

      const logStreams: LogStreamDescription[] = [];
      let nextToken: string | undefined;
      let count = 0;

      do {
        const response = await this.client.send(
          new DescribeLogStreamsCommand({
            logGroupName,
            nextToken,
            limit: limit ? Math.min(limit - count, 50) : 50,
            orderBy: 'LastEventTime',
            descending: true,
          })
        );

        if (response.logStreams) {
          logStreams.push(...(response.logStreams as LogStreamDescription[]));
          count += response.logStreams.length;
        }

        nextToken = response.nextToken;
      } while (nextToken && (!limit || count < limit));

      return logStreams;
    });
  }

  /**
   * Get log events from a specific log stream
   */
  async getLogEvents(
    logGroupName: string,
    logStreamName: string,
    options?: {
      startTime?: number;
      endTime?: number;
      limit?: number;
      startFromHead?: boolean;
    }
  ): Promise<LogEvent[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(
        `Getting log events from: ${logGroupName}/${logStreamName}`
      );

      const events: LogEvent[] = [];
      let nextToken: string | undefined;
      const limit = options?.limit || 100;
      let count = 0;

      do {
        const response = await this.client.send(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName,
            startTime: options?.startTime,
            endTime: options?.endTime,
            nextToken,
            limit: Math.min(limit - count, 100),
            startFromHead: options?.startFromHead,
          })
        );

        if (response.events) {
          events.push(...(response.events as LogEvent[]));
          count += response.events.length;
        }

        // Check if we have more events
        const newToken = options?.startFromHead
          ? response.nextForwardToken
          : response.nextBackwardToken;

        // Prevent infinite loops - token should change
        if (newToken === nextToken) {
          break;
        }

        nextToken = newToken;
      } while (nextToken && count < limit);

      return events;
    });
  }

  /**
   * Filter log events across all streams in a log group
   */
  async filterLogEvents(
    logGroupName: string,
    options?: {
      filterPattern?: string;
      startTime?: number;
      endTime?: number;
      limit?: number;
      logStreamNames?: string[];
    }
  ): Promise<FilteredLogEvent[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Filtering log events in: ${logGroupName}`);

      const events: FilteredLogEvent[] = [];
      let nextToken: string | undefined;
      const limit = options?.limit || 100;
      let count = 0;

      do {
        const response = await this.client.send(
          new FilterLogEventsCommand({
            logGroupName,
            filterPattern: options?.filterPattern,
            startTime: options?.startTime,
            endTime: options?.endTime,
            logStreamNames: options?.logStreamNames,
            nextToken,
            limit: Math.min(limit - count, 100),
          })
        );

        if (response.events) {
          events.push(...response.events);
          count += response.events.length;
        }

        nextToken = response.nextToken;
      } while (nextToken && count < limit);

      return events;
    });
  }

  /**
   * Get tags for a log group
   */
  async listTags(logGroupArn: string): Promise<LogTag[]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.send(
        new ListTagsForResourceCommand({
          resourceArn: logGroupArn,
        })
      );

      // Convert Record<string, string> to LogTag[]
      const tags: LogTag[] = [];
      if (response.tags) {
        for (const [key, value] of Object.entries(response.tags)) {
          tags.push({ Key: key, Value: value });
        }
      }

      return tags;
    });
  }

  /**
   * Get complete log group configuration
   */
  async getLogGroupConfiguration(
    logGroupName: string
  ): Promise<LogGroupConfiguration> {
    const description = await this.describeLogGroup(logGroupName);

    return {
      name: description.logGroupName,
      retentionInDays: description.retentionInDays,
      kmsKeyId: description.kmsKeyId,
      tags: description.tags,
    };
  }

  /**
   * Verify log group matches expected configuration
   */
  async verifyLogGroupConfiguration(
    logGroupName: string,
    expectedConfig: Partial<LogGroupConfiguration>
  ): Promise<{
    matches: boolean;
    differences: string[];
  }> {
    const logGroup = await this.describeLogGroup(logGroupName);
    const differences: string[] = [];

    // Check retention
    if (
      expectedConfig.retentionInDays !== undefined &&
      logGroup.retentionInDays !== expectedConfig.retentionInDays
    ) {
      differences.push(
        `Retention mismatch: expected ${expectedConfig.retentionInDays} days, got ${logGroup.retentionInDays} days`
      );
    }

    // Check KMS key
    if (
      expectedConfig.kmsKeyId &&
      logGroup.kmsKeyId !== expectedConfig.kmsKeyId
    ) {
      differences.push(
        `KMS key mismatch: expected ${expectedConfig.kmsKeyId}, got ${logGroup.kmsKeyId}`
      );
    }

    // Check tags
    if (expectedConfig.tags && logGroup.tags) {
      const expectedTags = new Map(
        expectedConfig.tags.map((t) => [t.Key, t.Value])
      );
      const actualTags = new Map(logGroup.tags.map((t) => [t.Key, t.Value]));

      for (const [key, value] of expectedTags) {
        if (actualTags.get(key) !== value) {
          differences.push(
            `Tag mismatch for key ${key}: expected ${value}, got ${actualTags.get(
              key
            )}`
          );
        }
      }
    }

    return {
      matches: differences.length === 0,
      differences,
    };
  }
}
