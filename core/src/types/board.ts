/**
 * Board-specific type definitions
 * @packageDocumentation
 */

import { BrainfileBase, Task, StatsConfig } from './base';

/**
 * Column definition for Kanban boards.
 *
 * In v1 (embedded), columns contain tasks directly.
 * In v2 (per-task files), columns are config-only and tasks declare their column membership.
 *
 * Parent-child links use Task.parentId (declared in base.ts) and are independent of column layout.
 */
export interface Column {
  id: string;
  title: string;
  order?: number;
  /** Marks this column as a completion column. When true, tasks in this column are considered complete. */
  completionColumn?: boolean;
  /** Tasks in this column (v1 embedded format only; empty/absent in v2 per-task file format) */
  tasks: Task[];
}

/**
 * v2 config-only column definition (no embedded tasks).
 * Used when the board file only contains column definitions.
 */
export interface ColumnConfig {
  id: string;
  title: string;
  order?: number;
  /** Marks this column as a completion column. */
  completionColumn?: boolean;
}

/**
 * Per-type configuration entry for board document types.
 *
 * The five built-in types (epic, spec, plan, task, decision) exist without an
 * entry; an entry under one of their names overrides it, and any other name
 * adds a type of your own (spec-12).
 */
export interface TypeEntry {
  /** Prefix used when generating IDs for this type. Defaults to the type name. */
  idPrefix?: string;
  /** Whether this type can be completed/archived like a task. A task always can; a decision never can. */
  completable?: boolean;
  /** Optional schema URI/path for the type. */
  schema?: string;
  /**
   * The built-in type whose place this one takes: its parents, children,
   * completion rule and glyph (`bug: { like: task }`). Without it a custom
   * type behaves as a task.
   */
  like?: string;

  /** Extension fields are preserved. */
  [key: string]: unknown;
}

/**
 * Map of type name -> type configuration. Names only additions and overrides:
 * the built-in types need no entry.
 */
export interface TypesConfig {
  [typeName: string]: TypeEntry;
}

/**
 * Board type - Kanban-style task board with columns
 * Extends BrainfileBase with board-specific fields
 */
export interface Board extends BrainfileBase {
  type?: 'board';
  columns: Column[];
  archive?: Task[];
  statsConfig?: StatsConfig;
}

/**
 * v2 board config - config-only board without embedded tasks.
 * Used when the board file is the central config (columns, rules, agent) and
 * tasks live as individual files in `.brainfile/board/`.
 */
export interface BoardConfig extends BrainfileBase {
  type?: 'board';
  columns: ColumnConfig[];
  /** Enables strict validation of columns and types for CLI operations. */
  strict?: boolean;
  /** Optional per-type configuration used by strict type validation. */
  types?: TypesConfig;
  statsConfig?: StatsConfig;
  /** Hand-offs on this repository (spec-16-5): at most `maxRunning` at once, whichever runner runs them (default 3). */
  dispatch?: { maxRunning?: number; [key: string]: unknown };

  /** Extension fields (x-otto, x-cursor, etc.) are preserved for round-tripping. */
  [key: string]: unknown;
}
