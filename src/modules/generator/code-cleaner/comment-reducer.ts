/**
 * CommentReducer - Sprint 3 Phase 1
 * Reduces comment verbosity by 90% while preserving important comments
 */

import { ClassifiedResource } from '../../../types';

/**
 * Represents a comment found in code
 */
export interface Comment {
  text: string;       // Full comment text including //
  content: string;    // Comment content without //
  line: number;       // Line number (1-indexed)
  startPos: number;   // Character offset start
  endPos: number;     // Character offset end
  type: 'single' | 'multi'; // Comment type
}

/**
 * Reduces comment verbosity by 90% while preserving important comments
 */
export class CommentReducer {
  // Patterns to always preserve
  private static readonly PRESERVE_PATTERNS: RegExp[] = [
    /TODO:/i,
    /FIXME:/i,
    /HACK:/i,
    /NOTE:/i,
    /WARNING:/i,
    /IMPORTANT:(?!\s+This\s+resource)/i  // IMPORTANT but not "This resource"
  ];

  // Patterns to always remove
  private static readonly REMOVE_PATTERNS: RegExp[] = [
    /^AWS::[A-Z][a-zA-Z0-9]*::[A-Z][a-zA-Z0-9]*$/,  // CloudFormation types
  ];

  private resourceMap: Map<string, ClassifiedResource>;

  constructor(
    private resources: ClassifiedResource[],
    private customPreservePatterns: RegExp[] = []
  ) {
    // Build resource map for O(1) lookups
    this.resourceMap = new Map(
      resources.map(resource => [resource.LogicalId, resource])
    );
  }

  /**
   * Reduces comments by 90% while preserving important ones
   */
  public reduceComments(code: string): { code: string; metrics: { totalComments: number; commentsRemoved: number; commentsKept: number; reductionPercentage: number } } {
    // Extract all comments
    const comments = this.extractComments(code);

    // Build construct-to-resource mapping
    const constructMap = this.buildConstructToResourceMap(code);

    // Classify each comment
    const commentsToRemove: Comment[] = [];
    for (const comment of comments) {
      const shouldKeep = this.shouldPreserveComment(comment, constructMap, code);
      if (!shouldKeep) {
        commentsToRemove.push(comment);
      }
    }

    // Remove comments in reverse order (preserve character offsets)
    let result = code;
    for (let i = commentsToRemove.length - 1; i >= 0; i--) {
      result = this.removeComment(result, commentsToRemove[i]);
    }

    const totalComments = comments.length;
    const commentsRemoved = commentsToRemove.length;
    const commentsKept = totalComments - commentsRemoved;
    const reductionPercentage = totalComments > 0
      ? Math.round((commentsRemoved / totalComments) * 100)
      : 0;

    return {
      code: result,
      metrics: {
        totalComments,
        commentsRemoved,
        commentsKept,
        reductionPercentage
      }
    };
  }

  /**
   * Extracts all comments from code
   */
  private extractComments(code: string): Comment[] {
    const comments: Comment[] = [];
    const lines = code.split('\n');
    let charOffset = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Single-line comment (only if line starts with //)
      const singleMatch = line.match(/^\s*(\/\/.*)$/);
      if (singleMatch) {
        const commentText = singleMatch[1];
        const content = commentText.substring(2).trim();

        comments.push({
          text: commentText,
          content,
          line: lineNum + 1,
          startPos: charOffset + line.indexOf('//'),
          endPos: charOffset + line.length,
          type: 'single'
        });
      }

      // Multi-line comment start
      if (line.includes('/*')) {
        const startIdx = line.indexOf('/*');
        let endLineNum = lineNum;

        // Find closing */
        while (endLineNum < lines.length && !lines[endLineNum].includes('*/')) {
          endLineNum++;
        }

        if (endLineNum < lines.length) {
          const commentLines = lines.slice(lineNum, endLineNum + 1);
          const commentText = commentLines.join('\n');
          const content = commentText
            .replace(/\/\*/g, '')
            .replace(/\*\//g, '')
            .replace(/\*/g, '')
            .trim();

          comments.push({
            text: commentText,
            content,
            line: lineNum + 1,
            startPos: charOffset + startIdx,
            endPos: charOffset + commentText.length,
            type: 'multi'
          });

          // Skip to end of multi-line comment
          lineNum = endLineNum;
        }
      }

      charOffset += line.length + 1; // +1 for newline
    }

    return comments;
  }

  /**
   * Determines if a comment should be preserved
   */
  private shouldPreserveComment(
    comment: Comment,
    constructMap: Map<string, ClassifiedResource>,
    fullCode: string
  ): boolean {
    const content = comment.content;

    // Rule 1: Always preserve action-oriented comments
    for (const pattern of CommentReducer.PRESERVE_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Rule 1b: Custom preserve patterns
    for (const pattern of this.customPreservePatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Rule 2: Always remove type comments
    for (const pattern of CommentReducer.REMOVE_PATTERNS) {
      if (pattern.test(content.trim())) {
        return false;
      }
    }

    // Rule 3: Check import-related comments
    if (content.toUpperCase().includes('IMPORTANT') &&
        content.toLowerCase().includes('import')) {
      // Find associated resource
      const resource = this.findAssociatedResource(comment, constructMap, fullCode);

      if (!resource) {
        // Can't determine - keep defensively
        return true;
      }

      // Check suppressComments flag
      return !resource.suppressComments;
    }

    // Rule 4: Preserve multi-line descriptive comments (JSDoc, etc.)
    if (comment.type === 'multi' && comment.content.length > 50) {
      return true;
    }

    // Default: Remove single-line comments without special markers
    return false;
  }

  /**
   * Finds the resource associated with a comment
   * (looks at the construct definition on the next non-comment line)
   */
  private findAssociatedResource(
    comment: Comment,
    constructMap: Map<string, ClassifiedResource>,
    fullCode: string
  ): ClassifiedResource | undefined {
    // Get all code lines
    const allLines = fullCode.split('\n');

    // Find the line after this comment (comment.line is 1-indexed)
    const commentLineIdx = comment.line - 1;

    // Look at lines after the comment to find a construct definition
    // Search up to 5 lines after the comment
    for (let i = commentLineIdx + 1; i < Math.min(commentLineIdx + 6, allLines.length); i++) {
      const line = allLines[i];

      // Pattern: new Type(this, 'LogicalId'
      // Allow dots in constructor type (e.g., lambda.Function, dynamodb.Table)
      const logicalIdPattern = /new\s+[\w.]+\(this,\s*['"](\w+)['"]/;
      const match = line.match(logicalIdPattern);

      if (match) {
        const logicalId = match[1];
        return constructMap.get(logicalId);
      }
    }

    return undefined;
  }

  /**
   * Builds a map of construct variable name to ClassifiedResource
   */
  private buildConstructToResourceMap(code: string): Map<string, ClassifiedResource> {
    const constructMap = new Map<string, ClassifiedResource>();

    // Pattern: const variableName = new ConstructType(this, 'LogicalId', ...)
    // Allow dots in constructor type (e.g., lambda.Function, dynamodb.Table)
    const pattern = /const\s+(\w+)\s*=\s*new\s+[\w.]+\(this,\s*['"](\w+)['"]/g;

    let match;
    while ((match = pattern.exec(code)) !== null) {
      const variableName = match[1];
      const logicalId = match[2];

      const resource = this.resourceMap.get(logicalId);
      if (resource) {
        constructMap.set(variableName, resource);
        constructMap.set(logicalId, resource); // Also map by LogicalId
      }
    }

    return constructMap;
  }

  /**
   * Removes a comment from code
   */
  private removeComment(code: string, comment: Comment): string {
    const lines = code.split('\n');
    const lineIdx = comment.line - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) {
      return code; // Safety check
    }

    if (comment.type === 'single') {
      const line = lines[lineIdx];

      // Remove entire line if it's only a comment
      if (line.trim().startsWith('//')) {
        lines[lineIdx] = '';
      } else {
        // Remove just the comment part
        const commentIdx = line.indexOf('//');
        if (commentIdx >= 0) {
          lines[lineIdx] = line.substring(0, commentIdx).trimEnd();
        }
      }
    } else {
      // Multi-line comment - remove all lines
      // Find the start and end of the multi-line comment
      const startLine = lineIdx;
      let endLine = startLine;

      // Find end of multi-line comment
      while (endLine < lines.length && !lines[endLine].includes('*/')) {
        endLine++;
      }

      // Remove all lines in the comment
      for (let i = startLine; i <= endLine && i < lines.length; i++) {
        lines[i] = '';
      }
    }

    return lines.join('\n');
  }
}
