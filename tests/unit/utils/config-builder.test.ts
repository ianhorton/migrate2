/**
 * Sprint 1: Path Resolution Tests (RED Phase - TDD)
 *
 * These tests are written BEFORE implementation.
 * They should all FAIL initially.
 *
 * Purpose: Test the ConfigBuilder's path resolution logic for in-place CDK generation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as path from 'path';
import { ConfigBuilder } from '../../../src/utils/config-builder';

describe('ConfigBuilder - Path Resolution', () => {
  let builder: ConfigBuilder;

  beforeEach(() => {
    builder = new ConfigBuilder();
  });

  describe('resolveTargetDirectory', () => {
    /**
     * Test 1: Target provided explicitly
     *
     * Given: source='/path/to/sls', target='/path/to/cdk'
     * When: resolveTargetDirectory() called
     * Then: Returns '/path/to/cdk' (unchanged)
     */
    it('should use explicit target when provided', () => {
      const sourceDir = '/path/to/sls';
      const targetDir = '/path/to/cdk';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: targetDir
      });

      expect(result).toBe(path.resolve(targetDir));
    });

    /**
     * Test 2: Target missing (in-place mode)
     *
     * Given: source='/path/to/sls', target=undefined
     * When: resolveTargetDirectory() called
     * Then: Returns '/path/to/sls/cdk'
     */
    it('should return <source>/cdk when target not provided', () => {
      const sourceDir = '/path/to/sls';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      expect(result).toBe(path.join(path.resolve(sourceDir), 'cdk'));
    });

    /**
     * Test 3: Relative paths resolved correctly
     *
     * Given: source='../sls-project', target=undefined
     * When: resolveTargetDirectory() called
     * Then: Returns absolute path to '../sls-project/cdk'
     */
    it('should handle relative source paths correctly', () => {
      const sourceDir = '../sls-project';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      const expectedPath = path.join(path.resolve(sourceDir), 'cdk');
      expect(result).toBe(expectedPath);
      expect(path.isAbsolute(result)).toBe(true);
    });

    /**
     * Test 4: Absolute paths handled correctly
     *
     * Given: source='/absolute/path/sls', target=undefined
     * When: resolveTargetDirectory() called
     * Then: Returns '/absolute/path/sls/cdk'
     */
    it('should handle absolute source paths correctly', () => {
      const sourceDir = '/absolute/path/sls';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      expect(result).toBe('/absolute/path/sls/cdk');
    });

    /**
     * Test 5: Empty string target treated as missing
     *
     * Given: source='/path/to/sls', target=''
     * When: resolveTargetDirectory() called
     * Then: Returns '/path/to/sls/cdk'
     */
    it('should treat empty string target as missing', () => {
      const sourceDir = '/path/to/sls';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: ''
      });

      expect(result).toBe('/path/to/sls/cdk');
    });

    /**
     * Test 6: Whitespace-only target treated as missing
     *
     * Given: source='/path/to/sls', target='   '
     * When: resolveTargetDirectory() called
     * Then: Returns '/path/to/sls/cdk'
     */
    it('should treat whitespace-only target as missing', () => {
      const sourceDir = '/path/to/sls';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: '   '
      });

      expect(result).toBe('/path/to/sls/cdk');
    });

    /**
     * Test 7: Current directory source
     *
     * Given: source='.', target=undefined
     * When: resolveTargetDirectory() called
     * Then: Returns '<absolute-cwd>/cdk'
     */
    it('should handle current directory as source', () => {
      const sourceDir = '.';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      expect(result).toBe(path.join(process.cwd(), 'cdk'));
      expect(path.isAbsolute(result)).toBe(true);
    });

    /**
     * Additional Test: Path normalization with trailing slashes
     */
    it('should normalize paths with trailing slashes', () => {
      const sourceDir = './my-app/';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      const expectedPath = path.join(path.resolve('./my-app'), 'cdk');
      expect(path.normalize(result)).toBe(path.normalize(expectedPath));
    });

    /**
     * Additional Test: Relative target paths should be resolved
     */
    it('should resolve relative target paths to absolute', () => {
      const sourceDir = './my-app';
      const targetDir = './cdk-output';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: targetDir
      });

      expect(result).toBe(path.resolve(targetDir));
      expect(path.isAbsolute(result)).toBe(true);
    });

    /**
     * Additional Test: Deeply nested paths
     */
    it('should handle deeply nested source directories', () => {
      const sourceDir = './a/b/c/d/e/f/g/h/i/j/project';

      const result = builder.resolveTargetDirectory({
        source: sourceDir,
        target: undefined
      });

      const expectedPath = path.join(path.resolve(sourceDir), 'cdk');
      expect(result).toBe(expectedPath);
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('detectInPlaceMode', () => {
    /**
     * Test: In-place mode detection when target not provided
     */
    it('should detect in-place mode when target not provided', () => {
      const isInPlace = builder.detectInPlaceMode({
        source: './my-app',
        target: undefined
      });

      expect(isInPlace).toBe(true);
    });

    /**
     * Test: Explicit mode detection when target provided
     */
    it('should detect explicit mode when target provided', () => {
      const isInPlace = builder.detectInPlaceMode({
        source: './my-app',
        target: './cdk-output'
      });

      expect(isInPlace).toBe(false);
    });

    /**
     * Test: Empty string target should be in-place mode
     */
    it('should detect in-place mode for empty string target', () => {
      const isInPlace = builder.detectInPlaceMode({
        source: './my-app',
        target: ''
      });

      expect(isInPlace).toBe(true);
    });

    /**
     * Test: Whitespace target should be in-place mode
     */
    it('should detect in-place mode for whitespace-only target', () => {
      const isInPlace = builder.detectInPlaceMode({
        source: './my-app',
        target: '   '
      });

      expect(isInPlace).toBe(true);
    });
  });

  describe('buildConfig', () => {
    /**
     * Test: Build in-place configuration
     */
    it('should build complete configuration for in-place mode', () => {
      const config = builder.buildConfig({
        source: './my-app',
        target: undefined,
        dryRun: false
      });

      expect(config.sourceDir).toBe(path.resolve('./my-app'));
      expect(config.targetDir).toBe(path.join(path.resolve('./my-app'), 'cdk'));
      expect(config.isInPlace).toBe(true);
      expect(config.dryRun).toBe(false);
    });

    /**
     * Test: Build explicit target configuration
     */
    it('should build complete configuration for explicit target mode', () => {
      const config = builder.buildConfig({
        source: './my-app',
        target: './cdk-output',
        dryRun: true
      });

      expect(config.sourceDir).toBe(path.resolve('./my-app'));
      expect(config.targetDir).toBe(path.resolve('./cdk-output'));
      expect(config.isInPlace).toBe(false);
      expect(config.dryRun).toBe(true);
    });

    /**
     * Test: Default dryRun to false if not provided
     */
    it('should default dryRun to false when not provided', () => {
      const config = builder.buildConfig({
        source: './my-app',
        target: undefined
      });

      expect(config.dryRun).toBe(false);
    });
  });
});
