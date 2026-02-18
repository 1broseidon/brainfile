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
 */
export interface TypeEntry {
  /** Prefix used when generating IDs for this type. */
  idPrefix: string;
  /** Whether this type can be completed/archived like a task. */
  completable?: boolean;
  /** Optional schema URI/path for the type. */
  schema?: string;
}

/**
 * Map of type name -> type configuration.
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
}
