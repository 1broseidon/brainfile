/**
 * What a board's columns mean, read the same way by the window, the host and
 * the agents process: which is a backlog, which is review, and where work
 * that is not finished goes back to.
 */
import type { ColumnView } from './api';

const BACKLOG = /backlog|icebox|someday/i;
const REVIEW = /review/i;

export function isBacklog(column: ColumnView): boolean {
  return BACKLOG.test(column.id) || BACKLOG.test(column.title);
}

export function isReview(column: ColumnView): boolean {
  return REVIEW.test(column.id) || REVIEW.test(column.title);
}

/**
 * Where work that is not finished goes back to: the board's in-progress
 * column, by name, else its first open column past the backlog, else the
 * first. A merge with subtasks left, or a task reopened from done, lands here.
 */
export function workColumn<C extends ColumnView>(columns: C[]): C | undefined {
  const open = columns.filter((c) => !c.completionColumn && !isReview(c));
  return open.find((c) => /progress|doing/i.test(`${c.id} ${c.title}`)) ?? open.find((c) => !isBacklog(c)) ?? open[0] ?? columns[0];
}
