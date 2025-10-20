/**
 * Tests for Scanner Module
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Scanner } from '../../../src/modules/scanner/index';
import { ScannerConfig } from '../../../src/types/migration';

describe('Scanner', () => {
  let scanner: Scanner;
  let config: ScannerConfig;

  beforeEach(() => {
    config = {
      serverlessPath: '/path/to/serverless',
      stage: 'dev',
      region: 'us-east-1',
    };
    scanner = new Scanner(config);
  });

  describe('constructor', () => {
    it('should create scanner instance with config', () => {
      expect(scanner).toBeInstanceOf(Scanner);
    });
  });

  describe('classifyResources', () => {
    it('should classify resources correctly', () => {
      const resources = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'RECREATE' as const,
          source: 'explicit' as const,
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE' as const,
          source: 'explicit' as const,
          dependencies: [],
        },
      ];

      const result = scanner.classifyResources(resources);

      expect(result.toImport).toHaveLength(1);
      expect(result.toRecreate).toHaveLength(1);
      expect(result.toImport[0].type).toBe('AWS::DynamoDB::Table');
      expect(result.toRecreate[0].type).toBe('AWS::Lambda::Function');
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build dependency graph from template', () => {
      const template = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          Function1: {
            Type: 'AWS::Lambda::Function',
            Properties: { FunctionName: 'my-function' },
            DependsOn: 'Table1',
          },
        },
      };

      const resources = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'IMPORT' as const,
          source: 'explicit' as const,
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE' as const,
          source: 'explicit' as const,
          dependencies: [],
        },
      ];

      const graph = scanner.buildDependencyGraph(resources, template);

      expect(graph.nodes.size).toBe(2);
      expect(graph.edges.get('Function1')?.has('Table1')).toBe(true);
    });
  });
});
