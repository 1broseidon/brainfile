/**
 * Ledger type definitions for append-only task completion history.
 * @packageDocumentation
 */

import type { Task } from './base';
import type { Deliverable } from './contract';

export type LedgerRecordType = 'task' | 'epic' | 'adr';

export const LEDGER_CONTRACT_STATUSES = [
  'ready',
  'in_progress',
  'delivered',
  'done',
  'failed',
  'blocked',
] as const;

export type LedgerContractStatus = (typeof LEDGER_CONTRACT_STATUSES)[number];

/**
 * Single record persisted in `logs/ledger.jsonl`.
 */
export interface LedgerRecord {
  id: string;
  type: LedgerRecordType;
  title: string;
  filesChanged: string[];
  createdAt: string;
  completedAt: string;
  cycleTimeHours: number;
  summary: string;

  columnHistory?: string[];
  assignee?: string;
  priority?: Task['priority'];
  tags?: string[];
  parentId?: string;
  relatedFiles?: string[];
  deliverables?: string[];
  contractStatus?: LedgerContractStatus;
  validationAttempts?: number;
  constraints?: string[];
  subtasksCompleted?: number;
  subtasksTotal?: number;

  // Schema allows additional fields for forward compatibility.
  [key: string]: unknown;
}

export interface BuildLedgerRecordOptions {
  summary?: string;
  filesChanged?: string[];
  completedAt?: string;
  columnHistory?: string[];
  validationAttempts?: number;
}

export interface LedgerDateRange {
  from?: string;
  to?: string;
}

export interface LedgerQueryFilters {
  assignee?: string;
  tags?: string[];
  dateRange?: LedgerDateRange;
  contractStatus?: LedgerContractStatus | LedgerContractStatus[];
  files?: string[];
}

export interface FileHistoryOptions {
  limit?: number;
  dateRange?: LedgerDateRange;
}

export type TaskContextDeliverable = string | Deliverable;

export interface TaskContextOptions {
  limit?: number;
  dateRange?: LedgerDateRange;
}

export interface TaskContextEntry {
  record: LedgerRecord;
  matchedFiles: string[];
}
