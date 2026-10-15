/**
 * A pull request on the board (decision-16, spec-18): `pullRequest:` on a
 * task whose hand-off was opened as one instead of merged, and what one is
 * opened with. Pure and with no imports beyond types, so the browser entry
 * exports it too; pushing, opening and following one on the forge live in
 * `@brainfile/core/forge`.
 *
 * @packageDocumentation
 */
import type { PullRequestRecord, PullRequestState, Task } from './types/base';

export const PULL_REQUEST_STATES: readonly PullRequestState[] = ['open', 'merged', 'closed'];

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An ISO 8601 time as written; YAML reads an unquoted one as a Date. */
function isoTime(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))) return value.trim();
  return undefined;
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** `pullRequest:` as written, when it is whole: a number, its page, a state, both branches and when; else null. */
export function parsePullRequest(value: unknown): PullRequestRecord | null {
  if (!isMapping(value)) return null;
  const { number, url, state, base, head } = value;
  const at = isoTime(value.at);
  if (!Number.isInteger(number) || (number as number) <= 0 || !nonEmpty(url) || !nonEmpty(base) || !nonEmpty(head) || !at) return null;
  if (typeof state !== 'string' || !(PULL_REQUEST_STATES as readonly string[]).includes(state)) return null;
  return { number: number as number, url: url.trim(), state: state as PullRequestState, base: base.trim(), head: head.trim(), at };
}

/** The task's pull request while it is open on the forge: the hand-off waits on it, not on Merge. */
export function openPullRequestOf(task: { pullRequest?: unknown }): PullRequestRecord | null {
  const record = parsePullRequest(task.pullRequest);
  return record?.state === 'open' ? record : null;
}

/** The task with `pullRequest:` set, or taken off with null; nothing else changes. */
export function withPullRequest(task: Task, record: PullRequestRecord | null): Task {
  const { pullRequest: _old, ...rest } = task;
  return record ? ({ ...rest, pullRequest: { ...record } } as Task) : (rest as Task);
}

/** How many of a description's lines a pull request's body carries; the task has the rest. */
const SUMMARY_LINES = 6;
/** How many of the task's last log entries it carries. */
const NOTES = 2;

/**
 * What a hand-off's pull request says: the task's title, and a body with the
 * task's ID, the first lines of its description and the last of its log (the
 * hand-off's own notes, usually), so a reviewer on the forge knows what it is
 * without the board.
 */
export function pullRequestText(task: Pick<Task, 'id' | 'title' | 'description'>, log?: string): { title: string; body: string } {
  const description = (task.description ?? '').trim().split('\n');
  const summary = description.slice(0, SUMMARY_LINES).join('\n').trim();
  const notes = (log ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .slice(-NOTES)
    // `- 2026-10-15T12:00:00.000Z [agent]: text` → `- [agent] text`
    .map((line) => line.replace(/^- \d{4}-\d{2}-\d{2}T[\d:.]+Z?(?: (\[[^\]]*\]))?:\s*/, (_, who?: string) => (who ? `- ${who} ` : '- ')));
  const parts = [
    `Brainfile ${task.id}: ${task.title}`,
    summary ? `${summary}${description.length > SUMMARY_LINES ? '\n…' : ''}` : '',
    notes.length ? `Last from the hand-off:\n${notes.join('\n')}` : '',
    `Opened from the Brainfile board: merging it completes ${task.id}.`,
  ];
  return { title: task.title, body: parts.filter(Boolean).join('\n\n') };
}
