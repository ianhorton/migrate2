/**
 * Sprint 2: Directory Validation Tests (GREEN Phase - TDD)
 *
 * These tests validate the DirectoryValidator implementation.
 * They should all PASS after implementing the directory validation logic.
 *
 * Purpose: Test directory validation for CDK generation safety.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DirectoryValidator, ValidationResult } from '../../../src/utils/directory-validator';

describe('DirectoryValidator - Sprint 2', () => {
  const testFixturesDir = path.join(__dirname, '__fixtures__');

  beforeEach(() => {
    // Create test fixtures directory
    if (!fs.existsSync(testFixturesDir)) {
      fs.mkdirSync(testFixturesDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test fixtures
    if (fs.existsSync(testFixturesDir)) {
      fs.rmSync(testFixturesDir, { recursive: true, force: true });
    }
  });

  describe('validateTargetDirectory', () => {
    it('should return valid=true, shouldCreate=true when directory does not exist', () => {
      const targetDir = path.join(testFixturesDir, 'new-cdk');

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(true);
      expect(result.shouldCreate).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid=true, shouldCreate=false, with warning when directory is empty', () => {
      const targetDir = path.join(testFixturesDir, 'empty-dir');
      fs.mkdirSync(targetDir, { recursive: true });

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(true);
      expect(result.shouldCreate).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('empty');
    });

    it('should return valid=false when directory contains CDK project (cdk.json)', () => {
      const targetDir = path.join(testFixturesDir, 'existing-cdk');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'cdk.json'), '{}');

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(false);
      expect(result.shouldCreate).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('CDK project');
    });

    it('should return valid=false when directory contains CDK project (package.json with aws-cdk-lib)', () => {
      const targetDir = path.join(testFixturesDir, 'cdk-with-package');
      fs.mkdirSync(targetDir, { recursive: true });

      const packageJson = {
        name: 'my-cdk-app',
        dependencies: {
          'aws-cdk-lib': '^2.0.0'
        }
      };
      fs.writeFileSync(
        path.join(targetDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(false);
      expect(result.shouldCreate).toBe(false);
      expect(result.error).toContain('CDK project');
    });

    it('should return valid=false when directory is not empty and has non-CDK files', () => {
      const targetDir = path.join(testFixturesDir, 'has-files');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'README.md'), '# Test');
      fs.writeFileSync(path.join(targetDir, 'index.js'), 'console.log("test")');

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(false);
      expect(result.shouldCreate).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not empty');
    });

    it('should return valid=true when force=true even if CDK project exists', () => {
      const targetDir = path.join(testFixturesDir, 'force-cdk');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'cdk.json'), '{}');

      const result = DirectoryValidator.validateTargetDirectory(targetDir, {
        force: true
      });

      expect(result.valid).toBe(true);
      expect(result.shouldCreate).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('CDK project');
      expect(result.warning).toContain('overwrite');
    });

    it('should return valid=true when force=true even if directory has files', () => {
      const targetDir = path.join(testFixturesDir, 'force-files');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'existing.txt'), 'data');

      const result = DirectoryValidator.validateTargetDirectory(targetDir, {
        force: true
      });

      expect(result.valid).toBe(true);
      expect(result.shouldCreate).toBe(false);
      expect(result.warning).toBeDefined();
    });

    it('should return shouldCreateParent=true when parent directory does not exist', () => {
      const targetDir = path.join(
        testFixturesDir,
        'nonexistent-parent',
        'nested',
        'cdk'
      );

      const result = DirectoryValidator.validateTargetDirectory(targetDir);

      expect(result.valid).toBe(true);
      expect(result.shouldCreate).toBe(true);
      expect(result.shouldCreateParent).toBe(true);
    });
  });
});
