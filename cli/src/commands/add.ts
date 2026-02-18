import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findColumnById,
  findColumnByName,
  addTask,
  setTaskContract,
  writeTaskFile,
  readTasksDir,
  generateNextFileTaskId,
  taskFileName,
  type TaskInput,
  type Task,
} from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure, missingRequired, operationFailed, columnNotFound, validationError } from '../utils/cli-error';
import { buildContract, normalizeToArray } from '../utils/contractSpec';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import {
  isV2,
  ensureV2Dirs,
  readV2BoardConfig,
  composeBody,
} from '../utils/v2-detect';

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

  // Detect v2 per-task file architecture
  if (isV2(filePath)) {
    return addCommandV2(options, filePath, logger);
  }

  return addCommandV1(options, filePath, logger);
}

function addCommandV2(options: AddOptions, filePath: string, logger: Logger): AddResult {
  const dirs = ensureV2Dirs(filePath);
  const board = readV2BoardConfig(filePath);

  // Find target column
  let targetColumn = board.columns.find(c => c.id === options.column);
  if (!targetColumn) {
    targetColumn = board.columns.find(c => c.title.toLowerCase() === options.column.toLowerCase());
  }
  if (!targetColumn) {
    const availableColumns = board.columns.map(col => `${col.id} (${col.title})`);
    throw columnNotFound(options.column, availableColumns);
  }

  // Generate new task ID
  const taskId = generateNextFileTaskId(dirs.tasksDir, dirs.logsDir);

  // Calculate position (append to end of column)
  const existingTasks = readTasksDir(dirs.tasksDir)
    .filter(t => t.task.column === targetColumn!.id);
  const position = existingTasks.length;

  // Build subtasks
  let subtasks: Array<{ id: string; title: string; completed: boolean }> | undefined;
  if (options.subtasks) {
    subtasks = options.subtasks.split(',').map((title, i) => ({
      id: `${taskId}-${i + 1}`,
      title: title.trim(),
      completed: false,
    }));
  }

  // Build task
  const task: Task = {
    id: taskId,
    title: options.title!,
    column: targetColumn.id,
    position,
    ...(options.priority && { priority: options.priority }),
    ...(options.tags && { tags: options.tags.split(',').map(t => t.trim()) }),
    ...(options.assignee && { assignee: options.assignee }),
    ...(options.dueDate && { dueDate: options.dueDate }),
    ...(options.files && { relatedFiles: options.files.split(',').map(f => f.trim()) }),
    ...(subtasks && { subtasks }),
    createdAt: new Date().toISOString(),
  };

  // Build and attach contract if requested
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
    task.contract = contract;
  }

  // Write task file
  const taskPath = path.join(dirs.tasksDir, taskFileName(taskId));
  const body = composeBody(options.description);
  writeTaskFile(taskPath, task, body);

  // Success message
  logAddSuccess(options, taskId, targetColumn.title, logger);

  return { success: true, taskId, columnId: targetColumn.id };
}

function addCommandV1(options: AddOptions, filePath: string, logger: Logger): AddResult {
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
    title: options.title!,
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
  logAddSuccess(options, newTask.id, targetColumn.title, logger);

  return { success: true, taskId: newTask.id, columnId: targetColumn.id };
}

function logAddSuccess(options: AddOptions, taskId: string, columnTitle: string, logger: Logger): void {
  logger.log(chalk.green('Task added successfully!'));
  logger.log('');
  logger.log(chalk.gray(`  ID:       ${taskId}`));
  logger.log(chalk.gray(`  Title:    ${options.title}`));
  logger.log(chalk.gray(`  Column:   ${columnTitle}`));
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
}
