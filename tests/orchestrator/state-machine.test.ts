/**
 * Tests for State Machine
 */

import { MigrationStateMachine } from '../../src/modules/orchestrator/state-machine';
import { MigrationStep, MigrationStatus, MigrationState } from '../../src/types';

describe('MigrationStateMachine', () => {
  describe('getNextStep', () => {
    it('should return next step in sequence', () => {
      const next = MigrationStateMachine.getNextStep(MigrationStep.INITIAL_SCAN);
      expect(next).toBe(MigrationStep.DISCOVERY);
    });

    it('should return null for last step', () => {
      const next = MigrationStateMachine.getNextStep(MigrationStep.COMPLETE);
      expect(next).toBeNull();
    });
  });

  describe('getPreviousStep', () => {
    it('should return previous step in sequence', () => {
      const prev = MigrationStateMachine.getPreviousStep(MigrationStep.DISCOVERY);
      expect(prev).toBe(MigrationStep.INITIAL_SCAN);
    });

    it('should return null for first step', () => {
      const prev = MigrationStateMachine.getPreviousStep(MigrationStep.INITIAL_SCAN);
      expect(prev).toBeNull();
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress percentage', () => {
      const progress = MigrationStateMachine.calculateProgress(MigrationStep.INITIAL_SCAN);
      expect(progress).toBe(0);
    });

    it('should return 100% for complete step', () => {
      const progress = MigrationStateMachine.calculateProgress(MigrationStep.COMPLETE);
      expect(progress).toBe(100);
    });
  });

  describe('validateTransition', () => {
    it('should allow transition to next step', () => {
      const result = MigrationStateMachine.validateTransition(
        MigrationStep.INITIAL_SCAN,
        MigrationStep.DISCOVERY
      );
      expect(result.valid).toBe(true);
    });

    it('should not allow skipping steps', () => {
      const result = MigrationStateMachine.validateTransition(
        MigrationStep.INITIAL_SCAN,
        MigrationStep.CLASSIFICATION
      );
      expect(result.valid).toBe(false);
    });
  });
});
