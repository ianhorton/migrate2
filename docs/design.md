# Serverless-to-CDK Migration Tool: Design Document

## Executive Summary

This document outlines the design for an automated migration tool that eliminates manual "eyeballing" and error-prone steps when migrating from Serverless Framework to AWS CDK. The tool automates template comparison, resource discovery, CloudFormation manipulation, and orchestration while keeping humans in the loop only for critical decision points.

**Core Philosophy:** Automate the tedious and error-prone, require approval for the irreversible.

---

## Table of Contents

1. [Design Goals](#design-goals)
2. [System Architecture](#system-architecture)
3. [Core Components](#core-components)
4. [Automation Strategy](#automation-strategy)
5. [User Experience Flow](#user-experience-flow)
6. [Technical Implementation](#technical-implementation)
7. [Safety Mechanisms](#safety-mechanisms)
8. [Future Enhancements](#future-enhancements)

---

## Design Goals

### Primary Goals

1. **Eliminate Manual Template Comparison**
   - Automate CloudFormation diff analysis
   - Provide clear, actionable reports on differences
   - Classify differences automatically (critical/warning/acceptable)

2. **Remove Human Error in Template Editing**
   - Programmatically modify CloudFormation templates
   - Handle dependency graph updates automatically
   - Validate changes before deployment

3. **Automate Resource Discovery**
   - Identify all resources including abstracted ones
   - Build complete dependency graph
   - Classify resources (stateful/stateless, import/recreate)

4. **Provide Guided Orchestration**
   - Step-by-step execution with verification
   - State management for resumability
   - Rollback capabilities

5. **Generate CDK Code**
   - Convert CloudFormation resources to CDK constructs
   - Match property configurations exactly
   - Support multiple CDK languages (TypeScript priority)

### Secondary Goals

- Comprehensive logging and audit trail
- Dry-run mode for all operations
- Integration with existing CI/CD pipelines
- Support for multi-account/multi-region scenarios
- Extensible plugin system for custom resources

### Non-Goals (for v1.0)

- Automatic cutover of production traffic
- Database migration/data movement
- Cross-account resource migration
- Non-AWS resource migration

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Interface                            │
│  (Interactive wizard + Command mode + Config file support)   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Migration Orchestrator                      │
│  - State machine management                                  │
│  - Step execution & verification                             │
│  - Rollback coordination                                     │
│  - Progress tracking & reporting                             │
└─┬───────────────────┬──────────────────┬───────────────────┬┘
  │                   │                  │                   │
  ▼                   ▼                  ▼                   ▼
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────────┐
│ Scanner │     │Comparator│     │Generator │     │   Editor    │
│ Module  │     │  Module  │     │  Module  │     │   Module    │
└────┬────┘     └─────┬────┘     └────┬─────┘     └──────┬──────┘
     │                │               │                   │
     │                │               │                   │
     └────────────────┴───────────────┴───────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Integration Layer                               │
│  ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐ │
│  │AWS SDK   │  │SLS CLI  │  │CDK CLI  │  │CloudFormation│ │
│  │Interface │  │Interface│  │Interface│  │API           │ │
│  └──────────┘  └─────────┘  └─────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  State Management                            │
│  - Migration state (JSON/SQLite)                             │
│  - Resource tracking                                         │
│  - Audit log                                                 │
│  - Backup/snapshot storage                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Scanner Module

**Purpose:** Discover and analyze all resources in the Serverless application

**Key Functions:**

```typescript
interface ScannerModule {
  // Parse serverless.yml and extract explicit resources
  parseServerlessConfig(path: string): ParsedServerlessConfig;
  
  // Execute 'serverless package' and extract generated CloudFormation
  generateCloudFormation(): CloudFormationTemplate;
  
  // Identify all resources including abstracted ones
  discoverAllResources(): ResourceInventory;
  
  // Build dependency graph between resources
  buildDependencyGraph(resources: Resource[]): DependencyGraph;
  
  // Classify resources
  classifyResources(resources: Resource[]): ResourceClassification;
}

interface ResourceInventory {
  explicit: Resource[];      // Defined in serverless.yml
  abstracted: Resource[];    // Auto-generated (LogGroups, Roles, etc.)
  stateful: Resource[];      // Must be imported
  stateless: Resource[];     // Can be recreated
}

interface ResourceClassification {
  toImport: Resource[];      // DynamoDB, S3, RDS, LogGroups
  toRecreate: Resource[];    // Lambda, API Gateway, IAM Roles
  dependencies: Map<string, string[]>;
}
```

**Implementation Details:**

1. **Serverless Config Parsing**
   - Use YAML parser (js-yaml)
   - Resolve variable substitutions (${env:VAR}, ${self:custom.var})
   - Extract custom CloudFormation resources section
   - Handle plugins and custom configurations

2. **CloudFormation Generation**
   - Execute `npx serverless package --stage <stage>`
   - Parse `.serverless/cloudformation-template-update-stack.json`
   - Extract all resource definitions
   - Capture current deployment state

3. **Resource Discovery**
   - Match explicit resources from serverless.yml to CloudFormation
   - Identify abstracted resources (not in serverless.yml but in CloudFormation)
   - Common abstracted resources:
     - CloudWatch LogGroups (pattern: `/aws/lambda/{functionName}`)
     - IAM Roles (pattern: `{FunctionName}IamRole`)
     - Lambda Versions
     - API Gateway deployments

4. **Classification Logic**
   ```typescript
   function classifyResource(resource: Resource): ResourceAction {
     const statefulTypes = [
       'AWS::DynamoDB::Table',
       'AWS::S3::Bucket',
       'AWS::RDS::DBInstance',
       'AWS::RDS::DBCluster',
       'AWS::Logs::LogGroup',
       'AWS::ECS::Cluster',
       'AWS::EFS::FileSystem'
     ];
     
     if (statefulTypes.includes(resource.type)) {
       return 'IMPORT';
     }
     
     return 'RECREATE';
   }
   ```

**Output Example:**

```json
{
  "scan_id": "scan-20250120-001",
  "timestamp": "2025-01-20T10:30:00Z",
  "serverless_stack": "migration-sandbox-dev",
  "resources": {
    "total": 8,
    "explicit": 2,
    "abstracted": 6,
    "stateful": 3,
    "stateless": 5
  },
  "inventory": [
    {
      "logical_id": "counterTable",
      "type": "AWS::DynamoDB::Table",
      "physical_id": "migration-sandbox-table",
      "classification": "IMPORT",
      "source": "explicit",
      "dependencies": []
    },
    {
      "logical_id": "CounterLogGroup",
      "type": "AWS::Logs::LogGroup",
      "physical_id": "/aws/lambda/migration-sandbox-counter",
      "classification": "IMPORT",
      "source": "abstracted",
      "dependencies": ["CounterLambdaFunction"]
    }
  ],
  "dependency_graph": {
    "CounterLambdaFunction": ["CounterLogGroup", "CounterLambdaRole"],
    "counterTable": []
  }
}
```

---

### 2. Comparator Module

**Purpose:** Automatically compare Serverless and CDK CloudFormation templates, eliminating manual "eyeballing"

**Key Functions:**

```typescript
interface ComparatorModule {
  // Load and parse both templates
  loadTemplates(slsPath: string, cdkPath: string): TemplateSet;
  
  // Match resources between templates by physical identifiers
  matchResources(sls: CFTemplate, cdk: CFTemplate): ResourceMatches[];
  
  // Deep compare properties for each resource
  compareResource(slsResource: Resource, cdkResource: Resource): ComparisonResult;
  
  // Generate human-readable diff report
  generateReport(comparisons: ComparisonResult[]): Report;
  
  // Validate that resources are safe to import
  validateForImport(comparison: ComparisonResult): ValidationResult;
}

interface ComparisonResult {
  resourceType: string;
  physicalId: string;
  slsLogicalId: string;
  cdkLogicalId: string;
  status: 'MATCH' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL';
  differences: PropertyDifference[];
  recommendation: string;
}

interface PropertyDifference {
  property: string;
  slsValue: any;
  cdkValue: any;
  severity: 'CRITICAL' | 'WARNING' | 'ACCEPTABLE' | 'INFO';
  explanation: string;
  autoFixable: boolean;
}
```

**Implementation Details:**

1. **Resource Matching Algorithm**

   ```typescript
   function matchResourcesByPhysicalId(
     slsTemplate: CFTemplate,
     cdkTemplate: CFTemplate,
     resourceType: string
   ): ResourceMatch[] {
     const matches: ResourceMatch[] = [];
     
     // Get physical ID property name for this resource type
     const idProperty = getPhysicalIdProperty(resourceType);
     // e.g., DynamoDB → 'TableName', S3 → 'BucketName'
     
     const slsResources = filterByType(slsTemplate.Resources, resourceType);
     const cdkResources = filterByType(cdkTemplate.Resources, resourceType);
     
     for (const [slsId, slsResource] of Object.entries(slsResources)) {
       const slsPhysicalId = slsResource.Properties[idProperty];
       
       for (const [cdkId, cdkResource] of Object.entries(cdkResources)) {
         const cdkPhysicalId = cdkResource.Properties[idProperty];
         
         if (slsPhysicalId === cdkPhysicalId) {
           matches.push({
             slsLogicalId: slsId,
             cdkLogicalId: cdkId,
             physicalId: slsPhysicalId,
             slsResource,
             cdkResource
           });
         }
       }
     }
     
     return matches;
   }
   ```

2. **Property Comparison Rules Engine**

   ```typescript
   // Resource-specific comparison rules
   const comparisonRules: Record<string, ResourceRule> = {
     'AWS::DynamoDB::Table': {
       criticalProperties: [
         'TableName',
         'KeySchema',
         'AttributeDefinitions',
         'BillingMode'
       ],
       warningProperties: [
         'StreamSpecification',
         'GlobalSecondaryIndexes',
         'LocalSecondaryIndexes'
       ],
       acceptableAdditions: [
         'PointInTimeRecoverySpecification',
         'TimeToLiveSpecification',
         'Tags'
       ],
       ignoredProperties: [
         'UpdateReplacePolicy',
         'DeletionPolicy',
         'Metadata'
       ]
     },
     'AWS::Logs::LogGroup': {
       criticalProperties: ['LogGroupName'],
       acceptableAdditions: ['RetentionInDays'],
       ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy']
     },
     'AWS::S3::Bucket': {
       criticalProperties: ['BucketName'],
       warningProperties: [
         'VersioningConfiguration',
         'LifecycleConfiguration',
         'BucketEncryption'
       ],
       acceptableAdditions: [
         'PublicAccessBlockConfiguration',
         'Tags'
       ],
       ignoredProperties: ['UpdateReplacePolicy', 'DeletionPolicy']
     }
   };
   
   function compareProperties(
     slsProps: any,
     cdkProps: any,
     resourceType: string
   ): PropertyDifference[] {
     const rules = comparisonRules[resourceType];
     const differences: PropertyDifference[] = [];
     
     const allKeys = new Set([
       ...Object.keys(slsProps),
       ...Object.keys(cdkProps)
     ]);
     
     for (const key of allKeys) {
       if (rules.ignoredProperties.includes(key)) {
         continue;
       }
       
       const slsValue = slsProps[key];
       const cdkValue = cdkProps[key];
       
       if (deepEqual(slsValue, cdkValue)) {
         continue; // Perfect match
       }
       
       const difference = analyzeDifference(
         key,
         slsValue,
         cdkValue,
         rules
       );
       
       differences.push(difference);
     }
     
     return differences;
   }
   
   function analyzeDifference(
     property: string,
     slsValue: any,
     cdkValue: any,
     rules: ResourceRule
   ): PropertyDifference {
     // Critical property mismatch
     if (rules.criticalProperties.includes(property)) {
       return {
         property,
         slsValue,
         cdkValue,
         severity: 'CRITICAL',
         explanation: `Critical property mismatch. Must match exactly for import.`,
         autoFixable: false
       };
     }
     
     // CDK added a property that's acceptable
     if (slsValue === undefined && rules.acceptableAdditions.includes(property)) {
       return {
         property,
         slsValue,
         cdkValue,
         severity: 'ACCEPTABLE',
         explanation: `CDK added ${property}. This is a safe addition.`,
         autoFixable: false
       };
     }
     
     // Warning - should review but might be okay
     if (rules.warningProperties.includes(property)) {
       return {
         property,
         slsValue,
         cdkValue,
         severity: 'WARNING',
         explanation: `Property differs. Review carefully before proceeding.`,
         autoFixable: false
       };
     }
     
     // Unknown difference
     return {
       property,
       slsValue,
       cdkValue,
       severity: 'WARNING',
       explanation: `Unknown property difference. Manual review recommended.`,
       autoFixable: false
     };
   }
   ```

3. **Deep Equality Check**

   ```typescript
   function deepEqual(a: any, b: any): boolean {
     if (a === b) return true;
     
     if (typeof a !== typeof b) return false;
     
     if (Array.isArray(a) && Array.isArray(b)) {
       if (a.length !== b.length) return false;
       return a.every((val, idx) => deepEqual(val, b[idx]));
     }
     
     if (typeof a === 'object' && a !== null && b !== null) {
       const keysA = Object.keys(a);
       const keysB = Object.keys(b);
       
       if (keysA.length !== keysB.length) return false;
       
       return keysA.every(key => deepEqual(a[key], b[key]));
     }
     
     return false;
   }
   ```

**Output Format:**

```json
{
  "comparison_id": "comp-20250120-001",
  "timestamp": "2025-01-20T10:35:00Z",
  "summary": {
    "total_resources": 3,
    "matched": 3,
    "unmatched_sls": 0,
    "unmatched_cdk": 0,
    "status": {
      "MATCH": 1,
      "ACCEPTABLE": 1,
      "WARNING": 1,
      "CRITICAL": 0
    }
  },
  "resources": [
    {
      "resourceType": "AWS::DynamoDB::Table",
      "physicalId": "migration-sandbox-table",
      "slsLogicalId": "counterTable",
      "cdkLogicalId": "CounterTableFE2C0268",
      "status": "MATCH",
      "differences": [],
      "recommendation": "✅ Safe to import. No differences detected."
    },
    {
      "resourceType": "AWS::Logs::LogGroup",
      "physicalId": "/aws/lambda/migration-sandbox-counter",
      "slsLogicalId": "CounterLogGroup",
      "cdkLogicalId": "CounterLogGroupB1D890C5",
      "status": "ACCEPTABLE",
      "differences": [
        {
          "property": "RetentionInDays",
          "slsValue": null,
          "cdkValue": 7,
          "severity": "ACCEPTABLE",
          "explanation": "CDK added RetentionInDays. This is a safe addition.",
          "autoFixable": false
        }
      ],
      "recommendation": "✅ Safe to import. CDK added retention policy (acceptable)."
    },
    {
      "resourceType": "AWS::S3::Bucket",
      "physicalId": "migration-sandbox-bucket",
      "slsLogicalId": "DataBucket",
      "cdkLogicalId": "DataBucketE3889A50",
      "status": "WARNING",
      "differences": [
        {
          "property": "VersioningConfiguration",
          "slsValue": { "Status": "Enabled" },
          "cdkValue": null,
          "severity": "WARNING",
          "explanation": "Property differs. Review carefully before proceeding.",
          "autoFixable": false
        }
      ],
      "recommendation": "⚠️  Review required. Versioning configuration differs."
    }
  ],
  "overall_status": "WARNING",
  "ready_for_import": false,
  "blocking_issues": [
    "S3 Bucket versioning mismatch requires manual review"
  ]
}
```

**HTML Report Generation:**

The tool should also generate an interactive HTML report for easier review:

```typescript
function generateHTMLReport(comparison: ComparisonReport): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Migration Comparison Report</title>
  <style>
    body { font-family: system-ui; max-width: 1200px; margin: 20px auto; }
    .status-MATCH { color: green; }
    .status-ACCEPTABLE { color: blue; }
    .status-WARNING { color: orange; }
    .status-CRITICAL { color: red; }
    .resource-card { border: 1px solid #ddd; margin: 20px 0; padding: 15px; }
    .property-diff { background: #f5f5f5; padding: 10px; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td, th { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>Serverless to CDK Migration - Comparison Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Resources: ${comparison.summary.total_resources}</p>
    <p>Status: <span class="status-${comparison.overall_status}">${comparison.overall_status}</span></p>
    <p>Ready for Import: ${comparison.ready_for_import ? 'Yes' : 'No'}</p>
  </div>
  
  ${comparison.resources.map(r => `
    <div class="resource-card">
      <h3>${r.resourceType} - ${r.physicalId}</h3>
      <p>Status: <span class="status-${r.status}">${r.status}</span></p>
      <table>
        <tr><th>Serverless ID</th><td>${r.slsLogicalId}</td></tr>
        <tr><th>CDK ID</th><td>${r.cdkLogicalId}</td></tr>
      </table>
      
      ${r.differences.length > 0 ? `
        <h4>Differences (${r.differences.length})</h4>
        ${r.differences.map(d => `
          <div class="property-diff">
            <strong>${d.property}</strong> (${d.severity})
            <br/>SLS: <code>${JSON.stringify(d.slsValue)}</code>
            <br/>CDK: <code>${JSON.stringify(d.cdkValue)}</code>
            <br/><em>${d.explanation}</em>
          </div>
        `).join('')}
      ` : '<p>No differences</p>'}
      
      <p><strong>Recommendation:</strong> ${r.recommendation}</p>
    </div>
  `).join('')}
</body>
</html>
  `;
}
```

---

### 3. Generator Module

**Purpose:** Generate CDK code from existing Serverless CloudFormation resources

**Key Functions:**

```typescript
interface GeneratorModule {
  // Generate complete CDK stack from Serverless resources
  generateCDKStack(
    resources: Resource[],
    config: GeneratorConfig
  ): GeneratedCode;
  
  // Generate individual CDK construct for a resource
  generateConstruct(
    resource: Resource,
    language: 'typescript' | 'python' | 'java'
  ): string;
  
  // Convert CloudFormation properties to CDK properties
  convertProperties(
    cfProperties: any,
    resourceType: string,
    language: string
  ): string;
  
  // Generate import statements
  generateImports(resources: Resource[], language: string): string;
}

interface GeneratorConfig {
  language: 'typescript' | 'python' | 'java';
  stackName: string;
  cdkVersion: string;
  useL2Constructs: boolean; // Use higher-level constructs vs L1 CloudFormation
  includeComments: boolean;
  preserveLogicalIds: boolean;
}

interface GeneratedCode {
  mainFile: string;      // Stack definition file
  imports: string[];     // Required imports
  constructs: string[];  // Individual resource definitions
  warnings: string[];    // Generation warnings
}
```

**Implementation Details:**

1. **Resource Type Mapping**

   ```typescript
   const resourceTypeMapping = {
     'AWS::DynamoDB::Table': {
       l1: 'CfnTable',
       l2: 'Table',
       module: '@aws-cdk/aws-dynamodb',
       cdkModule: 'aws-dynamodb'
     },
     'AWS::S3::Bucket': {
       l1: 'CfnBucket',
       l2: 'Bucket',
       module: '@aws-cdk/aws-s3',
       cdkModule: 'aws-s3'
     },
     'AWS::Logs::LogGroup': {
       l1: 'CfnLogGroup',
       l2: 'LogGroup',
       module: '@aws-cdk/aws-logs',
       cdkModule: 'aws-logs'
     },
     'AWS::Lambda::Function': {
       l1: 'CfnFunction',
       l2: 'Function',
       module: '@aws-cdk/aws-lambda',
       cdkModule: 'aws-lambda'
     }
   };
   ```

2. **TypeScript L2 Construct Generation**

   ```typescript
   function generateDynamoDBTable(
     resource: Resource,
     useL2: boolean
   ): string {
     const props = resource.Properties;
     
     if (useL2) {
       return `
   const ${toCamelCase(resource.logicalId)} = new dynamodb.Table(this, '${resource.logicalId}', {
     tableName: '${props.TableName}',
     partitionKey: {
       name: '${props.KeySchema[0].AttributeName}',
       type: dynamodb.AttributeType.${getAttributeType(props, props.KeySchema[0].AttributeName)}
     },
     ${props.KeySchema.length > 1 ? `sortKey: {
       name: '${props.KeySchema[1].AttributeName}',
       type: dynamodb.AttributeType.${getAttributeType(props, props.KeySchema[1].AttributeName)}
     },` : ''}
     billingMode: dynamodb.BillingMode.${props.BillingMode || 'PROVISIONED'},
     ${props.StreamSpecification ? `stream: dynamodb.StreamViewType.${props.StreamSpecification.StreamViewType},` : ''}
     removalPolicy: cdk.RemovalPolicy.RETAIN,
   });
       `.trim();
     } else {
       // L1 construct - direct CloudFormation
       return `
   const ${toCamelCase(resource.logicalId)} = new dynamodb.CfnTable(this, '${resource.logicalId}', {
     tableName: '${props.TableName}',
     keySchema: ${JSON.stringify(props.KeySchema)},
     attributeDefinitions: ${JSON.stringify(props.AttributeDefinitions)},
     billingMode: '${props.BillingMode || 'PROVISIONED'}',
     ${props.StreamSpecification ? `streamSpecification: ${JSON.stringify(props.StreamSpecification)},` : ''}
   });
   ${toCamelCase(resource.logicalId)}.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
       `.trim();
     }
   }
   
   function getAttributeType(props: any, attrName: string): string {
     const attr = props.AttributeDefinitions.find(a => a.AttributeName === attrName);
     return attr.AttributeType === 'S' ? 'STRING' : 
            attr.AttributeType === 'N' ? 'NUMBER' : 'BINARY';
   }
   ```

3. **Complete Stack Generation**

   ```typescript
   function generateCompleteStack(
     resources: Resource[],
     config: GeneratorConfig
   ): GeneratedCode {
     const imports = generateImports(resources, config.language);
     const constructs = resources.map(r => 
       generateConstruct(r, config)
     );
     
     const mainFile = `
   import * as cdk from 'aws-cdk-lib';
   import { Construct } from 'constructs';
   ${imports}
   
   export class ${config.stackName} extends cdk.Stack {
     constructor(scope: Construct, id: string, props?: cdk.StackProps) {
       super(scope, id, props);
       
       ${config.includeComments ? '// Resources imported from Serverless Framework' : ''}
       
       ${constructs.join('\n\n')}
     }
   }
   `.trim();
     
     return {
       mainFile,
       imports: imports.split('\n'),
       constructs,
       warnings: []
     };
   }
   ```

**Example Output:**

```typescript
// Generated by sls-to-cdk migration tool
// Date: 2025-01-20T10:40:00Z
// Source: migration-sandbox-dev

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class CdkMigrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table: migration-sandbox-table
    // IMPORTANT: This resource will be imported, not created
    const counterTable = new dynamodb.Table(this, 'CounterTable', {
      tableName: 'migration-sandbox-table',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudWatch LogGroup: /aws/lambda/migration-sandbox-counter
    // IMPORTANT: This resource will be imported, not created
    const counterLogGroup = new logs.LogGroup(this, 'CounterLogGroup', {
      logGroupName: '/aws/lambda/migration-sandbox-counter',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda Function: migration-sandbox-counter-cdk
    // NOTE: Creating new function with new name for parallel deployment
    const counterFunction = new lambda.Function(this, 'CounterFunction', {
      functionName: 'migration-sandbox-counter-cdk',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TABLE_NAME: counterTable.tableName,
      },
      logGroup: counterLogGroup,
    });

    // Grant Lambda permissions to access DynamoDB
    counterTable.grantReadWriteData(counterFunction);
  }
}
```

---

### 4. Editor Module

**Purpose:** Programmatically modify CloudFormation templates to remove resources

**Key Functions:**

```typescript
interface EditorModule {
  // Load CloudFormation template
  loadTemplate(path: string): CloudFormationTemplate;
  
  // Remove resource and update dependencies
  removeResource(
    template: CloudFormationTemplate,
    logicalId: string
  ): ModificationResult;
  
  // Remove multiple resources atomically
  removeResources(
    template: CloudFormationTemplate,
    logicalIds: string[]
  ): ModificationResult;
  
  // Update DependsOn references
  updateDependencies(
    template: CloudFormationTemplate,
    removedIds: string[]
  ): void;
  
  // Validate template syntax
  validateTemplate(template: CloudFormationTemplate): ValidationResult;
  
  // Save modified template
  saveTemplate(
    template: CloudFormationTemplate,
    outputPath: string
  ): void;
}

interface ModificationResult {
  success: boolean;
  removedResources: string[];
  updatedDependencies: DependencyUpdate[];
  warnings: string[];
  backupPath: string;
}

interface DependencyUpdate {
  resourceId: string;
  before: string[];
  after: string[];
}
```

**Implementation Details:**

1. **Safe Resource Removal**

   ```typescript
   function removeResource(
     template: CloudFormationTemplate,
     logicalId: string
   ): ModificationResult {
     const result: ModificationResult = {
       success: false,
       removedResources: [],
       updatedDependencies: [],
       warnings: [],
       backupPath: ''
     };
     
     // Validate resource exists
     if (!template.Resources[logicalId]) {
       throw new Error(`Resource ${logicalId} not found in template`);
     }
     
     // Create backup
     result.backupPath = createBackup(template);
     
     // Find all resources that depend on this one
     const dependents = findDependents(template, logicalId);
     
     if (dependents.length > 0) {
       result.warnings.push(
         `Warning: ${dependents.length} resources depend on ${logicalId}: ` +
         dependents.join(', ')
       );
     }
     
     // Remove the resource
     delete template.Resources[logicalId];
     result.removedResources.push(logicalId);
     
     // Update all DependsOn references
     for (const [resourceId, resource] of Object.entries(template.Resources)) {
       if (resource.DependsOn) {
         const before = Array.isArray(resource.DependsOn) 
           ? [...resource.DependsOn]
           : [resource.DependsOn];
         
         if (Array.isArray(resource.DependsOn)) {
           resource.DependsOn = resource.DependsOn.filter(
             dep => dep !== logicalId
           );
           
           // Remove DependsOn entirely if empty
           if (resource.DependsOn.length === 0) {
             delete resource.DependsOn;
           }
         } else if (resource.DependsOn === logicalId) {
           delete resource.DependsOn;
         }
         
         const after = resource.DependsOn 
           ? (Array.isArray(resource.DependsOn) ? resource.DependsOn : [resource.DependsOn])
           : [];
         
         if (!arraysEqual(before, after)) {
           result.updatedDependencies.push({
             resourceId,
             before,
             after
           });
         }
       }
     }
     
     result.success = true;
     return result;
   }
   
   function findDependents(
     template: CloudFormationTemplate,
     targetId: string
   ): string[] {
     const dependents: string[] = [];
     
     for (const [resourceId, resource] of Object.entries(template.Resources)) {
       if (resource.DependsOn) {
         const deps = Array.isArray(resource.DependsOn) 
           ? resource.DependsOn 
           : [resource.DependsOn];
         
         if (deps.includes(targetId)) {
           dependents.push(resourceId);
         }
       }
     }
     
     return dependents;
   }
   ```

2. **Dependency Graph Analysis**

   ```typescript
   function buildDependencyGraph(
     template: CloudFormationTemplate
   ): Map<string, Set<string>> {
     const graph = new Map<string, Set<string>>();
     
     // Initialize all resources
     for (const resourceId of Object.keys(template.Resources)) {
       graph.set(resourceId, new Set());
     }
     
     // Add explicit dependencies (DependsOn)
     for (const [resourceId, resource] of Object.entries(template.Resources)) {
       if (resource.DependsOn) {
         const deps = Array.isArray(resource.DependsOn)
           ? resource.DependsOn
           : [resource.DependsOn];
         
         for (const dep of deps) {
           graph.get(resourceId)!.add(dep);
         }
       }
     }
     
     // Add implicit dependencies (Ref, GetAtt, Sub)
     for (const [resourceId, resource] of Object.entries(template.Resources)) {
       const refs = findAllReferences(resource);
       for (const ref of refs) {
         if (graph.has(ref)) {
           graph.get(resourceId)!.add(ref);
         }
       }
     }
     
     return graph;
   }
   
   function findAllReferences(obj: any): string[] {
     const refs: string[] = [];
     
     if (obj && typeof obj === 'object') {
       if (obj.Ref) {
         refs.push(obj.Ref);
       }
       if (obj['Fn::GetAtt']) {
         const getAtt = Array.isArray(obj['Fn::GetAtt'])
           ? obj['Fn::GetAtt'][0]
           : obj['Fn::GetAtt'];
         refs.push(getAtt);
       }
       
       // Recursively search nested objects
       for (const value of Object.values(obj)) {
         refs.push(...findAllReferences(value));
       }
     }
     
     return refs;
   }
   ```

3. **Template Validation**

   ```typescript
   function validateTemplate(
     template: CloudFormationTemplate
   ): ValidationResult {
     const errors: string[] = [];
     const warnings: string[] = [];
     
     // Validate JSON structure
     try {
       JSON.stringify(template);
     } catch (e) {
       errors.push(`Invalid JSON structure: ${e.message}`);
     }
     
     // Validate required fields
     if (!template.AWSTemplateFormatVersion) {
       warnings.push('Missing AWSTemplateFormatVersion');
     }
     
     if (!template.Resources) {
       errors.push('Missing Resources section');
     }
     
     // Validate resource structure
     for (const [id, resource] of Object.entries(template.Resources || {})) {
       if (!resource.Type) {
         errors.push(`Resource ${id} missing Type`);
       }
       
       // Validate DependsOn references exist
       if (resource.DependsOn) {
         const deps = Array.isArray(resource.DependsOn)
           ? resource.DependsOn
           : [resource.DependsOn];
         
         for (const dep of deps) {
           if (!template.Resources[dep]) {
             errors.push(
               `Resource ${id} depends on non-existent resource ${dep}`
             );
           }
         }
       }
     }
     
     // Detect circular dependencies
     const graph = buildDependencyGraph(template);
     const circular = detectCircularDependencies(graph);
     if (circular.length > 0) {
       errors.push(`Circular dependencies detected: ${circular.join(' -> ')}`);
     }
     
     return {
       valid: errors.length === 0,
       errors,
       warnings
     };
   }
   ```

4. **Batch Operations**

   ```typescript
   function removeResources(
     template: CloudFormationTemplate,
     logicalIds: string[]
   ): ModificationResult {
     const result: ModificationResult = {
       success: false,
       removedResources: [],
       updatedDependencies: [],
       warnings: [],
       backupPath: createBackup(template)
     };
     
     // Build dependency graph to determine removal order
     const graph = buildDependencyGraph(template);
     const removalOrder = topologicalSort(graph, logicalIds);
     
     // Remove resources in dependency order (dependents first)
     for (const logicalId of removalOrder.reverse()) {
       const singleResult = removeResource(template, logicalId);
       result.removedResources.push(...singleResult.removedResources);
       result.updatedDependencies.push(...singleResult.updatedDependencies);
       result.warnings.push(...singleResult.warnings);
     }
     
     // Validate final template
     const validation = validateTemplate(template);
     if (!validation.valid) {
       throw new Error(
         `Template validation failed after removal: ${validation.errors.join(', ')}`
       );
     }
     
     result.success = true;
     return result;
   }
   ```

**CLI Usage Example:**

```bash
# Remove a single resource
sls-to-cdk edit remove \
  --template .serverless/cloudformation-template-update-stack.json \
  --resource CounterLogGroup \
  --output .serverless/cloudformation-template-update-stack.json \
  --backup .serverless/backups/

# Remove multiple resources
sls-to-cdk edit remove \
  --template .serverless/cloudformation-template-update-stack.json \
  --resources CounterLogGroup,DataBucket \
  --output .serverless/cloudformation-template-update-stack.json

# Dry run (show what would be removed)
sls-to-cdk edit remove \
  --template .serverless/cloudformation-template-update-stack.json \
  --resource CounterLogGroup \
  --dry-run
```

---

### 5. Migration Orchestrator

**Purpose:** Coordinate the entire migration process with state management and verification

**Key Functions:**

```typescript
interface MigrationOrchestrator {
  // Initialize migration project
  initialize(config: MigrationConfig): MigrationProject;
  
  // Execute migration steps
  executeStep(step: MigrationStep): StepResult;
  
  // Run full migration (all steps)
  runMigration(mode: 'interactive' | 'automatic'): MigrationResult;
  
  // Verify migration state
  verify(): VerificationResult;
  
  // Rollback to previous state
  rollback(toStep?: number): RollbackResult;
  
  // Resume interrupted migration
  resume(): MigrationResult;
}

interface MigrationConfig {
  serverless: {
    path: string;
    stackName: string;
    stage: string;
    region: string;
  };
  cdk: {
    path: string;
    stackName: string;
    region: string;
    language: 'typescript' | 'python';
  };
  resources: {
    include?: string[];  // Specific resources to migrate
    exclude?: string[];  // Resources to skip
  };
  options: {
    dryRun: boolean;
    interactive: boolean;
    autoApprove: boolean;
    createBackups: boolean;
    verifyAfterEachStep: boolean;
  };
}

interface MigrationProject {
  id: string;
  config: MigrationConfig;
  state: MigrationState;
  resources: Resource[];
  currentStep: number;
  totalSteps: number;
}

enum MigrationStep {
  SCAN = 'scan',
  PROTECT = 'protect',
  GENERATE = 'generate',
  COMPARE = 'compare',
  REMOVE = 'remove',
  IMPORT = 'import',
  DEPLOY = 'deploy',
  VERIFY = 'verify',
  CLEANUP = 'cleanup'
}

interface MigrationState {
  status: 'initialized' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  currentStep: MigrationStep;
  completedSteps: MigrationStep[];
  failedSteps: { step: MigrationStep; error: string }[];
  startTime: Date;
  endTime?: Date;
  resources: ResourceState[];
}

interface ResourceState {
  logicalId: string;
  physicalId: string;
  type: string;
  status: 'pending' | 'protected' | 'removed' | 'imported' | 'verified' | 'failed';
  steps: {
    step: MigrationStep;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    timestamp?: Date;
    details?: any;
  }[];
}
```

**Implementation - State Machine:**

```typescript
class MigrationStateMachine {
  private state: MigrationState;
  private config: MigrationConfig;
  
  private steps: MigrationStep[] = [
    MigrationStep.SCAN,
    MigrationStep.PROTECT,
    MigrationStep.GENERATE,
    MigrationStep.COMPARE,
    MigrationStep.REMOVE,
    MigrationStep.IMPORT,
    MigrationStep.DEPLOY,
    MigrationStep.VERIFY,
    MigrationStep.CLEANUP
  ];
  
  async executeStep(step: MigrationStep): Promise<StepResult> {
    console.log(`\n📦 Executing step: ${step}`);
    
    this.updateState({
      currentStep: step,
      status: 'in_progress'
    });
    
    try {
      let result: StepResult;
      
      switch (step) {
        case MigrationStep.SCAN:
          result = await this.executeScan();
          break;
        case MigrationStep.PROTECT:
          result = await this.executeProtect();
          break;
        case MigrationStep.GENERATE:
          result = await this.executeGenerate();
          break;
        case MigrationStep.COMPARE:
          result = await this.executeCompare();
          break;
        case MigrationStep.REMOVE:
          result = await this.executeRemove();
          break;
        case MigrationStep.IMPORT:
          result = await this.executeImport();
          break;
        case MigrationStep.DEPLOY:
          result = await this.executeDeploy();
          break;
        case MigrationStep.VERIFY:
          result = await this.executeVerify();
          break;
        case MigrationStep.CLEANUP:
          result = await this.executeCleanup();
          break;
        default:
          throw new Error(`Unknown step: ${step}`);
      }
      
      if (result.success) {
        this.state.completedSteps.push(step);
        console.log(`✅ Step ${step} completed successfully`);
      } else {
        console.error(`❌ Step ${step} failed: ${result.error}`);
        this.state.failedSteps.push({ step, error: result.error });
      }
      
      // Save state after each step
      await this.saveState();
      
      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Step ${step} threw exception: ${errorMsg}`);
      
      this.state.failedSteps.push({ step, error: errorMsg });
      this.state.status = 'failed';
      await this.saveState();
      
      return {
        success: false,
        step,
        error: errorMsg
      };
    }
  }
  
  async runMigration(mode: 'interactive' | 'automatic'): Promise<MigrationResult> {
    console.log(`\n🚀 Starting migration in ${mode} mode\n`);
    
    for (const step of this.steps) {
      // Skip if already completed (for resume scenarios)
      if (this.state.completedSteps.includes(step)) {
        console.log(`⏭️  Skipping completed step: ${step}`);
        continue;
      }
      
      // Interactive mode - ask for approval
      if (mode === 'interactive' && !this.config.options.autoApprove) {
        const proceed = await this.promptForApproval(step);
        if (!proceed) {
          console.log('Migration cancelled by user');
          return { success: false, cancelled: true };
        }
      }
      
      // Execute step
      const result = await this.executeStep(step);
      
      if (!result.success) {
        console.error(`\n❌ Migration failed at step: ${step}`);
        console.error(`Error: ${result.error}`);
        
        if (mode === 'interactive') {
          const retry = await this.promptForRetry(step);
          if (retry) {
            return await this.runMigration(mode);
          }
        }
        
        return { success: false, failedStep: step, error: result.error };
      }
      
      // Verify after each step if configured
      if (this.config.options.verifyAfterEachStep) {
        await this.verifyStep(step);
      }
    }
    
    this.state.status = 'completed';
    this.state.endTime = new Date();
    await this.saveState();
    
    console.log('\n✅ Migration completed successfully!');
    return { success: true };
  }
  
  private async executeScan(): Promise<StepResult> {
    const scanner = new ScannerModule(this.config.serverless);
    const inventory = await scanner.discoverAllResources();
    
    this.state.resources = inventory.map(r => ({
      logicalId: r.logicalId,
      physicalId: r.physicalId,
      type: r.type,
      status: 'pending',
      steps: []
    }));
    
    console.log(`Found ${inventory.length} resources to migrate`);
    console.log(`  - Stateful (import): ${inventory.filter(r => r.classification === 'IMPORT').length}`);
    console.log(`  - Stateless (recreate): ${inventory.filter(r => r.classification === 'RECREATE').length}`);
    
    return { success: true, step: MigrationStep.SCAN, data: inventory };
  }
  
  private async executeProtect(): Promise<StepResult> {
    console.log('Setting DeletionPolicy: Retain on stateful resources...');
    
    // Add deletion policies to serverless.yml or CloudFormation template
    const editor = new EditorModule();
    const template = editor.loadTemplate(
      `${this.config.serverless.path}/.serverless/cloudformation-template-update-stack.json`
    );
    
    const statefulResources = this.state.resources.filter(
      r => ['AWS::DynamoDB::Table', 'AWS::S3::Bucket', 'AWS::Logs::LogGroup'].includes(r.type)
    );
    
    for (const resource of statefulResources) {
      template.Resources[resource.logicalId].DeletionPolicy = 'Retain';
    }
    
    editor.saveTemplate(template, 
      `${this.config.serverless.path}/.serverless/cloudformation-template-update-stack.json`
    );
    
    // Deploy with Serverless
    await this.execServerlessCommand('deploy');
    
    return { success: true, step: MigrationStep.PROTECT };
  }
  
  private async executeCompare(): Promise<StepResult> {
    console.log('Comparing CloudFormation templates...');
    
    const comparator = new ComparatorModule();
    const comparison = await comparator.compareTemplates(
      `${this.config.serverless.path}/.serverless/cloudformation-template-update-stack.json`,
      `${this.config.cdk.path}/cdk.out/${this.config.cdk.stackName}.template.json`
    );
    
    // Generate HTML report
    const reportPath = `${this.config.cdk.path}/migration-comparison.html`;
    await comparator.generateHTMLReport(comparison, reportPath);
    console.log(`📊 Comparison report saved to: ${reportPath}`);
    
    // Check for blocking issues
    if (!comparison.ready_for_import) {
      return {
        success: false,
        step: MigrationStep.COMPARE,
        error: `Template comparison failed: ${comparison.blocking_issues.join(', ')}`
      };
    }
    
    return { success: true, step: MigrationStep.COMPARE, data: comparison };
  }
  
  private async executeRemove(): Promise<StepResult> {
    console.log('Removing resources from Serverless stack...');
    
    const editor = new EditorModule();
    const resourcesToRemove = this.state.resources
      .filter(r => r.status !== 'removed')
      .map(r => r.logicalId);
    
    const result = editor.removeResources(
      `${this.config.serverless.path}/.serverless/cloudformation-template-update-stack.json`,
      resourcesToRemove
    );
    
    // Update CloudFormation stack via AWS API
    await this.updateCloudFormationStack(
      this.config.serverless.stackName,
      `${this.config.serverless.path}/.serverless/cloudformation-template-update-stack.json`
    );
    
    return { success: true, step: MigrationStep.REMOVE, data: result };
  }
  
  private async executeImport(): Promise<StepResult> {
    console.log('Importing resources into CDK stack...');
    
    // Execute cdk import
    const importResult = await this.execCDKCommand('import', {
      cwd: this.config.cdk.path
    });
    
    return { success: true, step: MigrationStep.IMPORT, data: importResult };
  }
  
  private async executeDeploy(): Promise<StepResult> {
    console.log('Deploying CDK stack...');
    
    const deployResult = await this.execCDKCommand('deploy', {
      cwd: this.config.cdk.path,
      requireApproval: 'never'
    });
    
    return { success: true, step: MigrationStep.DEPLOY, data: deployResult };
  }
  
  private async executeVerify(): Promise<StepResult> {
    console.log('Verifying migration...');
    
    // Check for drift
    const driftResult = await this.checkStackDrift(this.config.cdk.stackName);
    
    if (driftResult.driftStatus !== 'IN_SYNC') {
      return {
        success: false,
        step: MigrationStep.VERIFY,
        error: `Stack drift detected: ${driftResult.driftedResources.join(', ')}`
      };
    }
    
    // Verify all resources exist
    for (const resource of this.state.resources) {
      const exists = await this.verifyResourceExists(resource);
      if (!exists) {
        return {
          success: false,
          step: MigrationStep.VERIFY,
          error: `Resource not found: ${resource.physicalId}`
        };
      }
    }
    
    return { success: true, step: MigrationStep.VERIFY };
  }
  
  private async executeCleanup(): Promise<StepResult> {
    console.log('Cleaning up...');
    
    // Optional: Remove old Serverless stack
    if (this.config.options.autoApprove) {
      await this.execServerlessCommand('remove');
    }
    
    return { success: true, step: MigrationStep.CLEANUP };
  }
}
```

**State Persistence:**

```typescript
class StateManager {
  private statePath: string;
  
  async saveState(state: MigrationState): Promise<void> {
    const stateFile = path.join(this.statePath, 'migration-state.json');
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    
    // Also save backup
    const backupFile = path.join(
      this.statePath,
      `migration-state-${Date.now()}.json`
    );
    await fs.writeFile(backupFile, JSON.stringify(state, null, 2));
  }
  
  async loadState(): Promise<MigrationState | null> {
    const stateFile = path.join(this.statePath, 'migration-state.json');
    
    try {
      const content = await fs.readFile(stateFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
  
  async listBackups(): Promise<string[]> {
    const files = await fs.readdir(this.statePath);
    return files
      .filter(f => f.startsWith('migration-state-') && f.endsWith('.json'))
      .sort()
      .reverse();
  }
}
```

---

## Automation Strategy

### What Gets Automated

#### ✅ **Fully Automated (No Human Intervention)**

1. **Resource Discovery**
   - Parse serverless.yml
   - Generate CloudFormation
   - Identify all resources (explicit + abstracted)
   - Build dependency graph
   - Classify resources

2. **Template Comparison**
   - Match resources by physical IDs
   - Deep property comparison
   - Difference classification
   - Generate comparison report

3. **CloudFormation Editing**
   - Remove resources from template
   - Update DependsOn references
   - Validate syntax
   - Create backups

4. **CDK Code Generation**
   - Generate stack definition
   - Create construct code
   - Generate imports
   - Format code

5. **Verification**
   - Check stack status
   - Detect drift
   - Verify resources exist
   - Validate configurations

#### ⚠️  **Semi-Automated (Requires Approval)**

1. **Destructive Operations**
   - Setting deletion policies → Deploy
   - Removing resources → Update stack
   - Importing resources → Execute import
   - Deploying CDK → Deploy

2. **Critical Decision Points**
   - Template comparison shows warnings
   - Resource classification unclear
   - Dependency conflicts detected

#### ❌ **Manual (Cannot Automate)**

1. **Application-Specific Logic**
   - Custom business logic in Lambda
   - Application testing
   - Smoke tests

2. **Production Cutover**
   - DNS changes
   - Traffic migration
   - Monitoring setup

---

## User Experience Flow

### Interactive Mode (Recommended)

```bash
$ sls-to-cdk migrate --interactive

╔══════════════════════════════════════════════════════════╗
║  Serverless Framework → AWS CDK Migration Tool           ║
║  Version 1.0.0                                           ║
╚══════════════════════════════════════════════════════════╝

📋 Step 1/9: Scanning Resources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scanning Serverless stack: migration-sandbox-dev
Region: us-east-1

✅ Found 8 resources:
   - 2 explicit resources (defined in serverless.yml)
   - 6 abstracted resources (auto-generated)

Resource Classification:
┌────────────────────────────────────┬──────────┬───────────┐
│ Resource                           │ Type     │ Action    │
├────────────────────────────────────┼──────────┼───────────┤
│ counterTable                       │ DynamoDB │ IMPORT    │
│ CounterLogGroup                    │ LogGroup │ IMPORT    │
│ DataBucket                         │ S3       │ IMPORT    │
│ CounterLambdaFunction             │ Lambda   │ RECREATE  │
│ CounterLambdaRole                 │ IAM Role │ RECREATE  │
│ ...                                │ ...      │ ...       │
└────────────────────────────────────┴──────────┴───────────┘

📊 Full scan report saved to: ./migration-scan-report.json

Continue to next step? [Y/n]: Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 2/9: Protecting Stateful Resources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Adding DeletionPolicy: Retain to 3 resources:
  ✓ counterTable (DynamoDB Table)
  ✓ CounterLogGroup (CloudWatch LogGroup)
  ✓ DataBucket (S3 Bucket)

This will:
  1. Modify CloudFormation template
  2. Deploy changes to AWS (no resource changes, just policies)
  3. Ensure resources aren't deleted during migration

⚠️  This step deploys changes to AWS.

Proceed with deployment? [Y/n]: Y

Executing: npx serverless deploy --stage dev
...
✅ Deployment successful
   Stack ARN: arn:aws:cloudformation:us-east-1:123456789:stack/migration-sandbox-dev

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 3/9: Generating CDK Code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generating CDK stack in TypeScript...

Created files:
  ✓ lib/cdk-migration-stack.ts (main stack)
  ✓ bin/cdk-migration.ts (app entry point)
  ✓ cdk.json (CDK configuration)

Generated 3 constructs:
  ✓ CounterTable (DynamoDB)
  ✓ CounterLogGroup (CloudWatch Logs)
  ✓ DataBucket (S3)

⚠️  Note: Lambda functions will be created with new names for parallel deployment

Building CDK app...
✅ CDK build successful

Synthesizing CloudFormation...
✅ CDK synth successful
   Template: cdk.out/CdkMigrationStack.template.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 4/9: Comparing Templates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Comparing CloudFormation templates...

Resource: counterTable (DynamoDB Table)
  Status: ✅ MATCH
  Physical ID: migration-sandbox-table
  Differences: None

Resource: CounterLogGroup (CloudWatch LogGroup)
  Status: ✅ ACCEPTABLE
  Physical ID: /aws/lambda/migration-sandbox-counter
  Differences: 1
    • RetentionInDays: undefined → 7 (ACCEPTABLE)
      CDK added log retention. This is safe.

Resource: DataBucket (S3 Bucket)
  Status: ⚠️  WARNING
  Physical ID: migration-sandbox-bucket
  Differences: 1
    • VersioningConfiguration.Status: "Enabled" → undefined (WARNING)
      Versioning configuration differs. Review carefully.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall Status: ⚠️  WARNING
Ready for Import: No
Blocking Issues:
  - S3 Bucket versioning configuration mismatch

📊 Detailed HTML report: ./migration-comparison.html

⚠️  Template comparison found issues that require attention.

Options:
  1. Fix CDK code and re-generate
  2. Accept differences and continue (risky)
  3. Abort migration

Choose [1]: 1

Please update your CDK code to match the Serverless configuration.
Specifically, add versioning to DataBucket:

  const dataBucket = new s3.Bucket(this, 'DataBucket', {
    bucketName: 'migration-sandbox-bucket',
    versioned: true,  // ← Add this line
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });

After fixing, run: sls-to-cdk migrate --resume

Exiting...
```

**After fixing:**

```bash
$ sls-to-cdk migrate --resume

Resuming migration from step: compare

📋 Step 4/9: Comparing Templates (Retry)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Comparing CloudFormation templates...

✅ All resources match!
   - counterTable: MATCH
   - CounterLogGroup: ACCEPTABLE
   - DataBucket: MATCH

Ready for import: Yes

Continue to next step? [Y/n]: Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 5/9: Removing Resources from Serverless
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Editing CloudFormation template...

Removing resources:
  ✓ counterTable
  ✓ CounterLogGroup  
  ✓ DataBucket

Updated dependencies:
  ✓ CounterLambdaFunction.DependsOn: removed CounterLogGroup

Validating template...
✅ Template is valid

Backup saved to: .serverless/backups/cloudformation-2025-01-20-10-45-00.json

⚠️  This will update the CloudFormation stack in AWS.

Proceed with stack update? [Y/n]: Y

Updating CloudFormation stack...
...
✅ Stack update successful

Verifying resources still exist...
  ✓ counterTable: migration-sandbox-table (exists)
  ✓ CounterLogGroup: /aws/lambda/migration-sandbox-counter (exists)
  ✓ DataBucket: migration-sandbox-bucket (exists)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 6/9: Importing Resources into CDK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Executing: cdk import

CdkMigrationStack/CounterTable/Resource (AWS::DynamoDB::Table):
  import with TableName=migration-sandbox-table (yes/no) [yes]? yes

CdkMigrationStack/CounterLogGroup/Resource (AWS::Logs::LogGroup):
  import with LogGroupName=/aws/lambda/migration-sandbox-counter (yes/no) [yes]? yes

CdkMigrationStack/DataBucket/Resource (AWS::S3::Bucket):
  import with BucketName=migration-sandbox-bucket (yes/no) [yes]? yes

✅ All resources imported successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 7/9: Deploying CDK Stack
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Executing: cdk deploy

Changes:
  • New Lambda function: CounterFunctionNewDev
  • New IAM Role: CounterFunctionRole
  • No changes to imported resources

✅ Deployment successful
   Stack ARN: arn:aws:cloudformation:us-east-1:123456789:stack/CdkMigrationStack

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 8/9: Verifying Migration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking for drift...
✅ No drift detected

Verifying resources:
  ✓ counterTable exists and accessible
  ✓ CounterLogGroup exists and accessible
  ✓ DataBucket exists and accessible
  ✓ New Lambda function operational

Testing application...
  ✓ API endpoint responds: 200 OK
  ✓ Counter value persisted correctly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Step 9/9: Cleanup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Migration complete! 🎉

Summary:
  • Resources migrated: 3
  • Resources recreated: 2
  • Duration: 8 minutes 32 seconds

Next Steps:
  1. Test your CDK application thoroughly
  2. Update CI/CD pipelines
  3. Remove old Serverless stack (optional)

To remove old stack:
  $ sls-to-cdk cleanup --remove-serverless-stack

Migration state saved to: .sls-to-cdk/migration-state.json
```

---

### Automatic Mode

```bash
$ sls-to-cdk migrate --automatic --auto-approve

🚀 Starting automatic migration...

✅ Step 1/9: Scan completed (8 resources found)
✅ Step 2/9: Protection deployed
✅ Step 3/9: CDK code generated
✅ Step 4/9: Templates compared (all match)
✅ Step 5/9: Resources removed from Serverless
✅ Step 6/9: Resources imported to CDK
✅ Step 7/9: CDK stack deployed
✅ Step 8/9: Verification passed
✅ Step 9/9: Cleanup completed

Migration successful! 🎉
Duration: 7 minutes 15 seconds
```

---

## Technical Implementation

### Technology Stack

**Core:**
- TypeScript (strict mode)
- Node.js 18+

**Dependencies:**
- `@aws-sdk/client-cloudformation` - AWS CloudFormation API
- `@aws-sdk/client-dynamodb` - DynamoDB API
- `@aws-sdk/client-s3` - S3 API
- `@aws-sdk/client-logs` - CloudWatch Logs API
- `commander` - CLI framework
- `inquirer` - Interactive prompts
- `chalk` - Terminal colors
- `ora` - Spinners
- `yaml` - YAML parsing
- `ajv` - JSON schema validation
- `diff` - Text diffing

**Dev Dependencies:**
- `jest` - Testing
- `eslint` - Linting
- `prettier` - Code formatting
- `ts-node` - TypeScript execution

### Project Structure

```
sls-to-cdk/
├── bin/
│   └── sls-to-cdk.ts              # CLI entry point
├── src/
│   ├── modules/
│   │   ├── scanner/
│   │   │   ├── index.ts
│   │   │   ├── resource-classifier.ts
│   │   │   ├── dependency-graph.ts
│   │   │   └── serverless-parser.ts
│   │   ├── comparator/
│   │   │   ├── index.ts
│   │   │   ├── resource-matcher.ts
│   │   │   ├── property-comparator.ts
│   │   │   ├── comparison-rules.ts
│   │   │   └── report-generator.ts
│   │   ├── generator/
│   │   │   ├── index.ts
│   │   │   ├── cdk-code-generator.ts
│   │   │   ├── typescript-generator.ts
│   │   │   └── templates/
│   │   ├── editor/
│   │   │   ├── index.ts
│   │   │   ├── template-editor.ts
│   │   │   ├── dependency-updater.ts
│   │   │   └── validator.ts
│   │   └── orchestrator/
│   │       ├── index.ts
│   │       ├── state-machine.ts
│   │       ├── state-manager.ts
│   │       └── step-executor.ts
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── migrate.ts
│   │   │   ├── scan.ts
│   │   │   ├── compare.ts
│   │   │   ├── generate.ts
│   │   │   └── verify.ts
│   │   └── ui/
│   │       ├── prompts.ts
│   │       ├── progress.ts
│   │       └── formatters.ts
│   ├── aws/
│   │   ├── cloudformation.ts
│   │   ├── dynamodb.ts
│   │   ├── s3.ts
│   │   └── logs.ts
│   ├── utils/
│   │   ├── exec.ts
│   │   ├── file.ts
│   │   ├── json.ts
│   │   └── logger.ts
│   └── types/
│       ├── migration.ts
│       ├── cloudformation.ts
│       └── config.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── README.md
│   ├── getting-started.md
│   ├── configuration.md
│   └── troubleshooting.md
├── package.json
├── tsconfig.json
└── README.md
```

---

## Safety Mechanisms

### 1. Backup System

**Automatic Backups:**
- CloudFormation templates before modification
- Migration state after each step
- Resource configurations before import

**Backup Location:**
```
.sls-to-cdk/
├── backups/
│   ├── cloudformation/
│   │   ├── serverless-2025-01-20-10-30-00.json
│   │   └── serverless-2025-01-20-10-45-00.json
│   ├── state/
│   │   ├── migration-state-2025-01-20-10-30-00.json
│   │   └── migration-state-2025-01-20-10-45-00.json
│   └── resources/
│       ├── counterTable-2025-01-20-10-30-00.json
│       └── DataBucket-2025-01-20-10-45-00.json
```

### 2. Dry Run Mode

```bash
$ sls-to-cdk migrate --dry-run

🔍 DRY RUN MODE - No changes will be made

Step 1: Scan
  Would discover 8 resources

Step 2: Protect
  Would add DeletionPolicy to 3 resources
  Would deploy Serverless stack

Step 3: Generate
  Would create CDK code in ./cdk-migration/

... (continues with all steps)

Summary:
  ✓ Migration plan is valid
  ✓ No blocking issues detected
  ⚠️  1 warning to review

To execute, run without --dry-run flag
```

### 3. Validation Gates

**Before Each Destructive Step:**

```typescript
async function validateBeforeExecution(step: MigrationStep): Promise<boolean> {
  switch (step) {
    case MigrationStep.PROTECT:
      // Ensure all resources are backed up
      return await validateBackupsExist();
      
    case MigrationStep.REMOVE:
      // Ensure templates match
      // Ensure deletion policies set
      return await validateTemplatesMatch() && 
             await validateDeletionPolicies();
      
    case MigrationStep.IMPORT:
      // Ensure resources are orphaned
      // Ensure CDK stack ready
      return await validateResourcesOrphaned() &&
             await validateCDKStackReady();
      
    default:
      return true;
  }
}
```

### 4. Rollback Mechanism

```typescript
class RollbackManager {
  async rollback(toStep: MigrationStep): Promise<void> {
    console.log(`Rolling back to step: ${toStep}`);
    
    const currentState = await this.stateManager.loadState();
    
    // Restore CloudFormation templates
    if (currentState.currentStep > toStep) {
      await this.restoreCloudFormationTemplate(toStep);
    }
    
    // Restore resource state
    for (const resource of currentState.resources) {
      if (resource.status !== 'pending') {
        await this.restoreResource(resource, toStep);
      }
    }
    
    // Update state
    currentState.currentStep = toStep;
    currentState.status = 'rolled_back';
    await this.stateManager.saveState(currentState);
    
    console.log('✅ Rollback completed');
  }
  
  async restoreResource(
    resource: ResourceState,
    toStep: MigrationStep
  ): Promise<void> {
    // Logic to restore resource state based on step
    // This is complex and step-dependent
  }
}
```

**Usage:**

```bash
$ sls-to-cdk rollback --to-step compare

Rolling back migration to step: compare

Actions:
  ✓ Restored CloudFormation template
  ✓ Re-added resources to Serverless stack
  ✓ Updated migration state

You can now fix issues and resume with:
  $ sls-to-cdk migrate --resume
```

### 5. Verification Checks

**After Import:**

```typescript
async function verifyImport(resource: Resource): Promise<boolean> {
  // 1. Resource exists in AWS
  const exists = await this.aws.resourceExists(resource.physicalId);
  if (!exists) {
    throw new Error(`Resource ${resource.physicalId} not found in AWS`);
  }
  
  // 2. Resource in CDK stack
  const inCDK = await this.aws.resourceInStack(
    this.config.cdk.stackName,
    resource.physicalId
  );
  if (!inCDK) {
    throw new Error(`Resource ${resource.physicalId} not in CDK stack`);
  }
  
  // 3. Resource not in Serverless stack
  const inServerless = await this.aws.resourceInStack(
    this.config.serverless.stackName,
    resource.physicalId
  );
  if (inServerless) {
    throw new Error(
      `Resource ${resource.physicalId} still in Serverless stack`
    );
  }
  
  // 4. No drift
  const drift = await this.aws.checkDrift(
    this.config.cdk.stackName,
    resource.logicalId
  );
  if (drift.status !== 'IN_SYNC') {
    throw new Error(`Resource ${resource.physicalId} has drifted`);
  }
  
  return true;
}
```

---

## Future Enhancements

### Phase 2

1. **Multi-Language Support**
   - Python CDK generation
   - Java CDK generation
   - Go CDK generation

2. **Advanced Resource Types**
   - RDS databases
   - ElastiCache
   - ECS/Fargate
   - Step Functions

3. **CI/CD Integration**
   - GitHub Actions workflow
   - GitLab CI pipeline
   - Jenkins plugin

### Phase 3

1. **Web UI**
   - Visual migration designer
   - Interactive comparison view
   - Real-time progress tracking

2. **Team Collaboration**
   - Multi-user support
   - Migration review/approval
   - Audit logging

3. **Advanced Features**
   - Batch migration (multiple stacks)
   - Cross-account migration
   - Blue/green deployment support

---

## Conclusion

This tool design eliminates the most error-prone aspects of Serverless-to-CDK migration:

✅ **Automated template comparison** - No more manual "eyeballing"
✅ **Programmatic template editing** - No more CloudFormation surgery
✅ **Guided orchestration** - Step-by-step with verification
✅ **State management** - Resumable, rollback-capable
✅ **Safety first** - Backups, dry-run, validation gates

The tool reduces migration time from **2-3 hours per service** to **15-30 minutes**, while significantly reducing the risk of errors.

**Next Steps:**
1. Implement Scanner and Comparator modules (highest priority)
2. Build prototype with DynamoDB + LogGroups support
3. Test on 2-3 real applications
4. Iterate based on feedback
5. Expand to more resource types
6. Open source? 🚀