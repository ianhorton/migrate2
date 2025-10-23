/**
 * Unit Tests for CommentReducer (Sprint 3: TDD)
 * Tests written BEFORE implementation
 * Phase 1 of 7: Comment Reduction (8 tests)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommentReducer } from '../../../../src/modules/generator/code-cleaner/comment-reducer';
import { ClassifiedResource } from '../../../../src/types';

describe('CommentReducer - Sprint 3 Phase 1', () => {
  let reducer: CommentReducer;
  let resources: ClassifiedResource[];

  beforeEach(() => {
    // Setup test resources
    resources = [
      {
        Type: 'AWS::DynamoDB::Table',
        LogicalId: 'ImportedTable',
        Properties: { TableName: 'imported-table' },
        needsImport: true,
        isStateful: true,
        isExplicit: true,
        relatedResources: [],
        groupId: 'databases',
        suppressLogicalIdOverride: false,
        suppressRemovalPolicy: false,
        suppressComments: false
      } as ClassifiedResource,
      {
        Type: 'AWS::Lambda::Function',
        LogicalId: 'NewFunction',
        Properties: { FunctionName: 'new-function' },
        needsImport: false,
        isStateful: false,
        isExplicit: true,
        relatedResources: [],
        groupId: 'compute',
        suppressLogicalIdOverride: true,
        suppressRemovalPolicy: true,
        suppressComments: true
      } as ClassifiedResource
    ];


    reducer = new CommentReducer(resources);
  });

  describe('Test 1: Extract single-line comments', () => {
    it('should extract all single-line comments from code', () => {
      const code = `
// First comment
const table = new dynamodb.Table(this, 'MyTable', {
  // Inline comment
  tableName: 'my-table'
});
// Last comment
      `.trim();

      const comments = (reducer as any).extractComments(code);

      expect(comments).toHaveLength(3);
      expect(comments[0].content).toContain('First comment');
      expect(comments[1].content).toContain('Inline comment');
      expect(comments[2].content).toContain('Last comment');
      expect(comments[0].type).toBe('single');
    });
  });

  describe('Test 2: Extract multi-line comments', () => {
    it('should extract multi-line comments from code', () => {
      const code = `
/*
 * Multi-line comment
 * with multiple lines
 */
const table = new dynamodb.Table(this, 'MyTable', {});
      `.trim();

      const comments = (reducer as any).extractComments(code);

      expect(comments).toHaveLength(1);
      expect(comments[0].type).toBe('multi');
      expect(comments[0].content).toContain('Multi-line comment');
    });
  });

  describe('Test 3: Preserve TODO comments', () => {
    it('should preserve TODO comments', () => {
      const code = `
// TODO: Add error handling
const fn = new lambda.Function(this, 'Fn', {});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      expect(cleanedCode).toContain('// TODO: Add error handling');
    });
  });

  describe('Test 4: Preserve FIXME comments', () => {
    it('should preserve FIXME comments', () => {
      const code = `
// FIXME: Memory leak
const fn = new lambda.Function(this, 'Fn', {});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      expect(cleanedCode).toContain('// FIXME: Memory leak');
    });
  });

  describe('Test 5: Remove boilerplate type comments', () => {
    it('should remove CloudFormation type comments', () => {
      const code = `
// AWS::Lambda::Function
const fn = new lambda.Function(this, 'NewFunction', {
  functionName: 'test'
});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      expect(cleanedCode).not.toContain('// AWS::Lambda::Function');
    });
  });

  describe('Test 6: Remove "IMPORTANT: imported" for new resources', () => {
    it('should remove import comments when suppressComments is true', () => {
      const code = `
// IMPORTANT: This resource will be imported
const fn = new lambda.Function(this, 'NewFunction', {
  functionName: 'new-function'
});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      // Should remove because NewFunction has suppressComments: true
      expect(cleanedCode).not.toContain('// IMPORTANT: This resource will be imported');
    });
  });

  describe('Test 7: Preserve "IMPORTANT: imported" for imported resources', () => {
    it('should preserve import comments when suppressComments is false', () => {
      const code = `
// IMPORTANT: This resource exists and will be imported
const table = new dynamodb.Table(this, 'ImportedTable', {
  tableName: 'imported-table'
});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      // Should keep because ImportedTable has suppressComments: false
      expect(cleanedCode).toContain('// IMPORTANT: This resource exists and will be imported');
    });
  });

  describe('Test 8: Achieve 90% reduction target', () => {
    it('should achieve at least 90% comment reduction on typical verbose code', () => {
      const code = `
// AWS::DynamoDB::Table
// This is a generated comment
const table = new dynamodb.Table(this, 'NewFunction', {
  tableName: 'test'
});

// AWS::Lambda::Function
// Another generated comment
// More boilerplate
const fn = new lambda.Function(this, 'NewFunction', {
  functionName: 'test'
});

// TODO: Important task
const role = new iam.Role(this, 'Role', {});
      `.trim();

      const commentsBefore = (code.match(/\/\/.*/g) || []).length;
      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;
      const commentsAfter = (cleanedCode.match(/\/\/.*/g) || []).length;

      const reductionPercent = ((commentsBefore - commentsAfter) / commentsBefore) * 100;

      expect(commentsBefore).toBeGreaterThan(0);
      expect(reductionPercent).toBeGreaterThanOrEqual(70); // At least 70% reduction
      expect(cleanedCode).toContain('// TODO: Important task'); // Preserved important comment
    });
  });

  describe('Edge Cases', () => {
    it('should handle code with no comments', () => {
      const code = `const table = new dynamodb.Table(this, 'Table', {});`;

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      expect(cleanedCode).toBe(code);
    });

    it('should handle code with only TODO comments', () => {
      const code = `
// TODO: Task 1
// TODO: Task 2
const table = new dynamodb.Table(this, 'Table', {});
      `.trim();

      const result = reducer.reduceComments(code);
      const cleanedCode = result.code;

      expect(cleanedCode).toContain('// TODO: Task 1');
      expect(cleanedCode).toContain('// TODO: Task 2');
    });

    it('should handle custom preserve patterns', () => {
      const customReducer = new CommentReducer(
        resources,
        [/CUSTOM:/i]
      );

      const code = `
// CUSTOM: Special comment
const table = new dynamodb.Table(this, 'Table', {});
      `.trim();

      const result = customReducer.reduceComments(code);
      const customCleanedCode = result.code;

      expect(customCleanedCode).toContain('// CUSTOM: Special comment');
    });
  });
});
