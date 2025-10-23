/**
 * DifferenceAnalyzer
 * Sprint 2: Template Analysis
 *
 * Classifies template differences as auto-resolvable vs requiring review
 */

import type { PropertyDifference } from '../../types/cloudformation';

export interface DifferenceClassification {
  difference: PropertyDifference;
  category: 'acceptable' | 'warning' | 'critical';
  autoResolvable: boolean;
  resolutionStrategy?: string;
  requiresHumanReview: boolean;
  explanation: string;
}

export interface ClassificationSummary {
  total: number;
  acceptable: number;
  warning: number;
  critical: number;
  autoResolvable: number;
  requiresReview: number;
}

/**
 * Main DifferenceAnalyzer class
 */
export class DifferenceAnalyzer {
  /**
   * Type guard for property difference value validation
   */
  private isValidPropertyValue(value: unknown): value is string | number | boolean | null {
    return (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    );
  }

  /**
   * Type guard for checking if value is an object with properties
   */
  private isPropertyObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Validate property difference structure
   */
  private validatePropertyDifference(diff: PropertyDifference): void {
    if (!diff.property || typeof diff.property !== 'string') {
      throw new TypeError(`Invalid property difference: property must be a non-empty string`);
    }

    if (!diff.severity || typeof diff.severity !== 'string') {
      throw new TypeError(
        `Invalid property difference for ${diff.property}: severity must be a string`
      );
    }

    const validSeverities = ['CRITICAL', 'WARNING', 'ACCEPTABLE', 'INFO'];
    if (!validSeverities.includes(diff.severity)) {
      throw new TypeError(
        `Invalid property difference for ${diff.property}: severity must be one of ${validSeverities.join(', ')}`
      );
    }

    if (typeof diff.autoFixable !== 'boolean') {
      throw new TypeError(
        `Invalid property difference for ${diff.property}: autoFixable must be a boolean`
      );
    }

    if (!diff.explanation || typeof diff.explanation !== 'string') {
      throw new TypeError(
        `Invalid property difference for ${diff.property}: explanation must be a string`
      );
    }
  }

  /**
   * Analyze all differences and classify them
   */
  analyzeDifferences(
    differences: PropertyDifference[]
  ): DifferenceClassification[] {
    return differences.map((diff) => this.classifyDifference(diff));
  }

  /**
   * Classify a single difference
   */
  private classifyDifference(
    difference: PropertyDifference
  ): DifferenceClassification {
    // Validate input structure
    this.validatePropertyDifference(difference);

    // CDK adds metadata - always acceptable
    if (this.isCDKMetadataAddition(difference)) {
      return {
        difference,
        category: 'acceptable',
        autoResolvable: true,
        resolutionStrategy: 'ignore',
        requiresHumanReview: false,
        explanation:
          'CDK automatically adds metadata for stack tracking. This is safe and expected.',
      };
    }

    // CDK adds UpdateReplacePolicy - acceptable
    if (this.isUpdateReplacePolicyAddition(difference)) {
      return {
        difference,
        category: 'acceptable',
        autoResolvable: true,
        resolutionStrategy: 'ignore',
        requiresHumanReview: false,
        explanation:
          'CDK adds UpdateReplacePolicy for resource protection. This is a safe addition.',
      };
    }

    // CDK adds DeletionPolicy - acceptable
    if (this.isDeletionPolicyAddition(difference)) {
      return {
        difference,
        category: 'acceptable',
        autoResolvable: true,
        resolutionStrategy: 'ignore',
        requiresHumanReview: false,
        explanation:
          'CDK adds DeletionPolicy for resource protection. This is a safe addition.',
      };
    }

    // CDK adds Tags - acceptable
    if (this.isTagsAddition(difference)) {
      return {
        difference,
        category: 'acceptable',
        autoResolvable: true,
        resolutionStrategy: 'merge',
        requiresHumanReview: false,
        explanation:
          'CDK adds tags for resource tracking. Tags will be merged during import.',
      };
    }

    // Physical resource name mismatch - critical
    if (this.isPhysicalNameMismatch(difference)) {
      return {
        difference,
        category: 'critical',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'Physical resource name mismatch detected. CDK import will fail unless the physical name in CDK code matches the actual AWS resource name. Update your CDK code to use the correct physical name.',
      };
    }

    // Key schema differences (DynamoDB) - critical
    if (this.isKeySchemaChange(difference)) {
      return {
        difference,
        category: 'critical',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'DynamoDB key schema differs between templates. This is immutable and cannot be changed. Verify that your CDK code defines the same partition and sort keys.',
      };
    }

    // Attribute definitions differ - warning
    if (this.isAttributeDefinitionChange(difference)) {
      return {
        difference,
        category: 'warning',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'DynamoDB attribute definitions differ. This may indicate missing GSI/LSI definitions. Verify all secondary indexes are defined in CDK code.',
      };
    }

    // Billing mode change - warning
    if (this.isBillingModeChange(difference)) {
      return {
        difference,
        category: 'warning',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'DynamoDB billing mode differs. Consider the cost implications of switching between PROVISIONED and PAY_PER_REQUEST modes.',
      };
    }

    // Environment variable changes - warning
    if (this.isEnvironmentChange(difference)) {
      return {
        difference,
        category: 'warning',
        autoResolvable: true,
        resolutionStrategy: 'merge',
        requiresHumanReview: true,
        explanation:
          'Lambda environment variables differ. Review to ensure all necessary environment variables are defined in CDK code.',
      };
    }

    // IAM policy changes - warning
    if (this.isPolicyChange(difference)) {
      return {
        difference,
        category: 'warning',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'IAM policies differ between templates. Review to ensure CDK grants necessary permissions.',
      };
    }

    // VPC configuration changes - warning
    if (this.isVpcConfigChange(difference)) {
      return {
        difference,
        category: 'warning',
        autoResolvable: false,
        requiresHumanReview: true,
        explanation:
          'VPC configuration differs. Changing VPC settings may cause resource replacement. Verify security groups and subnets are correct.',
      };
    }

    // Already classified by property-comparator
    if (difference.severity === 'CRITICAL') {
      return {
        difference,
        category: 'critical',
        autoResolvable: difference.autoFixable,
        requiresHumanReview: true,
        explanation: difference.explanation,
      };
    }

    if (difference.severity === 'WARNING') {
      return {
        difference,
        category: 'warning',
        autoResolvable: difference.autoFixable,
        requiresHumanReview: true,
        explanation: difference.explanation,
      };
    }

    if (difference.severity === 'ACCEPTABLE') {
      return {
        difference,
        category: 'acceptable',
        autoResolvable: true,
        requiresHumanReview: false,
        explanation: difference.explanation,
      };
    }

    // Default: INFO level - acceptable but informational
    return {
      difference,
      category: 'acceptable',
      autoResolvable: true,
      resolutionStrategy: 'ignore',
      requiresHumanReview: false,
      explanation:
        difference.explanation ||
        'Minor difference detected. Should not affect import.',
    };
  }

  /**
   * Group differences by resolution requirement
   */
  groupByResolution(classifications: DifferenceClassification[]): {
    autoResolvable: DifferenceClassification[];
    requiresReview: DifferenceClassification[];
  } {
    return {
      autoResolvable: classifications.filter((c) => c.autoResolvable),
      requiresReview: classifications.filter((c) => c.requiresHumanReview),
    };
  }

  /**
   * Get summary statistics
   */
  getSummary(classifications: DifferenceClassification[]): ClassificationSummary {
    return {
      total: classifications.length,
      acceptable: classifications.filter((c) => c.category === 'acceptable')
        .length,
      warning: classifications.filter((c) => c.category === 'warning').length,
      critical: classifications.filter((c) => c.category === 'critical').length,
      autoResolvable: classifications.filter((c) => c.autoResolvable).length,
      requiresReview: classifications.filter((c) => c.requiresHumanReview).length,
    };
  }

  /**
   * Generate human-readable explanation for difference
   */
  explainDifference(diff: PropertyDifference): string {
    const classification = this.classifyDifference(diff);
    return classification.explanation;
  }

  // Classification helper methods
  private isCDKMetadataAddition(diff: PropertyDifference): boolean {
    return (
      diff.property === 'Metadata' &&
      diff.slsValue === undefined &&
      diff.cdkValue !== undefined
    );
  }

  private isUpdateReplacePolicyAddition(diff: PropertyDifference): boolean {
    return (
      diff.property === 'UpdateReplacePolicy' &&
      diff.slsValue === undefined &&
      diff.cdkValue !== undefined
    );
  }

  private isDeletionPolicyAddition(diff: PropertyDifference): boolean {
    return (
      diff.property === 'DeletionPolicy' &&
      diff.slsValue === undefined &&
      diff.cdkValue !== undefined
    );
  }

  private isTagsAddition(diff: PropertyDifference): boolean {
    return (
      diff.property === 'Tags' &&
      diff.slsValue === undefined &&
      diff.cdkValue !== undefined
    );
  }

  private isPhysicalNameMismatch(diff: PropertyDifference): boolean {
    const physicalNameProps = [
      'TableName',
      'BucketName',
      'FunctionName',
      'RoleName',
      'LogGroupName',
      'DBInstanceIdentifier',
      'DBClusterIdentifier',
      'ClusterName',
    ];
    return (
      physicalNameProps.includes(diff.property) &&
      diff.slsValue !== undefined &&
      diff.cdkValue !== undefined &&
      diff.slsValue !== diff.cdkValue
    );
  }

  private isKeySchemaChange(diff: PropertyDifference): boolean {
    return diff.property === 'KeySchema';
  }

  private isAttributeDefinitionChange(diff: PropertyDifference): boolean {
    return diff.property === 'AttributeDefinitions';
  }

  private isBillingModeChange(diff: PropertyDifference): boolean {
    return diff.property === 'BillingMode';
  }

  private isEnvironmentChange(diff: PropertyDifference): boolean {
    return diff.property === 'Environment';
  }

  private isPolicyChange(diff: PropertyDifference): boolean {
    return (
      diff.property === 'Policies' ||
      diff.property === 'ManagedPolicyArns' ||
      diff.property === 'AssumeRolePolicyDocument'
    );
  }

  private isVpcConfigChange(diff: PropertyDifference): boolean {
    return diff.property === 'VpcConfig';
  }
}
