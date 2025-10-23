import { ClassifiedResource } from '../../../types';

interface Construct {
  logicalId: string;
  variableName: string;
  code: string;
  groupId: string;
  isStateful: boolean;
  originalIndex: number;
}

interface FormattingResult {
  code: string;
  metrics: {
    totalResources: number;
    totalSections: number;
    linesReduced: number;
  };
}

/**
 * Formats CDK code by organizing into logical sections, sorting constructs,
 * and adding helpful documentation
 */
export class CodeFormatter {
  private resourceMap: Map<string, ClassifiedResource>;

  constructor(private resources: ClassifiedResource[]) {
    this.resourceMap = new Map(
      resources.map(resource => [resource.LogicalId, resource])
    );
  }

  /**
   * Main formatting method - organizes and beautifies code
   */
  public formatCode(code: string): FormattingResult {
    const originalLines = code.split('\n').length;

    // Step 1: Extract all constructs from code
    const constructs = this.extractConstructs(code);

    // Step 2: Group constructs by groupId
    const grouped = this.groupConstructs(constructs);

    // Step 3: Sort each group (stateful first)
    const sorted = new Map<string, Construct[]>();
    for (const [groupId, groupConstructs] of grouped) {
      sorted.set(groupId, this.sortConstructsInGroup(groupConstructs));
    }

    // Step 4: Build formatted code with sections
    let formattedCode = this.buildFormattedCode(code, sorted);

    // Step 5: Optimize blank lines
    formattedCode = this.optimizeBlankLines(formattedCode);

    // Step 6: Organize imports
    formattedCode = this.organizeImports(formattedCode);

    // Step 7: Add summary at the top
    const summary = this.generateSummary(formattedCode);
    formattedCode = this.addSummary(formattedCode, summary);

    const finalLines = formattedCode.split('\n').length;
    const linesReduced = originalLines - finalLines;

    return {
      code: formattedCode,
      metrics: {
        totalResources: constructs.length,
        totalSections: sorted.size,
        linesReduced: Math.max(0, linesReduced)
      }
    };
  }

  /**
   * Extracts construct definitions from code
   */
  private extractConstructs(code: string): Construct[] {
    const constructs: Construct[] = [];
    const seenLogicalIds = new Set<string>();
    const regex = /const\s+(\w+)\s*=\s*new\s+[\w.]+\(this,\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = regex.exec(code)) !== null) {
      const variableName = match[1];
      const logicalId = match[2];

      // Skip duplicates - only keep first occurrence
      if (seenLogicalIds.has(logicalId)) {
        console.log(`⚠️  Skipping duplicate construct: ${logicalId}`);
        continue;
      }
      seenLogicalIds.add(logicalId);

      const resource = this.resourceMap.get(logicalId);

      // Find the full construct definition (until next const or end)
      const startPos = match.index;
      const remainingCode = code.slice(startPos + 1);

      // Fixed regex: allow indentation after newline
      const nextConstMatch = remainingCode.search(/\n\s*const\s+/);

      const endPos = nextConstMatch === -1
        ? code.length
        : (startPos + 1) + nextConstMatch;

      let constructCode = code.slice(startPos, endPos).trim();

      // If this is the last construct, remove any trailing constructor/class closing braces
      if (nextConstMatch === -1) {
        // Remove all trailing closing braces with minimal indentation (may be multiple)
        while (constructCode.match(/\n\s{0,2}\}\s*$/)) {
          constructCode = constructCode.replace(/\n\s{0,2}\}\s*$/, '').trim();
        }
      }

      constructs.push({
        logicalId,
        variableName,
        code: constructCode,
        groupId: resource?.groupId || 'uncategorized',
        isStateful: resource?.isStateful || false,
        originalIndex: index++
      });
    }

    return constructs;
  }

  /**
   * Groups constructs by their groupId
   */
  private groupConstructs(constructs: Construct[]): Map<string, Construct[]> {
    const grouped = new Map<string, Construct[]>();

    for (const construct of constructs) {
      const group = grouped.get(construct.groupId) || [];
      group.push(construct);
      grouped.set(construct.groupId, group);
    }

    return grouped;
  }

  /**
   * Sorts constructs within a group (stateful first, then by original order)
   */
  private sortConstructsInGroup(constructs: Construct[]): Construct[] {
    return [...constructs].sort((a, b) => {
      // Stateful resources first
      if (a.isStateful && !b.isStateful) return -1;
      if (!a.isStateful && b.isStateful) return 1;

      // Within same category, maintain original order
      return a.originalIndex - b.originalIndex;
    });
  }

  /**
   * Generates a section header comment
   */
  private generateSectionHeader(groupId: string, count: number): string {
    const title = this.formatGroupName(groupId);
    return `\n// ========================================\n// ${title} (${count} resource${count !== 1 ? 's' : ''})\n// ========================================\n`;
  }

  /**
   * Formats group name for display
   */
  private formatGroupName(groupId: string): string {
    return groupId
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generates stack summary
   */
  private generateSummary(code: string): string {
    const constructs = this.extractConstructs(code);
    const groups = this.groupConstructs(constructs);

    const totalResources = constructs.length;
    const totalGroups = groups.size;
    const statefulCount = constructs.filter(c => c.isStateful).length;
    const statelessCount = totalResources - statefulCount;

    return `/**
 * Stack Summary
 *
 * Total Resources: ${totalResources}
 * - Stateful: ${statefulCount}
 * - Stateless: ${statelessCount}
 *
 * Resource Groups: ${totalGroups}
 * ${Array.from(groups.entries())
      .map(([group, items]) => ` * - ${this.formatGroupName(group)}: ${items.length}`)
      .join('\n')}
 */\n`;
  }

  /**
   * Optimizes blank lines (max 2 consecutive)
   */
  private optimizeBlankLines(code: string): string {
    // Replace 3+ consecutive newlines with 2
    return code.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Organizes imports: core imports first, then service imports alphabetically
   */
  private organizeImports(code: string): string {
    const lines = code.split('\n');
    const imports: string[] = [];
    const nonImports: string[] = [];

    // Separate imports from rest of code
    for (const line of lines) {
      if (line.trim().startsWith('import ')) {
        imports.push(line);
      } else {
        nonImports.push(line);
      }
    }

    if (imports.length === 0) {
      return code;
    }

    // Remove duplicates by using a Set
    const uniqueImports = Array.from(new Set(imports));

    // Separate imports into categories
    const constructImports = uniqueImports.filter(imp => imp.includes("from 'constructs'"));
    const coreImports = uniqueImports.filter(imp => imp.includes("'aws-cdk-lib'") && !imp.includes('/'));
    const serviceImports = uniqueImports.filter(imp => imp.includes('/aws-'));
    const otherImports = uniqueImports.filter(imp =>
      !imp.includes("from 'constructs'") &&
      !imp.includes("'aws-cdk-lib'") &&
      !imp.includes('/aws-')
    );

    // Sort service imports alphabetically
    serviceImports.sort();

    // Combine: constructs first, then core imports, then service imports, then others
    const organizedImports = [...constructImports, ...coreImports, ...serviceImports, ...otherImports];

    return [...organizedImports, '', ...nonImports].join('\n');
  }

  /**
   * Builds formatted code with section headers
   */
  private buildFormattedCode(originalCode: string, sorted: Map<string, Construct[]>): string {
    // Extract imports
    const lines = originalCode.split('\n');
    const imports = lines.filter(l => l.trim().startsWith('import '));

    // Extract class declaration and constructor
    const classMatch = originalCode.match(/export\s+class\s+(\w+)\s+extends\s+cdk\.Stack\s*\{/);
    const constructorMatch = originalCode.match(/constructor\([^)]+\)\s*\{[^}]*super\([^)]+\);/);

    if (!classMatch || !constructorMatch) {
      // Fallback: return original code structure if we can't find class/constructor
      const allConstructs = Array.from(sorted.values()).flat();
      return [...imports, '', ...allConstructs.map(c => c.code)].join('\n\n');
    }

    const className = classMatch[1];
    const constructorSignature = constructorMatch[0];

    // Build sections
    const sections: string[] = [];
    for (const [groupId, constructs] of sorted) {
      const header = this.generateSectionHeader(groupId, constructs.length);
      const constructsCode = constructs.map(c => c.code).join('\n\n');
      sections.push(header + constructsCode);
    }

    // Add Construct import if not present
    const hasConstructImport = imports.some(imp => imp.includes("from 'constructs'"));
    if (!hasConstructImport) {
      imports.unshift("import { Construct } from 'constructs';");
    }

    // Rebuild with class wrapper
    return `${imports.join('\n')}

export class ${className} extends cdk.Stack {
  ${constructorSignature}

${sections.join('\n\n')}
  }
}
`;
  }

  /**
   * Adds summary to the top of the code (after imports)
   */
  private addSummary(code: string, summary: string): string {
    const lines = code.split('\n');
    const imports: string[] = [];
    const rest: string[] = [];

    let inImports = true;
    for (const line of lines) {
      if (inImports && line.trim().startsWith('import ')) {
        imports.push(line);
      } else {
        inImports = false;
        rest.push(line);
      }
    }

    return [...imports, '', summary, ...rest].join('\n');
  }
}
