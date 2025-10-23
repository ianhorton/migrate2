/**
 * Physical ID Resolver
 *
 * Resolves physical IDs for CloudFormation resources using cascading
 * fallback strategies. Attempts multiple methods in order of confidence
 * until a physical ID is found.
 *
 * Fallback Strategy:
 * 1. Explicit Physical ID from template (100% confidence)
 * 2. Auto-discovery with high confidence match (90%+ confidence)
 * 3. Human intervention for manual selection
 *
 * Features:
 * - Cascading fallback strategies
 * - Integration with discovery and matcher
 * - Integration with intervention manager
 * - Comprehensive logging
 * - Error handling
 */

import { AWSResourceDiscovery } from './aws-resource-discovery';
import { ResourceMatcher } from './resource-matcher';
import { HumanInterventionManager } from '../intervention/human-intervention-manager';
import { ResolutionStrategy } from '../../types/discovery';
import { PhysicalResourceCandidate } from '../../types/intervention';
import chalk from 'chalk';

export interface PhysicalIdResolverOptions {
  autoMatchThreshold?: number; // Confidence threshold for auto-matching (default 0.9)
  enableHumanIntervention?: boolean; // Allow fallback to human selection
  verbose?: boolean;
}

export class PhysicalIdResolver {
  private readonly discovery: AWSResourceDiscovery;
  private readonly matcher: ResourceMatcher;
  private readonly interventionManager: HumanInterventionManager;
  private readonly autoMatchThreshold: number;
  private readonly enableHumanIntervention: boolean;
  private readonly verbose: boolean;

  constructor(
    discovery: AWSResourceDiscovery,
    matcher: ResourceMatcher,
    interventionManager: HumanInterventionManager,
    options: PhysicalIdResolverOptions = {}
  ) {
    this.discovery = discovery;
    this.matcher = matcher;
    this.interventionManager = interventionManager;
    this.autoMatchThreshold = options.autoMatchThreshold || 0.9;
    this.enableHumanIntervention = options.enableHumanIntervention !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * Resolve physical ID with cascading fallback strategies
   */
  async resolve(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>,
    region?: string
  ): Promise<string> {
    try {
      if (this.verbose) {
        console.log(chalk.blue(`\n🔍 Resolving physical ID for ${logicalId} (${resourceType})`));
      }

      const strategies = this.getStrategies(
        logicalId,
        resourceType,
        templateProperties,
        region
      );

      // Execute strategies in order until one succeeds
      const errors: Array<{ strategy: string; error: unknown }> = [];

      for (const strategy of strategies) {
        try {
          if (this.verbose) {
            console.log(chalk.gray(`  Trying strategy: ${strategy.name}`));
          }

          const result = await strategy.execute();

          if (result) {
            if (this.verbose) {
              console.log(chalk.green(`  ✅ Resolved using ${strategy.name}: ${result}`));
            }
            return result;
          }

          if (this.verbose) {
            console.log(chalk.gray(`  Strategy ${strategy.name} returned no result`));
          }
        } catch (error) {
          errors.push({ strategy: strategy.name, error });
          if (this.verbose) {
            console.log(chalk.yellow(`  Strategy ${strategy.name} failed: ${error}`));
          }
          // Continue to next strategy
        }
      }

      // All strategies failed - provide detailed error
      const errorDetails = errors.map(e => `${e.strategy}: ${e.error}`).join('; ');
      throw new Error(
        `Failed to resolve physical ID for ${logicalId} (${resourceType}) after trying all strategies. ` +
        `Errors: ${errorDetails}`
      );
    } catch (error) {
      console.error(`Physical ID resolution failed for ${logicalId}:`, error);
      if (error instanceof Error) {
        throw error; // Re-throw if already formatted
      }
      throw new Error(`Physical ID resolution error for ${logicalId}: ${error}`);
    }
  }

  /**
   * Get all available resolution strategies in priority order
   */
  private getStrategies(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>,
    region?: string
  ): ResolutionStrategy[] {
    const strategies: ResolutionStrategy[] = [];

    // Strategy 1: Use explicit physical ID from template (100% confidence)
    strategies.push({
      name: 'Explicit Physical ID',
      confidence: 1.0,
      execute: async () => {
        const physicalIdProp = this.getPhysicalIdProperty(resourceType);
        if (physicalIdProp && templateProperties[physicalIdProp]) {
          return templateProperties[physicalIdProp];
        }
        return null;
      },
    });

    // Strategy 2: Discover and auto-match (90%+ confidence)
    strategies.push({
      name: 'Auto-Discovery',
      confidence: 0.9,
      execute: async () => {
        try {
          // Discover resources of this type
          const discovered = await this.discovery.discoverResourceType(
            resourceType,
            region
          );

          if (discovered.length === 0) {
            return null;
          }

          // Match against discovered resources
          const matchResult = this.matcher.match(
            logicalId,
            resourceType,
            templateProperties,
            discovered
          );

          // Auto-select if best match has high confidence
          if (
            matchResult.bestMatch &&
            matchResult.bestMatch.confidence >= this.autoMatchThreshold
          ) {
            return matchResult.bestMatch.physicalId;
          }

          return null;
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(`Auto-discovery strategy failed for ${logicalId}: ${error.message}`);
          }
          throw new Error(`Auto-discovery strategy failed for ${logicalId}: ${String(error)}`);
        }
      },
    });

    // Strategy 3: Human intervention (always succeeds or throws)
    if (this.enableHumanIntervention) {
      strategies.push({
        name: 'Human Selection',
        confidence: 1.0,
        execute: async () => {
          try {
            // Discover resources
            const discovered = await this.discovery.discoverResourceType(
              resourceType,
              region
            );

            // Match to get candidates
            const matchResult = this.matcher.match(
              logicalId,
              resourceType,
              templateProperties,
              discovered
            );

            // Convert match candidates to intervention candidates
            const candidates: PhysicalResourceCandidate[] = matchResult.matches.map(
              (match) => ({
                physicalId: match.physicalId,
                confidence: match.confidence,
                source: 'discovered',
                metadata: match.discoveredResource.metadata,
                matchReasons: match.matchReasons,
              })
            );

            // Prompt user
            return await this.interventionManager.promptForPhysicalId(
              logicalId,
              resourceType,
              candidates
            );
          } catch (error) {
            if (error instanceof Error) {
              throw new Error(`Human intervention failed for ${logicalId}: ${error.message}`);
            }
            throw new Error(`Human intervention failed for ${logicalId}: ${String(error)}`);
          }
        },
      });
    }

    return strategies;
  }

  /**
   * Get physical ID property name for resource type
   */
  private getPhysicalIdProperty(resourceType: string): string | null {
    const propertyMap: Record<string, string> = {
      'AWS::DynamoDB::Table': 'TableName',
      'AWS::S3::Bucket': 'BucketName',
      'AWS::Logs::LogGroup': 'LogGroupName',
      'AWS::Lambda::Function': 'FunctionName',
      'AWS::IAM::Role': 'RoleName',
      'AWS::SQS::Queue': 'QueueName',
      'AWS::SNS::Topic': 'TopicName',
      'AWS::Kinesis::Stream': 'Name',
      'AWS::StepFunctions::StateMachine': 'StateMachineName',
    };

    return propertyMap[resourceType] || null;
  }

  /**
   * Batch resolve physical IDs for multiple resources
   */
  async resolveMany(
    resources: Array<{
      logicalId: string;
      resourceType: string;
      templateProperties: Record<string, any>;
    }>,
    region?: string
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const errors: Array<{ logicalId: string; error: unknown }> = [];

    for (const resource of resources) {
      try {
        const physicalId = await this.resolve(
          resource.logicalId,
          resource.resourceType,
          resource.templateProperties,
          region
        );
        results.set(resource.logicalId, physicalId);
      } catch (error) {
        console.error(
          chalk.red(`Failed to resolve ${resource.logicalId}: ${error}`)
        );
        errors.push({ logicalId: resource.logicalId, error });
      }
    }

    // If any resolutions failed, throw aggregate error
    if (errors.length > 0) {
      const errorSummary = errors.map(e => `${e.logicalId}: ${e.error}`).join('; ');
      throw new Error(
        `Failed to resolve ${errors.length} of ${resources.length} physical IDs. Errors: ${errorSummary}`
      );
    }

    return results;
  }

  /**
   * Test if physical ID can be resolved without human intervention
   */
  async canResolveAutomatically(
    logicalId: string,
    resourceType: string,
    templateProperties: Record<string, any>,
    region?: string
  ): Promise<boolean> {
    try {
      // Check explicit physical ID
      const physicalIdProp = this.getPhysicalIdProperty(resourceType);
      if (physicalIdProp && templateProperties[physicalIdProp]) {
        return true;
      }

      // Check auto-discovery
      try {
        const discovered = await this.discovery.discoverResourceType(
          resourceType,
          region
        );
        const matchResult = this.matcher.match(
          logicalId,
          resourceType,
          templateProperties,
          discovered
        );

        return (
          matchResult.bestMatch !== undefined &&
          matchResult.bestMatch.confidence >= this.autoMatchThreshold
        );
      } catch (error) {
        console.warn(`Auto-resolution check failed for ${logicalId}:`, error);
        return false;
      }
    } catch (error) {
      console.error(`Error checking automatic resolution for ${logicalId}:`, error);
      return false;
    }
  }
}
