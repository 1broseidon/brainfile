/**
 * `brainfile pr <task>` — a hand-off landed by pull request instead of
 * Merge (decision-16, spec-18): the task's branch, `dispatch/<task>`, pushed
 * to origin and opened against the branch it lands on, recorded on the task
 * as `pullRequest:`. `--status` asks GitHub where it stands: merged, the
 * task completes (unless subtasks are left) and its worktree and local
 * branch go; closed without merging, the record says so and the hand-off can
 * be merged again. Core does the work (`@brainfile/core/forge`), as the
 * desktop's Open pull request does; GitHub is read with the CLI's client, in
 * the desktop's order of credentials.
 */
import * as path from 'path';
import chalk from 'chalk';
import {
  appendLog,
  claimHeld,
  completeTaskFile,
  findV2Task,
  getV2Dirs,
  parsePullRequest,
  readBoardConfig,
  readDispatchRecord,
  type PullRequestRecord,
} from '@brainfile/core';
import { followHandOffPullRequest, openHandOffPullRequest, type ForgeRepo, type PullRequestForge } from '@brainfile/core/forge';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { gitHubClient } from '../utils/github-auth';
import { callerAccess } from '../utils/agent-role';
import { guard, outOfScope, type Access } from './dispatch';

export const PR_COMMAND_HELP = `
Examples:
  brainfile pr task-12            Push dispatch/task-12 and open a pull request into where it lands
  brainfile pr task-12 --status   Ask GitHub where it stands; merged completes the task

The pull request goes from the task's branch into the branch it lands on (its
landsOn, its parent's, else the trunk), titled with the task's title. It is
refused, as a merge is, while the worktree has uncommitted work or the branch
has nothing to land. Only the task's branch is pushed: the trunk never is.

GitHub is asked with the gh CLI's login, then GH_TOKEN or GITHUB_TOKEN, then
the token \`brainfile auth github\` saved.
`.trimEnd();

export interface PrOptions {
  file?: string;
  /** Ask where the pull request stands, rather than open one. */
  status?: boolean;
  json?: boolean;
}

export interface PrReport {
  task: string;
  /** `opened` a pull request, or `followed` one already open (or asked about one that has ended). */
  action: 'opened' | 'followed';
  pullRequest: PullRequestRecord;
  /** Merged: whether the worktree and local branch went, and if not, why. */
  released?: boolean;
  said?: string;
  /** Merged: whether the task was completed (subtasks left keep it open). */
  completed?: boolean;
}

export interface PrDeps {
  github?: PullRequestForge;
  /** The repository on the forge; found from origin when left out. */
  repo?: ForgeRepo | null;
}

/** The task on the board, open or completed; throws when it is on neither. */
function taskOn(filePath: string, taskId: string) {
  const found = findV2Task(getV2Dirs(filePath), taskId, true);
  if (!found) throw taskNotFound(taskId);
  return found;
}

/**
 * Opens the task's pull request, or with `status` follows it. The CLI and
 * the MCP `pull_request` tool share it; throws CLIError with what was wrong.
 */
export async function pullRequestReport(filePath: string, taskId: string, options: { status?: boolean; access?: Access }, deps: PrDeps = {}): Promise<PrReport> {
  assertV2Brainfile(filePath);
  // As land is (decision-15): a worker or a discussion asks where one stands, and opens none; a lead, only in its tree.
  const access = options.access ?? {};
  if (options.status) {
    const out = outOfScope(filePath, taskId, access);
    if (out) throw new CLIError(out);
  } else guard(filePath, taskId, access, 'open a pull request');
  const projectDir = path.dirname(path.dirname(filePath));
  const github = deps.github ?? gitHubClient();
  const forge = { github, ...(deps.repo !== undefined ? { repo: deps.repo } : {}) };
  const found = taskOn(filePath, taskId);

  if (!options.status) {
    const claim = readDispatchRecord(found.doc.task)?.claim;
    if (claimHeld(claim)) throw new CLIError(`A ${claim.runner} runner on ${claim.host} is still at work on ${taskId}: open it once it is done`);
    const opened = await openHandOffPullRequest(projectDir, taskId, forge);
    if (!opened.ok) throw new CLIError(opened.error);
    return { task: taskId, action: 'opened', pullRequest: opened.value };
  }

  const followed = await followHandOffPullRequest(projectDir, taskId, { ...forge, force: true });
  if (!followed) {
    const ended = parsePullRequest(found.doc.task.pullRequest);
    if (ended) return { task: taskId, action: 'followed', pullRequest: ended };
    throw new CLIError(`${taskId} has no pull request`, undefined, `Open one with: brainfile pr ${taskId}`);
  }
  if (!followed.ok) throw new CLIError(followed.error);
  const { value } = followed;
  if (value.state !== 'merged') return { task: taskId, action: 'followed', pullRequest: value.record };
  return { task: taskId, action: 'followed', pullRequest: value.record, released: value.released, said: value.said, completed: settleMerged(filePath, taskId) };
}

/** Merged on the forge is the person's yes, as Merge is: the task completes, unless subtasks are left. True when it did. */
function settleMerged(filePath: string, taskId: string): boolean {
  const found = taskOn(filePath, taskId);
  if (found.isLog) return true;
  const subtasks = found.doc.task.subtasks ?? [];
  const left = subtasks.filter((s) => !s.completed).length;
  if (left > 0) {
    appendLog(found.filePath, `Merged; ${left} of ${subtasks.length} subtasks left, so it stays open`);
    return false;
  }
  const types = readBoardConfig(filePath)?.config?.types;
  const done = completeTaskFile(found.filePath, getV2Dirs(filePath).logsDir, { types });
  if (!done.success) throw operationFailed(done.error ?? `Could not complete ${taskId}`);
  return true;
}

/** `brainfile pr <task> [--status]`. */
export async function prCommand(taskId: string, options: PrOptions, logger: Logger = defaultLogger, deps: PrDeps = {}): Promise<PrReport> {
  const filePath = resolveCliBrainfilePath(options.file);
  const report = await pullRequestReport(filePath, taskId, { status: options.status, access: callerAccess() }, deps);
  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }
  const pr = report.pullRequest;
  const where = `#${pr.number} ${pr.head} → ${pr.base}`;
  if (report.action === 'opened') {
    logger.log(chalk.green(`Opened pull request ${where}`));
    logger.log(chalk.gray(pr.url));
    return report;
  }
  logger.log(`${where}: ${pr.state === 'open' ? chalk.cyan('open') : pr.state === 'merged' ? chalk.green('merged') : chalk.yellow('closed without merging')}`);
  if (pr.state === 'merged' && report.said) logger.log(chalk.gray(report.released ? report.said : `The worktree stays: ${report.said}`));
  if (pr.state === 'merged' && report.completed !== undefined) logger.log(report.completed ? `${taskId} is done.` : chalk.yellow(`${taskId} stays open: subtasks are left.`));
  if (pr.state === 'closed') logger.log(chalk.gray(`Merge it, or open another: brainfile pr ${taskId}`));
  logger.log(chalk.gray(pr.url));
  return report;
}
