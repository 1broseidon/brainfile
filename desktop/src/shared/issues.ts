/**
 * An issue on the board (task-26): what a task made from it carries, and how
 * the window finds the task an issue already became. The task an issue
 * becomes and the tasks that carry its URL are core's (task-77); the window
 * bundles that module's source, since core's build is CommonJS, which Vite
 * serves the window only once pre-bundled. Pure, so plain `node --test` runs it.
 */
import type { ColumnView } from './api';

export { issueTask, labelTag, linkedTask } from '../../../core/src/issues.ts';

/** The column a new task from an issue lands in: the board's first that is not its done column. */
export function intakeColumn(columns: ColumnView[]): string | undefined {
  return (columns.find((c) => !c.completionColumn) ?? columns[0])?.id;
}

/** A `source:` as a few words: `owner/name#12` for a GitHub issue, else the URL as written. */
export function sourceLabel(source: string): string {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)\/?$/.exec(source.trim());
  return m ? `${m[1]}/${m[2]}#${m[3]}` : source;
}
