/**
 * Flat-cursor model for the detail view (v3.1 §B2, the locked decision).
 *
 * One cursor, top to bottom: every child row, then every subtask row.
 * Description, contract, activity and files are landmarks — they are never
 * cursor stops. This is the single source of truth for "what does stop N
 * mean", shared by `DetailView` (render) and `useKeyboardNavigation` (enter /
 * space) so the two can never disagree about what the cursor is on.
 */
import type { Task } from '@brainfile/core';

export type Subtask = NonNullable<Task['subtasks']>[number];

export type DetailStop =
  | { kind: 'child'; task: Task }
  | { kind: 'subtask'; subtask: Subtask; index: number };

/** Children first (board order), then subtasks (declaration order). */
export function buildDetailStops(task: Task, children: Task[]): DetailStop[] {
  const stops: DetailStop[] = children.map((child) => ({ kind: 'child', task: child }));
  (task.subtasks ?? []).forEach((subtask, index) => {
    stops.push({ kind: 'subtask', subtask, index });
  });
  return stops;
}

/** Clamp a cursor into range as the stop count changes (reload, drill, etc). */
export function clampDetailCursor(cursor: number, stopCount: number): number {
  if (stopCount <= 0) return 0;
  return Math.max(0, Math.min(cursor, stopCount - 1));
}
