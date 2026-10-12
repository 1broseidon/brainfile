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

/** Tasks in TUI order: each parent followed by its children in the same list, indented. */
export function asTree(tasks: TaskView[]): { task: TaskView; depth: number; children: number }[] {
  const ids = new Set(tasks.map((t) => t.id));
  const kids = new Map<string, TaskView[]>();
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) {
      const list = kids.get(t.parentId) ?? [];
      list.push(t);
      kids.set(t.parentId, list);
    }
  }
  const out: { task: TaskView; depth: number; children: number }[] = [];
  const walk = (t: TaskView, depth: number) => {
    const children = kids.get(t.id) ?? [];
    out.push({ task: t, depth, children: children.length });
    for (const c of children) walk(c, depth + 1);
  };
  for (const t of tasks) if (!t.parentId || !ids.has(t.parentId)) walk(t, 0);
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
