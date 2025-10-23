/**
 * Managed Policy Detector - Sprint 2: IAM Role Generation
 * Detects when IAM role permissions match AWS managed policy patterns
 */

import { ClassifiedResource } from '../../../types';

export class ManagedPolicyDetector {
  /**
   * Basic Lambda Execution Role actions
   */
  private readonly BASIC_EXECUTION_ACTIONS = new Set([
    'logs:CreateLogGroup',
    'logs:CreateLogStream',
    'logs:PutLogEvents'
  ]);

  /**
   * Main detection logic - checks if role matches any managed policy pattern
   */
  public detectManagedPolicy(resource: ClassifiedResource): string | undefined {
    // Test 8: Return undefined for non-IAM resources
    if (resource.Type !== 'AWS::IAM::Role') {
      return undefined;
    }

    // Test 2: Check Sprint 1 pre-detected managedPolicyEquivalent
    if (resource.managedPolicyEquivalent) {
      return resource.managedPolicyEquivalent;
    }

    // Test 5: Handle missing properties
    if (!resource.Properties) {
      return undefined;
    }

    // Test 5: Handle missing AssumeRolePolicyDocument
    const assumeRolePolicy = resource.Properties.AssumeRolePolicyDocument;
    if (!assumeRolePolicy) {
      return undefined;
    }

    // Test 4: Check if Lambda service principal
    const statements = assumeRolePolicy.Statement || [];
    const isLambdaRole = statements.some((stmt: any) =>
      stmt.Principal?.Service === 'lambda.amazonaws.com' &&
      stmt.Action === 'sts:AssumeRole'
    );

    if (!isLambdaRole) {
      return undefined;
    }

    // Test 5 & 7: Check if policies exist (not explicit managed policies)
    const policies = resource.Properties.Policies || [];
    if (policies.length === 0) {
      return undefined;
    }

    // Test 6: Must have exactly ONE policy to match BasicExecutionRole
    if (policies.length !== 1) {
      return undefined;
    }

    // Test 1: Check first policy for basic execution actions
    const firstPolicy = policies[0];
    const policyDoc = firstPolicy?.PolicyDocument;
    if (!policyDoc) {
      return undefined;
    }

    const policyStatements = policyDoc.Statement || [];

    // Must have exactly ONE statement
    if (policyStatements.length !== 1) {
      return undefined;
    }

    const stmt = policyStatements[0];
    const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];

    // Test 3: Must have exactly the basic execution actions, no more, no less
    if (actions.length !== this.BASIC_EXECUTION_ACTIONS.size) {
      return undefined;
    }

    const matchesBasicActions = actions.every((action: string) =>
      this.BASIC_EXECUTION_ACTIONS.has(action)
    );

    if (stmt.Effect === 'Allow' && matchesBasicActions) {
      return 'service-role/AWSLambdaBasicExecutionRole';
    }

    return undefined;
  }
}
