/**
 * Editing the board config on disk (spec-13): columns, title, agent
 * instructions and related boards, through `readBoardConfig` and
 * `writeBoardConfig`. The edits themselves are the pure functions in
 * `boardConfigEdits.ts`; this module adds the reads and writes, and the one
 * edit that touches tasks: removing a column moves its tasks first, or refuses.
 *
 * The frontmatter is rewritten as YAML (keys and the markdown body are kept;
 * YAML comments are not), as `types add` has always done. Node only.
 *
 * @packageDocumentation
 */

import * as path from 'path';
import type { BoardConfig, ColumnConfig } from './types/board';
import { readBoardConfig, writeBoardConfig } from './boardFile';
import { readTasksDir } from './taskFile';
import { getV2Dirs } from './workspace';
import { moveTaskFileToColumn } from './taskOperations';
import {
  addColumn,
  findColumnConfig,
  orderedColumns,
  readBoardSettings,
  removeColumn,
  renameColumn,
  reorderColumns,
  updateBoardSettings,
  type AddColumnInput,
  type BoardConfigEditResult,
  type BoardSettings,
  type BoardSettingsPatch,
} from './boardConfigEdits';

/** A column as listed: its config and how many open documents sit in it. */
export interface ColumnSummary extends ColumnConfig {
  taskCount: number;
}

export interface ColumnsFileResult {
  success: boolean;
  /** Every column after the edit, in order, with task counts. */
  columns?: ColumnSummary[];
  /** The column added, renamed or removed. */
  column?: ColumnConfig;
  /** IDs of the tasks a removal moved, in the order they moved. */
  moved?: string[];
  /** The column a removal moved them to. */
  movedTo?: ColumnConfig;
  error?: string;
}

function loadConfig(filePath: string): { config: BoardConfig; body: string } | { error: string } {
  const board = readBoardConfig(filePath);
  if (!board) return { error: `Failed to read board config: ${filePath}` };
  if (!Array.isArray(board.config.columns)) return { error: `The board config has no columns list: ${filePath}` };
  return { config: board.config, body: board.body };
}

/** Each column with the number of open documents in board/ that name it. */
export function summarizeColumns(filePath: string, config: BoardConfig): ColumnSummary[] {
  const counts = new Map<string, number>();
  for (const doc of readTasksDir(getV2Dirs(filePath).boardDir)) {
    const column = doc.task.column;
    if (typeof column === 'string') counts.set(column, (counts.get(column) ?? 0) + 1);
  }
  return orderedColumns(config).map((column) => ({ ...column, taskCount: counts.get(column.id) ?? 0 }));
}

/** The board's columns, in order, with task counts. */
export function listColumnsFile(filePath: string): ColumnsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, error: loaded.error };
  return { success: true, columns: summarizeColumns(filePath, loaded.config) };
}

function writeEdit(filePath: string, body: string, edit: BoardConfigEditResult): ColumnsFileResult {
  if (!edit.success || !edit.config) return { success: false, error: edit.error };
  writeBoardConfig(filePath, edit.config, body);
  return { success: true, column: edit.column, columns: summarizeColumns(filePath, edit.config) };
}

/** Add a column (see `addColumn`). */
export function addColumnFile(filePath: string, input: AddColumnInput): ColumnsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, error: loaded.error };
  return writeEdit(filePath, loaded.body, addColumn(loaded.config, input));
}

/** Rename a column; its ID, and so its tasks, stay. */
export function renameColumnFile(filePath: string, ref: string, title: string): ColumnsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, error: loaded.error };
  return writeEdit(filePath, loaded.body, renameColumn(loaded.config, ref, title));
}

/** Reorder the columns: the ones named first, the rest after in their order. */
export function reorderColumnsFile(filePath: string, order: readonly string[]): ColumnsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, error: loaded.error };
  return writeEdit(filePath, loaded.body, reorderColumns(loaded.config, order));
}

export interface RemoveColumnOptions {
  /** Move the column's tasks here first (ID or title). Without it a column with tasks is refused. */
  moveTo?: string;
}

/**
 * Remove a column. One that still holds tasks is refused unless `moveTo`
 * names another column: its tasks move there first (appended, in their
 * current order, and not completed even when that is a completion column),
 * then the column goes. If a move fails, the column stays and the error says
 * which tasks already moved.
 */
export function removeColumnFile(filePath: string, ref: string, options: RemoveColumnOptions = {}): ColumnsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, error: loaded.error };
  const { config, body } = loaded;
  const edit = removeColumn(config, ref);
  if (!edit.success || !edit.config || !edit.column) return { success: false, error: edit.error };
  const removed = edit.column;

  const dirs = getV2Dirs(filePath);
  const tasks = readTasksDir(dirs.boardDir)
    .filter((doc) => doc.task.column === removed.id)
    .sort((a, b) => (a.task.position ?? Number.MAX_SAFE_INTEGER) - (b.task.position ?? Number.MAX_SAFE_INTEGER)
      || a.task.id.localeCompare(b.task.id, undefined, { numeric: true }));

  let movedTo: ColumnConfig | undefined;
  const moved: string[] = [];
  if (options.moveTo !== undefined && options.moveTo.trim() !== '') {
    movedTo = findColumnConfig(config, options.moveTo);
    if (!movedTo) {
      return { success: false, error: `column not found: ${options.moveTo}` };
    }
    if (movedTo.id === removed.id) {
      return { success: false, error: `cannot move the tasks of '${removed.id}' into itself` };
    }
  }

  if (tasks.length > 0 && !movedTo) {
    const ids = tasks.map((doc) => doc.task.id);
    const shown = ids.length <= 5 ? ids.join(', ') : `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more`;
    return {
      success: false,
      error: `column '${removed.id}' holds ${ids.length} task${ids.length === 1 ? '' : 's'} (${shown}); say which column they move to`,
    };
  }

  for (const doc of tasks) {
    const result = moveTaskFileToColumn(dirs, config, doc.task.id, movedTo!.id, { skipAutoComplete: true });
    if (!result.success) {
      const done = moved.length > 0 ? ` (already moved: ${moved.join(', ')}; '${removed.id}' was kept)` : '';
      return { success: false, moved, movedTo, error: `could not move ${doc.task.id}: ${result.error ?? 'unknown error'}${done}` };
    }
    moved.push(doc.task.id);
  }

  writeBoardConfig(filePath, edit.config, body);
  return {
    success: true,
    column: removed,
    moved,
    ...(movedTo ? { movedTo } : {}),
    columns: summarizeColumns(filePath, edit.config),
  };
}

export interface BoardSettingsFileResult {
  success: boolean;
  settings?: BoardSettings;
  changed: Array<'title' | 'instructions' | 'related'>;
  error?: string;
}

/** The board's title, agent instructions and related boards. */
export function readBoardSettingsFile(filePath: string): BoardSettingsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, changed: [], error: loaded.error };
  return { success: true, settings: readBoardSettings(loaded.config), changed: [] };
}

/** Change the title, agent instructions or related boards; written only when something changed. */
export function updateBoardSettingsFile(filePath: string, patch: BoardSettingsPatch): BoardSettingsFileResult {
  const loaded = loadConfig(filePath);
  if ('error' in loaded) return { success: false, changed: [], error: loaded.error };
  const result = updateBoardSettings(loaded.config, patch);
  if (!result.success || !result.config) return { success: false, changed: [], error: result.error };
  if (result.changed.length > 0) writeBoardConfig(path.resolve(filePath), result.config, loaded.body);
  return { success: true, settings: readBoardSettings(result.config), changed: result.changed };
}
