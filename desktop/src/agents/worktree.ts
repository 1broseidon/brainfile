/**
 * A worktree per hand-off (spec-14): each dispatched task gets its own git
 * worktree and branch, so two agents, or an agent and the person, never
 * share one checkout, and an agent never edits the running app's own files.
 * The board is still shared: it lives on the board branch, which every
 * worktree of the repository reaches.
 *
 * A hand-off forks from the trunk (decision-11), not from whatever the
 * person's checkout is on: the branch `brainfile.trunk` names in the
 * repository's git config, else origin's default branch, else main. A
 * hand-off that only reads (its contract's deliverables are all research, a
 * review or a link) gets a detached checkout of the trunk's tip instead, and
 * leaves no branch behind.
 *
 * The branch is `dispatch/<task-id>`, not `brainfile/<task-id>`: git cannot
 * hold `refs/heads/brainfile/…` beside the board branch `refs/heads/brainfile`.
 * The branch it came from, and the commit, are kept in the branch's own git
 * config (`branch.dispatch/<id>.brainfileBase`, `.brainfileFork`), so
 * nothing else needs storing.
 *
 * Not an IDE: the review says what changed, opens it in the person's editor,
 * merges it or throws it away. It never edits a diff.
 */
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { git, gitToplevel, listWorktrees, locateBoard } from '@brainfile/core/repo';
import type { ReadyView, ReviewView } from '../shared/api';

export const BRANCH_PREFIX = 'dispatch/';
const BASE_KEY = 'brainfileBase';
const FORK_KEY = 'brainfileFork';
const TRUNK_KEY = 'brainfile.trunk';
/** Deliverables that write nothing into the code: a contract made only of these only reads. */
const READING = new Set(['research', 'review', 'link']);
/** How many commits and files a review lists; the totals cover the rest. */
const SHOWN = 12;

/** Where hand-offs are checked out: out of the person's projects, and out of the running app's checkout. */
export function worktreesRoot(): string {
  return process.env.BRAINFILE_WORKTREES ?? path.join(os.homedir(), '.brainfile-worktrees');
}

export const branchFor = (taskId: string): string => `${BRANCH_PREFIX}${taskId}`;

export interface Worktree {
  path: string;
  /** Null for a hand-off that only reads: a detached checkout of the trunk's tip. */
  branch: string | null;
  /** The branch it was started from, or the commit when that was detached. */
  base: string | null;
  /** The branch already carries commits: this is not the first pass. */
  resumed: boolean;
}

/** `<repo>-<hash>`: one folder per repository, so two repos' task-1 never meet. */
function repoFolder(repoRoot: string): string {
  return `${path.basename(repoRoot)}-${createHash('sha1').update(repoRoot).digest('hex').slice(0, 6)}`;
}

/** `<root>/<repo>-<hash>/<task-id>`. */
function worktreePath(repoRoot: string, taskId: string, root: string): string {
  return path.join(root, repoFolder(repoRoot), taskId);
}

/** Whether a hand-off with this contract only reads: it has deliverables, and none of them is written into the code. */
export function onlyReads(contract: { deliverables?: { type: string }[] } | undefined): boolean {
  const deliverables = contract?.deliverables ?? [];
  return deliverables.length > 0 && deliverables.every((d) => READING.has(d.type));
}

function currentBranch(cwd: string): string | null {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

function branchExists(repoRoot: string, branch: string): boolean {
  return git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).ok;
}

/**
 * The trunk (decision-11): the branch `brainfile.trunk` names, else origin's
 * default branch, else main, else master. `ref` is what a hand-off forks
 * from: the local branch, else origin's copy of it. Null when the
 * repository has none of them.
 */
export function trunkOf(repoRoot: string): { name: string; ref: string } | null {
  const named = git(['config', '--get', TRUNK_KEY], repoRoot);
  const origin = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], repoRoot);
  const fromOrigin = origin.ok && origin.stdout.startsWith('origin/') ? origin.stdout.slice('origin/'.length) : '';
  for (const name of [named.ok ? named.stdout : '', fromOrigin, 'main', 'master']) {
    if (!name) continue;
    if (branchExists(repoRoot, name)) return { name, ref: name };
    if (git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`], repoRoot).ok) return { name, ref: `origin/${name}` };
  }
  return null;
}

function recorded(repoRoot: string, branch: string, key: string): string | null {
  const r = git(['config', '--get', `branch.${branch}.${key}`], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * The commit the hand-off started from: recorded when the worktree was made,
 * else where the branch meets the one it goes into. Everything after it is
 * the agent's work, merged since or not.
 */
function forkOf(repoRoot: string, branch: string, into: string | null): string | null {
  const fork = recorded(repoRoot, branch, FORK_KEY);
  if (fork && git(['cat-file', '-e', `${fork}^{commit}`], repoRoot).ok) return fork;
  const r = git(['merge-base', into ?? 'HEAD', branch], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * Where the branch's work goes: the branch it was started from, while that
 * still exists (hand-offs made before decision-11 keep theirs), else the trunk.
 */
function intoOf(repoRoot: string, branch: string): string | null {
  const base = recorded(repoRoot, branch, BASE_KEY);
  if (base && branchExists(repoRoot, base)) return base;
  const trunk = trunkOf(repoRoot);
  return trunk && branchExists(repoRoot, trunk.name) ? trunk.name : null;
}

/** The hand-off's checkout, when there is one on disk. */
function existing(repoRoot: string, taskId: string): string | null {
  const ref = `refs/heads/${branchFor(taskId)}`;
  const hit = listWorktrees(repoRoot).find((w) => w.branch === ref);
  return hit && fs.existsSync(hit.path) ? hit.path : null;
}

/** A hand-off's read-only checkout, when there is one on disk: detached, in the task's folder. */
function existingReader(repoRoot: string, taskId: string): string | null {
  const hit = listWorktrees(repoRoot).find(
    (w) => w.detached && path.basename(w.path) === taskId && path.basename(path.dirname(w.path)) === repoFolder(repoRoot)
  );
  return hit && fs.existsSync(hit.path) ? hit.path : null;
}

function ahead(repoRoot: string, branch: string): number {
  const fork = forkOf(repoRoot, branch, intoOf(repoRoot, branch));
  const r = fork ? git(['rev-list', '--count', `${fork}..${branch}`], repoRoot) : null;
  return r?.ok ? Number(r.stdout) || 0 : 0;
}

/**
 * Whether a hand-off can have a worktree here: a repository with a commit,
 * whose board lives on the board branch, so every worktree shares it. A board
 * kept as plain files in the code would be copied, not shared: that work
 * stays in the folder, as before.
 */
export function canBranch(projectId: string): string | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot || !git(['rev-parse', '--verify', '--quiet', 'HEAD'], repoRoot).ok) return null;
  const located = locateBoard(projectId, { materialize: false });
  return located.found && located.storage === 'linked' ? repoRoot : null;
}

/**
 * The task's worktree, made on first use from the trunk's tip, and found
 * again after (a send-back, a second hand-off). One that only `reads` gets a
 * detached checkout and no branch, unless the task already has a branch:
 * the work on it is kept. Null when the project cannot branch (see canBranch).
 */
export function prepareWorktree(projectId: string, taskId: string, root = worktreesRoot(), reads = false): Worktree | null {
  const repoRoot = canBranch(projectId);
  if (!repoRoot) return null;
  const branch = branchFor(taskId);
  const trunk = trunkOf(repoRoot);
  // A checkout whose folder was deleted still holds its branch until pruned.
  git(['worktree', 'prune'], repoRoot);
  const reader = existingReader(repoRoot, taskId);
  if (reads && !branchExists(repoRoot, branch)) {
    if (reader) return { path: reader, branch: null, base: trunk?.name ?? null, resumed: false };
    const at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    const r = git(['worktree', 'add', '--detach', at, trunk?.ref ?? 'HEAD'], repoRoot);
    if (!r.ok) throw new Error(`Could not make a checkout for ${taskId}: ${r.stderr || r.stdout}`);
    return { path: at, branch: null, base: trunk?.name ?? null, resumed: false };
  }
  // It read before and writes now: the read-only checkout gives way, unless it holds changes.
  if (reader) {
    const r = git(['worktree', 'remove', reader], repoRoot);
    if (!r.ok) throw new Error(`${taskId}'s read-only checkout has changes in it: discard it first`);
  }
  let at = existing(repoRoot, taskId);
  if (!at) {
    at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    if (branchExists(repoRoot, branch)) {
      const r = git(['worktree', 'add', at, branch], repoRoot);
      if (!r.ok) throw new Error(`Could not check out ${branch}: ${r.stderr || r.stdout}`);
    } else {
      // A repository with no trunk to name forks from the checkout, as before decision-11.
      const fork = git(['rev-parse', trunk?.ref ?? 'HEAD'], repoRoot).stdout;
      const base = trunk?.name ?? currentBranch(repoRoot) ?? fork;
      const r = git(['worktree', 'add', '-b', branch, at, fork], repoRoot);
      if (!r.ok) throw new Error(`Could not make a worktree for ${taskId}: ${r.stderr || r.stdout}`);
      git(['config', `branch.${branch}.${BASE_KEY}`, base], repoRoot);
      git(['config', `branch.${branch}.${FORK_KEY}`, fork], repoRoot);
    }
  }
  return { path: at, branch, base: recorded(repoRoot, branch, BASE_KEY), resumed: ahead(repoRoot, branch) > 0 };
}

/** The work a hand-off left on its branch, for the review in the task pane; null when it has no worktree. */
export function reviewOf(projectId: string, taskId: string): ReviewView | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const at = existing(repoRoot, taskId);
  const checkout = currentBranch(repoRoot);
  if (!at) {
    // A read-only checkout has nothing to merge: only what was left in it, to throw away.
    const reader = existingReader(repoRoot, taskId);
    if (!reader) return null;
    const none = { ahead: 0, commits: [], files: [], filesChanged: 0, added: 0, removed: 0, merged: false, conflicts: [] };
    return { branch: null, path: reader, base: trunkOf(repoRoot)?.name ?? null, into: null, checkout, ...none, uncommitted: uncommittedIn(reader).count };
  }
  const branch = branchFor(taskId);
  const into = intoOf(repoRoot, branch);
  const fork = forkOf(repoRoot, branch, into);

  const log = fork ? git(['log', '--format=%h%x09%s', `${fork}..${branch}`], repoRoot) : null;
  const commits = (log?.ok ? log.stdout.split('\n').filter(Boolean) : []).map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });

  const numstat = fork ? git(['diff', '--numstat', fork, branch], repoRoot) : null;
  const files = (numstat?.ok ? numstat.stdout.split('\n').filter(Boolean) : []).map((line) => {
    const [added, removed, ...file] = line.split('\t');
    // Binary files say `-`.
    return { path: file.join('\t'), added: Number(added) || 0, removed: Number(removed) || 0 };
  });

  const uncommitted = uncommittedIn(at).count;
  const merged = !!into && commits.length > 0 && landedIn(repoRoot, branch, into);
  const conflicts = into && commits.length > 0 && !merged ? conflictsWith(repoRoot, into, branch) : [];

  return {
    branch,
    path: at,
    base: recorded(repoRoot, branch, BASE_KEY),
    into,
    checkout,
    ahead: commits.length,
    commits: commits.slice(0, SHOWN),
    files: files.slice(0, SHOWN),
    filesChanged: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
    uncommitted,
    merged,
    conflicts,
  };
}

/**
 * Whether the branch's work is already where it goes: in `into`, in what
 * `into` tracks, or in the remote's trunk, so a pull request merged on the
 * forge counts while the local branch is behind. A squash merge leaves no
 * ancestry, so a merge that would change nothing counts too.
 */
function landedIn(repoRoot: string, branch: string, into: string): boolean {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${into}@{upstream}`], repoRoot);
  const trunk = trunkOf(repoRoot)?.name;
  const places = [into, upstream.ok ? upstream.stdout : '', trunk ? `origin/${trunk}` : ''].filter(
    (ref, i, all) => ref && all.indexOf(ref) === i && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot).ok
  );
  return places.some((ref) => {
    if (git(['merge-base', '--is-ancestor', branch, ref], repoRoot).ok) return true;
    const tree = git(['merge-tree', '--write-tree', ref, branch], repoRoot);
    const own = git(['rev-parse', `${ref}^{tree}`], repoRoot);
    return tree.ok && own.ok && tree.stdout.split('\n')[0] === own.stdout;
  });
}

/**
 * The files that would conflict if the branch merged into `into` now, as
 * git's merge-tree says without writing anything; none when it would merge
 * cleanly, or when git could not say.
 */
function conflictsWith(repoRoot: string, into: string, branch: string): string[] {
  const tree = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', into, branch], repoRoot);
  if (tree.ok || tree.status !== 1) return [];
  // The tree's ID, then one conflicted file a line.
  return tree.stdout.split('\n').slice(1).filter(Boolean);
}

/** The files changed in a worktree and not committed, as git names them, the first few; the count covers the rest. */
export function uncommittedIn(at: string): { files: string[]; count: number } {
  const status = git(['status', '--porcelain'], at);
  const lines = status.ok ? status.stdout.split('\n').filter(Boolean) : [];
  // `XY path`; the output comes trimmed, so the first line may have lost a leading blank.
  return { files: lines.slice(0, SHOWN).map((l) => l.replace(/^\s?\S{1,2}\s+/, '')), count: lines.length };
}

/**
 * Every hand-off in the repository that can merge now (task-69): commits
 * not yet in the branch it goes into, nothing uncommitted, not merged
 * already. `conflicts` says git's merge-tree, which writes nothing, found
 * the merge would conflict. Whether an agent is still at it is the caller's
 * to know.
 */
export function readyToMerge(projectId: string): ReadyView[] {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return [];
  const heads = `refs/heads/${BRANCH_PREFIX}`;
  const ready: ReadyView[] = [];
  for (const w of listWorktrees(repoRoot)) {
    if (!w.branch?.startsWith(heads) || !fs.existsSync(w.path)) continue;
    const taskId = w.branch.slice(heads.length);
    const review = reviewOf(projectId, taskId);
    if (!review?.branch || !review.into || review.ahead === 0 || review.merged || review.uncommitted > 0) continue;
    ready.push({
      taskId,
      into: review.into,
      ahead: review.ahead,
      added: review.added,
      removed: review.removed,
      conflicts: review.conflicts.length > 0,
    });
  }
  return ready;
}

/** The last line of git's complaint worth showing. */
function said(r: { stderr: string; stdout: string }): string {
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').map((l) => l.replace(/^(error|fatal|hint):\s*/, '').trim());
  return lines.filter(Boolean)[0] ?? 'git refused';
}

/** Lets go of the checkout and its branch, when it has one; drops the repository's folder when it is the last. */
function cleanUp(repoRoot: string, at: string, branch: string | null, force: boolean): void {
  const removed = git(['worktree', 'remove', ...(force ? ['--force'] : []), at], repoRoot);
  if (!removed.ok) throw new Error(`Could not remove the worktree: ${said(removed)}`);
  if (branch) {
    git(['branch', force ? '-D' : '-d', branch], repoRoot);
    git(['config', '--remove-section', `branch.${branch}`], repoRoot);
  }
  try {
    fs.rmdirSync(path.dirname(at));
  } catch {
    /* another hand-off is still there */
  }
}

/** Why Merge would refuse this review, before anything runs; null when it would go ahead. */
export function whyNotMerge(taskId: string, review: ReviewView | null): string | null {
  if (!review) return `${taskId} has no worktree to merge`;
  const { branch, into } = review;
  if (!branch) return `${taskId} only read: there is nothing to merge`;
  if (!into) return `${branch} has no branch to go into: the trunk is missing`;
  if (review.uncommitted > 0) {
    return `${review.uncommitted} ${review.uncommitted === 1 ? 'file is' : 'files are'} not committed in the worktree: send it back, or commit in your editor`;
  }
  if (review.ahead === 0) return `${branch} has no commits to merge`;
  return null;
}

/** The last lines of what a check said, enough to see why it failed. */
function tail(text: string, lines = 8): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}

/**
 * Runs the contract's checks in the hand-off's worktree, one after another,
 * as a shell would, and stops at the first that fails. Asynchronous: a test
 * suite takes a while, and the agents process keeps answering meanwhile.
 */
export function runChecks(at: string, commands: string[], env: NodeJS.ProcessEnv = process.env, timeoutMs = 15 * 60_000): Promise<{ ok: true } | { ok: false; command: string; output: string }> {
  return (async () => {
    for (const command of commands) {
      const failed = await new Promise<string | null>((resolve) => {
        const child = spawn(command, { cwd: at, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const keep = (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16_000);
        };
        child.stdout.on('data', keep);
        child.stderr.on('data', keep);
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve(err.message);
        });
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          resolve(code === 0 ? null : tail(output) || (signal ? `stopped (${signal})` : `exit ${code}`));
        });
      });
      if (failed !== null) return { ok: false as const, command, output: failed };
    }
    return { ok: true as const };
  })();
}

/** What a landing came to: landed, or why not, with what task-63 needs to send a conflict back. */
export type Landing =
  | { ok: true; message: string }
  | { ok: false; kind: 'refused'; error: string }
  | { ok: false; kind: 'conflict'; error: string; branch: string; into: string; files: string[] }
  | { ok: false; kind: 'check'; error: string; branch: string; into: string; command: string; output: string };

/** The files a list names: the first three, and how many more. */
function named(files: string[]): string {
  return files.slice(0, 3).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '');
}

/**
 * What a conflict collided with (task-63): the commits on `into` since the
 * branch started that touch the conflicting files, newest first, each with
 * the task whose landing brought it (`Merge task-N: title`), when one did.
 */
export function collisions(projectId: string, branch: string, into: string, files: string[]): { sha: string; subject: string; taskId?: string }[] {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot || !files.length) return [];
  const base = git(['merge-base', into, branch], repoRoot).stdout;
  if (!base) return [];
  const log = git(['log', '--no-merges', '--format=%h%x09%s', `${base}..${into}`, '--', ...files], repoRoot);
  // The landings on the trunk's own line since the branch started, oldest first.
  const landings = git(['log', '--first-parent', '--merges', '--reverse', '--format=%H%x09%s', `${base}..${into}`], repoRoot)
    .stdout.split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t');
      return { sha, taskId: /^Merge ([a-z]+-\d+)\b/.exec(subject.join('\t'))?.[1] };
    });
  return (log.ok ? log.stdout.split('\n').filter(Boolean) : []).slice(0, SHOWN).map((line) => {
    const [sha, ...subject] = line.split('\t');
    // The first landing that holds the commit is the one that brought it; a commit made on the trunk itself has none.
    const by = landings.find((l) => git(['merge-base', '--is-ancestor', sha, l.sha], repoRoot).ok);
    const onTrunk = git(['rev-list', '--first-parent', `${base}..${into}`], repoRoot).stdout.split('\n').some((c) => c.startsWith(sha));
    const taskId = onTrunk ? undefined : by?.taskId;
    return { sha, subject: subject.join('\t'), ...(taskId ? { taskId } : {}) };
  });
}

/** Landings in flight, one chain per repository: one lands at a time. */
const landings = new Map<string, Promise<unknown>>();

function serially<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (landings.get(key) ?? Promise.resolve()).then(work, work);
  landings.set(
    key,
    next.catch(() => {})
  );
  return next;
}

/**
 * Lands the hand-off on the branch it goes into (decision-12), without
 * merging in the person's checkout: the trunk is brought into the branch
 * inside the task's own worktree, `check` runs there on the result, and the
 * landing commit (`Merge task-N: title`, the trunk's tip and the branch) is
 * made with commit-tree. The trunk moves to it only from the tip that was
 * checked: by fast-forward when the person's checkout is on it (which keeps
 * their uncommitted changes, and waits, naming the file, when the landing
 * would overwrite one), else by compare-and-swap with update-ref. If the
 * trunk moved meanwhile it starts again from the new tip. One landing at a
 * time per repository; the worktree and branch go once landed.
 */
export function landReview(
  projectId: string,
  taskId: string,
  options: { title?: string; check?: (at: string) => Promise<{ ok: true } | { ok: false; command: string; output: string }>; attempts?: number } = {}
): Promise<Landing> {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return Promise.resolve({ ok: false, kind: 'refused', error: `${taskId} has no worktree to merge` });
  return serially(repoRoot, async (): Promise<Landing> => {
    const review = reviewOf(projectId, taskId);
    const refused = whyNotMerge(taskId, review);
    if (refused || !review?.branch || !review.into) return { ok: false, kind: 'refused', error: refused ?? `${taskId} has no worktree to merge` };
    const { branch, path: at, into } = review;
    // Merged elsewhere already (the terminal, a pull request): only the worktree is left to go.
    if (review.merged) {
      cleanUp(repoRoot, at, branch, true);
      return { ok: true, message: `${branch} was already in ${into}` };
    }
    const message = `Merge ${taskId}${options.title ? `: ${options.title}` : ''}`;
    for (let attempt = 0; attempt < (options.attempts ?? 5); attempt++) {
      const old = git(['rev-parse', '--verify', `refs/heads/${into}`], repoRoot).stdout;
      if (!old) return { ok: false, kind: 'refused', error: `${into} is gone: nothing was merged` };
      // The trunk into the branch, in the task's own worktree, unless it is there already.
      if (!git(['merge-base', '--is-ancestor', old, 'HEAD'], at).ok) {
        const brought = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${into} into ${branch}`, old], at);
        if (!brought.ok) {
          const files = git(['diff', '--name-only', '--diff-filter=U'], at).stdout.split('\n').filter(Boolean);
          git(['merge', '--abort'], at);
          if (files.length) return { ok: false, kind: 'conflict', branch, into, files, error: `${branch} conflicts with ${into} in ${named(files)}. Nothing was merged.` };
          return { ok: false, kind: 'refused', error: `Nothing was merged: ${said(brought)}` };
        }
      }
      if (options.check) {
        const checked = await options.check(at);
        if (!checked.ok) return { ok: false, kind: 'check', branch, into, command: checked.command, output: checked.output, error: `Nothing was merged: \`${checked.command}\` failed.` };
      }
      const head = git(['rev-parse', 'HEAD'], at).stdout;
      const made = git(['commit-tree', `${head}^{tree}`, '-p', old, '-p', head, '-m', message], repoRoot);
      if (!made.ok || !made.stdout) return { ok: false, kind: 'refused', error: `Nothing was merged: ${said(made)}` };
      const landed = made.stdout;
      if (currentBranch(repoRoot) === into) {
        // The person's checkout follows by fast-forward, around their uncommitted changes in other files.
        const ff = git(['merge', '--ff-only', '--quiet', landed], repoRoot);
        if (ff.ok) break;
        if (/would be overwritten/.test(`${ff.stderr}\n${ff.stdout}`)) {
          const files = `${ff.stderr}\n${ff.stdout}`.split('\n').filter((l) => /^\s+\S/.test(l)).map((l) => l.trim());
          return { ok: false, kind: 'refused', error: `The merge changes ${named(files)}, which you have changed in your folder: commit or set ${files.length === 1 ? 'it' : 'them'} aside, then Merge again` };
        }
      } else if (git(['update-ref', '-m', message, `refs/heads/${into}`, landed, old], repoRoot).ok) {
        break;
      }
      // The trunk moved since it was read: again, from its new tip.
      if (attempt === (options.attempts ?? 5) - 1) return { ok: false, kind: 'refused', error: `${into} kept moving: nothing was merged, try again` };
    }
    cleanUp(repoRoot, at, branch, true);
    return { ok: true, message: `Merged ${branch} into ${into}` };
  });
}

/** Throws the hand-off's work away: its worktree, uncommitted changes and all, and its branch. */
export function discardReview(projectId: string, taskId: string): { message: string } {
  const repoRoot = gitToplevel(projectId);
  const at = repoRoot ? existing(repoRoot, taskId) : null;
  const reader = repoRoot && !at ? existingReader(repoRoot, taskId) : null;
  if (!repoRoot || (!at && !reader)) throw new Error(`${taskId} has no worktree to discard`);
  if (reader) {
    cleanUp(repoRoot, reader, null, true);
    return { message: `Discarded ${taskId}'s read-only checkout` };
  }
  cleanUp(repoRoot, at!, branchFor(taskId), true);
  return { message: `Discarded ${branchFor(taskId)}` };
}

/**
 * Lets a read-only checkout go once its hand-off has ended, as it keeps
 * nothing. One with changes left in it stays, for the person to look at and
 * discard. True when it went.
 */
export function releaseReader(projectId: string, taskId: string): boolean {
  const repoRoot = gitToplevel(projectId);
  const reader = repoRoot ? existingReader(repoRoot, taskId) : null;
  if (!repoRoot || !reader) return false;
  try {
    cleanUp(repoRoot, reader, null, false);
    return true;
  } catch {
    return false;
  }
}
