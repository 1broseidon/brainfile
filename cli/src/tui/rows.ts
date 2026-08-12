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
  /**
   * Number of direct children this doc has *in the current view* (whether or
   * not they are currently rendered). `undefined`/0 means "not a parent" —
   * DocumentRow uses this to decide whether the row gets the `▾`/`▸`
   * collapse glyph instead of its type glyph (v3.1 §A1).
   */
  childCount?: number;
  /** True when a parent-with-children row is currently collapsed. */
  collapsed?: boolean;
}

/**
 * Flatten a column's documents into render order.
 *
 * Input order is preserved for roots; children are pulled up to sit directly
 * beneath their parent. A document is only ever emitted once, and a `parentId`
 * cycle (or a document that is its own parent) cannot loop because emission is
 * tracked by id.
 *
 * `collapsedIds` (v3.1 §A1) suppresses a parent's children rows without
 * removing the parent — the parent row instead carries `childCount` and
 * `collapsed: true` so the row/chip layer can render the `▸` glyph and the
 * `N hidden` chip.
 */
export function buildRows(tasks: Task[], collapsedIds?: ReadonlySet<string>): DocRow[] {
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
    const children = childrenOf.get(task.id) ?? [];
    const isCollapsed = children.length > 0 && Boolean(collapsedIds?.has(task.id));

    rows.push({
      task,
      depth: 0,
      orphanParentId: parentId && !parentVisible ? parentId : undefined,
      childCount: children.length > 0 ? children.length : undefined,
      collapsed: children.length > 0 ? isCollapsed : undefined,
    });

    if (isCollapsed) {
      // Hidden, not dropped: mark them emitted so the leftover/cycle pass
      // below doesn't sweep them up as orphan roots.
      for (const child of children) emitted.add(child.id);
      continue;
    }

    for (const child of children) {
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
 * Flat render for an active type-cycle filter (v3.1 §A2): every matching doc
 * at depth 0, with a `← parent` reference whenever `parentId` is set — even if
 * the parent survives the same filter — rather than re-running the
 * parent/child pull-up. "No orphan-parent indentation games": one rule
 * instead of two overlapping hierarchy mechanisms.
 */
export function buildFlatRows(tasks: Task[]): DocRow[] {
  return tasks.map((task) => ({
    task,
    depth: 0,
    orphanParentId: task.parentId && task.parentId !== task.id ? task.parentId : undefined,
  }));
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
