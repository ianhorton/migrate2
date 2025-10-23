/**
 * Type definitions for Human Intervention system
 * Supports interactive CLI prompts for messy environment migrations
 */

/**
 * Physical resource candidate discovered in AWS account
 */
export interface PhysicalResourceCandidate {
  physicalId: string;
  confidence: number; // 0.0 to 1.0
  source: 'discovered' | 'template' | 'manual';
  metadata?: Record<string, any>;
  matchReasons?: string[];
}

/**
 * Intervention prompt shown to user
 */
export interface InterventionPrompt {
  id: string;
  type: 'choice' | 'confirm' | 'input' | 'select';
  severity: 'info' | 'warning' | 'critical';
  question: string;
  context?: string;
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
  defaultValue?: string;
  allowSkip?: boolean;
}

/**
 * User's response to an intervention prompt
 */
export interface InterventionResponse {
  promptId: string;
  action: 'proceed' | 'skip' | 'abort' | 'manual' | string;
  value?: string;
  timestamp: Date;
}

/**
 * Drift information for a CloudFormation resource
 */
export interface DriftInfo {
  resourceId: string;
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

/**
 * Critical difference requiring user review
 */
export interface Difference {
  path: string;
  serverlessValue: any;
  cdkValue: any;
  severity: 'critical' | 'warning' | 'info';
  description?: string;
}

/**
 * Audit log entry for intervention
 */
export interface InterventionAuditEntry {
  migrationId: string;
  response: InterventionResponse;
  context: {
    step: string;
    resourceId?: string;
    resourceType?: string;
  };
}
