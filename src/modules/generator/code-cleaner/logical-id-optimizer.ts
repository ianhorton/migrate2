import { ClassifiedResource } from '../../../types';

interface Override {
  logicalId: string;
  fullMatch: string;
  index: number;
}

interface OptimizationResult {
  code: string;
  metrics: {
    totalOverrides: number;
    overridesRemoved: number;
    overridesKept: number;
    reductionPercentage: number;
  };
}

/**
 * Optimizes logical ID overrides by removing unnecessary overrideLogicalId() calls
 * based on resource configuration (suppressLogicalIdOverride, needsImport flags)
 */
export class LogicalIdOptimizer {
  private resourceMap: Map<string, ClassifiedResource>;

  constructor(private resources: ClassifiedResource[]) {
    // Create a map for O(1) lookup
    this.resourceMap = new Map(
      resources.map(resource => [resource.LogicalId, resource])
    );
  }

  /**
   * Main optimization method - removes unnecessary logical ID overrides
   */
  public optimizeLogicalIds(code: string): OptimizationResult {
    const overrides = this.findOverrides(code);
    let optimizedCode = code;
    let overridesRemoved = 0;
    let overridesKept = 0;

    // Process overrides in reverse order to maintain string indices
    const sortedOverrides = [...overrides].sort((a, b) => b.index - a.index);

    for (const override of sortedOverrides) {
      const resource = this.getResourceForLogicalId(override.logicalId);

      if (!resource) {
        // Keep override if we can't find the resource (safety)
        overridesKept++;
        continue;
      }

      if (this.shouldRemoveOverride(resource)) {
        // Remove the override call and associated comments
        optimizedCode = this.removeOverride(optimizedCode, override);
        overridesRemoved++;
      } else {
        overridesKept++;
      }
    }

    const totalOverrides = overrides.length;
    const reductionPercentage = totalOverrides > 0
      ? Math.round((overridesRemoved / totalOverrides) * 100)
      : 0;

    return {
      code: optimizedCode,
      metrics: {
        totalOverrides,
        overridesRemoved,
        overridesKept,
        reductionPercentage
      }
    };
  }

  /**
   * Finds all overrideLogicalId calls in the code
   */
  private findOverrides(code: string): Override[] {
    const overrides: Override[] = [];
    const regex = /\.overrideLogicalId\(['"]([^'"]+)['"]\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(code)) !== null) {
      overrides.push({
        logicalId: match[1],
        fullMatch: match[0],
        index: match.index
      });
    }

    return overrides;
  }

  /**
   * Maps logical ID to resource
   */
  private getResourceForLogicalId(logicalId: string): ClassifiedResource | undefined {
    return this.resourceMap.get(logicalId);
  }

  /**
   * Determines if an override should be removed based on resource configuration
   */
  private shouldRemoveOverride(resource: ClassifiedResource): boolean {
    // Never remove overrides for imported resources
    if (resource.needsImport) {
      return false;
    }

    // Remove override if suppressLogicalIdOverride is explicitly true
    return resource.suppressLogicalIdOverride === true;
  }

  /**
   * Removes an override call and its associated comments
   */
  private removeOverride(code: string, override: Override): string {
    // Find the full statement (including the line)
    const lines = code.split('\n');
    let result = code;

    // Find the line containing the override
    let lineIndex = 0;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= override.index) {
        lineIndex = i;
        break;
      }
      charCount += lines[i].length + 1; // +1 for newline
    }

    // Check if previous line is a comment related to this override
    const currentLine = lines[lineIndex];
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

    // Remove associated comment if it looks related
    if (this.isRelatedComment(previousLine, override.logicalId)) {
      lines.splice(lineIndex - 1, 2); // Remove both comment and override line
    } else {
      lines.splice(lineIndex, 1); // Remove just the override line
    }

    result = lines.join('\n');

    // Clean up any resulting empty lines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * Removes comments associated with an override
   */
  private removeRelatedComments(code: string, overrideStatement: string): string {
    const lines = code.split('\n');
    const overrideLineIndex = lines.findIndex(line => line.includes(overrideStatement));

    if (overrideLineIndex === -1) {
      return code;
    }

    // Check previous line for comment
    if (overrideLineIndex > 0) {
      const previousLine = lines[overrideLineIndex - 1].trim();
      if (previousLine.startsWith('//') || previousLine.startsWith('/*')) {
        // Check if comment mentions "override", "logical", "ID", or "CloudFormation"
        const commentKeywords = /override|logical|id|cloudformation/i;
        if (commentKeywords.test(previousLine)) {
          lines.splice(overrideLineIndex - 1, 1);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Checks if a comment line is related to an override
   */
  private isRelatedComment(line: string, logicalId: string): boolean {
    const trimmed = line.trim();

    // Not a comment
    if (!trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      return false;
    }

    // Check for keywords related to overrides
    const keywords = /override|logical|id|cloudformation|compatibility/i;
    return keywords.test(trimmed);
  }
}
