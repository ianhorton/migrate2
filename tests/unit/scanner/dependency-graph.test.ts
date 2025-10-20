/**
 * Tests for DependencyGraphBuilder
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DependencyGraphBuilder } from '../../../src/modules/scanner/dependency-graph';
import {
  CloudFormationTemplate,
  Resource,
  DependencyGraph,
} from '../../../src/types/migration';

describe('DependencyGraphBuilder', () => {
  let builder: DependencyGraphBuilder;

  beforeEach(() => {
    builder = new DependencyGraphBuilder();
  });

  describe('buildDependencyGraph', () => {
    it('should build graph from explicit DependsOn', () => {
      const template: CloudFormationTemplate = {
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

      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'IMPORT',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
      ];

      const graph = builder.buildDependencyGraph(template, resources);

      expect(graph.edges.get('Function1')?.has('Table1')).toBe(true);
      expect(graph.reverseEdges.get('Table1')?.has('Function1')).toBe(true);
    });

    it('should handle array DependsOn', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'table1' },
          },
          Bucket1: {
            Type: 'AWS::S3::Bucket',
            Properties: { BucketName: 'bucket1' },
          },
          Function1: {
            Type: 'AWS::Lambda::Function',
            Properties: { FunctionName: 'function1' },
            DependsOn: ['Table1', 'Bucket1'],
          },
        },
      };

      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'table1',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'IMPORT',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Bucket1',
          physicalId: 'bucket1',
          type: 'AWS::S3::Bucket',
          properties: {},
          classification: 'IMPORT',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'function1',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
      ];

      const graph = builder.buildDependencyGraph(template, resources);

      expect(graph.edges.get('Function1')?.has('Table1')).toBe(true);
      expect(graph.edges.get('Function1')?.has('Bucket1')).toBe(true);
    });

    it('should detect implicit dependencies from Ref', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          Function1: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'my-function',
              Environment: {
                Variables: {
                  TABLE_NAME: { Ref: 'Table1' },
                },
              },
            },
          },
        },
      };

      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'IMPORT',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
      ];

      const graph = builder.buildDependencyGraph(template, resources);

      expect(graph.edges.get('Function1')?.has('Table1')).toBe(true);
    });

    it('should detect implicit dependencies from GetAtt', () => {
      const template: CloudFormationTemplate = {
        Resources: {
          Table1: {
            Type: 'AWS::DynamoDB::Table',
            Properties: { TableName: 'my-table' },
          },
          Function1: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'my-function',
              Environment: {
                Variables: {
                  TABLE_ARN: { 'Fn::GetAtt': ['Table1', 'Arn'] },
                },
              },
            },
          },
        },
      };

      const resources: Resource[] = [
        {
          logicalId: 'Table1',
          physicalId: 'my-table',
          type: 'AWS::DynamoDB::Table',
          properties: {},
          classification: 'IMPORT',
          source: 'explicit',
          dependencies: [],
        },
        {
          logicalId: 'Function1',
          physicalId: 'my-function',
          type: 'AWS::Lambda::Function',
          properties: {},
          classification: 'RECREATE',
          source: 'explicit',
          dependencies: [],
        },
      ];

      const graph = builder.buildDependencyGraph(template, resources);

      expect(graph.edges.get('Function1')?.has('Table1')).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('should return resources in dependency order', () => {
      const graph: DependencyGraph = {
        nodes: new Map([
          ['A', {} as Resource],
          ['B', {} as Resource],
          ['C', {} as Resource],
        ]),
        edges: new Map([
          ['A', new Set()],
          ['B', new Set(['A'])],
          ['C', new Set(['B'])],
        ]),
        reverseEdges: new Map([
          ['A', new Set(['B'])],
          ['B', new Set(['C'])],
          ['C', new Set()],
        ]),
      };

      const sorted = builder.topologicalSort(graph);

      // A should come before B, B should come before C
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
    });

    it('should detect circular dependencies', () => {
      const graph: DependencyGraph = {
        nodes: new Map([
          ['A', {} as Resource],
          ['B', {} as Resource],
        ]),
        edges: new Map([
          ['A', new Set(['B'])],
          ['B', new Set(['A'])],
        ]),
        reverseEdges: new Map([
          ['A', new Set(['B'])],
          ['B', new Set(['A'])],
        ]),
      };

      expect(() => builder.topologicalSort(graph)).toThrow('Circular dependency');
    });
  });

  describe('findDependents', () => {
    it('should find all resources that depend on a given resource', () => {
      const graph: DependencyGraph = {
        nodes: new Map(),
        edges: new Map(),
        reverseEdges: new Map([
          ['Table1', new Set(['Function1', 'Function2'])],
        ]),
      };

      const dependents = builder.findDependents(graph, 'Table1');

      expect(dependents).toHaveLength(2);
      expect(dependents).toContain('Function1');
      expect(dependents).toContain('Function2');
    });

    it('should return empty array if no dependents', () => {
      const graph: DependencyGraph = {
        nodes: new Map(),
        edges: new Map(),
        reverseEdges: new Map([['Table1', new Set()]]),
      };

      const dependents = builder.findDependents(graph, 'Table1');

      expect(dependents).toHaveLength(0);
    });
  });

  describe('findAllDependencies', () => {
    it('should find all transitive dependencies', () => {
      const graph: DependencyGraph = {
        nodes: new Map(),
        edges: new Map([
          ['C', new Set(['B'])],
          ['B', new Set(['A'])],
          ['A', new Set()],
        ]),
        reverseEdges: new Map(),
      };

      const deps = builder.findAllDependencies(graph, 'C');

      expect(deps).toHaveLength(2);
      expect(deps).toContain('A');
      expect(deps).toContain('B');
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect simple circular dependency', () => {
      const graph: DependencyGraph = {
        nodes: new Map([
          ['A', {} as Resource],
          ['B', {} as Resource],
        ]),
        edges: new Map([
          ['A', new Set(['B'])],
          ['B', new Set(['A'])],
        ]),
        reverseEdges: new Map(),
      };

      const cycles = builder.detectCircularDependencies(graph);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty array if no cycles', () => {
      const graph: DependencyGraph = {
        nodes: new Map([
          ['A', {} as Resource],
          ['B', {} as Resource],
        ]),
        edges: new Map([
          ['A', new Set()],
          ['B', new Set(['A'])],
        ]),
        reverseEdges: new Map(),
      };

      const cycles = builder.detectCircularDependencies(graph);

      expect(cycles).toHaveLength(0);
    });
  });
});
