/**
 * Dependency Updater
 * Updates DependsOn references and analyzes dependencies
 */

import { CloudFormationTemplate, CloudFormationResource } from '../../types/migration';
import { DependencyUpdate, EditorError, EditorErrorCode } from './types';

export class DependencyUpdater {
  /**
   * Update all DependsOn references after resource removal
   */
  updateDependencies(
    template: CloudFormationTemplate,
    removedIds: string[]
  ): DependencyUpdate[] {
    const updates: DependencyUpdate[] = [];
    const removedSet = new Set(removedIds);

    for (const [resourceId, resource] of Object.entries(template.Resources)) {
      if (!resource.DependsOn) continue;

      const before = this.normalizeDependsOn(resource.DependsOn);
      const after = before.filter((dep) => !removedSet.has(dep));

      if (before.length !== after.length) {
        // Update the resource
        if (after.length === 0) {
          delete resource.DependsOn;
        } else if (after.length === 1) {
          resource.DependsOn = after[0];
        } else {
          resource.DependsOn = after;
        }

        updates.push({
          resourceId,
          before,
          after,
          type: 'explicit',
        });
      }
    }

    return updates;
  }

  /**
   * Find all resources that explicitly depend on target (via DependsOn)
   */
  findExplicitDependents(
    template: CloudFormationTemplate,
    targetId: string
  ): string[] {
    const dependents: string[] = [];

    for (const [resourceId, resource] of Object.entries(template.Resources)) {
      if (this.hasExplicitDependency(resource, targetId)) {
        dependents.push(resourceId);
      }
    }

    return dependents;
  }

  /**
   * Find all resources that implicitly depend on target (via Ref, GetAtt, Sub)
   */
  findImplicitDependents(
    template: CloudFormationTemplate,
    targetId: string
  ): string[] {
    const dependents: string[] = [];

    for (const [resourceId, resource] of Object.entries(template.Resources)) {
      if (this.hasImplicitDependency(resource, targetId)) {
        dependents.push(resourceId);
      }
    }

    return dependents;
  }

  /**
   * Find all dependencies of a resource (both explicit and implicit)
   */
  findAllDependencies(
    template: CloudFormationTemplate,
    resourceId: string
  ): string[] {
    const resource = template.Resources[resourceId];
    if (!resource) return [];

    const dependencies = new Set<string>();

    // Add explicit dependencies
    if (resource.DependsOn) {
      const deps = this.normalizeDependsOn(resource.DependsOn);
      deps.forEach((dep) => dependencies.add(dep));
    }

    // Add implicit dependencies
    const implicitDeps = this.findAllReferences(
      resource,
      Object.keys(template.Resources)
    );
    implicitDeps.forEach((dep) => dependencies.add(dep));

    return Array.from(dependencies);
  }

  /**
   * Build a dependency graph from the template
   */
  buildDependencyGraph(
    template: CloudFormationTemplate
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize all resources
    for (const resourceId of Object.keys(template.Resources)) {
      graph.set(resourceId, new Set());
    }

    // Add dependencies
    for (const [resourceId, resource] of Object.entries(template.Resources)) {
      const deps = this.findAllDependencies(template, resourceId);
      graph.set(resourceId, new Set(deps));
    }

    return graph;
  }

  /**
   * Perform topological sort to determine safe removal order
   */
  getRemovalOrder(
    template: CloudFormationTemplate,
    resourceIds: string[]
  ): string[] {
    const graph = this.buildDependencyGraph(template);
    const resourceSet = new Set(resourceIds);

    // Filter graph to only include resources being removed
    const filteredGraph = new Map<string, Set<string>>();
    for (const resourceId of resourceIds) {
      const deps = graph.get(resourceId);
      if (deps) {
        const filteredDeps = new Set(
          Array.from(deps).filter((dep) => resourceSet.has(dep))
        );
        filteredGraph.set(resourceId, filteredDeps);
      } else {
        filteredGraph.set(resourceId, new Set());
      }
    }

    return this.topologicalSort(filteredGraph);
  }

  /**
   * Topological sort using DFS
   */
  private topologicalSort(graph: Map<string, Set<string>>): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string, path: string[] = []): void => {
      if (visited.has(nodeId)) return;

      if (visiting.has(nodeId)) {
        // Circular dependency detected
        const cycle = [...path, nodeId];
        throw new EditorError(
          `Circular dependency detected: ${cycle.join(' -> ')}`,
          EditorErrorCode.CIRCULAR_DEPENDENCY,
          { cycle }
        );
      }

      visiting.add(nodeId);

      const deps = graph.get(nodeId);
      if (deps) {
        Array.from(deps).forEach((dep) => {
          visit(dep, [...path, nodeId]);
        });
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    Array.from(graph.keys()).forEach((nodeId) => {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    });

    return result;
  }

  /**
   * Detect circular dependencies in the graph
   */
  detectCircularDependencies(
    template: CloudFormationTemplate
  ): string[][] {
    const cycles: string[][] = [];
    const graph = this.buildDependencyGraph(template);
    const visited = new Set<string>();
    const recStack: string[] = [];

    const detectCycle = (nodeId: string): boolean => {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        recStack.push(nodeId);

        const deps = graph.get(nodeId);
        if (deps) {
          const depsArray = Array.from(deps);
          for (let i = 0; i < depsArray.length; i++) {
            const dep = depsArray[i];
            if (!visited.has(dep) && detectCycle(dep)) {
              return true;
            } else if (recStack.includes(dep)) {
              // Found cycle
              const cycleStart = recStack.indexOf(dep);
              cycles.push([...recStack.slice(cycleStart), dep]);
              return true;
            }
          }
        }
      }

      recStack.pop();
      return false;
    };

    const nodes = Array.from(graph.keys());
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = nodes[i];
      if (!visited.has(nodeId)) {
        detectCycle(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Check if resource has explicit dependency on target
   */
  private hasExplicitDependency(
    resource: CloudFormationResource,
    targetId: string
  ): boolean {
    if (!resource.DependsOn) return false;
    const deps = this.normalizeDependsOn(resource.DependsOn);
    return deps.includes(targetId);
  }

  /**
   * Check if resource has implicit dependency on target
   */
  private hasImplicitDependency(
    resource: CloudFormationResource,
    targetId: string
  ): boolean {
    const references = this.findAllReferences(resource, [targetId]);
    return references.includes(targetId);
  }

  /**
   * Find all references (Ref, GetAtt, Sub) in a resource
   */
  private findAllReferences(
    obj: any,
    knownResourceIds: string[]
  ): string[] {
    const refs: string[] = [];

    if (!obj || typeof obj !== 'object') return refs;

    // Check for Ref
    if (obj.Ref && typeof obj.Ref === 'string') {
      if (knownResourceIds.includes(obj.Ref)) {
        refs.push(obj.Ref);
      }
    }

    // Check for Fn::GetAtt
    if (obj['Fn::GetAtt']) {
      const getAtt = Array.isArray(obj['Fn::GetAtt'])
        ? obj['Fn::GetAtt'][0]
        : obj['Fn::GetAtt'];
      if (typeof getAtt === 'string' && knownResourceIds.includes(getAtt)) {
        refs.push(getAtt);
      }
    }

    // Check for Fn::Sub
    if (obj['Fn::Sub']) {
      const subString = Array.isArray(obj['Fn::Sub'])
        ? obj['Fn::Sub'][0]
        : obj['Fn::Sub'];
      if (typeof subString === 'string') {
        // Match ${ResourceId} or ${ResourceId.Attribute}
        const regex = /\$\{([^.}]+)/g;
        const matchesArray = Array.from(subString.matchAll(regex));
        for (let i = 0; i < matchesArray.length; i++) {
          const match = matchesArray[i];
          if (knownResourceIds.includes(match[1])) {
            refs.push(match[1]);
          }
        }
      }
    }

    // Recursively search nested objects
    if (Array.isArray(obj)) {
      for (const item of obj) {
        refs.push(...this.findAllReferences(item, knownResourceIds));
      }
    } else if (typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        refs.push(...this.findAllReferences(value, knownResourceIds));
      }
    }

    return refs;
  }

  /**
   * Normalize DependsOn to array format
   */
  private normalizeDependsOn(dependsOn: string | string[]): string[] {
    return Array.isArray(dependsOn) ? dependsOn : [dependsOn];
  }
}
