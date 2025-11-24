/**
 * Validator for Brainfile objects (all types)
 * @packageDocumentation
 */

import { Board, Task, Column, Rule, Subtask, Journal, JournalEntry, Brainfile, BrainfileType } from './types';
import { inferType } from './inference';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  type?: string;
}

export class BrainfileValidator {
  /**
   * Validate a Board object
   * @param board - The board to validate
   * @returns ValidationResult with any errors found
   */
  static validate(board: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!board) {
      errors.push({ path: '', message: 'Board is null or undefined' });
      return { valid: false, errors };
    }

    // Validate title
    if (typeof board.title !== 'string' || board.title.trim() === '') {
      errors.push({ path: 'title', message: 'Board title must be a non-empty string' });
    }

    // Validate columns
    if (!Array.isArray(board.columns)) {
      errors.push({ path: 'columns', message: 'Columns must be an array' });
    } else {
      board.columns.forEach((column: any, index: number) => {
        const columnErrors = this.validateColumn(column, `columns[${index}]`);
        errors.push(...columnErrors);
      });
    }

    // Validate rules (optional)
    if (board.rules !== undefined) {
      const rulesErrors = this.validateRules(board.rules, 'rules');
      errors.push(...rulesErrors);
    }

    // Validate archive (optional)
    if (board.archive !== undefined) {
      if (!Array.isArray(board.archive)) {
        errors.push({ path: 'archive', message: 'Archive must be an array' });
      } else {
        board.archive.forEach((task: any, index: number) => {
          const taskErrors = this.validateTask(task, `archive[${index}]`);
          errors.push(...taskErrors);
        });
      }
    }

    // Validate statsConfig (optional)
    if (board.statsConfig !== undefined) {
      if (typeof board.statsConfig !== 'object') {
        errors.push({ path: 'statsConfig', message: 'StatsConfig must be an object' });
      } else if (board.statsConfig.columns !== undefined) {
        if (!Array.isArray(board.statsConfig.columns)) {
          errors.push({ path: 'statsConfig.columns', message: 'StatsConfig columns must be an array' });
        } else if (board.statsConfig.columns.length > 4) {
          errors.push({ path: 'statsConfig.columns', message: 'StatsConfig columns must have maximum 4 items' });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a Column object
   * @param column - The column to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateColumn(column: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!column) {
      errors.push({ path, message: 'Column is null or undefined' });
      return errors;
    }

    // Validate id
    if (typeof column.id !== 'string' || column.id.trim() === '') {
      errors.push({ path: `${path}.id`, message: 'Column id must be a non-empty string' });
    }

    // Validate title
    if (typeof column.title !== 'string' || column.title.trim() === '') {
      errors.push({ path: `${path}.title`, message: 'Column title must be a non-empty string' });
    }

    // Validate tasks
    if (!Array.isArray(column.tasks)) {
      errors.push({ path: `${path}.tasks`, message: 'Column tasks must be an array' });
    } else {
      column.tasks.forEach((task: any, index: number) => {
        const taskErrors = this.validateTask(task, `${path}.tasks[${index}]`);
        errors.push(...taskErrors);
      });
    }

    return errors;
  }

  /**
   * Validate a Task object
   * @param task - The task to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateTask(task: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!task) {
      errors.push({ path, message: 'Task is null or undefined' });
      return errors;
    }

    // Validate id
    if (typeof task.id !== 'string' || task.id.trim() === '') {
      errors.push({ path: `${path}.id`, message: 'Task id must be a non-empty string' });
    }

    // Validate title
    if (typeof task.title !== 'string' || task.title.trim() === '') {
      errors.push({ path: `${path}.title`, message: 'Task title must be a non-empty string' });
    }

    // Validate priority (optional)
    if (task.priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(task.priority)) {
        errors.push({
          path: `${path}.priority`,
          message: `Task priority must be one of: ${validPriorities.join(', ')}`
        });
      }
    }

    // Validate template (optional)
    if (task.template !== undefined) {
      const validTemplates = ['bug', 'feature', 'refactor'];
      if (!validTemplates.includes(task.template)) {
        errors.push({
          path: `${path}.template`,
          message: `Task template must be one of: ${validTemplates.join(', ')}`
        });
      }
    }

    // Validate tags (optional)
    if (task.tags !== undefined && !Array.isArray(task.tags)) {
      errors.push({ path: `${path}.tags`, message: 'Task tags must be an array' });
    }

    // Validate relatedFiles (optional)
    if (task.relatedFiles !== undefined && !Array.isArray(task.relatedFiles)) {
      errors.push({ path: `${path}.relatedFiles`, message: 'Task relatedFiles must be an array' });
    }

    // Validate subtasks (optional)
    if (task.subtasks !== undefined) {
      if (!Array.isArray(task.subtasks)) {
        errors.push({ path: `${path}.subtasks`, message: 'Task subtasks must be an array' });
      } else {
        task.subtasks.forEach((subtask: any, index: number) => {
          const subtaskErrors = this.validateSubtask(subtask, `${path}.subtasks[${index}]`);
          errors.push(...subtaskErrors);
        });
      }
    }

    return errors;
  }

  /**
   * Validate a Subtask object
   * @param subtask - The subtask to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateSubtask(subtask: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!subtask) {
      errors.push({ path, message: 'Subtask is null or undefined' });
      return errors;
    }

    // Validate id
    if (typeof subtask.id !== 'string' || subtask.id.trim() === '') {
      errors.push({ path: `${path}.id`, message: 'Subtask id must be a non-empty string' });
    }

    // Validate title
    if (typeof subtask.title !== 'string' || subtask.title.trim() === '') {
      errors.push({ path: `${path}.title`, message: 'Subtask title must be a non-empty string' });
    }

    // Validate completed
    if (typeof subtask.completed !== 'boolean') {
      errors.push({ path: `${path}.completed`, message: 'Subtask completed must be a boolean' });
    }

    return errors;
  }

  /**
   * Validate Rules object
   * @param rules - The rules to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateRules(rules: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!rules) {
      errors.push({ path, message: 'Rules is null or undefined' });
      return errors;
    }

    const ruleTypes = ['always', 'never', 'prefer', 'context'];

    ruleTypes.forEach(ruleType => {
      if (rules[ruleType] !== undefined) {
        if (!Array.isArray(rules[ruleType])) {
          errors.push({ path: `${path}.${ruleType}`, message: `Rules ${ruleType} must be an array` });
        } else {
          rules[ruleType].forEach((rule: any, index: number) => {
            const ruleErrors = this.validateRule(rule, `${path}.${ruleType}[${index}]`);
            errors.push(...ruleErrors);
          });
        }
      }
    });

    return errors;
  }

  /**
   * Validate a Rule object
   * @param rule - The rule to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateRule(rule: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!rule) {
      errors.push({ path, message: 'Rule is null or undefined' });
      return errors;
    }

    // Validate id
    if (typeof rule.id !== 'number') {
      errors.push({ path: `${path}.id`, message: 'Rule id must be a number' });
    }

    // Validate rule
    if (typeof rule.rule !== 'string' || rule.rule.trim() === '') {
      errors.push({ path: `${path}.rule`, message: 'Rule rule must be a non-empty string' });
    }

    return errors;
  }

  /**
   * Validate any brainfile object with type detection
   * @param data - The brainfile data to validate
   * @param filename - Optional filename for type inference
   * @returns ValidationResult with type and any errors found
   */
  static validateBrainfile(data: any, filename?: string): ValidationResult {
    if (!data) {
      return {
        valid: false,
        errors: [{ path: '', message: 'Data is null or undefined' }]
      };
    }

    // Infer type
    const type = inferType(data, filename);

    // Validate base fields (common to all types)
    const errors: ValidationError[] = [];

    if (typeof data.title !== 'string' || data.title.trim() === '') {
      errors.push({ path: 'title', message: 'Title must be a non-empty string' });
    }

    // Type-specific validation
    if (type === BrainfileType.BOARD || (!type && data.columns)) {
      errors.push(...this.validate(data as Board).errors);
    } else if (type === BrainfileType.JOURNAL || data.entries) {
      errors.push(...this.validateJournal(data as Journal).errors);
    }
    // Add more type-specific validators as types are implemented
    // else if (type === BrainfileType.COLLECTION) { ... }
    // else if (type === BrainfileType.CHECKLIST) { ... }
    // else if (type === BrainfileType.DOCUMENT) { ... }

    return {
      valid: errors.length === 0,
      errors,
      type
    };
  }

  /**
   * Validate a Journal object
   * @param journal - The journal to validate
   * @returns ValidationResult with any errors found
   */
  static validateJournal(journal: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!journal) {
      errors.push({ path: '', message: 'Journal is null or undefined' });
      return { valid: false, errors };
    }

    // Validate title
    if (typeof journal.title !== 'string' || journal.title.trim() === '') {
      errors.push({ path: 'title', message: 'Journal title must be a non-empty string' });
    }

    // Validate entries
    if (!Array.isArray(journal.entries)) {
      errors.push({ path: 'entries', message: 'Entries must be an array' });
    } else {
      journal.entries.forEach((entry: any, index: number) => {
        const entryErrors = this.validateJournalEntry(entry, `entries[${index}]`);
        errors.push(...entryErrors);
      });
    }

    // Validate rules (optional)
    if (journal.rules !== undefined) {
      const rulesErrors = this.validateRules(journal.rules, 'rules');
      errors.push(...rulesErrors);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a JournalEntry object
   * @param entry - The entry to validate
   * @param path - The path for error reporting
   * @returns Array of validation errors
   */
  static validateJournalEntry(entry: any, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!entry) {
      errors.push({ path, message: 'Entry is null or undefined' });
      return errors;
    }

    // Validate id
    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      errors.push({ path: `${path}.id`, message: 'Entry id must be a non-empty string' });
    }

    // Validate title
    if (typeof entry.title !== 'string' || entry.title.trim() === '') {
      errors.push({ path: `${path}.title`, message: 'Entry title must be a non-empty string' });
    }

    // Validate createdAt (required for journal entries)
    if (typeof entry.createdAt !== 'string' || entry.createdAt.trim() === '') {
      errors.push({ path: `${path}.createdAt`, message: 'Entry createdAt must be an ISO 8601 timestamp string' });
    }

    // Validate optional fields
    if (entry.content !== undefined && typeof entry.content !== 'string') {
      errors.push({ path: `${path}.content`, message: 'Entry content must be a string' });
    }

    if (entry.summary !== undefined && typeof entry.summary !== 'string') {
      errors.push({ path: `${path}.summary`, message: 'Entry summary must be a string' });
    }

    if (entry.mood !== undefined && typeof entry.mood !== 'string') {
      errors.push({ path: `${path}.mood`, message: 'Entry mood must be a string' });
    }

    if (entry.tags !== undefined && !Array.isArray(entry.tags)) {
      errors.push({ path: `${path}.tags`, message: 'Entry tags must be an array' });
    }

    return errors;
  }
}
