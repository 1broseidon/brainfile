import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findColumnById,
  findColumnByName,
  addTask,
  setTaskContract,
  writeTaskFile,
  readTaskFile,
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
  shouldSuggestV2Migration,
  markV2MigrationHintShown,
} from '../utils/v2-detect';
import { validateType } from '../utils/strict-validation';
import { lintValidationCommands } from '../validation/command-lint';

export const ADD_COMMAND_HELP = `
Examples:
  brainfile add --title "Fix login bug" --column todo

Create a task with a draft contract (daemon will ignore until activated):
  brainfile add -c todo -t "Implement feature" --assignee codex \\
    --with-contract \\
    --deliverable "file:src/feature.ts:Implementation" \\
    --deliverable "test:src/__tests__/feature.test.ts:Unit tests" \\
    --validation "cd core && npm test" \\
    --constraint "Make minimal changes"

Create a task with a ready contract (immediately dispatchable):
  brainfile add -c todo -t "Implement feature" --assignee codex \\
    --with-contract --ready \\
    --deliverable "file:src/feature.ts:Implementation"

Create a parent task and children in one shot:
  brainfile add -c todo -t "Auth epic" --type epic \
    --child "OAuth flow" --child "Session hardening"

Attach to an existing parent:
  brainfile add -c todo -t "OAuth flow" --parent epic-1

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
  type?: string;
  parent?: string;
  child?: string | string[];
  withContract?: boolean;
  /** When true, created contract is status=ready instead of the default draft */
  ready?: boolean;
  deliverable?: string | string[];
  validation?: string | string[];
  constraint?: string | string[];
}

export interface AddResult {
  success: true;
  taskId: string;
  columnId: string;
}

function findActiveTaskById(boardDir: string, taskId: string): Task | null {
  const direct = readTaskFile(path.join(boardDir, taskFileName(taskId)));
  if (direct && direct.task.id === taskId) return direct.task;

  const docs = readTasksDir(boardDir);
  const found = docs.find((doc) => doc.task.id === taskId);
  return found?.task || null;
}

function nextPositionForColumn(boardDir: string, columnId: string): number {
  return readTasksDir(boardDir).filter((doc) => doc.task.column === columnId).length;
}

function createV2TaskFile(
  dirs: { boardDir: string; logsDir: string },
  input: {
    title: string;
    columnId: string;
    type?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    tags?: string[];
    assignee?: string;
    dueDate?: string;
    relatedFiles?: string[];
    subtaskTitles?: string[];
    parentId?: string;
    contract?: unknown;
  },
): Task {
  const typePrefix = input.type || 'task';
  const taskId = generateNextFileTaskId(dirs.boardDir, dirs.logsDir, typePrefix);
  const position = nextPositionForColumn(dirs.boardDir, input.columnId);

  const subtasks = input.subtaskTitles?.map((title, index) => ({
    id: `${taskId}-${index + 1}`,
    title: title.trim(),
    completed: false,
  })).filter((subtask) => subtask.title.length > 0);

  const task: Task & { parentId?: string } = {
    id: taskId,
    title: input.title,
    ...(input.type && input.type !== 'task' && { type: input.type }),
    column: input.columnId,
    position,
    ...(input.priority && { priority: input.priority }),
    ...(input.tags && input.tags.length > 0 && { tags: input.tags }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.dueDate && { dueDate: input.dueDate }),
    ...(input.relatedFiles && input.relatedFiles.length > 0 && { relatedFiles: input.relatedFiles }),
    ...(subtasks && subtasks.length > 0 && { subtasks }),
    ...(input.parentId && input.parentId.trim().length > 0 && { parentId: input.parentId.trim() }),
    ...(input.contract ? { contract: input.contract as any } : {}),
    createdAt: new Date().toISOString(),
  };

  const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
  writeTaskFile(taskPath, task, composeBody(input.description));
  return task;
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
  const typeName = options.type || 'task';
  const typeValidation = validateType(board, typeName);
  if (!typeValidation.valid) {
    throw new CLIError(typeValidation.error || `Invalid type: ${typeName}`);
  }

  // Find target column
  let targetColumn = board.columns.find(c => c.id === options.column);
  if (!targetColumn) {
    targetColumn = board.columns.find(c => c.title.toLowerCase() === options.column.toLowerCase());
  }
  if (!targetColumn) {
    const availableColumns = board.columns.map(col => `${col.id} (${col.title})`);
    throw columnNotFound(options.column, availableColumns);
  }

  const parentId = options.parent?.trim();
  if (parentId) {
    const parentTask = findActiveTaskById(dirs.boardDir, parentId);
    if (!parentTask) {
      logger.warn(chalk.yellow(`Warning: parent task ${parentId} not found in board/. Creating task anyway.`));
    }
  }

  // Build and attach contract if requested
  const deliverableSpecs = normalizeToArray(options.deliverable);
  const validationCommands = normalizeToArray(options.validation);
  for (const warning of lintValidationCommands(validationCommands, filePath)) {
    logger.warn(chalk.yellow(`Warning: ${warning.message}`));
  }
  const constraints = normalizeToArray(options.constraint);
  const shouldAttachContract =
    Boolean(options.withContract) ||
    deliverableSpecs.length > 0 ||
    validationCommands.length > 0 ||
    constraints.length > 0;

  let contract: unknown;
  if (shouldAttachContract) {
    try {
      contract = buildContract({
        deliverableSpecs,
        validationCommands,
        constraints,
        status: options.ready ? 'ready' : 'draft',
      });
    } catch (e) {
      throw validationError((e as Error).message);
    }
  }

  const parentTask = createV2TaskFile(dirs, {
    title: options.title!,
    columnId: targetColumn.id,
    type: options.type,
    description: options.description,
    priority: options.priority,
    tags: options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    assignee: options.assignee,
    dueDate: options.dueDate,
    relatedFiles: options.files ? options.files.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    subtaskTitles: options.subtasks ? options.subtasks.split(',').map((title) => title.trim()) : undefined,
    parentId,
    contract,
  });

  const childTitles = normalizeToArray(options.child).map((title) => title.trim()).filter(Boolean);
  const createdChildren: Task[] = [];

  for (const childTitle of childTitles) {
    const childTask = createV2TaskFile(dirs, {
      title: childTitle,
      columnId: targetColumn.id,
      parentId: parentTask.id,
    });
    createdChildren.push(childTask);
  }

  // Success message
  logAddSuccess(options, parentTask.id, targetColumn.title, logger, createdChildren);

  return { success: true, taskId: parentTask.id, columnId: targetColumn.id };
}

function addCommandV1(options: AddOptions, filePath: string, logger: Logger): AddResult {
  // Read and parse the file
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);

  if (!result.board) {
    throw parseFailure(result.error);
  }

  let board = result.board;

  if (options.parent) {
    logger.warn(chalk.yellow('Warning: --parent is only supported in v2 per-task file architecture. Ignoring for v1 board.'));
  }
  if (normalizeToArray(options.child).length > 0) {
    logger.warn(chalk.yellow('Warning: --child is only supported in v2 per-task file architecture. Ignoring for v1 board.'));
  }

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

  // Optionally attach a contract (default status=draft; --ready makes it immediately dispatchable)
  const deliverableSpecs = normalizeToArray(options.deliverable);
  const validationCommands = normalizeToArray(options.validation);
  for (const warning of lintValidationCommands(validationCommands, filePath)) {
    logger.warn(chalk.yellow(`Warning: ${warning.message}`));
  }
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
        status: options.ready ? 'ready' : 'draft',
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

  // Show one-time migration hint for legacy/mixed layouts
  if (shouldSuggestV2Migration(filePath)) {
    logger.log('');
    logger.log(
      chalk.yellow('⚠ Legacy brainfile layout detected. ') +
      chalk.gray('Run ') +
      chalk.cyan('brainfile migrate') +
      chalk.gray(' to upgrade to the v2 board/logs structure.')
    );
    markV2MigrationHintShown(filePath);
  }

  return { success: true, taskId: newTask.id, columnId: targetColumn.id };
}

function logAddSuccess(
  options: AddOptions,
  taskId: string,
  columnTitle: string,
  logger: Logger,
  createdChildren: Task[] = [],
): void {
  logger.log(chalk.green('Task added successfully!'));
  logger.log('');
  logger.log(chalk.gray(`  ID:       ${taskId}`));
  logger.log(chalk.gray(`  Title:    ${options.title}`));
  logger.log(chalk.gray(`  Column:   ${columnTitle}`));
  if (options.type && options.type !== 'task') {
    logger.log(chalk.gray(`  Type:     ${options.type}`));
  }
  if (options.parent) {
    logger.log(chalk.gray(`  Parent:   ${options.parent}`));
  }
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
  if (createdChildren.length > 0) {
    logger.log(chalk.gray(`  Children: ${createdChildren.length} created`));
    for (const child of createdChildren) {
      logger.log(chalk.gray(`    - ${child.id}: ${child.title}`));
    }
  }
}
