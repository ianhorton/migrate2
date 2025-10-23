/**
 * CDK Code Generator
 *
 * Generates complete CDK project structure including:
 * - Stack files
 * - App entry point
 * - Configuration files
 * - Package.json
 */

import { Resource, ClassifiedResource } from '../../types';
import { GeneratorConfig } from './index';
import { TypeScriptGenerator } from './typescript-generator';
import { ResourceClassifier } from './resource-classifier';
import { CodeCleaner } from './code-cleaner';

/**
 * CDK project code generator
 */
export class CDKCodeGenerator {
  private typeScriptGenerator: TypeScriptGenerator;
  private resourceClassifier: ResourceClassifier;

  constructor() {
    this.typeScriptGenerator = new TypeScriptGenerator();
    this.resourceClassifier = new ResourceClassifier();
  }

  /**
   * Generate complete CDK stack file
   */
  async generateStack(
    resources: Resource[],
    config: GeneratorConfig
  ): Promise<string> {
    const stackName = config.stackName || 'MigratedStack';
    const useL2 = config.useL2Constructs !== false;

    // SPRINT 1: Classify all resources FIRST
    console.log('🔍 Classifying resources...');
    const classifiedResources: ClassifiedResource[] = [];

    for (const resource of resources) {
      const classified = this.resourceClassifier.classifyResources(
        [this.convertToCloudFormationResource(resource)],
        resource.logicalId
      )[0];
      classifiedResources.push(classified);
    }

    // Add related resources metadata
    for (let i = 0; i < classifiedResources.length; i++) {
      classifiedResources[i] = this.resourceClassifier.findRelatedResources(
        classifiedResources[i],
        classifiedResources
      );
    }

    console.log(`✅ Classified ${classifiedResources.length} resources`);
    console.log(`📝 Resource Logical IDs:`, classifiedResources.map(r => r.LogicalId));

    // Initialize TypeScriptGenerator with classified resources
    this.typeScriptGenerator.initializeWithResources(classifiedResources, {
      stage: config.stackName?.includes('prod') ? 'prod' : 'dev'
    });

    // Generate imports
    const resourceTypes = new Set(classifiedResources.map((r) => r.Type));
    const imports = this.typeScriptGenerator.generateImports(resourceTypes);

    // Generate constructs
    const constructs: string[] = [];
    for (const resource of classifiedResources) {
      try {
        const construct = this.typeScriptGenerator.generateConstruct(
          resource,
          useL2
        );

        // Add comment header (only if comments exist)
        let constructCode = construct.code;
        if (construct.comments.length > 0) {
          const comment = construct.comments
            .map((c) => `    // ${c}`)
            .join('\n');
          constructCode = `${comment}\n${constructCode}`;
        }

        constructs.push(constructCode);
      } catch (error) {
        // Log error but continue
        console.warn(
          `Warning: Could not generate construct for ${resource.LogicalId}:`,
          error
        );
      }
    }

    // Combine into stack code
    let stackCode = this.renderStackTemplate(stackName, imports, constructs);
    console.log(`📄 Generated ${constructs.length} constructs before cleaning`);

    // SPRINT 3: Run CodeCleaner on the generated code
    console.log('🧹 Cleaning generated code...');
    const codeCleaner = new CodeCleaner(classifiedResources);
    const cleaningResult = codeCleaner.cleanCode(stackCode);

    // Count constructs after cleaning
    const afterConstructs = (cleaningResult.code.match(/const\s+\w+\s*=\s*new\s+/g) || []).length;
    console.log(`📄 Have ${afterConstructs} constructs after cleaning`);

    stackCode = cleaningResult.code;

    // Log cleaning metrics
    console.log('📊 Code Cleaning Metrics:');
    console.log(`  Comments: ${cleaningResult.metrics.comments.reductionPercentage}% reduction`);
    console.log(`  Logical ID Overrides: ${cleaningResult.metrics.logicalIds.reductionPercentage}% reduction`);
    console.log(`  Removal Policies: ${cleaningResult.metrics.removalPolicies.reductionPercentage}% reduction`);
    console.log(`  Total Reduction: ${cleaningResult.metrics.totalReductionPercentage}%`);

    return stackCode;
  }

  /**
   * Convert Resource to CloudFormationResource for classifier
   */
  private convertToCloudFormationResource(resource: Resource): any {
    return {
      Type: resource.type,
      Properties: resource.properties,
      Metadata: resource.metadata,
      DependsOn: resource.dependencies
    };
  }

  /**
   * Generate app entry point (bin/app.ts)
   */
  async generateApp(config: GeneratorConfig): Promise<string> {
    const stackName = config.stackName || 'MigratedStack';
    const stackFileName = this.toKebabCase(stackName);

    return `#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ${stackName} } from '../lib/${stackFileName}-stack';

const app = new cdk.App();

new ${stackName}(app, '${stackName}', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },

  // Uncomment to specialize this stack for the AWS Account/Region
  // env: { account: '123456789012', region: 'us-east-1' },

  // For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
});

app.synth();
`;
  }

  /**
   * Generate cdk.json configuration
   */
  async generateCDKConfig(config: GeneratorConfig): Promise<string> {
    const cdkConfig = {
      app: 'npx ts-node --prefer-ts-exts bin/app.ts',
      watch: {
        include: ['**'],
        exclude: [
          'README.md',
          'cdk*.json',
          '**/*.d.ts',
          '**/*.js',
          'tsconfig.json',
          'package*.json',
          'yarn.lock',
          'node_modules',
          'test',
        ],
      },
      context: {
        '@aws-cdk/aws-lambda:recognizeLayerVersion': true,
        '@aws-cdk/core:checkSecretUsage': true,
        '@aws-cdk/core:target-partitions': ['aws', 'aws-cn'],
        '@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver': true,
        '@aws-cdk/aws-ec2:uniqueImdsv2TemplateName': true,
        '@aws-cdk/aws-ecs:arnFormatIncludesClusterName': true,
        '@aws-cdk/aws-iam:minimizePolicies': true,
        '@aws-cdk/core:validateSnapshotRemovalPolicy': true,
        '@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName': true,
        '@aws-cdk/aws-s3:createDefaultLoggingPolicy': true,
        '@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption': true,
        '@aws-cdk/aws-apigateway:disableCloudWatchRole': true,
        '@aws-cdk/core:enablePartitionLiterals': true,
        '@aws-cdk/aws-events:eventsTargetQueueSameAccount': true,
        '@aws-cdk/aws-iam:standardizedServicePrincipals': true,
        '@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker': true,
        '@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName': true,
        '@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy': true,
        '@aws-cdk/aws-route53-patters:useCertificate': true,
        '@aws-cdk/customresources:installLatestAwsSdkDefault': false,
        '@aws-cdk/aws-rds:databaseProxyUniqueResourceName': true,
        '@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup': true,
        '@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId': true,
        '@aws-cdk/aws-ec2:launchTemplateDefaultUserData': true,
        '@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments': true,
        '@aws-cdk/aws-redshift:columnId': true,
        '@aws-cdk/aws-stepfunctions-tasks:enableEmrServicePolicyV2': true,
        '@aws-cdk/aws-ec2:restrictDefaultSecurityGroup': true,
        '@aws-cdk/aws-apigateway:requestValidatorUniqueId': true,
        '@aws-cdk/aws-kms:aliasNameRef': true,
        '@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig': true,
        '@aws-cdk/core:includePrefixInUniqueNameGeneration': true,
        '@aws-cdk/aws-efs:denyAnonymousAccess': true,
        '@aws-cdk/aws-opensearchservice:enableOpensearchMultiAzWithStandby': true,
        '@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion': true,
        '@aws-cdk/aws-efs:mountTargetOrderInsensitiveLogicalId': true,
        '@aws-cdk/aws-rds:auroraClusterChangeScopeOfInstanceParameterGroupWithEachParameters': true,
        '@aws-cdk/aws-appsync:useArnForSourceApiAssociationIdentifier': true,
        '@aws-cdk/aws-rds:preventRenderingDeprecatedCredentials': true,
        '@aws-cdk/aws-codepipeline-actions:useNewDefaultBranchForCodeCommitSource': true,
        '@aws-cdk/aws-cloudwatch-actions:changeLambdaPermissionLogicalIdForLambdaAction': true,
        '@aws-cdk/aws-codepipeline:crossAccountKeysDefaultValueToFalse': true,
        '@aws-cdk/aws-codepipeline:defaultPipelineTypeToV2': true,
        '@aws-cdk/aws-kms:reduceCrossAccountRegionPolicyScope': true,
        '@aws-cdk/aws-eks:nodegroupNameAttribute': true,
        '@aws-cdk/aws-ec2:ebsDefaultGp3Volume': true,
        '@aws-cdk/aws-ecs:removeDefaultDeploymentAlarm': true,
        '@aws-cdk/custom-resources:logApiResponseDataPropertyTrueFalse': true,
        '@aws-cdk/aws-s3:keepNotificationInImportedBucket': false,
      },
    };

    return JSON.stringify(cdkConfig, null, 2);
  }

  /**
   * Generate package.json for CDK project
   */
  async generatePackageJson(config: GeneratorConfig): Promise<string> {
    const stackName = config.stackName || 'MigratedStack';
    const cdkVersion = config.cdkVersion || '2.100.0';

    const packageJson = {
      name: this.toKebabCase(stackName),
      version: '0.1.0',
      description: 'CDK stack migrated from Serverless Framework',
      bin: {
        [this.toKebabCase(stackName)]: 'bin/app.js',
      },
      scripts: {
        build: 'tsc',
        watch: 'tsc -w',
        test: 'jest',
        cdk: 'cdk',
        'synth': 'cdk synth',
        'deploy': 'cdk deploy',
        'diff': 'cdk diff',
        'destroy': 'cdk destroy',
      },
      devDependencies: {
        '@types/jest': '^29.5.0',
        '@types/node': '20.10.0',
        'aws-cdk': `^${cdkVersion}`,
        jest: '^29.5.0',
        'ts-jest': '^29.1.0',
        'ts-node': '^10.9.1',
        typescript: '~5.3.0',
      },
      dependencies: {
        'aws-cdk-lib': `^${cdkVersion}`,
        constructs: '^10.0.0',
        'source-map-support': '^0.5.21',
      },
    };

    return JSON.stringify(packageJson, null, 2);
  }

  /**
   * Render stack template
   */
  private renderStackTemplate(
    stackName: string,
    imports: string[],
    constructs: string[]
  ): string {
    // Always include Construct import for CDK v2
    const allImports = ['import { Construct } from \'constructs\';', ...imports];
    const importSection = allImports.join('\n');
    const constructSection = constructs.join('\n\n');

    return `${importSection}

/**
 * ${stackName} - Migrated from Serverless Framework
 *
 * This stack contains resources that were imported from an existing
 * Serverless Framework application. All resources have RemovalPolicy.RETAIN
 * to prevent accidental deletion.
 */
export class ${stackName} extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

${constructSection}
  }
}
`;
  }

  /**
   * Convert string to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }
}
