/**
 * Dependency Graph Builder
 * Builds and analyzes resource dependency graphs
 */

import {
  CloudFormationTemplate,
  CloudFormationResource,
  DependencyGraph,
  Resource,
} from '../../types/migration';

export class DependencyGraphBuilder {
  /**
   * Build a dependency graph from CloudFormation template
   */
  buildDependencyGraph(
    template: CloudFormationTemplate,
    resources: Resource[]
  ): DependencyGraph {
    const nodes = new Map<string, Resource>();
    const edges = new Map<string, Set<string>>();
    const reverseEdges = new Map<string, Set<string>>();

    // Initialize nodes
    for (const resource of resources) {
      nodes.set(resource.logicalId, resource);
      edges.set(resource.logicalId, new Set());
      reverseEdges.set(resource.logicalId, new Set());
    }

    // Build edges from explicit DependsOn
    for (const [logicalId, cfResource] of Object.entries(template.Resources)) {
      if (!nodes.has(logicalId)) continue;

      if (cfResource.DependsOn) {
        const deps = Array.isArray(cfResource.DependsOn)
          ? cfResource.DependsOn
          : [cfResource.DependsOn];

        for (const dep of deps) {
          if (nodes.has(dep)) {
            edges.get(logicalId)!.add(dep);
            reverseEdges.get(dep)!.add(logicalId);
          }
        }
      }

      // Find implicit dependencies from Ref, GetAtt, Sub
      const implicitDeps = this.findImplicitDependencies(
        cfResource,
        Array.from(nodes.keys())
      );
      for (const dep of implicitDeps) {
        if (!edges.get(logicalId)!.has(dep)) {
          edges.get(logicalId)!.add(dep);
          reverseEdges.get(dep)!.add(logicalId);
        }
      }
    }

    // Update resource dependencies
    for (const [logicalId, deps] of edges.entries()) {
      const resource = nodes.get(logicalId);
      if (resource) {
        resource.dependencies = Array.from(deps);
      }
    }

    return { nodes, edges, reverseEdges };
  }

  /**
   * Find all implicit dependencies (Ref, GetAtt, Sub)
   */
  private findImplicitDependencies(
    resource: any,
    knownResourceIds: string[]
  ): string[] {
    const dependencies = new Set<string>();

    const traverse = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      // Check for Ref
      if (obj.Ref && knownResourceIds.includes(obj.Ref)) {
        dependencies.add(obj.Ref);
      }

      // Check for Fn::GetAtt
      if (obj['Fn::GetAtt']) {
        const getAtt = Array.isArray(obj['Fn::GetAtt'])
          ? obj['Fn::GetAtt'][0]
          : obj['Fn::GetAtt'];
        if (typeof getAtt === 'string' && knownResourceIds.includes(getAtt)) {
          dependencies.add(getAtt);
        }
      }

      // Check for Fn::Sub - extract resource references
      if (obj['Fn::Sub']) {
        const subString = Array.isArray(obj['Fn::Sub'])
          ? obj['Fn::Sub'][0]
          : obj['Fn::Sub'];
        if (typeof subString === 'string') {
          // Match ${ResourceId} or ${ResourceId.Attribute}
          const matches = subString.matchAll(/\$\{([^.}]+)/g);
          for (const match of matches) {
            if (knownResourceIds.includes(match[1])) {
              dependencies.add(match[1]);
            }
          }
        }
      }

      // Recursively traverse
      if (Array.isArray(obj)) {
        obj.forEach(traverse);
      } else if (typeof obj === 'object') {
        Object.values(obj).forEach(traverse);
      }
    };

    traverse(resource);
    return Array.from(dependencies);
  }

  /**
   * Perform topological sort on dependency graph
   */
  topologicalSort(graph: DependencyGraph): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        throw new Error(
          `Circular dependency detected involving resource: ${nodeId}`
        );
      }

      visiting.add(nodeId);

      const deps = graph.edges.get(nodeId);
      if (deps) {
        for (const dep of deps) {
          visit(dep);
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return result;
  }

  /**
   * Find all dependents of a resource
   */
  findDependents(graph: DependencyGraph, resourceId: string): string[] {
    const dependents = graph.reverseEdges.get(resourceId);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Find all dependencies of a resource (recursive)
   */
  findAllDependencies(graph: DependencyGraph, resourceId: string): string[] {
    const allDeps = new Set<string>();
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const deps = graph.edges.get(id);
      if (deps) {
        for (const dep of deps) {
          allDeps.add(dep);
          traverse(dep);
        }
      }
    };

    traverse(resourceId);
    return Array.from(allDeps);
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(graph: DependencyGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack: string[] = [];

    const detectCycle = (nodeId: string): boolean => {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        recStack.push(nodeId);

        const deps = graph.edges.get(nodeId);
        if (deps) {
          for (const dep of deps) {
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

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        detectCycle(nodeId);
      }
    }

    return cycles;
  }
}
