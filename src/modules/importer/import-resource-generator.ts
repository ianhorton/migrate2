/**
 * Import Resource Generator
 * Generates CDK import resource definitions from comparison results
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { STATEFUL_RESOURCE_TYPES, STATELESS_RESOURCE_TYPES } from '../../types/migration';

export interface ComparisonResource {
  resourceType: string;
  physicalId: string;
  slsLogicalId: string;
  cdkLogicalId: string;
  status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL';
  differences?: any[];
  recommendation?: string;
}

export interface ComparisonResult {
  summary: {
    total_resources: number;
    matched: number;
    status: Record<string, number>;
  };
  resources: ComparisonResource[];
  overall_status: string;
  ready_for_import: boolean;
  blocking_issues: string[];
}

export interface CDKImportResource {
  resourceType: string;
  logicalResourceId: string;
  resourceIdentifier: Record<string, string>;
}

export class ImportResourceGenerator {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ImportResourceGenerator');
  }

  /**
   * Generate CDK import resources from comparison results
   */
  public async generateImportResources(
    comparisonResult: ComparisonResult,
    outputPath: string
  ): Promise<{
    importResources: CDKImportResource[];
    importableCount: number;
    skippedCount: number;
    warnings: string[];
  }> {
    this.logger.info('Generating CDK import resources from comparison');

    const importResources: CDKImportResource[] = [];
    const warnings: string[] = [];
    let skippedCount = 0;

    // Validate input
    if (!comparisonResult) {
      throw new Error('Comparison result is required');
    }

    if (!comparisonResult.resources || !Array.isArray(comparisonResult.resources)) {
      throw new Error('Comparison result must have a resources array');
    }

    // Check if ready for import
    if (!comparisonResult.ready_for_import) {
      this.logger.warn('Comparison result indicates not ready for import');
      warnings.push('Comparison indicates migration may not be ready for import');
    }

    // Process each resource
    for (const resource of comparisonResult.resources) {
      // Skip stateless resources - they should be recreated, not imported
      if (STATELESS_RESOURCE_TYPES.includes(resource.resourceType as any)) {
        this.logger.debug(`Skipping stateless resource: ${resource.cdkLogicalId} (${resource.resourceType})`);
        this.logger.debug('Stateless resources will be recreated by cdk deploy');
        skippedCount++;
        continue;
      }

      // Skip resources with CRITICAL status
      if (resource.status === 'CRITICAL') {
        this.logger.warn(`Skipping CRITICAL resource: ${resource.cdkLogicalId}`);
        warnings.push(`Skipped ${resource.cdkLogicalId}: CRITICAL issues detected`);
        skippedCount++;
        continue;
      }

      // Generate resource identifier based on type
      const resourceIdentifier = this.generateResourceIdentifier(
        resource.resourceType,
        resource.physicalId
      );

      if (!resourceIdentifier) {
        this.logger.warn(`Could not generate identifier for: ${resource.cdkLogicalId}`);
        warnings.push(`Skipped ${resource.cdkLogicalId}: Unknown resource type`);
        skippedCount++;
        continue;
      }

      // Add to import list
      importResources.push({
        resourceType: resource.resourceType,
        logicalResourceId: resource.cdkLogicalId,
        resourceIdentifier
      });

      // Add warnings for WARNING status resources
      if (resource.status === 'WARNING') {
        warnings.push(
          `${resource.cdkLogicalId}: ${resource.differences?.length || 0} differences detected`
        );
      }
    }

    // Write import-resources.json file
    await this.writeImportResourcesFile(outputPath, importResources);

    // Write human-readable import plan
    await this.writeImportPlan(outputPath, importResources, warnings);

    this.logger.info(`Generated ${importResources.length} import resources`);

    return {
      importResources,
      importableCount: importResources.length,
      skippedCount,
      warnings
    };
  }

  /**
   * Generate resource identifier based on AWS resource type
   */
  private generateResourceIdentifier(
    resourceType: string,
    physicalId: string
  ): Record<string, string> | null {
    // Map resource types to their identifier keys
    const identifierMap: Record<string, (id: string) => Record<string, string>> = {
      'AWS::DynamoDB::Table': (id) => ({ TableName: id }),
      'AWS::S3::Bucket': (id) => ({ BucketName: id }),
      'AWS::Lambda::Function': (id) => ({ FunctionName: id }),
      'AWS::Logs::LogGroup': (id) => ({ LogGroupName: id }),
      'AWS::IAM::Role': (id) => ({ RoleName: id }),
      'AWS::SQS::Queue': (id) => ({ QueueUrl: id }),
      'AWS::SNS::Topic': (id) => ({ TopicArn: id }),
      'AWS::ApiGateway::RestApi': (id) => ({ RestApiId: id }),
      'AWS::ApiGateway::Resource': (id) => ({ RestApiId: id.split('/')[0], ResourceId: id }),
      'AWS::ApiGateway::Method': (id) => ({ RestApiId: id.split('/')[0], ResourceId: id.split('/')[1], HttpMethod: id.split('/')[2] }),
      'AWS::ApiGateway::Deployment': (id) => ({ RestApiId: id.split('/')[0], DeploymentId: id }),
      'AWS::ApiGateway::Stage': (id) => ({ RestApiId: id.split('/')[0], StageName: id.split('/')[1] }),
      'AWS::Events::Rule': (id) => ({ RuleName: id }),
      'AWS::CloudWatch::Alarm': (id) => ({ AlarmName: id }),
      'AWS::KMS::Key': (id) => ({ KeyId: id }),
      'AWS::SecretsManager::Secret': (id) => ({ SecretId: id }),
      'AWS::SSM::Parameter': (id) => ({ ParameterName: id }),
      'AWS::EC2::SecurityGroup': (id) => ({ GroupId: id }),
      'AWS::EC2::VPC': (id) => ({ VpcId: id }),
      'AWS::EC2::Subnet': (id) => ({ SubnetId: id }),
      'AWS::RDS::DBInstance': (id) => ({ DBInstanceIdentifier: id }),
      'AWS::RDS::DBCluster': (id) => ({ DBClusterIdentifier: id }),
      'AWS::ElastiCache::CacheCluster': (id) => ({ CacheClusterId: id }),
      'AWS::ECS::Cluster': (id) => ({ ClusterArn: id }),
      'AWS::ECS::Service': (id) => ({ ServiceArn: id }),
      'AWS::ECS::TaskDefinition': (id) => ({ TaskDefinitionArn: id })
    };

    const generator = identifierMap[resourceType];
    if (!generator) {
      this.logger.warn(`Unknown resource type: ${resourceType}`);
      return null;
    }

    return generator(physicalId);
  }

  /**
   * Write import-resources.json file for CDK
   */
  private async writeImportResourcesFile(
    outputPath: string,
    resources: CDKImportResource[]
  ): Promise<void> {
    const filePath = path.join(outputPath, 'import-resources.json');
    const content = JSON.stringify(resources, null, 2);

    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.info(`Wrote import resources to: ${filePath}`);
  }

  /**
   * Write human-readable import plan
   */
  private async writeImportPlan(
    outputPath: string,
    resources: CDKImportResource[],
    warnings: string[]
  ): Promise<void> {
    const filePath = path.join(outputPath, 'IMPORT_PLAN.md');

    const content = `# CDK Import Plan

## Overview
This file contains the plan for importing existing **stateful** AWS resources into your CDK stack.

**Migration Strategy:**
- ✅ **Stateful resources** (DynamoDB, S3, RDS, etc.) → **IMPORT** (preserves data)
- ✅ **Stateless resources** (Lambda, IAM, API Gateway, etc.) → **RECREATE** (no data to lose)

Stateless resources have been automatically excluded from import and will be recreated when you run \`cdk deploy\`.

## Resources to Import (Stateful Only)
Total resources: ${resources.length}

${resources.map((r, i) => `${i + 1}. **${r.logicalResourceId}** (${r.resourceType})
   - Identifier: ${JSON.stringify(r.resourceIdentifier, null, 4).replace(/\n/g, '\n   ')}`).join('\n\n')}

## Warnings
${warnings.length > 0 ? warnings.map((w, i) => `${i + 1}. ${w}`).join('\n') : '_No warnings_'}

## Next Steps

### Critical: Delete Serverless Stack First

**⚠️  IMPORTANT**: Before importing, you must delete the Serverless Framework stack to avoid resource conflicts:

\`\`\`bash
cd <serverless-project-directory>
serverless remove
\`\`\`

This is safe because:
- Stateful resources (DynamoDB, S3) have DeletionPolicy: Retain and will NOT be deleted
- Stateless resources (Lambda, IAM) will be deleted, but CDK will recreate them

### Import and Deploy Process

**Step 1: Delete Serverless Stack**
\`\`\`bash
serverless remove  # Removes stack but retains stateful resources
\`\`\`

**Step 2: Import stateful resources into CDK**
\`\`\`bash
cdk import --resource-mapping import-resources.json
\`\`\`

This imports ONLY stateful resources (DynamoDB, S3, etc.) and creates fresh stateless resources (Lambda, IAM, API Gateway).

**Alternative: Use --force if needed**
\`\`\`bash
cdk import --resource-mapping import-resources.json --force
\`\`\`

### What Happens During Import

1. CDK creates/updates your CloudFormation stack
2. Imports stateful resources (DynamoDB tables, S3 buckets) - no data loss
3. Creates NEW Lambda functions with fresh code
4. Creates NEW IAM roles and policies
5. All resources now managed by CDK

## Import Process

### Step 1: Import Stateful Resources
The import process will:
1. Create a new CDK stack in CloudFormation
2. Import the existing **stateful** resources into that stack
3. Transfer management of stateful resources from Serverless to CDK
4. Preserve all resource data (no downtime)

### Step 2: Recreate Stateless Resources
After import succeeds, run \`cdk deploy\` to:
1. Create new stateless resources (Lambda, IAM roles, API Gateway, etc.)
2. Replace the old Serverless versions
3. Connect them to your imported stateful resources

**Why this approach?**
- Stateful resources contain data (DynamoDB tables, S3 buckets) → Must be imported to avoid data loss
- Stateless resources have no data (Lambda functions, IAM roles) → Safe to recreate
- This avoids CDK drift errors and follows AWS best practices

## Troubleshooting

### "No resource updates or deletes are allowed on import operation"
**Cause**: CDK detects differences between your generated code and the actual AWS resource.

**Common Issue with Lambda Functions**: Missing \`overrideLogicalId()\` call.

**Solution**:
1. Open your CDK stack file (e.g., \`lib/*-stack.ts\`)
2. Find the Lambda function definition
3. Add the overrideLogicalId right after the function definition:
   \`\`\`typescript
   const myFunction = new lambda.Function(this, 'MyFunction', { ... });
   // Add this line (replace with actual CloudFormation logical ID):
   (myFunction.node.defaultChild as cdk.CfnResource).overrideLogicalId('HelloLambdaFunction3DCA9067');
   \`\`\`
4. Also add role assignment if missing:
   \`\`\`typescript
   role: iamRoleLambdaExecution
   \`\`\`
5. Re-run: \`cdk import --resource-mapping import-resources.json\`

**Alternative**: Use \`--force\` flag but CDK may try to update the resource:
\`\`\`bash
cdk import --resource-mapping import-resources.json --force
\`\`\`

### Import fails with "Resource already exists"
This means CDK is trying to CREATE instead of IMPORT. Ensure:
- The stack doesn't already exist in CloudFormation
- You're using \`cdk import\` not \`cdk deploy\`
- The \`import-resources.json\` file is present

### Import succeeds but resources differ
Review the warnings above. Minor differences are usually acceptable.
Run a drift detection after import to verify.

## Additional Resources
- [CDK Import Documentation](https://docs.aws.amazon.com/cdk/v2/guide/resources.html#resources_importing)
- [CloudFormation Import](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html)
- [Resource Import Troubleshooting](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import-troubleshooting.html)
`;

    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.info(`Wrote import plan to: ${filePath}`);
  }
}
