/**
 * Parser for Brainfile markdown files with YAML frontmatter
 * @packageDocumentation
 */

import * as yaml from "js-yaml";
import { Board, Column, Brainfile, BrainfileType, RendererType } from "./types";
import { inferType, inferRenderer, SchemaHints } from "./inference";

export interface ParseResult {
  /** Parsed brainfile data (type depends on detected type) */
  data: Brainfile | null;
  /** Detected brainfile type */
  type?: string;
  /** Inferred renderer type */
  renderer?: RendererType;
  /** Legacy board accessor (deprecated, use data instead) */
  board?: Board | null;
  /** Error message if parsing failed */
  error?: string;
  /** Warning messages from parser */
  warnings?: string[];
}

export class BrainfileParser {
  /**
   * Consolidate duplicate columns by merging their tasks
   * @param columns - Array of columns that may contain duplicates
   * @returns Deduplicated array of columns with merged tasks
   */
  private static consolidateDuplicateColumns(columns: Column[]): {
    columns: Column[];
    warnings: string[];
  } {
    const warnings: string[] = [];
    const columnMap = new Map<string, Column>();

    for (const column of columns) {
      const existingColumn = columnMap.get(column.id);

      if (existingColumn) {
        // Duplicate found - merge tasks
        warnings.push(
          `Duplicate column detected: "${column.id}" (title: "${column.title}"). Merging ${column.tasks.length} task(s) into existing column.`
        );
        
        // Merge tasks from duplicate column into existing column
        existingColumn.tasks.push(...column.tasks);
      } else {
        // First occurrence of this column ID
        columnMap.set(column.id, column);
      }
    }

    return {
      columns: Array.from(columnMap.values()),
      warnings
    };
  }

  private static formatDuplicateColumnWarnings(warnings: string[]): string[] {
    if (warnings.length === 0) {
      return [];
    }

    return [
      '[Brainfile Parser] Duplicate columns detected:',
      ...warnings.map((warning) => `  - ${warning}`),
    ];
  }

  private static parseInternal(
    content: string,
    options: { emitWarnings?: boolean; emitErrors?: boolean } = {},
  ): { data: any | null; warnings: string[] } {
    const { emitWarnings = true, emitErrors = true } = options;

    try {
      // Extract YAML frontmatter
      const lines = content.split("\n");

      // Check for frontmatter start
      if (!lines[0]?.trim().startsWith("---")) {
        return { data: null, warnings: [] };
      }

      // Find frontmatter end
      let endIndex = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
          endIndex = i;
          break;
        }
      }

      if (endIndex === -1) {
        return { data: null, warnings: [] };
      }

      // Extract YAML content
      const yamlContent = lines.slice(1, endIndex).join("\n");

      // Parse YAML
      const data = yaml.load(yamlContent) as any;

      let formattedWarnings: string[] = [];

      // Consolidate duplicate columns (for board type compatibility)
      if (data && Array.isArray(data.columns)) {
        const { columns, warnings } = this.consolidateDuplicateColumns(data.columns);
        data.columns = columns;

        formattedWarnings = this.formatDuplicateColumnWarnings(warnings);
        if (emitWarnings) {
          formattedWarnings.forEach((warning) => console.warn(warning));
        }
      }

      return { data, warnings: formattedWarnings };
    } catch (error) {
      if (emitErrors) {
        console.error("Error parsing brainfile.md:", error);
      }
      return { data: null, warnings: [] };
    }
  }

  /**
   * Parse a brainfile.md file content
   * @param content - The markdown content with YAML frontmatter
   * @returns Parsed brainfile data or null if parsing fails
   * @deprecated Use parseWithErrors() for type detection and error details
   */
  static parse(content: string): any | null {
    const { data } = this.parseInternal(content, { emitWarnings: true, emitErrors: true });
    return data;
  }

  /**
   * Parse with detailed error reporting, warnings, and type detection
   * @param content - The markdown content with YAML frontmatter
   * @param filename - Optional filename for type inference
   * @param schemaHints - Optional schema hints for renderer inference
   * @returns ParseResult with data, type, renderer, error message, and any warnings
   */
  static parseWithErrors(content: string, filename?: string, schemaHints?: SchemaHints): ParseResult {
    const { data, warnings } = this.parseInternal(content, {
      emitWarnings: false,
      emitErrors: false,
    });

    if (!data) {
      return {
        data: null,
        board: null,
        error: "Failed to parse YAML frontmatter",
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    // Infer type and renderer
    const detectedType = inferType(data, filename);
    const renderer = inferRenderer(detectedType, data, schemaHints);

    return {
      data,
      type: detectedType,
      renderer,
      board: detectedType === BrainfileType.BOARD || !data.type ? (data as Board) : null,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Find the line number of a task in the file
   * @param content - The markdown content
   * @param taskId - The task ID to find
   * @returns Line and column location or null if not found
   */
  static findTaskLocation(
    content: string,
    taskId: string
  ): { line: number; column: number } | null {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      // Look for lines that contain the task ID
      if (lines[i].includes(`id: ${taskId}`)) {
        // Check if this line starts with a dash followed by id (standard format: - id: task-N)
        if (lines[i].match(/^\s*-\s+id:\s+/)) {
          return { line: i + 1, column: 0 }; // +1 because editors are typically 1-indexed
        }

        // Check if the id is on the next line after a dash (alternative format)
        if (i > 0 && lines[i - 1].match(/^\s*-\s*$/)) {
          return { line: i, column: 0 }; // Return the dash line
        }

        // Default to the line with the id
        return { line: i + 1, column: 0 };
      }
    }

    return null;
  }

  /**
   * Find the line number of a rule in the YAML frontmatter
   * @param content - The markdown content
   * @param ruleId - The rule ID to find
   * @param ruleType - The type of rule (always, never, prefer, context)
   * @returns Line and column location or null if not found
   */
  static findRuleLocation(
    content: string,
    ruleId: number,
    ruleType: "always" | "never" | "prefer" | "context"
  ): { line: number; column: number } | null {
    const lines = content.split("\n");
    let inFrontmatter = false;
    let inRulesSection = false;
    let inRuleTypeSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check for frontmatter boundaries
      if (trimmedLine === "---") {
        if (!inFrontmatter) {
          inFrontmatter = true;
          continue;
        } else {
          // End of frontmatter
          break;
        }
      }

      if (!inFrontmatter) continue;

      // Check if we're in the rules section
      if (trimmedLine === "rules:") {
        inRulesSection = true;
        continue;
      }

      // Check if we're in the specific rule type section
      if (inRulesSection && trimmedLine === `${ruleType}:`) {
        inRuleTypeSection = true;
        continue;
      }

      // If we hit another top-level key, we've left the rules section
      if (inRulesSection && line.match(/^[a-z]+:/) && !line.match(/^\s/)) {
        inRulesSection = false;
        inRuleTypeSection = false;
      }

      // If we're in the rule type section, look for the rule with the matching ID
      if (inRuleTypeSection) {
        // Check if this is a new rule type section within rules
        if (line.match(/^\s{2}[a-z]+:/) && !line.includes(`${ruleType}:`)) {
          inRuleTypeSection = false;
          continue;
        }

        // Look for the rule ID
        if (line.includes(`id: ${ruleId}`)) {
          // Check if this line starts with a dash followed by id (compact format: - id: N)
          if (line.match(/^\s*-\s+id:\s+/)) {
            return { line: i + 1, column: 0 }; // +1 because editors are typically 1-indexed
          }

          // Check if the id is on the next line after a dash (expanded format)
          if (i > 0 && lines[i - 1].match(/^\s*-\s*$/)) {
            return { line: i, column: 0 }; // Return the dash line
          }

          // Default to the line with the id
          return { line: i + 1, column: 0 };
        }
      }
    }

    return null;
  }
}
