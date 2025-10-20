/**
 * State Machine for Migration Process
 * Defines the 9-step migration workflow and transitions
 */

import { MigrationStep, MigrationStatus, MigrationState } from '../../types';

export class MigrationStateMachine {
  private static readonly STEP_ORDER: MigrationStep[] = [
    MigrationStep.INITIAL_SCAN,
    MigrationStep.DISCOVERY,
    MigrationStep.CLASSIFICATION,
    MigrationStep.COMPARISON,
    MigrationStep.TEMPLATE_MODIFICATION,
    MigrationStep.CDK_GENERATION,
    MigrationStep.IMPORT_PREPARATION,
    MigrationStep.VERIFICATION,
    MigrationStep.COMPLETE
  ];

  private static readonly STEP_DESCRIPTIONS: Record<MigrationStep, string> = {
    [MigrationStep.INITIAL_SCAN]: 'Scanning Serverless configuration and generating CloudFormation',
    [MigrationStep.DISCOVERY]: 'Discovering all resources including abstracted ones',
    [MigrationStep.CLASSIFICATION]: 'Classifying resources for import/recreation',
    [MigrationStep.COMPARISON]: 'Comparing templates and identifying differences',
    [MigrationStep.TEMPLATE_MODIFICATION]: 'Modifying CloudFormation template for migration',
    [MigrationStep.CDK_GENERATION]: 'Generating CDK code from CloudFormation',
    [MigrationStep.IMPORT_PREPARATION]: 'Preparing resource import definitions',
    [MigrationStep.VERIFICATION]: 'Verifying migration readiness',
    [MigrationStep.COMPLETE]: 'Migration complete'
  };

  /**
   * Get the next step in the migration workflow
   */
  public static getNextStep(currentStep: MigrationStep): MigrationStep | null {
    const currentIndex = this.STEP_ORDER.indexOf(currentStep);
    if (currentIndex === -1 || currentIndex === this.STEP_ORDER.length - 1) {
      return null;
    }
    return this.STEP_ORDER[currentIndex + 1];
  }

  /**
   * Get the previous step in the migration workflow
   */
  public static getPreviousStep(currentStep: MigrationStep): MigrationStep | null {
    const currentIndex = this.STEP_ORDER.indexOf(currentStep);
    if (currentIndex <= 0) {
      return null;
    }
    return this.STEP_ORDER[currentIndex - 1];
  }

  /**
   * Check if a step can be executed based on current state
   */
  public static canExecuteStep(state: MigrationState, step: MigrationStep): boolean {
    const currentIndex = this.STEP_ORDER.indexOf(state.currentStep);
    const targetIndex = this.STEP_ORDER.indexOf(step);

    // Can't execute if step is before current step (unless rolling back)
    if (targetIndex < currentIndex && state.status !== MigrationStatus.ROLLED_BACK) {
      return false;
    }

    // Can't skip steps forward
    if (targetIndex > currentIndex + 1) {
      return false;
    }

    // Check if previous steps are completed
    for (let i = 0; i < targetIndex; i++) {
      const prevStep = this.STEP_ORDER[i];
      const prevResult = state.stepResults[prevStep];
      if (!prevResult || prevResult.status !== MigrationStatus.COMPLETED) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate state transition
   */
  public static validateTransition(
    fromStep: MigrationStep,
    toStep: MigrationStep
  ): { valid: boolean; reason?: string } {
    const fromIndex = this.STEP_ORDER.indexOf(fromStep);
    const toIndex = this.STEP_ORDER.indexOf(toStep);

    if (fromIndex === -1) {
      return { valid: false, reason: `Invalid source step: ${fromStep}` };
    }

    if (toIndex === -1) {
      return { valid: false, reason: `Invalid target step: ${toStep}` };
    }

    // Can only move forward one step at a time
    if (toIndex !== fromIndex + 1) {
      return { valid: false, reason: 'Can only transition to next sequential step' };
    }

    return { valid: true };
  }

  /**
   * Get step description
   */
  public static getStepDescription(step: MigrationStep): string {
    return this.STEP_DESCRIPTIONS[step] || 'Unknown step';
  }

  /**
   * Get all steps in order
   */
  public static getAllSteps(): MigrationStep[] {
    return [...this.STEP_ORDER];
  }

  /**
   * Get step index (0-based)
   */
  public static getStepIndex(step: MigrationStep): number {
    return this.STEP_ORDER.indexOf(step);
  }

  /**
   * Calculate progress percentage
   */
  public static calculateProgress(currentStep: MigrationStep): number {
    const index = this.getStepIndex(currentStep);
    if (index === -1) return 0;
    return Math.round((index / (this.STEP_ORDER.length - 1)) * 100);
  }

  /**
   * Check if migration is complete
   */
  public static isComplete(step: MigrationStep): boolean {
    return step === MigrationStep.COMPLETE;
  }

  /**
   * Get steps remaining
   */
  public static getStepsRemaining(currentStep: MigrationStep): MigrationStep[] {
    const currentIndex = this.getStepIndex(currentStep);
    if (currentIndex === -1) return [];
    return this.STEP_ORDER.slice(currentIndex + 1);
  }

  /**
   * Get completed steps
   */
  public static getCompletedSteps(state: MigrationState): MigrationStep[] {
    return this.STEP_ORDER.filter(step => {
      const result = state.stepResults[step];
      return result && result.status === MigrationStatus.COMPLETED;
    });
  }
}
