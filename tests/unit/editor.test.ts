/**
 * Editor Module Tests
 * Tests CloudFormation template editing, resource removal, and dependency updates
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EditorModule } from '@/modules/editor';

describe('EditorModule', () => {
  let editor: EditorModule;
  let fixturesPath: string;
  let testTemplate: any;

  beforeEach(async () => {
    editor = new EditorModule();
    fixturesPath = path.join(__dirname, '../fixtures');

    // Load test template
    const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
    testTemplate = JSON.parse(await fs.readFile(templatePath, 'utf-8'));
  });

  describe('loadTemplate', () => {
    it('should load valid CloudFormation template', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = await editor.loadTemplate(templatePath);

      expect(template).toHaveProperty('AWSTemplateFormatVersion');
      expect(template).toHaveProperty('Resources');
    });

    it('should throw on invalid JSON', async () => {
      const invalidPath = path.join(fixturesPath, 'invalid.json');
      await fs.writeFile(invalidPath, '{ invalid }');

      await expect(editor.loadTemplate(invalidPath)).rejects.toThrow();

      await fs.unlink(invalidPath);
    });

    it('should throw on missing file', async () => {
      await expect(
        editor.loadTemplate('/nonexistent/template.json')
      ).rejects.toThrow();
    });
  });

  describe('removeResource', () => {
    it('should remove resource from template', () => {
      const initialCount = Object.keys(testTemplate.Resources).length;

      const result = editor.removeResource(testTemplate, 'CounterLogGroup');

      expect(Object.keys(testTemplate.Resources).length).toBe(initialCount - 1);
      expect(testTemplate.Resources).not.toHaveProperty('CounterLogGroup');
      expect(result.success).toBe(true);
      expect(result.removedResources).toContain('CounterLogGroup');
    });

    it('should create backup before removal', () => {
      const result = editor.removeResource(testTemplate, 'CounterLogGroup');

      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).toContain('backup');
    });

    it('should throw when removing non-existent resource', () => {
      expect(() => {
        editor.removeResource(testTemplate, 'NonExistentResource');
      }).toThrow('Resource NonExistentResource not found');
    });

    it('should warn about dependent resources', () => {
      // CounterLambdaFunction depends on CounterLogGroup
      const result = editor.removeResource(testTemplate, 'CounterLogGroup');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('depend on CounterLogGroup');
    });

    it('should update DependsOn references (single dependency)', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: 'ResourceB'
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup'
          }
        }
      };

      const result = editor.removeResource(template, 'ResourceB');

      expect(template.Resources.ResourceA).not.toHaveProperty('DependsOn');
      expect(result.updatedDependencies).toHaveLength(1);
    });

    it('should update DependsOn references (array dependency)', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['ResourceB', 'ResourceC']
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup'
          },
          ResourceC: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      const result = editor.removeResource(template, 'ResourceB');

      expect(template.Resources.ResourceA.DependsOn).toEqual(['ResourceC']);
      expect(result.updatedDependencies).toHaveLength(1);
      expect(result.updatedDependencies[0].before).toContain('ResourceB');
      expect(result.updatedDependencies[0].after).not.toContain('ResourceB');
    });
  });

  describe('removeResources', () => {
    it('should remove multiple resources atomically', () => {
      const resourcesToRemove = ['CounterLogGroup', 'DataBucket'];
      const initialCount = Object.keys(testTemplate.Resources).length;

      const result = editor.removeResources(testTemplate, resourcesToRemove);

      expect(Object.keys(testTemplate.Resources).length).toBe(
        initialCount - resourcesToRemove.length
      );
      expect(result.success).toBe(true);
      expect(result.removedResources).toEqual(
        expect.arrayContaining(resourcesToRemove)
      );
    });

    it('should remove resources in dependency order', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: 'ResourceB'
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup',
            DependsOn: 'ResourceC'
          },
          ResourceC: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      const result = editor.removeResources(template, [
        'ResourceA',
        'ResourceB',
        'ResourceC'
      ]);

      expect(result.success).toBe(true);
      // Should remove in reverse dependency order: A, B, C
      expect(result.removedResources).toEqual(['ResourceA', 'ResourceB', 'ResourceC']);
    });

    it('should rollback on validation failure', () => {
      const originalTemplate = JSON.parse(JSON.stringify(testTemplate));

      // Mock validation to fail
      jest.spyOn(editor, 'validateTemplate').mockReturnValueOnce({
        valid: false,
        errors: ['Invalid template']
      });

      expect(() => {
        editor.removeResources(testTemplate, ['CounterLogGroup']);
      }).toThrow('Template validation failed');

      // Template should be unchanged
      expect(testTemplate).toEqual(originalTemplate);
    });
  });

  describe('updateDependencies', () => {
    it('should remove references to deleted resources', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['ResourceB', 'ResourceC']
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup'
          },
          ResourceC: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      editor.updateDependencies(template, ['ResourceB']);

      expect(template.Resources.ResourceA.DependsOn).toEqual(['ResourceC']);
    });

    it('should handle implicit dependencies (Ref)', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              Role: { Ref: 'ResourceB' }
            }
          },
          ResourceB: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      // Should detect that ResourceA references ResourceB
      const dependents = editor.findDependents(template, 'ResourceB');

      expect(dependents).toContain('ResourceA');
    });

    it('should handle Fn::GetAtt dependencies', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              RoleArn: {
                'Fn::GetAtt': ['ResourceB', 'Arn']
              }
            }
          },
          ResourceB: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      const dependents = editor.findDependents(template, 'ResourceB');

      expect(dependents).toContain('ResourceA');
    });
  });

  describe('validateTemplate', () => {
    it('should validate correct template', () => {
      const result = editor.validateTemplate(testTemplate);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing AWSTemplateFormatVersion', () => {
      const template = {
        Resources: {
          MyResource: { Type: 'AWS::DynamoDB::Table' }
        }
      };

      const result = editor.validateTemplate(template);

      expect(result.warnings).toContainEqual(
        expect.stringContaining('AWSTemplateFormatVersion')
      );
    });

    it('should detect missing Resources section', () => {
      const template = {
        AWSTemplateFormatVersion: '2010-09-09'
      };

      const result = editor.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Resources')
      );
    });

    it('should detect resource without Type', () => {
      const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          MyResource: {
            Properties: {}
          }
        }
      };

      const result = editor.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Type')
      );
    });

    it('should detect invalid DependsOn reference', () => {
      const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: 'NonExistentResource'
          }
        }
      };

      const result = editor.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('non-existent')
      );
    });

    it('should detect circular dependencies', () => {
      const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: 'ResourceB'
          },
          ResourceB: {
            Type: 'AWS::IAM::Role',
            DependsOn: 'ResourceA'
          }
        }
      };

      const result = editor.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Circular')
      );
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build graph from template', () => {
      const graph = editor.buildDependencyGraph(testTemplate);

      expect(graph).toBeInstanceOf(Map);
      expect(graph.size).toBeGreaterThan(0);
    });

    it('should include explicit dependencies', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: 'ResourceB'
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup'
          }
        }
      };

      const graph = editor.buildDependencyGraph(template);

      expect(graph.get('ResourceA')).toContainEqual('ResourceB');
    });

    it('should include implicit dependencies', () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              Role: { 'Fn::GetAtt': ['ResourceB', 'Arn'] }
            }
          },
          ResourceB: {
            Type: 'AWS::IAM::Role'
          }
        }
      };

      const graph = editor.buildDependencyGraph(template);

      expect(graph.get('ResourceA')).toContainEqual('ResourceB');
    });
  });

  describe('saveTemplate', () => {
    it('should save template to file', async () => {
      const outputPath = path.join(fixturesPath, 'test-output.json');

      await editor.saveTemplate(testTemplate, outputPath);

      const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
      expect(saved).toEqual(testTemplate);

      // Cleanup
      await fs.unlink(outputPath);
    });

    it('should format JSON with indentation', async () => {
      const outputPath = path.join(fixturesPath, 'test-output.json');

      await editor.saveTemplate(testTemplate, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('\n');
      expect(content).toContain('  '); // 2-space indentation

      // Cleanup
      await fs.unlink(outputPath);
    });
  });

  describe('Integration - Edit Flow', () => {
    it('should perform complete edit workflow', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const outputPath = path.join(fixturesPath, 'edited-template.json');

      // Load template
      const template = await editor.loadTemplate(templatePath);
      const initialCount = Object.keys(template.Resources).length;

      // Remove resources
      const resourcesToRemove = ['CounterLogGroup', 'DataBucket'];
      const result = editor.removeResources(template, resourcesToRemove);

      expect(result.success).toBe(true);
      expect(Object.keys(template.Resources).length).toBe(
        initialCount - resourcesToRemove.length
      );

      // Validate
      const validation = editor.validateTemplate(template);
      expect(validation.valid).toBe(true);

      // Save
      await editor.saveTemplate(template, outputPath);

      const saved = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
      expect(saved.Resources).not.toHaveProperty('CounterLogGroup');
      expect(saved.Resources).not.toHaveProperty('DataBucket');

      // Cleanup
      await fs.unlink(outputPath);
    });
  });
});
