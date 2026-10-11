import type { ColumnView, Priority } from '../../shared/api';

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
 * Where a column sits on the way to done, for its status icon: -1 for a
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

export function statusColor(progress: number): string {
  if (progress < 0) return 'var(--status-backlog)';
  if (progress >= 1) return 'var(--status-done)';
  if (progress <= 0) return 'var(--status-todo)';
  if (progress < 0.6) return 'var(--status-progress)';
  return 'var(--status-review)';
}

const TAG_HUES = [212, 262, 330, 24, 48, 142, 178, 292];

export function tagHue(tag: string): number {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_HUES[h % TAG_HUES.length];
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
  const now = new Date();
  const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
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

export function projectHue(name: string): number {
  return tagHue(name);
}
