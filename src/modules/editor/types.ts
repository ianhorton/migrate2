/**
 * Type definitions for the Editor Module
 */

import { CloudFormationTemplate } from '../../types/migration';

export interface RemovalOptions {
  /** Create backup before removal */
  createBackup?: boolean;

  /** Validate after removal */
  validate?: boolean;

  /** Update dependent resources */
  updateDependencies?: boolean;

  /** Dry run (don't actually modify) */
  dryRun?: boolean;

  /** Backup directory path */
  backupPath?: string;
}

export interface ModificationResult {
  success: boolean;
  removedResources: string[];
  updatedDependencies: DependencyUpdate[];
  warnings: string[];
  errors?: string[];
  backupPath?: string;
  template?: CloudFormationTemplate;
}

export interface DependencyUpdate {
  resourceId: string;
  before: string[];
  after: string[];
  type: 'explicit' | 'implicit';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BackupInfo {
  filename: string;
  path: string;
  timestamp: Date;
  size: number;
  templateHash: string;
}

export interface EditorConfig {
  /** Directory for backup files */
  backupDirectory?: string;

  /** Auto-validate after modifications */
  autoValidate?: boolean;

  /** Auto-backup before modifications */
  autoBackup?: boolean;

  /** Verbose logging */
  verbose?: boolean;
}

export class EditorError extends Error {
  constructor(
    message: string,
    public readonly code: EditorErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EditorError';
  }
}

export enum EditorErrorCode {
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BACKUP_FAILED = 'BACKUP_FAILED',
  RESTORE_FAILED = 'RESTORE_FAILED',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  MODIFICATION_FAILED = 'MODIFICATION_FAILED',
}
