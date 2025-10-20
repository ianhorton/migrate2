/**
 * Comprehensive tests for Editor Module
 */

import { Editor } from '../../../src/modules/editor';
import { CloudFormationTemplate } from '../../../src/types/migration';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EditorError, EditorErrorCode } from '../../../src/modules/editor/types';

describe('Editor Module', () => {
  let editor: Editor;
  let testTemplate: CloudFormationTemplate;
  const testBackupDir = path.join(__dirname, '.test-backups');

  beforeEach(() => {
    editor = new Editor({
      backupDirectory: testBackupDir,
      autoBackup: true,
      autoValidate: true,
    });

    // Create a sample template
    testTemplate = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'Test template',
      Resources: {
        Table1: {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: 'test-table-1',
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
          },
        },
        Table2: {
          Type: 'AWS::DynamoDB::Table',
          Properties: {
            TableName: 'test-table-2',
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
          },
          DependsOn: 'Table1',
        },
        LogGroup: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/lambda/test',
            RetentionInDays: 7,
          },
        },
        Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            BucketName: 'test-bucket',
          },
        },
      },
    };
  });

  afterEach(async () => {
    // Cleanup backup directory
    try {
      await fs.rm(testBackupDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('Template Loading and Saving', () => {
    const testTemplatePath = path.join(__dirname, 'test-template.json');

    beforeEach(async () => {
      await fs.writeFile(
        testTemplatePath,
        JSON.stringify(testTemplate, null, 2)
      );
    });

    afterEach(async () => {
      try {
        await fs.unlink(testTemplatePath);
      } catch {
        // Ignore errors
      }
    });

    it('should load a valid template', async () => {
      const loaded = await editor.loadTemplate(testTemplatePath);
      expect(loaded).toEqual(testTemplate);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        editor.loadTemplate('/non/existent/path.json')
      ).rejects.toThrow(EditorError);
    });

    it('should save template to file', async () => {
      const outputPath = path.join(__dirname, 'output-template.json');
      await editor.saveTemplate(testTemplate, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      const saved = JSON.parse(content);

      expect(saved).toEqual(testTemplate);

      await fs.unlink(outputPath);
    });
  });

  describe('Resource Removal', () => {
    it('should remove a single resource', async () => {
      const result = await editor.removeResource(
        testTemplate,
        'LogGroup',
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(result.removedResources).toEqual(['LogGroup']);
      expect(testTemplate.Resources.LogGroup).toBeUndefined();
    });

    it('should throw error when removing non-existent resource', async () => {
      await expect(
        editor.removeResource(testTemplate, 'NonExistent', {
          createBackup: false,
        })
      ).rejects.toThrow(EditorError);
    });

    it('should remove multiple resources', async () => {
      const result = await editor.removeResources(
        testTemplate,
        ['LogGroup', 'Bucket'],
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(result.removedResources).toContain('LogGroup');
      expect(result.removedResources).toContain('Bucket');
      expect(testTemplate.Resources.LogGroup).toBeUndefined();
      expect(testTemplate.Resources.Bucket).toBeUndefined();
    });

    it('should update dependencies when removing resource', async () => {
      const result = await editor.removeResource(
        testTemplate,
        'Table1',
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(result.updatedDependencies).toHaveLength(1);
      expect(result.updatedDependencies[0].resourceId).toBe('Table2');
      expect(result.updatedDependencies[0].before).toEqual(['Table1']);
      expect(result.updatedDependencies[0].after).toEqual([]);
      expect(testTemplate.Resources.Table2.DependsOn).toBeUndefined();
    });

    it('should support dry run mode', async () => {
      const originalResources = { ...testTemplate.Resources };

      const result = await editor.removeResource(
        testTemplate,
        'LogGroup',
        { dryRun: true, createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(testTemplate.Resources).toEqual(originalResources);
    });

    it('should create backup when removing resource', async () => {
      const result = await editor.removeResource(testTemplate, 'LogGroup');

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify backup exists
      const backupExists = await fs
        .access(result.backupPath!)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('should warn about dependent resources', async () => {
      const result = await editor.removeResource(
        testTemplate,
        'Table1',
        { createBackup: false }
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Table2');
    });
  });

  describe('Dependency Management', () => {
    it('should find explicit dependents', () => {
      const dependents = editor.findDependents(testTemplate, 'Table1');

      expect(dependents.explicit).toEqual(['Table2']);
      expect(dependents.implicit).toEqual([]);
    });

    it('should find dependencies', () => {
      const deps = editor.findDependencies(testTemplate, 'Table2');

      expect(deps).toEqual(['Table1']);
    });

    it('should build dependency graph', () => {
      const graph = editor.buildDependencyGraph(testTemplate);

      expect(graph.size).toBe(4);
      expect(graph.get('Table2')).toEqual(new Set(['Table1']));
      expect(graph.get('Table1')).toEqual(new Set());
    });

    it('should detect circular dependencies', () => {
      // Create circular dependency
      testTemplate.Resources.Table1.DependsOn = 'Table2';

      const cycles = editor.detectCircularDependencies(testTemplate);

      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('Table1');
      expect(cycles[0]).toContain('Table2');
    });

    it('should update dependencies for multiple removed resources', () => {
      testTemplate.Resources.Table3 = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: 'test-table-3',
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST',
        },
        DependsOn: ['Table1', 'Table2'],
      };

      const updates = editor.updateDependencies(testTemplate, ['Table1']);

      expect(updates).toHaveLength(2);

      const table2Update = updates.find((u) => u.resourceId === 'Table2');
      const table3Update = updates.find((u) => u.resourceId === 'Table3');

      expect(table2Update).toBeDefined();
      expect(table2Update!.before).toEqual(['Table1']);
      expect(table2Update!.after).toEqual([]);

      expect(table3Update).toBeDefined();
      expect(table3Update!.before).toEqual(['Table1', 'Table2']);
      expect(table3Update!.after).toEqual(['Table2']);
    });
  });

  describe('Template Validation', () => {
    it('should validate a correct template', () => {
      const result = editor.validateTemplate(testTemplate);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing Resources section', () => {
      const invalidTemplate = {
        AWSTemplateFormatVersion: '2010-09-09',
      } as any;

      const result = editor.validateTemplate(invalidTemplate);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing Resources section');
    });

    it('should detect missing resource Type', () => {
      testTemplate.Resources.InvalidResource = {
        Properties: {},
      } as any;

      const result = editor.validateTemplate(testTemplate);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('missing Type'))).toBe(true);
    });

    it('should detect invalid DependsOn reference', () => {
      testTemplate.Resources.Table2.DependsOn = 'NonExistent';

      const result = editor.validateTemplate(testTemplate);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('non-existent resource'))
      ).toBe(true);
    });

    it('should warn about missing AWSTemplateFormatVersion', () => {
      delete testTemplate.AWSTemplateFormatVersion;

      const result = editor.validateTemplate(testTemplate);

      expect(result.warnings.some((w) => w.includes('AWSTemplateFormatVersion'))).toBe(
        true
      );
    });
  });

  describe('Backup Management', () => {
    it('should create a backup', async () => {
      const backupPath = await editor.createBackup(testTemplate);

      expect(backupPath).toBeDefined();

      const backupExists = await fs
        .access(backupPath)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('should restore from backup', async () => {
      const backupPath = await editor.createBackup(testTemplate);
      const restored = await editor.restoreBackup(backupPath);

      expect(restored).toEqual(testTemplate);
    });

    it('should list backups', async () => {
      await editor.createBackup(testTemplate);
      await editor.createBackup(testTemplate);

      const backups = await editor.listBackups();

      expect(backups.length).toBeGreaterThanOrEqual(2);
      expect(backups[0].timestamp).toBeDefined();
    });

    it('should get latest backup', async () => {
      await editor.createBackup(testTemplate);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await editor.createBackup(testTemplate);

      const latest = await editor.getLatestBackup();

      expect(latest).toBeDefined();
      expect(latest!.filename).toContain('template-');
    });

    it('should cleanup old backups', async () => {
      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await editor.createBackup(testTemplate);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const deletedCount = await editor.cleanupBackups(2);

      expect(deletedCount).toBe(3);

      const remaining = await editor.listBackups();
      expect(remaining).toHaveLength(2);
    });
  });

  describe('Resource Addition and Update', () => {
    it('should add a new resource', async () => {
      const newResource = {
        Type: 'AWS::SNS::Topic',
        Properties: {
          TopicName: 'test-topic',
        },
      };

      const result = await editor.addResource(
        testTemplate,
        'TestTopic',
        newResource,
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(testTemplate.Resources.TestTopic).toBeDefined();
      expect(testTemplate.Resources.TestTopic.Type).toBe('AWS::SNS::Topic');
    });

    it('should update resource properties', async () => {
      const result = await editor.updateResource(
        testTemplate,
        'LogGroup',
        { RetentionInDays: 14 },
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(testTemplate.Resources.LogGroup.Properties.RetentionInDays).toBe(14);
    });

    it('should throw error when updating non-existent resource', async () => {
      await expect(
        editor.updateResource(
          testTemplate,
          'NonExistent',
          { foo: 'bar' },
          { createBackup: false }
        )
      ).rejects.toThrow(EditorError);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle batch removal with complex dependencies', async () => {
      // Add more resources with dependencies
      testTemplate.Resources.Table3 = {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: 'test-table-3',
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST',
        },
        DependsOn: 'Table2',
      };

      const result = await editor.removeResources(
        testTemplate,
        ['Table1', 'Table2', 'Table3'],
        { createBackup: false }
      );

      expect(result.success).toBe(true);
      expect(result.removedResources).toHaveLength(3);
      expect(testTemplate.Resources.Table1).toBeUndefined();
      expect(testTemplate.Resources.Table2).toBeUndefined();
      expect(testTemplate.Resources.Table3).toBeUndefined();
    });

    it('should preserve template after failed validation', async () => {
      const originalTemplate = JSON.parse(JSON.stringify(testTemplate));

      // Create invalid dependency
      testTemplate.Resources.Table2.DependsOn = 'NonExistent';

      await expect(
        editor.removeResource(testTemplate, 'LogGroup', {
          createBackup: false,
        })
      ).rejects.toThrow();

      // Template should be unchanged after failed validation
      expect(testTemplate.Resources.LogGroup).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw EditorError with correct code', async () => {
      try {
        await editor.removeResource(testTemplate, 'NonExistent', {
          createBackup: false,
        });
        fail('Should have thrown EditorError');
      } catch (error) {
        expect(error).toBeInstanceOf(EditorError);
        expect((error as EditorError).code).toBe(
          EditorErrorCode.RESOURCE_NOT_FOUND
        );
      }
    });

    it('should include details in error', async () => {
      try {
        await editor.removeResource(testTemplate, 'NonExistent', {
          createBackup: false,
        });
        fail('Should have thrown EditorError');
      } catch (error) {
        expect(error).toBeInstanceOf(EditorError);
        expect((error as EditorError).details).toEqual({
          logicalId: 'NonExistent',
        });
      }
    });
  });
});
