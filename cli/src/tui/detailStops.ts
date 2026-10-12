/**
 * Flat-cursor model for the detail view (v3.1 §B2, the locked decision).
 *
 * One cursor, top to bottom: every decision reference, every piece of work
 * resting on a decision, every child row, then every subtask row. A
 * decision's references are its chain (replaces, replaced by); work's are the
 * decisions it rests on (task-19). Description, contract, activity and files
 * are landmarks — they are never cursor stops. This is the single source of
 * truth for "what does stop N mean", shared by `DetailView` (render) and
 * `useKeyboardNavigation` (enter / space) so the two can never disagree about
 * what the cursor is on.
 */
import type { Task } from '@brainfile/core';
import type { DecisionRef, DetailRelations } from './decisions.js';

export type Subtask = NonNullable<Task['subtasks']>[number];

export type DetailStop =
  | { kind: 'ref'; ref: DecisionRef }
  | { kind: 'resting'; task: Task }
  | { kind: 'child'; task: Task }
  | { kind: 'subtask'; subtask: Subtask; index: number };

/** Decision references, resting work, children (board order), then subtasks (declaration order). */
export function buildDetailStops(task: Task, children: Task[], relations?: DetailRelations): DetailStop[] {
  const stops: DetailStop[] = [
    ...(relations?.refs ?? []).map((ref): DetailStop => ({ kind: 'ref', ref })),
    ...(relations?.resting ?? []).map((resting): DetailStop => ({ kind: 'resting', task: resting })),
    ...children.map((child): DetailStop => ({ kind: 'child', task: child })),
  ];
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
