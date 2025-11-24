/**
 * Board-specific type definitions
 * @packageDocumentation
 */

import { BrainfileBase, Task, StatsConfig } from './base';

/**
 * Column definition for Kanban boards
 */
export interface Column {
  id: string;
  title: string;
  order?: number;
  tasks: Task[];
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
