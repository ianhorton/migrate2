/**
 * S3 Client Implementation
 *
 * Provides operations for:
 * - Bucket existence checks
 * - Bucket configuration retrieval
 * - Versioning configuration
 * - Encryption configuration
 * - CORS configuration
 * - Lifecycle policies
 */

import {
  S3Client as S3SDKClient,
  HeadBucketCommand,
  ListBucketsCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketPolicyCommand,
  GetBucketTaggingCommand,
  GetPublicAccessBlockCommand,
  Bucket,
  ServerSideEncryptionRule,
  CORSRule,
  LifecycleRule,
  Tag,
  PublicAccessBlockConfiguration,
} from '@aws-sdk/client-s3';

import { BaseAwsClient, AwsConfig } from './base-client';
import { Logger } from '../utils/logger';

export interface BucketDescription {
  Name: string;
  CreationDate?: Date;
  Region?: string;
}

export interface BucketVersioningConfiguration {
  Status?: 'Enabled' | 'Suspended';
  MFADelete?: 'Enabled' | 'Disabled';
}

export interface BucketEncryptionConfiguration {
  Rules: ServerSideEncryptionRule[];
}

export interface BucketCorsConfiguration {
  CORSRules: CORSRule[];
}

export interface BucketLifecycleConfiguration {
  Rules: LifecycleRule[];
}

export interface BucketConfiguration {
  name: string;
  region?: string;
  versioning?: BucketVersioningConfiguration;
  encryption?: BucketEncryptionConfiguration;
  cors?: BucketCorsConfiguration;
  lifecycle?: BucketLifecycleConfiguration;
  policy?: string;
  tags?: Tag[];
  publicAccessBlock?: PublicAccessBlockConfiguration;
}

/**
 * S3 Client for bucket operations
 */
export class S3Client extends BaseAwsClient {
  private client: S3SDKClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.client = new S3SDKClient({
      region: this.getRegion(),
      endpoint: config.endpoint,
    });
  }

  /**
   * Check if bucket exists
   */
  async bucketExists(bucketName: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: bucketName,
        })
      );
      return true;
    } catch (error) {
      const err = error as Error;
      if (
        err.name === 'NotFound' ||
        err.name === 'NoSuchBucket' ||
        err.message.includes('Not Found')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get bucket details
   */
  async getBucket(bucketName: string): Promise<BucketDescription> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Getting S3 bucket: ${bucketName}`);

      // S3 doesn't have a direct "describe bucket" API
      // We need to list buckets and find the one we want
      const response = await this.client.send(new ListBucketsCommand({}));

      const bucket = response.Buckets?.find((b) => b.Name === bucketName);

      if (!bucket) {
        throw new Error(`Bucket not found: ${bucketName}`);
      }

      return {
        Name: bucket.Name || '',
        CreationDate: bucket.CreationDate,
      };
    });
  }

  /**
   * Get complete bucket configuration
   */
  async getBucketConfiguration(
    bucketName: string
  ): Promise<BucketConfiguration> {
    const config: BucketConfiguration = {
      name: bucketName,
    };

    // Get versioning
    try {
      config.versioning = await this.getBucketVersioning(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get versioning for bucket ${bucketName}: ${
          (error as Error).message
        }`
      );
    }

    // Get encryption
    try {
      config.encryption = await this.getBucketEncryption(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get encryption for bucket ${bucketName}: ${
          (error as Error).message
        }`
      );
    }

    // Get CORS
    try {
      config.cors = await this.getBucketCors(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get CORS for bucket ${bucketName}: ${(error as Error).message}`
      );
    }

    // Get lifecycle
    try {
      config.lifecycle = await this.getBucketLifecycle(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get lifecycle for bucket ${bucketName}: ${
          (error as Error).message
        }`
      );
    }

    // Get policy
    try {
      config.policy = await this.getBucketPolicy(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get policy for bucket ${bucketName}: ${
          (error as Error).message
        }`
      );
    }

    // Get tags
    try {
      config.tags = await this.getBucketTags(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get tags for bucket ${bucketName}: ${(error as Error).message}`
      );
    }

    // Get public access block
    try {
      config.publicAccessBlock = await this.getPublicAccessBlock(bucketName);
    } catch (error) {
      this.logger.debug(
        `Could not get public access block for bucket ${bucketName}: ${
          (error as Error).message
        }`
      );
    }

    return config;
  }

  /**
   * Get bucket versioning configuration
   */
  async getBucketVersioning(
    bucketName: string
  ): Promise<BucketVersioningConfiguration> {
    return this.executeWithRetry(async () => {
      const response = await this.client.send(
        new GetBucketVersioningCommand({
          Bucket: bucketName,
        })
      );

      return {
        Status: response.Status as BucketVersioningConfiguration['Status'],
        MFADelete: response.MFADelete as BucketVersioningConfiguration['MFADelete'],
      };
    });
  }

  /**
   * Get bucket encryption configuration
   */
  async getBucketEncryption(
    bucketName: string
  ): Promise<BucketEncryptionConfiguration> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetBucketEncryptionCommand({
            Bucket: bucketName,
          })
        );

        return {
          Rules:
            (response.ServerSideEncryptionConfiguration
              ?.Rules as ServerSideEncryptionRule[]) || [],
        };
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'ServerSideEncryptionConfigurationNotFoundError' ||
          err.message.includes('does not exist')
        ) {
          return { Rules: [] };
        }
        throw error;
      }
    });
  }

  /**
   * Get bucket CORS configuration
   */
  async getBucketCors(bucketName: string): Promise<BucketCorsConfiguration> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetBucketCorsCommand({
            Bucket: bucketName,
          })
        );

        return {
          CORSRules: (response.CORSRules as CORSRule[]) || [],
        };
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'NoSuchCORSConfiguration' ||
          err.message.includes('does not exist')
        ) {
          return { CORSRules: [] };
        }
        throw error;
      }
    });
  }

  /**
   * Get bucket lifecycle configuration
   */
  async getBucketLifecycle(
    bucketName: string
  ): Promise<BucketLifecycleConfiguration> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetBucketLifecycleConfigurationCommand({
            Bucket: bucketName,
          })
        );

        return {
          Rules: (response.Rules as LifecycleRule[]) || [],
        };
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'NoSuchLifecycleConfiguration' ||
          err.message.includes('does not exist')
        ) {
          return { Rules: [] };
        }
        throw error;
      }
    });
  }

  /**
   * Get bucket policy
   */
  async getBucketPolicy(bucketName: string): Promise<string> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetBucketPolicyCommand({
            Bucket: bucketName,
          })
        );

        return response.Policy || '';
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'NoSuchBucketPolicy' ||
          err.message.includes('does not exist')
        ) {
          return '';
        }
        throw error;
      }
    });
  }

  /**
   * Get bucket tags
   */
  async getBucketTags(bucketName: string): Promise<Tag[]> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetBucketTaggingCommand({
            Bucket: bucketName,
          })
        );

        return (response.TagSet as Tag[]) || [];
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'NoSuchTagSet' ||
          err.message.includes('does not exist')
        ) {
          return [];
        }
        throw error;
      }
    });
  }

  /**
   * Get public access block configuration
   */
  async getPublicAccessBlock(
    bucketName: string
  ): Promise<PublicAccessBlockConfiguration> {
    return this.executeWithRetry(async () => {
      try {
        const response = await this.client.send(
          new GetPublicAccessBlockCommand({
            Bucket: bucketName,
          })
        );

        return (
          response.PublicAccessBlockConfiguration || {
            BlockPublicAcls: false,
            IgnorePublicAcls: false,
            BlockPublicPolicy: false,
            RestrictPublicBuckets: false,
          }
        );
      } catch (error) {
        const err = error as Error;
        if (
          err.name === 'NoSuchPublicAccessBlockConfiguration' ||
          err.message.includes('does not exist')
        ) {
          return {
            BlockPublicAcls: false,
            IgnorePublicAcls: false,
            BlockPublicPolicy: false,
            RestrictPublicBuckets: false,
          };
        }
        throw error;
      }
    });
  }

  /**
   * List all buckets
   */
  async listBuckets(): Promise<BucketDescription[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug('Listing S3 buckets');

      const response = await this.client.send(new ListBucketsCommand({}));

      return (
        response.Buckets?.map((bucket) => ({
          Name: bucket.Name || '',
          CreationDate: bucket.CreationDate,
        })) || []
      );
    });
  }
}
