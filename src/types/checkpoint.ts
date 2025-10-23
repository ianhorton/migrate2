/**
 * Checkpoint system type definitions
 * Sprint 3: Interactive Import & Checkpoints
 */

import { MigrationState, MigrationStep } from './index';

/**
 * Checkpoint definition for pausing migration at critical decision points
 */
export interface Checkpoint {
  id: string;
  step: MigrationStep;
  name: string;
  description: string;
  condition: (state: MigrationState) => boolean | Promise<boolean>;
  handler: (state: MigrationState) => Promise<CheckpointResult>;
}

/**
 * Result of checkpoint execution
 */
export interface CheckpointResult {
  action: 'continue' | 'pause' | 'abort';
  modifications?: Partial<MigrationState>;
  message?: string;
}

/**
 * Checkpoint execution record for audit trail
 */
export interface CheckpointExecution {
  checkpointId: string;
  executedAt: Date;
  result: CheckpointResult;
  stateSnapshot?: string; // JSON snapshot of state at checkpoint
}

/**
 * Import definition for CDK import process
 */
export interface ImportDefinition {
  logicalId: string;
  resourceType: string;
  physicalId: string;
  resourceIdentifier: Record<string, string>;
}

/**
 * Result of CDK import process
 */
export interface ImportResult {
  status: 'success' | 'failed' | 'aborted';
  resourcesImported?: number;
  errorCode?: number;
  errorMessage?: string;
  output?: string[];
}

/**
 * Discovered resource from AWS account
 */
export interface DiscoveredResource {
  physicalId: string;
  resourceType: string;
  region: string;
  arn: string;
  tags: Record<string, string>;
  createdAt?: Date;
  metadata: Record<string, any>;
}

/**
 * Physical ID match candidate
 */
export interface PhysicalResourceCandidate {
  physicalId: string;
  confidence: number;
  source: 'discovered' | 'template' | 'manual';
  metadata?: Record<string, any>;
}

/**
 * Difference classification for comparison results
 */
export interface Difference {
  path: string;
  serverlessValue: any;
  cdkValue: any;
  type: 'added' | 'removed' | 'modified';
}

/**
 * Drift information for CloudFormation resources
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
}
