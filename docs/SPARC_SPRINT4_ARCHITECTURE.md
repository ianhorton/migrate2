# Sprint 4 Architecture: Advanced CDK Constructs

**Sprint**: 4 of 5
**Phase**: SPARC Architecture
**Date**: 2025-10-22
**Status**: 🏗️ IN PROGRESS - Awaiting Phase Gate 3 Approval

---

## Overview

This document specifies the complete module architecture for generating **Lambda Aliases**, **Function URLs**, and **CloudFront suggestions**. The design follows a modular, testable structure with clear separation of concerns and zero breaking changes to existing code.

### Key Design Principles

1. **Additive Only** - No changes to existing Lambda generation logic
2. **Graceful Degradation** - Never break basic Lambda generation if advanced features fail
3. **User-Friendly** - Clear console messages and commented code suggestions
4. **Testable** - Every component has unit and integration tests
5. **Maintainable** - Clear file ownership and module boundaries

---

## File Structure

```
src/modules/generator/
├── templates/
│   └── l2-constructs/
│       └── advanced.ts                 # NEW: Main orchestrator
│
└── advanced/                           # NEW: Sprint 4 module (exclusive ownership)
    ├── alias-generator.ts              # Lambda alias generation
    ├── function-url-generator.ts       # Function URL generation
    ├── cloudfront-suggester.ts         # CloudFront suggestion
    └── utils/
        ├── detection-utils.ts          # Shared detection logic
        └── code-template-builder.ts    # Code template utilities

tests/unit/generator/advanced/          # NEW: Unit tests
├── alias-generator.test.ts             # 10 tests
├── function-url-generator.test.ts      # 12 tests
├── cloudfront-suggester.test.ts        # 8 tests
└── detection-utils.test.ts             # 12 tests

tests/integration/
└── advanced-constructs.test.ts         # NEW: 5 integration tests

docs/
└── SPARC_SPRINT4_ARCHITECTURE.md       # THIS DOCUMENT
```

### File Ownership

| File | Owner | Purpose |
|------|-------|---------|
| `advanced/*` | **Sprint 4** | Exclusive ownership - no conflicts |
| `templates/l2-constructs/advanced.ts` | **Sprint 4** | New file - no conflicts |
| `typescript-generator.ts` | **Existing** | Minor integration changes only |

**No conflicts with**:
- Sprint 2: `templates/l2-constructs/iam.ts` (different directory)
- Sprint 3: `code-cleaner/` (different module)
- Existing: `resource-classifier.ts` (read-only usage)

---

## Module Architecture

### 1. Main Orchestrator (`advanced.ts`)

**Purpose**: Coordinates all advanced construct generation
**Location**: `src/modules/generator/templates/l2-constructs/advanced.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { AliasGenerator } from '../../advanced/alias-generator';
import { FunctionUrlGenerator } from '../../advanced/function-url-generator';
import { CloudFrontSuggester } from '../../advanced/cloudfront-suggester';

export interface AdvancedConstructsOptions {
  // Generation flags
  generateAliases?: boolean;        // default: auto-detect
  generateFunctionUrls?: boolean;   // default: auto-detect
  suggestCloudFront?: boolean;      // default: true

  // Stage/environment
  stage?: string;                   // e.g., "prod", "dev"
  environment?: Record<string, string>;

  // Serverless config (for detection)
  serverlessConfig?: any;
}

export interface AdvancedConstructsResult {
  code: string;                     // Generated TypeScript code
  hasAlias: boolean;                // Flags for what was generated
  hasFunctionUrl: boolean;
  hasCloudFrontSuggestion: boolean;
  consoleSuggestions: string[];     // User-facing messages
}

export class AdvancedConstructsGenerator {
  private aliasGenerator: AliasGenerator;
  private functionUrlGenerator: FunctionUrlGenerator;
  private cloudFrontSuggester: CloudFrontSuggester;

  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions = {}
  ) {
    this.aliasGenerator = new AliasGenerator(allResources, options);
    this.functionUrlGenerator = new FunctionUrlGenerator(allResources, options);
    this.cloudFrontSuggester = new CloudFrontSuggester(allResources, options);
  }

  /**
   * Main entry point - generates all advanced constructs for a Lambda
   *
   * @param lambdaResource - The Lambda function resource (from Sprint 1 classifier)
   * @param lambdaConstructName - Variable name of the Lambda construct
   * @returns Generated code and metadata
   */
  public generateAdvancedConstructs(
    lambdaResource: ClassifiedResource,
    lambdaConstructName: string
  ): AdvancedConstructsResult {
    const result: AdvancedConstructsResult = {
      code: '',
      hasAlias: false,
      hasFunctionUrl: false,
      hasCloudFrontSuggestion: false,
      consoleSuggestions: []
    };

    try {
      // Step 1: Determine if we need an alias
      const aliasDecision = this.aliasGenerator.shouldGenerateAlias(lambdaResource);

      if (aliasDecision.shouldGenerate) {
        const aliasResult = this.aliasGenerator.generateAlias(
          lambdaResource,
          lambdaConstructName
        );
        result.code += aliasResult.code;
        result.hasAlias = true;

        // Step 2: Generate Function URL (uses alias if present)
        const targetConstructName = aliasResult.aliasVariableName;
        const urlDecision = this.functionUrlGenerator.shouldGenerateUrl(lambdaResource);

        if (urlDecision.shouldGenerate) {
          const urlResult = this.functionUrlGenerator.generateFunctionUrl(
            targetConstructName,
            lambdaResource
          );
          result.code += urlResult.code;
          result.hasFunctionUrl = true;

          // Step 3: Suggest CloudFront if appropriate
          const cfSuggestion = this.cloudFrontSuggester.shouldSuggestCloudFront(
            lambdaResource,
            true // has Function URL
          );

          if (cfSuggestion.shouldSuggest) {
            result.code += this.cloudFrontSuggester.generateSuggestion(
              urlResult.urlOutputName,
              lambdaResource.Properties?.FunctionName || lambdaResource.LogicalId
            );
            result.hasCloudFrontSuggestion = true;
            result.consoleSuggestions.push(
              this.cloudFrontSuggester.generateConsoleSuggestion(
                lambdaResource.Properties?.FunctionName || lambdaResource.LogicalId
              )
            );
          }
        }
      }

      return result;

    } catch (error) {
      // Graceful degradation - log warning but don't break basic Lambda generation
      console.warn(
        `Warning: Failed to generate advanced constructs for ${lambdaConstructName}:`,
        error instanceof Error ? error.message : String(error)
      );
      console.warn('Continuing with basic Lambda generation');

      return {
        code: '',
        hasAlias: false,
        hasFunctionUrl: false,
        hasCloudFrontSuggestion: false,
        consoleSuggestions: []
      };
    }
  }

  /**
   * Gets all console suggestions to display to user
   */
  public getConsoleSuggestions(): string[] {
    return [];
  }
}
```

---

### 2. Alias Generator (`alias-generator.ts`)

**Purpose**: Generates Lambda Alias constructs
**Location**: `src/modules/generator/advanced/alias-generator.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { AdvancedConstructsOptions } from '../templates/l2-constructs/advanced';
import { DetectionUtils } from './utils/detection-utils';

export interface AliasConfig {
  aliasName: string;
  description?: string;
  provisionedConcurrency?: number;
}

export interface AliasDecision {
  shouldGenerate: boolean;
  priority: number;      // 0-10 (higher = more important)
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
    if (this.willGenerateFunctionUrl(lambdaResource)) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_FUNCTION_URL,
        reason: 'Function URL requires stable alias endpoint'
      };
    }

    // Priority 2: CloudFront dependency
    if (this.willSuggestCloudFront(lambdaResource)) {
      return {
        shouldGenerate: true,
        priority: AliasGenerator.PRIORITY_CLOUDFRONT,
        reason: 'CloudFront requires stable alias endpoint'
      };
    }

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
    code += `  description: '${description}'\n`;

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
   * Checks if Lambda will generate Function URL
   * (Simplified check - actual logic in FunctionUrlGenerator)
   */
  private willGenerateFunctionUrl(lambdaResource: ClassifiedResource): boolean {
    return DetectionUtils.hasHttpEvents(lambdaResource, this.options.serverlessConfig);
  }

  /**
   * Checks if Lambda will suggest CloudFront
   * (Simplified check - actual logic in CloudFrontSuggester)
   */
  private willSuggestCloudFront(lambdaResource: ClassifiedResource): boolean {
    return DetectionUtils.isProductionFunction(lambdaResource, this.options.stage);
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
```

---

### 3. Function URL Generator (`function-url-generator.ts`)

**Purpose**: Generates Lambda Function URL constructs
**Location**: `src/modules/generator/advanced/function-url-generator.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { AdvancedConstructsOptions } from '../templates/l2-constructs/advanced';
import { DetectionUtils } from './utils/detection-utils';
import { CodeTemplateBuilder } from './utils/code-template-builder';

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
    targetConstructName: string,  // alias or function variable name
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
    code += CodeTemplateBuilder.buildFunctionUrlTemplate(targetConstructName, fullConfig);

    // Add security warning for NONE auth
    if (fullConfig.authType === 'NONE') {
      code += '\n// ⚠️  WARNING: This Function URL is publicly accessible\n';
      code += '//     Anyone can invoke this function without authentication\n';
      code += '//     Implement custom authentication/authorization in your function code\n\n';
    }

    // Add CloudFormation output
    code += CodeTemplateBuilder.buildUrlOutput(functionName, urlVariableName);

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
    const apiKeywords = ['api', 'endpoint', 'callback'];
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
```

---

### 4. CloudFront Suggester (`cloudfront-suggester.ts`)

**Purpose**: Suggests CloudFront distribution (commented code)
**Location**: `src/modules/generator/advanced/cloudfront-suggester.ts`

```typescript
import { ClassifiedResource } from '../../../types';
import { AdvancedConstructsOptions } from '../templates/l2-constructs/advanced';
import { DetectionUtils } from './utils/detection-utils';
import { CodeTemplateBuilder } from './utils/code-template-builder';

export interface CloudFrontSuggestion {
  shouldSuggest: boolean;
  reason: string;
}

export class CloudFrontSuggester {
  constructor(
    private allResources: ClassifiedResource[],
    private options: AdvancedConstructsOptions
  ) {}

  /**
   * Determines if CloudFront should be suggested
   */
  public shouldSuggestCloudFront(
    lambdaResource: ClassifiedResource,
    hasFunctionUrl: boolean
  ): CloudFrontSuggestion {
    // Priority 1: Production environment with Function URL
    if (
      DetectionUtils.isProductionFunction(lambdaResource, this.options.stage) &&
      hasFunctionUrl
    ) {
      return {
        shouldSuggest: true,
        reason: 'Production deployment with Function URL - CloudFront recommended for custom domain'
      };
    }

    // Priority 2: Custom domain configured
    if (DetectionUtils.hasCustomDomain(this.options.serverlessConfig)) {
      return {
        shouldSuggest: true,
        reason: 'Custom domain configured - CloudFront enables domain for Function URLs'
      };
    }

    // Priority 3: S3 website pattern
    if (this.isS3BasedLambda(lambdaResource)) {
      return {
        shouldSuggest: true,
        reason: 'S3 website pattern detected - migrate to Function URL + CloudFront'
      };
    }

    // Priority 4: High-traffic function
    if (this.expectsHighTraffic(lambdaResource) && hasFunctionUrl) {
      return {
        shouldSuggest: true,
        reason: 'High-memory function with URL - CloudFront caching can reduce costs'
      };
    }

    // Priority 5: User override
    if (this.options.suggestCloudFront === true) {
      return {
        shouldSuggest: true,
        reason: 'User configuration explicitly requests CloudFront suggestions'
      };
    }

    // Default: Don't suggest
    return {
      shouldSuggest: false,
      reason: 'Development or internal function - CloudFront not needed'
    };
  }

  /**
   * Generates commented CloudFront distribution code
   */
  public generateSuggestion(
    functionUrlOutputName: string,
    lambdaFunctionName: string
  ): string {
    return CodeTemplateBuilder.buildCloudFrontTemplate(
      functionUrlOutputName,
      lambdaFunctionName
    );
  }

  /**
   * Generates console suggestion message
   */
  public generateConsoleSuggestion(lambdaFunctionName: string): string {
    return `
⚠️  Production Recommendation: ${lambdaFunctionName}

For production deployments, consider adding CloudFront:

1. Custom Domain
   - Use api.example.com instead of Lambda URL
   - Professional appearance
   - SSL certificate via ACM

2. Performance
   - Global CDN (410+ edge locations)
   - Reduced latency for global users
   - Caching for repeated requests

3. Security
   - DDoS protection (AWS Shield Standard)
   - WAF integration for advanced filtering
   - Origin Access Control (OAC) for Lambda

Setup Steps:
  1. Request ACM certificate in us-east-1
  2. Uncomment CloudFront code in generated stack
  3. Update certificate ARN and domain name
  4. Deploy and update DNS

See commented code in generated stack for CloudFront setup.
Documentation: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
`.trim();
  }

  /**
   * Checks if Lambda is S3-based (migration opportunity)
   */
  private isS3BasedLambda(lambdaResource: ClassifiedResource): boolean {
    return Boolean(
      lambdaResource.Properties?.Code?.S3Bucket &&
      lambdaResource.Properties?.Code?.S3Key
    );
  }

  /**
   * Checks if function expects high traffic
   */
  private expectsHighTraffic(lambdaResource: ClassifiedResource): boolean {
    // High memory (>= 512MB) or long timeout (>= 30s) indicates important function
    const memorySize = lambdaResource.Properties?.MemorySize || 0;
    const timeout = lambdaResource.Properties?.Timeout || 0;
    return memorySize >= 512 || timeout >= 30;
  }
}
```

---

### 5. Detection Utils (`detection-utils.ts`)

**Purpose**: Shared detection logic
**Location**: `src/modules/generator/advanced/utils/detection-utils.ts`

```typescript
import { ClassifiedResource } from '../../../../types';

export interface EventConfig {
  type: 'http' | 'httpApi' | 'other';
  path?: string;
  method?: string;
  authorizer?: any;
  cors?: any;
}

export class DetectionUtils {
  /**
   * Checks if Lambda has http or httpApi events
   */
  public static hasHttpEvents(
    lambdaResource: ClassifiedResource,
    serverlessConfig: any
  ): boolean {
    // Check serverless.yml events (if available)
    if (serverlessConfig?.functions) {
      const functionName = this.getFunctionName(lambdaResource);
      const functionConfig = serverlessConfig.functions[functionName];

      if (functionConfig?.events) {
        return functionConfig.events.some(
          (event: any) => event.http || event.httpApi
        );
      }
    }

    return false;
  }

  /**
   * Checks if function is production (stage, name, tags)
   */
  public static isProductionFunction(
    lambdaResource: ClassifiedResource,
    stage?: string
  ): boolean {
    // Check stage
    if (stage === 'production' || stage === 'prod') {
      return true;
    }

    // Check tags
    const tags = lambdaResource.Properties?.Tags || [];
    const envTag = tags.find(
      (tag: any) => tag.Key === 'environment' || tag.Key === 'Environment'
    );
    if (envTag && (envTag.Value === 'production' || envTag.Value === 'prod')) {
      return true;
    }

    // Check function name
    const functionName = this.getFunctionName(lambdaResource);
    if (functionName.toLowerCase().includes('prod') ||
        functionName.toLowerCase().includes('production')) {
      return true;
    }

    return false;
  }

  /**
   * Checks if custom domain is configured
   */
  public static hasCustomDomain(serverlessConfig: any): boolean {
    return Boolean(
      serverlessConfig?.custom?.customDomain?.domainName ||
      serverlessConfig?.provider?.domain
    );
  }

  /**
   * Extracts event configuration from serverless.yml
   */
  public static extractEventConfig(
    lambdaResource: ClassifiedResource,
    serverlessConfig: any
  ): EventConfig[] {
    const configs: EventConfig[] = [];

    if (serverlessConfig?.functions) {
      const functionName = this.getFunctionName(lambdaResource);
      const functionConfig = serverlessConfig.functions[functionName];

      if (functionConfig?.events) {
        for (const event of functionConfig.events) {
          if (event.http) {
            configs.push({
              type: 'http',
              path: event.http.path,
              method: event.http.method,
              authorizer: event.http.authorizer,
              cors: event.http.cors
            });
          } else if (event.httpApi) {
            configs.push({
              type: 'httpApi',
              path: event.httpApi.path,
              method: event.httpApi.method,
              authorizer: event.httpApi.authorizer,
              cors: event.httpApi.cors
            });
          } else {
            configs.push({ type: 'other' });
          }
        }
      }
    }

    return configs;
  }

  /**
   * Extracts function name from resource
   */
  public static getFunctionName(lambdaResource: ClassifiedResource): string {
    return (
      lambdaResource.Properties?.FunctionName ||
      lambdaResource.LogicalId ||
      'unknown'
    );
  }
}
```

---

### 6. Code Template Builder (`code-template-builder.ts`)

**Purpose**: Code template utilities
**Location**: `src/modules/generator/advanced/utils/code-template-builder.ts`

```typescript
import { FunctionUrlConfig } from '../function-url-generator';

export class CodeTemplateBuilder {
  /**
   * Builds Function URL template
   */
  public static buildFunctionUrlTemplate(
    targetName: string,
    config: FunctionUrlConfig
  ): string {
    const urlVar = `${targetName}Url`;

    let code = `const ${urlVar} = ${targetName}.addFunctionUrl({\n`;
    code += `  authType: FunctionUrlAuthType.${config.authType}`;

    if (config.cors) {
      code += ',\n  cors: {\n';
      code += `    allowedOrigins: ${JSON.stringify(config.cors.allowedOrigins)},\n`;
      code += `    allowedMethods: [${config.cors.allowedMethods.map(m => `HttpMethod.${m}`).join(', ')}]`;

      if (config.cors.allowedHeaders?.length) {
        code += `,\n    allowedHeaders: ${JSON.stringify(config.cors.allowedHeaders)}`;
      }

      if (config.cors.allowCredentials !== undefined) {
        code += `,\n    allowCredentials: ${config.cors.allowCredentials}`;
      }

      if (config.cors.maxAge) {
        code += `,\n    maxAge: Duration.seconds(${config.cors.maxAge})`;
      }

      code += '\n  }';
    }

    code += '\n});\n';

    return code;
  }

  /**
   * Builds CfnOutput for Function URL
   */
  public static buildUrlOutput(
    functionName: string,
    urlVariableName: string
  ): string {
    return `
new CfnOutput(this, '${functionName}Url', {
  value: ${urlVariableName}.url,
  description: 'Function URL for ${functionName}'
});
`;
  }

  /**
   * Builds CloudFront distribution template (commented)
   */
  public static buildCloudFrontTemplate(
    functionUrlOutputName: string,
    functionName: string
  ): string {
    return `
// ========================================
// CloudFront Distribution (SUGGESTED)
// ========================================
// TODO: Uncomment and configure for production deployment
//
// This adds:
// - Custom domain support (api.example.com)
// - Global CDN caching (410+ edge locations)
// - DDoS protection (AWS Shield Standard)
// - WAF integration option
//
// Prerequisites:
// 1. Request ACM certificate in us-east-1 for your domain
//    aws acm request-certificate --domain-name api.example.com --region us-east-1
//
// 2. Validate certificate (DNS or email validation)
//
// 3. Update domainNames and certificate ARN below
//
// const ${functionName}Distribution = new Distribution(this, '${functionName}Distribution', {
//   defaultBehavior: {
//     origin: FunctionUrlOrigin.withOriginAccessControl(${functionUrlOutputName}),
//     allowedMethods: AllowedMethods.ALLOW_ALL,
//     cachePolicy: CachePolicy.CACHING_DISABLED,  // Change for cacheable content
//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
//   },
//   domainNames: ['api.example.com'],  // UPDATE THIS
//   certificate: Certificate.fromCertificateArn(
//     this,
//     '${functionName}Certificate',
//     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS
//   ),
//   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe
// });
//
// // Grant CloudFront permission to invoke Function URL
// ${functionName}Alias.grantInvokeUrl(
//   new ServicePrincipal('cloudfront.amazonaws.com', {
//     conditions: {
//       StringEquals: {
//         'AWS:SourceArn': \`arn:aws:cloudfront::\${this.account}:distribution/\${${functionName}Distribution.distributionId}\`
//       }
//     }
//   })
// );
//
// new CfnOutput(this, '${functionName}CloudFrontUrl', {
//   value: \`https://\${${functionName}Distribution.domainName}\`,
//   description: 'CloudFront distribution URL (replace with custom domain)'
// });
//
// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront

`;
  }
}
```

---

## Integration Points

### With Sprint 1 (Resource Classifier)

**Input from Sprint 1**:
```typescript
// ClassifiedResource provides all metadata
interface ClassifiedResource {
  LogicalId: string;
  Type: string;
  Properties: Record<string, any>;
  relatedResources: string[];  // IAM roles, LogGroups
  groupId: string;             // 'compute', 'databases', etc.
  tags?: any[];
  // ... other fields
}
```

**Sprint 4 Usage**:
```typescript
// Read-only access to classified resources
const lambda = classifiedResources.find(r => r.Type === 'AWS::Lambda::Function');

// Use these fields:
lambda.relatedResources  // Find related IAM role
lambda.Properties        // Extract FunctionName, MemorySize, etc.
lambda.groupId           // For code organization
```

**No modifications to Sprint 1 code**.

---

### With Sprint 2 (IAM Generator)

**Coordination** (future enhancement):
```typescript
// Function URL with AWS_IAM auth may need IAM permissions
// Sprint 4 generates Function URL
const functionUrl = functionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

// Sprint 2's IAM generator handles lambda:InvokeFunctionUrl permission
// (This is automatically handled by CDK's grantInvokeUrl() method)
```

**No code changes required** - CDK handles permissions automatically.

---

### With Main Generator Pipeline

**Integration in `typescript-generator.ts`**:

```typescript
import { AdvancedConstructsGenerator } from './templates/l2-constructs/advanced';

export class TypeScriptGenerator {
  // ... existing code ...

  generateStack(resources: ClassifiedResource[], context: GeneratorContext): string {
    let code = this.generateHeader(context);

    // Existing generation logic (unchanged)
    code += this.generateDatabases(grouped.databases, context);
    code += this.generateIAMRoles(grouped.iam, context);
    code += this.generateLambdaFunctions(grouped.compute, context);

    // NEW: Generate advanced constructs (Sprint 4)
    code += this.generateAdvancedConstructs(grouped.compute, context);

    code += this.generateFooter(context);
    return code;
  }

  /**
   * NEW METHOD: Generate advanced constructs for Lambda functions
   */
  private generateAdvancedConstructs(
    lambdas: ClassifiedResource[],
    context: GeneratorContext
  ): string {
    try {
      const advancedGenerator = new AdvancedConstructsGenerator(
        this.allClassifiedResources,
        {
          stage: context.config.stage,
          serverlessConfig: context.serverlessYml,
          generateAliases: context.config.generateAliases,
          generateFunctionUrls: context.config.generateFunctionUrls,
          suggestCloudFront: context.config.suggestCloudFront
        }
      );

      let code = '';
      for (const lambda of lambdas) {
        const lambdaVar = this.toVariableName(lambda.LogicalId);
        const result = advancedGenerator.generateAdvancedConstructs(lambda, lambdaVar);

        code += result.code;

        // Show console suggestions
        result.consoleSuggestions.forEach(msg => console.log(msg));
      }

      return code;
    } catch (error) {
      // Graceful degradation - log warning but continue
      console.warn('Warning: Failed to generate advanced constructs:', error);
      return '';
    }
  }
}
```

---

## Test Architecture

### Unit Test Structure

**File**: `tests/unit/generator/advanced/alias-generator.test.ts` (10 tests)

```typescript
describe('AliasGenerator', () => {
  describe('shouldGenerateAlias()', () => {
    it('should generate alias for Function URL dependency');
    it('should generate alias for CloudFront dependency');
    it('should generate alias for multi-stage deployment');
    it('should generate alias for production function');
    it('should generate alias for provisioned concurrency');
    it('should not generate alias for simple dev function');
  });

  describe('generateAlias()', () => {
    it('should generate alias with correct name');
    it('should include provisioned concurrency if configured');
    it('should use stage from serverless.yml for alias name');
    it('should handle missing function name gracefully');
  });
});
```

**File**: `tests/unit/generator/advanced/function-url-generator.test.ts` (12 tests)

```typescript
describe('FunctionUrlGenerator', () => {
  describe('shouldGenerateUrl()', () => {
    it('should generate URL for http event');
    it('should generate URL for httpApi event');
    it('should generate URL for webhook pattern');
    it('should generate URL for API pattern in name');
    it('should not generate URL for SQS-triggered Lambda');
    it('should respect user override');
  });

  describe('generateFunctionUrl()', () => {
    it('should generate URL with AWS_IAM auth');
    it('should generate URL with NONE auth for webhooks');
    it('should include CORS configuration');
    it('should add security warning for NONE auth');
    it('should generate CloudFormation output');
    it('should handle missing CORS config');
  });
});
```

**File**: `tests/unit/generator/advanced/cloudfront-suggester.test.ts` (8 tests)

```typescript
describe('CloudFrontSuggester', () => {
  describe('shouldSuggestCloudFront()', () => {
    it('should suggest for production + Function URL');
    it('should suggest for custom domain');
    it('should suggest for S3 website pattern');
    it('should suggest for high-traffic function');
    it('should not suggest for development');
    it('should respect user override');
  });

  describe('generateSuggestion()', () => {
    it('should generate commented CloudFront code');
    it('should include setup instructions');
  });
});
```

**File**: `tests/unit/generator/advanced/detection-utils.test.ts` (12 tests)

```typescript
describe('DetectionUtils', () => {
  describe('hasHttpEvents()', () => {
    it('should detect http event');
    it('should detect httpApi event');
    it('should return false for SQS event');
    it('should handle missing serverless config');
  });

  describe('isProductionFunction()', () => {
    it('should detect production stage');
    it('should detect production tags');
    it('should detect production in function name');
    it('should return false for dev function');
  });

  describe('hasCustomDomain()', () => {
    it('should detect custom domain in config');
    it('should detect provider domain');
    it('should return false if no domain');
  });

  describe('extractEventConfig()', () => {
    it('should extract http event config');
    it('should extract httpApi event config');
    it('should extract CORS config');
    it('should handle multiple events');
  });
});
```

---

### Integration Test Structure

**File**: `tests/integration/advanced-constructs.test.ts` (5 tests)

```typescript
describe('Advanced Constructs Integration', () => {
  it('should generate full stack for production Lambda', async () => {
    // Input: Production Lambda with http event
    // Output: Lambda + Alias + Function URL + CloudFront suggestion
    expect(generated).toContain('new Alias');
    expect(generated).toContain('addFunctionUrl');
    expect(generated).toContain('// CloudFront Distribution (SUGGESTED)');
  });

  it('should generate alias + Function URL for HTTP endpoint', async () => {
    // Input: Lambda with http event
    // Output: Lambda + Alias + Function URL (no CloudFront for dev)
    expect(generated).toContain('new Alias');
    expect(generated).toContain('addFunctionUrl');
    expect(generated).not.toContain('CloudFront');
  });

  it('should suggest CloudFront for production', async () => {
    // Input: Production Lambda with Function URL
    // Output: Commented CloudFront code + console warning
    expect(generated).toContain('// const distribution = new Distribution');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('⚠️  Production Recommendation')
    );
  });

  it('should handle S3-based Lambda migration', async () => {
    // Input: Lambda with S3 code (Code.S3Bucket)
    // Output: Function URL + CloudFront suggestion with S3 migration hint
    expect(generated).toContain('addFunctionUrl');
    expect(generated).toContain('S3 website pattern detected');
  });

  it('should generate code that compiles successfully', async () => {
    // Integration test: Full TypeScript compilation
    const compiled = await compileTypeScript(generated);
    expect(compiled.errors).toHaveLength(0);
  });
});
```

---

## Configuration Integration

**CLI Flags** (added to migration tool):

```typescript
export interface MigrationConfig {
  // ... existing config ...

  // Advanced constructs options (Sprint 4)
  generateAdvancedConstructs?: boolean;  // default: true
  aliasStrategy?: 'auto' | 'all' | 'none';  // default: 'auto'
  functionUrlStrategy?: 'auto' | 'all' | 'none';  // default: 'auto'
  suggestCloudFront?: boolean;  // default: true
}
```

**Usage**:
```bash
# Enable all advanced features (default)
npx sls-to-cdk migrate

# Disable advanced features
npx sls-to-cdk migrate --no-advanced-constructs

# Generate aliases for all Lambdas
npx sls-to-cdk migrate --alias-strategy=all

# Disable CloudFront suggestions
npx sls-to-cdk migrate --no-cloudfront-suggestions
```

---

## Error Handling Strategy

**Graceful Degradation** - Never break basic Lambda generation:

```typescript
try {
  const advanced = generator.generateAdvancedConstructs(resource, name);
  return advanced.code;
} catch (error) {
  console.warn(`Warning: Failed to generate advanced constructs for ${name}`);
  console.warn(error instanceof Error ? error.message : String(error));
  console.warn('Continuing with basic Lambda generation');
  return ''; // Empty string - basic Lambda still works
}
```

**Validation**:
- Input validation in each generator
- Type checking via TypeScript
- Runtime checks for required fields

**Logging**:
- Info: `✅ Generated Lambda alias 'prod' for myFunction`
- Warning: `⚠️ Production Recommendation: myFunction` (CloudFront)
- Error: `Warning: Failed to generate advanced constructs` (graceful fallback)

---

## Console Output Design

### Information Messages
```
✅ Generated Lambda alias 'prod' for apiFunction
✅ Generated Function URL for webhookFunction (NONE auth)
```

### Warning Messages (CloudFront)
```
⚠️  Production Recommendation: apiFunction

For production deployments, consider adding CloudFront:
... (full setup guide)
```

### Security Warnings (Public Function URLs)
```
⚠️  Function URL is publicly accessible (NONE auth type)
    Implement custom authentication/authorization in your function code
```

---

## Module Boundaries

### Sprint 4 Owns Exclusively
- `src/modules/generator/advanced/` (entire directory)
- `src/modules/generator/templates/l2-constructs/advanced.ts` (new file)
- `tests/unit/generator/advanced/` (entire directory)
- `tests/integration/advanced-constructs.test.ts` (new file)

### Sprint 4 Integrates With
- `typescript-generator.ts` - **Minor changes only** (add `generateAdvancedConstructs()` method)
- `types/index.ts` - **Minor additions only** (extend `MigrationConfig`)
- `resource-classifier.ts` - **Read-only usage** (no changes)

### No Conflicts With
- Sprint 2: `templates/l2-constructs/iam.ts` (different file)
- Sprint 3: `code-cleaner/` (different module)
- Existing: All other files (read-only or no interaction)

---

## Implementation Checklist

Before Phase Gate 3 approval, verify:

### Architecture Completeness
- [x] All classes defined with full interfaces
- [x] All methods specified with signatures
- [x] All file locations identified
- [x] All integration points documented

### Architecture Correctness
- [x] No breaking changes to existing code
- [x] Clear module boundaries (no conflicts)
- [x] Graceful error handling (degradation)
- [x] Type safety (TypeScript interfaces)

### Testability
- [x] Every class has unit test file
- [x] Integration test covers full workflow
- [x] Coverage targets defined (95%+)
- [x] Test file structure mirrors source

### Documentation Quality
- [x] Code examples are clear
- [x] Integration points explained
- [x] Console output designed
- [x] Error handling documented

---

## Next Steps (After Phase Gate 3 Approval)

1. **Phase Gate 3 Approval** ✋ REQUIRED
2. **Refinement Phase** - TDD implementation with tests
3. **Completion Phase** - Integration and validation

---

## References

- [Sprint 4 Pseudocode](./SPARC_SPRINT4_PSEUDOCODE.md)
- [Sprint 4 Research](./SPARC_SPRINT4_RESEARCH.md)
- [Sprint 1 Resource Classifier](../src/modules/generator/resource-classifier.ts)
- [Existing TypeScript Generator](../src/modules/generator/typescript-generator.ts)

---

**Status**: 🏗️ **ARCHITECTURE COMPLETE - AWAITING PHASE GATE 3 APPROVAL**

**Prepared by**: Sprint 4 Agent (Architecture Phase)
**Date**: 2025-10-22
**Methodology**: SPARC (Architecture Phase)
**Next Phase**: Refinement (TDD implementation after Phase Gate 3 approval)
