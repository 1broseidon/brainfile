import chalk from 'chalk';
import type { Board, Column, Task } from '@brainfile/core';

// ============================================================================
// Exit Codes
// ============================================================================

export const ExitCode = {
  SUCCESS: 0,
  USER_ERROR: 1,        // Invalid input, missing file, validation errors
  WARNING: 0,           // Success with warning (soft errors)
} as const;

export type ExitCodeType = typeof ExitCode[keyof typeof ExitCode];

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PARSE_ERROR = 'PARSE_ERROR',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  COLUMN_NOT_FOUND = 'COLUMN_NOT_FOUND',
  SUBTASK_NOT_FOUND = 'SUBTASK_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED = 'MISSING_REQUIRED',
  OPERATION_FAILED = 'OPERATION_FAILED',
}

// ============================================================================
// Done-Column Detection
// ============================================================================

const DONE_COLUMN_PATTERNS = [
  /^done$/i,
  /^completed?$/i,
  /^finished$/i,
  /^closed$/i,
];

/**
 * Determines if a column represents a "done" or completion state.
 * Used for soft error warnings about incomplete subtasks.
 */
export function isDoneColumn(column: { id: string; title: string }): boolean {
  return DONE_COLUMN_PATTERNS.some(
    pattern => pattern.test(column.id) || pattern.test(column.title)
  );
}

// ============================================================================
// Incomplete Subtasks Check
// ============================================================================

export interface IncompleteSubtasksResult {
  hasIncomplete: boolean;
  completed: number;
  total: number;
  incomplete: Array<{ id: string; title: string }>;
}

/**
 * Checks a task for incomplete subtasks.
 */
export function checkIncompleteSubtasks(task: Task): IncompleteSubtasksResult {
  if (!task.subtasks || task.subtasks.length === 0) {
    return { hasIncomplete: false, completed: 0, total: 0, incomplete: [] };
  }

  const incomplete = task.subtasks
    .filter(st => !st.completed)
    .map(st => ({ id: st.id, title: st.title }));

  const completed = task.subtasks.length - incomplete.length;

  return {
    hasIncomplete: incomplete.length > 0,
    completed,
    total: task.subtasks.length,
    incomplete,
  };
}

/**
 * Prints a warning about incomplete subtasks when moving to a done column.
 * Returns true if warning was printed.
 */
export function getIncompleteSubtasksWarning(
  task: Task,
  targetColumn: { id: string; title: string }
): string | null {
  if (!isDoneColumn(targetColumn)) {
    return null;
  }

  const result = checkIncompleteSubtasks(task);
  if (!result.hasIncomplete) {
    return null;
  }

  const incompleteList = result.incomplete
    .map(st => `      - [ ] ${st.id}: ${st.title}`)
    .join('\n');

  return `Warning: Task has ${result.incomplete.length}/${result.total} incomplete subtasks\n    Incomplete:\n${incompleteList}\n\n    Consider completing subtasks before marking done.`;
}


// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Handles file not found errors with actionable guidance.
 */
export function fileNotFoundError(filePath: string): never {
  console.error(chalk.red(`Error: File not found: ${filePath}`));
  console.error('');
  console.error(chalk.gray('To create a new brainfile, run:'));
  console.error(chalk.cyan('  brainfile init'));
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles brainfile parse errors.
 */
export function parseError(error?: string): never {
  console.error(chalk.red('Error: Failed to parse brainfile'));
  if (error) {
    console.error(chalk.red(error));
  }
  console.error('');
  console.error(chalk.gray('To validate and fix syntax issues, run:'));
  console.error(chalk.cyan('  brainfile lint --fix'));
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles task not found errors with available tasks list.
 */
export function taskNotFoundError(taskId: string, board: Board): never {
  console.error(chalk.red(`Error: Task not found: ${taskId}`));

  const allTasks = board.columns.flatMap(col => col.tasks);
  if (allTasks.length > 0) {
    console.error(chalk.gray('\nAvailable tasks:'));
    board.columns.forEach(col => {
      col.tasks.forEach(task => {
        console.error(chalk.gray(`  - ${task.id}: ${task.title}`));
      });
    });
  }

  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles column not found errors with available columns list.
 */
export function columnNotFoundError(columnId: string, board: Board): never {
  console.error(chalk.red(`Error: Column not found: ${columnId}`));
  console.error(chalk.gray('Available columns:'));
  board.columns.forEach(col => {
    console.error(chalk.gray(`  - ${col.id} (${col.title})`));
  });
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles subtask not found errors with available subtasks list.
 */
export function subtaskNotFoundError(subtaskId: string, task: Task): never {
  console.error(chalk.red(`Error: Subtask not found: ${subtaskId}`));

  if (task.subtasks && task.subtasks.length > 0) {
    console.error(chalk.gray('\nAvailable subtasks:'));
    task.subtasks.forEach(st => {
      const status = st.completed ? chalk.green('[x]') : chalk.gray('[ ]');
      console.error(chalk.gray(`  ${status} ${st.id}: ${st.title}`));
    });
  } else {
    console.error(chalk.gray(`\nTask ${task.id} has no subtasks.`));
  }

  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles missing required option errors with usage example.
 */
export function missingRequiredError(option: string, usage: string): never {
  console.error(chalk.red(`Error: ${option} is required`));
  console.error(chalk.gray(`Usage: ${usage}`));
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles validation errors.
 */
export function validationError(message: string): never {
  console.error(chalk.red(`Error: ${message}`));
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Handles operation failures from core functions.
 */
export function operationError(error: string): never {
  console.error(chalk.red(`Error: ${error}`));
  process.exit(ExitCode.USER_ERROR);
}

/**
 * Generic error handler for catch blocks.
 */
export function handleError(error: unknown): never {
  console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  process.exit(ExitCode.USER_ERROR);
}

// ============================================================================
// MCP Server Error Helpers (return objects instead of exiting)
// ============================================================================

export interface McpError {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

export interface McpWarning {
  warning: string;
  incompleteSubtasks?: IncompleteSubtasksResult;
}

/**
 * Creates an MCP error response.
 */
export function mcpError(message: string): McpError {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Checks for incomplete subtasks warning for MCP responses.
 * Returns warning info if applicable, undefined otherwise.
 */
export function mcpCheckIncompleteSubtasks(
  task: Task,
  targetColumn: { id: string; title: string }
): McpWarning | undefined {
  if (!isDoneColumn(targetColumn)) {
    return undefined;
  }

  const result = checkIncompleteSubtasks(task);
  if (!result.hasIncomplete) {
    return undefined;
  }

  const incompleteList = result.incomplete
    .map(st => `  - [ ] ${st.id}: ${st.title}`)
    .join('\n');

  return {
    warning: `Warning: Task has ${result.incomplete.length}/${result.total} incomplete subtasks:\n${incompleteList}\n\nConsider completing subtasks before marking done.`,
    incompleteSubtasks: result,
  };
}
