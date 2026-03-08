/**
 * Conversion functions for CompletedTaskRef.
 *
 * Provides `taskToCompletedRef()` and `ledgerRecordToCompletedRef()` so
 * consumers can work with a single interface regardless of whether the
 * completed task came from a .md file or from ledger.jsonl.
 *
 * @packageDocumentation
 */

import type { Task } from './types/base';
import type { LedgerRecord } from './types/ledger';
import type { CompletedTaskRef } from './types/completed';

/**
 * Project a full Task (from board .md or log .md) into a CompletedTaskRef.
 */
export function taskToCompletedRef(task: Task): CompletedTaskRef {
  const ref: CompletedTaskRef = {
    id: task.id,
    title: task.title,
  };

  if (task.description) ref.description = task.description;
  if (task.assignee) ref.assignee = task.assignee;
  if (task.priority) ref.priority = task.priority;
  if (task.tags?.length) ref.tags = task.tags;
  if (task.relatedFiles?.length) ref.relatedFiles = task.relatedFiles;
  // Merge both dependsOn and blockedBy into a single dependsOn set
  const allDeps = [
    ...(task.dependsOn ?? []),
    ...(task.blockedBy ?? []),
  ].filter((id) => typeof id === 'string' && id.trim().length > 0);
  if (allDeps.length > 0) {
    ref.dependsOn = [...new Set(allDeps)];
  }

  const deliverables = task.contract?.deliverables;
  if (deliverables?.length) {
    ref.deliverablePaths = deliverables
      .map((d) => d.path)
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

    // Only populate deliverableDetails when at least one deliverable has a description
    const hasDescriptions = deliverables.some((d) => d.description?.trim());
    if (hasDescriptions) {
      ref.deliverableDetails = deliverables
        .filter((d) => typeof d.path === 'string' && d.path.trim().length > 0)
        .map((d) => ({ path: d.path, ...(d.description ? { description: d.description } : {}) }));
    }
  }

  // Merge in metrics.deliverablePaths (agent-written files tracked by the supervisor).
  // This is an extension field set by the supervisor, not part of the typed ContractMetrics.
  const metrics = task.contract?.metrics as Record<string, unknown> | undefined;
  const metricPaths = metrics?.deliverablePaths;
  if (Array.isArray(metricPaths) && metricPaths.length > 0) {
    const additional = metricPaths.filter(
      (p: unknown): p is string => typeof p === 'string' && (p as string).trim().length > 0,
    );
    if (additional.length > 0) {
      const merged = [...new Set([...(ref.deliverablePaths ?? []), ...additional])];
      ref.deliverablePaths = merged;
    }
  }

  return ref;
}

/**
 * Project a LedgerRecord (from ledger.jsonl) into a CompletedTaskRef.
 */
export function ledgerRecordToCompletedRef(record: LedgerRecord): CompletedTaskRef {
  const ref: CompletedTaskRef = {
    id: record.id,
    title: record.title,
  };

  if (record.summary) ref.description = record.summary;
  if (record.assignee) ref.assignee = record.assignee;
  if (record.priority) ref.priority = record.priority;
  if (record.tags?.length) ref.tags = record.tags;
  if (record.relatedFiles?.length) ref.relatedFiles = record.relatedFiles;
  if (record.dependsOn?.length) ref.dependsOn = record.dependsOn;

  if (record.deliverables?.length) {
    ref.deliverablePaths = record.deliverables;
  }

  return ref;
}
