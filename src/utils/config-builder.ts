import * as path from 'path';

/**
 * Configuration options for ConfigBuilder
 */
export interface ConfigBuilderOptions {
  source: string;
  target?: string;
  dryRun?: boolean;
}

/**
 * Resolved migration configuration
 */
export interface ResolvedConfig {
  sourceDir: string;      // Absolute path to source
  targetDir: string;      // Absolute path to target
  isInPlace: boolean;     // True if using default <source>/cdk
  dryRun: boolean;        // Dry run mode
}

/**
 * ConfigBuilder - Utility class for resolving migration configuration paths
 *
 * Implements path resolution logic for in-place CDK generation feature.
 * Handles both in-place mode (<source>/cdk) and explicit target mode.
 */
export class ConfigBuilder {
  /**
   * Resolve target directory for CDK output
   *
   * Business Rules:
   * - If target is provided and non-empty: use it
   * - If target is missing/empty: default to <source>/cdk
   * - Always return absolute paths
   *
   * @param options - Configuration options with source and optional target
   * @returns Absolute path to CDK output directory
   *
   * @example
   * // In-place mode (target not provided)
   * builder.resolveTargetDirectory({ source: './my-app' })
   * // Returns: /absolute/path/to/my-app/cdk
   *
   * @example
   * // Explicit target mode
   * builder.resolveTargetDirectory({ source: './my-app', target: './cdk-output' })
   * // Returns: /absolute/path/to/cdk-output
   */
  resolveTargetDirectory(options: ConfigBuilderOptions): string {
    const { source, target } = options;

    // Normalize target: handle undefined, null, empty string, whitespace-only
    const normalizedTarget = target?.trim();

    if (normalizedTarget) {
      // Explicit target provided - resolve to absolute path
      return path.resolve(normalizedTarget);
    }

    // Default: in-place mode - create <source>/cdk
    return path.resolve(source, 'cdk');
  }

  /**
   * Detect if migration is in in-place mode
   *
   * @param options - Configuration options
   * @returns True if in-place mode, false if explicit target mode
   *
   * @example
   * builder.detectInPlaceMode({ source: './my-app' })
   * // Returns: true
   *
   * @example
   * builder.detectInPlaceMode({ source: './my-app', target: './cdk-out' })
   * // Returns: false
   */
  detectInPlaceMode(options: ConfigBuilderOptions): boolean {
    const normalizedTarget = options.target?.trim();
    return !normalizedTarget;
  }

  /**
   * Build complete resolved configuration
   *
   * @param options - Configuration options
   * @returns Complete resolved configuration with absolute paths
   *
   * @example
   * builder.buildConfig({ source: './my-app', dryRun: false })
   * // Returns: {
   * //   sourceDir: '/absolute/path/to/my-app',
   * //   targetDir: '/absolute/path/to/my-app/cdk',
   * //   isInPlace: true,
   * //   dryRun: false
   * // }
   */
  buildConfig(options: ConfigBuilderOptions): ResolvedConfig {
    const sourceDir = path.resolve(options.source);
    const targetDir = this.resolveTargetDirectory(options);
    const isInPlace = this.detectInPlaceMode(options);
    const dryRun = options.dryRun ?? false;

    return {
      sourceDir,
      targetDir,
      isInPlace,
      dryRun
    };
  }
}
