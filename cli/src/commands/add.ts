import * as fs from 'fs';
import { Brainfile, findColumnById, findColumnByName, addTask, setTaskContract, type TaskInput, type Task } from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure, missingRequired, operationFailed, columnNotFound, validationError } from '../utils/cli-error';
import { buildContract, normalizeToArray } from '../utils/contractSpec';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

export const ADD_COMMAND_HELP = `
Examples:
  brainfile add --title "Fix login bug" --column todo

Create a task with a contract (for an agent):
  brainfile add -c todo -t "Implement feature" --assignee codex \\
    --with-contract \\
    --deliverable "file:src/feature.ts:Implementation" \\
    --deliverable "test:src/__tests__/feature.test.ts:Unit tests" \\
    --validation "cd core && npm test" \\
    --constraint "Make minimal changes"

Create a task from a template:
  brainfile template --list
  brainfile template --use bugfix --title "Fix login bug" -c todo

Deliverable format:
  type:path:description
  type ∈ file | test | docs | design | research
`.trimEnd();

export interface AddOptions {
  file: string;
  column: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string;
  assignee?: string;
  dueDate?: string;
  subtasks?: string;
  files?: string;
  withContract?: boolean;
  deliverable?: string | string[];
  validation?: string | string[];
  constraint?: string | string[];
}

export interface AddResult {
  success: true;
  taskId: string;
  columnId: string;
}

/**
 * Add a task to a brainfile.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function addCommand(options: AddOptions, logger: Logger = defaultLogger): AddResult {
  // Validate required options
  if (!options.title) {
    throw missingRequired('--title', 'brainfile add --title "Task title" [options]');
  }

  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  // Read and parse the file
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);

  if (!result.board) {
    throw parseFailure(result.error);
  }

  let board = result.board;

  // Find the target column by ID or name
  let targetColumn = findColumnById(board, options.column);
  if (!targetColumn) {
    targetColumn = findColumnByName(board, options.column);
  }

  if (!targetColumn) {
    const availableColumns = board.columns.map(col => `${col.id} (${col.title})`);
    throw columnNotFound(options.column, availableColumns);
  }

  // Build TaskInput with all provided fields
  const taskInput: TaskInput = {
    title: options.title,
    ...(options.description && { description: options.description }),
    ...(options.priority && { priority: options.priority }),
    ...(options.tags && { tags: options.tags.split(',').map(t => t.trim()) }),
    ...(options.assignee && { assignee: options.assignee }),
    ...(options.dueDate && { dueDate: options.dueDate }),
    ...(options.subtasks && { subtasks: options.subtasks.split(',').map(t => t.trim()) }),
    ...(options.files && { relatedFiles: options.files.split(',').map(f => f.trim()) }),
  };

  // Add task using core operation (immutable)
  const addResult = addTask(board, targetColumn.id, taskInput);

  if (!addResult.success) {
    throw operationFailed(addResult.error!);
  }

  board = addResult.board!;

  // Get the new task for display
  const newTask = board.columns
    .find(col => col.id === targetColumn!.id)!
    .tasks[board.columns.find(col => col.id === targetColumn!.id)!.tasks.length - 1];

  // Optionally attach a contract (status=ready)
  const deliverableSpecs = normalizeToArray(options.deliverable);
  const validationCommands = normalizeToArray(options.validation);
  const constraints = normalizeToArray(options.constraint);
  const shouldAttachContract =
    Boolean(options.withContract) ||
    deliverableSpecs.length > 0 ||
    validationCommands.length > 0 ||
    constraints.length > 0;
  if (shouldAttachContract) {
    let contract;
    try {
      contract = buildContract({
        deliverableSpecs,
        validationCommands,
        constraints,
      });
    } catch (e) {
      throw validationError((e as Error).message);
    }

    const contractResult = setTaskContract(board, newTask.id, contract);
    if (!contractResult.success) {
      throw operationFailed(contractResult.error || 'Failed to set task contract');
    }
    board = contractResult.board!;
  }

  // Serialize and write back
  const updatedContent = Brainfile.serialize(board);
  fs.writeFileSync(filePath, updatedContent, 'utf-8');

  // Success message
  logger.log(chalk.green('Task added successfully!'));
  logger.log('');
  logger.log(chalk.gray(`  ID:       ${newTask.id}`));
  logger.log(chalk.gray(`  Title:    ${options.title}`));
  logger.log(chalk.gray(`  Column:   ${targetColumn.title}`));
  if (options.description) {
    logger.log(chalk.gray(`  Desc:     ${options.description.substring(0, 50)}${options.description.length > 50 ? '...' : ''}`));
  }
  if (options.priority) {
    logger.log(chalk.gray(`  Priority: ${options.priority}`));
  }
  if (options.tags) {
    logger.log(chalk.gray(`  Tags:     ${options.tags}`));
  }
  if (options.assignee) {
    logger.log(chalk.gray(`  Assignee: ${options.assignee}`));
  }
  if (options.dueDate) {
    logger.log(chalk.gray(`  Due:      ${options.dueDate}`));
  }
  if (options.subtasks) {
    logger.log(chalk.gray(`  Subtasks: ${options.subtasks.split(',').length} added`));
  }
  if (options.files) {
    logger.log(chalk.gray(`  Files:    ${options.files.split(',').length} linked`));
  }

  return { success: true, taskId: newTask.id, columnId: targetColumn.id };
}
