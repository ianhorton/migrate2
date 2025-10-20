/**
 * Scanner Module Tests
 * Tests resource discovery, classification, and dependency graph building
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ScannerModule } from '@/modules/scanner';
import { mockCloudFormationClient } from '@tests/mocks/aws-sdk';

describe('ScannerModule', () => {
  let scanner: ScannerModule;
  let fixturesPath: string;

  beforeEach(() => {
    scanner = new ScannerModule({
      path: './test-project',
      stackName: 'test-stack-dev',
      stage: 'dev',
      region: 'us-east-1'
    });

    fixturesPath = path.join(__dirname, '../fixtures');
  });

  describe('parseServerlessConfig', () => {
    it('should parse valid serverless.yml', async () => {
      const configPath = path.join(fixturesPath, 'serverless.yml');
      const config = await scanner.parseServerlessConfig(configPath);

      expect(config).toBeDefined();
      expect(config.service).toBe('migration-sandbox');
      expect(config.provider.runtime).toBe('nodejs18.x');
      expect(config.functions).toHaveProperty('counter');
    });

    it('should resolve variable substitutions', async () => {
      const configPath = path.join(fixturesPath, 'serverless.yml');
      const config = await scanner.parseServerlessConfig(configPath);

      expect(config.custom.tableName).toBe('migration-sandbox-table');
      expect(config.provider.environment.TABLE_NAME).toBe('migration-sandbox-table');
    });

    it('should extract custom CloudFormation resources', async () => {
      const configPath = path.join(fixturesPath, 'serverless.yml');
      const config = await scanner.parseServerlessConfig(configPath);

      expect(config.resources.Resources).toHaveProperty('counterTable');
      expect(config.resources.Resources).toHaveProperty('DataBucket');
      expect(config.resources.Resources.counterTable.Type).toBe('AWS::DynamoDB::Table');
    });

    it('should throw on invalid YAML', async () => {
      await expect(
        scanner.parseServerlessConfig('/nonexistent/serverless.yml')
      ).rejects.toThrow();
    });
  });

  describe('generateCloudFormation', () => {
    it('should execute serverless package command', async () => {
      const execMock = jest.spyOn(scanner as any, 'execCommand');
      execMock.mockResolvedValueOnce({ stdout: 'Success', stderr: '' });

      const template = await scanner.generateCloudFormation();

      expect(execMock).toHaveBeenCalledWith(
        expect.stringContaining('serverless package'),
        expect.any(Object)
      );
    });

    it('should parse generated CloudFormation template', async () => {
      // Mock the serverless package output
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(templateContent as any);
      jest.spyOn(scanner as any, 'execCommand').mockResolvedValueOnce({
        stdout: 'Success',
        stderr: ''
      });

      const template = await scanner.generateCloudFormation();

      expect(template).toHaveProperty('AWSTemplateFormatVersion');
      expect(template).toHaveProperty('Resources');
      expect(template.Resources).toHaveProperty('counterTable');
    });

    it('should handle serverless command failures', async () => {
      const execMock = jest.spyOn(scanner as any, 'execCommand');
      execMock.mockRejectedValueOnce(new Error('serverless command failed'));

      await expect(scanner.generateCloudFormation()).rejects.toThrow(
        'serverless command failed'
      );
    });
  });

  describe('discoverAllResources', () => {
    it('should identify all resources in CloudFormation template', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const inventory = await scanner.discoverAllResources(template);

      expect(inventory).toHaveProperty('explicit');
      expect(inventory).toHaveProperty('abstracted');
      expect(inventory.total).toBeGreaterThan(0);
      expect(inventory.resources.length).toBeGreaterThan(0);
    });

    it('should classify explicit vs abstracted resources', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const inventory = await scanner.discoverAllResources(template);

      // Explicit resources (defined in serverless.yml)
      const explicitResources = inventory.resources.filter(
        r => r.source === 'explicit'
      );
      expect(explicitResources).toContainEqual(
        expect.objectContaining({
          logicalId: 'counterTable',
          type: 'AWS::DynamoDB::Table'
        })
      );

      // Abstracted resources (auto-generated)
      const abstracted = inventory.resources.filter(
        r => r.source === 'abstracted'
      );
      expect(abstracted).toContainEqual(
        expect.objectContaining({
          logicalId: 'CounterLogGroup',
          type: 'AWS::Logs::LogGroup'
        })
      );
    });

    it('should classify stateful vs stateless resources', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const inventory = await scanner.discoverAllResources(template);

      expect(inventory).toHaveProperty('stateful');
      expect(inventory).toHaveProperty('stateless');
      expect(inventory.stateful).toBeGreaterThan(0);
      expect(inventory.stateless).toBeGreaterThan(0);
    });
  });

  describe('classifyResources', () => {
    it('should classify DynamoDB tables as IMPORT', () => {
      const resource = {
        logicalId: 'MyTable',
        type: 'AWS::DynamoDB::Table',
        properties: {}
      };

      const classification = scanner.classifyResource(resource);

      expect(classification).toBe('IMPORT');
    });

    it('should classify S3 buckets as IMPORT', () => {
      const resource = {
        logicalId: 'MyBucket',
        type: 'AWS::S3::Bucket',
        properties: {}
      };

      const classification = scanner.classifyResource(resource);

      expect(classification).toBe('IMPORT');
    });

    it('should classify LogGroups as IMPORT', () => {
      const resource = {
        logicalId: 'MyLogGroup',
        type: 'AWS::Logs::LogGroup',
        properties: {}
      };

      const classification = scanner.classifyResource(resource);

      expect(classification).toBe('IMPORT');
    });

    it('should classify Lambda functions as RECREATE', () => {
      const resource = {
        logicalId: 'MyFunction',
        type: 'AWS::Lambda::Function',
        properties: {}
      };

      const classification = scanner.classifyResource(resource);

      expect(classification).toBe('RECREATE');
    });

    it('should classify IAM roles as RECREATE', () => {
      const resource = {
        logicalId: 'MyRole',
        type: 'AWS::IAM::Role',
        properties: {}
      };

      const classification = scanner.classifyResource(resource);

      expect(classification).toBe('RECREATE');
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build dependency graph from CloudFormation template', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const graph = await scanner.buildDependencyGraph(template);

      expect(graph).toBeInstanceOf(Map);
      expect(graph.size).toBeGreaterThan(0);
    });

    it('should identify explicit dependencies (DependsOn)', async () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['ResourceB']
          },
          ResourceB: {
            Type: 'AWS::Logs::LogGroup'
          }
        }
      };

      const graph = await scanner.buildDependencyGraph(template);

      expect(graph.get('ResourceA')).toContain('ResourceB');
    });

    it('should identify implicit dependencies (Ref)', async () => {
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

      const graph = await scanner.buildDependencyGraph(template);

      expect(graph.get('ResourceA')).toContain('ResourceB');
    });

    it('should detect circular dependencies', async () => {
      const template = {
        Resources: {
          ResourceA: {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['ResourceB']
          },
          ResourceB: {
            Type: 'AWS::IAM::Role',
            DependsOn: ['ResourceA']
          }
        }
      };

      await expect(
        scanner.detectCircularDependencies(template)
      ).resolves.toEqual(['ResourceA', 'ResourceB', 'ResourceA']);
    });
  });

  describe('Integration - Full Scan', () => {
    it('should perform complete resource scan', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const result = await scanner.scan(template);

      expect(result).toHaveProperty('scan_id');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('resources');
      expect(result).toHaveProperty('inventory');
      expect(result).toHaveProperty('dependency_graph');

      // Verify resource counts
      expect(result.resources.total).toBeGreaterThan(0);
      expect(result.resources.explicit).toBeGreaterThan(0);
      expect(result.resources.abstracted).toBeGreaterThan(0);

      // Verify specific resources
      const tableResource = result.inventory.find(
        r => r.logical_id === 'counterTable'
      );
      expect(tableResource).toBeDefined();
      expect(tableResource?.classification).toBe('IMPORT');
    });

    it('should generate scan report', async () => {
      const templatePath = path.join(fixturesPath, 'cloudformation-sls.json');
      const template = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const result = await scanner.scan(template);
      const report = scanner.generateReport(result);

      expect(report).toContain('Scan Results');
      expect(report).toContain('Total Resources:');
      expect(report).toContain('IMPORT');
      expect(report).toContain('RECREATE');
    });
  });
});
