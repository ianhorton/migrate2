/**
 * Template Editor
 * Core template modification operations
 */

import { CloudFormationTemplate, CloudFormationResource } from '../../types/migration';
import {
  ModificationResult,
  RemovalOptions,
  EditorError,
  EditorErrorCode,
} from './types';
import { DependencyUpdater } from './dependency-updater';
import { TemplateValidator } from './validator';
import { BackupManager } from './backup-manager';

export class TemplateEditor {
  private dependencyUpdater: DependencyUpdater;
  private validator: TemplateValidator;
  private backupManager: BackupManager;

  constructor(backupDirectory?: string) {
    this.dependencyUpdater = new DependencyUpdater();
    this.validator = new TemplateValidator();
    this.backupManager = new BackupManager(backupDirectory);
  }

  /**
   * Remove a single resource from the template
   */
  async removeResource(
    template: CloudFormationTemplate,
    logicalId: string,
    options: RemovalOptions = {}
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      success: false,
      removedResources: [],
      updatedDependencies: [],
      warnings: [],
      errors: [],
    };

    try {
      // Validate resource exists
      if (!template.Resources[logicalId]) {
        throw new EditorError(
          `Resource ${logicalId} not found in template`,
          EditorErrorCode.RESOURCE_NOT_FOUND,
          { logicalId }
        );
      }

      // Create backup if requested
      if (options.createBackup !== false) {
        result.backupPath = await this.backupManager.createBackup(
          template,
          options.backupPath
        );
      }

      // Find dependents before removal
      const explicitDependents = this.dependencyUpdater.findExplicitDependents(
        template,
        logicalId
      );
      const implicitDependents = this.dependencyUpdater.findImplicitDependents(
        template,
        logicalId
      );

      // Warn about explicit dependents
      if (explicitDependents.length > 0) {
        result.warnings.push(
          `Warning: ${explicitDependents.length} resources explicitly depend on ${logicalId}: ${explicitDependents.join(', ')}`
        );
      }

      // Warn about implicit dependents
      if (implicitDependents.length > 0) {
        result.warnings.push(
          `Warning: ${implicitDependents.length} resources have implicit dependencies on ${logicalId}: ${implicitDependents.join(', ')}`
        );
        result.warnings.push(
          'Note: Implicit dependencies (Ref, GetAtt) must be manually updated in dependent resources'
        );
      }

      // Perform the removal
      if (!options.dryRun) {
        delete template.Resources[logicalId];
        result.removedResources.push(logicalId);

        // Update dependencies if requested
        if (options.updateDependencies !== false) {
          const updates = this.dependencyUpdater.updateDependencies(
            template,
            [logicalId]
          );
          result.updatedDependencies.push(...updates);
        }

        // Validate template if requested
        if (options.validate !== false) {
          const validation = this.validator.validate(template);
          if (!validation.valid) {
            result.errors = validation.errors;
            result.warnings.push(...validation.warnings);
            throw new EditorError(
              `Template validation failed after removing ${logicalId}`,
              EditorErrorCode.VALIDATION_FAILED,
              { validation }
            );
          }
          result.warnings.push(...validation.warnings);
        }

        result.template = template;
      }

      result.success = true;
      return result;
    } catch (error) {
      result.success = false;
      if (error instanceof EditorError) {
        result.errors?.push(error.message);
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors?.push(errorMsg);
      throw new EditorError(
        `Failed to remove resource ${logicalId}: ${errorMsg}`,
        EditorErrorCode.MODIFICATION_FAILED,
        { error }
      );
    }
  }

  /**
   * Remove multiple resources atomically
   */
  async removeResources(
    template: CloudFormationTemplate,
    logicalIds: string[],
    options: RemovalOptions = {}
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      success: false,
      removedResources: [],
      updatedDependencies: [],
      warnings: [],
      errors: [],
    };

    try {
      // Validate all resources exist
      for (const logicalId of logicalIds) {
        if (!template.Resources[logicalId]) {
          throw new EditorError(
            `Resource ${logicalId} not found in template`,
            EditorErrorCode.RESOURCE_NOT_FOUND,
            { logicalId }
          );
        }
      }

      // Create backup if requested
      if (options.createBackup !== false) {
        result.backupPath = await this.backupManager.createBackup(
          template,
          options.backupPath
        );
      }

      // Determine removal order using topological sort
      const removalOrder = this.dependencyUpdater.getRemovalOrder(
        template,
        logicalIds
      );

      // Collect warnings for all resources
      for (const logicalId of logicalIds) {
        const explicitDependents = this.dependencyUpdater
          .findExplicitDependents(template, logicalId)
          .filter((id) => !logicalIds.includes(id)); // Exclude resources being removed

        const implicitDependents = this.dependencyUpdater
          .findImplicitDependents(template, logicalId)
          .filter((id) => !logicalIds.includes(id));

        if (explicitDependents.length > 0) {
          result.warnings.push(
            `Warning: ${explicitDependents.length} resources explicitly depend on ${logicalId}: ${explicitDependents.join(', ')}`
          );
        }

        if (implicitDependents.length > 0) {
          result.warnings.push(
            `Warning: ${implicitDependents.length} resources have implicit dependencies on ${logicalId}: ${implicitDependents.join(', ')}`
          );
        }
      }

      // Perform batch removal
      if (!options.dryRun) {
        // Remove resources in dependency order (dependents first)
        for (const logicalId of removalOrder.reverse()) {
          delete template.Resources[logicalId];
          result.removedResources.push(logicalId);
        }

        // Update dependencies if requested
        if (options.updateDependencies !== false) {
          const updates = this.dependencyUpdater.updateDependencies(
            template,
            logicalIds
          );
          result.updatedDependencies.push(...updates);
        }

        // Validate template if requested
        if (options.validate !== false) {
          const validation = this.validator.validate(template);
          if (!validation.valid) {
            result.errors = validation.errors;
            result.warnings.push(...validation.warnings);
            throw new EditorError(
              `Template validation failed after removing ${logicalIds.length} resources`,
              EditorErrorCode.VALIDATION_FAILED,
              { validation }
            );
          }
          result.warnings.push(...validation.warnings);
        }

        result.template = template;
      }

      result.success = true;
      return result;
    } catch (error) {
      result.success = false;
      if (error instanceof EditorError) {
        result.errors?.push(error.message);
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors?.push(errorMsg);
      throw new EditorError(
        `Failed to remove resources: ${errorMsg}`,
        EditorErrorCode.MODIFICATION_FAILED,
        { error }
      );
    }
  }

  /**
   * Add a resource to the template
   */
  async addResource(
    template: CloudFormationTemplate,
    logicalId: string,
    resource: CloudFormationResource,
    options: RemovalOptions = {}
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      success: false,
      removedResources: [],
      updatedDependencies: [],
      warnings: [],
      errors: [],
    };

    try {
      // Validate resource doesn't already exist
      if (template.Resources[logicalId]) {
        result.warnings.push(
          `Warning: Resource ${logicalId} already exists and will be replaced`
        );
      }

      // Create backup if requested
      if (options.createBackup !== false) {
        result.backupPath = await this.backupManager.createBackup(
          template,
          options.backupPath
        );
      }

      // Add the resource
      if (!options.dryRun) {
        template.Resources[logicalId] = resource;

        // Validate template if requested
        if (options.validate !== false) {
          const validation = this.validator.validate(template);
          if (!validation.valid) {
            // Rollback on validation failure
            delete template.Resources[logicalId];
            result.errors = validation.errors;
            result.warnings.push(...validation.warnings);
            throw new EditorError(
              `Template validation failed after adding ${logicalId}`,
              EditorErrorCode.VALIDATION_FAILED,
              { validation }
            );
          }
          result.warnings.push(...validation.warnings);
        }

        result.template = template;
      }

      result.success = true;
      return result;
    } catch (error) {
      result.success = false;
      if (error instanceof EditorError) {
        result.errors?.push(error.message);
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors?.push(errorMsg);
      throw new EditorError(
        `Failed to add resource ${logicalId}: ${errorMsg}`,
        EditorErrorCode.MODIFICATION_FAILED,
        { error }
      );
    }
  }

  /**
   * Update resource properties
   */
  async updateResource(
    template: CloudFormationTemplate,
    logicalId: string,
    properties: Record<string, any>,
    options: RemovalOptions = {}
  ): Promise<ModificationResult> {
    const result: ModificationResult = {
      success: false,
      removedResources: [],
      updatedDependencies: [],
      warnings: [],
      errors: [],
    };

    try {
      // Validate resource exists
      if (!template.Resources[logicalId]) {
        throw new EditorError(
          `Resource ${logicalId} not found in template`,
          EditorErrorCode.RESOURCE_NOT_FOUND,
          { logicalId }
        );
      }

      // Create backup if requested
      if (options.createBackup !== false) {
        result.backupPath = await this.backupManager.createBackup(
          template,
          options.backupPath
        );
      }

      // Update properties
      if (!options.dryRun) {
        template.Resources[logicalId].Properties = {
          ...template.Resources[logicalId].Properties,
          ...properties,
        };

        // Validate template if requested
        if (options.validate !== false) {
          const validation = this.validator.validate(template);
          if (!validation.valid) {
            result.errors = validation.errors;
            result.warnings.push(...validation.warnings);
            throw new EditorError(
              `Template validation failed after updating ${logicalId}`,
              EditorErrorCode.VALIDATION_FAILED,
              { validation }
            );
          }
          result.warnings.push(...validation.warnings);
        }

        result.template = template;
      }

      result.success = true;
      return result;
    } catch (error) {
      result.success = false;
      if (error instanceof EditorError) {
        result.errors?.push(error.message);
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors?.push(errorMsg);
      throw new EditorError(
        `Failed to update resource ${logicalId}: ${errorMsg}`,
        EditorErrorCode.MODIFICATION_FAILED,
        { error }
      );
    }
  }
}
