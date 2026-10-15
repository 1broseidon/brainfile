/**
 * `brainfile review`, `land` and `discard` (task-81, spec-16-7): a hand-off's
 * work on its own branch, as the desktop's review shows it, and what the
 * person does with it.
 *
 * - `review <task>`: the branch, where it lands, its commits and files, what
 *   would conflict, and whether it can land now. `review --ready`: every
 *   hand-off that can land now.
 * - `land <task>`: checked with its contract's validation, then landed on
 *   its target (decision-12); the task completes unless subtasks are left. A
 *   conflict or a failed check goes back to the agent that did it, through
 *   the queue, up to the contract's maxRetries; then it parks in Review.
 * - `discard <task>`: its worktree and branch are thrown away.
 *
 * All three are refused while an agent is at the task. The MCP `review`
 * tool (review_tool.ts) calls the same functions.
 */
import chalk from 'chalk';
import { findV2Task, getV2Dirs } from '@brainfile/core';
import { discardReview, readyToMerge, reviewOf, whyNotMerge, type HandOffReview } from '@brainfile/core/repo';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { guard, outOfScope, placeOf, withRunner, type Access } from './dispatch';

export const REVIEW_COMMAND_HELP = `
Examples:
  brainfile review task-12          Its branch, commits, files and conflicts, and whether it can land
  brainfile review --ready          Every hand-off that can land now
  brainfile land task-12            Run its checks, then land it on its target
  brainfile land task-12 --into release/2.0
  brainfile discard task-12         Throw its worktree and branch away

Landing runs the task's contract validation in its worktree with the target
brought in, then merges. A conflict or a failed check goes back to the agent
that did the work, queued for a runner, up to the contract's maxRetries; then
the task waits in Review for you.
`.trimEnd();

export interface ReviewReport {
  task: string;
  /** Null: the task has no worktree here. */
  review: HandOffReview | null;
  /** An agent is at it now. */
  busy?: string;
  /** Why it cannot land now; absent when it can. */
  blocked?: string;
  canLand: boolean;
}

export interface ReadyReport {
  ready: { task: string; into: string; ahead: number; added: number; removed: number; conflicts: boolean }[];
}

export interface LandReport {
  task: string;
  landed: boolean;
  /** Landed and its task completed (subtasks left keep it open). */
  completed?: boolean;
  /** Not landed: what stopped it (conflict, check, refused, …), and whether it went back to its agent. */
  kind?: string;
  sentBack?: boolean;
  message: string;
}

export interface DiscardReport {
  task: string;
  message: string;
}

function taskTitle(filePath: string, taskId: string): string | undefined {
  return findV2Task(getV2Dirs(filePath), taskId, true)?.doc.task.title;
}

/** The task's hand-off as it stands: what is on its branch, and whether it can land now. */
export async function reviewReport(filePath: string, taskId: string, options: { access?: Access } = {}): Promise<ReviewReport> {
  const place = placeOf(filePath);
  const out = outOfScope(filePath, taskId, options.access ?? {});
  if (out) throw new CLIError(out);
  if (!findV2Task(getV2Dirs(filePath), taskId, true)) throw new CLIError(`No ${taskId} on this board`);
  return withRunner('cli', (runner) => {
    const review = reviewOf(place.projectId, taskId);
    const busy = runner.busy(place.projectId, taskId) ?? undefined;
    const blocked = busy ?? whyNotMerge(taskId, review) ?? (review?.merged ? `${taskId} has already landed` : undefined) ?? undefined;
    return { task: taskId, review, ...(busy ? { busy } : {}), ...(blocked ? { blocked } : {}), canLand: !blocked };
  });
}

/** Every hand-off in the repository that can land now: one an agent is still at is not ready yet. */
export async function readyReport(filePath: string, options: { access?: Access } = {}): Promise<ReadyReport> {
  const place = placeOf(filePath);
  const access = options.access ?? {};
  return withRunner('cli', (runner) => ({
    ready: readyToMerge(place.projectId)
      .filter((r) => !runner.liveDispatch(place.projectId, r.taskId) && !outOfScope(filePath, r.taskId, access))
      .map((r) => ({ task: r.taskId, into: r.into, ahead: r.ahead, added: r.added, removed: r.removed, conflicts: r.conflicts })),
  }));
}

/** Checks, then lands the task's hand-off (decision-12); a conflict or a failed check is sent back through the queue. */
export async function landReport(filePath: string, taskId: string, options: { access?: Access; into?: string } = {}): Promise<LandReport> {
  const place = placeOf(filePath);
  guard(filePath, taskId, options.access ?? {}, 'land');
  return withRunner('cli', async (runner) => {
    const landed = await runner.land(place.projectId, taskId, options.into ? { into: options.into } : {});
    if (landed.ok) return { task: taskId, landed: true, completed: landed.completed, message: landed.message };
    return { task: taskId, landed: false, kind: landed.kind, sentBack: landed.sentBack, message: landed.error };
  });
}

/** Throws the hand-off's work away: its worktree, uncommitted changes and all, and its branch. */
export async function discardReport(filePath: string, taskId: string, options: { access?: Access } = {}): Promise<DiscardReport> {
  const place = placeOf(filePath);
  guard(filePath, taskId, options.access ?? {}, 'discard');
  return withRunner('cli', (runner) => {
    const busy = runner.busy(place.projectId, taskId);
    if (busy) throw new CLIError(busy, undefined, `Stop it first: brainfile dispatch stop ${taskId}`);
    try {
      return { task: taskId, message: discardReview(place.projectId, taskId).message };
    } catch (err) {
      throw new CLIError(err instanceof Error ? err.message : String(err));
    }
  });
}

/** The review in plain lines, for the terminal and the MCP text. */
export function reviewText(report: ReviewReport, title?: string): string {
  const { task, review } = report;
  const head = `${task}${title ? ` · ${title}` : ''}`;
  if (!review) return `${head}\nNo worktree for ${task} here: it was never handed off on this machine, or its work has landed or been discarded.`;
  if (!review.branch) return `${head}\nA read-only checkout at ${review.path}${review.uncommitted ? `, ${review.uncommitted} files changed in it` : ''}: there is nothing to land.`;
  const lines = [`${head}`, `${review.branch} → ${review.into ?? '(no target)'} · ${review.path}`];
  lines.push(`${review.ahead} commit${review.ahead === 1 ? '' : 's'}, ${review.filesChanged} file${review.filesChanged === 1 ? '' : 's'} (+${review.added} −${review.removed})${review.merged ? ' · already landed' : ''}`);
  for (const c of review.commits) lines.push(`  ${c.sha} ${c.subject}`);
  if (review.ahead > review.commits.length) lines.push(`  … ${review.ahead - review.commits.length} more`);
  if (review.files.length) lines.push('Files:');
  for (const f of review.files) lines.push(`  ${f.path} +${f.added} −${f.removed}`);
  if (review.filesChanged > review.files.length) lines.push(`  … ${review.filesChanged - review.files.length} more`);
  if (review.uncommitted) lines.push(`${review.uncommitted} file${review.uncommitted === 1 ? '' : 's'} not committed in the worktree`);
  if (review.conflicts.length) lines.push(`Conflicts with ${review.into}: ${review.conflicts.join(', ')}. Landing sends it back to its agent to settle.`);
  else if (review.ahead && !review.merged) lines.push(`No conflicts with ${review.into}.`);
  lines.push(report.canLand ? `Can land: brainfile land ${task}` : `Cannot land now: ${report.blocked}`);
  return lines.join('\n');
}

export function readyText(report: ReadyReport): string {
  if (!report.ready.length) return 'Nothing is ready to land.';
  return [
    `Ready to land (${report.ready.length}):`,
    ...report.ready.map((r) => `  ${r.task} → ${r.into} · ${r.ahead} commit${r.ahead === 1 ? '' : 's'} (+${r.added} −${r.removed})${r.conflicts ? ' · conflicts: landing sends it back' : ''}`),
  ].join('\n');
}

/** `brainfile review <task>` or `brainfile review --ready`. */
export async function reviewCommand(taskId: string | undefined, options: { file?: string; ready?: boolean; json?: boolean }, logger: Logger = defaultLogger): Promise<ReviewReport | ReadyReport> {
  const filePath = resolveCliBrainfilePath(options.file);
  if (options.ready) {
    const report = await readyReport(filePath);
    logger.log(options.json ? JSON.stringify(report, null, 2) : readyText(report));
    return report;
  }
  if (!taskId) throw new CLIError('Name the task to review, or --ready for every hand-off that can land');
  const report = await reviewReport(filePath, taskId);
  logger.log(options.json ? JSON.stringify(report, null, 2) : reviewText(report, taskTitle(filePath, taskId)));
  return report;
}

/** `brainfile land <task> [--into <branch>]`. Exits non-zero when it did not land. */
export async function landCommand(taskId: string, options: { file?: string; into?: string; json?: boolean }, logger: Logger = defaultLogger): Promise<LandReport> {
  const report = await landReport(resolveCliBrainfilePath(options.file), taskId, { into: options.into });
  if (options.json) logger.log(JSON.stringify(report, null, 2));
  else if (report.landed) logger.log(chalk.green(report.completed ? `${report.message}. ${taskId} is done.` : report.message));
  else logger.log(report.sentBack ? chalk.yellow(report.message) : chalk.red(report.message));
  if (!report.landed && !report.sentBack) throw new CLIError(`${taskId} did not land`);
  return report;
}

/** `brainfile discard <task>`. */
export async function discardCommand(taskId: string, options: { file?: string; json?: boolean }, logger: Logger = defaultLogger): Promise<DiscardReport> {
  const report = await discardReport(resolveCliBrainfilePath(options.file), taskId);
  logger.log(options.json ? JSON.stringify(report, null, 2) : report.message);
  return report;
}
