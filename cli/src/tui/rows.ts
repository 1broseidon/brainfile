/**
 * Row model for the v3 board list.
 *
 * v3 renders exactly one row per document, so the list is a flat array built
 * once and indexed directly by the selection — no per-card height measurement.
 * Hierarchy is expressed by two things only:
 *
 *  - a child is emitted immediately after its parent, indented a level per
 *    generation (design §3). Across columns (task-20): the child sits under
 *    its parent in the parent's column list, says its own column on the row,
 *    and is not listed again in its own column; a completed child (logs/)
 *    stays under an open parent, ticked, until the parent is done too;
 *  - a child whose parent is not shown (completed, missing, or filtered out)
 *    keeps depth 0 and carries an orphan reference so the row can render
 *    `← epic-1` instead of silently pretending it has no parent.
 */
import type { Task } from '@brainfile/core';

export interface DocRow {
  task: Task;
  /** 0 for a root row; each generation under a shown parent is one level deeper. */
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
  /**
   * The document rests on a decision that has since been superseded,
   * rejected or gone stale: the row says `decision changed` (task-19).
   */
  decisionChanged?: boolean;
  /**
   * A child drawn under its parent in another column's list keeps its own
   * status: its column's id, said on the row, since the tab no longer says it
   * (task-20).
   */
  column?: string;
  /** A completed child (from logs/) under an open parent: `✓ done`, read-mostly (task-20). */
  archived?: boolean;
  /** What an agent is doing on it now, from the run files (task-82): `codex · editing`. */
  live?: string;
}

/** Say on each row what an agent is doing on it now (useRuns). Rows with no live run keep their identity. */
export function markLiveRuns(rows: DocRow[], live: ReadonlyMap<string, string>): DocRow[] {
  if (live.size === 0) return rows;
  return rows.map((row) => {
    const text = live.get(row.task.id);
    return text ? { ...row, live: text } : row;
  });
}

/** Flag the rows whose document rests on a retired decision. Rows not named keep their identity. */
export function markDecisionChanges(rows: DocRow[], changed: ReadonlySet<string>): DocRow[] {
  if (changed.size === 0) return rows;
  return rows.map((row) => (changed.has(row.task.id) ? { ...row, decisionChanged: true } : row));
}

export interface OutlineSource {
  /** Columns in board order, each with its open documents in list order. */
  columns: ReadonlyArray<{ id: string; tasks?: Task[] }>;
  /** Completed documents (logs/), newest first. */
  logs?: Task[];
}

/**
 * Every column's list, outlined across the whole board (task-20), with
 * nothing collapsed yet (`collapseRows` does that). A column lists its roots,
 * the open documents whose parent is not open, each followed by everything
 * under it wherever that lives: open children by column then list order,
 * completed ones after them, newest first.
 *
 * A document is only ever emitted once, and a `parentId` cycle (or a document
 * that is its own parent) cannot loop because emission is tracked by id; a
 * cycle has no root, so its documents are emitted flat in their own column.
 */
export function buildOutline({ columns, logs = [] }: OutlineSource): Map<string, DocRow[]> {
  const columnOf = new Map<string, string>();
  for (const column of columns) for (const task of column.tasks ?? []) if (!columnOf.has(task.id)) columnOf.set(task.id, column.id);
  const done = logs.filter((task) => !columnOf.has(task.id));
  const shown = new Set([...columnOf.keys(), ...done.map((task) => task.id)]);

  const childrenOf = new Map<string, Array<{ task: Task; archived: boolean }>>();
  const hang = (task: Task, archived: boolean, under: (id: string) => boolean) => {
    const parentId = task.parentId;
    if (!parentId || parentId === task.id || !under(parentId)) return;
    const bucket = childrenOf.get(parentId);
    if (bucket) bucket.push({ task, archived });
    else childrenOf.set(parentId, [{ task, archived }]);
  };
  for (const column of columns) {
    for (const task of column.tasks ?? []) if (columnOf.get(task.id) === column.id) hang(task, false, (id) => columnOf.has(id));
  }
  for (const task of done) hang(task, true, (id) => shown.has(id));

  const emitted = new Set<string>();
  const lists = new Map<string, DocRow[]>(columns.map((column) => [column.id, []]));

  const emit = (task: Task, archived: boolean, depth: number, listColumn: string, rows: DocRow[]) => {
    emitted.add(task.id);
    const children = (childrenOf.get(task.id) ?? []).filter((child) => !emitted.has(child.task.id));
    const own = columnOf.get(task.id);
    const parentId = task.parentId && task.parentId !== task.id ? task.parentId : undefined;
    rows.push({
      task,
      depth,
      orphanParentId: depth === 0 && parentId && !columnOf.has(parentId) ? parentId : undefined,
      childCount: children.length > 0 ? children.length : undefined,
      ...(archived ? { archived: true } : own && own !== listColumn ? { column: own } : {}),
    });
    for (const child of children) {
      if (!emitted.has(child.task.id)) emit(child.task, child.archived, depth + 1, listColumn, rows);
    }
  };

  for (const column of columns) {
    const rows = lists.get(column.id)!;
    for (const task of column.tasks ?? []) {
      if (emitted.has(task.id) || columnOf.get(task.id) !== column.id) continue;
      const parentId = task.parentId;
      if (parentId && parentId !== task.id && columnOf.has(parentId)) continue; // drawn under its parent
      emit(task, false, 0, column.id, rows);
    }
  }
  // Anything left over is part of a parentId cycle; emit it flat in its own
  // column rather than dropping documents off the board.
  for (const column of columns) {
    const rows = lists.get(column.id)!;
    for (const task of column.tasks ?? []) {
      if (emitted.has(task.id) || columnOf.get(task.id) !== column.id) continue;
      const before = rows.length;
      emit(task, false, 0, column.id, rows);
      rows[before] = { ...rows[before], orphanParentId: task.parentId };
    }
  }
  return lists;
}

/**
 * The rows drawn once collapsed parents are applied (v3.1 §A1): a collapsed
 * parent keeps its row, carrying `childCount` and `collapsed: true` so the
 * row/chip layer can render the `▸` glyph and the `N hidden` chip, and
 * everything beneath it is left out.
 */
export function collapseRows(rows: DocRow[], collapsedIds?: ReadonlySet<string>): DocRow[] {
  const out: DocRow[] = [];
  let hiddenBelow = Infinity;
  for (const row of rows) {
    if (row.depth > hiddenBelow) continue;
    hiddenBelow = Infinity;
    if (!row.childCount) {
      out.push(row);
      continue;
    }
    const collapsed = Boolean(collapsedIds?.has(row.task.id));
    if (collapsed) hiddenBelow = row.depth;
    out.push({ ...row, collapsed });
  }
  return out;
}

/**
 * Flatten one list of documents into render order: input order is preserved
 * for roots, and children are pulled up to sit directly beneath their parent.
 * The one-column case of `buildOutline`, with `collapsedIds` applied.
 */
export function buildRows(tasks: Task[], collapsedIds?: ReadonlySet<string>): DocRow[] {
  return collapseRows(buildOutline({ columns: [{ id: '', tasks }] }).get('') ?? [], collapsedIds);
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
