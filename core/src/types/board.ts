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
 * tasks live as individual files in `.brainfile/tasks/`.
 */
export interface BoardConfig extends BrainfileBase {
  type?: 'board';
  columns: ColumnConfig[];
  statsConfig?: StatsConfig;
}
