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

// Export contract types (optional task extension) and operations
export * from './types/contract';
export {
  type ContractPatch,
  setTaskContract,
  clearTaskContract,
  setTaskContractStatus,
  patchTaskContract,
  addTaskContractDeliverable,
  removeTaskContractDeliverable,
  addTaskContractValidationCommand,
  removeTaskContractValidationCommand,
  addTaskContractConstraint,
  removeTaskContractConstraint,
} from './contract';

// Export parser
export { BrainfileParser } from './parser';
export type { ParseResult } from './parser';

// Export inference functions
export { inferType, inferRenderer } from './inference';
export type { SchemaHints } from './inference';

// Export schema hints parser
export { parseSchemaHints, loadSchemaHints } from './schemaHints';

// Export serializer
export { BrainfileSerializer } from './serializer';
export type { SerializeOptions } from './serializer';

// Export validator
export { BrainfileValidator } from './validator';
export type { ValidationError, ValidationResult } from './validator';

// Export linter
export { BrainfileLinter } from './linter';
export type { LintIssue, LintResult, LintOptions } from './linter';

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

// Export board operations
export {
  type BoardOperationResult,
  type BulkOperationResult,
  type BulkItemResult,
  type TaskInput,
  type TaskPatch,
  moveTask,
  addTask,
  updateTask,
  deleteTask,
  toggleSubtask,
  updateBoardTitle,
  updateStatsConfig,
  archiveTask,
  restoreTask,
  patchTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  setSubtasksCompleted,
  setAllSubtasksCompleted,
  // Bulk operations
  moveTasks,
  patchTasks,
  deleteTasks,
  archiveTasks,
  // Rule operations
  addRule,
  deleteRule,
} from './operations';

// Export strict board validation helpers
export {
  getBoardTypes,
  validateType,
  validateColumn,
  type BoardValidationResult,
} from './boardValidation';

// Export query functions
export {
  findColumnById,
  findColumnByName,
  findTaskById,
  taskIdExists,
  getAllTasks,
  getTasksByTag,
  getTasksByPriority,
  getTasksByAssignee,
  searchTasks,
  getColumnTaskCount,
  getTotalTaskCount,
  columnExists,
  findCompletionColumn,
  isCompletionColumn,
  getTasksWithIncompleteSubtasks,
  getOverdueTasks
} from './query';

// Export ID generation utilities
export {
  extractTaskIdNumber,
  getMaxTaskIdNumber,
  generateNextTaskId,
  generateSubtaskId as generateSubtaskIdFromIndex,
  generateNextSubtaskId,
  isValidTaskId,
  isValidSubtaskId,
  getParentTaskId
} from './idGen';

// Export discovery utilities
export {
  discover,
  findPrimaryBrainfile,
  findNearestBrainfile,
  watchBrainfiles,
  isBrainfileName,
  extractBrainfileSuffix,
  BRAINFILE_PATTERNS,
  BRAINFILE_GLOBS,
  EXCLUDE_DIRS,
  type DiscoveredFile,
  type DiscoveryOptions,
  type DiscoveryResult,
  type WatchError,
  type WatchResult,
} from './discovery';

// Export filesystem helpers (brainfile path resolution + .brainfile helpers)
export {
  findBrainfile,
  resolveBrainfilePath,
  getBrainfileStateDir,
  getBrainfileStatePath,
  getDotBrainfileGitignorePath,
  ensureDotBrainfileDir,
  ensureDotBrainfileGitignore,
  DOT_BRAINFILE_DIRNAME,
  BRAINFILE_BASENAME,
  BRAINFILE_STATE_BASENAME,
  DOT_BRAINFILE_GITIGNORE_BASENAME,
  type FoundBrainfile,
  type BrainfileResolutionKind,
  type ResolveBrainfilePathOptions,
} from './utils/files';

// Export formatters for external services
export {
  formatTaskForGitHub,
  formatTaskForLinear,
  type GitHubIssuePayload,
  type GitHubFormatOptions,
  type LinearIssuePayload,
  type LinearFormatOptions,
} from './formatters';

// Export task file reader/writer (v2 per-task file architecture)
export {
  parseTaskContent,
  serializeTaskContent,
  readTaskFile,
  writeTaskFile,
  readTasksDir,
  taskFileName,
} from './taskFile';

// Export file-based task operations (v2 per-task file architecture)
export {
  type TaskOperationResult,
  type TaskFileInput,
  type TaskFilters,
  generateNextFileTaskId,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  deleteTaskFile,
  appendLog,
  listTasks,
  findTask,
  searchTaskFiles,
  searchLogs,
} from './taskOperations';

// Export v2 workspace helpers (directory detection, board reconstruction, body helpers)
export {
  type V2Dirs,
  getV2Dirs,
  isV2,
  ensureV2Dirs,
  getTaskFilePath,
  getLogFilePath,
  findV2Task,
  extractDescription,
  extractLog,
  composeBody,
  readV2BoardConfig,
  buildBoardFromV2,
} from './workspace';

// Re-export commonly used interfaces for convenience
export type {
  Board,
  BoardConfig,
  Column,
  ColumnConfig,
  Task,
  TaskDocument,
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
import type { Board } from './types';
import type { SerializeOptions } from './serializer';
import { BrainfileParser } from './parser';
import { BrainfileSerializer } from './serializer';
import { BrainfileValidator } from './validator';
import { BrainfileLinter } from './linter';
import type { LintOptions } from './linter';
import { BUILT_IN_TEMPLATES, getTemplateById, processTemplate } from './templates';
