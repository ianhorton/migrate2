import { ClassifiedResource } from '../../../types';

interface PolicyCall {
  policy: 'RETAIN' | 'DESTROY' | 'SNAPSHOT';
  fullMatch: string;
  index: number;
  variableName: string;
}

interface OptimizationResult {
  code: string;
  metrics: {
    totalPolicies: number;
    policiesRemoved: number;
    policiesKept: number;
    reductionPercentage: number;
  };
}

/**
 * Optimizes removal policies by removing unnecessary applyRemovalPolicy() calls
 * based on resource configuration (suppressRemovalPolicy, isStateful flags)
 */
export class RemovalPolicyOptimizer {
  private resourceMap: Map<string, ClassifiedResource>;

  constructor(private resources: ClassifiedResource[]) {
    // Create a map for O(1) lookup by LogicalId
    this.resourceMap = new Map(
      resources.map(resource => [resource.LogicalId, resource])
    );
  }

  /**
   * Main optimization method - removes unnecessary removal policies
   */
  public optimizeRemovalPolicies(code: string): OptimizationResult {
    const policies = this.findPolicyCalls(code);
    let optimizedCode = code;
    let policiesRemoved = 0;
    let policiesKept = 0;

    // Process policies in reverse order to maintain string indices
    const sortedPolicies = [...policies].sort((a, b) => b.index - a.index);

    for (const policy of sortedPolicies) {
      const resource = this.getResourceForConstruct(code, policy.variableName);

      if (!resource) {
        // Keep policy if we can't find the resource (safety)
        policiesKept++;
        continue;
      }

      if (this.shouldRemovePolicy(resource)) {
        // Remove the policy call and associated comments
        optimizedCode = this.removePolicy(optimizedCode, policy);
        policiesRemoved++;
      } else {
        policiesKept++;
      }
    }

    const totalPolicies = policies.length;
    const reductionPercentage = totalPolicies > 0
      ? Math.round((policiesRemoved / totalPolicies) * 100)
      : 0;

    return {
      code: optimizedCode,
      metrics: {
        totalPolicies,
        policiesRemoved,
        policiesKept,
        reductionPercentage
      }
    };
  }

  /**
   * Finds all applyRemovalPolicy calls in the code
   */
  private findPolicyCalls(code: string): PolicyCall[] {
    const policies: PolicyCall[] = [];
    const regex = /(\w+)\.applyRemovalPolicy\(cdk\.RemovalPolicy\.(RETAIN|DESTROY|SNAPSHOT)\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(code)) !== null) {
      policies.push({
        policy: match[2] as 'RETAIN' | 'DESTROY' | 'SNAPSHOT',
        fullMatch: match[0],
        index: match.index,
        variableName: match[1]
      });
    }

    return policies;
  }

  /**
   * Maps construct variable name to resource by finding its declaration
   * e.g., "const table = new dynamodb.Table(this, 'StatefulTable', {});"
   */
  private getResourceForConstruct(code: string, variableName: string): ClassifiedResource | undefined {
    // Find the construct declaration for this variable
    // Pattern: const variableName = new SomeType(this, 'LogicalId', ...)
    const constructRegex = new RegExp(
      `const\\s+${variableName}\\s*=\\s*new\\s+[\\w.]+\\(this,\\s*['"]([^'"]+)['"]`,
      'g'
    );

    const match = constructRegex.exec(code);
    if (!match) {
      return undefined;
    }

    const logicalId = match[1];
    return this.resourceMap.get(logicalId);
  }

  /**
   * Determines if a policy should be removed based on resource configuration
   */
  private shouldRemovePolicy(resource: ClassifiedResource): boolean {
    // Remove policy if suppressRemovalPolicy is explicitly true
    if (resource.suppressRemovalPolicy === true) {
      return true;
    }

    // Remove policy for non-stateful resources (they don't need RETAIN)
    if (!resource.isStateful) {
      return true;
    }

    // Otherwise, keep the policy
    return false;
  }

  /**
   * Removes a policy call and its associated comments
   */
  private removePolicy(code: string, policy: PolicyCall): string {
    // Find the full statement (including the line)
    const lines = code.split('\n');
    let result = code;

    // Find the line containing the policy
    let lineIndex = 0;
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= policy.index) {
        lineIndex = i;
        break;
      }
      charCount += lines[i].length + 1; // +1 for newline
    }

    // Check if previous line is a comment related to this policy
    const currentLine = lines[lineIndex];
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

    // Remove associated comment if it looks related
    if (this.isRelatedComment(previousLine, policy.policy)) {
      lines.splice(lineIndex - 1, 2); // Remove both comment and policy line
    } else {
      lines.splice(lineIndex, 1); // Remove just the policy line
    }

    result = lines.join('\n');

    // Clean up any resulting empty lines (more than 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * Removes comments associated with a policy
   */
  private removeRelatedComments(code: string, policyStatement: string): string {
    const lines = code.split('\n');
    const policyLineIndex = lines.findIndex(line => line.includes(policyStatement));

    if (policyLineIndex === -1) {
      return code;
    }

    // Check previous line for comment
    if (policyLineIndex > 0) {
      const previousLine = lines[policyLineIndex - 1].trim();
      if (previousLine.startsWith('//') || previousLine.startsWith('/*')) {
        // Check if comment mentions policy-related keywords
        const commentKeywords = /retain|removal|policy|delete|destroy|safety|keep|preserve/i;
        if (commentKeywords.test(previousLine)) {
          lines.splice(policyLineIndex - 1, 1);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Checks if a comment line is related to a removal policy
   */
  private isRelatedComment(line: string, policy: string): boolean {
    const trimmed = line.trim();

    // Not a comment
    if (!trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      return false;
    }

    // Check for keywords related to removal policies
    const keywords = /retain|removal|policy|delete|destroy|safety|keep|preserve/i;
    return keywords.test(trimmed);
  }
}
