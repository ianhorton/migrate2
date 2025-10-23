/**
 * FunctionUrlGenerator - Sprint 4 Phase 3 (GREEN)
 * Generates Lambda Function URL constructs
 */

import { ClassifiedResource } from '../../../types';
import { AdvancedConstructsOptions } from './alias-generator';
import { DetectionUtils } from './utils/detection-utils';

export interface FunctionUrlConfig {
  authType: 'AWS_IAM' | 'NONE';
  cors?: CorsConfig;
}

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge?: number;
  allowCredentials?: boolean;
}

export interface UrlDecision {
  shouldGenerate: boolean;
  reason: string;
}

export interface UrlGenerationResult {
  code: string;
  urlOutputName: string;
}

export class FunctionUrlGenerator {
  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions
  ) {}

  /**
   * Determines if Function URL should be generated
   */
  public shouldGenerateUrl(lambdaResource: ClassifiedResource): UrlDecision {
    // Priority 1: Explicit http/httpApi event in serverless.yml
    if (DetectionUtils.hasHttpEvents(lambdaResource, this.options.serverlessConfig)) {
      return {
        shouldGenerate: true,
        reason: 'Simple HTTP endpoint - Function URL is cheaper than API Gateway'
      };
    }

    // Priority 2: Webhook pattern detection
    const functionName = DetectionUtils.getFunctionName(lambdaResource);
    if (this.matchesWebhookPattern(functionName)) {
      return {
        shouldGenerate: true,
        reason: 'Webhook pattern detected - Function URL ideal for webhooks'
      };
    }

    // Priority 3: API endpoint pattern in function name
    if (this.matchesApiPattern(functionName)) {
      return {
        shouldGenerate: true,
        reason: 'API endpoint pattern in name - likely needs HTTP access'
      };
    }

    // Priority 4: User override
    if (this.options.generateFunctionUrls === true) {
      return {
        shouldGenerate: true,
        reason: 'User configuration explicitly enables Function URLs'
      };
    }

    // Default: No Function URL
    return {
      shouldGenerate: false,
      reason: 'No HTTP access indicators - Lambda invoked by events'
    };
  }

  /**
   * Generates Function URL CDK code
   */
  public generateFunctionUrl(
    targetConstructName: string, // alias or function variable name
    lambdaResource: ClassifiedResource,
    config?: Partial<FunctionUrlConfig>
  ): UrlGenerationResult {
    const authType = this.determineAuthType(lambdaResource);
    const corsConfig = this.determineCorsConfig(lambdaResource);
    const functionName = DetectionUtils.getFunctionName(lambdaResource);
    const urlVariableName = `${this.toVariableName(lambdaResource.LogicalId)}Url`;

    const fullConfig: FunctionUrlConfig = {
      authType: config?.authType || authType,
      cors: config?.cors || corsConfig
    };

    let code = '\n// ========================================\n';
    code += '// Function URLs\n';
    code += '// ========================================\n\n';
    code += '// Add Function URL for direct HTTP(S) invocation\n';
    code += `const ${urlVariableName} = ${targetConstructName}.addFunctionUrl({\n`;
    code += `  authType: FunctionUrlAuthType.${fullConfig.authType}`;

    if (fullConfig.cors) {
      code += ',\n  cors: {\n';
      code += `    allowedOrigins: ${JSON.stringify(fullConfig.cors.allowedOrigins)},\n`;
      code += `    allowedMethods: [${fullConfig.cors.allowedMethods.map(m => `HttpMethod.${m}`).join(', ')}]`;

      if (fullConfig.cors.allowedHeaders?.length) {
        code += `,\n    allowedHeaders: ${JSON.stringify(fullConfig.cors.allowedHeaders)}`;
      }

      if (fullConfig.cors.allowCredentials !== undefined) {
        code += `,\n    allowCredentials: ${fullConfig.cors.allowCredentials}`;
      }

      if (fullConfig.cors.maxAge) {
        code += `,\n    maxAge: Duration.seconds(${fullConfig.cors.maxAge})`;
      }

      code += '\n  }';
    }

    code += '\n});\n\n';

    // Add security warning for NONE auth
    if (fullConfig.authType === 'NONE') {
      code += '// ⚠️  WARNING: This Function URL is publicly accessible\n';
      code += '//     Anyone can invoke this function without authentication\n';
      code += '//     Implement custom authentication/authorization in your function code\n\n';
    }

    // Add CloudFormation output
    code += `new CfnOutput(this, '${lambdaResource.LogicalId}Url', {\n`;
    code += `  value: ${urlVariableName}.url,\n`;
    code += `  description: 'Function URL for ${functionName}`;

    if (fullConfig.authType === 'NONE') {
      code += ' (Public - No Authentication)';
    } else {
      code += ' (AWS IAM Authentication Required)';
    }

    code += "'\n});\n\n";

    return {
      code,
      urlOutputName: `${lambdaResource.LogicalId}Url`
    };
  }

  /**
   * Determines authentication type (5 priority levels from pseudocode)
   */
  private determineAuthType(lambdaResource: ClassifiedResource): 'AWS_IAM' | 'NONE' {
    // Priority 1: Check for authorizer in events
    const eventConfig = DetectionUtils.extractEventConfig(
      lambdaResource,
      this.options.serverlessConfig
    );
    if (eventConfig.some(e => e.authorizer)) {
      return 'AWS_IAM';
    }

    // Priority 2: Webhook pattern defaults to NONE (public)
    const functionName = DetectionUtils.getFunctionName(lambdaResource);
    if (this.matchesWebhookPattern(functionName)) {
      return 'NONE';
    }

    // Priority 3: Check function name for "public" keyword
    if (functionName.toLowerCase().includes('public')) {
      return 'NONE';
    }

    // Priority 4: User configuration
    // (not implemented - would come from options)

    // Priority 5: Secure by default
    return 'AWS_IAM';
  }

  /**
   * Determines CORS configuration (5 priority levels from pseudocode)
   */
  private determineCorsConfig(lambdaResource: ClassifiedResource): CorsConfig | undefined {
    // Priority 1: Check serverless.yml for CORS configuration
    const eventConfig = DetectionUtils.extractEventConfig(
      lambdaResource,
      this.options.serverlessConfig
    );

    const corsEvent = eventConfig.find(e => e.cors);
    if (corsEvent?.cors) {
      if (typeof corsEvent.cors === 'boolean') {
        return {
          allowedOrigins: ['*'],
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          allowCredentials: false,
          maxAge: 3600
        };
      } else {
        // Custom CORS configuration
        return {
          allowedOrigins: corsEvent.cors.origins || ['*'],
          allowedMethods: corsEvent.cors.methods || ['GET', 'POST'],
          allowedHeaders: corsEvent.cors.headers || ['Content-Type'],
          allowCredentials: corsEvent.cors.credentials || false,
          maxAge: corsEvent.cors.maxAge || 3600
        };
      }
    }

    // Priority 2: Default CORS for webhook patterns
    const functionName = DetectionUtils.getFunctionName(lambdaResource);
    if (this.matchesWebhookPattern(functionName)) {
      return {
        allowedOrigins: ['*'],
        allowedMethods: ['POST'],
        allowedHeaders: ['Content-Type', 'X-GitHub-Event', 'X-Hub-Signature'],
        allowCredentials: false
      };
    }

    // Default: No CORS
    return undefined;
  }

  /**
   * Checks if function name matches webhook pattern
   */
  private matchesWebhookPattern(functionName: string): boolean {
    const webhookKeywords = ['webhook', 'callback', 'hook', 'receiver', 'listener'];
    const nameLowercase = functionName.toLowerCase();
    return webhookKeywords.some(keyword => nameLowercase.includes(keyword));
  }

  /**
   * Checks if function name indicates API pattern
   */
  private matchesApiPattern(functionName: string): boolean {
    const apiKeywords = ['api', 'endpoint'];
    const nameLowercase = functionName.toLowerCase();
    return apiKeywords.some(keyword => nameLowercase.includes(keyword));
  }

  /**
   * Converts LogicalId to camelCase variable name
   */
  private toVariableName(logicalId: string): string {
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }
}
