/**
 * A pull request as a way to land (decision-16, spec-18): beside Merge, a
 * hand-off's branch is pushed to origin and a pull request opened against the
 * branch it goes into, and the task records it as `pullRequest:`. While it is
 * open the hand-off is out of Ready to merge. Merged on the forge, the task
 * completes and its worktree and local branch go; closed without merging, it
 * is back in Ready to merge.
 *
 * Landing by Merge never pushes; this is the one place a hand-off's branch
 * goes to origin, and only its own branch: the trunk is never pushed here.
 * Checks before a pull request are the forge's; it is refused, as Merge is,
 * when the worktree holds uncommitted work or the branch has nothing to land.
 *
 * GitHub only for now, through the forge client (github.ts), which is passed
 * in: the desktop's lives in its main process, the CLI's in its own. Any
 * `head` and `base` will do (`openBranchPullRequest`), so an epic branch's
 * Merge can open one too. `projectId` is the project's folder throughout.
 */
import { execFile } from 'child_process';
import { appendLog } from '../taskOperations';
import { readTaskFile, writeTaskFile } from '../taskFile';
import { extractDescription, extractLog, findV2Task, getV2Dirs } from '../workspace';
import { openPullRequestOf, pullRequestText, withPullRequest } from '../pullRequest';
import type { PullRequestRecord } from '../types/base';
import { git, gitToplevel } from '../repo/boardRepo';
import { locateBoard } from '../repo/locate';
import { discardReview, reviewOf, whyNotMerge, type HandOffReview } from '../repo/worktree';
import { carriedUnpushed, followOrigin } from '../repo/unpushed';
import type { ForgeResult, GitHub, NewPullRequest, PullRequestView } from './github';
import { detectForge, type ForgeRepo } from './remote';

/** A push or fetch never prompts, and gives up instead of hanging. */
const NO_PROMPT: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', SSH_ASKPASS: 'echo' };
const PUSH_TIMEOUT_MS = 120_000;
const FETCH_TIMEOUT_MS = 30_000;

/** What opening and following a pull request needs of the forge. */
export type PullRequestForge = Pick<GitHub, 'openPullRequest' | 'pullRequestState'>;

export interface PullRequestDeps {
  github: PullRequestForge;
  /** The repository on the forge; found from the project's origin when left out. */
  repo?: ForgeRepo | null;
}

export interface HandOffPullRequestDeps extends PullRequestDeps {
  /**
   * Writes `pullRequest:` on the task (null never comes here). By default the
   * task file itself; the desktop's goes through its board host, so it
   * commits like any change.
   */
  record?: (record: PullRequestRecord, note: string) => unknown | Promise<unknown>;
}

/**
 * A git call that reaches origin, without holding up the process meanwhile:
 * the desktop's agents process keeps answering while a push goes. Never
 * prompts; gives up after `timeoutMs`.
 */
function gitRemote(args: string[], cwd: string, timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env: { ...process.env, ...NO_PROMPT }, timeout: timeoutMs, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout ?? '').trim(), stderr: String(stderr ?? '').trim() || (err && !stdout ? err.message : '') });
    });
  });
}

/** The last line of git's complaint worth showing. */
function said(r: { stderr: string; stdout: string }): string {
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').map((l) => l.replace(/^(error|fatal|hint|remote):\s*/, '').trim());
  return lines.filter(Boolean)[0] ?? 'git refused';
}

/** Pushes the local `branch` to origin under its own name. Never prompts; nothing else is pushed. */
export async function pushBranch(projectId: string, branch: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return { ok: false, error: `${projectId} is not a git repository` };
  if (!git(['remote', 'get-url', 'origin'], repoRoot).ok) return { ok: false, error: 'This repository has no origin to push to' };
  if (!git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).ok) return { ok: false, error: `There is no branch ${branch} to push` };
  const pushed = await gitRemote(['push', '--quiet', '--no-verify', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], repoRoot, PUSH_TIMEOUT_MS);
  return pushed.ok ? { ok: true } : { ok: false, error: `Could not push ${branch}: ${said(pushed)}` };
}

async function forgeRepo(projectId: string, deps: PullRequestDeps): Promise<ForgeResult<ForgeRepo>> {
  const repo = deps.repo === undefined ? await detectForge(projectId) : deps.repo;
  return repo ? { ok: true, value: repo } : { ok: false, error: "The project's origin is not on GitHub: a pull request has nowhere to go." };
}

const recordOf = (view: PullRequestView, pr: Pick<NewPullRequest, 'head' | 'base'>): PullRequestRecord => ({
  number: view.number,
  url: view.url,
  state: view.state,
  base: view.base || pr.base,
  head: view.head || pr.head,
  at: new Date().toISOString(),
});

/**
 * Why a pull request from `head` into origin's `base` would carry more than
 * `head`'s own work: landings Merge made on the local `base` and never pushed
 * (task-102). Null when it would carry only its own.
 */
export function whyNotCarry(projectId: string, head: string, base: string): string | null {
  const carried = carriedUnpushed(projectId, head, base);
  if (!carried) return null;
  const what = carried.tasks.length ? `the landings of ${carried.tasks.join(', ')}` : `${carried.count} ${carried.count === 1 ? 'commit' : 'commits'}`;
  return `${base} has ${carried.count} ${carried.count === 1 ? 'commit' : 'commits'} here that origin's ${base} does not (${what}), and the pull request would carry them too. Push ${base} first, or Merge instead.`;
}

/**
 * Pushes `head` and opens a pull request from it into `base`, for any two
 * branches: a hand-off's, or an epic branch's. `base` must be on the forge
 * already; it is never pushed here. One already open from `head` is found.
 * Refused when it would carry landings the local `base` has and origin's
 * lacks (whyNotCarry), after fetching origin's `base` to know.
 */
export async function openBranchPullRequest(projectId: string, pr: NewPullRequest, deps: PullRequestDeps): Promise<ForgeResult<PullRequestRecord>> {
  const repo = await forgeRepo(projectId, deps);
  if (!repo.ok) return repo;
  const repoRoot = gitToplevel(projectId);
  if (repoRoot) await gitRemote(['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${pr.base}:refs/remotes/origin/${pr.base}`], repoRoot, FETCH_TIMEOUT_MS);
  const carries = whyNotCarry(projectId, pr.head, pr.base);
  if (carries) return { ok: false, error: carries };
  const pushed = await pushBranch(projectId, pr.head);
  if (!pushed.ok) return pushed;
  const opened = await deps.github.openPullRequest(repo.value, pr);
  return opened.ok ? { ok: true, value: recordOf(opened.value, pr) } : opened;
}

/** Why a pull request would be refused for this review, before anything runs; null when it would go ahead. Merge's reasons, and one already landed. */
export function whyNotPullRequest(taskId: string, review: HandOffReview | null): string | null {
  const refused = whyNotMerge(taskId, review);
  if (refused) return refused.replace(/to merge\b/, 'to open a pull request for');
  if (review?.merged) return `${review.branch} is already in ${review.into}: there is nothing to open`;
  return null;
}

/** The task's document on the project's board, open or completed. */
function taskDoc(projectId: string, taskId: string) {
  const located = locateBoard(projectId, { materialize: false });
  return located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true) : null;
}

/**
 * The pull request a hand-off would open (spec-18-4): its branch into the
 * branch it goes into, titled with the task's title, the body saying the
 * task's ID, the first lines of its description and the hand-off's last
 * notes. Refused as `whyNotPullRequest` says, and while one is open already.
 */
export function handOffPullRequest(projectId: string, taskId: string): ForgeResult<NewPullRequest> {
  let review: HandOffReview | null;
  try {
    review = reviewOf(projectId, taskId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const refused = whyNotPullRequest(taskId, review);
  if (refused || !review?.branch || !review.into) return { ok: false, error: refused ?? `${taskId} has no worktree to open a pull request for` };
  const found = taskDoc(projectId, taskId);
  const open = found ? openPullRequestOf(found.doc.task) : null;
  if (open) return { ok: false, error: `${taskId} has pull request #${open.number} open already: ${open.url}` };
  const task = found?.doc.task ?? { id: taskId, title: taskId };
  const description = task.description ?? (found ? extractDescription(found.doc.body) : undefined);
  const { title, body } = pullRequestText({ id: taskId, title: task.title || taskId, description }, found ? extractLog(found.doc.body) : undefined);
  return { ok: true, value: { head: review.branch, base: review.into, title, body } };
}

/** `pullRequest:` on the task file, with a line in its log; null takes it off. For a caller with no board host (the CLI). */
export function recordPullRequestFile(projectId: string, taskId: string, record: PullRequestRecord | null, note?: string): void {
  const found = taskDoc(projectId, taskId);
  if (!found) throw new Error(`There is no ${taskId} on the board`);
  const doc = readTaskFile(found.filePath);
  if (!doc) throw new Error(`Could not read ${taskId}`);
  writeTaskFile(found.filePath, { ...withPullRequest(doc.task, record), updatedAt: new Date().toISOString() }, doc.body);
  if (note) {
    const logged = appendLog(found.filePath, note);
    if (!logged.success) throw new Error(logged.error ?? `Could not note ${taskId}`);
  }
}

/**
 * Opens the hand-off's pull request (spec-18-4): `handOffPullRequest`, then
 * the branch pushed and the pull request opened (`openBranchPullRequest`),
 * then `pullRequest:` written on the task with a line in its log. Whether an
 * agent is still at work on the branch is the caller's to know.
 */
export async function openHandOffPullRequest(projectId: string, taskId: string, deps: HandOffPullRequestDeps): Promise<ForgeResult<PullRequestRecord>> {
  const plan = handOffPullRequest(projectId, taskId);
  if (!plan.ok) return plan;
  const opened = await openBranchPullRequest(projectId, plan.value, deps);
  if (!opened.ok) return opened;
  const record = opened.value;
  const note = `Opened pull request #${record.number} from ${record.head} into ${record.base}: ${record.url}`;
  try {
    await (deps.record ?? ((r: PullRequestRecord, n: string) => recordPullRequestFile(projectId, taskId, r, n)))(record, note);
  } catch (err) {
    return { ok: false, error: `#${record.number} is open at ${record.url}, but ${taskId} could not record it: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, value: record };
}

/**
 * After a pull request merged on the forge (spec-18-5): the hand-off's
 * worktree and local branch go, once nothing in them would be lost. origin's
 * `base` is fetched first, so landedIn sees the merge; a squash or rebase it
 * cannot see is trusted when the branch's tip is in what the pull request
 * carried (`headSha`). Uncommitted files, or commits made after it was
 * pushed, keep the worktree, and say so.
 */
export async function releaseMergedHandOff(projectId: string, taskId: string, merged: Pick<PullRequestView, 'base' | 'headSha'>): Promise<{ released: boolean; said: string; followed?: string }> {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return { released: false, said: `${projectId} is not a git repository` };
  if (merged.base) await gitRemote(['fetch', '--quiet', '--no-tags', 'origin', `refs/heads/${merged.base}:refs/remotes/origin/${merged.base}`], repoRoot, FETCH_TIMEOUT_MS);
  // The branch it went into follows origin's here, so what is handed off next starts from the merge (task-102).
  const followed = merged.base ? followOrigin(projectId, merged.base) : null;
  const also = followed ? `; ${followed.said}` : '';
  const saying = (text: string) => ({ said: `${text}${also}`, ...(followed ? { followed: followed.said } : {}) });
  const review = reviewOf(projectId, taskId);
  if (!review?.branch) return { released: true, ...saying(`${taskId}'s worktree was gone already`) };
  if (review.uncommitted > 0) return { released: false, ...saying(`${review.uncommitted} ${review.uncommitted === 1 ? 'file is' : 'files are'} not committed in ${taskId}'s worktree, so it stays`) };
  const sha = merged.headSha;
  const known = (s: string) => git(['cat-file', '-e', `${s}^{commit}`], repoRoot).ok;
  // Someone pushed to the pull request from elsewhere (GitHub's Update branch): what it carried is fetched.
  if (sha && !known(sha)) await gitRemote(['fetch', '--quiet', '--no-tags', 'origin', sha], repoRoot, FETCH_TIMEOUT_MS);
  const carried = !!sha && known(sha) && git(['merge-base', '--is-ancestor', review.branch, sha], repoRoot).ok;
  if (!review.merged && !carried) return { released: false, ...saying(`${review.branch} has commits the pull request did not carry, so its worktree stays`) };
  discardReview(projectId, taskId);
  return { released: true, ...saying(`${review.branch} and its worktree are gone`) };
}

/** Where a hand-off's pull request was found, and what was done about it. */
export type PullRequestFollow =
  | { state: 'open'; record: PullRequestRecord }
  | { state: 'closed'; record: PullRequestRecord }
  /** Landed: the caller completes the task (`released` says whether the worktree went too). */
  | { state: 'merged'; record: PullRequestRecord; released: boolean; said: string };

/**
 * Follows the task's open pull request (spec-18-5): asks the forge where it
 * stands (at most once a minute unless `force`, as the client keeps it).
 * Closed without merging, the record says so and the hand-off is back in
 * Ready to merge. Merged, the worktree and branch go (`releaseMergedHandOff`)
 * and the record says merged; completing the task is the caller's (the
 * desktop's settleLanded, the CLI's complete), so subtasks left keep it open
 * as after a Merge. Null when the task has no open pull request.
 */
export async function followHandOffPullRequest(
  projectId: string,
  taskId: string,
  deps: HandOffPullRequestDeps & { force?: boolean }
): Promise<ForgeResult<PullRequestFollow> | null> {
  const found = taskDoc(projectId, taskId);
  const open = found ? openPullRequestOf(found.doc.task) : null;
  if (!open) return null;
  const repo = await forgeRepo(projectId, deps);
  if (!repo.ok) return repo;
  const asked = await deps.github.pullRequestState(repo.value, open.number, deps.force);
  if (!asked.ok) return asked;
  const view = asked.value;
  if (view.state === 'open') return { ok: true, value: { state: 'open', record: open } };
  const write = deps.record ?? ((r: PullRequestRecord, n: string) => recordPullRequestFile(projectId, taskId, r, n));
  if (view.state === 'closed') {
    const record = { ...open, state: 'closed' as const };
    await write(record, `Pull request #${open.number} was closed without merging: back in Ready to merge`);
    return { ok: true, value: { state: 'closed', record } };
  }
  const released = await releaseMergedHandOff(projectId, taskId, { base: view.base || open.base, headSha: view.headSha });
  const record = { ...open, state: 'merged' as const };
  const also = released.released ? released.followed : released.said;
  await write(record, `Pull request #${open.number} was merged into ${record.base}${also ? `; ${also}` : ''}`);
  return { ok: true, value: { state: 'merged', record, ...released } };
}
