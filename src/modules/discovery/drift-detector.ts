/**
 * DriftDetector
 * Sprint 2: Template Analysis
 *
 * Detects CloudFormation drift using AWS CloudFormation API
 */

import {
  CloudFormationClient,
  DetectStackDriftCommand,
  DescribeStackDriftDetectionStatusCommand,
  DescribeStackResourceDriftsCommand,
  type StackResourceDrift,
  type StackResourceDriftStatus,
} from '@aws-sdk/client-cloudformation';
import type { PropertyDifference } from '../../types/cloudformation';

export interface DriftInfo {
  resourceId: string;
  logicalResourceId: string;
  resourceType: string;
  drifted: boolean;
  driftStatus: 'IN_SYNC' | 'MODIFIED' | 'DELETED' | 'NOT_CHECKED';
  propertyDifferences?: Array<{
    propertyPath: string;
    expectedValue: any;
    actualValue: any;
    differenceType: 'ADD' | 'REMOVE' | 'MODIFY';
  }>;
  timestamp?: Date;
}

export interface DriftCorrelation {
  driftCausedByManualChange: boolean;
  affectedDifferences: PropertyDifference[];
  explanation: string;
}

/**
 * DriftDetector class
 */
export class DriftDetector {
  private client: CloudFormationClient;

  constructor(region: string = 'us-east-1') {
    this.client = new CloudFormationClient({ region });
  }

  /**
   * Detect drift for CloudFormation stack
   * @param stackName - CloudFormation stack name
   * @returns Map of resource ID to drift information
   */
  async detectDrift(stackName: string): Promise<Map<string, DriftInfo>> {
    // Initiate drift detection
    const detectCommand = new DetectStackDriftCommand({
      StackName: stackName,
    });

    const detectResponse = await this.client.send(detectCommand);
    const driftDetectionId = detectResponse.StackDriftDetectionId;

    if (!driftDetectionId) {
      throw new Error('Failed to initiate drift detection');
    }

    // Poll for drift detection completion
    await this.waitForDriftDetection(driftDetectionId);

    // Get drift results
    const driftsCommand = new DescribeStackResourceDriftsCommand({
      StackName: stackName,
      StackResourceDriftStatusFilters: [
        'IN_SYNC',
        'MODIFIED',
        'DELETED',
        'NOT_CHECKED',
      ],
    });

    const driftsResponse = await this.client.send(driftsCommand);
    const drifts = driftsResponse.StackResourceDrifts || [];

    // Convert to DriftInfo map
    const driftMap = new Map<string, DriftInfo>();

    for (const drift of drifts) {
      const driftInfo = this.convertToDriftInfo(drift);
      driftMap.set(drift.LogicalResourceId!, driftInfo);
    }

    return driftMap;
  }

  /**
   * Detect drift for specific resource
   * @param stackName - CloudFormation stack name
   * @param logicalResourceId - Logical resource ID
   * @returns Drift information for resource
   */
  async detectResourceDrift(
    stackName: string,
    logicalResourceId: string
  ): Promise<DriftInfo> {
    const allDrift = await this.detectDrift(stackName);
    const resourceDrift = allDrift.get(logicalResourceId);

    if (!resourceDrift) {
      // Resource not found in drift results - assume IN_SYNC
      return {
        resourceId: logicalResourceId,
        logicalResourceId,
        resourceType: 'Unknown',
        drifted: false,
        driftStatus: 'NOT_CHECKED',
      };
    }

    return resourceDrift;
  }

  /**
   * Compare drift with template differences
   * @param drift - Drift information
   * @param differences - Template differences
   * @returns Correlation analysis
   */
  correlateDriftWithDifferences(
    drift: DriftInfo,
    differences: PropertyDifference[]
  ): DriftCorrelation {
    if (!drift.drifted || drift.driftStatus === 'IN_SYNC') {
      return {
        driftCausedByManualChange: false,
        affectedDifferences: [],
        explanation: 'No drift detected for this resource.',
      };
    }

    if (drift.driftStatus === 'DELETED') {
      return {
        driftCausedByManualChange: true,
        affectedDifferences: differences,
        explanation:
          'Resource has been deleted outside CloudFormation. All template differences are affected.',
      };
    }

    if (!drift.propertyDifferences || drift.propertyDifferences.length === 0) {
      return {
        driftCausedByManualChange: true,
        affectedDifferences: [],
        explanation:
          'Resource has been modified but specific property changes are unknown.',
      };
    }

    // Find template differences that match drift properties
    const affectedDifferences: PropertyDifference[] = [];

    for (const diff of differences) {
      const isDriftRelated = drift.propertyDifferences.some((driftDiff) =>
        this.propertyPathMatches(diff.property, driftDiff.propertyPath)
      );

      if (isDriftRelated) {
        affectedDifferences.push(diff);
      }
    }

    const explanation = this.generateCorrelationExplanation(
      drift,
      affectedDifferences
    );

    return {
      driftCausedByManualChange: true,
      affectedDifferences,
      explanation,
    };
  }

  /**
   * Wait for drift detection to complete
   */
  private async waitForDriftDetection(
    driftDetectionId: string,
    maxAttempts: number = 60,
    delayMs: number = 2000
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusCommand = new DescribeStackDriftDetectionStatusCommand({
        StackDriftDetectionId: driftDetectionId,
      });

      const statusResponse = await this.client.send(statusCommand);
      const status = statusResponse.DetectionStatus;

      if (status === 'DETECTION_COMPLETE') {
        return;
      }

      if (status === 'DETECTION_FAILED') {
        throw new Error(
          `Drift detection failed: ${statusResponse.DetectionStatusReason}`
        );
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Drift detection timed out');
  }

  /**
   * Convert AWS StackResourceDrift to DriftInfo
   */
  private convertToDriftInfo(drift: StackResourceDrift): DriftInfo {
    const driftStatus = this.mapDriftStatus(
      drift.StackResourceDriftStatus!
    );
    const drifted = driftStatus !== 'IN_SYNC' && driftStatus !== 'NOT_CHECKED';

    const propertyDifferences = this.parsePropertyDifferences(
      drift.PropertyDifferences || []
    );

    return {
      resourceId: drift.PhysicalResourceId || drift.LogicalResourceId!,
      logicalResourceId: drift.LogicalResourceId!,
      resourceType: drift.ResourceType!,
      drifted,
      driftStatus,
      propertyDifferences,
      timestamp: drift.Timestamp,
    };
  }

  /**
   * Map AWS drift status to our DriftInfo status
   */
  private mapDriftStatus(
    status: StackResourceDriftStatus
  ): DriftInfo['driftStatus'] {
    switch (status) {
      case 'IN_SYNC':
        return 'IN_SYNC';
      case 'MODIFIED':
        return 'MODIFIED';
      case 'DELETED':
        return 'DELETED';
      case 'NOT_CHECKED':
        return 'NOT_CHECKED';
      default:
        return 'NOT_CHECKED';
    }
  }

  /**
   * Parse property differences from AWS response
   */
  private parsePropertyDifferences(
    awsPropertyDiffs: any[]
  ): DriftInfo['propertyDifferences'] {
    return awsPropertyDiffs.map((diff) => ({
      propertyPath: diff.PropertyPath || '',
      expectedValue: this.parseJsonValue(diff.ExpectedValue),
      actualValue: this.parseJsonValue(diff.ActualValue),
      differenceType: diff.DifferenceType || 'MODIFY',
    }));
  }

  /**
   * Parse JSON value safely
   */
  private parseJsonValue(value: string | undefined): any {
    if (!value) return undefined;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Check if property path matches
   */
  private propertyPathMatches(
    templateProperty: string,
    driftPropertyPath: string
  ): boolean {
    // Simple match: exact match or drift path starts with template property
    return (
      templateProperty === driftPropertyPath ||
      driftPropertyPath.startsWith(templateProperty + '.') ||
      driftPropertyPath.startsWith(templateProperty + '[')
    );
  }

  /**
   * Generate human-readable correlation explanation
   */
  private generateCorrelationExplanation(
    drift: DriftInfo,
    affectedDifferences: PropertyDifference[]
  ): string {
    const propertyCount = drift.propertyDifferences?.length || 0;
    const affectedCount = affectedDifferences.length;

    let explanation = `Resource has been manually modified outside CloudFormation. `;
    explanation += `${propertyCount} ${propertyCount === 1 ? 'property has' : 'properties have'} drifted. `;

    if (affectedCount === 0) {
      explanation += `The drifted properties do not directly correspond to template differences, but drift may still affect migration.`;
    } else if (affectedCount === propertyCount) {
      explanation += `All ${affectedCount} drifted ${affectedCount === 1 ? 'property matches a' : 'properties match'} template difference.`;
    } else {
      explanation += `${affectedCount} of the template differences are related to the detected drift.`;
    }

    return explanation;
  }

  /**
   * Determine drift severity based on drift info
   */
  getDriftSeverity(drift: DriftInfo): 'none' | 'minor' | 'major' {
    if (!drift.drifted || drift.driftStatus === 'IN_SYNC') {
      return 'none';
    }

    if (drift.driftStatus === 'DELETED') {
      return 'major';
    }

    const propertyCount = drift.propertyDifferences?.length || 0;

    if (propertyCount >= 5) {
      return 'major';
    }

    if (propertyCount >= 2) {
      return 'minor';
    }

    return 'minor';
  }

  /**
   * Get resolution strategies for drift
   */
  getResolutionStrategies(drift: DriftInfo): Array<{
    strategy: string;
    description: string;
    recommended: boolean;
  }> {
    if (drift.driftStatus === 'DELETED') {
      return [
        {
          strategy: 'skip-resource',
          description: 'Skip this resource in migration',
          recommended: true,
        },
        {
          strategy: 'recreate',
          description: 'Recreate resource with CDK',
          recommended: false,
        },
      ];
    }

    if (drift.driftStatus === 'MODIFIED') {
      return [
        {
          strategy: 'use-aws',
          description: 'Update CDK code to match current AWS state',
          recommended: true,
        },
        {
          strategy: 'use-template',
          description: 'Revert AWS resource to match template',
          recommended: false,
        },
        {
          strategy: 'manual-review',
          description: 'Manually review and merge changes',
          recommended: false,
        },
      ];
    }

    return [];
  }
}
