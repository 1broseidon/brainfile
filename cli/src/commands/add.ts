import {
  addTaskFile,
  parentFit,
  resolveDocType,
  type Contract,
  type Task,
  type TypesConfig,
} from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, missingRequired, columnNotFound, validationError, operationFailed } from '../utils/cli-error';
import { buildContract, normalizeToArray } from '@brainfile/core';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import {
  ensureV2Dirs,
  composeBody,
} from '../utils/v2-detect';
import { assertV2Brainfile } from '../utils/v2-only';
import { validateType } from '@brainfile/core';
import { lintValidationCommands } from '../validation/command-lint';
import { checkLinks, readBoardGraph, splitIds } from '../utils/graph';

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

Attach to an existing parent (the defaults: epic holds spec, plan and task;
spec holds plan and task; plan holds task; task holds task):
  brainfile add -t "Token refresh" --type spec --parent epic-1
  brainfile add -t "OAuth flow" --parent spec-1

Record a decision (no column, never completed) and work that rests on it:
  brainfile add -t "Use SQLite for the index" --type decision
  brainfile add -t "Build the index" --decisions decision-1

Types: epic, spec, plan, task (alias issue) and decision (alias adr) are built
in; see brainfile types for these and the board's own.

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
  /** Comma-separated IDs of tasks that come first. */
  dependsOn?: string;
  /** Comma-separated IDs of the decisions this work rests on. */
  decisions?: string;
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

function createV2TaskFile(
  dirs: { boardDir: string; logsDir: string },
  types: TypesConfig | undefined,
  input: {
    title: string;
    columnId?: string;
    type?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    tags?: string[];
    assignee?: string;
    dueDate?: string;
    relatedFiles?: string[];
    subtaskTitles?: string[];
    parentId?: string;
    dependsOn?: string[];
    decisions?: string[];
    contract?: Contract;
  },
): Task {
  const result = addTaskFile(
    dirs.boardDir,
    {
      title: input.title,
      column: input.columnId,
      ...(input.type && { type: input.type }),
      priority: input.priority,
      tags: input.tags,
      assignee: input.assignee,
      dueDate: input.dueDate,
      relatedFiles: input.relatedFiles,
      subtasks: input.subtaskTitles?.map((t) => t.trim()).filter(Boolean),
      parentId: input.parentId,
      dependsOn: input.dependsOn,
      decisions: input.decisions,
      contract: input.contract,
    },
    composeBody(input.description),
    dirs.logsDir,
    { types },
  );

  if (!result.success || !result.task) {
    throw operationFailed(result.error || `Failed to create task: ${input.title}`);
  }

  return result.task;
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

  assertV2Brainfile(filePath);
  return addCommandV2(options, filePath, logger);
}

function addCommandV2(options: AddOptions, filePath: string, logger: Logger): AddResult {
  const dirs = ensureV2Dirs(filePath);
  const boardGraph = readBoardGraph(filePath);
  const board = boardGraph.config;
  if (!board) {
    throw operationFailed(`Failed to parse brainfile: ${filePath}`);
  }
  const typeName = options.type || 'task';
  const typeValidation = validateType(board, typeName);
  if (!typeValidation.valid) {
    throw new CLIError(typeValidation.error || `Invalid type: ${typeName}`);
  }
  const docType = resolveDocType(typeName, board.types);
  const isDecision = docType.role === 'decision';

  // Find target column. A decision has none (spec-12).
  let targetColumn = isDecision ? undefined : board.columns.find(c => c.id === options.column);
  if (!isDecision && !targetColumn) {
    targetColumn = board.columns.find(c => c.title.toLowerCase() === options.column.toLowerCase());
  }
  if (!isDecision && !targetColumn) {
    const availableColumns = board.columns.map(col => `${col.id} (${col.title})`);
    throw columnNotFound(options.column, availableColumns);
  }

  const parentId = options.parent?.trim() || undefined;
  const dependsOn = splitIds(options.dependsOn);
  const decisions = splitIds(options.decisions);
  checkLinks(boardGraph, {
    type: typeName,
    ...(parentId && { parentId }),
    ...(dependsOn.length > 0 && { dependsOn }),
    ...(decisions.length > 0 && { decisions }),
  }, logger);

  const childTitles = normalizeToArray(options.child).map((title) => title.trim()).filter(Boolean);
  if (childTitles.length > 0) {
    const fit = parentFit('task', typeName, board.types);
    if (!fit.fits) {
      const message = `children of the new ${docType.name}: ${fit.reason}`;
      if (board.strict === true) throw new CLIError(`${message} (refused on a strict board)`);
      logger.warn(chalk.yellow(`Warning: ${message}`));
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

  let contract: Contract | undefined;
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

  const parentTask = createV2TaskFile(dirs, board.types, {
    title: options.title!,
    columnId: targetColumn?.id,
    type: options.type,
    description: options.description,
    priority: options.priority,
    tags: options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    assignee: options.assignee,
    dueDate: options.dueDate,
    relatedFiles: options.files ? options.files.split(',').map((f) => f.trim()).filter(Boolean) : undefined,
    subtaskTitles: options.subtasks ? options.subtasks.split(',').map((title) => title.trim()) : undefined,
    parentId,
    dependsOn,
    decisions,
    contract,
  });

  const createdChildren: Task[] = [];

  for (const childTitle of childTitles) {
    const childTask = createV2TaskFile(dirs, board.types, {
      title: childTitle,
      columnId: targetColumn?.id ?? board.columns[0]?.id,
      parentId: parentTask.id,
    });
    createdChildren.push(childTask);
  }

  // Success message
  logAddSuccess(options, parentTask, targetColumn?.title, logger, createdChildren);

  return { success: true, taskId: parentTask.id, columnId: targetColumn?.id ?? '' };
}

function logAddSuccess(
  options: AddOptions,
  task: Task,
  columnTitle: string | undefined,
  logger: Logger,
  createdChildren: Task[] = [],
): void {
  logger.log(chalk.green(columnTitle === undefined ? 'Decision added successfully!' : 'Task added successfully!'));
  logger.log('');
  logger.log(chalk.gray(`  ID:       ${task.id}`));
  logger.log(chalk.gray(`  Title:    ${options.title}`));
  if (columnTitle !== undefined) {
    logger.log(chalk.gray(`  Column:   ${columnTitle}`));
  }
  if (task.type && task.type !== 'task') {
    logger.log(chalk.gray(`  Type:     ${task.type}`));
  }
  if (typeof task.status === 'string' && columnTitle === undefined) {
    logger.log(chalk.gray(`  Status:   ${task.status}`));
  }
  if (options.parent) {
    logger.log(chalk.gray(`  Parent:   ${options.parent}`));
  }
  if (task.dependsOn?.length) {
    logger.log(chalk.gray(`  Depends:  ${task.dependsOn.join(', ')}`));
  }
  if (task.decisions?.length) {
    logger.log(chalk.gray(`  Rests on: ${task.decisions.join(', ')}`));
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
