/**
 * Orchestrator Module Tests
 * Tests migration workflow orchestration, state management, and step execution
 */

import { MigrationOrchestrator, MigrationStep } from '@/modules/orchestrator';
import { mockCloudFormationClient } from '@tests/mocks/aws-sdk';

describe('MigrationOrchestrator', () => {
  let orchestrator: MigrationOrchestrator;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      serverless: {
        path: './test-serverless',
        stackName: 'test-stack-dev',
        stage: 'dev',
        region: 'us-east-1'
      },
      cdk: {
        path: './test-cdk',
        stackName: 'TestCdkStack',
        region: 'us-east-1',
        language: 'typescript'
      },
      resources: {
        include: [],
        exclude: []
      },
      options: {
        dryRun: false,
        interactive: false,
        autoApprove: true,
        createBackups: true,
        verifyAfterEachStep: false
      }
    };

    orchestrator = new MigrationOrchestrator(mockConfig);
  });

  describe('initialize', () => {
    it('should initialize migration project', async () => {
      const project = await orchestrator.initialize(mockConfig);

      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('config');
      expect(project).toHaveProperty('state');
      expect(project).toHaveProperty('currentStep');
      expect(project.config).toEqual(mockConfig);
      expect(project.state.status).toBe('initialized');
    });

    it('should generate unique project ID', async () => {
      const project1 = await orchestrator.initialize(mockConfig);
      const project2 = await orchestrator.initialize(mockConfig);

      expect(project1.id).not.toBe(project2.id);
    });

    it('should create initial state', async () => {
      const project = await orchestrator.initialize(mockConfig);

      expect(project.state.status).toBe('initialized');
      expect(project.state.completedSteps).toEqual([]);
      expect(project.state.failedSteps).toEqual([]);
      expect(project.state.currentStep).toBe(MigrationStep.SCAN);
    });
  });

  describe('executeStep', () => {
    beforeEach(async () => {
      await orchestrator.initialize(mockConfig);
    });

    it('should execute SCAN step', async () => {
      const result = await orchestrator.executeStep(MigrationStep.SCAN);

      expect(result.success).toBe(true);
      expect(result.step).toBe(MigrationStep.SCAN);
      expect(result.data).toHaveProperty('resources');
    });

    it('should execute PROTECT step', async () => {
      // First scan
      await orchestrator.executeStep(MigrationStep.SCAN);

      const result = await orchestrator.executeStep(MigrationStep.PROTECT);

      expect(result.success).toBe(true);
      expect(result.step).toBe(MigrationStep.PROTECT);
    });

    it('should execute GENERATE step', async () => {
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.executeStep(MigrationStep.PROTECT);

      const result = await orchestrator.executeStep(MigrationStep.GENERATE);

      expect(result.success).toBe(true);
      expect(result.step).toBe(MigrationStep.GENERATE);
      expect(result.data).toHaveProperty('mainFile');
    });

    it('should execute COMPARE step', async () => {
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.executeStep(MigrationStep.PROTECT);
      await orchestrator.executeStep(MigrationStep.GENERATE);

      const result = await orchestrator.executeStep(MigrationStep.COMPARE);

      expect(result.success).toBe(true);
      expect(result.step).toBe(MigrationStep.COMPARE);
    });

    it('should save state after each step', async () => {
      const saveStateSpy = jest.spyOn(orchestrator as any, 'saveState');

      await orchestrator.executeStep(MigrationStep.SCAN);

      expect(saveStateSpy).toHaveBeenCalled();
    });

    it('should handle step failures gracefully', async () => {
      // Mock a failure in SCAN
      jest.spyOn(orchestrator as any, 'executeScan').mockRejectedValueOnce(
        new Error('Scan failed')
      );

      const result = await orchestrator.executeStep(MigrationStep.SCAN);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Scan failed');
    });

    it('should record failed steps in state', async () => {
      jest.spyOn(orchestrator as any, 'executeScan').mockRejectedValueOnce(
        new Error('Scan failed')
      );

      await orchestrator.executeStep(MigrationStep.SCAN);

      const state = await orchestrator.getState();
      expect(state.failedSteps).toHaveLength(1);
      expect(state.failedSteps[0].step).toBe(MigrationStep.SCAN);
    });
  });

  describe('runMigration', () => {
    beforeEach(async () => {
      await orchestrator.initialize(mockConfig);
    });

    it('should execute all steps in order (automatic mode)', async () => {
      const result = await orchestrator.runMigration('automatic');

      expect(result.success).toBe(true);

      const state = await orchestrator.getState();
      expect(state.status).toBe('completed');
      expect(state.completedSteps).toHaveLength(9); // All 9 steps
    });

    it('should skip completed steps on resume', async () => {
      // Complete first 3 steps
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.executeStep(MigrationStep.PROTECT);
      await orchestrator.executeStep(MigrationStep.GENERATE);

      // Mock remaining steps
      const compareStepSpy = jest.spyOn(orchestrator as any, 'executeCompare');

      // Resume
      const result = await orchestrator.runMigration('automatic');

      expect(result.success).toBe(true);
      // Should not re-execute completed steps
      expect(compareStepSpy).toHaveBeenCalledTimes(1);
    });

    it('should stop on step failure in automatic mode', async () => {
      jest.spyOn(orchestrator as any, 'executeCompare').mockRejectedValueOnce(
        new Error('Comparison failed')
      );

      const result = await orchestrator.runMigration('automatic');

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe(MigrationStep.COMPARE);

      const state = await orchestrator.getState();
      expect(state.status).toBe('failed');
    });

    it('should set end time on completion', async () => {
      await orchestrator.runMigration('automatic');

      const state = await orchestrator.getState();
      expect(state.endTime).toBeDefined();
      expect(state.endTime).toBeInstanceOf(Date);
    });
  });

  describe('verify', () => {
    beforeEach(async () => {
      await orchestrator.initialize(mockConfig);
    });

    it('should verify migration success', async () => {
      // Mock successful migration
      await orchestrator.runMigration('automatic');

      const result = await orchestrator.verify();

      expect(result.success).toBe(true);
      expect(result.checks).toHaveProperty('stackExists');
      expect(result.checks).toHaveProperty('resourcesExist');
      expect(result.checks).toHaveProperty('noDrift');
    });

    it('should detect missing resources', async () => {
      // Mock resource check to fail
      jest.spyOn(orchestrator as any, 'verifyResourceExists').mockResolvedValueOnce(false);

      const result = await orchestrator.verify();

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Resource not found')
      );
    });

    it('should detect stack drift', async () => {
      mockCloudFormationClient.mockDetectStackDrift('DRIFTED');

      const result = await orchestrator.verify();

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('drift')
      );
    });
  });

  describe('rollback', () => {
    beforeEach(async () => {
      await orchestrator.initialize(mockConfig);
    });

    it('should rollback to specified step', async () => {
      // Complete several steps
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.executeStep(MigrationStep.PROTECT);
      await orchestrator.executeStep(MigrationStep.GENERATE);
      await orchestrator.executeStep(MigrationStep.COMPARE);

      // Rollback to GENERATE
      const result = await orchestrator.rollback(MigrationStep.GENERATE);

      expect(result.success).toBe(true);

      const state = await orchestrator.getState();
      expect(state.currentStep).toBe(MigrationStep.GENERATE);
      expect(state.status).toBe('rolled_back');
    });

    it('should restore backups during rollback', async () => {
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.executeStep(MigrationStep.PROTECT);

      const restoreBackupSpy = jest.spyOn(orchestrator as any, 'restoreBackup');

      await orchestrator.rollback(MigrationStep.SCAN);

      expect(restoreBackupSpy).toHaveBeenCalled();
    });

    it('should update state to rolled_back', async () => {
      await orchestrator.executeStep(MigrationStep.SCAN);
      await orchestrator.rollback(MigrationStep.SCAN);

      const state = await orchestrator.getState();
      expect(state.status).toBe('rolled_back');
    });
  });

  describe('resume', () => {
    it('should resume from saved state', async () => {
      // Initialize and complete first step
      await orchestrator.initialize(mockConfig);
      await orchestrator.executeStep(MigrationStep.SCAN);

      // Create new orchestrator instance (simulates restart)
      const newOrchestrator = new MigrationOrchestrator(mockConfig);

      const result = await newOrchestrator.resume();

      expect(result.success).toBe(true);

      const state = await newOrchestrator.getState();
      // Should have completed all remaining steps
      expect(state.completedSteps.length).toBeGreaterThan(1);
    });

    it('should throw if no saved state exists', async () => {
      await expect(orchestrator.resume()).rejects.toThrow(
        'No saved migration state found'
      );
    });
  });

  describe('State Management', () => {
    it('should save state to file', async () => {
      await orchestrator.initialize(mockConfig);
      await orchestrator.executeStep(MigrationStep.SCAN);

      const state = await orchestrator.getState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('currentStep');
      expect(state).toHaveProperty('completedSteps');
      expect(state.completedSteps).toContain(MigrationStep.SCAN);
    });

    it('should load state from file', async () => {
      await orchestrator.initialize(mockConfig);
      await orchestrator.executeStep(MigrationStep.SCAN);

      // Create new instance
      const newOrchestrator = new MigrationOrchestrator(mockConfig);
      const state = await newOrchestrator.loadState();

      expect(state).toBeDefined();
      expect(state?.completedSteps).toContain(MigrationStep.SCAN);
    });

    it('should create backup of state', async () => {
      await orchestrator.initialize(mockConfig);
      await orchestrator.executeStep(MigrationStep.SCAN);

      const backups = await orchestrator.listStateBackups();

      expect(backups.length).toBeGreaterThan(0);
    });
  });

  describe('Dry Run Mode', () => {
    beforeEach(() => {
      mockConfig.options.dryRun = true;
      orchestrator = new MigrationOrchestrator(mockConfig);
    });

    it('should not make actual changes in dry run', async () => {
      const deployStub = jest.spyOn(orchestrator as any, 'deployToAWS');

      await orchestrator.initialize(mockConfig);
      await orchestrator.runMigration('automatic');

      expect(deployStub).not.toHaveBeenCalled();
    });

    it('should report what would be done', async () => {
      await orchestrator.initialize(mockConfig);
      const result = await orchestrator.runMigration('automatic');

      expect(result).toHaveProperty('dryRunReport');
      expect(result.dryRunReport).toContain('Would execute');
    });
  });

  describe('Verification After Each Step', () => {
    beforeEach(() => {
      mockConfig.options.verifyAfterEachStep = true;
      orchestrator = new MigrationOrchestrator(mockConfig);
    });

    it('should verify after each step when enabled', async () => {
      const verifyStepSpy = jest.spyOn(orchestrator as any, 'verifyStep');

      await orchestrator.initialize(mockConfig);
      await orchestrator.executeStep(MigrationStep.SCAN);

      expect(verifyStepSpy).toHaveBeenCalledWith(MigrationStep.SCAN);
    });
  });

  describe('Integration - Complete Migration Flow', () => {
    it('should execute complete migration successfully', async () => {
      await orchestrator.initialize(mockConfig);

      const result = await orchestrator.runMigration('automatic');

      expect(result.success).toBe(true);

      const state = await orchestrator.getState();
      expect(state.status).toBe('completed');
      expect(state.completedSteps).toHaveLength(9);
      expect(state.failedSteps).toHaveLength(0);

      // Verify final state
      const verification = await orchestrator.verify();
      expect(verification.success).toBe(true);
    });

    it('should handle failure and rollback', async () => {
      await orchestrator.initialize(mockConfig);

      // Mock failure at COMPARE step
      jest.spyOn(orchestrator as any, 'executeCompare').mockRejectedValueOnce(
        new Error('Templates do not match')
      );

      const result = await orchestrator.runMigration('automatic');

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe(MigrationStep.COMPARE);

      // Rollback
      const rollbackResult = await orchestrator.rollback(MigrationStep.GENERATE);
      expect(rollbackResult.success).toBe(true);

      // Fix issue and resume
      jest.spyOn(orchestrator as any, 'executeCompare').mockResolvedValueOnce({
        success: true,
        step: MigrationStep.COMPARE
      });

      const resumeResult = await orchestrator.resume();
      expect(resumeResult.success).toBe(true);
    });
  });
});
