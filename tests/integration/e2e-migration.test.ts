/**
 * End-to-End Migration Tests
 * Tests complete migration workflow from Serverless to CDK
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MigrationOrchestrator } from '@/modules/orchestrator';
import { ScannerModule } from '@/modules/scanner';
import { ComparatorModule } from '@/modules/comparator';
import { GeneratorModule } from '@/modules/generator';
import { EditorModule } from '@/modules/editor';

describe('E2E Migration Tests', () => {
  let testDir: string;
  let slsDir: string;
  let cdkDir: string;
  let fixturesPath: string;

  beforeAll(async () => {
    testDir = path.join(__dirname, '../tmp/e2e-test');
    slsDir = path.join(testDir, 'serverless');
    cdkDir = path.join(testDir, 'cdk');
    fixturesPath = path.join(__dirname, '../fixtures');

    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(slsDir, { recursive: true });
    await fs.mkdir(cdkDir, { recursive: true });

    // Copy fixtures
    await fs.copyFile(
      path.join(fixturesPath, 'serverless.yml'),
      path.join(slsDir, 'serverless.yml')
    );
    await fs.copyFile(
      path.join(fixturesPath, 'cloudformation-sls.json'),
      path.join(slsDir, '.serverless/cloudformation-template-update-stack.json')
    );
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Complete Migration Flow', () => {
    it('should complete full migration from Serverless to CDK', async () => {
      // STEP 1: SCAN
      const scanner = new ScannerModule({
        path: slsDir,
        stackName: 'test-stack-dev',
        stage: 'dev',
        region: 'us-east-1'
      });

      const templatePath = path.join(
        slsDir,
        '.serverless/cloudformation-template-update-stack.json'
      );
      const slsTemplate = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const scanResult = await scanner.scan(slsTemplate);

      expect(scanResult).toHaveProperty('inventory');
      expect(scanResult.resources.total).toBeGreaterThan(0);
      expect(scanResult.inventory).toBeInstanceOf(Array);

      console.log(`✅ SCAN: Found ${scanResult.resources.total} resources`);

      // STEP 2: GENERATE CDK CODE
      const generator = new GeneratorModule();

      // Filter resources to import (stateful resources)
      const resourcesToImport = scanResult.inventory.filter(
        r => r.classification === 'IMPORT'
      );

      const generatedCode = generator.generateCDKStack(
        resourcesToImport.map(r => ({
          logicalId: r.logical_id,
          type: r.type,
          properties: r.properties
        })),
        {
          language: 'typescript',
          stackName: 'CdkMigrationStack',
          cdkVersion: '2.0.0',
          useL2Constructs: true,
          includeComments: true,
          preserveLogicalIds: true
        }
      );

      expect(generatedCode).toHaveProperty('mainFile');
      expect(generatedCode.mainFile).toContain('CdkMigrationStack');

      // Save generated CDK code
      const cdkStackPath = path.join(cdkDir, 'lib/migration-stack.ts');
      await fs.mkdir(path.join(cdkDir, 'lib'), { recursive: true });
      await fs.writeFile(cdkStackPath, generatedCode.mainFile);

      console.log(`✅ GENERATE: Created CDK stack with ${resourcesToImport.length} resources`);

      // STEP 3: SYNTHESIZE CDK (simulate cdk synth)
      // In a real scenario, this would run `cdk synth`
      // For testing, we use the pre-generated fixture
      const cdkTemplatePath = path.join(cdkDir, 'cdk.out/CdkMigrationStack.template.json');
      await fs.mkdir(path.join(cdkDir, 'cdk.out'), { recursive: true });
      await fs.copyFile(
        path.join(fixturesPath, 'cloudformation-cdk.json'),
        cdkTemplatePath
      );

      console.log('✅ SYNTH: Generated CloudFormation from CDK');

      // STEP 4: COMPARE TEMPLATES
      const comparator = new ComparatorModule();

      const comparison = await comparator.compare(templatePath, cdkTemplatePath);

      expect(comparison).toHaveProperty('matches');
      expect(comparison.matches.length).toBeGreaterThan(0);

      // Check overall status
      const report = comparator.generateReport(comparison);

      console.log(`✅ COMPARE: Matched ${comparison.matches.length} resources`);
      console.log(`   Status: ${report.overall_status}`);
      console.log(`   Ready for import: ${report.ready_for_import}`);

      // STEP 5: EDIT SERVERLESS TEMPLATE
      const editor = new EditorModule();

      const slsTemplateToEdit = JSON.parse(
        await fs.readFile(templatePath, 'utf-8')
      );

      // Remove resources that will be imported to CDK
      const resourceIdsToRemove = resourcesToImport.map(r => r.logical_id);

      const editResult = editor.removeResources(
        slsTemplateToEdit,
        resourceIdsToRemove
      );

      expect(editResult.success).toBe(true);
      expect(editResult.removedResources.length).toBe(resourceIdsToRemove.length);

      // Save edited template
      const editedTemplatePath = path.join(
        slsDir,
        '.serverless/cloudformation-template-edited.json'
      );
      await editor.saveTemplate(slsTemplateToEdit, editedTemplatePath);

      console.log(`✅ EDIT: Removed ${editResult.removedResources.length} resources from Serverless template`);

      // STEP 6: VALIDATE
      const validation = editor.validateTemplate(slsTemplateToEdit);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      console.log('✅ VALIDATE: Edited template is valid');

      // FINAL VERIFICATION
      // Verify resources were removed
      for (const resourceId of resourceIdsToRemove) {
        expect(slsTemplateToEdit.Resources).not.toHaveProperty(resourceId);
      }

      // Verify CDK code was generated
      const cdkCodeExists = await fs.access(cdkStackPath).then(() => true).catch(() => false);
      expect(cdkCodeExists).toBe(true);

      // Verify comparison report
      expect(report.summary.matched).toBeGreaterThan(0);

      console.log('\n🎉 E2E Migration Test PASSED!');
      console.log(`   Migrated ${resourcesToImport.length} resources successfully`);
    }, 60000); // 60 second timeout for E2E test
  });

  describe('Migration State Persistence', () => {
    it('should persist and resume migration state', async () => {
      const config = {
        serverless: {
          path: slsDir,
          stackName: 'test-stack-dev',
          stage: 'dev',
          region: 'us-east-1'
        },
        cdk: {
          path: cdkDir,
          stackName: 'CdkMigrationStack',
          region: 'us-east-1',
          language: 'typescript' as const
        },
        resources: {},
        options: {
          dryRun: true,
          interactive: false,
          autoApprove: true,
          createBackups: true,
          verifyAfterEachStep: false
        }
      };

      const orchestrator = new MigrationOrchestrator(config);

      // Initialize and complete first step
      await orchestrator.initialize(config);
      await orchestrator.executeStep('SCAN');

      // Get state
      const state1 = await orchestrator.getState();
      expect(state1.completedSteps).toContain('SCAN');

      // Create new orchestrator (simulates restart)
      const orchestrator2 = new MigrationOrchestrator(config);

      // Resume
      const resumedState = await orchestrator2.loadState();
      expect(resumedState).toBeDefined();
      expect(resumedState?.completedSteps).toContain('SCAN');

      console.log('✅ State persistence working correctly');
    });
  });

  describe('Rollback Scenario', () => {
    it('should handle errors and rollback correctly', async () => {
      const config = {
        serverless: {
          path: slsDir,
          stackName: 'test-stack-dev',
          stage: 'dev',
          region: 'us-east-1'
        },
        cdk: {
          path: cdkDir,
          stackName: 'CdkMigrationStack',
          region: 'us-east-1',
          language: 'typescript' as const
        },
        resources: {},
        options: {
          dryRun: true,
          interactive: false,
          autoApprove: true,
          createBackups: true,
          verifyAfterEachStep: false
        }
      };

      const orchestrator = new MigrationOrchestrator(config);

      await orchestrator.initialize(config);

      // Complete several steps
      await orchestrator.executeStep('SCAN');
      await orchestrator.executeStep('PROTECT');

      const stateBeforeRollback = await orchestrator.getState();
      expect(stateBeforeRollback.completedSteps).toHaveLength(2);

      // Rollback to SCAN
      const rollbackResult = await orchestrator.rollback('SCAN');

      expect(rollbackResult.success).toBe(true);

      const stateAfterRollback = await orchestrator.getState();
      expect(stateAfterRollback.currentStep).toBe('SCAN');
      expect(stateAfterRollback.status).toBe('rolled_back');

      console.log('✅ Rollback scenario handled correctly');
    });
  });

  describe('Resource Classification', () => {
    it('should correctly classify stateful vs stateless resources', async () => {
      const scanner = new ScannerModule({
        path: slsDir,
        stackName: 'test-stack-dev',
        stage: 'dev',
        region: 'us-east-1'
      });

      const templatePath = path.join(
        slsDir,
        '.serverless/cloudformation-template-update-stack.json'
      );
      const slsTemplate = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const scanResult = await scanner.scan(slsTemplate);

      // Check stateful resources (should be IMPORT)
      const dynamodbTable = scanResult.inventory.find(
        r => r.type === 'AWS::DynamoDB::Table'
      );
      expect(dynamodbTable?.classification).toBe('IMPORT');

      const logGroup = scanResult.inventory.find(
        r => r.type === 'AWS::Logs::LogGroup'
      );
      expect(logGroup?.classification).toBe('IMPORT');

      const s3Bucket = scanResult.inventory.find(
        r => r.type === 'AWS::S3::Bucket'
      );
      expect(s3Bucket?.classification).toBe('IMPORT');

      // Check stateless resources (should be RECREATE)
      const lambdaFunction = scanResult.inventory.find(
        r => r.type === 'AWS::Lambda::Function'
      );
      expect(lambdaFunction?.classification).toBe('RECREATE');

      const iamRole = scanResult.inventory.find(
        r => r.type === 'AWS::IAM::Role'
      );
      expect(iamRole?.classification).toBe('RECREATE');

      console.log('✅ Resource classification correct');
      console.log(`   Stateful (IMPORT): ${scanResult.resources.stateful}`);
      console.log(`   Stateless (RECREATE): ${scanResult.resources.stateless}`);
    });
  });

  describe('Dependency Graph', () => {
    it('should build correct dependency graph', async () => {
      const scanner = new ScannerModule({
        path: slsDir,
        stackName: 'test-stack-dev',
        stage: 'dev',
        region: 'us-east-1'
      });

      const templatePath = path.join(
        slsDir,
        '.serverless/cloudformation-template-update-stack.json'
      );
      const slsTemplate = JSON.parse(await fs.readFile(templatePath, 'utf-8'));

      const graph = await scanner.buildDependencyGraph(slsTemplate);

      expect(graph).toBeInstanceOf(Map);
      expect(graph.size).toBeGreaterThan(0);

      // Verify specific dependencies
      // CounterLambdaFunction should depend on CounterLogGroup
      const lambdaDeps = graph.get('CounterLambdaFunction');
      expect(lambdaDeps).toBeDefined();
      expect(Array.from(lambdaDeps || [])).toContain('CounterLogGroup');

      console.log('✅ Dependency graph built correctly');
      console.log(`   Total resources: ${graph.size}`);
    });
  });
});
