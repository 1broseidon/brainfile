import type { ColumnView, DecisionView, Priority, TaskView } from '../../shared/api';

export const PRIORITIES: { id: Priority | null; label: string }[] = [
  { id: null, label: 'No priority' },
  { id: 'critical', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

export function priorityLabel(priority?: Priority | null): string {
  return PRIORITIES.find((p) => p.id === (priority ?? null))?.label ?? 'No priority';
}

const BACKLOG = /backlog|icebox|someday/i;

/**
 * Where a column sits on the way to done, for its checkbox: -1 for a
 * backlog, 0 for the first open column, 1 for a completion column, and the
 * columns between spread evenly.
 */
export function columnProgress(columns: ColumnView[], columnId: string): number {
  const column = columns.find((c) => c.id === columnId);
  if (!column) return 0;
  if (column.completionColumn) return 1;
  if (BACKLOG.test(column.id) || BACKLOG.test(column.title)) return -1;
  const open = columns.filter((c) => !c.completionColumn && !BACKLOG.test(c.id) && !BACKLOG.test(c.title));
  const at = open.findIndex((c) => c.id === columnId);
  return open.length <= 1 ? 0 : at / open.length;
}

/** A document as the outline holds it: open, or completed (from logs/, ticked). */
export interface Held {
  task: TaskView;
  done: boolean;
}

export interface OutlineRow extends Held {
  depth: number;
  /** Children drawn under it, hidden or not. */
  children: number;
}

export interface Outline {
  /** One per column, in board order: its open roots, each followed by everything under it. */
  groups: { column: ColumnView; rows: OutlineRow[] }[];
  /** Completed work no open parent holds, a completed child under its completed parent. */
  done: OutlineRow[];
}

/**
 * Each document's children wherever they are (task-20): open ones under an
 * open parent, completed ones under any parent still shown. They run as the
 * list's groups do, by column and then the completed ones, newest first.
 */
export function childMap(columns: ColumnView[], tasks: TaskView[], completed: TaskView[]): Map<string, Held[]> {
  const open = new Set(tasks.map((t) => t.id));
  const shown = new Set([...open, ...completed.map((t) => t.id)]);
  const kids = new Map<string, Held[]>();
  const hang = (task: TaskView, done: boolean, under: Set<string>) => {
    const parent = task.parentId;
    if (!parent || parent === task.id || !under.has(parent)) return;
    const list = kids.get(parent);
    if (list) list.push({ task, done });
    else kids.set(parent, [{ task, done }]);
  };
  for (const column of columns) for (const t of tasks) if (t.column === column.id) hang(t, false, open);
  for (const t of completed) if (!open.has(t.id)) hang(t, true, shown);
  return kids;
}

/** Every child of a document, open or completed, in the same order: what its task pane lists. */
export function childrenOf(id: string, columns: ColumnView[], tasks: TaskView[], completed: TaskView[]): Held[] {
  const open = columns.flatMap((column) => tasks.filter((t) => t.column === column.id && t.parentId === id));
  const openIds = new Set(open.map((t) => t.id));
  const done = completed.filter((t) => t.parentId === id && !openIds.has(t.id));
  return [...open.map((task) => ({ task, done: false })), ...done.map((task) => ({ task, done: true }))];
}

/**
 * The list's outline (task-20). A child stays under its parent wherever its
 * own column is, and the outline is drawn in the parent's column group, so it
 * is not shown again in its own. A completed child stays under its open
 * parent, ticked, until the parent is done; then they go into Done together.
 * An open child of a completed parent is a root in its own column.
 */
export function outline(columns: ColumnView[], tasks: TaskView[], completed: TaskView[]): Outline {
  const kids = childMap(columns, tasks, completed);
  const open = new Set(tasks.map((t) => t.id));
  const closed = completed.filter((t) => !open.has(t.id));
  const placed = new Set<string>();
  const walk = (held: Held, depth: number, out: OutlineRow[]) => {
    placed.add(held.task.id);
    const children = (kids.get(held.task.id) ?? []).filter((c) => !placed.has(c.task.id));
    out.push({ ...held, depth, children: children.length });
    for (const c of children) if (!placed.has(c.task.id)) walk(c, depth + 1, out);
  };
  const isRoot = (t: TaskView, under: Set<string>) => !t.parentId || t.parentId === t.id || !under.has(t.parentId);
  const groups = columns.map((column) => {
    const rows: OutlineRow[] = [];
    const here = tasks.filter((t) => t.column === column.id);
    for (const t of here) if (isRoot(t, open)) walk({ task: t, done: false }, 0, rows);
    return { column, rows, here };
  });
  const done: OutlineRow[] = [];
  const shown = new Set([...open, ...closed.map((t) => t.id)]);
  for (const t of closed) if (!placed.has(t.id) && isRoot(t, shown)) walk({ task: t, done: true }, 0, done);
  // A parentId cycle has no root; its documents still show, flat, where they are.
  for (const g of groups) for (const t of g.here) if (!placed.has(t.id)) walk({ task: t, done: false }, 0, g.rows);
  for (const t of closed) if (!placed.has(t.id)) walk({ task: t, done: true }, 0, done);
  return { groups: groups.map(({ column, rows }) => ({ column, rows })), done };
}

/** The rows still drawn once the collapsed parents' descendants are left out. */
export function visibleRows(rows: OutlineRow[], collapsed: (id: string) => boolean): OutlineRow[] {
  const out: OutlineRow[] = [];
  let skipBelow = Infinity;
  for (const row of rows) {
    if (row.depth > skipBelow) continue;
    skipBelow = collapsed(row.task.id) ? row.depth : Infinity;
    out.push(row);
  }
  return out;
}

const FACE_HUES = [100, 135, 165, 195, 230, 265, 310];

export function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FACE_HUES[h % FACE_HUES.length];
}

export function initials(name: string): string {
  const parts = name.replace(/[-_.@]/g, ' ').trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return shortDate(iso);
}

/** `~/Projects/x` for a path under home. */
export function tildify(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/private\/tmp/, '/tmp');
}

/** A decision still standing: current, or a legacy ADR still proposed. */
export function isLiveDecision(d: DecisionView): boolean {
  return d.status === 'current' || d.status === 'proposed';
}

/**
 * Standing decisions by family, the claim key's first segment: largest family
 * first, decisions with no claim key last. The view and the keyboard share it.
 */
export function decisionGroups(decisions: DecisionView[]): { family: string; decisions: DecisionView[] }[] {
  const byFamily = new Map<string, DecisionView[]>();
  for (const d of decisions.filter(isLiveDecision)) {
    const family = d.claimKey?.split('.')[0] ?? '';
    byFamily.set(family, [...(byFamily.get(family) ?? []), d]);
  }
  return [...byFamily.entries()]
    .map(([family, list]) => ({ family, decisions: list }))
    .sort((a, b) => (a.family === '' ? 1 : b.family === '' ? -1 : b.decisions.length - a.decisions.length || a.family.localeCompare(b.family)));
}

/** A moment in a chat, as a person says it: `Today 11:02`, `Yesterday 18:40`, `Oct 9, 14:03`. */
export function dayTime(at: number): string {
  const when = new Date(at);
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = new Date(when);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

/** How long a turn took, in words: `9 seconds`, `1 minute 12 seconds`. */
export function tookWords(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} minute${minutes === 1 ? '' : 's'}${rest ? ` ${rest} second${rest === 1 ? '' : 's'}` : ''}`;
}
