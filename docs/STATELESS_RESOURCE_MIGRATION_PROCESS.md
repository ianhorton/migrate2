# Stateless Resource Migration Process: Serverless Framework to AWS CDK

## Executive Summary

This document outlines the high-level process for migrating **stateless resources** from Serverless Framework to AWS CDK. Unlike stateful resources, stateless resources don't contain data and can typically be **recreated with new names** rather than imported, allowing both old and new infrastructure to run in parallel during migration.

**Key Principle:** Stateless resources can be destroyed and recreated without data loss, enabling a safer, zero-downtime migration strategy.

**Migration Pattern:** Create New → Test in Parallel → Cutover → Delete Old

---

## What Are Stateless Resources?

Stateless resources are AWS resources that don't contain or manage data that needs to be preserved. They can be destroyed and recreated without loss of information.

| Resource Type | Examples | Why Stateless |
|--------------|----------|-------------|
| **Compute** | Lambda Functions, ECS Tasks | Code is deployed, no persistent state |
| **Networking** | API Gateway, CloudFront, ALB | Route traffic, no data storage |
| **Identity** | IAM Roles, IAM Policies | Configuration only, easily recreated |
| **Events** | EventBridge Rules, SNS Topics | Configuration for routing, no message storage |
| **Deployment** | Lambda Layers, Lambda Aliases | Deployment artifacts, reproducible |

**Stateful resources** (DynamoDB, S3, RDS, LogGroups) contain data and require the import process documented separately.

---

## Why Recreate Instead of Import?

### Advantages of Recreation Strategy

✅ **Zero Downtime** - Both systems run in parallel during migration

✅ **Easy Rollback** - Keep old system running until confident

✅ **Simpler Process** - No CloudFormation import complexity

✅ **Clean Break** - No dependency on old stack structure

✅ **Gradual Testing** - Test thoroughly before cutover

✅ **Independent Names** - No conflicts between old and new

### When Import Might Be Better

Consider importing stateless resources if:
- Complex API Gateway setup that's difficult to recreate
- Custom domain names that can't change
- Resource has external integrations that use specific ARNs
- Want to preserve CloudWatch metrics history with same resource ID

**Recommendation:** For most cases, **recreation is simpler and safer** than import.

---

## High-Level Process Flow

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 1: CREATE NEW IN CDK                             │
│  Build parallel infrastructure with new names           │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 2: DEPLOY & VERIFY                               │
│  Ensure new infrastructure works correctly              │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 3: TEST IN PARALLEL                              │
│  Run both old and new systems simultaneously            │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 4: CUTOVER                                       │
│  Switch traffic from old to new infrastructure          │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 5: MONITOR & VALIDATE                            │
│  Ensure new system handles production load              │
│                                                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Phase 6: CLEANUP                                       │
│  Remove old Serverless infrastructure                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Detailed Process Steps

### Phase 1: Create New in CDK

**Objective:** Build equivalent infrastructure in CDK with new resource names

**Actions:**
1. Analyze existing Serverless configuration
2. Write CDK code to recreate functionality
3. Use **different names** to avoid conflicts
4. Connect to migrated stateful resources (DynamoDB, S3, etc.)
5. Synthesize CDK template

**Naming Strategy:**

| Old Name | New Name | Pattern |
|----------|----------|---------|
| `my-api-function` | `my-api-function-cdk` | Add suffix |
| `my-api-dev` | `my-api-cdk-dev` | Add infix |
| `prod-processor` | `prod-processor-v2` | Version number |

**Example - Lambda Function:**

**Serverless (old):**
```yaml
functions:
  processOrder:
    handler: src/handler.process
    name: order-processor-${self:provider.stage}
    environment:
      TABLE_NAME: ${self:custom.tableName}
```

**CDK (new):**
```typescript
const processOrderFn = new lambda.Function(this, 'ProcessOrderFunction', {
  functionName: 'order-processor-cdk-dev',  // Different name
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'src/handler.process',
  code: lambda.Code.fromAsset('lambda'),
  environment: {
    TABLE_NAME: ordersTable.tableName,  // Reference migrated stateful resource
  },
});
```

**Critical Considerations:**
- [ ] New names don't conflict with existing resources
- [ ] Environment variables point to correct resources
- [ ] IAM permissions match or improve on old setup
- [ ] Code/artifacts are identical to production
- [ ] Timeouts, memory, and settings match

**Commands:**
```bash
npx cdk synth
# Review generated CloudFormation template
```

---

### Phase 2: Deploy & Verify

**Objective:** Deploy new infrastructure and verify it works in isolation

**Actions:**
1. Deploy CDK stack
2. Verify all resources created successfully
3. Test individual components
4. Check CloudWatch logs
5. Verify integrations with stateful resources

**Commands:**
```bash
# Deploy CDK stack
npx cdk deploy

# Verify Lambda function exists
aws lambda get-function --function-name order-processor-cdk-dev

# Verify API Gateway/CloudFront distribution created
aws cloudfront list-distributions
```

**Testing Checklist:**
- [ ] Lambda function can be invoked manually
- [ ] Function can read/write to DynamoDB/S3
- [ ] Environment variables are correct
- [ ] IAM permissions work
- [ ] CloudWatch logs are created
- [ ] Metrics are published
- [ ] No errors in deployment

**Example - Test Lambda:**
```bash
# Invoke Lambda directly
aws lambda invoke \
  --function-name order-processor-cdk-dev \
  --payload '{"test": "data"}' \
  response.json

# Check the response
cat response.json

# Check CloudWatch logs
aws logs tail /aws/lambda/order-processor-cdk-dev --follow
```

---

### Phase 3: Test in Parallel

**Objective:** Run both old and new systems simultaneously to ensure equivalence

**Actions:**
1. Send test traffic to new infrastructure
2. Compare behavior with old infrastructure
3. Validate responses match
4. Check for errors or differences
5. Load test if appropriate

**Testing Strategies:**

#### Strategy A: Direct Testing (Non-Production)
- Hit new API endpoint directly
- Compare responses with old endpoint
- Verify same data is read/written

#### Strategy B: Synthetic Traffic (Production)
- Use synthetic monitoring to test new endpoints
- Compare with real production traffic patterns
- Monitor error rates and latency

#### Strategy C: Shadow Traffic (Advanced)
- Duplicate production traffic to new infrastructure
- Compare responses (don't serve to users yet)
- Identify discrepancies before cutover

**Validation Points:**

| What to Check | Old System | New System | Status |
|--------------|------------|------------|--------|
| API Response Format | JSON structure | Should match | ✓ |
| Response Codes | 200, 404, 500 | Should match | ✓ |
| Latency | P50, P95, P99 | Should be comparable | ✓ |
| Error Rates | % errors | Should be equal or lower | ✓ |
| Data Consistency | DB reads/writes | Should be identical | ✓ |

**Common Differences to Expect:**

✅ **Expected (OK):**
- Different Lambda ARNs
- Different request IDs
- Different CloudWatch log streams
- Slightly different cold start behavior

❌ **Unexpected (Fix Required):**
- Different response formats
- Missing headers
- Different status codes
- Data inconsistencies
- Higher error rates
- Significantly worse performance

---

### Phase 4: Cutover

**Objective:** Switch production traffic from old to new infrastructure

**Cutover Strategies:**

#### Strategy A: DNS/Route53 Update (Recommended)
**For:** APIs with custom domains

**Process:**
1. Update Route53 alias record
2. Point to new CloudFront/API Gateway
3. Monitor traffic shift (DNS propagation)
4. Watch for errors

**Advantages:**
- Gradual cutover due to DNS TTL
- Easy to revert
- No code changes

**Commands:**
```bash
# Update Route53 record
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://change-batch.json
```

#### Strategy B: Feature Flag
**For:** When you control the client

**Process:**
1. Deploy client with feature flag
2. Gradually increase percentage to new endpoint
3. Monitor errors
4. Roll forward or backward as needed

**Advantages:**
- Fine-grained control
- Gradual rollout
- Easy rollback

#### Strategy C: Load Balancer Weighted Routing
**For:** APIs behind ALB

**Process:**
1. Configure weighted target groups
2. Start with 5% traffic to new system
3. Gradually increase to 100%
4. Monitor each step

**Advantages:**
- Controlled traffic shift
- Easy to adjust percentages
- Built-in health checks

#### Strategy D: All-at-Once
**For:** Non-critical or development environments

**Process:**
1. Switch immediately
2. Monitor closely
3. Rollback if issues

**Advantages:**
- Fast migration
- Simple

**Disadvantages:**
- Higher risk
- No gradual validation

**Recommended Cutover Schedule:**

| Time | Action | Traffic Split | Monitor |
|------|--------|---------------|---------|
| T+0 | Deploy new system | 0% | Verify healthy |
| T+15min | Start cutover | 5% new, 95% old | Watch errors |
| T+30min | Increase traffic | 25% new, 75% old | Check latency |
| T+1hr | Majority traffic | 50% new, 50% old | Full monitoring |
| T+2hr | Nearly complete | 95% new, 5% old | Final checks |
| T+3hr | Complete cutover | 100% new | Monitor closely |
| T+24hr | Confirm stable | 100% new | Review metrics |

---

### Phase 5: Monitor & Validate

**Objective:** Ensure new system handles production load without issues

**Monitoring Duration:**
- **Minimum:** 24 hours
- **Recommended:** 3-7 days
- **Critical Systems:** 14+ days

**What to Monitor:**

#### Application Metrics
- **Request Volume:** Should match historical patterns
- **Response Times:** P50, P95, P99 latencies
- **Error Rates:** 4xx and 5xx responses
- **Throughput:** Requests per second
- **Success Rate:** % of successful requests

#### Infrastructure Metrics
- **Lambda Metrics:**
  - Invocations
  - Duration
  - Errors
  - Throttles
  - Concurrent executions
  - Cold starts

- **API Gateway/CloudFront:**
  - Request count
  - 4xx/5xx errors
  - Latency
  - Cache hit rate (CloudFront)

- **DynamoDB/S3 (Connected Resources):**
  - Read/write capacity
  - Throttles
  - Errors

#### Business Metrics
- **Conversion Rates:** Should remain stable
- **User Experience:** No customer complaints
- **Data Integrity:** No data loss or corruption
- **Transaction Success:** Orders/payments processing

**CloudWatch Dashboard Example:**
```typescript
const dashboard = new cloudwatch.Dashboard(this, 'MigrationDashboard', {
  dashboardName: 'cdk-migration-monitoring',
});

dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Lambda Invocations: Old vs New',
    left: [
      oldLambda.metricInvocations(),
      newLambda.metricInvocations(),
    ],
  }),
  new cloudwatch.GraphWidget({
    title: 'Error Rate: Old vs New',
    left: [
      oldLambda.metricErrors(),
      newLambda.metricErrors(),
    ],
  }),
);
```

**Alerts to Configure:**
```typescript
// Alert on high error rate
newLambda.metricErrors()
  .createAlarm(this, 'NewLambdaErrorAlarm', {
    threshold: 5,
    evaluationPeriods: 2,
    alarmDescription: 'CDK Lambda error rate too high',
  });

// Alert on high duration
newLambda.metricDuration()
  .createAlarm(this, 'NewLambdaLatencyAlarm', {
    threshold: 5000, // 5 seconds
    evaluationPeriods: 3,
    alarmDescription: 'CDK Lambda latency too high',
  });
```

**Validation Checklist:**
- [ ] Request volume matches historical patterns
- [ ] Error rates at or below historical levels
- [ ] Latency within acceptable range
- [ ] No throttling or capacity issues
- [ ] All integrations functioning
- [ ] No customer complaints
- [ ] Business metrics stable
- [ ] Cost within expected range

---

### Phase 6: Cleanup

**Objective:** Remove old Serverless infrastructure safely

**Actions:**
1. Verify new system is stable (wait minimum 24-48 hours)
2. Confirm zero traffic to old system
3. Take final backup/snapshot
4. Remove old Serverless stack
5. Clean up orphaned resources

**Pre-Cleanup Checklist:**
- [ ] New system stable for required monitoring period
- [ ] Zero traffic to old endpoints (check CloudWatch metrics)
- [ ] All functionality verified in new system
- [ ] Business stakeholders approved
- [ ] Rollback plan documented (just in case)
- [ ] Old configuration backed up

**Cleanup Process:**

**Step 1: Verify Zero Traffic**
```bash
# Check old Lambda invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=order-processor-dev \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

# Check old API Gateway requests
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=my-api-dev \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

**Step 2: Backup Configuration**
```bash
# Export Serverless configuration
cd serverless-project
cp serverless.yml serverless.yml.backup
npx serverless package
cp -r .serverless .serverless.final-backup
```

**Step 3: Remove Serverless Stack**
```bash
# Remove the Serverless stack
npx serverless remove --stage dev

# Verify removal
aws cloudformation describe-stacks --stack-name my-service-dev
# Should return: Stack with id my-service-dev does not exist
```

**Step 4: Clean Up Orphaned Resources**

Some resources may remain due to `DeletionPolicy: Retain`:
- CloudWatch LogGroups (if migrated separately)
- S3 deployment buckets
- Any custom resources with retention policies

**Identify orphaned resources:**
```bash
# Check for old Lambda functions
aws lambda list-functions | grep "order-processor-dev"

# Check for old LogGroups
aws logs describe-log-groups | grep "/aws/lambda/order-processor-dev"

# Check for old S3 deployment buckets
aws s3 ls | grep "serverless-deployment"
```

**Decide what to delete:**
- **Delete:** Resources no longer needed (old Lambda functions if not already removed)
- **Keep:** LogGroups if you want historical logs
- **Keep:** S3 buckets if you want deployment history
- **Delete after archive:** Logs/buckets after exporting

**Step 5: Update Documentation**
- Update deployment documentation
- Update runbooks
- Update architecture diagrams
- Update incident response procedures
- Archive old configurations

---

## Resource-Specific Guidance

### Lambda Functions

**Complexity:** Low ⭐

**Migration Approach:** Recreate with new name

**Key Considerations:**
- Match runtime version
- Match memory/timeout settings
- Match environment variables
- Migrate layers separately
- Update event sources

**Example:**
```typescript
const myFunction = new lambda.Function(this, 'MyFunction', {
  functionName: 'my-function-cdk-dev',  // New name
  runtime: lambda.Runtime.NODEJS_20_X,  // Match old version
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  memorySize: 1024,  // Match old setting
  timeout: cdk.Duration.seconds(30),  // Match old setting
  environment: {
    TABLE_NAME: table.tableName,  // Connect to migrated resources
    API_KEY: secretsManager.secretValueFromJson('api-key').toString(),
  },
});
```

**Common Issues:**
- Forgot to update environment variables
- Runtime version mismatch
- Missing IAM permissions
- Event source triggers not recreated

**Best Practices:**
- Use CDK's high-level constructs (NodejsFunction, PythonFunction)
- Bundle dependencies properly
- Test locally with SAM or CDK Local
- Use Lambda layers for shared code

---

### API Gateway

**Complexity:** High ⭐⭐⭐⭐

**Migration Approach:** Consider CloudFront instead

**Key Considerations:**
- Complex nested resource structure
- Custom domains require certificate management
- Request/response transformations
- API keys and usage plans
- CORS configuration

**Recommendation:** **Use CloudFront with Lambda Function URLs instead**

**Why CloudFront > API Gateway for Migration:**
- Simpler to configure in CDK
- Better performance (lower latency)
- Better caching capabilities
- Easier custom domain setup
- Lower cost for many use cases

**CloudFront Migration Example:**
```typescript
// Create Lambda with Function URL
const handler = new lambda.Function(this, 'Handler', {
  functionName: 'my-api-cdk-dev',
  // ... other config
});

// Add function URL
const functionUrl = handler.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.AWS_IAM,
});

// Create CloudFront distribution
const distribution = new cloudfront.Distribution(this, 'ApiDistribution', {
  defaultBehavior: {
    origin: new origins.FunctionUrlOrigin(functionUrl),
    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
  },
  domainNames: ['api.example.com'],
  certificate: acm.Certificate.fromCertificateArn(this, 'Cert', certArn),
});
```

**If You Must Use API Gateway:**
- Use CDK's high-level REST API construct
- Consider using OpenAPI/Swagger definition
- Test all endpoints thoroughly
- Verify request/response transformations
- Check authorization and API keys

---

### CloudFront Distributions

**Complexity:** Medium ⭐⭐

**Migration Approach:** Recreate with new distribution

**Key Considerations:**
- Distribution takes 10-20 minutes to deploy
- Need SSL certificate in us-east-1 region
- Custom domain DNS update required
- Cache behaviors and invalidations
- Origin configuration

**Example:**
```typescript
const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(websiteBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
  domainNames: ['www.example.com'],
  certificate: certificate,
  priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
  defaultRootObject: 'index.html',
});

// Output for DNS update
new cdk.CfnOutput(this, 'DistributionDomainName', {
  value: distribution.distributionDomainName,
});
```

**Cutover Process:**
1. Deploy new CloudFront distribution
2. Wait for distribution to be deployed (Status: Deployed)
3. Test the CloudFront URL directly
4. Update Route53 alias record
5. Wait for DNS propagation (TTL period)
6. Monitor traffic shift

**Common Issues:**
- Certificate not in us-east-1
- Origin access control not configured correctly
- Cache behaviors not matching old setup
- Custom error pages missing

---

### IAM Roles and Policies

**Complexity:** Low ⭐

**Migration Approach:** Let CDK create new roles automatically

**Key Considerations:**
- CDK creates roles with least-privilege by default
- Role names will have CDK hash suffix
- Can't have multiple roles with same name

**Recommendation:** **Don't migrate IAM roles** - let CDK create them

**Why:**
- CDK automatically grants correct permissions
- Follows least-privilege principle
- No conflicts with existing roles
- Easier to manage in code

**Example:**
```typescript
const myFunction = new lambda.Function(this, 'MyFunction', {
  // ... other config
  // CDK creates role automatically
});

// Grant additional permissions
table.grantReadWriteData(myFunction);
bucket.grantRead(myFunction);

// Or create explicit role if needed
const customRole = new iam.Role(this, 'CustomLambdaRole', {
  roleName: 'my-lambda-role-cdk',  // Different from old role
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
});

customRole.addToPolicy(new iam.PolicyStatement({
  actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  resources: [table.tableArn],
}));
```

**Migration Considerations:**
- Review least-privilege - don't copy overly permissive policies
- Use CDK's grant methods when possible
- Test all permission scenarios
- No need to match old role names

---

### EventBridge Rules

**Complexity:** Low ⭐

**Migration Approach:** Recreate with new rule names

**Key Considerations:**
- Rule names must be unique
- Schedule expressions or event patterns
- Target configurations
- Dead letter queues

**Example:**
```typescript
const rule = new events.Rule(this, 'ScheduledRule', {
  ruleName: 'process-orders-cdk-dev',  // New name
  schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
  description: 'Trigger order processing every 5 minutes',
});

rule.addTarget(new targets.LambdaFunction(processOrdersFunction, {
  deadLetterQueue: dlq,  // Optional DLQ
  retryAttempts: 2,
}));
```

**Testing:**
- Verify rule is enabled
- Check rule fires at expected times
- Confirm Lambda is triggered
- Check CloudWatch metrics

---

### SNS Topics

**Complexity:** Low ⭐

**Migration Approach:** Recreate with new topic name

**Key Considerations:**
- Topic names must be unique
- Subscriptions need to be recreated
- Email subscriptions require re-confirmation
- Access policies

**Example:**
```typescript
const topic = new sns.Topic(this, 'AlertTopic', {
  topicName: 'alerts-cdk-dev',  // New name
  displayName: 'Alert Notifications',
});

// Add subscriptions
topic.addSubscription(new subscriptions.EmailSubscription('team@example.com'));
topic.addSubscription(new subscriptions.LambdaSubscription(handlerFunction));

// Grant publish permissions
topic.grantPublish(publisherFunction);
```

**Migration Notes:**
- Email subscriptions will need to be re-confirmed
- Update any external systems that publish to the old topic
- Consider using same topic ARN approach if external integrations exist

---

### SQS Queues (Routing Only)

**Complexity:** Low-Medium ⭐⭐

**Migration Approach:** **Import if contains messages**, recreate if configuration only

**Note:** SQS queues straddle the line between stateful and stateless:
- **Messages in queue** = stateful (need preservation)
- **Empty queue** = stateless (can recreate)

**If Queue is Empty:**
```typescript
const queue = new sqs.Queue(this, 'ProcessingQueue', {
  queueName: 'order-processing-cdk-dev',  // New name
  visibilityTimeout: cdk.Duration.seconds(300),
  retentionPeriod: cdk.Duration.days(14),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3,
  },
});
```

**If Queue Has Messages:**
- Follow stateful resource import process
- Or drain queue first, then recreate

---

### Lambda Layers

**Complexity:** Low ⭐

**Migration Approach:** Recreate layers

**Key Considerations:**
- Layer versions are immutable
- Update all Lambda functions to use new layer
- Test compatibility

**Example:**
```typescript
const layer = new lambda.LayerVersion(this, 'DependenciesLayer', {
  layerVersionName: 'dependencies-cdk-dev',
  code: lambda.Code.fromAsset('layers/dependencies'),
  compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
  description: 'Common dependencies',
});

const myFunction = new lambda.Function(this, 'MyFunction', {
  // ... other config
  layers: [layer],
});
```

---

## Migration Strategies by Use Case

### Use Case 1: Simple REST API

**Serverless Components:**
- Lambda functions (3-5 functions)
- API Gateway
- DynamoDB (already migrated)

**Recommended Approach:**
1. Migrate DynamoDB first (stateful import)
2. Create Lambda functions in CDK with new names
3. Create CloudFront distribution instead of API Gateway
4. Test parallel
5. Update DNS
6. Remove old stack

**Timeline:** 1-2 days

---

### Use Case 2: Event-Driven Microservice

**Serverless Components:**
- Lambda functions (multiple)
- EventBridge rules
- SNS topics
- SQS queues
- DynamoDB (already migrated)

**Recommended Approach:**
1. Migrate all stateful resources first (DynamoDB, queues with messages)
2. Create new Lambda functions in CDK
3. Create new EventBridge rules and SNS topics
4. Run both systems in parallel with duplicate events
5. Verify both systems process correctly
6. Disable old event rules
7. Remove old stack

**Timeline:** 2-3 days

---

### Use Case 3: Static Website with API

**Serverless Components:**
- S3 bucket (website) - already migrated
- Lambda functions (API)
- API Gateway
- CloudFront (existing)

**Recommended Approach:**
1. Migrate S3 bucket first (stateful import)
2. Create new Lambda functions in CDK
3. Create new CloudFront distribution with both S3 origin and API origin
4. Test new distribution
5. Update DNS to point to new distribution
6. Remove old resources

**Timeline:** 2-3 days

---

### Use Case 4: Scheduled Jobs

**Serverless Components:**
- Lambda functions
- EventBridge scheduled rules
- DynamoDB (already migrated)

**Recommended Approach:**
1. Migrate stateful resources first
2. Create new Lambda functions in CDK
3. Create new EventBridge rules (initially disabled)
4. Test manually
5. Enable new rules
6. Disable old rules
7. Monitor for one full cycle
8. Remove old stack

**Timeline:** 1 day

---

## Testing Strategies

### Unit Testing

**Test CDK Constructs:**
```typescript
import { Template } from 'aws-cdk-lib/assertions';

test('Lambda function created with correct properties', () => {
  const stack = new MyStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs20.x',
    Timeout: 30,
    MemorySize: 1024,
  });
});
```

### Integration Testing

**Test End-to-End:**
```bash
# Deploy to test environment
npx cdk deploy --context env=test

# Run integration tests
npm run test:integration

# Test API endpoints
curl https://test-api.example.com/health
curl -X POST https://test-api.example.com/orders -d '{"item": "test"}'

# Check DynamoDB
aws dynamodb scan --table-name test-orders-table

# Check logs
aws logs tail /aws/lambda/test-order-processor --follow
```

### Load Testing

**Test Performance:**
```bash
# Use artillery, k6, or similar
artillery quick --count 100 --num 10 https://new-api.example.com/endpoint

# Monitor during load test
watch -n 5 'aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=my-function-cdk-dev \
  --start-time $(date -u -d "5 minutes ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average'
```

### Chaos Testing

**Test Resilience:**
- Inject Lambda errors
- Simulate DynamoDB throttling
- Test with network delays
- Verify error handling
- Check dead letter queues

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting to Update Environment Variables

**Problem:** Lambda functions point to old resource names/ARNs

**Solution:**
- Use CDK references: `table.tableName` instead of hardcoded names
- Review all environment variables
- Test in dev environment first

### Pitfall 2: IAM Permission Gaps

**Problem:** New Lambda doesn't have permissions that old one had

**Solution:**
- Use CDK grant methods
- Review CloudWatch logs for "Access Denied" errors
- Compare old and new IAM policies
- Test all API operations

### Pitfall 3: Missing Event Sources

**Problem:** Lambda isn't triggered because event sources weren't recreated

**Solution:**
- Document all event sources before migration
- Verify EventBridge rules, SNS subscriptions, etc.
- Check CloudWatch metrics for invocations

### Pitfall 4: Different Runtime Behavior

**Problem:** Code works in old Lambda but fails in new one

**Solution:**
- Verify exact runtime version match
- Check Node.js/Python/etc. dependency versions
- Review Lambda environment differences
- Test locally with SAM

### Pitfall 5: Cold Start Performance

**Problem:** New Lambda has worse cold start performance

**Solution:**
- Use provisioned concurrency if needed
- Optimize bundle size
- Consider Lambda warming strategies
- Use Lambda SnapStart (Java) if applicable

### Pitfall 6: Incomplete Cutover

**Problem:** Some traffic still hitting old system days after cutover

**Solution:**
- Check DNS TTL and wait appropriately
- Look for hardcoded URLs in clients
- Check for cached DNS entries
- Monitor old system metrics

---

## Rollback Procedures

### Scenario 1: Issues During Testing (Before Cutover)

**Action:**
- Simply continue using old system
- Fix issues in new CDK code
- Redeploy and test again
- No impact to production

### Scenario 2: Issues Immediately After Cutover

**Action:**
1. Revert DNS/Route53 changes immediately
2. Traffic flows back to old system
3. Investigate and fix issues
4. Retry cutover when ready

**Commands:**
```bash
# Revert Route53 change
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://rollback-change-batch.json
```

### Scenario 3: Issues Hours After Cutover

**Action:**
1. Assess severity
2. If critical: Revert DNS
3. If minor: Fix forward in CDK
4. Deploy fix quickly

### Scenario 4: Old Stack Already Deleted

**Action:**
- Cannot roll back to old system
- Must fix forward in CDK
- Use CloudFormation rollback if needed
- Deploy hotfix

**Prevention:**
- Wait 24-48 hours minimum before cleanup
- Keep old stack around for 7 days if possible

---

## Success Criteria

A stateless resource migration is successful when:

✅ **Functionality Preserved**
- All endpoints work correctly
- All integrations functioning
- No regressions in behavior
- Feature parity with old system

✅ **Performance Maintained or Improved**
- Latency within acceptable range
- No throttling or capacity issues
- Cold starts acceptable
- Cost within budget

✅ **Stability Demonstrated**
- Error rates normal or better
- No production incidents
- Monitoring shows healthy metrics
- Business metrics stable

✅ **Traffic Fully Migrated**
- 100% traffic on new infrastructure
- Zero traffic to old infrastructure
- DNS propagation complete
- All clients using new endpoints

✅ **Old System Removed**
- Serverless stack deleted
- No orphaned resources
- Documentation updated
- Team trained on new system

---

## Timeline Estimates

### Per Service (Manual Process)

| Service Complexity | Resources | Create & Deploy | Testing | Cutover | Total |
|-------------------|-----------|----------------|---------|---------|-------|
| **Simple API** | 1-3 Lambda, API Gateway | 4-6 hours | 2-3 hours | 1-2 hours | 1 day |
| **Medium Service** | 5-10 Lambda, Events, Queues | 1-2 days | 4-8 hours | 2-4 hours | 2-3 days |
| **Complex Service** | 10+ Lambda, multiple integrations | 3-5 days | 1-2 days | 4-8 hours | 5-7 days |

**Note:** These assume stateful resources are already migrated. Add stateful migration time separately.

---

## Migration Checklist

### Pre-Migration
- [ ] Stateful resources already migrated
- [ ] CDK project initialized
- [ ] All Serverless resources documented
- [ ] Naming strategy decided
- [ ] Test environment available

### During Migration
- [ ] CDK code written and reviewed
- [ ] All resources created with new names
- [ ] Environment variables updated
- [ ] IAM permissions verified
- [ ] Event sources configured
- [ ] Deployed to test environment
- [ ] Integration tests passed
- [ ] Load testing completed
- [ ] Parallel testing successful

### Cutover
- [ ] Cutover strategy decided
- [ ] Rollback plan documented
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Stakeholders notified
- [ ] DNS/routing updated
- [ ] Traffic monitoring active

### Post-Cutover
- [ ] System stable for 24+ hours
- [ ] All metrics within normal ranges
- [ ] Zero traffic to old system
- [ ] Business metrics validated
- [ ] Documentation updated
- [ ] Old stack removed
- [ ] Lessons learned documented

---

## Key Takeaways

1. **Recreation is simpler than import** for stateless resources

2. **Parallel deployment is safe** - run both systems simultaneously

3. **New names avoid conflicts** - critical for parallel operation

4. **Test thoroughly** before cutover - no going back easily

5. **Gradual cutover reduces risk** - don't switch all at once

6. **Monitor closely after cutover** - watch for unexpected issues

7. **Keep old system running** until confident - easy rollback

8. **CloudFront > API Gateway** for many migration scenarios

---

## Next Steps

After migrating stateless resources:

1. **Complete Cutover** - Ensure 100% traffic on new system
2. **Monitor Closely** - Watch metrics for 24-48 hours minimum
3. **Remove Old Stack** - Clean up Serverless infrastructure
4. **Update CI/CD** - Switch deployment pipelines to CDK
5. **Document Lessons** - Share knowledge with team
6. **Plan Next Service** - Apply learnings to next migration

---

## Additional Resources

- **AWS Lambda Best Practices:** https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- **CDK Patterns:** https://cdkpatterns.com/
- **CloudFront Documentation:** https://docs.aws.amazon.com/cloudfront/
- **Migration Guide (Stateful Resources):** See companion document
- **Original Tutorial:** https://speedrun.nobackspacecrew.com/blog/2025/03/11/migrating-from-serverless-framework-to-cdk.html

---

**Document Version:** 1.0  
**Date:** January 2025  
**Audience:** Engineers performing Serverless Framework to CDK migrations  
**Focus:** Stateless resources only (Lambda, API Gateway, CloudFront, IAM, etc.)  
**Companion Document:** Stateful Resource Migration Process