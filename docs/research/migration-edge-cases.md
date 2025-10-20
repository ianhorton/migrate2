# Migration Edge Cases and Advanced Scenarios

## Critical Edge Cases

### 1. DynamoDB Global Tables (Multi-Region)

**Challenge:** Global tables replicate across regions with complex configuration.

**Serverless:**
```yaml
resources:
  Resources:
    GlobalTable:
      Type: AWS::DynamoDB::GlobalTable
      Properties:
        TableName: global-users
        Replicas:
          - Region: us-east-1
            PointInTimeRecoverySpecification:
              PointInTimeRecoveryEnabled: true
          - Region: eu-west-1
            PointInTimeRecoverySpecification:
              PointInTimeRecoveryEnabled: true
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES
```

**CDK Migration:**
```typescript
const globalTable = new dynamodb.CfnGlobalTable(this, 'GlobalTable', {
  tableName: 'global-users',
  replicas: [
    {
      region: 'us-east-1',
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      }
    },
    {
      region: 'eu-west-1',
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      }
    }
  ],
  attributeDefinitions: [
    { attributeName: 'id', attributeType: 'S' }
  ],
  keySchema: [
    { attributeName: 'id', keyType: 'HASH' }
  ],
  billingMode: 'PAY_PER_REQUEST',
  streamSpecification: {
    streamViewType: 'NEW_AND_OLD_IMAGES'
  }
});

globalTable.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

**Migration Considerations:**
- All replicas must be included in CDK
- Replication lag must be monitored
- Regional endpoints need verification
- Cannot partially migrate (all or nothing)

### 2. S3 Buckets with Cross-Region Replication

**Challenge:** Replication rules reference other buckets/roles.

**Serverless:**
```yaml
resources:
  Resources:
    SourceBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: source-bucket
        VersioningConfiguration:
          Status: Enabled
        ReplicationConfiguration:
          Role: !GetAtt ReplicationRole.Arn
          Rules:
            - Id: ReplicateAll
              Status: Enabled
              Priority: 1
              Filter:
                Prefix: ''
              Destination:
                Bucket: arn:aws:s3:::destination-bucket
                ReplicationTime:
                  Status: Enabled
                  Time:
                    Minutes: 15
                Metrics:
                  Status: Enabled
```

**Migration Issues:**
- Replication role must exist before import
- Destination bucket must exist
- Cannot pause replication during migration
- Risk of data loss if misconfigured

**Solution:**
1. Document all replication relationships
2. Import buckets in dependency order
3. Verify replication continues working
4. Monitor replication metrics

### 3. Lambda Functions with Provisioned Concurrency

**Challenge:** Provisioned concurrency attached to specific Lambda versions.

**Serverless:**
```yaml
functions:
  api:
    handler: src/api.handler
    provisionedConcurrency: 5
```

**Generated CloudFormation:**
```json
{
  "ApiLambdaFunction": {
    "Type": "AWS::Lambda::Function"
  },
  "ApiProvisionedConcurrencyConfig": {
    "Type": "AWS::Lambda::Alias",
    "Properties": {
      "FunctionName": { "Ref": "ApiLambdaFunction" },
      "FunctionVersion": { "Fn::GetAtt": ["ApiLambdaVersion", "Version"] },
      "Name": "provisioned",
      "ProvisionedConcurrencyConfig": {
        "ProvisionedConcurrentExecutions": 5
      }
    }
  }
}
```

**Migration Strategy:**
- Recreate Lambda with new name
- Apply provisioned concurrency to new version
- Gradually shift traffic
- Remove old provisioned capacity last (cost consideration)

### 4. API Gateway with Custom Domain

**Challenge:** Custom domain points to specific API Gateway.

**Serverless:**
```yaml
provider:
  apiGateway:
    customDomain:
      domainName: api.example.com
      certificateArn: arn:aws:acm:...
      basePath: v1
```

**Migration Strategy:**
1. Create new API Gateway in CDK
2. Create new base path mapping (v2)
3. Test new endpoint
4. Update DNS to point to new API
5. Monitor traffic shift
6. Remove old base path mapping

**DNS Cutover:**
```typescript
// Before migration
api.example.com/v1 → Serverless API Gateway

// During migration (both active)
api.example.com/v1 → Serverless API Gateway
api.example.com/v2 → CDK API Gateway

// After migration
api.example.com/v1 → CDK API Gateway (updated mapping)
```

### 5. EventBridge Rules with Multiple Targets

**Challenge:** Rules reference multiple Lambda functions, SNS topics, SQS queues.

**Serverless:**
```yaml
resources:
  Resources:
    OrderProcessingRule:
      Type: AWS::Events::Rule
      Properties:
        EventPattern:
          source:
            - custom.orders
          detail-type:
            - OrderPlaced
        Targets:
          - Arn: !GetAtt ProcessOrderFunction.Arn
            Id: ProcessOrder
          - Arn: !Ref NotificationTopic
            Id: SendNotification
          - Arn: !GetAtt AnalyticsQueue.Arn
            Id: Analytics
```

**Migration Considerations:**
- All targets must exist before rule creation
- Need Lambda permissions for each function
- Cannot partially migrate (all targets at once)

**Solution:**
```typescript
const rule = new events.CfnRule(this, 'OrderProcessingRule', {
  eventPattern: {
    source: ['custom.orders'],
    'detail-type': ['OrderPlaced']
  },
  targets: [
    {
      arn: processOrderFunction.attrArn,
      id: 'ProcessOrder'
    },
    {
      arn: notificationTopic.ref,
      id: 'SendNotification'
    },
    {
      arn: analyticsQueue.attrArn,
      id: 'Analytics'
    }
  ]
});

// Add permissions
new lambda.CfnPermission(this, 'ProcessOrderPermission', {
  functionName: processOrderFunction.ref,
  action: 'lambda:InvokeFunction',
  principal: 'events.amazonaws.com',
  sourceArn: rule.attrArn
});
```

### 6. Step Functions State Machines

**Challenge:** Complex state machine definitions with resource references.

**Serverless:**
```yaml
resources:
  Resources:
    OrderStateMachine:
      Type: AWS::StepFunctions::StateMachine
      Properties:
        StateMachineName: order-processing
        RoleArn: !GetAtt StepFunctionsRole.Arn
        DefinitionString:
          Fn::Sub: |
            {
              "StartAt": "ProcessOrder",
              "States": {
                "ProcessOrder": {
                  "Type": "Task",
                  "Resource": "${ProcessOrderFunction.Arn}",
                  "Next": "SendNotification"
                },
                "SendNotification": {
                  "Type": "Task",
                  "Resource": "${NotifyFunction.Arn}",
                  "End": true
                }
              }
            }
```

**Migration Strategy:**
- Recreate state machine with new name
- Update all function ARN references
- Test with sample executions
- Update callers to use new state machine
- Monitor executions

### 7. VPC Resources (Lambda in VPC)

**Challenge:** Lambda functions in VPC have network dependencies.

**Serverless:**
```yaml
functions:
  database:
    handler: src/db.handler
    vpc:
      securityGroupIds:
        - sg-12345
      subnetIds:
        - subnet-111
        - subnet-222
```

**Generated CloudFormation:**
```json
{
  "DatabaseLambdaFunction": {
    "Type": "AWS::Lambda::Function",
    "Properties": {
      "VpcConfig": {
        "SecurityGroupIds": ["sg-12345"],
        "SubnetIds": ["subnet-111", "subnet-222"]
      }
    }
  }
}
```

**Migration Considerations:**
- ENI creation/deletion takes time (~5 minutes)
- Cannot test Lambda in VPC until ENIs created
- Security group rules must allow function to access resources
- VPC resources (subnets, security groups) must exist

**CDK Migration:**
```typescript
const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
  vpcId: 'vpc-12345'
});

const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
  this,
  'LambdaSG',
  'sg-12345'
);

const dbFunction = new lambda.Function(this, 'DatabaseFunction', {
  functionName: 'database-function-cdk',
  // ... other props
  vpc,
  securityGroups: [securityGroup],
  vpcSubnets: {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
  }
});
```

### 8. Cognito User Pools

**Challenge:** User pools contain user data, cannot be recreated.

**Serverless:**
```yaml
resources:
  Resources:
    UserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        UserPoolName: my-app-users
        Policies:
          PasswordPolicy:
            MinimumLength: 8
            RequireUppercase: true
            RequireLowercase: true
            RequireNumbers: true
        Schema:
          - Name: email
            AttributeDataType: String
            Required: true
```

**Migration Strategy:**
- **MUST IMPORT** (contains user accounts)
- All properties must match exactly
- Schema cannot be changed
- Custom attributes immutable

**Critical Properties:**
- UserPoolName
- Schema (immutable)
- MfaConfiguration
- Policies

### 9. RDS Databases

**Challenge:** Databases contain critical data, long migration time.

**Serverless:**
```yaml
resources:
  Resources:
    Database:
      Type: AWS::RDS::DBInstance
      Properties:
        DBInstanceIdentifier: my-app-db
        Engine: postgres
        EngineVersion: '14.7'
        DBInstanceClass: db.t3.micro
        AllocatedStorage: 20
        MasterUsername: admin
        MasterUserPassword: !Ref DBPassword
```

**Migration Strategy:**
- **MUST IMPORT** (contains data)
- All properties must match exactly
- Special handling for passwords (SecureString)
- Maintenance windows must be preserved

**CDK Import:**
```typescript
const db = new rds.CfnDBInstance(this, 'Database', {
  dbInstanceIdentifier: 'my-app-db',
  engine: 'postgres',
  engineVersion: '14.7',
  dbInstanceClass: 'db.t3.micro',
  allocatedStorage: '20',
  masterUsername: 'admin',
  masterUserPassword: process.env.DB_PASSWORD, // From Secrets Manager
});

db.applyRemovalPolicy(RemovalPolicy.RETAIN);
```

**Verification:**
- Connection string unchanged
- Application can connect
- No performance degradation
- Backups still running

### 10. CloudFront Distributions

**Challenge:** Complex configuration, global propagation time.

**Serverless:**
```yaml
resources:
  Resources:
    CDN:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          Origins:
            - DomainName: my-bucket.s3.amazonaws.com
              Id: S3Origin
              S3OriginConfig:
                OriginAccessIdentity: !Sub origin-access-identity/cloudfront/${OAI}
          DefaultCacheBehavior:
            TargetOriginId: S3Origin
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD, OPTIONS]
            CachedMethods: [GET, HEAD, OPTIONS]
            ForwardedValues:
              QueryString: false
```

**Migration Considerations:**
- Distribution changes take 15-30 minutes to propagate
- Cannot test until propagation complete
- Custom SSL certificates need validation
- Edge locations cache content

**Migration Strategy:**
1. Import distribution
2. Wait for propagation
3. Test all edge locations
4. Monitor CloudWatch metrics
5. Verify cache behavior

## Dependency Resolution Strategies

### Cross-Stack References

**Problem:**
```yaml
# Stack A
Outputs:
  TableArn:
    Value: !GetAtt UsersTable.Arn
    Export:
      Name: UsersTableArn

# Stack B
Resources:
  Function:
    Properties:
      Environment:
        TABLE_ARN: !ImportValue UsersTableArn
```

**CDK Solution:**
```typescript
// Stack A
const table = new dynamodb.Table(this, 'UsersTable', {
  tableName: 'users-table'
});

new cdk.CfnOutput(this, 'TableArn', {
  value: table.tableArn,
  exportName: 'UsersTableArn'
});

// Stack B
const tableArn = cdk.Fn.importValue('UsersTableArn');

const fn = new lambda.Function(this, 'Function', {
  environment: {
    TABLE_ARN: tableArn
  }
});
```

### Circular Dependencies

**Problem:**
```yaml
ResourceA:
  Properties:
    Ref: !Ref ResourceB

ResourceB:
  DependsOn: ResourceA
```

**Solution:**
1. Identify circular dependency
2. Break cycle by removing one dependency
3. Use explicit `DependsOn` if needed
4. Refactor architecture if necessary

## Testing Strategies for Edge Cases

### Validation Checklist

1. **Resource Existence**
   ```typescript
   async function verifyResourceExists(physicalId: string): Promise<boolean> {
     // Check AWS API for resource
   }
   ```

2. **Property Matching**
   ```typescript
   async function verifyProperties(
     resource: Resource,
     cdkTemplate: CFTemplate
   ): Promise<boolean> {
     // Deep compare properties
   }
   ```

3. **Dependency Integrity**
   ```typescript
   async function verifyDependencies(
     resource: Resource,
     dependencyGraph: Graph
   ): Promise<boolean> {
     // Verify all dependencies exist
   }
   ```

4. **Drift Detection**
   ```typescript
   async function checkDrift(stackName: string): Promise<DriftResult> {
     // Use CloudFormation Drift Detection API
   }
   ```

## Recommendations

1. **Document All Edge Cases**
   - Maintain list of complex resources
   - Note special handling requirements
   - Track migration order

2. **Test in Sandbox First**
   - Never test on production
   - Use dev/staging stacks
   - Validate entire process

3. **Incremental Migration**
   - One resource type at a time
   - Verify each step
   - Easier debugging

4. **Monitoring and Rollback**
   - Monitor CloudWatch metrics
   - Track error rates
   - Have rollback plan ready

5. **Communication**
   - Notify stakeholders
   - Document downtime windows
   - Provide status updates
