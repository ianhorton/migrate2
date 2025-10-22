import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { GitignoreManager, GitignoreResult } from '../../../src/utils/gitignore-manager';

describe('GitignoreManager', () => {
  let testDir: string;

  beforeEach(() => {
    // Create unique test directory for each test
    testDir = path.join(__dirname, 'test-gitignore-' + Date.now() + '-' + Math.random().toString(36).substring(7));
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ensureCdkIgnored', () => {
    it('should create .gitignore with /cdk/ when none exists', () => {
      // Arrange: test directory exists but no .gitignore
      const gitignorePath = path.join(testDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(false);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: .gitignore created with /cdk/ entry
      expect(result.updated).toBe(true);
      expect(result.created).toBe(true);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify file was created
      expect(fs.existsSync(gitignorePath)).toBe(true);

      // Verify content contains /cdk/
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('/cdk/');
    });

    it('should append /cdk/ to existing .gitignore that is missing it', () => {
      // Arrange: create .gitignore with existing content
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = 'node_modules/\n.env\ndist/\n';
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: .gitignore updated with /cdk/ appended
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify content contains both old and new entries
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.env');
      expect(content).toContain('dist/');
      expect(content).toContain('/cdk/');

      // Verify /cdk/ is on its own line
      const lines = content.split('\n').map(l => l.trim()).filter(l => l);
      expect(lines).toContain('/cdk/');
    });

    it('should skip update when .gitignore already contains /cdk/', () => {
      // Arrange: create .gitignore with /cdk/ already present
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = 'node_modules/\n/cdk/\n.env\n';
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: no changes made
      expect(result.updated).toBe(false);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify content unchanged
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toBe(existingContent);
    });

    it('should add /cdk/ when only /cdk (without trailing slash) exists', () => {
      // Arrange: create .gitignore with /cdk but not /cdk/
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = 'node_modules/\n/cdk\n.env\n';
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: /cdk/ added (both patterns should exist)
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify both /cdk and /cdk/ are present
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('/cdk\n'); // Original without slash
      expect(content).toContain('/cdk/'); // New with slash
    });

    it('should handle malformed .gitignore gracefully with error', () => {
      // Arrange: create .gitignore with read permission removed
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'some content');
      fs.chmodSync(gitignorePath, 0o000); // No read/write permissions

      // Act: attempt to ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: error returned
      expect(result.updated).toBe(false);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('permission');

      // Cleanup: restore permissions for cleanup
      fs.chmodSync(gitignorePath, 0o644);
    });

    it('should return error when directory has no write permissions', () => {
      // Arrange: remove write permission from test directory
      fs.chmodSync(testDir, 0o555); // Read and execute only

      // Act: attempt to ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: error returned
      expect(result.updated).toBe(false);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('permission');

      // Cleanup: restore permissions for cleanup
      fs.chmodSync(testDir, 0o755);
    });

    it('should return error when source directory does not exist', () => {
      // Arrange: use non-existent directory
      const nonExistentDir = path.join(testDir, 'does-not-exist-' + Math.random());
      expect(fs.existsSync(nonExistentDir)).toBe(false);

      // Act: attempt to ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(nonExistentDir);

      // Assert: error returned
      expect(result.updated).toBe(false);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not exist');
    });

    it('should preserve existing gitignore patterns and formatting', () => {
      // Arrange: create .gitignore with various patterns and comments
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = `# Build outputs
dist/
build/

# Dependencies
node_modules/
*.log

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
`;
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: content updated but existing patterns preserved
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify all original content preserved
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('# Build outputs');
      expect(content).toContain('dist/');
      expect(content).toContain('build/');
      expect(content).toContain('# Dependencies');
      expect(content).toContain('node_modules/');
      expect(content).toContain('*.log');
      expect(content).toContain('# Environment');
      expect(content).toContain('.env');
      expect(content).toContain('.env.local');
      expect(content).toContain('# IDE');
      expect(content).toContain('.vscode/');
      expect(content).toContain('.idea/');
      expect(content).toContain('/cdk/');
    });

    it('should handle .gitignore with cdk/ pattern (without leading slash)', () => {
      // Arrange: create .gitignore with cdk/ but not /cdk/
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = 'node_modules/\ncdk/\n.env\n';
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: /cdk/ added (both patterns should exist)
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify both cdk/ and /cdk/ are present
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('cdk/\n'); // Original without leading slash
      expect(content).toContain('/cdk/'); // New with leading slash
    });

    it('should handle empty .gitignore file', () => {
      // Arrange: create empty .gitignore
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, '');

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: .gitignore updated with /cdk/ entry
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify content contains /cdk/
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content.trim()).toBe('/cdk/');
    });

    it('should handle .gitignore with only whitespace', () => {
      // Arrange: create .gitignore with only whitespace
      const gitignorePath = path.join(testDir, '.gitignore');
      fs.writeFileSync(gitignorePath, '\n\n  \n\t\n  ');

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: .gitignore updated with /cdk/ entry
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify content contains /cdk/
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('/cdk/');
    });

    it('should handle .gitignore with /cdk/ in a comment', () => {
      // Arrange: create .gitignore with /cdk/ only in comment
      const gitignorePath = path.join(testDir, '.gitignore');
      const existingContent = 'node_modules/\n# /cdk/ directory\n.env\n';
      fs.writeFileSync(gitignorePath, existingContent);

      // Act: ensure /cdk/ is in gitignore
      const result: GitignoreResult = GitignoreManager.ensureCdkIgnored(testDir);

      // Assert: /cdk/ added as actual pattern (comment doesn't count)
      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(result.alreadyExists).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify both comment and actual pattern exist
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('# /cdk/ directory'); // Comment preserved

      // Check for /cdk/ as standalone pattern (not just in comment)
      const lines = content.split('\n').map(l => l.trim());
      const nonCommentLines = lines.filter(l => l && !l.startsWith('#'));
      expect(nonCommentLines).toContain('/cdk/');
    });
  });
});
