/**
 * Editor Module
 * Programmatically modifies CloudFormation templates to remove resources safely
 */

import * as fs from 'fs/promises';
import { CloudFormationTemplate, CloudFormationResource } from '../../types/migration';
import {
  RemovalOptions,
  ModificationResult,
  ValidationResult,
  BackupInfo,
  EditorConfig,
  DependencyUpdate,
  EditorError,
  EditorErrorCode,
} from './types';
import { TemplateEditor } from './template-editor';
import { DependencyUpdater } from './dependency-updater';
import { TemplateValidator } from './validator';
import { BackupManager } from './backup-manager';

/**
 * Main Editor class - Facade for all template editing operations
 */
export class Editor {
  private templateEditor: TemplateEditor;
  private dependencyUpdater: DependencyUpdater;
  private validator: TemplateValidator;
  private backupManager: BackupManager;
  private config: EditorConfig;

  constructor(config: EditorConfig = {}) {
    this.config = {
      autoValidate: true,
      autoBackup: true,
      verbose: false,
      ...config,
    };

    this.templateEditor = new TemplateEditor(this.config.backupDirectory);
    this.dependencyUpdater = new DependencyUpdater();
    this.validator = new TemplateValidator();
    this.backupManager = new BackupManager(this.config.backupDirectory);
  }

  /**
   * Load CloudFormation template from file
   */
  async loadTemplate(path: string): Promise<CloudFormationTemplate> {
    try {
      const content = await fs.readFile(path, 'utf-8');
      const template = JSON.parse(content) as CloudFormationTemplate;

      // Validate template structure
      const validation = this.validator.validate(template);
      if (!validation.valid) {
        throw new EditorError(
          `Invalid template: ${validation.errors.join(', ')}`,
          EditorErrorCode.INVALID_TEMPLATE,
          { path, validation }
        );
      }

      return template;
    } catch (error) {
      if (error instanceof EditorError) throw error;

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to load template from ${path}: ${errorMsg}`,
        EditorErrorCode.INVALID_TEMPLATE,
        { error, path }
      );
    }
  }

  /**
   * Save CloudFormation template to file
   */
  async saveTemplate(
    template: CloudFormationTemplate,
    outputPath: string,
    options: { backup?: boolean; validate?: boolean } = {}
  ): Promise<void> {
    try {
      // Validate before saving if requested
      if (options.validate !== false && this.config.autoValidate) {
        const validation = this.validator.validate(template);
        if (!validation.valid) {
          throw new EditorError(
            `Cannot save invalid template: ${validation.errors.join(', ')}`,
            EditorErrorCode.VALIDATION_FAILED,
            { validation }
          );
        }
      }

      // Create backup of existing file if it exists
      if (options.backup !== false && this.config.autoBackup) {
        try {
          const existingTemplate = await this.loadTemplate(outputPath);
          await this.backupManager.createBackup(existingTemplate);
        } catch {
          // File doesn't exist, no backup needed
        }
      }

      // Write template to file
      await fs.writeFile(
        outputPath,
        JSON.stringify(template, null, 2),
        'utf-8'
      );
    } catch (error) {
      if (error instanceof EditorError) throw error;

      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to save template to ${outputPath}: ${errorMsg}`,
        EditorErrorCode.MODIFICATION_FAILED,
        { error, path: outputPath }
      );
    }
  }

  /**
   * Remove a single resource from the template
   */
  async removeResource(
    template: CloudFormationTemplate,
    logicalId: string,
    options?: RemovalOptions
  ): Promise<ModificationResult> {
    const mergedOptions = this.mergeOptions(options);
    return this.templateEditor.removeResource(template, logicalId, mergedOptions);
  }

  /**
   * Remove multiple resources atomically
   */
  async removeResources(
    template: CloudFormationTemplate,
    logicalIds: string[],
    options?: RemovalOptions
  ): Promise<ModificationResult> {
    const mergedOptions = this.mergeOptions(options);
    return this.templateEditor.removeResources(template, logicalIds, mergedOptions);
  }

  /**
   * Add a resource to the template
   */
  async addResource(
    template: CloudFormationTemplate,
    logicalId: string,
    resource: CloudFormationResource,
    options?: RemovalOptions
  ): Promise<ModificationResult> {
    const mergedOptions = this.mergeOptions(options);
    return this.templateEditor.addResource(template, logicalId, resource, mergedOptions);
  }

  /**
   * Update resource properties
   */
  async updateResource(
    template: CloudFormationTemplate,
    logicalId: string,
    properties: Record<string, any>,
    options?: RemovalOptions
  ): Promise<ModificationResult> {
    const mergedOptions = this.mergeOptions(options);
    return this.templateEditor.updateResource(
      template,
      logicalId,
      properties,
      mergedOptions
    );
  }

  /**
   * Update DependsOn references after resource removal
   */
  updateDependencies(
    template: CloudFormationTemplate,
    removedIds: string[]
  ): DependencyUpdate[] {
    return this.dependencyUpdater.updateDependencies(template, removedIds);
  }

  /**
   * Find resources that depend on a target resource
   */
  findDependents(
    template: CloudFormationTemplate,
    targetId: string
  ): { explicit: string[]; implicit: string[] } {
    return {
      explicit: this.dependencyUpdater.findExplicitDependents(template, targetId),
      implicit: this.dependencyUpdater.findImplicitDependents(template, targetId),
    };
  }

  /**
   * Find all dependencies of a resource
   */
  findDependencies(
    template: CloudFormationTemplate,
    resourceId: string
  ): string[] {
    return this.dependencyUpdater.findAllDependencies(template, resourceId);
  }

  /**
   * Build dependency graph from template
   */
  buildDependencyGraph(
    template: CloudFormationTemplate
  ): Map<string, Set<string>> {
    return this.dependencyUpdater.buildDependencyGraph(template);
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(template: CloudFormationTemplate): string[][] {
    return this.dependencyUpdater.detectCircularDependencies(template);
  }

  /**
   * Validate template syntax and semantics
   */
  validateTemplate(template: CloudFormationTemplate): ValidationResult {
    return this.validator.validate(template);
  }

  /**
   * Create a backup of the template
   */
  async createBackup(
    template: CloudFormationTemplate,
    backupPath?: string
  ): Promise<string> {
    return this.backupManager.createBackup(template, backupPath);
  }

  /**
   * Restore template from backup
   */
  async restoreBackup(backupPath: string): Promise<CloudFormationTemplate> {
    return this.backupManager.restoreBackup(backupPath);
  }

  /**
   * List available backups
   */
  async listBackups(directory?: string): Promise<BackupInfo[]> {
    return this.backupManager.listBackups(directory);
  }

  /**
   * Delete old backups
   */
  async cleanupBackups(keepCount: number = 10): Promise<number> {
    return this.backupManager.cleanupOldBackups(keepCount);
  }

  /**
   * Get the latest backup
   */
  async getLatestBackup(): Promise<BackupInfo | null> {
    return this.backupManager.getLatestBackup();
  }

  /**
   * Merge user options with config defaults
   */
  private mergeOptions(options?: RemovalOptions): RemovalOptions {
    return {
      createBackup: this.config.autoBackup,
      validate: this.config.autoValidate,
      updateDependencies: true,
      dryRun: false,
      backupPath: this.config.backupDirectory,
      ...options,
    };
  }
}

// Export all types
export * from './types';

// Export individual components for advanced usage
export { TemplateEditor } from './template-editor';
export { DependencyUpdater } from './dependency-updater';
export { TemplateValidator } from './validator';
export { BackupManager } from './backup-manager';
