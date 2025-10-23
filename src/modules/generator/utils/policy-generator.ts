/**
 * Policy Generator - Sprint 2: IAM Role Generation
 * Generates CDK PolicyStatement objects and addToRolePolicy() calls
 */

import { ClassifiedResource } from '../../../types';
import { ReferenceResolver } from './reference-resolver';

/**
 * Generated policy statement with metadata
 */
export interface GeneratedPolicyStatement {
  /** Generated CDK code */
  code: string;

  /** Resolved action strings */
  actions: string[];

  /** Resolved resource references */
  resources: string[];

  /** Statement effect (Allow/Deny) */
  effect: string;

  /** Optional conditions */
  conditions?: any;
}

export class PolicyGenerator {
  constructor(
    private allResources: ClassifiedResource[],
    private referenceResolver: ReferenceResolver
  ) {}

  /**
   * Generates PolicyStatement object code from CloudFormation statement
   */
  public generatePolicyStatement(statement: any): GeneratedPolicyStatement {
    const effect = statement.Effect || 'Allow';
    const actions = this.resolveActions(statement.Action);
    const resources = this.resolveResources(statement.Resource);
    const conditions = statement.Condition;

    const lines: string[] = [];
    lines.push('new iam.PolicyStatement({');

    // Effect
    const effectEnum = effect === 'Allow' ? 'iam.Effect.ALLOW' : 'iam.Effect.DENY';
    lines.push(`  effect: ${effectEnum},`);

    // Actions
    if (actions.length > 0) {
      const actionsStr = actions.map(a => `"${a}"`).join(', ');
      lines.push(`  actions: [${actionsStr}],`);
    }

    // Resources
    if (resources.length > 0) {
      lines.push(`  resources: [${resources.join(', ')}]`);
    }

    // Conditions
    if (conditions) {
      lines.push(`,`);
      lines.push(`  conditions: ${JSON.stringify(conditions)}`);
    }

    lines.push('})');

    return {
      code: lines.join('\n'),
      actions,
      resources,
      effect,
      conditions
    };
  }

  /**
   * Generates complete addToRolePolicy() call
   */
  public generateAddToRolePolicy(roleName: string, statement: any): string {
    const policyStatement = this.generatePolicyStatement(statement);

    // Indent the policy statement code
    const indentedCode = policyStatement.code.split('\n').map(line => '  ' + line).join('\n');

    return `${roleName}.addToRolePolicy(\n${indentedCode}\n);`;
  }

  /**
   * Resolves action strings from CloudFormation format
   */
  private resolveActions(actions: string | string[]): string[] {
    if (!actions) {
      return [];
    }

    return Array.isArray(actions) ? actions : [actions];
  }

  /**
   * Resolves resource references from CloudFormation format
   */
  private resolveResources(resources: any): string[] {
    if (!resources) {
      return [];
    }

    const resourceArray = Array.isArray(resources) ? resources : [resources];

    return resourceArray.map(resource => {
      return this.referenceResolver.resolveResourceReference(resource);
    });
  }

  /**
   * Groups policy statements by AWS service
   */
  public groupStatementsByService(statements: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const statement of statements) {
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action];

      const service = actions[0]?.split(':')[0] || 'unknown';

      if (!grouped.has(service)) {
        grouped.set(service, []);
      }
      grouped.get(service)!.push(statement);
    }

    return grouped;
  }
}
