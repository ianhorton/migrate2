/**
 * Base AWS Client Implementation
 *
 * Provides common functionality for all AWS service clients:
 * - Credential management (profile, environment, instance role)
 * - Exponential backoff retry logic
 * - Rate limiting and throttling handling
 * - Error handling and logging
 */

import { fromIni } from '@aws-sdk/credential-providers';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Logger } from '../utils/logger';

export interface AwsConfig {
  region?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
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

/**
 * Base AWS Client with common functionality
 */
export class BaseAwsClient {
  protected config: AwsConfig;
  protected logger: Logger;

  constructor(config: AwsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Get AWS credentials using credential provider chain
   */
  async getCredentials(): Promise<AwsCredentials> {
    // 1. Try explicit credentials from config first
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      this.logger.debug('Using explicit credentials from config');
      return {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
        region: this.config.region || 'us-east-1',
      };
    }

    // 2. Try AWS profile
    if (this.config.profile) {
      this.logger.debug(`Using AWS profile: ${this.config.profile}`);
      return await this.getCredentialsFromProfile(this.config.profile);
    }

    // 3. Try default credentials (environment variables, instance profile, etc.)
    this.logger.debug('Using default credential provider chain');
    return await this.getDefaultCredentials();
  }

  /**
   * Execute AWS operation with exponential backoff retry logic
   */
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
        'InternalError',
        'InternalServerError',
        'RequestTimeout',
        'SlowDown',
        'PriorRequestNotComplete',
      ],
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
          this.logger.error(
            `Operation failed after ${attempt + 1} attempts: ${
              (error as Error).message
            }`
          );
          throw error;
        }

        // Calculate backoff delay (exponential with jitter)
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(exponentialDelay + jitter, maxDelay);

        this.logger.warn(
          `Retryable error: ${(error as Error).message}. ` +
            `Retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${
              maxRetries + 1
            })`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable based on error name or message
   */
  private isRetryableError(error: Error, retryableErrors: string[]): boolean {
    const errorName = error.name || '';
    const errorMessage = error.message || '';

    // Check error name and message for retryable patterns
    return retryableErrors.some(
      (retryable) =>
        errorName.includes(retryable) || errorMessage.includes(retryable)
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get credentials from AWS profile
   */
  private async getCredentialsFromProfile(
    profile: string
  ): Promise<AwsCredentials> {
    try {
      const credentialProvider = fromIni({ profile });
      const credentials = await credentialProvider();

      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        region: this.config.region || 'us-east-1',
      };
    } catch (error) {
      this.logger.error(
        `Failed to load credentials from profile ${profile}: ${
          (error as Error).message
        }`
      );
      throw new Error(
        `Failed to load AWS profile ${profile}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get credentials using default provider chain
   * (environment variables, instance metadata, ECS task role, etc.)
   */
  private async getDefaultCredentials(): Promise<AwsCredentials> {
    try {
      const credentialProvider = defaultProvider();
      const credentials = await credentialProvider();

      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        region: this.config.region || process.env.AWS_REGION || 'us-east-1',
      };
    } catch (error) {
      this.logger.error(
        `Failed to load default credentials: ${(error as Error).message}`
      );
      throw new Error(
        `Failed to load AWS credentials: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get AWS region from config or environment
   */
  protected getRegion(): string {
    return (
      this.config.region || process.env.AWS_REGION || 'us-east-1'
    );
  }
}

/**
 * Custom AWS Error for better error handling
 */
export class AwsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'AwsError';
    Object.setPrototypeOf(this, AwsError.prototype);
  }

  /**
   * Create AwsError from AWS SDK error
   */
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
