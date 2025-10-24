import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * Stack Summary
 *
 * Total Resources: 7
 * - Stateful: 5
 * - Stateless: 2
 *
 * Resource Groups: 5
 *  * - Storage: 1
 * - Logging: 1
 * - Iam: 1
 * - Compute: 1
 * - Databases: 3
 */



export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

// ========================================
// Storage (1 resource)
// ========================================
const serverlessDeploymentBucket = new s3.Bucket(this, 'ServerlessDeploymentBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED
    });
    serverlessDeploymentBucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    (serverlessDeploymentBucket.node.defaultChild as cdk.CfnResource).overrideLogicalId('ServerlessDeploymentBucket');

    // IMPORTANT: This resource will be imported, not created

// ========================================
// Logging (1 resource)
// ========================================
const helloLogGroup = new logs.LogGroup(this, 'HelloLogGroup', {
      logGroupName: '/aws/lambda/messy-env-test-dev-hello'
    });
    helloLogGroup.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    (helloLogGroup.node.defaultChild as cdk.CfnResource).overrideLogicalId('HelloLogGroup');

// ========================================
// Iam (1 resource)
// ========================================
const iamRoleLambdaExecution = new iam.Role(this, 'IamRoleLambdaExecution', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
});

iamRoleLambdaExecution.addToPolicy(new iam.PolicyStatement({
  actions: ['logs:CreateLogStream', 'logs:CreateLogGroup', 'logs:TagResource'],
  resources: [`arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/messy-env-test-dev*:*`]
}));
iamRoleLambdaExecution.addToPolicy(new iam.PolicyStatement({
  actions: ['logs:PutLogEvents'],
  resources: [`arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/messy-env-test-dev*:*:*`]
}));

// ========================================
// Compute (1 resource)
// ========================================
const helloLambdaFunction = new lambda.Function(this, 'HelloLambdaFunction', {
      code: lambda.Code.fromBucket(serverlessDeploymentBucket, 'serverless/messy-env-test/dev/1761299650229-2025-10-24T09:54:10.229Z/messy-env-test.zip'),
      handler: 'handler.hello',
      runtime: lambda.Runtime.NODEJS_18_X,
      functionName: 'messy-env-test-dev-hello',
      memorySize: 1024,
      timeout: cdk.Duration.seconds(6)
    });

    // IMPORTANT: This resource will be imported, not created

// ========================================
// Databases (3 resources)
// ========================================
const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'messy-test-users',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING
        }
    });
    usersTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    (usersTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('UsersTable');

    // IMPORTANT: This resource will be imported, not created

const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'messy-test-order',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
          name: 'id',
          type: dynamodb.AttributeType.STRING
        }
    });
    ordersTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    (ordersTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('OrdersTable');

    // IMPORTANT: This resource will be imported, not created

const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'messy-test-sessions',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
          name: 'sessionId',
          type: dynamodb.AttributeType.STRING
        }
    });
    sessionsTable.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    (sessionsTable.node.defaultChild as cdk.CfnResource).overrideLogicalId('SessionsTable');
  }
}
