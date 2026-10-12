/**
 * `brainfile columns` (spec-13): the board's columns.
 *
 *   brainfile columns                              list them, with task counts
 *   brainfile columns add "In Review" --after in-progress
 *   brainfile columns rename in-review "Review"
 *   brainfile columns reorder backlog todo in-progress review done
 *   brainfile columns remove review --move-to in-progress
 *
 * The edits are core's (`addColumnFile` and friends), written through the
 * board config writer; the MCP `columns` tool calls the same functions.
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import {
  addColumnFile,
  listColumnsFile,
  removeColumnFile,
  renameColumnFile,
  reorderColumnsFile,
  type ColumnConfig,
  type ColumnSummary,
  type ColumnsFileResult,
} from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, missingRequired } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';

export const COLUMNS_COMMAND_HELP = `
Examples:
  brainfile columns                                   List them, with task counts
  brainfile columns add "In Review" --after in-progress
  brainfile columns add Shipped --completion          Tasks moved there are completed
  brainfile columns rename in-review Review           The ID stays, so its tasks stay
  brainfile columns reorder backlog todo in-progress  The ones named first, the rest after
  brainfile columns remove review --move-to in-progress

Columns are named by ID or title. remove refuses a column that still holds
tasks unless --move-to says where they go; they move there without being
completed. The last column is never removed.`.trimEnd();

export interface ColumnsBaseOptions {
  file?: string;
  json?: boolean;
}

export interface ColumnsAddOptions extends ColumnsBaseOptions {
  id?: string;
  after?: string;
  before?: string;
  completion?: boolean;
}

export interface ColumnsRemoveOptions extends ColumnsBaseOptions {
  moveTo?: string;
}

export interface ColumnsCommandResult {
  success: true;
  columns: ColumnSummary[];
  column?: ColumnConfig;
  moved?: string[];
  movedTo?: ColumnConfig;
}

function boardPath(file: string | undefined): string {
  const filePath = resolveCliBrainfilePath(file);
  assertV2Brainfile(filePath);
  return filePath;
}

function unwrap(result: ColumnsFileResult, hint?: string): ColumnsCommandResult {
  if (!result.success || !result.columns) {
    throw new CLIError(result.error ?? 'The columns were not changed', ExitCode.USER_ERROR, hint);
  }
  return {
    success: true,
    columns: result.columns,
    ...(result.column ? { column: result.column } : {}),
    ...(result.moved ? { moved: result.moved } : {}),
    ...(result.movedTo ? { movedTo: result.movedTo } : {}),
  };
}

function printColumns(columns: ColumnSummary[], logger: Logger): void {
  const idWidth = Math.max('ID'.length, ...columns.map((c) => c.id.length));
  const titleWidth = Math.max('TITLE'.length, ...columns.map((c) => c.title.length));
  logger.log(chalk.gray(`  ${'ID'.padEnd(idWidth)}  ${'TITLE'.padEnd(titleWidth)}  TASKS`));
  for (const column of columns) {
    const count = String(column.taskCount).padEnd(5);
    const note = column.completionColumn ? chalk.gray('  completion column') : '';
    logger.log(`  ${column.id.padEnd(idWidth)}  ${column.title.padEnd(titleWidth)}  ${count}${note}`.trimEnd());
  }
}

function report(result: ColumnsCommandResult, options: ColumnsBaseOptions, headline: string | null, logger: Logger): ColumnsCommandResult {
  if (options.json) {
    const { success: _success, ...payload } = result;
    logger.log(JSON.stringify(payload, null, 2));
    return result;
  }
  if (headline) {
    logger.log(chalk.green(headline));
    logger.log('');
  }
  printColumns(result.columns, logger);
  return result;
}

/** `columns` / `columns list`: every column, in order, with its task count. */
export function columnsListCommand(options: ColumnsBaseOptions, logger: Logger = defaultLogger): ColumnsCommandResult {
  const result = unwrap(listColumnsFile(boardPath(options.file)));
  return report(result, options, null, logger);
}

/** `columns add <title>`: a new column, last unless --after or --before. */
export function columnsAddCommand(title: string | undefined, options: ColumnsAddOptions, logger: Logger = defaultLogger): ColumnsCommandResult {
  if (!title?.trim()) throw missingRequired('<title>', 'brainfile columns add <title> [--id <id>] [--after <column> | --before <column>] [--completion]');
  const result = unwrap(addColumnFile(boardPath(options.file), {
    title,
    ...(options.id ? { id: options.id } : {}),
    ...(options.after ? { after: options.after } : {}),
    ...(options.before ? { before: options.before } : {}),
    ...(options.completion ? { completionColumn: true } : {}),
  }));
  const column = result.column!;
  return report(result, options, `Added column ${column.id} (${column.title}).`, logger);
}

/** `columns rename <column> <title>`: a new title; the ID, and the tasks, stay. */
export function columnsRenameCommand(column: string | undefined, title: string | undefined, options: ColumnsBaseOptions, logger: Logger = defaultLogger): ColumnsCommandResult {
  if (!column?.trim() || !title?.trim()) throw missingRequired('<column> and <title>', 'brainfile columns rename <column> <title>');
  const result = unwrap(renameColumnFile(boardPath(options.file), column, title));
  const renamed = result.column!;
  return report(result, options, `Renamed column ${renamed.id} to ${renamed.title}.`, logger);
}

/** `columns reorder <column...>`: the ones named first, the rest after in their order. */
export function columnsReorderCommand(order: string[] | undefined, options: ColumnsBaseOptions, logger: Logger = defaultLogger): ColumnsCommandResult {
  if (!order || order.length === 0) throw missingRequired('<columns...>', 'brainfile columns reorder <column> [column...]');
  const result = unwrap(reorderColumnsFile(boardPath(options.file), order));
  return report(result, options, 'Columns reordered.', logger);
}

/** `columns remove <column> [--move-to <column>]`. */
export function columnsRemoveCommand(column: string | undefined, options: ColumnsRemoveOptions, logger: Logger = defaultLogger): ColumnsCommandResult {
  if (!column?.trim()) throw missingRequired('<column>', 'brainfile columns remove <column> [--move-to <column>]');
  const raw = removeColumnFile(boardPath(options.file), column, options.moveTo ? { moveTo: options.moveTo } : {});
  const holdsTasks = !raw.success && !options.moveTo && /holds \d+ task/.test(raw.error ?? '');
  const result = unwrap(raw, holdsTasks ? `To move them first: brainfile columns remove ${column} --move-to <column>` : undefined);
  const removed = result.column!;
  const moved = result.moved && result.moved.length > 0 && result.movedTo
    ? `; moved ${result.moved.join(', ')} to ${result.movedTo.id}`
    : '';
  return report(result, options, `Removed column ${removed.id}${moved}.`, logger);
}
