# Sprint 4 Research & Specification: Advanced CDK Constructs

**Sprint**: 4 of 5
**Phase**: SPARC Specification
**Date**: 2025-10-22
**Status**: ✅ COMPLETE - Awaiting Phase Gate Approval

---

## Executive Summary

This research document specifies the requirements and implementation strategy for **Sprint 4: Advanced CDK Constructs**. We will enhance the migration tool to generate production-ready Lambda configurations including:

1. **Lambda Aliases** - Version management for gradual deployments
2. **Function URLs** - Direct HTTP(S) access without API Gateway
3. **CloudFront Integration** - CDN and custom domains for Lambda Function URLs

These features transform basic Lambda migrations into production-ready, enterprise-grade deployments.

---

## 1. Lambda Aliases

### 1.1 Overview

**AWS Lambda Aliases** are mutable pointers to specific Lambda function versions. They enable:
- **Version management**: Point to immutable version numbers ($LATEST, 1, 2, etc.)
- **Gradual deployments**: Weighted traffic shifting between versions
- **Environment isolation**: Separate dev/staging/prod aliases
- **Zero-downtime updates**: Update alias target without changing downstream integrations

### 1.2 When to Use Lambda Aliases

#### ✅ Use Aliases When:
- **Production deployments** - Need rollback capability
- **Blue/green deployments** - Gradual traffic shifting required
- **Multiple environments** - Same function, different aliases (dev/staging/prod)
- **Stable endpoints** - Downstream systems reference alias ARN (not function ARN)
- **CI/CD pipelines** - Automated deployments with rollback
- **Function URLs** - Must use alias (not $LATEST or unpublished versions)
- **CloudFront origins** - Requires stable endpoint (alias provides this)

#### ❌ Don't Use Aliases When:
- **Development/testing** - $LATEST is sufficient
- **One-off functions** - No deployment pipeline
- **Internal Lambda-to-Lambda** - Direct function ARN is simpler
- **No versioning needed** - Simple functions that rarely change

### 1.3 Aliases vs Versions

| Feature | Version | Alias |
|---------|---------|-------|
| **Mutability** | Immutable | Mutable (can point to different versions) |
| **Identifier** | Numeric ($LATEST, 1, 2) | Named (dev, staging, prod) |
| **Traffic Shifting** | No | Yes (weighted routing) |
| **ARN Format** | `arn:aws:lambda:region:account:function:name:version` | `arn:aws:lambda:region:account:function:name:alias` |
| **Use Case** | Snapshots | Environments |

**Key Insight**: Versions are immutable snapshots; aliases are mutable pointers. Always use aliases for Function URLs and CloudFront.

### 1.4 CDK Patterns for Lambda Aliases

#### Pattern 1: Simple Alias
```typescript
import { Alias } from 'aws-cdk-lib/aws-lambda';

const prodAlias = new Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version: myFunction.currentVersion
});
```

#### Pattern 2: Alias with Traffic Shifting (Blue/Green)
```typescript
const version1 = myFunction.currentVersion;
const version2 = new Version(this, 'Version2', {
  lambda: myFunction,
  codeSha256: '...'
});

const prodAlias = new Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version: version2,
  additionalVersions: [
    { version: version1, weight: 0.2 }  // 20% traffic to v1, 80% to v2
  ]
});
```

#### Pattern 3: Multiple Environment Aliases
```typescript
const devAlias = new Alias(this, 'DevAlias', {
  aliasName: 'dev',
  version: myFunction.currentVersion
});

const stagingAlias = new Alias(this, 'StagingAlias', {
  aliasName: 'staging',
  version: myFunction.currentVersion
});

const prodAlias = new Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version: myFunction.currentVersion
});
```

### 1.5 Integration Requirements

#### Detection Logic
When should the migration tool generate aliases?

```typescript
function shouldGenerateAlias(lambda: ClassifiedResource): boolean {
  // Generate alias if ANY of these conditions are true:
  return (
    lambda.hasEnvironmentStages ||           // serverless.yml has stages
    lambda.hasFunctionUrl ||                 // Function URL requires alias
    lambda.hasCloudFrontIntegration ||       // CloudFront requires stable endpoint
    lambda.tags?.includes('production') ||   // Tagged as production
    config.alwaysGenerateAliases             // User config
  );
}
```

#### Generated Code Template
```typescript
// Create alias for version management and gradual deployments
const {{lambdaVar}}Alias = new Alias(this, '{{LogicalId}}Alias', {
  aliasName: '{{stage}}',  // e.g., 'dev', 'staging', 'prod'
  version: {{lambdaVar}}.currentVersion,
  description: 'Alias for {{stage}} environment'
});
```

#### Configuration Options
```typescript
interface AliasConfig {
  enabled: boolean;              // Generate aliases at all?
  defaultAliasName: string;      // Default: 'live' or stage name
  multipleAliases: string[];     // ['dev', 'staging', 'prod']
  trafficShifting?: {
    enabled: boolean;
    oldVersionWeight?: number;   // 0-1
  };
}
```

---

## 2. Function URLs

### 2.1 Overview

**Lambda Function URLs** are dedicated HTTPS endpoints for Lambda functions, introduced in April 2022. They provide:
- **Built-in HTTPS endpoint** - No API Gateway required
- **Automatic scaling** - Handles millions of requests
- **Simple authentication** - AWS_IAM or NONE
- **CORS support** - Native browser integration
- **Low cost** - No API Gateway charges ($0.20/million requests saved)

**URL Format**: `https://<url-id>.lambda-url.<region>.on.aws/`

### 2.2 When to Use Function URLs vs API Gateway

#### ✅ Use Function URLs When:
- **Simple HTTP endpoint** - Single-purpose function
- **Webhooks** - GitHub, Stripe, Slack integrations
- **Serverless websites** - Static rendering or SSR
- **Cost-sensitive** - Minimize API Gateway costs
- **Low latency** - Direct invocation (no API Gateway hop)
- **Public endpoints with IAM** - AWS Signature V4 auth sufficient

#### ✅ Use API Gateway When:
- **Complex routing** - Multiple endpoints, path parameters
- **Request/response transformation** - Mapping templates needed
- **Request validation** - JSON schema validation
- **Rate limiting/throttling** - API Gateway quotas
- **API keys** - Need API key management
- **Custom domains with certificates** - ACM integration
- **WebSocket support** - Real-time bidirectional communication
- **REST API standards** - OpenAPI/Swagger documentation

#### Comparison Table

| Feature | Function URL | API Gateway |
|---------|--------------|-------------|
| **Cost** | $0 (only Lambda invocation) | $3.50/million requests + Lambda |
| **Latency** | ~10ms lower | Higher (extra hop) |
| **Custom Domain** | Via CloudFront only | Native support |
| **Auth** | AWS_IAM or NONE | IAM, Cognito, Lambda, API Keys |
| **Rate Limiting** | No | Yes |
| **Request Validation** | No | Yes |
| **CORS** | Native | Via configuration |
| **Use Case** | Simple endpoints, webhooks | Complex APIs |

### 2.3 Authentication Patterns

#### Pattern 1: AWS_IAM Authentication
```typescript
const url = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  cors: {
    allowedOrigins: ['https://example.com'],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['Authorization', 'Content-Type']
  }
});

// Client must sign requests with AWS Signature V4
// Use AWS SDK or aws4fetch library
```

**When to use**:
- Internal AWS services calling Lambda
- Applications using AWS SDK
- Need IAM-based access control

#### Pattern 2: NONE Authentication (Public)
```typescript
const url = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethod.ALL],
    allowCredentials: false
  }
});

// Publicly accessible - anyone can invoke
// Implement custom auth in function code (JWT, API key, etc.)
```

**When to use**:
- Public webhooks (GitHub, Stripe)
- Browser-based applications
- Custom authentication in Lambda

**⚠️ Security Warning**: NONE auth makes endpoint public. Implement custom auth in function code.

### 2.4 CORS Configuration

```typescript
interface FunctionUrlCorsOptions {
  allowedOrigins: string[];      // ['https://example.com', '*']
  allowedMethods: HttpMethod[];  // [HttpMethod.GET, HttpMethod.POST]
  allowedHeaders?: string[];     // ['Content-Type', 'Authorization']
  exposedHeaders?: string[];     // Response headers to expose
  allowCredentials?: boolean;    // Include cookies/auth headers
  maxAge?: Duration;             // Cache preflight for X seconds
}
```

**Common Patterns**:
```typescript
// 1. Public API - any origin
cors: {
  allowedOrigins: ['*'],
  allowedMethods: [HttpMethod.ALL]
}

// 2. Specific domain
cors: {
  allowedOrigins: ['https://app.example.com'],
  allowedMethods: [HttpMethod.GET, HttpMethod.POST],
  allowedHeaders: ['Content-Type', 'X-Api-Key'],
  maxAge: Duration.hours(1)
}

// 3. Authenticated app
cors: {
  allowedOrigins: ['https://app.example.com'],
  allowedMethods: [HttpMethod.ALL],
  allowedHeaders: ['Authorization', 'Content-Type'],
  allowCredentials: true,
  maxAge: Duration.hours(6)
}
```

### 2.5 CDK Patterns for Function URLs

#### Pattern 1: Basic Function URL
```typescript
const url = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

new CfnOutput(this, 'FunctionUrl', {
  value: url.url,
  description: 'Lambda Function URL'
});
```

#### Pattern 2: Public Function URL with CORS
```typescript
const url = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['Content-Type']
  }
});

new CfnOutput(this, 'WebhookUrl', {
  value: url.url,
  description: 'Public webhook endpoint'
});
```

#### Pattern 3: Function URL with Resource Policy
```typescript
const url = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

// Grant invoke permission to specific principal
myFunctionAlias.grantInvokeUrl(
  new AccountPrincipal('123456789012')
);
```

### 2.6 Integration Requirements

#### Detection Logic
When should the migration tool generate Function URLs?

```typescript
function shouldGenerateFunctionUrl(lambda: ClassifiedResource): boolean {
  // Generate Function URL if ANY of these are true:
  return (
    lambda.isWebhook ||                      // Webhook pattern detected
    lambda.hasHttpEvent ||                   // serverless.yml http event
    lambda.tags?.includes('http-endpoint') || // Tagged as HTTP endpoint
    lambda.hasS3WebsiteDeployment ||         // Replacing S3 website
    config.generateFunctionUrls              // User config
  );
}
```

#### Generated Code Template
```typescript
// Add Function URL for direct HTTP(S) invocation
const {{lambdaVar}}Url = {{aliasVar}}.addFunctionUrl({
  authType: FunctionUrlAuthType.{{authType}},  // AWS_IAM or NONE
  cors: {
    allowedOrigins: {{allowedOrigins}},
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

new CfnOutput(this, '{{LogicalId}}Url', {
  value: {{lambdaVar}}Url.url,
  description: 'Function URL for {{functionName}}'
});
```

#### Configuration Options
```typescript
interface FunctionUrlConfig {
  enabled: boolean;
  defaultAuthType: 'AWS_IAM' | 'NONE';
  cors: {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowCredentials: boolean;
  };
  outputToCloudFormation: boolean;  // CfnOutput or not
}
```

---

## 3. CloudFront Integration

### 3.1 Overview

**Amazon CloudFront** is a global CDN (Content Delivery Network) that can sit in front of Lambda Function URLs to provide:
- **Custom domains** - `api.example.com` instead of `abc123.lambda-url.us-east-1.on.aws`
- **SSL/TLS certificates** - ACM certificates for custom domains
- **Global caching** - 410+ edge locations worldwide
- **DDoS protection** - AWS Shield Standard (free)
- **WAF integration** - Web Application Firewall
- **Better performance** - Caching and edge compute
- **Cost optimization** - Reduce Lambda invocations via caching

### 3.2 When to Use CloudFront in Front of Lambda

#### ✅ Use CloudFront When:
- **Custom domain required** - `api.example.com` instead of Lambda URL
- **Global audience** - Users worldwide need low latency
- **Cacheable content** - Static assets, API responses
- **SSL certificate needed** - ACM certificate for custom domain
- **DDoS protection** - Extra security layer
- **WAF rules** - Need IP filtering, rate limiting
- **Production deployment** - Enterprise-grade setup
- **Cost optimization** - Reduce Lambda invocations with caching

#### ❌ Don't Use CloudFront When:
- **Development/testing** - Adds complexity
- **Internal APIs** - No public access needed
- **Real-time only** - No cacheable content
- **Budget constraints** - CloudFront adds cost (unless caching offsets Lambda cost)

### 3.3 Origin Access Control (OAC) Pattern

**Origin Access Control (OAC)** is the modern way to secure CloudFront → Lambda Function URLs. It replaces Origin Access Identity (OAI, S3-only).

#### Why OAC?
- **IAM-based authentication** - CloudFront signs requests with Signature V4
- **Prevents direct access** - Users can't bypass CloudFront to hit Lambda URL
- **Supports Function URLs** - OAI only supports S3
- **Best practice** - AWS-recommended approach (2023+)

#### OAC Pattern
```typescript
import { Distribution, OriginAccessControl } from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

// 1. Create Function URL with AWS_IAM auth
const functionUrl = myFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM
});

// 2. Create Origin Access Control
const oac = new OriginAccessControl(this, 'OAC', {
  originAccessControlName: 'MyLambdaOAC',
  signing: {
    signingBehavior: 'always',    // Always sign requests
    signingProtocol: 'sigv4'       // Use Signature V4
  }
});

// 3. Create CloudFront distribution
const distribution = new Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new FunctionUrlOrigin(functionUrl, {
      originAccessControl: oac
    }),
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_DISABLED,  // or custom policy
    originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
  },
  domainNames: ['api.example.com'],
  certificate: Certificate.fromCertificateArn(this, 'Cert', certArn)
});

// 4. Grant CloudFront permission to invoke Function URL
myFunctionAlias.grantInvokeUrl(
  new ServicePrincipal('cloudfront.amazonaws.com', {
    conditions: {
      StringEquals: {
        'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
      }
    }
  })
);
```

### 3.4 Replacing S3-Based Lambda with CloudFront + Function URL

Many Serverless Framework deployments use **S3 + CloudFront** to host Lambda-generated content:
1. Lambda writes HTML/JSON to S3
2. CloudFront serves from S3
3. Users access via CloudFront domain

**Migration Path**:
```
OLD: Lambda → S3 Bucket → CloudFront
NEW: Lambda Function URL ← CloudFront (direct origin)
```

**Benefits**:
- ✅ Remove S3 dependency (one less service)
- ✅ Real-time responses (no S3 write delay)
- ✅ Simpler architecture
- ✅ Lower cost (no S3 storage/requests)

#### Migration Steps
1. **Detect S3-based Lambda deployment** - Check for S3 bucket + CloudFront in template
2. **Generate Function URL** - Replace S3 origin with Function URL origin
3. **Configure caching** - Match old cache behavior
4. **Add OAC** - Secure Function URL access
5. **Update DNS** - Point to new CloudFront distribution

### 3.5 CDK Patterns for CloudFront + Lambda

#### Pattern 1: Basic CloudFront + Function URL
```typescript
import { Distribution, CachePolicy, AllowedMethods } from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

const distribution = new Distribution(this, 'MyDistribution', {
  defaultBehavior: {
    origin: new FunctionUrlOrigin(functionUrl),
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_DISABLED  // No caching for APIs
  }
});
```

#### Pattern 2: CloudFront with Custom Cache Policy
```typescript
const cachePolicy = new CachePolicy(this, 'ApiCachePolicy', {
  cachePolicyName: 'ApiCachePolicy',
  defaultTtl: Duration.minutes(5),
  maxTtl: Duration.hours(1),
  minTtl: Duration.seconds(0),
  headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
  queryStringBehavior: CacheQueryStringBehavior.all(),
  cookieBehavior: CacheCookieBehavior.none(),
  enableAcceptEncodingGzip: true,
  enableAcceptEncodingBrotli: true
});

const distribution = new Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: FunctionUrlOrigin.withOriginAccessControl(functionUrl),
    cachePolicy,
    allowedMethods: AllowedMethods.ALLOW_ALL
  }
});
```

#### Pattern 3: CloudFront with Custom Domain
```typescript
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';

const certificate = Certificate.fromCertificateArn(
  this,
  'Certificate',
  'arn:aws:acm:us-east-1:123456789012:certificate/...'
);

const distribution = new Distribution(this, 'Distribution', {
  domainNames: ['api.example.com'],
  certificate,
  defaultBehavior: {
    origin: FunctionUrlOrigin.withOriginAccessControl(functionUrl),
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_OPTIMIZED
  },
  priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe
});

// Add DNS record (Route53)
new ARecord(this, 'AliasRecord', {
  zone: hostedZone,
  recordName: 'api',
  target: RecordTarget.fromAlias(new CloudFrontTarget(distribution))
});
```

### 3.6 Integration Requirements

#### Detection Logic
When should the migration tool suggest CloudFront?

```typescript
function shouldSuggestCloudFront(lambda: ClassifiedResource): boolean {
  // Suggest CloudFront if ANY of these are true:
  return (
    lambda.hasExistingCloudFront ||          // Already using CloudFront
    lambda.hasS3WebsiteDeployment ||         // S3 website pattern
    lambda.hasFunctionUrl ||                 // Function URL exists
    lambda.requiresCustomDomain ||           // Custom domain needed
    lambda.tags?.includes('production') ||   // Production deployment
    config.suggestCloudFront                 // User config
  );
}
```

#### Generated Code (Suggestion Pattern)
Since CloudFront requires additional configuration (certificate, domain), we **suggest** rather than **generate**:

```typescript
// ========================================
// CloudFront Distribution (SUGGESTED)
// ========================================
// TODO: Uncomment and configure for production deployment
// This adds:
// - Custom domain support (api.example.com)
// - Global CDN caching (410+ edge locations)
// - DDoS protection (AWS Shield)
// - WAF integration option
//
// Prerequisites:
// 1. Request ACM certificate in us-east-1 for your domain
// 2. Validate certificate (DNS or email validation)
// 3. Update domainNames and certificate ARN below
//
// const distribution = new Distribution(this, '{{LogicalId}}Distribution', {
//   defaultBehavior: {
//     origin: FunctionUrlOrigin.withOriginAccessControl({{functionUrlVar}}),
//     allowedMethods: AllowedMethods.ALLOW_ALL,
//     cachePolicy: CachePolicy.CACHING_DISABLED,  // Change for cacheable content
//     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
//   },
//   domainNames: ['api.example.com'],  // UPDATE THIS
//   certificate: Certificate.fromCertificateArn(
//     this,
//     'Certificate',
//     'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERTIFICATE_ID'  // UPDATE THIS
//   ),
//   priceClass: PriceClass.PRICE_CLASS_100
// });
//
// // Grant CloudFront permission to invoke Function URL
// {{aliasVar}}.grantInvokeUrl(
//   new ServicePrincipal('cloudfront.amazonaws.com', {
//     conditions: {
//       StringEquals: {
//         'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
//       }
//     }
//   })
// );
//
// new CfnOutput(this, '{{LogicalId}}CloudFrontUrl', {
//   value: `https://${distribution.domainName}`,
//   description: 'CloudFront distribution URL'
// });
```

#### Console Warning Pattern
```typescript
// Also emit console warning during generation:
console.warn(`
⚠️  Production Recommendation: ${lambdaName}
   Consider adding CloudFront for:
   - Custom domain (api.example.com)
   - Global caching and performance
   - DDoS protection

   See commented code in generated stack for CloudFront setup.
`);
```

---

## 4. Decision Matrix

| Scenario | Recommended Pattern | Rationale |
|----------|---------------------|-----------|
| **Development/Testing** | Lambda only | Simplest setup, no versioning needed |
| **Production (simple)** | Lambda + Alias | Enables rollback and gradual deployments |
| **HTTP Endpoint (internal)** | Lambda + Alias + Function URL (IAM) | Direct invocation, AWS IAM auth |
| **Webhook (public)** | Lambda + Alias + Function URL (NONE) | Public access, implement custom auth |
| **Production API (global)** | Lambda + Alias + Function URL + CloudFront | Custom domain, caching, DDoS protection |
| **Serverless Website** | Lambda + Alias + Function URL + CloudFront | Replace S3 website, real-time rendering |
| **S3 Website Migration** | Lambda + Alias + Function URL + CloudFront | Remove S3 dependency, simplify architecture |
| **Internal Microservice** | Lambda only | No external access, EventBridge/SQS triggers |
| **Scheduled Job** | Lambda only | EventBridge cron, no HTTP access |

### Decision Flowchart

```
┌─────────────────────────────────────┐
│ Does Lambda need HTTP access?      │
└────────┬───────────────┬────────────┘
         NO              YES
         │               │
         ▼               ▼
    Lambda Only    ┌─────────────────────────┐
                   │ Public or Private?      │
                   └──────┬──────────┬───────┘
                       PUBLIC     PRIVATE
                          │           │
                          ▼           ▼
                   + Alias         + Alias
                   + Function URL  + Function URL
                     (NONE auth)     (IAM auth)
                          │
                          ▼
                   ┌──────────────────────┐
                   │ Production?          │
                   └──────┬───────┬───────┘
                         NO      YES
                          │       │
                          ▼       ▼
                      (Done)  + CloudFront
                              + Custom Domain
                              + Caching
```

---

## 5. Integration Strategy

### 5.1 Detection Logic

The migration tool analyzes the Serverless Framework template to determine what to generate:

```typescript
class AdvancedConstructDetector {
  detectFeatures(lambda: ClassifiedResource, config: MigrationConfig): FeatureFlags {
    return {
      generateAlias: this.shouldGenerateAlias(lambda, config),
      generateFunctionUrl: this.shouldGenerateFunctionUrl(lambda, config),
      suggestCloudFront: this.shouldSuggestCloudFront(lambda, config),
      authType: this.detectAuthType(lambda, config)
    };
  }

  private shouldGenerateAlias(lambda: ClassifiedResource, config: MigrationConfig): boolean {
    // Always generate alias if Function URL or CloudFront is used
    if (this.shouldGenerateFunctionUrl(lambda, config)) return true;
    if (this.shouldSuggestCloudFront(lambda, config)) return true;

    // Generate if serverless.yml has stages
    if (lambda.serverlessConfig?.provider?.stage) return true;

    // Generate if tagged as production
    if (lambda.tags?.environment === 'production') return true;

    // User override
    return config.alwaysGenerateAliases ?? false;
  }

  private shouldGenerateFunctionUrl(lambda: ClassifiedResource, config: MigrationConfig): boolean {
    // Detect HTTP event in serverless.yml
    const hasHttpEvent = lambda.events?.some(e => e.http || e.httpApi);
    if (hasHttpEvent) return true;

    // Detect webhook pattern (common function names)
    const webhookPatterns = ['webhook', 'callback', 'hook', 'receiver'];
    const isWebhook = webhookPatterns.some(p =>
      lambda.FunctionName?.toLowerCase().includes(p)
    );
    if (isWebhook) return true;

    // User override
    return config.generateFunctionUrls ?? false;
  }

  private shouldSuggestCloudFront(lambda: ClassifiedResource, config: MigrationConfig): boolean {
    // Already has CloudFront in template
    if (this.hasExistingCloudFront(lambda)) return true;

    // Has S3 website deployment pattern
    if (this.hasS3WebsitePattern(lambda)) return true;

    // Production + Function URL = suggest CloudFront
    if (lambda.tags?.environment === 'production' &&
        this.shouldGenerateFunctionUrl(lambda, config)) {
      return true;
    }

    // User override
    return config.suggestCloudFront ?? false;
  }

  private detectAuthType(lambda: ClassifiedResource, config: MigrationConfig): 'AWS_IAM' | 'NONE' {
    // Check for authorizer in serverless.yml
    const hasAuthorizer = lambda.events?.some(e => e.http?.authorizer);
    if (hasAuthorizer) return 'AWS_IAM';

    // Webhook pattern defaults to NONE (public)
    if (lambda.FunctionName?.toLowerCase().includes('webhook')) return 'NONE';

    // Default from config
    return config.defaultFunctionUrlAuthType ?? 'AWS_IAM';
  }

  private hasExistingCloudFront(lambda: ClassifiedResource): boolean {
    // Check if CloudFormation template has CloudFront distribution
    // that references this Lambda function
    return false; // TODO: Implement
  }

  private hasS3WebsitePattern(lambda: ClassifiedResource): boolean {
    // Detect pattern: Lambda writes to S3, CloudFront serves from S3
    const writesToS3 = lambda.permissions?.some(p =>
      p.actions?.includes('s3:PutObject')
    );
    // TODO: Also check if there's a CloudFront distribution with S3 origin
    return writesToS3;
  }
}
```

### 5.2 Generation vs Suggestion

| Feature | Generate | Suggest |
|---------|----------|---------|
| **Lambda Alias** | ✅ Always (if Function URL present) | - |
| **Function URL** | ✅ If HTTP event or webhook pattern | Console warning if production |
| **CloudFront** | ❌ Never (too complex) | ✅ Commented code + console warning |

**Rationale**:
- **Aliases**: Simple, safe to generate automatically
- **Function URLs**: Straightforward, can auto-generate
- **CloudFront**: Requires certificate, domain config → suggest only

### 5.3 Console Warnings

The tool emits actionable warnings during generation:

```typescript
if (features.generateFunctionUrl) {
  console.log(`✅ Generated Function URL for ${lambdaName} (${features.authType} auth)`);
}

if (features.suggestCloudFront) {
  console.warn(`
⚠️  Production Recommendation: ${lambdaName}

Your function has a public Function URL. For production deployments, consider:

1. Add CloudFront Distribution
   - Custom domain (api.example.com)
   - Global caching (410+ edge locations)
   - DDoS protection (AWS Shield)
   - WAF integration option

2. Request ACM Certificate
   - Region: us-east-1 (CloudFront requirement)
   - Domain: api.example.com
   - Validation: DNS or email

3. Uncomment CloudFront code in generated stack
   - Search for "CloudFront Distribution (SUGGESTED)"
   - Update certificate ARN
   - Update domain name

See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
  `);
}
```

### 5.4 User Configuration

Migration tool supports configuration file:

```yaml
# sls-to-cdk.config.yml
generation:
  lambdaAliases:
    enabled: true
    defaultAliasName: "live"
    multipleAliases: ["dev", "staging", "prod"]  # Optional: generate multiple

  functionUrls:
    enabled: true
    defaultAuthType: "AWS_IAM"  # or "NONE"
    cors:
      allowedOrigins: ["*"]
      allowedMethods: ["GET", "POST", "PUT", "DELETE"]
      allowCredentials: false

  cloudFront:
    suggest: true  # Emit console warnings
    autoGenerate: false  # Never auto-generate (too complex)
```

### 5.5 Impact on Existing Lambda Generation

**No Breaking Changes**:
- Existing Lambda generation logic unchanged
- New features are **additive**
- Aliases/URLs/CloudFront are generated **after** base Lambda

**Code Organization**:
```typescript
// Generated stack structure:
class MigratedStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // ========================================
    // Databases
    // ========================================
    const myTable = new Table(...);

    // ========================================
    // IAM Roles
    // ========================================
    const lambdaRole = new Role(...);

    // ========================================
    // Lambda Functions
    // ========================================
    const myFunction = new NodejsFunction(...);

    // ========================================
    // Lambda Aliases (NEW)
    // ========================================
    const myFunctionAlias = new Alias(...);

    // ========================================
    // Function URLs (NEW)
    // ========================================
    const myFunctionUrl = myFunctionAlias.addFunctionUrl(...);

    // ========================================
    // CloudFront (SUGGESTED - commented out)
    // ========================================
    // const distribution = new Distribution(...);
  }
}
```

---

## 6. API Design

### 6.1 AliasGenerator Class

```typescript
// src/modules/generator/templates/advanced/alias-generator.ts

import { ClassifiedResource } from '../../../types';
import { GeneratorContext } from '../generator-context';

export interface AliasConfig {
  aliasName: string;              // 'dev', 'staging', 'prod', 'live'
  description?: string;
  additionalVersions?: Array<{    // For traffic shifting
    version: string;
    weight: number;               // 0-1
  }>;
}

export class AliasGenerator {
  /**
   * Generate Lambda alias code
   */
  generateAlias(
    lambda: ClassifiedResource,
    config: AliasConfig,
    context: GeneratorContext
  ): string {
    const lambdaVar = this.toVariableName(lambda.LogicalId);
    const aliasVar = `${lambdaVar}Alias`;

    let code = `
    // Create alias for version management and gradual deployments
    const ${aliasVar} = new Alias(this, '${lambda.LogicalId}Alias', {
      aliasName: '${config.aliasName}',
      version: ${lambdaVar}.currentVersion`;

    if (config.description) {
      code += `,\n      description: '${config.description}'`;
    }

    code += '\n    });\n';

    return code;
  }

  /**
   * Generate multiple aliases (dev/staging/prod)
   */
  generateMultipleAliases(
    lambda: ClassifiedResource,
    aliasNames: string[],
    context: GeneratorContext
  ): string {
    return aliasNames
      .map(name => this.generateAlias(
        lambda,
        { aliasName: name, description: `${name} environment` },
        context
      ))
      .join('\n');
  }

  /**
   * Determine alias name from context
   */
  determineAliasName(
    lambda: ClassifiedResource,
    context: GeneratorContext
  ): string {
    // 1. Check serverless.yml stage
    if (lambda.serverlessConfig?.provider?.stage) {
      return lambda.serverlessConfig.provider.stage;
    }

    // 2. Check tags
    if (lambda.tags?.environment) {
      return lambda.tags.environment;
    }

    // 3. Default from config
    return context.config.defaultAliasName ?? 'live';
  }

  private toVariableName(logicalId: string): string {
    // Convert LogicalId to camelCase variable name
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }
}
```

### 6.2 FunctionUrlGenerator Class

```typescript
// src/modules/generator/templates/advanced/function-url-generator.ts

import { ClassifiedResource } from '../../../types';
import { GeneratorContext } from '../generator-context';

export interface FunctionUrlConfig {
  authType: 'AWS_IAM' | 'NONE';
  cors?: {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders?: string[];
    allowCredentials?: boolean;
    maxAge?: number;  // seconds
  };
  outputToStack?: boolean;  // Generate CfnOutput?
}

export class FunctionUrlGenerator {
  /**
   * Generate Function URL code
   */
  generateFunctionUrl(
    lambda: ClassifiedResource,
    aliasVar: string,
    config: FunctionUrlConfig,
    context: GeneratorContext
  ): string {
    const urlVar = `${this.toVariableName(lambda.LogicalId)}Url`;

    let code = `
    // Add Function URL for direct HTTP(S) invocation
    const ${urlVar} = ${aliasVar}.addFunctionUrl({
      authType: FunctionUrlAuthType.${config.authType}`;

    if (config.cors) {
      code += `,\n      cors: ${this.generateCorsConfig(config.cors)}`;
    }

    code += '\n    });\n';

    if (config.outputToStack !== false) {
      code += this.generateOutput(lambda, urlVar);
    }

    return code;
  }

  /**
   * Generate CORS configuration
   */
  private generateCorsConfig(cors: FunctionUrlConfig['cors']): string {
    if (!cors) return '{}';

    const parts: string[] = [];

    parts.push(`allowedOrigins: ${JSON.stringify(cors.allowedOrigins)}`);
    parts.push(`allowedMethods: [${cors.allowedMethods.map(m => `HttpMethod.${m}`).join(', ')}]`);

    if (cors.allowedHeaders) {
      parts.push(`allowedHeaders: ${JSON.stringify(cors.allowedHeaders)}`);
    }

    if (cors.allowCredentials !== undefined) {
      parts.push(`allowCredentials: ${cors.allowCredentials}`);
    }

    if (cors.maxAge) {
      parts.push(`maxAge: Duration.seconds(${cors.maxAge})`);
    }

    return `{\n        ${parts.join(',\n        ')}\n      }`;
  }

  /**
   * Generate CloudFormation output
   */
  private generateOutput(lambda: ClassifiedResource, urlVar: string): string {
    return `
    new CfnOutput(this, '${lambda.LogicalId}Url', {
      value: ${urlVar}.url,
      description: 'Function URL for ${lambda.FunctionName || lambda.LogicalId}'
    });
    `;
  }

  /**
   * Detect auth type from serverless.yml
   */
  detectAuthType(lambda: ClassifiedResource, context: GeneratorContext): 'AWS_IAM' | 'NONE' {
    // Check for authorizer in http events
    const hasAuthorizer = lambda.events?.some(e =>
      e.http?.authorizer || e.httpApi?.authorizer
    );
    if (hasAuthorizer) return 'AWS_IAM';

    // Webhook pattern defaults to NONE
    if (this.isWebhookPattern(lambda)) return 'NONE';

    // Default from config
    return context.config.defaultFunctionUrlAuthType ?? 'AWS_IAM';
  }

  private isWebhookPattern(lambda: ClassifiedResource): boolean {
    const webhookPatterns = ['webhook', 'callback', 'hook', 'receiver'];
    return webhookPatterns.some(p =>
      lambda.FunctionName?.toLowerCase().includes(p)
    );
  }

  private toVariableName(logicalId: string): string {
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }
}
```

### 6.3 CloudFrontSuggester Class

```typescript
// src/modules/generator/templates/advanced/cloudfront-suggester.ts

import { ClassifiedResource } from '../../../types';
import { GeneratorContext } from '../generator-context';

export interface CloudFrontSuggestion {
  shouldSuggest: boolean;
  reason: string;
  commentedCode: string;
  consoleWarning: string;
}

export class CloudFrontSuggester {
  /**
   * Determine if CloudFront should be suggested
   */
  shouldSuggest(
    lambda: ClassifiedResource,
    context: GeneratorContext
  ): CloudFrontSuggestion {
    const reasons: string[] = [];

    // Check for existing CloudFront
    if (this.hasExistingCloudFront(lambda, context)) {
      reasons.push('Existing CloudFront distribution detected');
    }

    // Check for S3 website pattern
    if (this.hasS3WebsitePattern(lambda, context)) {
      reasons.push('S3 website deployment pattern detected');
    }

    // Check for production + Function URL
    if (lambda.tags?.environment === 'production' && lambda.hasFunctionUrl) {
      reasons.push('Production deployment with Function URL');
    }

    // Check user config
    if (context.config.suggestCloudFront) {
      reasons.push('User configuration enabled');
    }

    const shouldSuggest = reasons.length > 0;

    return {
      shouldSuggest,
      reason: reasons.join(', '),
      commentedCode: shouldSuggest ? this.generateCommentedCode(lambda, context) : '',
      consoleWarning: shouldSuggest ? this.generateConsoleWarning(lambda, reasons) : ''
    };
  }

  /**
   * Generate commented CloudFront code
   */
  private generateCommentedCode(
    lambda: ClassifiedResource,
    context: GeneratorContext
  ): string {
    const aliasVar = this.toVariableName(lambda.LogicalId) + 'Alias';
    const urlVar = this.toVariableName(lambda.LogicalId) + 'Url';

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
    // const distribution = new Distribution(this, '${lambda.LogicalId}Distribution', {
    //   defaultBehavior: {
    //     origin: FunctionUrlOrigin.withOriginAccessControl(${urlVar}),
    //     allowedMethods: AllowedMethods.ALLOW_ALL,
    //     cachePolicy: CachePolicy.CACHING_DISABLED,  // Change for cacheable content
    //     originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
    //   },
    //   domainNames: ['api.example.com'],  // UPDATE THIS
    //   certificate: Certificate.fromCertificateArn(
    //     this,
    //     '${lambda.LogicalId}Certificate',
    //     'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID'  // UPDATE THIS
    //   ),
    //   priceClass: PriceClass.PRICE_CLASS_100  // US, Canada, Europe
    // });
    //
    // // Grant CloudFront permission to invoke Function URL
    // ${aliasVar}.grantInvokeUrl(
    //   new ServicePrincipal('cloudfront.amazonaws.com', {
    //     conditions: {
    //       StringEquals: {
    //         'AWS:SourceArn': \`arn:aws:cloudfront::\${this.account}:distribution/\${distribution.distributionId}\`
    //       }
    //     }
    //   })
    // );
    //
    // new CfnOutput(this, '${lambda.LogicalId}CloudFrontUrl', {
    //   value: \`https://\${distribution.domainName}\`,
    //   description: 'CloudFront distribution URL (replace with custom domain)'
    // });
    //
    // See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
    `;
  }

  /**
   * Generate console warning message
   */
  private generateConsoleWarning(lambda: ClassifiedResource, reasons: string[]): string {
    return `
⚠️  Production Recommendation: ${lambda.FunctionName || lambda.LogicalId}

Reason: ${reasons.join(', ')}

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

  private hasExistingCloudFront(lambda: ClassifiedResource, context: GeneratorContext): boolean {
    // TODO: Check CloudFormation template for CloudFront distribution
    return false;
  }

  private hasS3WebsitePattern(lambda: ClassifiedResource, context: GeneratorContext): boolean {
    // Detect pattern: Lambda writes to S3, CloudFront serves from S3
    const writesToS3 = lambda.permissions?.some(p =>
      p.actions?.includes('s3:PutObject')
    );
    // TODO: Also check if there's a CloudFront distribution with S3 origin
    return writesToS3;
  }

  private toVariableName(logicalId: string): string {
    return logicalId.charAt(0).toLowerCase() + logicalId.slice(1);
  }
}
```

### 6.4 Integration Points

```typescript
// src/modules/generator/typescript-generator.ts (enhancement)

import { AliasGenerator } from './templates/advanced/alias-generator';
import { FunctionUrlGenerator } from './templates/advanced/function-url-generator';
import { CloudFrontSuggester } from './templates/advanced/cloudfront-suggester';

export class TypeScriptGenerator {
  private aliasGenerator = new AliasGenerator();
  private functionUrlGenerator = new FunctionUrlGenerator();
  private cloudFrontSuggester = new CloudFrontSuggester();

  generateStack(resources: ClassifiedResource[], context: GeneratorContext): string {
    let code = this.generateHeader(context);

    // Group resources
    const grouped = this.groupResources(resources);

    // Generate base resources (existing logic)
    code += this.generateDatabases(grouped.databases, context);
    code += this.generateIAMRoles(grouped.iam, context);
    code += this.generateLambdaFunctions(grouped.compute, context);

    // NEW: Generate advanced constructs
    code += this.generateAliases(grouped.compute, context);
    code += this.generateFunctionUrls(grouped.compute, context);
    code += this.generateCloudFrontSuggestions(grouped.compute, context);

    code += this.generateFooter(context);

    return code;
  }

  private generateAliases(lambdas: ClassifiedResource[], context: GeneratorContext): string {
    const aliasLambdas = lambdas.filter(l =>
      this.shouldGenerateAlias(l, context)
    );

    if (aliasLambdas.length === 0) return '';

    let code = '\n    // ========================================\n';
    code += '    // Lambda Aliases\n';
    code += '    // ========================================\n\n';

    for (const lambda of aliasLambdas) {
      const aliasName = this.aliasGenerator.determineAliasName(lambda, context);
      code += this.aliasGenerator.generateAlias(
        lambda,
        { aliasName, description: `${aliasName} environment` },
        context
      );
    }

    return code;
  }

  private generateFunctionUrls(lambdas: ClassifiedResource[], context: GeneratorContext): string {
    const urlLambdas = lambdas.filter(l =>
      this.shouldGenerateFunctionUrl(l, context)
    );

    if (urlLambdas.length === 0) return '';

    let code = '\n    // ========================================\n';
    code += '    // Function URLs\n';
    code += '    // ========================================\n\n';

    for (const lambda of urlLambdas) {
      const aliasVar = this.toVariableName(lambda.LogicalId) + 'Alias';
      const authType = this.functionUrlGenerator.detectAuthType(lambda, context);

      code += this.functionUrlGenerator.generateFunctionUrl(
        lambda,
        aliasVar,
        {
          authType,
          cors: context.config.functionUrls?.cors,
          outputToStack: true
        },
        context
      );

      // Emit console log
      console.log(`✅ Generated Function URL for ${lambda.FunctionName} (${authType} auth)`);
    }

    return code;
  }

  private generateCloudFrontSuggestions(lambdas: ClassifiedResource[], context: GeneratorContext): string {
    let code = '';

    for (const lambda of lambdas) {
      const suggestion = this.cloudFrontSuggester.shouldSuggest(lambda, context);

      if (suggestion.shouldSuggest) {
        code += suggestion.commentedCode;

        // Emit console warning
        console.warn(suggestion.consoleWarning);
      }
    }

    return code;
  }

  private shouldGenerateAlias(lambda: ClassifiedResource, context: GeneratorContext): boolean {
    // Implementation from AdvancedConstructDetector
    return true; // TODO
  }

  private shouldGenerateFunctionUrl(lambda: ClassifiedResource, context: GeneratorContext): boolean {
    // Implementation from AdvancedConstructDetector
    return true; // TODO
  }
}
```

---

## 7. Test Strategy

### 7.1 Unit Tests

```typescript
// tests/unit/generator/advanced/alias-generator.test.ts

describe('AliasGenerator', () => {
  let generator: AliasGenerator;

  beforeEach(() => {
    generator = new AliasGenerator();
  });

  describe('generateAlias', () => {
    it('should generate basic alias', () => {
      const lambda = createMockLambda({ LogicalId: 'MyFunction' });
      const config = { aliasName: 'prod' };
      const context = createMockContext();

      const code = generator.generateAlias(lambda, config, context);

      expect(code).toContain('new Alias(this, \'MyFunctionAlias\'');
      expect(code).toContain('aliasName: \'prod\'');
      expect(code).toContain('version: myFunction.currentVersion');
    });

    it('should include description when provided', () => {
      const lambda = createMockLambda({ LogicalId: 'MyFunction' });
      const config = { aliasName: 'prod', description: 'Production environment' };
      const context = createMockContext();

      const code = generator.generateAlias(lambda, config, context);

      expect(code).toContain('description: \'Production environment\'');
    });
  });

  describe('generateMultipleAliases', () => {
    it('should generate multiple aliases', () => {
      const lambda = createMockLambda({ LogicalId: 'MyFunction' });
      const context = createMockContext();

      const code = generator.generateMultipleAliases(
        lambda,
        ['dev', 'staging', 'prod'],
        context
      );

      expect(code).toContain('aliasName: \'dev\'');
      expect(code).toContain('aliasName: \'staging\'');
      expect(code).toContain('aliasName: \'prod\'');
    });
  });

  describe('determineAliasName', () => {
    it('should use serverless.yml stage', () => {
      const lambda = createMockLambda({
        serverlessConfig: { provider: { stage: 'production' } }
      });
      const context = createMockContext();

      const aliasName = generator.determineAliasName(lambda, context);

      expect(aliasName).toBe('production');
    });

    it('should use tag environment if no stage', () => {
      const lambda = createMockLambda({
        tags: { environment: 'staging' }
      });
      const context = createMockContext();

      const aliasName = generator.determineAliasName(lambda, context);

      expect(aliasName).toBe('staging');
    });

    it('should use default if no stage or tag', () => {
      const lambda = createMockLambda({});
      const context = createMockContext({ defaultAliasName: 'live' });

      const aliasName = generator.determineAliasName(lambda, context);

      expect(aliasName).toBe('live');
    });
  });
});
```

```typescript
// tests/unit/generator/advanced/function-url-generator.test.ts

describe('FunctionUrlGenerator', () => {
  let generator: FunctionUrlGenerator;

  beforeEach(() => {
    generator = new FunctionUrlGenerator();
  });

  describe('generateFunctionUrl', () => {
    it('should generate Function URL with IAM auth', () => {
      const lambda = createMockLambda({ LogicalId: 'MyFunction' });
      const code = generator.generateFunctionUrl(
        lambda,
        'myFunctionAlias',
        { authType: 'AWS_IAM' },
        createMockContext()
      );

      expect(code).toContain('.addFunctionUrl({');
      expect(code).toContain('authType: FunctionUrlAuthType.AWS_IAM');
      expect(code).toContain('new CfnOutput');
    });

    it('should generate Function URL with NONE auth', () => {
      const lambda = createMockLambda({ LogicalId: 'WebhookFunction' });
      const code = generator.generateFunctionUrl(
        lambda,
        'webhookFunctionAlias',
        { authType: 'NONE' },
        createMockContext()
      );

      expect(code).toContain('authType: FunctionUrlAuthType.NONE');
    });

    it('should include CORS configuration', () => {
      const lambda = createMockLambda({ LogicalId: 'MyFunction' });
      const code = generator.generateFunctionUrl(
        lambda,
        'myFunctionAlias',
        {
          authType: 'NONE',
          cors: {
            allowedOrigins: ['*'],
            allowedMethods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type'],
            allowCredentials: false
          }
        },
        createMockContext()
      );

      expect(code).toContain('allowedOrigins: ["*"]');
      expect(code).toContain('HttpMethod.GET');
      expect(code).toContain('HttpMethod.POST');
      expect(code).toContain('allowedHeaders: ["Content-Type"]');
      expect(code).toContain('allowCredentials: false');
    });
  });

  describe('detectAuthType', () => {
    it('should detect IAM auth for functions with authorizer', () => {
      const lambda = createMockLambda({
        events: [{ http: { authorizer: 'aws_iam' } }]
      });

      const authType = generator.detectAuthType(lambda, createMockContext());

      expect(authType).toBe('AWS_IAM');
    });

    it('should detect NONE auth for webhook patterns', () => {
      const lambda = createMockLambda({ FunctionName: 'github-webhook' });

      const authType = generator.detectAuthType(lambda, createMockContext());

      expect(authType).toBe('NONE');
    });

    it('should use default from config', () => {
      const lambda = createMockLambda({});
      const context = createMockContext({ defaultFunctionUrlAuthType: 'AWS_IAM' });

      const authType = generator.detectAuthType(lambda, context);

      expect(authType).toBe('AWS_IAM');
    });
  });
});
```

```typescript
// tests/unit/generator/advanced/cloudfront-suggester.test.ts

describe('CloudFrontSuggester', () => {
  let suggester: CloudFrontSuggester;

  beforeEach(() => {
    suggester = new CloudFrontSuggester();
  });

  describe('shouldSuggest', () => {
    it('should suggest for production + Function URL', () => {
      const lambda = createMockLambda({
        tags: { environment: 'production' },
        hasFunctionUrl: true
      });

      const suggestion = suggester.shouldSuggest(lambda, createMockContext());

      expect(suggestion.shouldSuggest).toBe(true);
      expect(suggestion.reason).toContain('Production deployment');
    });

    it('should suggest for S3 website pattern', () => {
      const lambda = createMockLambda({
        permissions: [{ actions: ['s3:PutObject'] }]
      });

      const suggestion = suggester.shouldSuggest(lambda, createMockContext());

      expect(suggestion.shouldSuggest).toBe(true);
      expect(suggestion.reason).toContain('S3 website');
    });

    it('should not suggest for development', () => {
      const lambda = createMockLambda({
        tags: { environment: 'development' }
      });

      const suggestion = suggester.shouldSuggest(lambda, createMockContext());

      expect(suggestion.shouldSuggest).toBe(false);
    });

    it('should include commented code when suggesting', () => {
      const lambda = createMockLambda({
        LogicalId: 'MyFunction',
        tags: { environment: 'production' },
        hasFunctionUrl: true
      });

      const suggestion = suggester.shouldSuggest(lambda, createMockContext());

      expect(suggestion.commentedCode).toContain('// const distribution = new Distribution');
      expect(suggestion.commentedCode).toContain('FunctionUrlOrigin.withOriginAccessControl');
      expect(suggestion.commentedCode).toContain('domainNames: [\'api.example.com\']');
    });

    it('should include console warning when suggesting', () => {
      const lambda = createMockLambda({
        FunctionName: 'my-api',
        tags: { environment: 'production' },
        hasFunctionUrl: true
      });

      const suggestion = suggester.shouldSuggest(lambda, createMockContext());

      expect(suggestion.consoleWarning).toContain('⚠️  Production Recommendation: my-api');
      expect(suggestion.consoleWarning).toContain('Custom Domain');
      expect(suggestion.consoleWarning).toContain('Performance');
      expect(suggestion.consoleWarning).toContain('Security');
    });
  });
});
```

### 7.2 Integration Tests

```typescript
// tests/integration/advanced-constructs.test.ts

describe('Advanced Constructs Integration', () => {
  it('should generate Lambda + Alias + Function URL', async () => {
    const template = createServerlessTemplate({
      functions: {
        api: {
          handler: 'src/api.handler',
          events: [{ http: { path: '/api', method: 'GET' } }]
        }
      }
    });

    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified, {
      generateFunctionUrls: true,
      alwaysGenerateAliases: true
    });

    // Verify Lambda
    expect(generated).toContain('new NodejsFunction(this, \'ApiFunction\'');

    // Verify Alias
    expect(generated).toContain('new Alias(this, \'ApiFunctionAlias\'');
    expect(generated).toContain('version: apiFunction.currentVersion');

    // Verify Function URL
    expect(generated).toContain('apiFunctionAlias.addFunctionUrl({');
    expect(generated).toContain('authType: FunctionUrlAuthType.AWS_IAM');

    // Verify Output
    expect(generated).toContain('new CfnOutput(this, \'ApiFunctionUrl\'');
  });

  it('should suggest CloudFront for production', async () => {
    const template = createServerlessTemplate({
      functions: {
        api: {
          handler: 'src/api.handler',
          tags: { environment: 'production' },
          events: [{ http: { path: '/api', method: 'GET' } }]
        }
      }
    });

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified, {
      generateFunctionUrls: true,
      suggestCloudFront: true
    });

    // Verify commented CloudFront code
    expect(generated).toContain('// CloudFront Distribution (SUGGESTED)');
    expect(generated).toContain('// const distribution = new Distribution');

    // Verify console warning was emitted
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('⚠️  Production Recommendation: api')
    );

    consoleWarnSpy.mockRestore();
  });

  it('should generate multiple aliases when configured', async () => {
    const template = createServerlessTemplate({
      functions: {
        api: {
          handler: 'src/api.handler'
        }
      }
    });

    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified, {
      lambdaAliases: {
        enabled: true,
        multipleAliases: ['dev', 'staging', 'prod']
      }
    });

    expect(generated).toContain('aliasName: \'dev\'');
    expect(generated).toContain('aliasName: \'staging\'');
    expect(generated).toContain('aliasName: \'prod\'');
  });

  it('should handle webhook pattern correctly', async () => {
    const template = createServerlessTemplate({
      functions: {
        githubWebhook: {
          handler: 'src/webhook.handler',
          events: [{ http: { path: '/webhook', method: 'POST' } }]
        }
      }
    });

    const classified = await classifyResources(template);
    const generated = await generateCDKCode(classified, {
      generateFunctionUrls: true
    });

    // Webhook should use NONE auth (public)
    expect(generated).toContain('authType: FunctionUrlAuthType.NONE');

    // Should have CORS config
    expect(generated).toContain('cors:');
  });
});
```

### 7.3 Coverage Targets

| Component | Unit Tests | Integration Tests | Coverage Target |
|-----------|------------|-------------------|-----------------|
| **AliasGenerator** | 10+ | 2+ | 100% |
| **FunctionUrlGenerator** | 12+ | 3+ | 100% |
| **CloudFrontSuggester** | 8+ | 2+ | 100% |
| **Integration Logic** | - | 5+ | - |
| **Overall** | 30+ | 12+ | 95%+ |

---

## 8. Examples

### 8.1 Example 1: Lambda + Alias

**Input (serverless.yml)**:
```yaml
functions:
  api:
    handler: src/api.handler
    runtime: nodejs20.x
    memorySize: 512
    timeout: 30
```

**Generated CDK Code**:
```typescript
// ========================================
// Lambda Functions
// ========================================

const apiFunction = new NodejsFunction(this, 'ApiFunction', {
  entry: 'src/api.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_20_X,
  memorySize: 512,
  timeout: Duration.seconds(30),
  role: lambdaRole,
  logGroup: apiLogGroup
});

// ========================================
// Lambda Aliases
// ========================================

// Create alias for version management and gradual deployments
const apiFunctionAlias = new Alias(this, 'ApiFunctionAlias', {
  aliasName: 'live',
  version: apiFunction.currentVersion,
  description: 'live environment'
});
```

### 8.2 Example 2: Lambda + Alias + Function URL

**Input (serverless.yml)**:
```yaml
functions:
  webhook:
    handler: src/webhook.handler
    runtime: nodejs20.x
    events:
      - http:
          path: /webhook
          method: POST
```

**Generated CDK Code**:
```typescript
// ========================================
// Lambda Functions
// ========================================

const webhookFunction = new NodejsFunction(this, 'WebhookFunction', {
  entry: 'src/webhook.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_20_X,
  role: lambdaRole,
  logGroup: webhookLogGroup
});

// ========================================
// Lambda Aliases
// ========================================

const webhookFunctionAlias = new Alias(this, 'WebhookFunctionAlias', {
  aliasName: 'live',
  version: webhookFunction.currentVersion
});

// ========================================
// Function URLs
// ========================================

// Add Function URL for direct HTTP(S) invocation
const webhookFunctionUrl = webhookFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

new CfnOutput(this, 'WebhookFunctionUrl', {
  value: webhookFunctionUrl.url,
  description: 'Function URL for webhook'
});
```

**Console Output**:
```
✅ Generated Function URL for webhook (NONE auth)
```

### 8.3 Example 3: Full CloudFront Setup (Production)

**Input (serverless.yml)**:
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

**Generated CDK Code**:
```typescript
// ========================================
// Lambda Functions
// ========================================

const apiFunction = new NodejsFunction(this, 'ApiFunction', {
  entry: 'src/api.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_20_X,
  role: lambdaRole,
  logGroup: apiLogGroup
});

// ========================================
// Lambda Aliases
// ========================================

const apiFunctionAlias = new Alias(this, 'ApiFunctionAlias', {
  aliasName: 'prod',
  version: apiFunction.currentVersion,
  description: 'prod environment'
});

// ========================================
// Function URLs
// ========================================

const apiFunctionUrl = apiFunctionAlias.addFunctionUrl({
  authType: FunctionUrlAuthType.AWS_IAM,
  cors: {
    allowedOrigins: ['https://app.example.com'],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

new CfnOutput(this, 'ApiFunctionUrl', {
  value: apiFunctionUrl.url,
  description: 'Function URL for api'
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
//
// Prerequisites:
// 1. Request ACM certificate in us-east-1 for your domain
//    aws acm request-certificate --domain-name api.example.com --region us-east-1
//
// 2. Validate certificate (DNS or email validation)
//
// 3. Update domainNames and certificate ARN below
//
// const distribution = new Distribution(this, 'ApiFunctionDistribution', {
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
//   priceClass: PriceClass.PRICE_CLASS_100
// });
//
// // Grant CloudFront permission to invoke Function URL
// apiFunctionAlias.grantInvokeUrl(
//   new ServicePrincipal('cloudfront.amazonaws.com', {
//     conditions: {
//       StringEquals: {
//         'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
//       }
//     }
//   })
// );
//
// new CfnOutput(this, 'ApiFunctionCloudFrontUrl', {
//   value: `https://${distribution.domainName}`,
//   description: 'CloudFront distribution URL (replace with custom domain)'
// });
//
// See: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront
```

**Console Output**:
```
✅ Generated Function URL for api (AWS_IAM auth)

⚠️  Production Recommendation: api

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

---

## 9. Phase Gate Review Checklist

Before proceeding to **Pseudocode Phase**, this specification must be approved:

### Completeness
- [x] All research questions answered
- [x] All CDK patterns documented
- [x] Decision matrix provided
- [x] Integration strategy defined
- [x] API design specified
- [x] Test strategy outlined
- [x] Examples provided

### Accuracy
- [x] AWS best practices followed
- [x] CDK patterns are correct
- [x] Security considerations addressed
- [x] Performance implications understood
- [x] Cost implications documented

### Implementability
- [x] Requirements are clear and actionable
- [x] API design is implementable in Sprint 4
- [x] Test strategy is comprehensive
- [x] Integration with existing code is feasible

### Documentation Quality
- [x] Examples are clear and useful
- [x] Code snippets are correct
- [x] Console output is helpful
- [x] Migration paths are explained

---

## 10. Next Steps (After Approval)

1. **Phase Gate Approval** ✋ REQUIRED
2. **Proceed to Pseudocode Phase** - Design algorithms
3. **Proceed to Architecture Phase** - Design module structure
4. **Proceed to Refinement Phase** - TDD implementation
5. **Proceed to Completion Phase** - Integration and testing

---

## 11. References

### AWS Documentation
- [Lambda Aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html)
- [Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [CloudFront + Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cloudfront)
- [Origin Access Control (OAC)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)

### CDK Documentation
- [aws-cdk-lib/aws-lambda - Alias](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.Alias.html)
- [aws-cdk-lib/aws-lambda - FunctionUrl](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionUrl.html)
- [aws-cdk-lib/aws-cloudfront - Distribution](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.Distribution.html)
- [aws-cdk-lib/aws-cloudfront-origins - FunctionUrlOrigin](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.FunctionUrlOrigin.html)

### Related Sprints
- [Sprint 1: Resource Classification](./SPRINT_1_COMPLETION.md) - Provides `ClassifiedResource` metadata
- [Sprint 2: Clean IAM Roles](./IMPLEMENTATION_PLAN_CDK_IMPROVEMENTS.md#sprint-2) - Next sprint
- [SPARC CDK Improvements](./SPARC_CDK_IMPROVEMENTS.md) - Overall problem statement

---

**Status**: ✅ **SPECIFICATION COMPLETE - AWAITING PHASE GATE APPROVAL**

**Prepared by**: Research Specialist Agent (Sprint 4)
**Date**: 2025-10-22
**Methodology**: SPARC (Specification Phase)
**Next Phase**: Pseudocode (after approval)
