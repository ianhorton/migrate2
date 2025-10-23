/**
 * CloudFormation Template Type Definitions
 */

export interface CloudFormationTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Metadata?: Record<string, any>;
  Parameters?: Record<string, any>;
  Mappings?: Record<string, any>;
  Conditions?: Record<string, any>;
  Transform?: string | string[];
  Resources: Record<string, CloudFormationResource>;
  Outputs?: Record<string, any>;
}

export interface CloudFormationResource {
  Type: string;
  Properties: Record<string, any>;
  DependsOn?: string | string[];
  DeletionPolicy?: 'Delete' | 'Retain' | 'Snapshot';
  UpdateReplacePolicy?: 'Delete' | 'Retain' | 'Snapshot';
  Metadata?: Record<string, any>;
  Condition?: string;
}

export interface ResourceMatch {
  slsLogicalId: string;
  cdkLogicalId: string;
  physicalId: string;
  resourceType: string;
  slsResource: CloudFormationResource;
  cdkResource: CloudFormationResource;
}

export interface PropertyDifference {
  property: string;
  slsValue: any;
  cdkValue: any;
  severity: 'CRITICAL' | 'WARNING' | 'ACCEPTABLE' | 'INFO';
  explanation: string;
  autoFixable: boolean;
}

export interface ComparisonResult {
  resourceType: string;
  physicalId: string;
  slsLogicalId: string;
  cdkLogicalId: string;
  status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL';
  differences: PropertyDifference[];
  recommendation: string;
}

export interface ComparisonReport {
  comparison_id: string;
  timestamp: string;
  summary: {
    total_resources: number;
    matched: number;
    unmatched_sls: number;
    unmatched_cdk: number;
    status: {
      MATCH: number;
      ACCEPTABLE: number;
      WARNING: number;
      CRITICAL: number;
    };
  };
  resources: ComparisonResult[];
  overall_status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL';
  ready_for_import: boolean;
  blocking_issues: string[];
  // Sprint 2 additions
  classifications?: any[]; // DifferenceClassification[]
  confidence_scores?: Map<string, any>; // Map<string, ConfidenceScore>
  overall_confidence?: any; // ConfidenceScore
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
