/**
 * An issue on the board (task-26): what a task made from it carries, and how
 * the window finds the task an issue already became. Pure, so plain
 * `node --test` runs it.
 */
import type { ColumnView, IssueView, NewTaskInput } from './api';

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

/** The column a new task from an issue lands in: the board's first that is not its done column. */
export function intakeColumn(columns: ColumnView[]): string | undefined {
  return (columns.find((c) => !c.completionColumn) ?? columns[0])?.id;
}

/** The task an issue becomes: its title, its body as the description, its labels as tags, and its page as `source:`. */
export function issueTask(issue: IssueView, column: string): NewTaskInput {
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

/** The task already made from this issue, if any, from the board's `sources`. */
export function linkedTask(issue: IssueView, sources: Record<string, string>): string | undefined {
  return sources[issue.url.replace(/\/+$/, '')];
}

/** A `source:` as a few words: `owner/name#12` for a GitHub issue, else the URL as written. */
export function sourceLabel(source: string): string {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)\/?$/.exec(source.trim());
  return m ? `${m[1]}/${m[2]}#${m[3]}` : source;
}
