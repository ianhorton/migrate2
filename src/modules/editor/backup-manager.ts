/**
 * Backup Manager
 * Handles template backup and restoration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { CloudFormationTemplate } from '../../types/migration';
import { BackupInfo, EditorError, EditorErrorCode } from './types';

export class BackupManager {
  private backupDirectory: string;

  constructor(backupDirectory?: string) {
    this.backupDirectory =
      backupDirectory || path.join(process.cwd(), '.sls-to-cdk', 'backups');
  }

  /**
   * Create a backup of the template
   */
  async createBackup(
    template: CloudFormationTemplate,
    customPath?: string
  ): Promise<string> {
    try {
      // Ensure backup directory exists
      const backupDir = customPath || this.backupDirectory;
      await fs.mkdir(backupDir, { recursive: true });

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const hash = this.calculateHash(template);
      const filename = `template-${timestamp}-${hash.slice(0, 8)}.json`;
      const backupPath = path.join(backupDir, filename);

      // Write backup file
      await fs.writeFile(
        backupPath,
        JSON.stringify(template, null, 2),
        'utf-8'
      );

      return backupPath;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to create backup: ${errorMsg}`,
        EditorErrorCode.BACKUP_FAILED,
        { error }
      );
    }
  }

  /**
   * Restore a template from backup
   */
  async restoreBackup(backupPath: string): Promise<CloudFormationTemplate> {
    try {
      // Read backup file
      const content = await fs.readFile(backupPath, 'utf-8');
      const template = JSON.parse(content) as CloudFormationTemplate;

      // Validate restored template
      if (!this.isValidTemplate(template)) {
        throw new Error('Backup file does not contain a valid template');
      }

      return template;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to restore backup: ${errorMsg}`,
        EditorErrorCode.RESTORE_FAILED,
        { error, backupPath }
      );
    }
  }

  /**
   * List all available backups
   */
  async listBackups(directory?: string): Promise<BackupInfo[]> {
    try {
      const backupDir = directory || this.backupDirectory;

      try {
        await fs.access(backupDir);
      } catch {
        // Directory doesn't exist, return empty list
        return [];
      }

      const files = await fs.readdir(backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (file.startsWith('template-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);

          // Read template to calculate hash
          const content = await fs.readFile(filePath, 'utf-8');
          const template = JSON.parse(content);
          const hash = this.calculateHash(template);

          backups.push({
            filename: file,
            path: filePath,
            timestamp: stats.mtime,
            size: stats.size,
            templateHash: hash,
          });
        }
      }

      // Sort by timestamp (newest first)
      return backups.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to list backups: ${errorMsg}`,
        EditorErrorCode.BACKUP_FAILED,
        { error }
      );
    }
  }

  /**
   * Delete a backup file
   */
  async deleteBackup(backupPath: string): Promise<void> {
    try {
      await fs.unlink(backupPath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to delete backup: ${errorMsg}`,
        EditorErrorCode.BACKUP_FAILED,
        { error, backupPath }
      );
    }
  }

  /**
   * Delete old backups (keep only recent N backups)
   */
  async cleanupOldBackups(keepCount: number = 10): Promise<number> {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keepCount) {
        return 0;
      }

      const toDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        try {
          await this.deleteBackup(backup.path);
          deletedCount++;
        } catch (error) {
          // Continue deleting other backups even if one fails
          console.error(`Failed to delete backup ${backup.filename}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new EditorError(
        `Failed to cleanup backups: ${errorMsg}`,
        EditorErrorCode.BACKUP_FAILED,
        { error }
      );
    }
  }

  /**
   * Get the most recent backup
   */
  async getLatestBackup(): Promise<BackupInfo | null> {
    const backups = await this.listBackups();
    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * Compare template with a backup
   */
  async compareWithBackup(
    template: CloudFormationTemplate,
    backupPath: string
  ): Promise<{ identical: boolean; currentHash: string; backupHash: string }> {
    const currentHash = this.calculateHash(template);
    const backupTemplate = await this.restoreBackup(backupPath);
    const backupHash = this.calculateHash(backupTemplate);

    return {
      identical: currentHash === backupHash,
      currentHash,
      backupHash,
    };
  }

  /**
   * Calculate SHA-256 hash of template
   */
  private calculateHash(template: CloudFormationTemplate): string {
    const content = JSON.stringify(template, null, 2);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate template structure
   */
  private isValidTemplate(template: any): template is CloudFormationTemplate {
    return (
      typeof template === 'object' &&
      template !== null &&
      'Resources' in template &&
      typeof template.Resources === 'object'
    );
  }

  /**
   * Set backup directory
   */
  setBackupDirectory(directory: string): void {
    this.backupDirectory = directory;
  }

  /**
   * Get current backup directory
   */
  getBackupDirectory(): string {
    return this.backupDirectory;
  }
}
