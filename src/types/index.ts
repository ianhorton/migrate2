/**
 * Core type definitions for the SLS-to-CDK migration tool
 */

// Migration State Machine Steps
export enum MigrationStep {
  INITIAL_SCAN = 'INITIAL_SCAN',
  DISCOVERY = 'DISCOVERY',
  CLASSIFICATION = 'CLASSIFICATION',
  COMPARISON = 'COMPARISON',
  TEMPLATE_MODIFICATION = 'TEMPLATE_MODIFICATION',
  CDK_GENERATION = 'CDK_GENERATION',
  IMPORT_PREPARATION = 'IMPORT_PREPARATION',
  VERIFICATION = 'VERIFICATION',
  COMPLETE = 'COMPLETE'
}

export enum MigrationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK'
}

export enum ResourceAction {
  IMPORT = 'IMPORT',
  RECREATE = 'RECREATE',
  SKIP = 'SKIP'
}

// State Management
export interface MigrationState {
  id: string;
  currentStep: MigrationStep;
  status: MigrationStatus;
  config: MigrationConfig;
  stepResults: Record<MigrationStep, StepResult>;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: Error;
}

export interface StepResult {
  step: MigrationStep;
  status: MigrationStatus;
  startedAt: Date;
  completedAt?: Date;
  data?: any;
  error?: Error;
}

// Configuration
export interface MigrationConfig {
  sourceDir: string;
  targetDir: string;
  stage: string;
  region: string;
  accountId: string;
  stackName: string;
  profile?: string;  // AWS profile name
  dryRun: boolean;
  autoApprove: boolean;
  backupEnabled: boolean;
  cdkLanguage: 'typescript' | 'python' | 'java' | 'csharp';
}

// Resources
export interface Resource {
  logicalId: string;
  physicalId?: string;
  type: string;
  properties: Record<string, any>;
  metadata?: Record<string, any>;
  dependencies?: string[];
  action?: ResourceAction;
}

export interface ResourceInventory {
  explicit: Resource[];
  abstracted: Resource[];
  stateful: Resource[];
  stateless: Resource[];
}

export interface ResourceClassification {
  toImport: Resource[];
  toRecreate: Resource[];
  toSkip: Resource[];
  dependencies: Map<string, string[]>;
}

// CloudFormation
export interface CloudFormationTemplate {
  AWSTemplateFormatVersion: string;
  Description?: string;
  Parameters?: Record<string, any>;
  Resources: Record<string, CloudFormationResource>;
  Outputs?: Record<string, any>;
}

export interface CloudFormationResource {
  Type: string;
  Properties: Record<string, any>;
  DependsOn?: string | string[];
  Metadata?: Record<string, any>;
  Condition?: string;
}

/**
 * Enhanced resource with classification metadata for clean CDK generation
 * Added in Sprint 1: Resource Classification Enhancement
 */
export interface ClassifiedResource extends CloudFormationResource {
  // Core identification
  LogicalId: string;

  // Classification flags
  needsImport: boolean;              // Does this resource exist and need import?
  isStateful: boolean;               // Should it have RemovalPolicy.RETAIN?
  isExplicit: boolean;               // Defined in serverless.yml vs abstracted

  // Clean code generation hints
  managedPolicyEquivalent?: string;  // e.g., "service-role/AWSLambdaBasicExecutionRole"
  relatedResources: string[];        // Logical IDs of related resources
  groupId: string;                   // For logical grouping in generated code
  codeLocation?: string;             // For Lambda functions

  // Code optimization flags
  suppressLogicalIdOverride?: boolean;  // Don't override logical ID
  suppressRemovalPolicy?: boolean;      // Don't add RETAIN
  suppressComments?: boolean;           // No verbose import comments
}

// Comparison
export interface TemplateDiff {
  added: Resource[];
  removed: Resource[];
  modified: ResourceModification[];
  unchanged: Resource[];
  severity: 'critical' | 'warning' | 'info';
}

export interface ResourceModification {
  resource: Resource;
  propertyChanges: PropertyChange[];
  severity: 'critical' | 'warning' | 'info';
}

export interface PropertyChange {
  path: string;
  oldValue: any;
  newValue: any;
  severity: 'critical' | 'warning' | 'info';
}

// CDK Generation
export interface CDKGenerationResult {
  language: string;
  code: string;
  imports: string[];
  constructName: string;
  resources: CDKResource[];
}

export interface CDKResource {
  id: string;
  constructType: string;
  properties: Record<string, any>;
  dependencies: string[];
}

// Verification
export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  errors: string[];
  warnings: string[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// CLI
export interface CLIOptions {
  config?: string;
  dryRun?: boolean;
  autoApprove?: boolean;
  verbose?: boolean;
  stage?: string;
  region?: string;
  resume?: string;
}

export interface InteractiveAnswers {
  sourceDir: string;
  targetDir: string;
  stage: string;
  region: string;
  stackName: string;
  cdkLanguage: 'typescript' | 'python' | 'java' | 'csharp';
  dryRun: boolean;
  backupEnabled: boolean;
}

// Orchestrator
export interface StepExecutor {
  canExecute(state: MigrationState): boolean;
  execute(state: MigrationState): Promise<StepResult>;
  rollback(state: MigrationState): Promise<void>;
  validate(state: MigrationState): Promise<VerificationResult>;
}

export interface OrchestratorOptions {
  resumeFrom?: MigrationStep;
  skipSteps?: MigrationStep[];
  onProgress?: (step: MigrationStep, progress: number) => void;
  onStepComplete?: (result: StepResult) => void;
}

// Re-export checkpoint types
export * from './checkpoint';
