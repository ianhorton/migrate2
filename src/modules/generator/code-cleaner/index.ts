import { ClassifiedResource } from '../../../types';
import { CommentReducer } from './comment-reducer';
import { LogicalIdOptimizer } from './logical-id-optimizer';
import { RemovalPolicyOptimizer } from './removal-policy-optimizer';
import { CodeFormatter } from './code-formatter';

export interface CodeCleanerOptions {
  skipCommentReduction?: boolean;
  skipLogicalIdOptimization?: boolean;
  skipRemovalPolicyOptimization?: boolean;
  skipFormatting?: boolean;
}

export interface CleaningResult {
  code: string;
  metrics: AggregatedMetrics;
}

export interface AggregatedMetrics {
  comments: {
    totalComments: number;
    commentsRemoved: number;
    commentsKept: number;
    reductionPercentage: number;
  };
  logicalIds: {
    totalOverrides: number;
    overridesRemoved: number;
    overridesKept: number;
    reductionPercentage: number;
  };
  removalPolicies: {
    totalPolicies: number;
    policiesRemoved: number;
    policiesKept: number;
    reductionPercentage: number;
  };
  formatting: {
    totalResources: number;
    totalSections: number;
    linesReduced: number;
  };
  totalReductionPercentage: number;
}

/**
 * Main code cleaning pipeline that orchestrates all cleaning phases
 *
 * Pipeline flow:
 * 1. Comment Reduction (90% target)
 * 2. Logical ID Optimization (70% target)
 * 3. Removal Policy Optimization (80% target)
 * 4. Code Formatting (organize into sections)
 */
export class CodeCleaner {
  private commentReducer: CommentReducer;
  private logicalIdOptimizer: LogicalIdOptimizer;
  private removalPolicyOptimizer: RemovalPolicyOptimizer;
  private codeFormatter: CodeFormatter;
  private lastMetrics?: AggregatedMetrics;

  constructor(
    private resources: ClassifiedResource[],
    private options: CodeCleanerOptions = {}
  ) {
    this.commentReducer = new CommentReducer(resources);
    this.logicalIdOptimizer = new LogicalIdOptimizer(resources);
    this.removalPolicyOptimizer = new RemovalPolicyOptimizer(resources);
    this.codeFormatter = new CodeFormatter(resources);
  }

  /**
   * Main cleaning method - runs all pipeline phases
   */
  public cleanCode(code: string): CleaningResult {
    try {
      let cleanedCode = code;
      const metrics: Partial<AggregatedMetrics> = {};

      // Phase 1: Reduce comments
      if (!this.options.skipCommentReduction) {
        const commentResult = this.commentReducer.reduceComments(cleanedCode);
        cleanedCode = commentResult.code;
        metrics.comments = commentResult.metrics;
      } else {
        metrics.comments = {
          totalComments: 0,
          commentsRemoved: 0,
          commentsKept: 0,
          reductionPercentage: 0
        };
      }

      // Phase 2: Optimize logical IDs
      if (!this.options.skipLogicalIdOptimization) {
        const logicalIdResult = this.logicalIdOptimizer.optimizeLogicalIds(cleanedCode);
        cleanedCode = logicalIdResult.code;
        metrics.logicalIds = logicalIdResult.metrics;
      } else {
        metrics.logicalIds = {
          totalOverrides: 0,
          overridesRemoved: 0,
          overridesKept: 0,
          reductionPercentage: 0
        };
      }

      // Phase 3: Optimize removal policies
      if (!this.options.skipRemovalPolicyOptimization) {
        const policyResult = this.removalPolicyOptimizer.optimizeRemovalPolicies(cleanedCode);
        cleanedCode = policyResult.code;
        metrics.removalPolicies = policyResult.metrics;
      } else {
        metrics.removalPolicies = {
          totalPolicies: 0,
          policiesRemoved: 0,
          policiesKept: 0,
          reductionPercentage: 0
        };
      }

      // Phase 4: Format code
      if (!this.options.skipFormatting) {
        const formattingResult = this.codeFormatter.formatCode(cleanedCode);
        cleanedCode = formattingResult.code;
        metrics.formatting = formattingResult.metrics;
      } else {
        metrics.formatting = {
          totalResources: 0,
          totalSections: 0,
          linesReduced: 0
        };
      }

      // Calculate total reduction percentage
      const totalReduction = this.calculateTotalReduction(metrics as AggregatedMetrics);
      const aggregatedMetrics: AggregatedMetrics = {
        ...(metrics as AggregatedMetrics),
        totalReductionPercentage: totalReduction
      };

      this.lastMetrics = aggregatedMetrics;

      return {
        code: cleanedCode,
        metrics: aggregatedMetrics
      };
    } catch (error) {
      // Handle errors gracefully - return original code with empty metrics
      console.error('Error during code cleaning:', error);

      const emptyMetrics: AggregatedMetrics = {
        comments: {
          totalComments: 0,
          commentsRemoved: 0,
          commentsKept: 0,
          reductionPercentage: 0
        },
        logicalIds: {
          totalOverrides: 0,
          overridesRemoved: 0,
          overridesKept: 0,
          reductionPercentage: 0
        },
        removalPolicies: {
          totalPolicies: 0,
          policiesRemoved: 0,
          policiesKept: 0,
          reductionPercentage: 0
        },
        formatting: {
          totalResources: 0,
          totalSections: 0,
          linesReduced: 0
        },
        totalReductionPercentage: 0
      };

      this.lastMetrics = emptyMetrics;

      return {
        code,
        metrics: emptyMetrics
      };
    }
  }

  /**
   * Returns the metrics from the last cleaning operation
   */
  public getMetrics(): AggregatedMetrics {
    if (!this.lastMetrics) {
      throw new Error('No cleaning operation has been performed yet');
    }
    return this.lastMetrics;
  }

  /**
   * Calculates overall reduction percentage across all phases
   */
  private calculateTotalReduction(metrics: AggregatedMetrics): number {
    const reductions = [
      metrics.comments.reductionPercentage,
      metrics.logicalIds.reductionPercentage,
      metrics.removalPolicies.reductionPercentage
    ];

    // Average of non-zero reductions
    const nonZero = reductions.filter(r => r > 0);
    if (nonZero.length === 0) return 0;

    return Math.round(nonZero.reduce((sum, r) => sum + r, 0) / nonZero.length);
  }
}
