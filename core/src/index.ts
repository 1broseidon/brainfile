/**
 * @brainfile/core - Core library for the Brainfile task management protocol
 *
 * This library provides parsing, serialization, validation, and template management
 * for Brainfile markdown files with YAML frontmatter.
 *
 * @packageDocumentation
 */

// Export types
export * from './types';

// Export parser
export { BrainfileParser, ParseResult } from './parser';

// Export inference functions
export { inferType, inferRenderer, SchemaHints } from './inference';

// Export schema hints parser
export { parseSchemaHints, loadSchemaHints } from './schemaHints';

// Export serializer
export { BrainfileSerializer, SerializeOptions } from './serializer';

// Export validator
export { BrainfileValidator, ValidationError, ValidationResult } from './validator';

// Export linter
export { BrainfileLinter, LintIssue, LintResult, LintOptions } from './linter';

// Export realtime helpers
export {
  diffBoards,
  hashBoard,
  hashBoardContent,
  type BoardDiff,
  type ColumnDiff,
  type TaskDiff
} from './realtime';

// Export templates
export {
  BUILT_IN_TEMPLATES,
  generateTaskId,
  generateSubtaskId,
  processTemplate,
  getTemplateById,
  getAllTemplateIds
} from './templates';

// Re-export commonly used interfaces for convenience
export type {
  Board,
  Column,
  Task,
  Subtask,
  Rule,
  Rules,
  TaskTemplate,
  TemplateVariable,
  TemplateConfig
} from './types';

/**
 * Main Brainfile class providing a high-level API
 */
export class Brainfile {
  /**
   * Parse a brainfile.md file content
   * @param content - The markdown content with YAML frontmatter
   * @returns Parsed Board object or null if parsing fails
   */
  static parse(content: string) {
    return BrainfileParser.parse(content);
  }

  /**
   * Parse with detailed error reporting
   * @param content - The markdown content with YAML frontmatter
   * @returns ParseResult with board or error message
   */
  static parseWithErrors(content: string) {
    return BrainfileParser.parseWithErrors(content);
  }

  /**
   * Serialize a Board object back to brainfile.md format
   * @param board - The Board object to serialize
   * @param options - Optional serialization options
   * @returns Markdown string with YAML frontmatter
   */
  static serialize(board: Board, options?: SerializeOptions) {
    return BrainfileSerializer.serialize(board, options);
  }

  /**
   * Validate a Board object
   * @param board - The board to validate
   * @returns ValidationResult with any errors found
   */
  static validate(board: any) {
    return BrainfileValidator.validate(board);
  }

  /**
   * Lint a brainfile.md content string
   * @param content - The markdown content with YAML frontmatter
   * @param options - Linting options
   * @returns LintResult with issues and optionally fixed content
   */
  static lint(content: string, options?: LintOptions) {
    return BrainfileLinter.lint(content, options);
  }

  /**
   * Get all built-in templates
   * @returns Array of built-in templates
   */
  static getBuiltInTemplates() {
    return BUILT_IN_TEMPLATES;
  }

  /**
   * Get a template by ID
   * @param id - The template ID
   * @returns The template or undefined if not found
   */
  static getTemplate(id: string) {
    return getTemplateById(id);
  }

  /**
   * Create a task from a template
   * @param templateId - The template ID
   * @param values - Variable values to substitute
   * @returns A partial Task object
   */
  static createFromTemplate(templateId: string, values: Record<string, string>) {
    const template = getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return processTemplate(template, values);
  }

  /**
   * Find the location of a task in the file content
   * @param content - The markdown content
   * @param taskId - The task ID to find
   * @returns Line and column location or null if not found
   */
  static findTaskLocation(content: string, taskId: string) {
    return BrainfileParser.findTaskLocation(content, taskId);
  }

  /**
   * Find the location of a rule in the file content
   * @param content - The markdown content
   * @param ruleId - The rule ID to find
   * @param ruleType - The type of rule
   * @returns Line and column location or null if not found
   */
  static findRuleLocation(
    content: string,
    ruleId: number,
    ruleType: "always" | "never" | "prefer" | "context"
  ) {
    return BrainfileParser.findRuleLocation(content, ruleId, ruleType);
  }
}

// Import necessary types for the Brainfile class
import { Board, SerializeOptions } from './index';
import { BrainfileParser } from './parser';
import { BrainfileSerializer } from './serializer';
import { BrainfileValidator } from './validator';
import { BrainfileLinter, LintOptions } from './linter';
import { BUILT_IN_TEMPLATES, getTemplateById, processTemplate } from './templates';
