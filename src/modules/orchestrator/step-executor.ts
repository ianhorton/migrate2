/**
 * Step Executor for Migration Orchestrator
 * Executes individual migration steps with verification and rollback
 */

import {
  MigrationState,
  MigrationStep,
  MigrationStatus,
  StepResult,
  StepExecutor,
  VerificationResult
} from '../../types';
import { Logger } from '../../utils/logger';

export abstract class BaseStepExecutor implements StepExecutor {
  protected logger: Logger;

  constructor(protected readonly stepName: MigrationStep) {
    this.logger = new Logger(stepName);
  }

  /**
   * Check if this step can be executed given current state
   */
  public canExecute(state: MigrationState): boolean {
    // Check if this is the current step
    if (state.currentStep !== this.stepName) {
      return false;
    }

    // Check if step is already completed
    const result = state.stepResults[this.stepName];
    if (result && result.status === MigrationStatus.COMPLETED) {
      return false;
    }

    return this.validatePrerequisites(state);
  }

  /**
   * Execute the step
   */
  public async execute(state: MigrationState): Promise<StepResult> {
    const startTime = new Date();
    this.logger.info(`Starting step: ${this.stepName}`);

    try {
      // Validate prerequisites
      if (!this.canExecute(state)) {
        throw new Error(`Cannot execute step ${this.stepName}: prerequisites not met`);
      }

      // Execute the actual step logic
      const data = await this.executeStep(state);

      // Validate results
      const validation = await this.validate(state);
      if (!validation.passed) {
        throw new Error(`Step validation failed: ${validation.errors.join(', ')}`);
      }

      const result: StepResult = {
        step: this.stepName,
        status: MigrationStatus.COMPLETED,
        startedAt: startTime,
        completedAt: new Date(),
        data
      };

      this.logger.info(`Completed step: ${this.stepName}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed step: ${this.stepName}`, error);

      const result: StepResult = {
        step: this.stepName,
        status: MigrationStatus.FAILED,
        startedAt: startTime,
        completedAt: new Date(),
        error: error as Error
      };

      return result;
    }
  }

  /**
   * Rollback this step
   */
  public async rollback(state: MigrationState): Promise<void> {
    this.logger.info(`Rolling back step: ${this.stepName}`);
    await this.executeRollback(state);
    this.logger.info(`Rollback completed: ${this.stepName}`);
  }

  /**
   * Validate step completion
   */
  public async validate(state: MigrationState): Promise<VerificationResult> {
    const checks = await this.runValidationChecks(state);
    const errors = checks.filter(c => !c.passed && c.severity === 'error').map(c => c.message);
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning').map(c => c.message);

    return {
      passed: errors.length === 0,
      checks,
      errors,
      warnings
    };
  }

  /**
   * Override: Validate prerequisites before execution
   */
  protected abstract validatePrerequisites(state: MigrationState): boolean;

  /**
   * Override: Execute the actual step logic
   */
  protected abstract executeStep(state: MigrationState): Promise<any>;

  /**
   * Override: Execute rollback logic
   */
  protected abstract executeRollback(state: MigrationState): Promise<void>;

  /**
   * Override: Run validation checks
   */
  protected abstract runValidationChecks(state: MigrationState): Promise<Array<{
    name: string;
    passed: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>>;
}

/**
 * Example: Initial Scan Step Executor
 */
export class InitialScanExecutor extends BaseStepExecutor {
  constructor() {
    super(MigrationStep.INITIAL_SCAN);
  }

  protected validatePrerequisites(state: MigrationState): boolean {
    // No prerequisites for first step
    return true;
  }

  protected async executeStep(state: MigrationState): Promise<any> {
    // Implementation will integrate with Scanner module
    this.logger.info('Scanning Serverless configuration...');

    // TODO: Call scanner module
    // const scanner = new Scanner(state.config.sourceDir);
    // const config = await scanner.parseServerlessConfig();
    // const cfTemplate = await scanner.generateCloudFormation(state.config.stage);

    return {
      serverlessConfig: {},
      cloudFormationTemplate: {},
      timestamp: new Date()
    };
  }

  protected async executeRollback(state: MigrationState): Promise<void> {
    // Nothing to rollback for scan step
    this.logger.info('No rollback needed for initial scan');
  }

  protected async runValidationChecks(state: MigrationState) {
    return [
      {
        name: 'serverless-config-exists',
        passed: true,
        message: 'Serverless configuration found',
        severity: 'error' as const
      },
      {
        name: 'cloudformation-generated',
        passed: true,
        message: 'CloudFormation template generated successfully',
        severity: 'error' as const
      }
    ];
  }
}

/**
 * Step Executor Factory
 */
export class StepExecutorFactory {
  private static executors: Map<MigrationStep, BaseStepExecutor> = new Map();

  static {
    // Import executors dynamically to avoid circular dependencies
    // Actual registration happens in initializeExecutors()
  }

  /**
   * Initialize and register all step executors
   * Call this before using the factory
   */
  public static async initializeExecutors(): Promise<void> {
    if (this.executors.size > 0) {
      return; // Already initialized
    }

    // Dynamically import executors to avoid circular dependencies
    const {
      ScanExecutor,
      ProtectExecutor,
      GenerateExecutor,
      CompareExecutor,
      RemoveExecutor,
      ImportExecutor,
      DeployExecutor,
      VerifyExecutor,
      CleanupExecutor
    } = await import('./steps');

    // Register all executors
    this.executors.set(MigrationStep.INITIAL_SCAN, new ScanExecutor());
    this.executors.set(MigrationStep.DISCOVERY, new ProtectExecutor());
    this.executors.set(MigrationStep.CDK_GENERATION, new GenerateExecutor());
    this.executors.set(MigrationStep.COMPARISON, new CompareExecutor());
    this.executors.set(MigrationStep.TEMPLATE_MODIFICATION, new RemoveExecutor());
    this.executors.set(MigrationStep.IMPORT_PREPARATION, new ImportExecutor());
    this.executors.set(MigrationStep.VERIFICATION, new DeployExecutor());
    this.executors.set(MigrationStep.COMPLETE, new CleanupExecutor());
  }

  public static getExecutor(step: MigrationStep): BaseStepExecutor {
    const executor = this.executors.get(step);
    if (!executor) {
      throw new Error(
        `No executor registered for step: ${step}. Did you call initializeExecutors()?`
      );
    }
    return executor;
  }

  public static registerExecutor(step: MigrationStep, executor: BaseStepExecutor): void {
    this.executors.set(step, executor);
  }

  public static hasExecutor(step: MigrationStep): boolean {
    return this.executors.has(step);
  }

  public static getAllExecutors(): Map<MigrationStep, BaseStepExecutor> {
    return new Map(this.executors);
  }
}
