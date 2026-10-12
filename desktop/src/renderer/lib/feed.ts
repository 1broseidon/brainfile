import type { BoardSnapshot } from '../../shared/api';

/** A change that reached a board from outside this window: an agent, the CLI, another machine. */
export interface FeedItem {
  key: string;
  projectId: string;
  taskId: string;
  title: string;
  /** What happened, as a short phrase: `added`, `moved to In Review`, `edited`, `done`. */
  what: string;
  at: number;
}

/** What changed between two snapshots of one board, as feed items. */
export function diffBoards(before: BoardSnapshot, after: BoardSnapshot, at: number): FeedItem[] {
  const was = new Map(before.tasks.map((t) => [t.id, t]));
  const doneBefore = new Set(before.completed.map((t) => t.id));
  const columnTitle = (id: string) => after.columns.find((c) => c.id === id)?.title ?? id;
  const items: FeedItem[] = [];
  const push = (taskId: string, title: string, what: string) =>
    items.push({ key: `${after.projectId}:${taskId}:${what}:${at}`, projectId: after.projectId, taskId, title, what, at });

  for (const task of after.tasks) {
    const prev = was.get(task.id);
    if (!prev) push(task.id, task.title, 'added');
    else if (prev.column !== task.column) push(task.id, task.title, `moved to ${columnTitle(task.column)}`);
    else if (prev.updatedAt !== task.updatedAt) push(task.id, task.title, 'edited');
  }
  const doneAfter = new Set(after.completed.map((t) => t.id));
  for (const task of after.completed) {
    if (!doneBefore.has(task.id) && was.has(task.id)) push(task.id, task.title, 'done');
  }
  const still = new Set(after.tasks.map((t) => t.id));
  for (const task of before.tasks) {
    if (!still.has(task.id) && !doneAfter.has(task.id)) push(task.id, task.title, 'removed');
  }
  // Decisions: one recorded, one replaced or let go.
  const decided = new Map((before.decisions ?? []).map((d) => [d.id, d]));
  for (const d of after.decisions ?? []) {
    const prev = decided.get(d.id);
    if (!prev) push(d.id, d.title, 'decided');
    else if (prev.status !== d.status) push(d.id, d.title, d.supersededBy ? `replaced by ${d.supersededBy}` : d.status);
  }
  return items;
}
