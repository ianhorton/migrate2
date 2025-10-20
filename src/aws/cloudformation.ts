/**
 * CloudFormation Client Implementation
 *
 * Provides operations for:
 * - Stack management (describe, update, delete)
 * - Stack drift detection
 * - Change set operations
 * - Resource import operations
 * - Stack event tracking
 */

import {
  CloudFormationClient as CFNClient,
  DescribeStacksCommand,
  ListStackResourcesCommand,
  DetectStackDriftCommand,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  ValidateTemplateCommand,
  DescribeStackEventsCommand,
  UpdateStackCommand,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
  DeleteStackCommand,
  GetTemplateCommand,
  Stack,
  StackResource,
  StackResourceDrift,
  StackEvent as CFNStackEvent,
  Parameter,
  Output,
  Tag,
} from '@aws-sdk/client-cloudformation';

import { BaseAwsClient, AwsConfig, AwsError } from './base-client';
import { Logger } from '../utils/logger';

export interface CloudFormationTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, any>;
  Resources: Record<string, any>;
  Outputs?: Record<string, any>;
  Mappings?: Record<string, any>;
  Conditions?: Record<string, any>;
}

export interface StackDescription extends Stack {}

export interface StackResourceDescription {
  LogicalResourceId?: string;
  PhysicalResourceId?: string;
  ResourceType?: string;
  ResourceStatus?: string;
  Timestamp?: Date;
  ResourceStatusReason?: string;
  DriftInformation?: any;
}

export interface DriftDetectionResult {
  StackDriftStatus: 'DRIFTED' | 'IN_SYNC' | 'UNKNOWN' | 'NOT_CHECKED';
  DriftedResources: ResourceDrift[];
  Timestamp?: Date;
}

export interface ResourceDrift extends StackResourceDrift {}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parameters?: Parameter[];
  capabilities?: string[];
}

export interface StackUpdateResult {
  StackId: string;
  ChangeSetId?: string;
  Status: string;
}

export interface StackEvent extends CFNStackEvent {}

export interface ChangeSetResult {
  ChangeSetId: string;
  ChangeSetName: string;
  Status: string;
  ExecutionStatus?: string;
  Changes?: any[];
}

/**
 * CloudFormation Client for stack operations
 */
export class CloudFormationClient extends BaseAwsClient {
  private client: CFNClient;

  constructor(config: AwsConfig, logger: Logger) {
    super(config, logger);
    this.client = new CFNClient({
      region: this.getRegion(),
      endpoint: config.endpoint,
    });
  }

  /**
   * Get stack details by name
   */
  async getStack(stackName: string): Promise<StackDescription> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Getting stack: ${stackName}`);

      const response = await this.client.send(
        new DescribeStacksCommand({
          StackName: stackName,
        })
      );

      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(`Stack not found: ${stackName}`);
      }

      return response.Stacks[0] as StackDescription;
    });
  }

  /**
   * Check if stack exists
   */
  async stackExists(stackName: string): Promise<boolean> {
    try {
      await this.getStack(stackName);
      return true;
    } catch (error) {
      const err = error as Error;
      if (
        err.message.includes('does not exist') ||
        err.message.includes('Stack not found')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Update stack with new template
   */
  async updateStack(
    stackName: string,
    template: CloudFormationTemplate,
    parameters?: Parameter[]
  ): Promise<StackUpdateResult> {
    return this.executeWithRetry(async () => {
      this.logger.info(`Updating stack: ${stackName}`);

      const response = await this.client.send(
        new UpdateStackCommand({
          StackName: stackName,
          TemplateBody: JSON.stringify(template, null, 2),
          Parameters: parameters,
          Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        })
      );

      return {
        StackId: response.StackId || '',
        Status: 'UPDATE_IN_PROGRESS',
      };
    });
  }

  /**
   * Delete stack
   */
  async deleteStack(stackName: string): Promise<void> {
    return this.executeWithRetry(async () => {
      this.logger.info(`Deleting stack: ${stackName}`);

      await this.client.send(
        new DeleteStackCommand({
          StackName: stackName,
        })
      );
    });
  }

  /**
   * Get all resources in a stack
   */
  async getStackResources(
    stackName: string
  ): Promise<StackResourceDescription[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Getting resources for stack: ${stackName}`);

      const resources: StackResourceDescription[] = [];
      let nextToken: string | undefined;

      do {
        const response = await this.client.send(
          new ListStackResourcesCommand({
            StackName: stackName,
            NextToken: nextToken,
          })
        );

        if (response.StackResourceSummaries) {
          resources.push(
            ...response.StackResourceSummaries.map((summary) => ({
              LogicalResourceId: summary.LogicalResourceId,
              PhysicalResourceId: summary.PhysicalResourceId,
              ResourceType: summary.ResourceType,
              ResourceStatus: summary.ResourceStatus,
              Timestamp: summary.LastUpdatedTimestamp,
              ResourceStatusReason: summary.ResourceStatusReason,
              DriftInformation: summary.DriftInformation,
            }))
          );
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return resources;
    });
  }

  /**
   * Detect drift for stack and return results
   */
  async detectStackDrift(stackName: string): Promise<DriftDetectionResult> {
    return this.executeWithRetry(async () => {
      this.logger.info(`Detecting drift for stack: ${stackName}`);

      // Initiate drift detection
      const detectResponse = await this.client.send(
        new DetectStackDriftCommand({
          StackName: stackName,
        })
      );

      const driftDetectionId = detectResponse.StackDriftDetectionId;
      if (!driftDetectionId) {
        throw new Error('Failed to initiate drift detection');
      }

      // Poll for completion
      let status = 'DETECTION_IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes with 2 second intervals

      while (
        (status === 'DETECTION_IN_PROGRESS' || status === 'DETECTION_PENDING') &&
        attempts < maxAttempts
      ) {
        await this.sleep(2000);
        attempts++;

        const statusResponse = await this.client.send(
          new DescribeStackDriftDetectionStatusCommand({
            StackDriftDetectionId: driftDetectionId,
          })
        );

        status = statusResponse.DetectionStatus || '';

        if (status === 'DETECTION_FAILED') {
          throw new Error(
            `Drift detection failed: ${statusResponse.DetectionStatusReason}`
          );
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error('Drift detection timed out');
      }

      // Get drift results
      const driftResponse = await this.client.send(
        new DescribeStackResourceDriftsCommand({
          StackName: stackName,
          StackResourceDriftStatusFilters: ['MODIFIED', 'DELETED', 'NOT_CHECKED'],
        })
      );

      // Get final stack drift status
      const finalStatusResponse = await this.client.send(
        new DescribeStackDriftDetectionStatusCommand({
          StackDriftDetectionId: driftDetectionId,
        })
      );

      return {
        StackDriftStatus:
          (finalStatusResponse.StackDriftStatus as DriftDetectionResult['StackDriftStatus']) ||
          'UNKNOWN',
        DriftedResources:
          (driftResponse.StackResourceDrifts as ResourceDrift[]) || [],
        Timestamp: new Date(),
      };
    });
  }

  /**
   * Get drift details for specific resource
   */
  async getResourceDrift(
    stackName: string,
    logicalResourceId: string
  ): Promise<ResourceDrift> {
    return this.executeWithRetry(async () => {
      this.logger.debug(
        `Getting drift for resource: ${logicalResourceId} in stack: ${stackName}`
      );

      const response = await this.client.send(
        new DescribeStackResourceDriftsCommand({
          StackName: stackName,
        })
      );

      const drift = response.StackResourceDrifts?.find(
        (d) => d.LogicalResourceId === logicalResourceId
      );

      if (!drift) {
        throw new Error(
          `Resource drift not found for: ${logicalResourceId}`
        );
      }

      return drift as ResourceDrift;
    });
  }

  /**
   * Validate CloudFormation template
   */
  async validateTemplate(
    template: CloudFormationTemplate
  ): Promise<ValidationResult> {
    return this.executeWithRetry(async () => {
      this.logger.debug('Validating template');

      try {
        const response = await this.client.send(
          new ValidateTemplateCommand({
            TemplateBody: JSON.stringify(template, null, 2),
          })
        );

        return {
          valid: true,
          errors: [],
          warnings: [],
          parameters: response.Parameters,
          capabilities: response.Capabilities,
        };
      } catch (error) {
        const err = error as Error;
        return {
          valid: false,
          errors: [err.message],
          warnings: [],
        };
      }
    });
  }

  /**
   * Get stack events (for monitoring deployment progress)
   */
  async getStackEvents(
    stackName: string,
    limit: number = 100
  ): Promise<StackEvent[]> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Getting events for stack: ${stackName}`);

      const events: StackEvent[] = [];
      let nextToken: string | undefined;
      let count = 0;

      do {
        const response = await this.client.send(
          new DescribeStackEventsCommand({
            StackName: stackName,
            NextToken: nextToken,
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

  /**
   * Create change set for reviewing changes before deployment
   */
  async createChangeSet(
    stackName: string,
    changeSetName: string,
    template: CloudFormationTemplate,
    parameters?: Parameter[]
  ): Promise<ChangeSetResult> {
    return this.executeWithRetry(async () => {
      this.logger.info(
        `Creating change set: ${changeSetName} for stack: ${stackName}`
      );

      const response = await this.client.send(
        new CreateChangeSetCommand({
          StackName: stackName,
          ChangeSetName: changeSetName,
          TemplateBody: JSON.stringify(template, null, 2),
          Parameters: parameters,
          Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        })
      );

      return {
        ChangeSetId: response.Id || '',
        ChangeSetName: changeSetName,
        Status: 'CREATE_IN_PROGRESS',
      };
    });
  }

  /**
   * Describe change set to review changes
   */
  async describeChangeSet(
    stackName: string,
    changeSetName: string
  ): Promise<ChangeSetResult> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Describing change set: ${changeSetName}`);

      const response = await this.client.send(
        new DescribeChangeSetCommand({
          StackName: stackName,
          ChangeSetName: changeSetName,
        })
      );

      return {
        ChangeSetId: response.ChangeSetId || '',
        ChangeSetName: response.ChangeSetName || '',
        Status: response.Status || '',
        ExecutionStatus: response.ExecutionStatus,
        Changes: response.Changes,
      };
    });
  }

  /**
   * Execute change set to apply changes
   */
  async executeChangeSet(
    stackName: string,
    changeSetName: string
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      this.logger.info(`Executing change set: ${changeSetName}`);

      await this.client.send(
        new ExecuteChangeSetCommand({
          StackName: stackName,
          ChangeSetName: changeSetName,
        })
      );
    });
  }

  /**
   * Get current template for a stack
   */
  async getTemplate(stackName: string): Promise<CloudFormationTemplate> {
    return this.executeWithRetry(async () => {
      this.logger.debug(`Getting template for stack: ${stackName}`);

      const response = await this.client.send(
        new GetTemplateCommand({
          StackName: stackName,
        })
      );

      if (!response.TemplateBody) {
        throw new Error(`Template not found for stack: ${stackName}`);
      }

      return JSON.parse(response.TemplateBody);
    });
  }
}
