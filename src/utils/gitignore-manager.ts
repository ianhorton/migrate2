import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of gitignore update operation
 */
export interface GitignoreResult {
  /** True if .gitignore was created or modified */
  updated: boolean;

  /** True if new .gitignore was created */
  created: boolean;

  /** True if /cdk/ already exists in gitignore */
  alreadyExists: boolean;

  /** Error message if operation failed */
  error?: string;

  /** Warning message if needed */
  warning?: string;
}

/**
 * Utility class for managing .gitignore files in serverless projects
 *
 * Ensures CDK output directory (/cdk/) is properly ignored in version control
 */
export class GitignoreManager {
  /** Pattern to add to .gitignore for CDK output */
  private static readonly CDK_PATTERN = '/cdk/';

  /**
   * Ensure source directory's .gitignore contains /cdk/ entry
   *
   * Creates .gitignore if missing, appends /cdk/ if not present.
   * Handles various edge cases:
   * - Missing source directory
   * - No write permissions
   * - Malformed .gitignore files
   * - Existing /cdk/ patterns
   *
   * @param sourceDir - Absolute path to source directory
   * @returns Result of gitignore update operation
   *
   * @example
   * ```typescript
   * // Create new .gitignore
   * const result = GitignoreManager.ensureCdkIgnored('/path/to/project');
   * console.log(result.created); // true
   *
   * // Update existing .gitignore
   * const result2 = GitignoreManager.ensureCdkIgnored('/path/to/project');
   * console.log(result2.alreadyExists); // true
   * ```
   */
  static ensureCdkIgnored(sourceDir: string): GitignoreResult {
    // Validate source directory exists
    if (!fs.existsSync(sourceDir)) {
      return {
        updated: false,
        created: false,
        alreadyExists: false,
        error: 'Source directory does not exist'
      };
    }

    // Validate source directory is actually a directory
    let stats: fs.Stats;
    try {
      stats = fs.statSync(sourceDir);
      if (!stats.isDirectory()) {
        return {
          updated: false,
          created: false,
          alreadyExists: false,
          error: 'Source path is not a directory'
        };
      }
    } catch (error) {
      return {
        updated: false,
        created: false,
        alreadyExists: false,
        error: `Failed to access source directory: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    const gitignorePath = path.join(sourceDir, '.gitignore');

    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
      // Create new .gitignore with /cdk/ entry
      try {
        fs.writeFileSync(gitignorePath, this.CDK_PATTERN + '\n', 'utf8');
        return {
          updated: true,
          created: true,
          alreadyExists: false
        };
      } catch (error) {
        return {
          updated: false,
          created: false,
          alreadyExists: false,
          error: `Failed to create .gitignore: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    // Read existing .gitignore
    let content: string;
    try {
      content = fs.readFileSync(gitignorePath, 'utf8');
    } catch (error) {
      return {
        updated: false,
        created: false,
        alreadyExists: false,
        error: `Failed to read .gitignore: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    // Check if /cdk/ already exists in the file
    if (this.containsCdkPattern(content)) {
      return {
        updated: false,
        created: false,
        alreadyExists: true
      };
    }

    // Append /cdk/ pattern to existing .gitignore
    try {
      // Ensure content ends with newline before appending
      const newContent = content.endsWith('\n')
        ? content + this.CDK_PATTERN + '\n'
        : content + '\n' + this.CDK_PATTERN + '\n';

      fs.writeFileSync(gitignorePath, newContent, 'utf8');

      return {
        updated: true,
        created: false,
        alreadyExists: false
      };
    } catch (error) {
      return {
        updated: false,
        created: false,
        alreadyExists: false,
        error: `Failed to update .gitignore: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if content contains /cdk/ pattern
   *
   * Checks for exact match of '/cdk/' pattern on its own line.
   * Handles various formats:
   * - Exact match: /cdk/
   * - With whitespace: '  /cdk/  '
   * - Case sensitive
   *
   * Note: Only checks for /cdk/ specifically, not cdk/ (without leading slash)
   * as they have different semantics in gitignore:
   * - /cdk/ = matches 'cdk' directory at root level only
   * - cdk/ = matches any 'cdk' directory at any level
   *
   * @param content - Content of .gitignore file
   * @returns True if /cdk/ pattern exists
   */
  private static containsCdkPattern(content: string): boolean {
    // Split by lines and check each line
    const lines = content.split('\n');

    // Check for exact match (trimmed) - only /cdk/, not cdk/
    return lines.some(line => {
      const trimmed = line.trim();
      return trimmed === this.CDK_PATTERN;
    });
  }

  /**
   * Validate gitignore file format
   *
   * @param filePath - Path to .gitignore file
   * @returns True if file is valid
   */
  static validateGitignore(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Basic validation: file should be readable UTF-8 text
      // Each line should be a valid gitignore pattern (non-null bytes)
      return content !== null && typeof content === 'string';
    } catch {
      return false;
    }
  }

  /**
   * Read .gitignore patterns
   *
   * @param sourceDir - Source directory path
   * @returns Array of patterns or empty array if file doesn't exist
   */
  static readPatterns(sourceDir: string): string[] {
    const gitignorePath = path.join(sourceDir, '.gitignore');

    if (!fs.existsSync(gitignorePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
    } catch {
      return [];
    }
  }
}
