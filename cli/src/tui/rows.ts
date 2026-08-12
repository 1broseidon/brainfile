/**
 * Row model for the v3 board list.
 *
 * v3 renders exactly one row per document, so the list is a flat array built
 * once and indexed directly by the selection — no per-card height measurement,
 * no expand/collapse state. Hierarchy is expressed by two things only:
 *
 *  - a child whose parent is visible in the same column view is emitted
 *    immediately after its parent, indented one level (design §3);
 *  - a child whose parent lives elsewhere (another column, the logs, or
 *    filtered out) keeps depth 0 and carries an orphan reference so the row can
 *    render `← epic-1` instead of silently pretending it has no parent.
 */
import type { Task } from '@brainfile/core';

export interface DocRow {
  task: Task;
  /** 0 for a root row, 1 for a child rendered under a visible parent. */
  depth: number;
  /** Parent id to surface as `← epic-1` when the parent is not a visible row. */
  orphanParentId?: string;
}

/**
 * Flatten a column's documents into render order.
 *
 * Input order is preserved for roots; children are pulled up to sit directly
 * beneath their parent. A document is only ever emitted once, and a `parentId`
 * cycle (or a document that is its own parent) cannot loop because emission is
 * tracked by id.
 */
export function buildRows(tasks: Task[]): DocRow[] {
  const visibleIds = new Set(tasks.map((t) => t.id));
  const emitted = new Set<string>();
  const rows: DocRow[] = [];

  const childrenOf = new Map<string, Task[]>();
  for (const task of tasks) {
    const parentId = task.parentId;
    if (!parentId || parentId === task.id || !visibleIds.has(parentId)) continue;
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push(task);
    else childrenOf.set(parentId, [task]);
  }

  for (const task of tasks) {
    if (emitted.has(task.id)) continue;

    const parentId = task.parentId;
    const parentVisible = Boolean(parentId && parentId !== task.id && visibleIds.has(parentId));

    // Children are emitted by their parent's pass, not on their own turn.
    if (parentVisible) continue;

    emitted.add(task.id);
    rows.push({
      task,
      depth: 0,
      orphanParentId: parentId && !parentVisible ? parentId : undefined,
    });

    for (const child of childrenOf.get(task.id) ?? []) {
      if (emitted.has(child.id)) continue;
      emitted.add(child.id);
      rows.push({ task: child, depth: 1 });
    }
  }

  // Anything left over is part of a parentId cycle; emit it flat rather than
  // dropping documents off the board.
  for (const task of tasks) {
    if (emitted.has(task.id)) continue;
    emitted.add(task.id);
    rows.push({ task, depth: 0, orphanParentId: task.parentId });
  }

  return rows;
}

/**
 * The window of rows to draw, keeping the selection inside the viewport.
 */
export function windowRows(
  rows: DocRow[],
  selectedIndex: number,
  viewportHeight: number,
): { visible: DocRow[]; start: number } {
  if (rows.length <= viewportHeight) return { visible: rows, start: 0 };

  const half = Math.floor(viewportHeight / 2);
  let start = selectedIndex - half;
  start = Math.max(0, Math.min(start, rows.length - viewportHeight));

  return { visible: rows.slice(start, start + viewportHeight), start };
}
