# Sprint 4 Pseudocode: Advanced CDK Constructs

**Sprint**: 4 of 5
**Phase**: SPARC Pseudocode
**Date**: 2025-10-22
**Status**: ✅ COMPLETE - Awaiting Phase Gate 2 Approval

---

## Overview

This document provides detailed algorithms for generating Lambda Aliases, Function URLs, and CloudFront suggestions. The decision-making pipeline follows a hierarchical approach:

1. **Detect** - Should we generate this construct?
2. **Generate** - Create the CDK code
3. **Suggest** - Provide commented guidance for manual setup

### High-Level Decision Flow

```
Lambda Function (Classified)
    ↓
    ├─→ Should Generate Alias?
    │   ├─→ Yes: Generate Alias Code
    │   └─→ No: Skip
    ↓
    ├─→ Should Generate Function URL?
    │   ├─→ Yes: Generate URL Code (on alias if exists, else function)
    │   └─→ No: Skip
    ↓
    └─→ Should Suggest CloudFront?
        ├─→ Yes: Generate Commented Code + Console Warning
        └─→ No: Skip
```

---

## Core Algorithms

### 1. AliasGenerator.shouldGenerateAlias()

**Purpose**: Determine if a Lambda Alias should be generated

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `config: MigrationConfig` - User configuration settings

**Output**:
- `boolean` - true if alias should be generated

**Algorithm**:

```pseudocode
FUNCTION shouldGenerateAlias(lambda, config) -> boolean:
    // Priority 1: Function URL dependency
    // Function URLs MUST target aliases (not $LATEST or unpublished versions)
    IF willGenerateFunctionUrl(lambda, config):
        RETURN true
        REASON: "Function URL requires stable alias endpoint"
    END IF

    // Priority 2: CloudFront dependency
    // CloudFront distributions need stable endpoints
    IF willSuggestCloudFront(lambda, config):
        RETURN true
        REASON: "CloudFront requires stable alias endpoint"
    END IF

    // Priority 3: Explicit configuration in serverless.yml
    IF lambda.serverlessConfig?.provider?.stage EXISTS:
        // User has defined stages (dev, staging, prod)
        RETURN true
        REASON: "Multi-stage deployment detected in serverless.yml"
    END IF

    // Priority 4: Production indicators
    IF lambda.tags?.environment == "production" OR
       lambda.tags?.environment == "prod" OR
       lambda.FunctionName CONTAINS "prod" OR
       lambda.FunctionName CONTAINS "production":
        RETURN true
        REASON: "Production function should have alias for rollback capability"
    END IF

    // Priority 5: Provisioned concurrency
    IF lambda.Properties?.ProvisionedConcurrencyConfig EXISTS:
        RETURN true
        REASON: "Provisioned concurrency requires alias"
    END IF

    // Priority 6: Deployment configuration (CodeDeploy)
    IF lambda.Properties?.DeploymentPreference EXISTS:
        // Canary, Linear, or AllAtOnce deployment
        RETURN true
        REASON: "Gradual deployment requires alias for traffic shifting"
    END IF

    // Priority 7: User override
    IF config.lambdaAliases?.enabled == true:
        RETURN true
        REASON: "User configuration explicitly enables aliases"
    END IF

    // Default: No alias for simple development functions
    RETURN false
    REASON: "Simple development function, $LATEST is sufficient"
END FUNCTION
```

**Decision Examples**:

| Scenario | Result | Reason |
|----------|--------|--------|
| Lambda with Function URL | ✅ Generate | Function URLs require alias |
| Lambda with CloudFront | ✅ Generate | CloudFront needs stable endpoint |
| Lambda with stage="prod" | ✅ Generate | Multi-stage deployment |
| Production tagged Lambda | ✅ Generate | Production rollback capability |
| Simple dev Lambda | ❌ Skip | $LATEST sufficient |
| Lambda with ProvisionedConcurrency | ✅ Generate | Alias required for provisioning |

---

### 2. AliasGenerator.generateAlias()

**Purpose**: Generate CDK code for Lambda Alias

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `aliasConfig: AliasConfig` - Alias configuration
- `context: GeneratorContext` - Code generation context

**Output**:
- `string` - TypeScript CDK code for Lambda Alias

**Algorithm**:

```pseudocode
FUNCTION generateAlias(lambda, aliasConfig, context) -> string:
    // Step 1: Determine variable names
    lambdaVar = toVariableName(lambda.LogicalId)      // "myFunction"
    aliasVar = lambdaVar + "Alias"                    // "myFunctionAlias"

    // Step 2: Determine alias name
    aliasName = determineAliasName(lambda, aliasConfig, context)

    // Step 3: Build code string
    code = ""

    // Add section header comment
    IF isFirstAliasInGeneration():
        code += "\n// ========================================\n"
        code += "// Lambda Aliases\n"
        code += "// ========================================\n\n"
    END IF

    // Add inline comment
    code += "// Create alias for version management and gradual deployments\n"

    // Generate alias construct
    code += "const " + aliasVar + " = new Alias(this, '" + lambda.LogicalId + "Alias', {\n"
    code += "  aliasName: '" + aliasName + "',\n"
    code += "  version: " + lambdaVar + ".currentVersion"

    // Add description if provided
    IF aliasConfig.description EXISTS:
        code += ",\n  description: '" + aliasConfig.description + "'"
    ELSE:
        code += ",\n  description: 'Alias for " + aliasName + " environment'"
    END IF

    // Add provisioned concurrency if configured
    IF lambda.Properties?.ProvisionedConcurrencyConfig?.ProvisionedConcurrentExecutions:
        concurrency = lambda.Properties.ProvisionedConcurrencyConfig.ProvisionedConcurrentExecutions
        code += ",\n  provisionedConcurrentExecutions: " + concurrency
    END IF

    // Add traffic shifting if configured
    IF aliasConfig.additionalVersions?.length > 0:
        code += ",\n  additionalVersions: [\n"
        FOR EACH additionalVersion IN aliasConfig.additionalVersions:
            code += "    { version: " + additionalVersion.version + ", weight: " + additionalVersion.weight + " }"
            IF NOT lastItem:
                code += ","
            END IF
            code += "\n"
        END FOR
        code += "  ]"
    END IF

    code += "\n});\n\n"

    RETURN code
END FUNCTION
```

**Helper Function: determineAliasName()**

```pseudocode
FUNCTION determineAliasName(lambda, aliasConfig, context) -> string:
    // Priority 1: Explicit configuration
    IF aliasConfig.aliasName EXISTS:
        RETURN aliasConfig.aliasName
    END IF

    // Priority 2: Serverless.yml stage
    IF lambda.serverlessConfig?.provider?.stage EXISTS:
        stage = lambda.serverlessConfig.provider.stage
        RETURN stage  // "dev", "staging", "prod"
    END IF

    // Priority 3: Environment tags
    IF lambda.tags?.environment EXISTS:
        RETURN lambda.tags.environment  // "production", "staging"
    END IF

    // Priority 4: Environment variable STAGE
    IF context.environmentVariables?.STAGE EXISTS:
        RETURN context.environmentVariables.STAGE
    END IF

    // Priority 5: Config default
    IF context.config?.lambdaAliases?.defaultAliasName EXISTS:
        RETURN context.config.lambdaAliases.defaultAliasName
    END IF

    // Default: "live" (generic production alias)
    RETURN "live"
END FUNCTION
```

**Example Output**:

```typescript
// ========================================
// Lambda Aliases
// ========================================

// Create alias for version management and gradual deployments
const myFunctionAlias = new Alias(this, 'MyFunctionAlias', {
  aliasName: 'prod',
  version: myFunction.currentVersion,
  description: 'Alias for prod environment'
});
```

---

### 3. FunctionUrlGenerator.shouldGenerateUrl()

**Purpose**: Determine if a Lambda Function URL should be generated

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `config: MigrationConfig` - User configuration settings

**Output**:
- `boolean` - true if Function URL should be generated

**Algorithm**:

```pseudocode
FUNCTION shouldGenerateFunctionUrl(lambda, config) -> boolean:
    // Priority 1: Explicit http/httpApi event in serverless.yml
    IF lambda.events EXISTS:
        FOR EACH event IN lambda.events:
            // HTTP event (API Gateway v1)
            IF event.http EXISTS:
                // Check if simple endpoint (no complex features)
                IF isSimpleHttpEndpoint(event.http):
                    RETURN true
                    REASON: "Simple HTTP endpoint - Function URL is cheaper than API Gateway"
                END IF
            END IF

            // HTTP API event (API Gateway v2)
            IF event.httpApi EXISTS:
                IF isSimpleHttpEndpoint(event.httpApi):
                    RETURN true
                    REASON: "Simple HTTP API - Function URL provides direct access"
                END IF
            END IF

            // Explicit Function URL configuration
            IF event.functionUrl EXISTS:
                RETURN true
                REASON: "Function URL explicitly configured in serverless.yml"
            END IF
        END FOR
    END IF

    // Priority 2: Webhook pattern detection
    IF isWebhookPattern(lambda.FunctionName):
        RETURN true
        REASON: "Webhook pattern detected - Function URL ideal for webhooks"
    END IF

    // Priority 3: API endpoint pattern in function name
    IF lambda.FunctionName CONTAINS "api" OR
       lambda.FunctionName CONTAINS "endpoint" OR
       lambda.FunctionName CONTAINS "callback":
        RETURN true
        REASON: "API endpoint pattern in name - likely needs HTTP access"
    END IF

    // Priority 4: User override
    IF config.functionUrls?.enabled == true:
        RETURN true
        REASON: "User configuration explicitly enables Function URLs"
    END IF

    // Default: No Function URL (not all Lambdas need HTTP access)
    RETURN false
    REASON: "No HTTP access indicators - Lambda invoked by events"
END FUNCTION

// Helper: Check if HTTP endpoint is simple (no API Gateway features)
FUNCTION isSimpleHttpEndpoint(httpEvent) -> boolean:
    // Complex features that require API Gateway:
    IF httpEvent.authorizer == "CUSTOM" OR          // Custom authorizer
       httpEvent.requestValidator EXISTS OR         // Request validation
       httpEvent.requestParameters EXISTS OR        // Request parameters
       httpEvent.integration == "AWS" OR            // AWS service integration
       httpEvent.integration == "AWS_PROXY" OR      // AWS proxy integration
       httpEvent.apiKeyRequired == true OR          // API key required
       httpEvent.usagePlan EXISTS:                  // Usage plan/throttling
        RETURN false  // Too complex for Function URL
    END IF

    // Simple patterns suitable for Function URL:
    IF httpEvent.path == "/{proxy+}" OR             // Single catch-all route
       httpEvent.path MATCHES "^/[a-z]+$" OR        // Simple path like "/webhook"
       httpEvent.cors == true:                      // Basic CORS only
        RETURN true   // Simple enough for Function URL
    END IF

    RETURN true  // Default to simple if no complex features
END FUNCTION

// Helper: Detect webhook patterns in function name
FUNCTION isWebhookPattern(functionName) -> boolean:
    IF functionName == null:
        RETURN false
    END IF

    webhookKeywords = ["webhook", "callback", "hook", "receiver", "listener"]
    nameLowercase = functionName.toLowerCase()

    FOR EACH keyword IN webhookKeywords:
        IF nameLowercase CONTAINS keyword:
            RETURN true
        END IF
    END FOR

    RETURN false
END FUNCTION
```

**Decision Examples**:

| Scenario | Result | Reason |
|----------|--------|--------|
| Lambda with `http` event | ✅ Generate | Simple HTTP endpoint |
| Lambda named "github-webhook" | ✅ Generate | Webhook pattern |
| Lambda with custom authorizer | ❌ Skip | Needs API Gateway features |
| Lambda with API key required | ❌ Skip | API Gateway provides key management |
| Lambda triggered by SQS | ❌ Skip | No HTTP access needed |

---

### 4. FunctionUrlGenerator.generateFunctionUrl()

**Purpose**: Generate CDK code for Lambda Function URL

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `targetVar: string` - Variable name to attach URL to (alias or function)
- `config: FunctionUrlConfig` - Function URL configuration
- `context: GeneratorContext` - Code generation context

**Output**:
- `string` - TypeScript CDK code for Function URL

**Algorithm**:

```pseudocode
FUNCTION generateFunctionUrl(lambda, targetVar, config, context) -> string:
    // Step 1: Determine variable names
    urlVar = toVariableName(lambda.LogicalId) + "Url"  // "myFunctionUrl"

    // Step 2: Determine authentication type
    authType = determineAuthType(lambda, config, context)

    // Step 3: Determine CORS configuration
    corsConfig = determineCorsConfig(lambda, config, context)

    // Step 4: Build code string
    code = ""

    // Add section header comment
    IF isFirstFunctionUrlInGeneration():
        code += "\n// ========================================\n"
        code += "// Function URLs\n"
        code += "// ========================================\n\n"
    END IF

    // Add inline comment
    code += "// Add Function URL for direct HTTP(S) invocation\n"

    // Generate Function URL construct
    code += "const " + urlVar + " = " + targetVar + ".addFunctionUrl({\n"
    code += "  authType: FunctionUrlAuthType." + authType

    // Add CORS configuration if needed
    IF corsConfig EXISTS:
        code += ",\n  cors: {\n"
        code += "    allowedOrigins: " + JSON.stringify(corsConfig.allowedOrigins) + ",\n"
        code += "    allowedMethods: [" + generateMethodsArray(corsConfig.allowedMethods) + "]"

        IF corsConfig.allowedHeaders?.length > 0:
            code += ",\n    allowedHeaders: " + JSON.stringify(corsConfig.allowedHeaders)
        END IF

        IF corsConfig.allowCredentials == true:
            code += ",\n    allowCredentials: true"
        END IF

        IF corsConfig.maxAge EXISTS:
            code += ",\n    maxAge: Duration.seconds(" + corsConfig.maxAge + ")"
        END IF

        code += "\n  }"
    END IF

    code += "\n});\n\n"

    // Add security warning for NONE auth
    IF authType == "NONE":
        code += "// ⚠️  WARNING: This Function URL is publicly accessible\n"
        code += "//     Anyone can invoke this function without authentication\n"
        code += "//     Implement custom authentication/authorization in your function code\n\n"
    END IF

    // Add CloudFormation output
    IF config.outputToStack !== false:
        code += generateOutput(lambda, urlVar, authType)
    END IF

    RETURN code
END FUNCTION
```

**Helper Function: determineAuthType()**

```pseudocode
FUNCTION determineAuthType(lambda, config, context) -> "AWS_IAM" | "NONE":
    // Priority 1: Check for authorizer in serverless.yml http events
    IF lambda.events EXISTS:
        FOR EACH event IN lambda.events:
            IF event.http?.authorizer EXISTS OR event.httpApi?.authorizer EXISTS:
                // Has authorizer - use IAM for Function URL
                RETURN "AWS_IAM"
                REASON: "Authorizer configured - requires IAM authentication"
            END IF
        END FOR
    END IF

    // Priority 2: Webhook pattern defaults to NONE (public)
    IF isWebhookPattern(lambda.FunctionName):
        RETURN "NONE"
        REASON: "Webhook pattern - typically requires public access"
    END IF

    // Priority 3: Check function name for "public" keyword
    IF lambda.FunctionName?.toLowerCase() CONTAINS "public":
        RETURN "NONE"
        REASON: "Public indicator in function name"
    END IF

    // Priority 4: User configuration
    IF config.defaultAuthType EXISTS:
        RETURN config.defaultAuthType
        REASON: "User configuration override"
    END IF

    // Priority 5: Context default
    IF context.config?.functionUrls?.defaultAuthType EXISTS:
        RETURN context.config.functionUrls.defaultAuthType
    END IF

    // Default: AWS_IAM (secure by default)
    RETURN "AWS_IAM"
    REASON: "Secure by default - require IAM authentication"
END FUNCTION
```

**Helper Function: determineCorsConfig()**

```pseudocode
FUNCTION determineCorsConfig(lambda, config, context) -> CorsConfig | null:
    // Priority 1: Explicit CORS in config
    IF config.cors EXISTS:
        RETURN config.cors
    END IF

    // Priority 2: Check serverless.yml for CORS configuration
    IF lambda.events EXISTS:
        FOR EACH event IN lambda.events:
            IF event.http?.cors == true OR event.httpApi?.cors == true:
                // Basic CORS enabled
                RETURN {
                    allowedOrigins: ["*"],
                    allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                    allowedHeaders: ["Content-Type", "Authorization"],
                    allowCredentials: false,
                    maxAge: 3600
                }
            END IF

            IF event.http?.cors IS OBJECT OR event.httpApi?.cors IS OBJECT:
                // Custom CORS configuration
                corsEvent = event.http?.cors OR event.httpApi?.cors
                RETURN {
                    allowedOrigins: corsEvent.origins OR corsEvent.origin OR ["*"],
                    allowedMethods: corsEvent.methods OR ["GET", "POST"],
                    allowedHeaders: corsEvent.headers OR corsEvent.allowedHeaders OR ["Content-Type"],
                    allowCredentials: corsEvent.credentials OR false,
                    maxAge: corsEvent.maxAge OR 3600
                }
            END IF
        END FOR
    END IF

    // Priority 3: Context default
    IF context.config?.functionUrls?.cors EXISTS:
        RETURN context.config.functionUrls.cors
    END IF

    // Priority 4: Default CORS for webhook patterns
    IF isWebhookPattern(lambda.FunctionName):
        RETURN {
            allowedOrigins: ["*"],
            allowedMethods: ["POST"],
            allowedHeaders: ["Content-Type", "X-GitHub-Event", "X-Hub-Signature"],
            allowCredentials: false
        }
    END IF

    // Default: No CORS (same-origin only)
    RETURN null
END FUNCTION
```

**Helper Function: generateOutput()**

```pseudocode
FUNCTION generateOutput(lambda, urlVar, authType) -> string:
    functionName = lambda.FunctionName OR lambda.LogicalId

    code = "new CfnOutput(this, '" + lambda.LogicalId + "Url', {\n"
    code += "  value: " + urlVar + ".url,\n"
    code += "  description: 'Function URL for " + functionName

    IF authType == "NONE":
        code += " (Public - No Authentication)'"
    ELSE:
        code += " (AWS IAM Authentication Required)'"
    END IF

    code += "\n});\n\n"

    RETURN code
END FUNCTION
```

**Example Output (IAM Auth)**:

```typescript
// ========================================
// Function URLs
// ========================================

// Add Function URL for direct HTTP(S) invocation
const apiFunctionUrl = apiFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  cors: {
    allowedOrigins: ["https://app.example.com"],
    allowedMethods: [HttpMethod.GET, HttpMethod.POST],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: Duration.seconds(3600)
  }
});

new CfnOutput(this, 'ApiFunctionUrl', {
  value: apiFunctionUrl.url,
  description: 'Function URL for api (AWS IAM Authentication Required)'
});
```

**Example Output (NONE Auth - Webhook)**:

```typescript
// Add Function URL for direct HTTP(S) invocation
const githubWebhookUrl = githubWebhookAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ["Content-Type", "X-GitHub-Event", "X-Hub-Signature"]
  }
});

// ⚠️  WARNING: This Function URL is publicly accessible
//     Anyone can invoke this function without authentication
//     Implement custom authentication/authorization in your function code

new CfnOutput(this, 'GithubWebhookUrl', {
  value: githubWebhookUrl.url,
  description: 'Function URL for githubWebhook (Public - No Authentication)'
});
```

---

### 5. CloudFrontSuggester.shouldSuggestCloudFront()

**Purpose**: Determine if CloudFront distribution should be suggested

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `config: MigrationConfig` - User configuration settings

**Output**:
- `boolean` - true if CloudFront should be suggested

**Algorithm**:

```pseudocode
FUNCTION shouldSuggestCloudFront(lambda, config) -> boolean:
    // CloudFront is NEVER auto-generated, only SUGGESTED
    // This function determines if we should show commented code + console warning

    // Priority 1: Production environment with Function URL
    IF (lambda.tags?.environment == "production" OR
        lambda.tags?.environment == "prod") AND
       hasFunctionUrl(lambda):
        RETURN true
        REASON: "Production deployment with Function URL - CloudFront recommended for custom domain"
    END IF

    // Priority 2: Custom domain configured in serverless.yml
    IF lambda.serverlessConfig?.provider?.domain EXISTS OR
       lambda.serverlessConfig?.custom?.customDomain EXISTS:
        // User wants custom domain - CloudFront provides this for Function URLs
        RETURN true
        REASON: "Custom domain configured - CloudFront enables domain for Function URLs"
    END IF

    // Priority 3: Existing S3 website deployment pattern
    IF hasS3WebsitePattern(lambda):
        RETURN true
        REASON: "S3 website pattern detected - migrate to Function URL + CloudFront"
    END IF

    // Priority 4: High-traffic function (memory > 512MB suggests important function)
    IF lambda.Properties?.MemorySize >= 512 AND
       hasFunctionUrl(lambda):
        RETURN true
        REASON: "High-memory function with URL - CloudFront caching can reduce costs"
    END IF

    // Priority 5: Function with long timeout (suggests complex processing)
    IF lambda.Properties?.Timeout >= 30 AND
       hasFunctionUrl(lambda):
        RETURN true
        REASON: "Long timeout function - CloudFront can cache responses"
    END IF

    // Priority 6: User override
    IF config.cloudFront?.suggest == true:
        RETURN true
        REASON: "User configuration explicitly requests CloudFront suggestions"
    END IF

    // Default: Don't suggest CloudFront
    RETURN false
    REASON: "Development or internal function - CloudFront not needed"
END FUNCTION

// Helper: Detect S3 website deployment pattern
FUNCTION hasS3WebsitePattern(lambda) -> boolean:
    // Pattern 1: Lambda writes to S3 bucket
    writesToS3 = false
    IF lambda.relatedResources EXISTS:
        FOR EACH relatedId IN lambda.relatedResources:
            resource = findResourceById(relatedId)
            IF resource.Type == "AWS::S3::Bucket":
                // Check if Lambda has PutObject permission to this bucket
                IF lambdaHasS3PutPermission(lambda, resource):
                    writesToS3 = true
                END IF
            END IF
        END FOR
    END IF

    // Pattern 2: Environment variable points to S3 bucket
    IF lambda.Environment?.Variables?.S3_BUCKET EXISTS OR
       lambda.Environment?.Variables?.WEBSITE_BUCKET EXISTS:
        writesToS3 = true
    END IF

    // Pattern 3: CloudFormation template has CloudFront with S3 origin
    hasCloudFrontWithS3 = existingCloudFrontWithS3Origin(lambda)

    // If both exist, this is classic S3 website pattern
    IF writesToS3 AND hasCloudFrontWithS3:
        RETURN true
    END IF

    RETURN false
END FUNCTION

// Helper: Check if Lambda has Function URL
FUNCTION hasFunctionUrl(lambda) -> boolean:
    // Check if Function URL will be generated
    RETURN shouldGenerateFunctionUrl(lambda, config)
END FUNCTION
```

**Decision Examples**:

| Scenario | Result | Reason |
|----------|--------|--------|
| Production + Function URL | ✅ Suggest | Custom domain recommended |
| Custom domain in serverless.yml | ✅ Suggest | User wants custom domain |
| S3 website pattern detected | ✅ Suggest | Modernization opportunity |
| High-memory function (1024MB) | ✅ Suggest | Caching can reduce costs |
| Development function | ❌ Skip | CloudFront adds complexity |
| Internal API (no URL) | ❌ Skip | No HTTP access |

---

### 6. CloudFrontSuggester.generateSuggestion()

**Purpose**: Generate commented CloudFront code and console warning

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `urlVar: string` - Function URL variable name
- `aliasVar: string` - Lambda alias variable name
- `config: MigrationConfig` - User configuration settings

**Output**:
- `string` - Commented TypeScript CDK code for CloudFront

**Algorithm**:

```pseudocode
FUNCTION generateSuggestion(lambda, urlVar, aliasVar, config) -> string:
    // Step 1: Build commented CloudFront code
    code = ""

    // Add prominent section header
    code += "\n// ========================================\n"
    code += "// CloudFront Distribution (SUGGESTED)\n"
    code += "// ========================================\n"
    code += "// TODO: Uncomment and configure for production deployment\n"
    code += "//\n"

    // Add benefits explanation
    code += "// This adds:\n"
    code += "// - Custom domain support (api.example.com)\n"
    code += "// - Global CDN caching (410+ edge locations)\n"
    code += "// - DDoS protection (AWS Shield Standard)\n"
    code += "// - WAF integration option\n"
    code += "//\n"

    // Add prerequisites
    code += "// Prerequisites:\n"
    code += "// 1. Request ACM certificate in us-east-1 for your domain\n"
    code += "//    aws acm request-certificate --domain-name api.example.com --region us-east-1\n"
    code += "//\n"
    code += "// 2. Validate certificate (DNS or email validation)\n"
    code += "//\n"
    code += "// 3. Update domainNames and certificate ARN below\n"
    code += "//\n"

    // Generate commented CloudFront distribution
    distVar = toVariableName(lambda.LogicalId) + "Distribution"

    code += "// const " + distVar + " = new Distribution(this, '" + lambda.LogicalId + "Distribution', {\n"
    code += "//   defaultBehavior: {\n"
    code += "//     origin: FunctionUrlOrigin.withOriginAccessControl(" + urlVar + "),\n"
    code += "//     allowedMethods: AllowedMethods.ALLOW_ALL,\n"

    // Determine cache policy based on function type
    cachePolicy = determineCachePolicy(lambda)
    code += "//     cachePolicy: CachePolicy." + cachePolicy + ",\n"

    code += "//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER\n"
    code += "//   },\n"

    // Add domain configuration
    code += "//   domainNames: ['api.example.com'],  // UPDATE THIS\n"
    code += "//   certificate: Certificate.fromCertificateArn(\n"
    code += "//     this,\n"
    code += "//     '" + lambda.LogicalId + "Certificate',\n"
    code += "//     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS\n"
    code += "//   ),\n"
    code += "//   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe\n"
    code += "// });\n"
    code += "//\n"

    // Add IAM permission for CloudFront to invoke Function URL
    code += "// // Grant CloudFront permission to invoke Function URL\n"
    code += "// " + aliasVar + ".grantInvokeUrl(\n"
    code += "//   new ServicePrincipal('cloudfront.amazonaws.com', {\n"
    code += "//     conditions: {\n"
    code += "//       StringEquals: {\n"
    code += "//         'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${" + distVar + ".distributionId}`\n"
    code += "//       }\n"
    code += "//     }\n"
    code += "//   })\n"
    code += "// );\n"
    code += "//\n"

    // Add CloudFormation output
    code += "// new CfnOutput(this, '" + lambda.LogicalId + "CloudFrontUrl', {\n"
    code += "//   value: `https://${" + distVar + ".domainName}`,\n"
    code += "//   description: 'CloudFront distribution URL (replace with custom domain)'\n"
    code += "// });\n"
    code += "//\n"

    // Add documentation link
    code += "// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront\n\n"

    RETURN code
END FUNCTION

// Helper: Determine appropriate cache policy
FUNCTION determineCachePolicy(lambda) -> string:
    // Check if function is for static content
    IF lambda.FunctionName CONTAINS "static" OR
       lambda.FunctionName CONTAINS "assets" OR
       lambda.FunctionName CONTAINS "website":
        RETURN "CACHING_OPTIMIZED"  // Cache everything
    END IF

    // Check if function is for API
    IF lambda.FunctionName CONTAINS "api" OR
       lambda.FunctionName CONTAINS "endpoint":
        RETURN "CACHING_DISABLED"   // APIs typically shouldn't cache
    END IF

    // Default to disabled for safety
    RETURN "CACHING_DISABLED"  // Change to CACHING_OPTIMIZED for cacheable content
END FUNCTION
```

**Console Warning Generation**:

```pseudocode
FUNCTION generateConsoleWarning(lambda, reasons) -> void:
    functionName = lambda.FunctionName OR lambda.LogicalId

    PRINT "\n"
    PRINT "⚠️  Production Recommendation: " + functionName
    PRINT ""
    PRINT "Reason: " + reasons.join(", ")
    PRINT ""
    PRINT "For production deployments, consider adding CloudFront:"
    PRINT ""
    PRINT "1. Custom Domain"
    PRINT "   - Use api.example.com instead of Lambda URL"
    PRINT "   - Professional appearance"
    PRINT "   - SSL certificate via ACM"
    PRINT ""
    PRINT "2. Performance"
    PRINT "   - Global CDN (410+ edge locations)"
    PRINT "   - Reduced latency for global users"
    PRINT "   - Caching for repeated requests"
    PRINT ""
    PRINT "3. Security"
    PRINT "   - DDoS protection (AWS Shield Standard)"
    PRINT "   - WAF integration for advanced filtering"
    PRINT "   - Origin Access Control (OAC) for Lambda"
    PRINT ""
    PRINT "Setup Steps:"
    PRINT "  1. Request ACM certificate in us-east-1"
    PRINT "  2. Uncomment CloudFront code in generated stack"
    PRINT "  3. Update certificate ARN and domain name"
    PRINT "  4. Deploy and update DNS"
    PRINT ""
    PRINT "See commented code in generated stack for CloudFront setup."
    PRINT "Documentation: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront"
    PRINT "\n"
END FUNCTION
```

**Example Output (Commented Code)**:

```typescript
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
// const apiFunctionDistribution = new Distribution(this, 'ApiFunctionDistribution', {
//   defaultBehavior: {
//     origin: FunctionUrlOrigin.withOriginAccessControl(apiFunctionUrl),
//     allowedMethods: AllowedMethods.ALLOW_ALL,
//     cachePolicy: CachePolicy.CACHING_DISABLED,
//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
//   },
//   domainNames: ['api.example.com'],  // UPDATE THIS
//   certificate: Certificate.fromCertificateArn(
//     this,
//     'ApiFunctionCertificate',
//     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS
//   ),
//   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe
// });
//
// // Grant CloudFront permission to invoke Function URL
// apiFunctionAlias.grantInvokeUrl(
//   new ServicePrincipal('cloudfront.amazonaws.com', {
//     conditions: {
//       StringEquals: {
//         'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${apiFunctionDistribution.distributionId}`
//       }
//     }
//   })
// );
//
// new CfnOutput(this, 'ApiFunctionCloudFrontUrl', {
//   value: `https://${apiFunctionDistribution.domainName}`,
//   description: 'CloudFront distribution URL (replace with custom domain)'
// });
//
// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
```

---

## Decision Algorithm (High-Level)

**Purpose**: Orchestrate all generators to produce complete advanced constructs

**Input**:
- `lambda: ClassifiedResource` - The Lambda function resource
- `config: MigrationConfig` - User configuration settings

**Output**:
- `string` - Complete TypeScript CDK code for all advanced constructs

**Algorithm**:

```pseudocode
FUNCTION generateAdvancedConstructs(lambda, config) -> string:
    code = ""
    flags = {
        hasAlias: false,
        hasFunctionUrl: false,
        hasCloudFrontSuggestion: false,
        aliasVar: null,
        urlVar: null
    }

    // ========================================
    // Step 1: Decide if we need alias
    // ========================================
    IF shouldGenerateAlias(lambda, config):
        // Determine alias configuration
        aliasName = determineAliasName(lambda, config)
        aliasConfig = {
            aliasName: aliasName,
            description: "Alias for " + aliasName + " environment"
        }

        // Generate alias code
        aliasCode = generateAlias(lambda, aliasConfig, config)
        code += aliasCode

        // Track state
        flags.hasAlias = true
        flags.aliasVar = toVariableName(lambda.LogicalId) + "Alias"

        // Console output
        PRINT "✅ Generated Lambda alias '" + aliasName + "' for " + lambda.FunctionName
    END IF

    // ========================================
    // Step 2: Decide if we need Function URL
    // ========================================
    IF shouldGenerateFunctionUrl(lambda, config):
        // Determine target (prefer alias over raw function)
        target = flags.hasAlias ? flags.aliasVar : toVariableName(lambda.LogicalId)

        // Determine authentication type
        authType = determineAuthType(lambda, config)

        // Determine CORS configuration
        corsConfig = determineCorsConfig(lambda, config)

        // Generate Function URL code
        urlConfig = {
            authType: authType,
            cors: corsConfig,
            outputToStack: true
        }
        urlCode = generateFunctionUrl(lambda, target, urlConfig, config)
        code += urlCode

        // Track state
        flags.hasFunctionUrl = true
        flags.urlVar = toVariableName(lambda.LogicalId) + "Url"

        // Console output
        PRINT "✅ Generated Function URL for " + lambda.FunctionName + " (" + authType + " auth)"

        // Security warning for NONE auth
        IF authType == "NONE":
            PRINT "⚠️  Function URL is publicly accessible - implement custom auth in function code"
        END IF
    END IF

    // ========================================
    // Step 3: Decide if we should suggest CloudFront
    // ========================================
    IF flags.hasFunctionUrl AND shouldSuggestCloudFront(lambda, config):
        // Generate commented code
        suggestionCode = generateSuggestion(lambda, flags.urlVar, flags.aliasVar, config)
        code += suggestionCode

        // Track state
        flags.hasCloudFrontSuggestion = true

        // Console warning
        reasons = getCloudFrontReasons(lambda)
        generateConsoleWarning(lambda, reasons)
    END IF

    // ========================================
    // Step 4: Handle edge cases
    // ========================================

    // Edge Case 1: Alias without Function URL
    IF flags.hasAlias AND NOT flags.hasFunctionUrl:
        // Add helpful comment about when to add Function URL
        code += "\n// NOTE: Lambda alias created for version management\n"
        code += "// To add Function URL for HTTP access, uncomment:\n"
        code += "// const " + toVariableName(lambda.LogicalId) + "Url = " + flags.aliasVar + ".addFunctionUrl({\n"
        code += "//   authType: FunctionUrlAuthType.AWS_IAM\n"
        code += "// });\n\n"
    END IF

    // Edge Case 2: Multiple HTTP events warning
    IF hasMultipleHttpEvents(lambda):
        code += "\n// ⚠️  NOTE: Multiple HTTP events detected\n"
        code += "//     This Function URL handles ALL HTTP events for this function\n"
        code += "//     Consider:\n"
        code += "//     - Separate functions for different routes (if different auth needed)\n"
        code += "//     - Keep API Gateway if complex routing required\n\n"
    END IF

    // Edge Case 3: S3-based Lambda migration hint
    IF hasS3BasedCode(lambda):
        code += "\n// 💡 MIGRATION OPPORTUNITY:\n"
        code += "//    This function uses S3-based code deployment\n"
        code += "//    Consider migrating to:\n"
        code += "//    1. Local code bundling with NodejsFunction (Sprint 5)\n"
        code += "//    2. Function URL for HTTP access (see above)\n"
        code += "//    3. CloudFront for custom domain (see commented code)\n\n"
    END IF

    RETURN code
END FUNCTION

// Helper: Get reasons for CloudFront suggestion
FUNCTION getCloudFrontReasons(lambda) -> string[]:
    reasons = []

    IF lambda.tags?.environment == "production":
        reasons.push("Production deployment with Function URL")
    END IF

    IF hasS3WebsitePattern(lambda):
        reasons.push("S3 website deployment pattern detected")
    END IF

    IF lambda.serverlessConfig?.custom?.customDomain EXISTS:
        reasons.push("Custom domain configured")
    END IF

    IF lambda.Properties?.MemorySize >= 512:
        reasons.push("High-memory function - caching can reduce costs")
    END IF

    RETURN reasons
END FUNCTION

// Helper: Check for multiple HTTP events
FUNCTION hasMultipleHttpEvents(lambda) -> boolean:
    IF NOT lambda.events:
        RETURN false
    END IF

    httpEventCount = 0
    FOR EACH event IN lambda.events:
        IF event.http OR event.httpApi:
            httpEventCount += 1
        END IF
    END FOR

    RETURN httpEventCount > 1
END FUNCTION

// Helper: Check if Lambda uses S3-based code
FUNCTION hasS3BasedCode(lambda) -> boolean:
    RETURN lambda.Properties?.Code?.S3Bucket EXISTS AND
           lambda.Properties?.Code?.S3Key EXISTS
END FUNCTION
```

---

## Edge Case Handling

### Edge Case 1: Alias Without Function URL

**Scenario**: Alias is generated, but no Function URL is needed (e.g., EventBridge-triggered Lambda with alias for version management)

**Algorithm**:

```pseudocode
IF hasAlias AND NOT hasFunctionUrl:
    code += "\n// NOTE: Lambda alias created for version management\n"
    code += "// To add Function URL for HTTP access, uncomment:\n"
    code += "// const " + lambdaVar + "Url = " + aliasVar + ".addFunctionUrl({\n"
    code += "//   authType: FunctionUrlAuthType.AWS_IAM,\n"
    code += "//   cors: {\n"
    code += "//     allowedOrigins: ['*'],\n"
    code += "//     allowedMethods: [HttpMethod.ALL]\n"
    code += "//   }\n"
    code += "// });\n"
    code += "//\n"
    code += "// new CfnOutput(this, '" + logicalId + "Url', {\n"
    code += "//   value: " + lambdaVar + "Url.url,\n"
    code += "//   description: 'Function URL for " + functionName + "'\n"
    code += "// });\n\n"
END IF
```

**Example Output**:

```typescript
// Create alias for version management and gradual deployments
const processorFunctionAlias = new Alias(this, 'ProcessorFunctionAlias', {
  aliasName: 'prod',
  version: processorFunction.currentVersion,
  description: 'Alias for prod environment'
});

// NOTE: Lambda alias created for version management
// To add Function URL for HTTP access, uncomment:
// const processorFunctionUrl = processorFunctionAlias.addFunctionUrl({
//   authType: FunctionUrlAuthType.AWS_IAM,
//   cors: {
//     allowedOrigins: ['*'],
//     allowedMethods: [HttpMethod.ALL]
//   }
// });
//
// new CfnOutput(this, 'ProcessorFunctionUrl', {
//   value: processorFunctionUrl.url,
//   description: 'Function URL for processorFunction'
// });
```

---

### Edge Case 2: Multiple HTTP Events

**Scenario**: Lambda has multiple `http` events (e.g., `/api/users` and `/api/posts`). Function URL can only provide ONE endpoint.

**Algorithm**:

```pseudocode
FUNCTION hasMultipleHttpEvents(lambda) -> boolean:
    httpEvents = lambda.events.filter(e => e.http OR e.httpApi)
    RETURN httpEvents.length > 1
END FUNCTION

IF hasMultipleHttpEvents(lambda):
    code += "\n// ⚠️  NOTE: Multiple HTTP events detected:\n"

    FOR EACH event IN lambda.events:
        IF event.http OR event.httpApi:
            path = event.http?.path OR event.httpApi?.path
            method = event.http?.method OR event.httpApi?.method OR "ANY"
            code += "//   - " + method + " " + path + "\n"
        END IF
    END FOR

    code += "//\n"
    code += "//   This Function URL handles ALL HTTP events for this function.\n"
    code += "//   The function code must handle routing internally.\n"
    code += "//\n"
    code += "//   Consider:\n"
    code += "//   - Separate functions for different routes (if different auth needed)\n"
    code += "//   - Keep API Gateway if complex routing/validation required\n"
    code += "//   - Use express.js or similar router in function code\n\n"
END IF
```

**Example Output**:

```typescript
// Add Function URL for direct HTTP(S) invocation
const apiFunctionUrl = apiFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

// ⚠️  NOTE: Multiple HTTP events detected:
//   - GET /api/users
//   - POST /api/users
//   - GET /api/posts
//
//   This Function URL handles ALL HTTP events for this function.
//   The function code must handle routing internally.
//
//   Consider:
//   - Separate functions for different routes (if different auth needed)
//   - Keep API Gateway if complex routing/validation required
//   - Use express.js or similar router in function code

new CfnOutput(this, 'ApiFunctionUrl', {
  value: apiFunctionUrl.url,
  description: 'Function URL for api (AWS IAM Authentication Required)'
});
```

---

### Edge Case 3: S3-Based Lambda Migration

**Scenario**: Lambda is deployed using S3 bucket for code (legacy Serverless Framework pattern). Suggest migration to local bundling + Function URL + CloudFront.

**Algorithm**:

```pseudocode
FUNCTION hasS3BasedCode(lambda) -> boolean:
    RETURN lambda.Properties?.Code?.S3Bucket EXISTS AND
           lambda.Properties?.Code?.S3Key EXISTS
END FUNCTION

IF hasS3BasedCode(lambda):
    code += "\n// ========================================\n"
    code += "// MIGRATION OPPORTUNITY: S3-Based Lambda\n"
    code += "// ========================================\n"
    code += "//\n"
    code += "// This function currently uses S3 for code deployment:\n"
    code += "//   Bucket: " + lambda.Properties.Code.S3Bucket + "\n"
    code += "//   Key: " + lambda.Properties.Code.S3Key + "\n"
    code += "//\n"
    code += "// Recommended migration path:\n"
    code += "//\n"
    code += "// 1. Convert to Local Code Bundling (Sprint 5)\n"
    code += "//    Replace S3Bucket/S3Key with local code path:\n"
    code += "//    ```\n"
    code += "//    const " + lambdaVar + " = new NodejsFunction(this, '" + logicalId + "', {\n"
    code += "//      entry: 'src/" + functionName + ".ts',  // Local code\n"
    code += "//      handler: 'handler',\n"
    code += "//      bundling: {\n"
    code += "//        minify: true,\n"
    code += "//        sourceMap: true\n"
    code += "//      }\n"
    code += "//    });\n"
    code += "//    ```\n"
    code += "//\n"
    code += "// 2. Add Function URL for Direct Access (see above)\n"
    code += "//    - Eliminates API Gateway costs\n"
    code += "//    - Simpler HTTP invocation\n"
    code += "//\n"
    code += "// 3. Add CloudFront for Production (see suggested code above)\n"
    code += "//    - Custom domain support\n"
    code += "//    - Global CDN caching\n"
    code += "//    - DDoS protection\n"
    code += "//\n"
    code += "// Migration benefits:\n"
    code += "//   ✅ Remove S3 dependency (simpler architecture)\n"
    code += "//   ✅ Faster deployments (local bundling)\n"
    code += "//   ✅ Lower costs (no S3 storage/requests)\n"
    code += "//   ✅ Better developer experience (local code)\n\n"
END IF
```

**Example Output**:

```typescript
// ========================================
// MIGRATION OPPORTUNITY: S3-Based Lambda
// ========================================
//
// This function currently uses S3 for code deployment:
//   Bucket: my-lambda-deployments
//   Key: functions/api-function-v1.2.3.zip
//
// Recommended migration path:
//
// 1. Convert to Local Code Bundling (Sprint 5)
//    Replace S3Bucket/S3Key with local code path:
//    ```
//    const apiFunction = new NodejsFunction(this, 'ApiFunction', {
//      entry: 'src/api.ts',  // Local code
//      handler: 'handler',
//      bundling: {
//        minify: true,
//        sourceMap: true
//      }
//    });
//    ```
//
// 2. Add Function URL for Direct Access (see above)
//    - Eliminates API Gateway costs
//    - Simpler HTTP invocation
//
// 3. Add CloudFront for Production (see suggested code above)
//    - Custom domain support
//    - Global CDN caching
//    - DDoS protection
//
// Migration benefits:
//   ✅ Remove S3 dependency (simpler architecture)
//   ✅ Faster deployments (local bundling)
//   ✅ Lower costs (no S3 storage/requests)
//   ✅ Better developer experience (local code)
```

---

### Edge Case 4: Custom Domains Already Configured

**Scenario**: Serverless.yml has `custom.customDomain` configured for API Gateway. Don't suggest CloudFront (API Gateway already handles custom domains).

**Algorithm**:

```pseudocode
FUNCTION shouldSuggestCloudFront(lambda, config) -> boolean:
    // ... other checks ...

    // Check for API Gateway custom domain
    IF lambda.serverlessConfig?.custom?.customDomain?.domainName EXISTS:
        apiGatewayDomain = lambda.serverlessConfig.custom.customDomain.domainName

        // User already has custom domain via API Gateway
        // Don't suggest CloudFront (redundant)
        RETURN false
        REASON: "Custom domain already configured via API Gateway"
    END IF

    // ... continue other checks ...
END FUNCTION

// Add explanatory comment when skipping CloudFront
IF hasApiGatewayCustomDomain(lambda):
    code += "\n// NOTE: Custom domain already configured via API Gateway\n"
    code += "//   Domain: " + apiGatewayDomain + "\n"
    code += "//   CloudFront not needed for API Gateway REST APIs\n\n"
END IF
```

---

## Data Structures

### Input

```typescript
interface ClassifiedResource {
  LogicalId: string;
  Type: string;
  Properties: {
    FunctionName?: string;
    Handler?: string;
    Runtime?: string;
    MemorySize?: number;
    Timeout?: number;
    Code?: {
      S3Bucket?: string;
      S3Key?: string;
      ZipFile?: string;
    };
    Role?: string | { 'Fn::GetAtt': string[] } | { Ref: string };
    Environment?: {
      Variables?: Record<string, string>;
    };
    ProvisionedConcurrencyConfig?: {
      ProvisionedConcurrentExecutions: number;
    };
    DeploymentPreference?: {
      Type: string; // Canary10Percent5Minutes, Linear10PercentEvery1Minute, etc.
    };
  };
  events?: Array<{
    http?: {
      path: string;
      method: string;
      authorizer?: string | object;
      cors?: boolean | object;
    };
    httpApi?: {
      path: string;
      method: string;
      authorizer?: string | object;
      cors?: boolean | object;
    };
    functionUrl?: {
      authType: 'AWS_IAM' | 'NONE';
      cors?: object;
    };
  }>;
  tags?: {
    environment?: string;
    [key: string]: string;
  };
  serverlessConfig?: {
    provider?: {
      stage?: string;
      domain?: string;
    };
    custom?: {
      customDomain?: {
        domainName: string;
      };
    };
  };
  relatedResources?: string[];
  needsImport: boolean;
  isStateful: boolean;
  groupId: string;
}

interface MigrationConfig {
  lambdaAliases?: {
    enabled: boolean;
    defaultAliasName?: string;
    multipleAliases?: string[];
  };
  functionUrls?: {
    enabled: boolean;
    defaultAuthType?: 'AWS_IAM' | 'NONE';
    cors?: {
      allowedOrigins: string[];
      allowedMethods: string[];
      allowedHeaders?: string[];
      allowCredentials?: boolean;
      maxAge?: number;
    };
  };
  cloudFront?: {
    suggest: boolean;
    autoGenerate?: boolean; // Always false (too complex)
  };
}
```

### Output

```typescript
interface GeneratedCode {
  aliasCode?: string;      // TypeScript CDK code for Alias
  functionUrlCode?: string; // TypeScript CDK code for Function URL
  cloudFrontCode?: string;  // Commented TypeScript CDK code (suggestion)
  consoleMessages: string[]; // Messages to print to console
}
```

### Internal

```typescript
interface DetectionFlags {
  hasAlias: boolean;
  hasFunctionUrl: boolean;
  hasCloudFrontSuggestion: boolean;
  aliasVar: string | null;
  urlVar: string | null;
}

interface AliasConfig {
  aliasName: string;
  description?: string;
  additionalVersions?: Array<{
    version: string;
    weight: number;
  }>;
}

interface FunctionUrlConfig {
  authType: 'AWS_IAM' | 'NONE';
  cors?: {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders?: string[];
    allowCredentials?: boolean;
    maxAge?: number;
  };
  outputToStack?: boolean;
}

interface CloudFrontSuggestion {
  shouldSuggest: boolean;
  reasons: string[];
  commentedCode: string;
  consoleWarning: string;
}
```

---

## Integration Points

### With Sprint 1 (Resource Classification)

**Inputs from Sprint 1**:
- `ClassifiedResource.relatedResources` - Related IAM roles, LogGroups
- `ClassifiedResource.groupId` - For organizing generated code
- `ClassifiedResource.events` - HTTP events detection
- `ClassifiedResource.tags` - Production detection

**Example**:

```typescript
// Sprint 1 classified this Lambda
const lambda: ClassifiedResource = {
  LogicalId: 'ApiFunction',
  Type: 'AWS::Lambda::Function',
  groupId: 'compute',  // Used for code organization
  relatedResources: ['ApiRole', 'ApiLogGroup'],  // IAM role for permissions
  events: [
    { http: { path: '/api', method: 'GET' } }  // HTTP event → Function URL
  ],
  tags: { environment: 'production' }  // → Alias + CloudFront suggestion
};
```

**Sprint 4 Uses**:
- `events` to detect if Function URL needed
- `tags.environment` to determine alias name and CloudFront suggestion
- `relatedResources` to find IAM role for grantInvokeUrl()

---

### With Sprint 2 (IAM Roles)

**Coordination**:
- Sprint 4 generates Function URLs
- Sprint 2 may need to add `lambda:InvokeFunctionUrl` permission to IAM role

**Example Flow**:

```typescript
// Sprint 2 generates IAM role
const apiRole = new Role(this, 'ApiRole', {
  assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  ]
});

// Sprint 4 generates Function URL on alias
const apiFunctionUrl = apiFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

// Sprint 4 grants CloudFront permission to invoke URL
apiFunctionAlias.grantInvokeUrl(
  new ServicePrincipal('cloudfront.amazonaws.com', {
    conditions: {
      StringEquals: {
        'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
      }
    }
  })
);
```

**Note**: `grantInvokeUrl()` automatically adds resource policy to Lambda, not IAM role.

---

### With Sprint 3 (Code Formatting)

**Sprint 3's Responsibility**:
- Format all generated code (Aliases, Function URLs, CloudFront comments)
- Organize sections with consistent headers
- Add appropriate imports

**Example**:

```typescript
// Sprint 4 generates raw code
const code = generateAdvancedConstructs(lambda, config);
// Output: Raw TypeScript strings

// Sprint 3 formats and organizes
const formatted = formatAndOrganize(code, {
  addImports: true,  // Add Lambda, CloudFront imports
  addSectionHeaders: true,  // Organize with headers
  prettier: true  // Format with Prettier
});

// Final output with imports
import { Alias, FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { Distribution, AllowedMethods, CachePolicy } from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnOutput, Duration } from 'aws-cdk-lib';

// ... formatted code ...
```

---

### With Sprint 5 (Lambda Bundling - Future)

**Sprint 5 Scope**: Migrate from S3-based Lambda code to local bundling with `NodejsFunction`

**Sprint 4's Role**: Detect S3-based pattern and suggest migration

```typescript
// Sprint 4 detects S3 pattern
IF lambda.Properties?.Code?.S3Bucket EXISTS:
    // Add migration comment
    code += "// MIGRATION: Convert from S3-based to locally bundled Lambda\n"
    code += "// See Sprint 5 implementation for NodejsFunction with bundling\n"
END IF
```

**Sprint 5 Implementation** (Future):

```typescript
// OLD (Serverless Framework + S3):
const apiFunction = new Function(this, 'ApiFunction', {
  code: Code.fromBucket(bucket, 'functions/api.zip'),
  handler: 'index.handler',
  runtime: Runtime.NODEJS_20_X
});

// NEW (Sprint 5 - NodejsFunction with local bundling):
const apiFunction = new NodejsFunction(this, 'ApiFunction', {
  entry: 'src/api.ts',  // Local file
  handler: 'handler',
  bundling: {
    minify: true,
    sourceMap: true,
    externalModules: ['aws-sdk']
  }
});

// Sprint 4 continues to work - adds alias and URL
const apiFunctionAlias = new Alias(this, 'ApiFunctionAlias', {
  aliasName: 'prod',
  version: apiFunction.currentVersion
});
```

---

## Complexity Analysis

### Time Complexity

| Operation | Complexity | Explanation |
|-----------|------------|-------------|
| `shouldGenerateAlias()` | O(1) | Constant-time checks on resource properties |
| `generateAlias()` | O(1) | String concatenation, no loops |
| `shouldGenerateFunctionUrl()` | O(e) | e = number of events (typically 1-5) |
| `generateFunctionUrl()` | O(1) | String concatenation |
| `shouldSuggestCloudFront()` | O(r) | r = number of related resources (typically < 10) |
| `generateSuggestion()` | O(1) | String concatenation |
| **Total per Lambda** | **O(e + r)** | Linear in events and related resources |
| **Total for all Lambdas** | **O(n × (e + r))** | n = number of Lambda functions |

**Typical Performance**:
- 10 Lambda functions
- 2 events per Lambda (average)
- 3 related resources per Lambda (average)
- **Total: 10 × (2 + 3) = 50 operations**

### Space Complexity

| Data Structure | Space | Explanation |
|----------------|-------|-------------|
| `ClassifiedResource` | O(1) | Fixed size per resource |
| `DetectionFlags` | O(1) | Boolean flags and strings |
| `Generated Code` | O(k) | k = length of generated code (~500-2000 chars) |
| **Total per Lambda** | **O(k)** | Linear in generated code length |
| **Total for all Lambdas** | **O(n × k)** | n = number of Lambda functions |

**Memory Estimate**:
- 10 Lambda functions
- ~1KB generated code per Lambda
- **Total: 10KB memory** (negligible)

---

## Example Walkthroughs

### Example 1: Simple Dev Lambda (No Constructs)

**Input**:

```yaml
functions:
  processor:
    handler: src/processor.handler
    runtime: nodejs20.x
    events:
      - sqs:
          arn: arn:aws:sqs:us-east-1:123456789012:my-queue
```

**Decision Flow**:

```
1. shouldGenerateAlias(processor, config)
   - No Function URL → false
   - No CloudFront → false
   - No stage configured → false
   - Not production tagged → false
   - Result: ❌ Skip alias

2. shouldGenerateFunctionUrl(processor, config)
   - No http/httpApi events → false
   - Not webhook pattern → false
   - Result: ❌ Skip Function URL

3. shouldSuggestCloudFront(processor, config)
   - No Function URL → false
   - Result: ❌ Skip CloudFront

Final Output: No advanced constructs generated (SQS-triggered Lambda)
```

---

### Example 2: Production Lambda with Alias + Function URL

**Input**:

```yaml
functions:
  api:
    handler: src/api.handler
    runtime: nodejs20.x
    tags:
      environment: production
    events:
      - http:
          path: /api
          method: GET
```

**Decision Flow**:

```
1. shouldGenerateFunctionUrl(api, config)
   - Has http event → true
   - isSimpleHttpEndpoint() → true
   - Result: ✅ Generate Function URL

2. shouldGenerateAlias(api, config)
   - Function URL will be generated → true
   - Result: ✅ Generate Alias
   - Alias name: "production" (from tags.environment)

3. determineAuthType(api, config)
   - No authorizer in http event → default to AWS_IAM
   - Result: AWS_IAM

4. determineCorsConfig(api, config)
   - No cors in http event → null
   - Result: No CORS

5. shouldSuggestCloudFront(api, config)
   - Production + Function URL → true
   - Result: ✅ Suggest CloudFront
```

**Generated Code**:

```typescript
// ========================================
// Lambda Aliases
// ========================================

// Create alias for version management and gradual deployments
const apiFunctionAlias = new Alias(this, 'ApiFunctionAlias', {
  aliasName: 'production',
  version: apiFunction.currentVersion,
  description: 'Alias for production environment'
});

// ========================================
// Function URLs
// ========================================

// Add Function URL for direct HTTP(S) invocation
const apiFunctionUrl = apiFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

new CfnOutput(this, 'ApiFunctionUrl', {
  value: apiFunctionUrl.url,
  description: 'Function URL for api (AWS IAM Authentication Required)'
});

// ========================================
// CloudFront Distribution (SUGGESTED)
// ========================================
// TODO: Uncomment and configure for production deployment
// ... (full CloudFront commented code)
```

**Console Output**:

```
✅ Generated Lambda alias 'production' for api
✅ Generated Function URL for api (AWS_IAM auth)

⚠️  Production Recommendation: api

Reason: Production deployment with Function URL

For production deployments, consider adding CloudFront:
... (full warning)
```

---

### Example 3: Full Stack (Alias + URL + CloudFront Suggestion)

**Input**:

```yaml
functions:
  website:
    handler: src/website.handler
    runtime: nodejs20.x
    memorySize: 1024
    timeout: 30
    tags:
      environment: prod
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
```

**Decision Flow**:

```
1. shouldGenerateFunctionUrl(website, config)
   - Has http event with /{proxy+} → true
   - isSimpleHttpEndpoint() → true
   - Result: ✅ Generate Function URL

2. shouldGenerateAlias(website, config)
   - Function URL will be generated → true
   - Result: ✅ Generate Alias
   - Alias name: "prod" (from tags.environment)

3. determineAuthType(website, config)
   - No authorizer → default to AWS_IAM
   - Result: AWS_IAM

4. determineCorsConfig(website, config)
   - cors: true in http event → generate CORS
   - Result: {
       allowedOrigins: ["*"],
       allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
       allowedHeaders: ["Content-Type", "Authorization"],
       allowCredentials: false,
       maxAge: 3600
     }

5. shouldSuggestCloudFront(website, config)
   - Production → true
   - Function URL → true
   - High memory (1024MB) → true
   - Long timeout (30s) → true
   - Result: ✅ Suggest CloudFront
   - Reasons: ["Production deployment with Function URL", "High-memory function - caching can reduce costs"]
```

**Generated Code**:

```typescript
// ========================================
// Lambda Aliases
// ========================================

// Create alias for version management and gradual deployments
const websiteFunctionAlias = new Alias(this, 'WebsiteFunctionAlias', {
  aliasName: 'prod',
  version: websiteFunction.currentVersion,
  description: 'Alias for prod environment'
});

// ========================================
// Function URLs
// ========================================

// Add Function URL for direct HTTP(S) invocation
const websiteFunctionUrl = websiteFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.OPTIONS],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: Duration.seconds(3600)
  }
});

new CfnOutput(this, 'WebsiteFunctionUrl', {
  value: websiteFunctionUrl.url,
  description: 'Function URL for website (AWS IAM Authentication Required)'
});

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
// ... (full commented CloudFront code)
```

**Console Output**:

```
✅ Generated Lambda alias 'prod' for website
✅ Generated Function URL for website (AWS_IAM auth)

⚠️  Production Recommendation: website

Reason: Production deployment with Function URL, High-memory function - caching can reduce costs

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
```

---

### Example 4: S3-Based Lambda Migration

**Input**:

```yaml
functions:
  legacy:
    handler: index.handler
    runtime: nodejs20.x
    package:
      artifact: s3://my-bucket/functions/legacy.zip
    events:
      - http:
          path: /legacy
          method: GET
```

**Decision Flow**:

```
1. Detect S3-based code:
   - Properties.Code.S3Bucket exists → true
   - hasS3BasedCode() → true

2. shouldGenerateFunctionUrl()
   - Has http event → true
   - Result: ✅ Generate Function URL

3. shouldGenerateAlias()
   - Function URL will be generated → true
   - Result: ✅ Generate Alias

4. shouldSuggestCloudFront()
   - Has Function URL → true
   - Result: ✅ Suggest CloudFront

5. Additional: Add S3 migration comment
```

**Generated Code**:

```typescript
// ========================================
// Lambda Aliases
// ========================================

// Create alias for version management and gradual deployments
const legacyFunctionAlias = new Alias(this, 'LegacyFunctionAlias', {
  aliasName: 'live',
  version: legacyFunction.currentVersion,
  description: 'Alias for live environment'
});

// ========================================
// Function URLs
// ========================================

// Add Function URL for direct HTTP(S) invocation
const legacyFunctionUrl = legacyFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

new CfnOutput(this, 'LegacyFunctionUrl', {
  value: legacyFunctionUrl.url,
  description: 'Function URL for legacy (AWS IAM Authentication Required)'
});

// ========================================
// MIGRATION OPPORTUNITY: S3-Based Lambda
// ========================================
//
// This function currently uses S3 for code deployment:
//   Bucket: my-bucket
//   Key: functions/legacy.zip
//
// Recommended migration path:
//
// 1. Convert to Local Code Bundling (Sprint 5)
//    Replace S3Bucket/S3Key with local code path:
//    ```
//    const legacyFunction = new NodejsFunction(this, 'LegacyFunction', {
//      entry: 'src/legacy.ts',  // Local code
//      handler: 'handler',
//      bundling: {
//        minify: true,
//        sourceMap: true
//      }
//    });
//    ```
// ... (full migration guide)

// ========================================
// CloudFront Distribution (SUGGESTED)
// ========================================
// ... (full CloudFront suggestion)
```

---

## Console Output Design

### Information Messages

```bash
✅ Generated Lambda alias 'live' for myFunction
✅ Generated Lambda alias 'prod' for apiFunction
✅ Generated Function URL for webhookFunction (NONE auth)
✅ Generated Function URL for apiFunction (AWS_IAM auth)
```

### Suggestion Messages

```bash
💡 Consider adding CloudFront distribution for production
💡 Function URL available - see CloudFormation outputs for URL
💡 Multiple aliases generated - use 'dev', 'staging', 'prod' for deployments
```

### Warning Messages

```bash
⚠️  Function URL is publicly accessible (NONE auth type)
    Implement custom authentication/authorization in your function code

⚠️  Multiple HTTP events detected - Function URL handles all routes
    Consider separate functions or API Gateway for complex routing

⚠️  Production Recommendation: apiFunction

    Reason: Production deployment with Function URL

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
```

### Error Messages (Edge Cases)

```bash
❌ Cannot generate Function URL: Lambda has no alias (create alias first)
❌ CloudFront suggestion skipped: Custom domain already configured via API Gateway
```

---

## Phase Gate 2 Review Checklist

**Before proceeding to Architecture Phase**, verify:

### Algorithm Completeness
- [x] All detection algorithms defined (Alias, Function URL, CloudFront)
- [x] All generation algorithms defined
- [x] Edge cases handled (multiple events, S3 migration, etc.)
- [x] Decision logic is comprehensive

### Algorithm Correctness
- [x] Detection logic matches AWS best practices
- [x] Generation logic produces valid CDK code
- [x] Security considerations addressed (IAM auth default, NONE warnings)
- [x] Performance patterns followed (prefer alias over $LATEST)

### Implementability
- [x] Algorithms are clear and unambiguous
- [x] Data structures are well-defined
- [x] Integration points are specified
- [x] Console output is helpful

### Examples
- [x] Walkthroughs demonstrate all scenarios
- [x] Edge cases are illustrated
- [x] Generated code examples are valid
- [x] Console output examples are clear

---

## Next Steps (After Phase Gate 2 Approval)

1. **Phase Gate 2 Approval** ✋ REQUIRED
2. **Architecture Phase** - Module structure, class design
3. **Refinement Phase** - TDD implementation with tests
4. **Completion Phase** - Integration and validation

---

## References

- [Sprint 4 Research Document](./SPARC_SPRINT4_RESEARCH.md)
- [Sprint 1 Resource Classifier](../src/modules/generator/resource-classifier.ts)
- [AWS Lambda Aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html)
- [AWS Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [CloudFront + Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront)

---

**Status**: ✅ **PSEUDOCODE COMPLETE - AWAITING PHASE GATE 2 APPROVAL**

**Prepared by**: Sprint 4 Agent (Pseudocode Phase)
**Date**: 2025-10-22
**Methodology**: SPARC (Pseudocode Phase)
**Next Phase**: Architecture (after Phase Gate 2 approval)
