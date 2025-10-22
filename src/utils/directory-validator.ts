import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of directory validation
 */
export interface ValidationResult {
  valid: boolean;
  shouldCreate: boolean;
  shouldCreateParent?: boolean;
  error?: string;
  warning?: string;
}

/**
 * Directory validator for CDK generation
 * Validates target directories before migration to ensure safe operation
 */
export class DirectoryValidator {
  /**
   * Validate target directory for CDK generation
   *
   * @param targetDir - Absolute path to target directory
   * @param options - Validation options
   * @returns ValidationResult indicating if directory is valid for use
   */
  static validateTargetDirectory(
    targetDir: string,
    options?: { force?: boolean }
  ): ValidationResult {
    const force = options?.force ?? false;

    // Step 1: Check if directory exists
    if (!fs.existsSync(targetDir)) {
      // Check if parent directory exists
      const parentDir = path.dirname(targetDir);

      if (!fs.existsSync(parentDir)) {
        return {
          valid: true,
          shouldCreate: true,
          shouldCreateParent: true
        };
      }

      // Parent exists, we just need to create the target
      return {
        valid: true,
        shouldCreate: true
      };
    }

    // Step 2: Directory exists - check write permissions first
    if (!this.hasWritePermission(targetDir)) {
      return {
        valid: false,
        shouldCreate: false,
        error: `Cannot write to directory: ${targetDir}. Permission denied.`
      };
    }

    // Step 3: Check if it's a CDK project
    if (this.isCDKProject(targetDir)) {
      if (force) {
        return {
          valid: true,
          shouldCreate: false,
          warning: `Target directory contains a CDK project. Force flag enabled - will overwrite.`
        };
      }

      return {
        valid: false,
        shouldCreate: false,
        error: `Target directory already contains a CDK project at ${targetDir}. Use --force to overwrite or specify a different --target.`
      };
    }

    // Step 4: Check if directory is empty
    const isEmpty = this.isEmptyDirectory(targetDir);

    if (isEmpty) {
      return {
        valid: true,
        shouldCreate: false,
        warning: `Directory exists but is empty, will use it.`
      };
    }

    // Step 5: Directory has files that aren't CDK-related
    if (force) {
      return {
        valid: true,
        shouldCreate: false,
        warning: `Target directory is not empty. Force flag enabled - existing files may be overwritten.`
      };
    }

    return {
      valid: false,
      shouldCreate: false,
      error: `Target directory ${targetDir} is not empty. Please use an empty directory, remove existing files, or use --force to overwrite.`
    };
  }

  /**
   * Check if directory contains a CDK project
   * A directory is considered a CDK project if it has:
   * - cdk.json file, OR
   * - package.json with aws-cdk-lib dependency
   *
   * @param dir - Directory path to check
   * @returns True if directory contains a CDK project
   */
  private static isCDKProject(dir: string): boolean {
    try {
      // Check for cdk.json
      const cdkJsonPath = path.join(dir, 'cdk.json');
      if (fs.existsSync(cdkJsonPath)) {
        return true;
      }

      // Check for package.json with aws-cdk-lib
      const packageJsonPath = path.join(dir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
          );

          // Check both dependencies and devDependencies for aws-cdk-lib
          const deps = packageJson.dependencies || {};
          const devDeps = packageJson.devDependencies || {};

          if (deps['aws-cdk-lib'] || devDeps['aws-cdk-lib']) {
            return true;
          }
        } catch (parseError) {
          // If package.json is invalid, ignore it
          return false;
        }
      }

      return false;
    } catch (error) {
      // If we can't read the directory, assume it's not a CDK project
      return false;
    }
  }

  /**
   * Check if directory is empty
   *
   * @param dir - Directory path to check
   * @returns True if directory is empty (no files or subdirectories)
   */
  private static isEmptyDirectory(dir: string): boolean {
    try {
      const entries = fs.readdirSync(dir);
      return entries.length === 0;
    } catch (error) {
      // If we can't read the directory, assume it's not empty
      return false;
    }
  }

  /**
   * Check write permissions for a directory
   * Tests if we can write to the directory or its parent
   *
   * @param dir - Directory path to check
   * @returns True if we have write permission
   */
  private static hasWritePermission(dir: string): boolean {
    try {
      // If directory exists, check if we can write to it
      if (fs.existsSync(dir)) {
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
      }

      // If directory doesn't exist, check parent
      const parentDir = path.dirname(dir);
      if (fs.existsSync(parentDir)) {
        fs.accessSync(parentDir, fs.constants.W_OK);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }
}
