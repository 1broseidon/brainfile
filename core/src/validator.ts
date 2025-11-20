/**
 * Validator for Brainfile Board objects
 * @packageDocumentation
 */

import { Board, Task, Column, Rule, Subtask } from './types';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
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
}
