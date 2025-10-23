/**
 * Unit tests for HumanInterventionManager
 */

import { HumanInterventionManager } from '../../../src/modules/intervention/human-intervention-manager';
import {
  InterventionPrompt,
  PhysicalResourceCandidate,
  Difference,
  DriftInfo,
} from '../../../src/types/intervention';
import * as fs from 'fs';
import * as path from 'path';

// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

// Mock ora
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  }));
});

const inquirer = require('inquirer');

describe('HumanInterventionManager', () => {
  let manager: HumanInterventionManager;
  const testAuditPath = path.join(__dirname, '..', '..', 'fixtures', 'test-audit.json');

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new HumanInterventionManager({
      dryRun: true,
      auditLogPath: testAuditPath,
      migrationId: 'test-migration-123',
    });
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testAuditPath)) {
      fs.unlinkSync(testAuditPath);
    }
  });

  describe('prompt', () => {
    it('should simulate prompt in dry-run mode', async () => {
      const prompt: InterventionPrompt = {
        id: 'test-prompt-1',
        type: 'confirm',
        severity: 'info',
        question: 'Continue with migration?',
        defaultValue: 'true',
      };

      const response = await manager.prompt(prompt);

      expect(response.promptId).toBe('test-prompt-1');
      expect(response.action).toBe('true');
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should use first option as default in dry-run mode', async () => {
      const prompt: InterventionPrompt = {
        id: 'test-prompt-2',
        type: 'choice',
        severity: 'warning',
        question: 'Select action',
        options: [
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' },
        ],
      };

      const response = await manager.prompt(prompt);

      expect(response.action).toBe('option1');
    });
  });

  describe('promptForPhysicalId', () => {
    it('should handle empty candidates', async () => {
      const logicalId = 'UsersTable';
      const resourceType = 'AWS::DynamoDB::Table';
      const candidates: PhysicalResourceCandidate[] = [];

      // In dry-run mode, it should throw since no candidates
      await expect(
        manager.promptForPhysicalId(logicalId, resourceType, candidates)
      ).rejects.toThrow();
    });

    it('should sort candidates by confidence', async () => {
      const candidates: PhysicalResourceCandidate[] = [
        { physicalId: 'table-low', confidence: 0.3, source: 'discovered' },
        { physicalId: 'table-high', confidence: 0.9, source: 'discovered' },
        { physicalId: 'table-medium', confidence: 0.6, source: 'discovered' },
      ];

      // Mock inquirer to return first choice
      inquirer.prompt.mockResolvedValue({ selection: 'table-high' });

      // Create non-dry-run manager
      const interactiveManager = new HumanInterventionManager({
        dryRun: false,
        migrationId: 'test-interactive',
      });

      const result = await interactiveManager.promptForPhysicalId(
        'TestTable',
        'AWS::DynamoDB::Table',
        candidates
      );

      expect(result).toBe('table-high');
    });
  });

  describe('confirmCriticalDifference', () => {
    it('should handle critical differences in non-dry-run mode', async () => {
      const differences: Difference[] = [
        {
          path: 'Properties.TableName',
          serverlessValue: 'users-table-dev',
          cdkValue: 'users-table-prod',
          severity: 'critical',
          description: 'Table name mismatch',
        },
      ];

      inquirer.prompt.mockResolvedValue({ action: 'proceed' });

      const interactiveManager = new HumanInterventionManager({
        dryRun: false,
        migrationId: 'test-critical',
      });

      const result = await interactiveManager.confirmCriticalDifference(
        'UsersTable',
        differences
      );

      expect(result).toBe('proceed');
      expect(inquirer.prompt).toHaveBeenCalled();
    });
  });

  describe('resolveDrift', () => {
    it('should handle drift resolution in non-dry-run mode', async () => {
      const drift: DriftInfo = {
        resourceId: 'UsersTable',
        drifted: true,
        driftStatus: 'MODIFIED',
        propertyDifferences: [
          {
            propertyPath: 'Properties.BillingMode',
            expectedValue: 'PROVISIONED',
            actualValue: 'PAY_PER_REQUEST',
            differenceType: 'MODIFY',
          },
        ],
      };

      inquirer.prompt.mockResolvedValue({ strategy: 'use-aws' });

      const interactiveManager = new HumanInterventionManager({
        dryRun: false,
        migrationId: 'test-drift',
      });

      const result = await interactiveManager.resolveDrift('UsersTable', drift);

      expect(result).toBe('use-aws');
    });
  });

  describe('recordIntervention', () => {
    it('should record intervention in history', () => {
      const response = {
        promptId: 'test-prompt',
        action: 'proceed',
        value: 'test-value',
        timestamp: new Date(),
      };

      manager.recordIntervention(response);

      const history = manager.getInterventionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('proceed');
    });

    it('should filter history by migration ID', () => {
      const manager1 = new HumanInterventionManager({
        migrationId: 'migration-1',
      });
      const manager2 = new HumanInterventionManager({
        migrationId: 'migration-2',
      });

      manager1.recordIntervention({
        promptId: 'p1',
        action: 'proceed',
        timestamp: new Date(),
      });

      manager2.recordIntervention({
        promptId: 'p2',
        action: 'skip',
        timestamp: new Date(),
      });

      const history1 = manager1.getInterventionHistory('migration-1');
      const history2 = manager2.getInterventionHistory('migration-2');

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(1);
      expect(history1[0].action).toBe('proceed');
      expect(history2[0].action).toBe('skip');
    });
  });

  describe('auto-approve mode', () => {
    it('should use default value in auto-approve mode', async () => {
      const autoApproveManager = new HumanInterventionManager({
        autoApprove: true,
        migrationId: 'test-auto-approve',
      });

      const prompt: InterventionPrompt = {
        id: 'test-auto',
        type: 'confirm',
        severity: 'info',
        question: 'Proceed?',
        defaultValue: 'true',
      };

      const response = await autoApproveManager.prompt(prompt);

      expect(response.action).toBe('true');
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });

  describe('spinner', () => {
    it('should create spinner instance', () => {
      const spinner = manager.spinner('Loading...');
      expect(spinner).toBeDefined();
    });
  });
});
