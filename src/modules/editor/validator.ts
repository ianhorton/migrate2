/**
 * Template Validator
 * Validates CloudFormation template syntax and semantics
 */

import { CloudFormationTemplate, CloudFormationResource } from '../../types/migration';
import { ValidationResult } from './types';
import { DependencyUpdater } from './dependency-updater';

export class TemplateValidator {
  private dependencyUpdater: DependencyUpdater;

  constructor() {
    this.dependencyUpdater = new DependencyUpdater();
  }

  /**
   * Validate CloudFormation template
   */
  validate(template: CloudFormationTemplate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate JSON structure
    try {
      JSON.stringify(template);
    } catch (e) {
      const error = e as Error;
      errors.push(`Invalid JSON structure: ${error.message}`);
      return { valid: false, errors, warnings };
    }

    // Validate template structure
    this.validateTemplateStructure(template, errors, warnings);

    // Validate resources
    if (template.Resources) {
      this.validateResources(template, errors, warnings);
    }

    // Validate dependencies
    this.validateDependencies(template, errors, warnings);

    // Check for circular dependencies
    this.checkCircularDependencies(template, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate basic template structure
   */
  private validateTemplateStructure(
    template: CloudFormationTemplate,
    errors: string[],
    warnings: string[]
  ): void {
    // Check AWSTemplateFormatVersion
    if (!template.AWSTemplateFormatVersion) {
      warnings.push('Missing AWSTemplateFormatVersion');
    } else if (template.AWSTemplateFormatVersion !== '2010-09-09') {
      warnings.push(
        `Unexpected AWSTemplateFormatVersion: ${template.AWSTemplateFormatVersion}`
      );
    }

    // Check Resources section
    if (!template.Resources) {
      errors.push('Missing Resources section');
      return;
    }

    if (typeof template.Resources !== 'object') {
      errors.push('Resources must be an object');
      return;
    }

    if (Object.keys(template.Resources).length === 0) {
      warnings.push('Template has no resources');
    }
  }

  /**
   * Validate all resources
   */
  private validateResources(
    template: CloudFormationTemplate,
    errors: string[],
    warnings: string[]
  ): void {
    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      this.validateResource(logicalId, resource, template, errors, warnings);
    }
  }

  /**
   * Validate individual resource
   */
  private validateResource(
    logicalId: string,
    resource: CloudFormationResource,
    template: CloudFormationTemplate,
    errors: string[],
    warnings: string[]
  ): void {
    // Validate logical ID format
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(logicalId)) {
      errors.push(
        `Invalid logical ID: ${logicalId} (must be alphanumeric, starting with letter)`
      );
    }

    // Validate Type
    if (!resource.Type) {
      errors.push(`Resource ${logicalId} missing Type`);
    } else if (typeof resource.Type !== 'string') {
      errors.push(`Resource ${logicalId} Type must be a string`);
    } else if (!this.isValidResourceType(resource.Type)) {
      warnings.push(
        `Resource ${logicalId} has unknown or custom resource type: ${resource.Type}`
      );
    }

    // Validate Properties
    if (!resource.Properties) {
      warnings.push(`Resource ${logicalId} has no Properties`);
    } else if (typeof resource.Properties !== 'object') {
      errors.push(`Resource ${logicalId} Properties must be an object`);
    }

    // Validate DependsOn references
    if (resource.DependsOn) {
      this.validateDependsOn(logicalId, resource.DependsOn, template, errors);
    }

    // Validate DeletionPolicy
    if (resource.DeletionPolicy) {
      if (
        !['Delete', 'Retain', 'Snapshot'].includes(resource.DeletionPolicy)
      ) {
        errors.push(
          `Resource ${logicalId} has invalid DeletionPolicy: ${resource.DeletionPolicy}`
        );
      }
    }

    // Validate UpdateReplacePolicy
    if (resource.UpdateReplacePolicy) {
      if (
        !['Delete', 'Retain', 'Snapshot'].includes(
          resource.UpdateReplacePolicy
        )
      ) {
        errors.push(
          `Resource ${logicalId} has invalid UpdateReplacePolicy: ${resource.UpdateReplacePolicy}`
        );
      }
    }
  }

  /**
   * Validate DependsOn references
   */
  private validateDependsOn(
    logicalId: string,
    dependsOn: string | string[],
    template: CloudFormationTemplate,
    errors: string[]
  ): void {
    const deps = Array.isArray(dependsOn) ? dependsOn : [dependsOn];

    for (const dep of deps) {
      if (typeof dep !== 'string') {
        errors.push(
          `Resource ${logicalId} has invalid DependsOn value: ${dep}`
        );
        continue;
      }

      if (!template.Resources[dep]) {
        errors.push(
          `Resource ${logicalId} depends on non-existent resource: ${dep}`
        );
      }

      if (dep === logicalId) {
        errors.push(`Resource ${logicalId} cannot depend on itself`);
      }
    }

    // Check for duplicate dependencies
    if (deps.length !== new Set(deps).size) {
      errors.push(`Resource ${logicalId} has duplicate dependencies`);
    }
  }

  /**
   * Validate all dependencies
   */
  private validateDependencies(
    template: CloudFormationTemplate,
    errors: string[],
    warnings: string[]
  ): void {
    const allResourceIds = Object.keys(template.Resources);

    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      // Find implicit dependencies
      const implicitDeps = this.dependencyUpdater['findAllReferences'](
        resource,
        allResourceIds
      );

      // Check if implicit dependencies exist
      for (const dep of implicitDeps) {
        if (!template.Resources[dep]) {
          errors.push(
            `Resource ${logicalId} references non-existent resource: ${dep}`
          );
        }
      }

      // Check for self-references
      if (implicitDeps.includes(logicalId)) {
        errors.push(`Resource ${logicalId} references itself`);
      }
    }
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(
    template: CloudFormationTemplate,
    errors: string[],
    warnings: string[]
  ): void {
    try {
      const cycles = this.dependencyUpdater.detectCircularDependencies(
        template
      );

      for (const cycle of cycles) {
        errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }
    } catch (error) {
      // Circular dependency detection might throw
      if (error instanceof Error) {
        errors.push(`Dependency analysis failed: ${error.message}`);
      }
    }
  }

  /**
   * Check if resource type is valid
   */
  private isValidResourceType(type: string): boolean {
    // AWS resource types follow pattern: AWS::Service::Resource
    const awsPattern = /^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/;
    // Custom resource types follow pattern: Custom::Name
    const customPattern = /^Custom::[A-Za-z0-9]+$/;

    return awsPattern.test(type) || customPattern.test(type);
  }

  /**
   * Validate resource name uniqueness
   */
  validateUniqueResourceNames(template: CloudFormationTemplate): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const logicalIds = Object.keys(template.Resources);

    // Check for duplicate logical IDs (should not happen in valid JSON)
    const uniqueIds = new Set(logicalIds);
    if (uniqueIds.size !== logicalIds.length) {
      errors.push('Template contains duplicate resource logical IDs');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
