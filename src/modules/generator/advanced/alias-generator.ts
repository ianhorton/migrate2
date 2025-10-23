/**
 * AliasGenerator - Sprint 4 Phase 2 (GREEN)
 * Generates Lambda Alias constructs
 */

import { ClassifiedResource } from '../../../types';
import { DetectionUtils } from './utils/detection-utils';

export interface AdvancedConstructsOptions {
  // Generation flags
  generateAliases?: boolean;
  generateFunctionUrls?: boolean;
  suggestCloudFront?: boolean;

  // Stage/environment
  stage?: string;
  environment?: Record<string, string>;

  // Serverless config (for detection)
  serverlessConfig?: any;
}

export interface AliasConfig {
  aliasName: string;
  description?: string;
  provisionedConcurrency?: number;
}

export interface AliasDecision {
  shouldGenerate: boolean;
  priority: number; // 0-10 (higher = more important)
  reason: string;
}

export interface AliasGenerationResult {
  code: string;
  aliasVariableName: string;
}

export class AliasGenerator {
  // Detection priority levels (from pseudocode)
  private static readonly PRIORITY_FUNCTION_URL = 10;
  private static readonly PRIORITY_CLOUDFRONT = 9;
  private static readonly PRIORITY_MULTI_STAGE = 8;
  private static readonly PRIORITY_PRODUCTION = 7;
  private static readonly PRIORITY_PROVISIONED_CONCURRENCY = 6;
  private static readonly PRIORITY_DEPLOYMENT_PREFERENCES = 5;
  private static readonly PRIORITY_USER_OVERRIDE = 4;

  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions
  ) {}

  /**
   * Determines if alias should be generated
   * Returns priority score and reason
   */
  public shouldGenerateAlias(lambdaResource: ClassifiedResource): AliasDecision {
    // Priority 1: Function URL dependency (highest)
    // Note: Will be implemented when FunctionUrlGenerator is available
    // Placeholder for now - will be enhanced

    // Priority 2: CloudFront dependency
    // Note: Will be implemented when CloudFrontSuggester is available
    // Placeholder for now - will be enhanced

    // Priority 3: Multi-stage deployment
    if (this.options.serverlessConfig?.provider?.stage) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_MULTI_STAGE,
        reason: 'Multi-stage deployment detected in serverless.yml'
      };
    }

    // Priority 4: Production indicators
    if (DetectionUtils.isProductionFunction(lambdaResource, this.options.stage)) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_PRODUCTION,
        reason: 'Production function should have alias for rollback capability'
      };
    }

    // Priority 5: Provisioned concurrency
    if (this.hasProvisionedConcurrency(lambdaResource)) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_PROVISIONED_CONCURRENCY,
        reason: 'Provisioned concurrency requires alias'
      };
    }

    // Priority 6: Deployment preferences (CodeDeploy)
    if (this.hasDeploymentPreferences(lambdaResource)) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_DEPLOYMENT_PREFERENCES,
        reason: 'Gradual deployment requires alias for traffic shifting'
      };
    }

    // Priority 7: User override
    if (this.options.generateAliases === true) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_USER_OVERRIDE,
        reason: 'User configuration explicitly enables aliases'
      };
    }

    // Default: No alias for simple development functions
    return {
      shouldGenerate: false,
      priority: 0,
      reason: 'Simple development function, $LATEST is sufficient'
    };
  }

  /**
   * Generates Lambda Alias CDK code
   */
  public generateAlias(
    lambdaResource: ClassifiedResource,
    lambdaConstructName: string,
    config?: Partial<AliasConfig>
  ): AliasGenerationResult {
    const aliasName = this.determineAliasName(lambdaResource);
    const aliasVariableName = `${lambdaConstructName}Alias`;
    const description = config?.description || `Alias for ${aliasName} environment`;

    let code = '\n// ========================================\n';
    code += '// Lambda Aliases\n';
    code += '// ========================================\n\n';
    code += '// Create alias for version management and gradual deployments\n';
    code += `const ${aliasVariableName} = new Alias(this, '${lambdaResource.LogicalId}Alias', {\n`;
    code += `  aliasName: '${aliasName}',\n`;
    code += `  version: ${lambdaConstructName}.currentVersion,\n`;
    code += `  description: '${description}'`;

    // Add provisioned concurrency if configured
    if (this.hasProvisionedConcurrency(lambdaResource)) {
      const concurrency = lambdaResource.Properties?.ProvisionedConcurrencyConfig
        ?.ProvisionedConcurrentExecutions;
      if (concurrency) {
        code += `,\n  provisionedConcurrentExecutions: ${concurrency}`;
      }
    }

    code += '\n});\n\n';

    return {
      code,
      aliasVariableName
    };
  }

  /**
   * Determines alias name (5 priority levels from pseudocode)
   */
  private determineAliasName(lambdaResource: ClassifiedResource): string {
    // Priority 1: Explicit configuration
    if (this.options.stage) {
      return this.options.stage;
    }

    // Priority 2: Serverless.yml stage
    if (this.options.serverlessConfig?.provider?.stage) {
      return this.options.serverlessConfig.provider.stage;
    }

    // Priority 3: Environment tags
    const envTag = lambdaResource.Properties?.Tags?.find(
      (tag: any) => tag.Key === 'environment' || tag.Key === 'Environment'
    );
    if (envTag) {
      return envTag.Value;
    }

    // Priority 4: Environment variable STAGE
    if (this.options.environment?.STAGE) {
      return this.options.environment.STAGE;
    }

    // Priority 5: Default 'live'
    return 'live';
  }

  /**
   * Checks if Lambda has provisioned concurrency
   */
  private hasProvisionedConcurrency(lambdaResource: ClassifiedResource): boolean {
    return Boolean(
      lambdaResource.Properties?.ProvisionedConcurrencyConfig
        ?.ProvisionedConcurrentExecutions
    );
  }

  /**
   * Checks if deployment preferences exist (CodeDeploy)
   */
  private hasDeploymentPreferences(lambdaResource: ClassifiedResource): boolean {
    return Boolean(lambdaResource.Properties?.DeploymentPreference);
  }
}
