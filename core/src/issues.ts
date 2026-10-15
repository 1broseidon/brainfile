/**
 * An issue on the board (task-26, decision-4): what a task made from it
 * carries, and how the board finds the task an issue already became. A task
 * made from an issue keeps the issue's page as `source:`; an issue is on the
 * board when any task, open or completed, carries its URL. Pure and with no
 * imports, so the browser entry exports it too and the desktop's window
 * bundles this source as is; reading a forge's issues lives in
 * `@brainfile/core/forge`.
 *
 * @packageDocumentation
 */

/** An open issue on a forge, as a board reads it. */
export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  /** The issue's page: what a task made from it keeps as its `source:`. */
  url: string;
  author?: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
}

/** The task an issue becomes, ready for `addTaskFile` with `source` in its own field. */
export interface IssueTaskInput {
  title: string;
  column: string;
  description?: string;
  tags?: string[];
  source: string;
}

/** A label as a tag: `good first issue` → `good-first-issue`. */
export function labelTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_/:]+/g, '-')
    .replace(/[^\p{L}\p{N}.-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The task an issue becomes: its title, its body as the description, its labels as tags, and its page as `source:`. */
export function issueTask(issue: Pick<Issue, 'number' | 'title' | 'body' | 'labels' | 'url'>, column: string): IssueTaskInput {
  const tags = [...new Set(issue.labels.map(labelTag).filter(Boolean))];
  const body = issue.body.replace(/\r\n/g, '\n').trim();
  return {
    title: issue.title.trim() || `Issue #${issue.number}`,
    column,
    ...(body ? { description: body } : {}),
    ...(tags.length ? { tags } : {}),
    source: issue.url,
  };
}

/** A `source:` as compared: the same issue with or without a trailing slash is one source. */
export function sourceKey(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** Every `source:` on the board, open and completed, to the task that carries it. */
export function sourcesOf(docs: { task: { id: string; source?: unknown } }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { task } of docs) {
    const source = typeof task.source === 'string' ? task.source.trim() : '';
    if (source) out[sourceKey(source)] ??= task.id;
  }
  return out;
}

/** The task already made from this issue, if any, from the board's `sources`. */
export function linkedTask(issue: Pick<Issue, 'url'>, sources: Record<string, string>): string | undefined {
  return sources[sourceKey(issue.url)];
}
