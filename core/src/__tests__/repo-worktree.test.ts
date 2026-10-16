/**
 * A worktree per hand-off (spec-14): made, found again, reviewed, merged and
 * discarded, on scratch git repositories whose board lives on the board
 * branch. Each repository carries its own git identity. Moved from the
 * desktop with the code (task-76), with the landing lock across processes.
 */
import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import { currentHost } from '../dispatchRecord';
import {
  bringIn,
  branchesOf,
  canBranch,
  collisions,
  discardReview,
  handOffTarget,
  keepBranch,
  landingLockOf,
  landReview,
  lintLandsOn,
  offerEpicBranch,
  onlyReads,
  prepareBranch,
  prepareEpicBranch,
  prepareTarget,
  prepareWorktree,
  readLandingLock,
  readyToMerge,
  refreshTarget,
  releaseReader,
  reviewOf,
  runChecks,
  sendBackNote,
  takeLandingLock,
  trunkOf,
  tryLandingLock,
  uncommittedIn,
  unlanded,
  whyNotMerge,
  locateBoard,
  type Landing,
} from '../repo';

jest.setTimeout(30_000);

const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_WORKTREES'];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' });
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n';

let base: string;
let repo: string;
let root: string;

function identity(cwd: string): void {
  git(['config', 'user.name', 'Test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  git(['config', 'commit.gpgsign', 'false'], cwd);
}

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-worktree-')));
  repo = path.join(base, 'repo');
  root = path.join(base, 'worktrees');
  // Whatever reaches prepareWorktree with no root of its own (offerEpicBranch's default) goes here too, never under the person's home.
  process.env.BRAINFILE_WORKTREES = root;
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  identity(repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  // The board on its own branch, at its home, kept out of the code.
  const home = path.join(repo, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], repo);
  fs.mkdirSync(path.join(home, 'board'));
  fs.mkdirSync(path.join(home, 'logs'));
  fs.writeFileSync(path.join(home, 'brainfile.md'), CONFIG);
  fs.writeFileSync(path.join(home, 'board', 'task-1.md'), '---\nid: task-1\ntitle: One\ncolumn: todo\n---\n');
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.brainfile/\n');
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** The agent's turn: a change in the worktree, committed or not. */
function work(at: string, file: string, content: string, commit = true): void {
  fs.writeFileSync(path.join(at, file), content);
  if (!commit) return;
  identity(at);
  git(['add', '-A'], at);
  git(['commit', '-q', '-m', `edit ${file}`], at);
}

const branches = () => git(['branch', '--format=%(refname:short)'], repo).split('\n');

test('a hand-off gets its own worktree on dispatch/<id>, and the board is still the shared one', () => {
  const wt = prepareWorktree(repo, 'task-1', root);
  assert.ok(wt);
  assert.equal(wt.branch, 'dispatch/task-1');
  assert.equal(wt.base, 'main');
  assert.equal(wt.resumed, false);
  assert.ok(wt.path.startsWith(root));
  assert.equal(git(['symbolic-ref', '--short', 'HEAD'], wt.path), 'dispatch/task-1');
  // The person's checkout stays where it was.
  assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'main');
  const located = locateBoard(wt.path, { materialize: false });
  assert.ok(located.found);
  assert.equal(located.dotDir, path.join(repo, '.brainfile'));
});

test('a second hand-off of the same task finds its worktree, and knows it has been there', () => {
  const first = prepareWorktree(repo, 'task-1', root)!;
  work(first.path, 'a.txt', 'a\n');
  const again = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(again.path, first.path);
  assert.equal(again.resumed, true);
});

test('a worktree whose folder was deleted is made again from its branch', () => {
  const first = prepareWorktree(repo, 'task-1', root)!;
  work(first.path, 'a.txt', 'a\n');
  fs.rmSync(first.path, { recursive: true, force: true });
  const again = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(fs.readFileSync(path.join(again.path, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(again.resumed, true);
});

test('the review says what is on the branch and what is not committed', () => {
  assert.equal(reviewOf(repo, 'task-1'), null);
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'one\ntwo\n');
  work(wt.path, 'README.md', 'code, changed\n');
  work(wt.path, 'b.txt', 'loose\n', false);
  const review = reviewOf(repo, 'task-1')!;
  assert.equal(review.branch, 'dispatch/task-1');
  assert.equal(review.into, 'main');
  assert.equal(review.ahead, 2);
  assert.deepEqual(review.commits.map((c) => c.subject), ['edit README.md', 'edit a.txt']);
  assert.equal(review.filesChanged, 2);
  assert.equal(review.added, 3);
  assert.equal(review.removed, 1);
  assert.equal(review.uncommitted, 1);
  assert.equal(review.merged, false);
});

/** A landing that must have landed; its message. */
async function landed(taskId: string, options: Parameters<typeof landReview>[2] = {}): Promise<string> {
  const result = await landReview(repo, taskId, options);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.ok ? result.message : '';
}

/** A landing that must not have; why. */
async function refused(taskId: string, options: Parameters<typeof landReview>[2] = {}) {
  const result = await landReview(repo, taskId, options);
  assert.ok(!result.ok, 'it landed');
  return result as Exclude<typeof result, { ok: true }>;
}

test('merge waits for uncommitted work, then merges and lets the worktree and branch go', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'a\n');
  work(wt.path, 'b.txt', 'b\n', false);
  assert.match((await refused('task-1', { title: 'One' })).error, /not committed/);
  assert.ok(fs.existsSync(wt.path));
  fs.rmSync(path.join(wt.path, 'b.txt'));

  assert.match(await landed('task-1', { title: 'One' }), /Merged dispatch\/task-1 into main/);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(git(['log', '-1', '--format=%s'], repo), 'Merge task-1: One');
  assert.ok(!fs.existsSync(wt.path));
  assert.ok(!branches().includes('dispatch/task-1'));
  assert.equal(reviewOf(repo, 'task-1'), null);
  // The repository's folder of worktrees goes with its last one.
  assert.ok(!fs.existsSync(path.dirname(wt.path)));
});

test('a merge that would conflict is said before, and changes nothing', async () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'README.md', 'theirs\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'mine\n');
  git(['commit', '-q', '-am', 'mine'], repo);
  assert.deepEqual(reviewOf(repo, 'task-1')!.conflicts, ['README.md']);
  const head = git(['rev-parse', 'HEAD'], repo);
  const branchTip = git(['rev-parse', 'dispatch/task-1'], repo);
  const result = await refused('task-1');
  assert.equal(result.kind, 'conflict');
  assert.match(result.error, /conflicts with main in README\.md/);
  if (result.kind === 'conflict') assert.deepEqual(result.files, ['README.md']);
  assert.equal(git(['rev-parse', 'HEAD'], repo), head);
  assert.equal(git(['status', '--porcelain'], repo), '');
  // The worktree is as the agent left it: the merge was let go.
  assert.equal(git(['rev-parse', 'HEAD'], wt.path), branchTip);
  assert.equal(git(['status', '--porcelain'], wt.path), '');
});

test('nothing committed is nothing to merge', async () => {
  prepareWorktree(repo, 'task-1', root);
  assert.match((await refused('task-1')).error, /no commits/);
});

test('discard throws the work away, uncommitted and all', () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'a\n');
  work(wt.path, 'b.txt', 'b\n', false);
  assert.match(discardReview(repo, 'task-1').message, /Discarded dispatch\/task-1/);
  assert.ok(!fs.existsSync(wt.path));
  assert.ok(!branches().includes('dispatch/task-1'));
  assert.ok(!fs.existsSync(path.join(repo, 'a.txt')));
});

test('a board kept as files in the code is not branched: it would be copied, not shared', () => {
  const plain = path.join(base, 'plain');
  fs.mkdirSync(path.join(plain, '.brainfile', 'board'), { recursive: true });
  fs.mkdirSync(path.join(plain, '.brainfile', 'logs'));
  fs.writeFileSync(path.join(plain, '.brainfile', 'brainfile.md'), CONFIG);
  git(['init', '-q', '-b', 'main'], plain);
  identity(plain);
  git(['add', '-A'], plain);
  git(['commit', '-q', '-m', 'init'], plain);
  assert.equal(canBranch(plain), null);
  assert.equal(prepareWorktree(plain, 'task-1', root), null);
});

test('the files left uncommitted in a worktree are named, the first one too', () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'README.md', 'changed\n', false);
  work(wt.path, 'new.txt', 'new\n', false);
  assert.deepEqual(uncommittedIn(wt.path), { files: ['README.md', 'new.txt'], count: 2 });
});

// ── The trunk (decision-11) ─────────────────────────────────────────────────

/** The person's checkout on a branch of their own, a commit ahead of main. */
function onFeature(): string {
  git(['checkout', '-q', '-b', 'feature'], repo);
  fs.writeFileSync(path.join(repo, 'unfinished.txt'), 'mine\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'unfinished'], repo);
  return git(['rev-parse', 'main'], repo);
}

test('a hand-off forks from the trunk, not from the branch the checkout is on', () => {
  const mainTip = onFeature();
  const wt = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(wt.base, 'main');
  assert.equal(git(['rev-parse', 'HEAD'], wt.path), mainTip);
  assert.ok(!fs.existsSync(path.join(wt.path, 'unfinished.txt')));
  // The person's checkout stays where it was.
  assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'feature');
});

test('it lands on the trunk without the checkout: the person\'s branch and folder are untouched', async () => {
  onFeature();
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'a\n');
  const review = reviewOf(repo, 'task-1')!;
  assert.equal(review.into, 'main');
  assert.equal(review.checkout, 'feature');
  const feature = git(['rev-parse', 'feature'], repo);
  const mainBefore = git(['rev-parse', 'main'], repo);
  assert.match(await landed('task-1', { title: 'One' }), /into main/);
  assert.equal(git(['rev-parse', 'feature'], repo), feature);
  assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'feature');
  assert.ok(!fs.existsSync(path.join(repo, 'a.txt')));
  // main is the landing commit: the old tip, then the branch.
  assert.equal(git(['log', '-1', '--format=%s', 'main'], repo), 'Merge task-1: One');
  assert.equal(git(['rev-parse', 'main^1'], repo), mainBefore);
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');
  assert.ok(!branches().includes('dispatch/task-1'));
});

test('work on a branch is unlanded until it is on the trunk; no worktree, or nothing committed, is not', async () => {
  assert.equal(unlanded(repo, 'task-1'), false);
  const wt = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(unlanded(repo, 'task-1'), false);
  work(wt.path, 'a.txt', 'a\n');
  assert.equal(unlanded(repo, 'task-1'), true);
  git(['merge', '--no-ff', '--quiet', '-m', 'Merged by hand', 'dispatch/task-1'], repo);
  assert.equal(unlanded(repo, 'task-1'), false);
});

test('a branch made before decision-11 keeps going into the branch it was started from', async () => {
  onFeature();
  const wt = prepareWorktree(repo, 'task-1', root)!;
  git(['config', 'branch.dispatch/task-1.brainfileBase', 'feature'], repo);
  work(wt.path, 'a.txt', 'a\n');
  assert.equal(reviewOf(repo, 'task-1')!.into, 'feature');
  assert.match(await landed('task-1'), /into feature/);
});

test('the trunk is the branch brainfile.trunk names, else origin\'s default, else main', () => {
  assert.deepEqual(trunkOf(repo), { name: 'main', ref: 'main' });
  // origin's default branch, known only as origin's copy: forked from there.
  git(['update-ref', 'refs/remotes/origin/trunk', 'HEAD'], repo);
  git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], repo);
  assert.deepEqual(trunkOf(repo), { name: 'trunk', ref: 'origin/trunk' });
  // The repository's own setting wins.
  git(['branch', 'next'], repo);
  git(['config', 'brainfile.trunk', 'next'], repo);
  assert.deepEqual(trunkOf(repo), { name: 'next', ref: 'next' });
  const wt = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(wt.base, 'next');
});

// ── A hand-off that only reads (decision-11) ────────────────────────────────

test('a contract only reads when every deliverable is research, a review or a link', () => {
  assert.equal(onlyReads({ deliverables: [{ type: 'research' }, { type: 'link' }, { type: 'review' }] }), true);
  assert.equal(onlyReads({ deliverables: [{ type: 'research' }, { type: 'docs' }] }), false);
  assert.equal(onlyReads({ deliverables: [] }), false);
  assert.equal(onlyReads(undefined), false);
});

test('a hand-off that only reads gets a detached checkout of the trunk and no branch', async () => {
  const mainTip = onFeature();
  const wt = prepareWorktree(repo, 'task-1', root, true)!;
  assert.equal(wt.branch, null);
  assert.equal(wt.base, 'main');
  assert.equal(git(['rev-parse', 'HEAD'], wt.path), mainTip);
  assert.equal(spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: wt.path }).status, 1);
  assert.ok(!branches().some((b) => b.startsWith('dispatch/')));
  // The board is still the shared one.
  const located = locateBoard(wt.path, { materialize: false });
  assert.ok(located.found && located.storage === 'linked');
  // Found again, not made twice.
  assert.equal(prepareWorktree(repo, 'task-1', root, true)!.path, wt.path);

  const review = reviewOf(repo, 'task-1')!;
  assert.equal(review.branch, null);
  assert.equal(review.ahead, 0);
  assert.match((await refused('task-1')).error, /nothing to merge/);
});

test('a read-only checkout goes when its hand-off ends, unless something was left in it', () => {
  const clean = prepareWorktree(repo, 'task-1', root, true)!;
  assert.equal(releaseReader(repo, 'task-1'), true);
  assert.ok(!fs.existsSync(clean.path));
  assert.equal(reviewOf(repo, 'task-1'), null);

  const left = prepareWorktree(repo, 'task-1', root, true)!;
  work(left.path, 'notes.txt', 'left\n', false);
  assert.equal(releaseReader(repo, 'task-1'), false);
  assert.equal(reviewOf(repo, 'task-1')!.uncommitted, 1);
  assert.match(discardReview(repo, 'task-1').message, /read-only checkout/);
  assert.ok(!fs.existsSync(left.path));
  assert.ok(!branches().some((b) => b.startsWith('dispatch/')));
});

test('a task that read and now writes gets its branch; one with a branch keeps it when it reads', () => {
  const reader = prepareWorktree(repo, 'task-1', root, true)!;
  const writer = prepareWorktree(repo, 'task-1', root)!;
  assert.equal(writer.branch, 'dispatch/task-1');
  assert.equal(writer.path, reader.path);
  work(writer.path, 'a.txt', 'a\n');
  const again = prepareWorktree(repo, 'task-1', root, true)!;
  assert.equal(again.branch, 'dispatch/task-1');
  assert.equal(again.resumed, true);
});

// ── Ready to merge (task-69) ────────────────────────────────────────────────

/** A board task for each id, so the worktrees are the board's hand-offs. */
function handOff(taskId: string): string {
  return prepareWorktree(repo, taskId, root)!.path;
}

test('ready to merge: commits not in the trunk, nothing uncommitted, not merged; a conflict is said', () => {
  const ready = handOff('task-1');
  work(ready, 'a.txt', 'one\ntwo\n');

  const clashing = handOff('task-2');
  work(clashing, 'README.md', 'theirs\n');

  const loose = handOff('task-3');
  work(loose, 'b.txt', 'b\n');
  work(loose, 'c.txt', 'c\n', false);

  handOff('task-4'); // nothing committed

  const merged = handOff('task-5');
  work(merged, 'd.txt', 'd\n');
  git(['merge', '-q', '--no-ff', '-m', 'merged by hand', 'dispatch/task-5'], repo);

  // The trunk moves under task-2's change.
  fs.writeFileSync(path.join(repo, 'README.md'), 'mine\n');
  git(['commit', '-q', '-am', 'mine'], repo);

  const found = readyToMerge(repo).sort((x, y) => x.taskId.localeCompare(y.taskId));
  assert.deepEqual(
    found.map(({ taskId, into, ahead, added, removed, conflicts }) => ({ taskId, into, ahead, added, removed, conflicts })),
    [
      { taskId: 'task-1', into: 'main', ahead: 1, added: 2, removed: 0, conflicts: false },
      { taskId: 'task-2', into: 'main', ahead: 1, added: 1, removed: 1, conflicts: true },
    ]
  );
  // merge-tree wrote nothing: the trunk and the checkout are as they were.
  assert.equal(git(['status', '--porcelain'], repo), '');
});

test('merged on the forge is merged: a squash on the trunk, or a pull request in origin while the local trunk is behind', () => {
  const squashed = handOff('task-1');
  work(squashed, 'a.txt', 'a\n');
  work(squashed, 'b.txt', 'b\n');
  git(['merge', '-q', '--squash', 'dispatch/task-1'], repo);
  git(['commit', '-q', '-m', 'squashed (#1)'], repo);

  // origin is a clone; the pull request merges there, and the local main is never pulled.
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['fetch', '-q', 'origin'], repo);
  git(['remote', 'set-head', 'origin', 'main'], repo);
  const pulled = handOff('task-2');
  work(pulled, 'c.txt', 'c\n');
  git(['push', '-q', 'origin', 'dispatch/task-2:main'], repo);
  git(['fetch', '-q', 'origin'], repo);

  const open = handOff('task-3');
  work(open, 'd.txt', 'd\n');

  assert.equal(reviewOf(repo, 'task-1')?.merged, true);
  assert.equal(reviewOf(repo, 'task-2')?.merged, true);
  assert.deepEqual(readyToMerge(repo).map((r) => r.taskId), ['task-3']);
});

test('a local trunk only behind origin\'s is forked past, and landing brings it up to date; one with its own commits is kept', async () => {
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  // A pull request merged on the forge, never pulled here.
  const elsewhere = path.join(base, 'elsewhere');
  git(['clone', '-q', origin, elsewhere], base);
  identity(elsewhere);
  work(elsewhere, 'merged.txt', 'merged\n');
  git(['push', '-q', 'origin', 'HEAD:main'], elsewhere);
  git(['fetch', '-q', 'origin'], repo);

  const wt = handOff('task-1');
  assert.ok(fs.existsSync(path.join(wt, 'merged.txt')));
  work(wt, 'a.txt', 'a\n');
  assert.match(await landed('task-1'), /into main/);
  assert.equal(git(['show', 'main:merged.txt'], repo), 'merged');
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');

  // The local trunk now has a commit origin lacks: it is the person's, and forked from.
  git(['checkout', '-q', 'main'], repo);
  work(repo, 'mine.txt', 'mine\n');
  const kept = handOff('task-2');
  assert.ok(fs.existsSync(path.join(kept, 'mine.txt')));
});

test('ready to merge whatever the checkout is on, and a read-only checkout is never ready', () => {
  onFeature();
  work(handOff('task-1'), 'a.txt', 'a\n');
  prepareWorktree(repo, 'task-2', root, true);
  assert.deepEqual(readyToMerge(repo).map((r) => [r.taskId, r.into]), [['task-1', 'main']]);
});

// ── Checks before Merge ─────────────────────────────────────────────────────

test('the checks run in the worktree, in order, and stop at the first that fails', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  assert.deepEqual(await runChecks(wt, ['test -f a.txt', 'true']), { ok: true });
  const failed = await runChecks(wt, ['echo first > ran.txt', 'echo "two lines\nof why" >&2; exit 3', 'echo never > never.txt']);
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.command, 'echo "two lines\nof why" >&2; exit 3');
    assert.match(failed.output, /two lines\nof why/);
  }
  assert.ok(fs.existsSync(path.join(wt, 'ran.txt')));
  assert.ok(!fs.existsSync(path.join(wt, 'never.txt')));
});

/** Whether a process is still there (a zombie counts until it is reaped). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function until(what: string, check: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('a check that runs too long is stopped whole, the shell and what it started, and the result says it timed out', async () => {
  const wt = handOff('task-1');
  const began = Date.now();
  // The shell starts a sleep and waits on it: a signal to the shell alone would leave the sleep running, holding the pipes.
  const result = await runChecks(wt, ['echo starting; sleep 60 & echo $! > sleep.pid; wait; echo done > done.txt'], process.env, 300);
  assert.ok(Date.now() - began < 5_000, 'the landing waited for the sleep');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.timedOut, true);
    assert.match(result.output, /starting\nTimed out after 300ms: stopped, with what it started\./);
  }
  const pid = Number(fs.readFileSync(path.join(wt, 'sleep.pid'), 'utf-8').trim());
  assert.ok(pid > 0);
  await until('the sleep to be gone', () => !alive(pid));
  assert.ok(!fs.existsSync(path.join(wt, 'done.txt')));
});

test('Merge says why it would refuse before anything runs', () => {
  assert.match(whyNotMerge('task-1', null)!, /no worktree/);
  const wt = handOff('task-1');
  assert.match(whyNotMerge('task-1', reviewOf(repo, 'task-1'))!, /no commits/);
  work(wt, 'a.txt', 'a\n');
  assert.equal(whyNotMerge('task-1', reviewOf(repo, 'task-1')), null);
  work(wt, 'b.txt', 'b\n', false);
  assert.match(whyNotMerge('task-1', reviewOf(repo, 'task-1'))!, /not committed/);
});

// ── Landing (decision-12, task-62) ──────────────────────────────────────────

test('the trunk is brought into the branch in its worktree, and the checks run on the result', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  // The trunk moves on meanwhile, in another file.
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'b on main'], repo);
  const seen: string[] = [];
  await landed('task-1', {
    check: async (at) => {
      seen.push(fs.existsSync(path.join(at, 'a.txt')) && fs.existsSync(path.join(at, 'b.txt')) ? 'both' : 'one');
      return { ok: true };
    },
  });
  assert.deepEqual(seen, ['both']);
  // The checkout is on main: it followed by fast-forward.
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(git(['status', '--porcelain'], repo), '');
});

test('a check that fails lands nothing', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  const before = git(['rev-parse', 'main'], repo);
  const result = await refused('task-1', { check: async () => ({ ok: false, command: 'npm test', output: '1 failing' }) });
  assert.equal(result.kind, 'check');
  if (result.kind === 'check') assert.equal(result.output, '1 failing');
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.ok(fs.existsSync(wt));
});

test('when the trunk moves while the checks run, it starts again from the new tip', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  let runs = 0;
  await landed('task-1', {
    check: async () => {
      runs++;
      // Someone lands meanwhile, the first time round.
      if (runs === 1) {
        fs.writeFileSync(path.join(repo, 'c.txt'), 'c\n');
        git(['add', '-A'], repo);
        git(['commit', '-q', '-m', 'c on main meanwhile'], repo);
      }
      return { ok: true };
    },
  });
  assert.equal(runs, 2);
  assert.equal(git(['show', 'main:c.txt'], repo), 'c');
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');
  assert.equal(git(['log', '-1', '--format=%s', 'main'], repo), 'Merge task-1');
});

test('the person\'s uncommitted work on the trunk is kept, and a landing that would overwrite it waits', async () => {
  const one = handOff('task-1');
  work(one, 'a.txt', 'a\n');
  // Their own change in progress, in another file: kept across the landing.
  fs.writeFileSync(path.join(repo, 'README.md'), 'code, mine in progress\n');
  await landed('task-1');
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf-8'), 'code, mine in progress\n');

  // One that changes the file they are changing waits, and names it.
  const two = handOff('task-2');
  work(two, 'README.md', 'code, theirs\n');
  const before = git(['rev-parse', 'main'], repo);
  const result = await refused('task-2');
  assert.match(result.error, /changes README\.md, which you have changed/);
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf-8'), 'code, mine in progress\n');
});

test("a checkout on the trunk that will not take the fast-forward (a merge of the person's own in progress) is refused once, in git's words", async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  // The person's own merge, left in conflict in their checkout on main.
  git(['checkout', '-q', '-b', 'other'], repo);
  work(repo, 'README.md', 'other\n');
  git(['checkout', '-q', 'main'], repo);
  work(repo, 'README.md', 'main side\n');
  assert.notEqual(spawnSync('git', ['merge', 'other'], { cwd: repo }).status, 0);
  assert.ok(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')));
  const before = git(['rev-parse', 'main'], repo);
  let checks = 0;
  const result = await refused('task-1', { check: async () => (checks++, { ok: true }) });
  assert.equal(result.kind, 'refused');
  // git's own words for the unfinished merge, whichever it chooses to say first.
  assert.match(result.error, /Nothing was merged: your checkout on main would not take it: (?:Merging is not possible because you have unmerged files|You have not concluded your merge)/);
  // Not a moving trunk: the checks ran once, not once an attempt.
  assert.equal(checks, 1);
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.ok(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')));
  assert.ok(fs.existsSync(wt));
});

test("landing and bringing in make their merge commits past the repository's hooks: a commit-msg hook that refuses everything stops neither", async () => {
  prepareBranch(repo, 'epic-1');
  const child = prepareWorktree(repo, 'task-2', root, false, 'dispatch/epic-1')!;
  work(child.path, 'c.txt', 'c\n');
  await landed('task-2');
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  // The trunk moves on, in another file: the hand-off and the epic's branch each need a merge to bring it in.
  work(repo, 'b.txt', 'b\n');
  // Then the hook, as husky and commitlint leave one: it refuses every message.
  const hooks = path.join(repo, '.git', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'commit-msg'), '#!/bin/sh\necho "commit-msg: refused" >&2\nexit 1\n', { mode: 0o755 });
  assert.notEqual(spawnSync('git', ['commit', '-q', '--allow-empty', '-m', 'by hand'], { cwd: repo }).status, 0, 'the hook does not bite');

  assert.match(await landed('task-1', { title: 'One' }), /into main/);
  assert.equal(git(['log', '-1', '--format=%s', 'main'], repo), 'Merge task-1: One');
  assert.equal(git(['log', '-1', '--format=%s', 'main^2'], repo), 'Merge main into dispatch/task-1');
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');
  assert.deepEqual(await bringIn(repo, 'epic-1'), { ok: true, moved: true, message: 'Brought main into dispatch/epic-1' });
  assert.equal(git(['log', '-1', '--format=%s', 'dispatch/epic-1'], repo), 'Merge main into dispatch/epic-1');
  assert.equal(git(['show', 'dispatch/epic-1:b.txt'], repo), 'b');
});

test('landings run one at a time per repository', async () => {
  work(handOff('task-1'), 'a.txt', 'a\n');
  work(handOff('task-2'), 'b.txt', 'b\n');
  const order: string[] = [];
  const slow = (name: string) => async () => {
    order.push(`${name} starts`);
    await new Promise((r) => setTimeout(r, 30));
    order.push(`${name} ends`);
    return { ok: true as const };
  };
  await Promise.all([landed('task-1', { check: slow('one') }), landed('task-2', { check: slow('two') })]);
  assert.deepEqual(order, ['one starts', 'one ends', 'two starts', 'two ends']);
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');
  assert.equal(git(['show', 'main:b.txt'], repo), 'b');
});

// ── A conflict, sent back (task-63) ─────────────────────────────────────────

test('a conflict names the trunk commits it collided with and the tasks that landed them', async () => {
  const mine = handOff('task-1');
  work(mine, 'README.md', 'task-1 says\n');
  // task-2 lands first, touching the same file.
  const theirs = handOff('task-2');
  work(theirs, 'README.md', 'task-2 says\n');
  work(theirs, 'other.txt', 'x\n');
  await landed('task-2', { title: 'Two' });
  const result = await refused('task-1');
  assert.equal(result.kind, 'conflict');
  if (result.kind !== 'conflict') return;
  const met = collisions(repo, result.branch, result.into, result.files);
  assert.deepEqual(met.map((c) => [c.subject, c.taskId]), [['edit README.md', 'task-2']]);
  // A commit straight on the trunk names no task.
  fs.writeFileSync(path.join(repo, 'README.md'), 'by hand\n');
  git(['commit', '-q', '-am', 'by hand'], repo);
  assert.deepEqual(collisions(repo, result.branch, result.into, result.files).map((c) => [c.subject, c.taskId ?? null]), [
    ['by hand', null],
    ['edit README.md', 'task-2'],
  ]);
});

test('a conflict carries what it collided with, for the note that sends it back', async () => {
  const mine = handOff('task-1');
  work(mine, 'README.md', 'task-1 says\n');
  const theirs = handOff('task-2');
  work(theirs, 'README.md', 'task-2 says\n');
  await landed('task-2', { title: 'Two' });
  const result = await refused('task-1');
  assert.equal(result.kind, 'conflict');
  if (result.kind !== 'conflict') return;
  assert.deepEqual(result.collided.map((c) => [c.subject, c.taskId]), [['edit README.md', 'task-2']]);
});

// ── The send-back note (task-63, task-76) ───────────────────────────────────

const conflict: Extract<Landing, { kind: 'conflict' }> = {
  ok: false,
  kind: 'conflict',
  error: 'dispatch/task-1 conflicts with main in README.md. Nothing was merged.',
  branch: 'dispatch/task-1',
  into: 'main',
  files: ['README.md', 'src/a.ts'],
  collided: [{ sha: 'abc1234', subject: 'edit README.md', taskId: 'task-2' }, { sha: 'def5678', subject: 'by hand' }],
};

const failedCheck: Extract<Landing, { kind: 'check' }> = {
  ok: false,
  kind: 'check',
  error: 'Nothing was merged: `npm test` failed.',
  branch: 'dispatch/task-1',
  into: 'main',
  command: 'npm test',
  output: '  1 failing\n\n  expected 2\n',
};

test('a conflict goes back with the files, the commits it met and the tasks that brought them, and the checks', () => {
  const back = sendBackNote({ task: { id: 'task-1', title: 'One', contract: { status: 'ready', validation: { commands: ['npm test', 'npm run lint'] } } } as never, body: '' }, conflict);
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.round, '1 of 1');
  assert.equal(
    back.note,
    'Landing sent back (1 of 1): dispatch/task-1 conflicts with main in README.md, src/a.ts. On main since this branch started: abc1234 edit README.md (task-2); def5678 by hand.' +
      ' Merge main into this branch (git merge main), keep what both sides meant, commit the merge, and run the checks: npm test && npm run lint.'
  );
});

test('a failed check goes back with its command and the end of what it said, on one line', () => {
  const back = sendBackNote({ task: { id: 'task-1', title: 'One' }, body: '' }, failedCheck);
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.note, 'Landing sent back (1 of 1): with main brought in, `npm test` failed: 1 failing ⏎ expected 2. Fix it on this branch, commit, and run the checks again.');
  }
});

test('send-backs are counted from the task\'s log, up to the contract\'s maxRetries, else once', () => {
  const once = '## Log\n- 2026-10-15T10:00:00.000Z: Landing sent back (1 of 1): dispatch/task-1 conflicts with main in README.md.\n';
  assert.deepEqual(sendBackNote({ task: { id: 'task-1', title: 'One' }, body: once }, conflict), {
    ok: false,
    said: 'It was sent back once already: settle it, or send it back with a note.',
  });
  const task = { id: 'task-1', title: 'One', contract: { status: 'ready', maxRetries: 3 } } as never;
  const again = sendBackNote({ task, body: once }, failedCheck);
  assert.ok(again.ok && again.round === '2 of 3');
  const thrice = sendBackNote({ task, body: once.repeat(3) }, failedCheck);
  assert.deepEqual(thrice, { ok: false, said: 'It was sent back 3 times already: settle it, or send it back with a note.' });
  assert.equal(sendBackNote({ task: { id: 'task-1', title: 'One', contract: { status: 'ready', maxRetries: 0 } } as never, body: '' }, conflict).ok, false);
});

// ── Another branch to fork from and land on (decision-16) ───────────────────

test('a hand-off given a branch forks from it, records it, and is reviewed and landed against it', async () => {
  git(['branch', 'release'], repo);
  // main moves on; the release line does not have it.
  work(repo, 'main-only.txt', 'main\n');
  const releaseTip = git(['rev-parse', 'release'], repo);
  const mainTip = git(['rev-parse', 'main'], repo);

  const wt = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  assert.equal(wt.base, 'release');
  assert.equal(git(['rev-parse', 'HEAD'], wt.path), releaseTip);
  assert.equal(git(['config', '--get', 'branch.dispatch/task-1.brainfileBase'], repo), 'release');
  assert.ok(!fs.existsSync(path.join(wt.path, 'main-only.txt')));

  work(wt.path, 'fix.txt', 'fix\n');
  assert.equal(reviewOf(repo, 'task-1')!.into, 'release');
  assert.equal(unlanded(repo, 'task-1'), true);
  assert.deepEqual(readyToMerge(repo).map((r) => [r.taskId, r.into]), [['task-1', 'release']]);
  // Found again, it keeps the branch it recorded.
  assert.equal(prepareWorktree(repo, 'task-1', root)!.base, 'release');

  assert.match(await landed('task-1', { title: 'One' }), /into release/);
  assert.equal(git(['show', 'release:fix.txt'], repo), 'fix');
  assert.equal(git(['rev-parse', 'release^1'], repo), releaseTip);
  assert.equal(git(['rev-parse', 'main'], repo), mainTip);
});

test('a conflict with the given branch is found against it, not against the trunk', async () => {
  git(['branch', 'release'], repo);
  const wt = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  work(wt.path, 'README.md', 'theirs\n');
  // The release line changes the same file; main never does.
  git(['checkout', '-q', 'release'], repo);
  work(repo, 'README.md', 'release says\n');
  git(['checkout', '-q', 'main'], repo);
  assert.deepEqual(reviewOf(repo, 'task-1')!.conflicts, ['README.md']);
  const result = await refused('task-1');
  assert.equal(result.kind, 'conflict');
  if (result.kind === 'conflict') {
    assert.equal(result.into, 'release');
    assert.deepEqual(result.collided.map((c) => c.subject), ['edit README.md']);
  }
});

test('a branch only on origin is made here, following origin\'s, so the hand-off has somewhere to land', async () => {
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main:release/1.0'], repo);
  git(['fetch', '-q', 'origin'], repo);
  assert.ok(!branches().includes('release/1.0'));

  const wt = prepareWorktree(repo, 'task-1', root, false, 'release/1.0')!;
  assert.equal(wt.base, 'release/1.0');
  assert.ok(branches().includes('release/1.0'));
  assert.equal(git(['rev-parse', '--abbrev-ref', 'release/1.0@{upstream}'], repo), 'origin/release/1.0');
  work(wt.path, 'a.txt', 'a\n');
  assert.match(await landed('task-1'), /into release\/1\.0/);
  assert.equal(git(['show', 'release/1.0:a.txt'], repo), 'a');
});

test('a branch that is nowhere cannot be forked from; one that only reads forks from the branch too', () => {
  assert.throws(() => prepareWorktree(repo, 'task-1', root, false, 'nowhere'), /no branch nowhere/);
  assert.ok(!branches().some((b) => b.startsWith('dispatch/')));
  git(['branch', 'release'], repo);
  work(repo, 'main-only.txt', 'main\n');
  const reader = prepareWorktree(repo, 'task-2', root, true, 'release')!;
  assert.equal(reader.branch, null);
  assert.equal(reader.base, 'release');
  assert.equal(git(['rev-parse', 'HEAD'], reader.path), git(['rev-parse', 'release'], repo));
});

test('work merged into origin\'s copy of its target has landed; work merged into origin\'s trunk has not, for another target', () => {
  git(['branch', 'release'], repo);
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['fetch', '-q', 'origin'], repo);
  git(['remote', 'set-head', 'origin', 'main'], repo);

  const onRelease = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  work(onRelease.path, 'a.txt', 'a\n');
  const onMain = prepareWorktree(repo, 'task-2', root, false, 'release')!;
  work(onMain.path, 'b.txt', 'b\n');
  // One pull request merged into release on the forge, the other into main.
  git(['push', '-q', 'origin', 'dispatch/task-1:release'], repo);
  git(['push', '-q', 'origin', 'dispatch/task-2:main'], repo);
  git(['fetch', '-q', 'origin'], repo);

  assert.equal(reviewOf(repo, 'task-1')!.merged, true);
  assert.equal(unlanded(repo, 'task-1'), false);
  assert.equal(reviewOf(repo, 'task-2')!.merged, false);
  assert.equal(unlanded(repo, 'task-2'), true);
});

test('Merge can land on another branch than the one it goes into, made from origin\'s when only there', async () => {
  git(['branch', 'release'], repo);
  const wt = prepareWorktree(repo, 'task-1', root, false, 'release')!;
  work(wt.path, 'a.txt', 'a\n');
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main:hotfix'], repo);
  git(['fetch', '-q', 'origin'], repo);
  const releaseTip = git(['rev-parse', 'release'], repo);

  assert.match((await refused('task-1', { into: 'nowhere' })).error, /no branch nowhere/);
  assert.match(await landed('task-1', { into: 'hotfix' }), /into hotfix/);
  assert.equal(git(['show', 'hotfix:a.txt'], repo), 'a');
  assert.equal(git(['rev-parse', 'release'], repo), releaseTip);
  assert.equal(git(['rev-parse', '--abbrev-ref', 'hotfix@{upstream}'], repo), 'origin/hotfix');
});

// ── An epic's own branch (decision-16) ──────────────────────────────────────

test('an epic\'s branch is made from its target with no worktree; its children fork from it, land on it and go', async () => {
  git(['branch', 'release'], repo);
  work(repo, 'main-only.txt', 'main\n');
  const releaseTip = git(['rev-parse', 'release'], repo);

  const made = prepareBranch(repo, 'epic-1', 'release')!;
  assert.deepEqual(made, { branch: 'dispatch/epic-1', base: 'release', made: true });
  assert.equal(git(['rev-parse', 'dispatch/epic-1'], repo), releaseTip);
  assert.equal(git(['config', '--get', 'branch.dispatch/epic-1.brainfileBase'], repo), 'release');
  assert.equal(reviewOf(repo, 'epic-1'), null);
  // Found again, as it was.
  assert.deepEqual(prepareBranch(repo, 'epic-1', 'main'), { branch: 'dispatch/epic-1', base: 'release', made: false });

  const child = prepareWorktree(repo, 'task-1', root, false, 'dispatch/epic-1')!;
  assert.equal(child.base, 'dispatch/epic-1');
  work(child.path, 'a.txt', 'a\n');
  assert.equal(unlanded(repo, 'task-1'), true);
  assert.deepEqual(readyToMerge(repo).map((r) => [r.taskId, r.into]), [['task-1', 'dispatch/epic-1']]);
  assert.match(await landed('task-1', { title: 'One' }), /into dispatch\/epic-1/);
  assert.equal(git(['show', 'dispatch/epic-1:a.txt'], repo), 'a');
  assert.equal(git(['rev-parse', 'release'], repo), releaseTip);
  // The child's worktree and branch went as it landed; what waits on it may go.
  assert.ok(!branches().includes('dispatch/task-1'));
  assert.equal(unlanded(repo, 'task-1'), false);

  // Its last child done, the epic is checked out to be merged: one item in Ready to merge, into its target.
  prepareWorktree(repo, 'epic-1', root);
  const review = reviewOf(repo, 'epic-1')!;
  assert.equal(review.into, 'release');
  assert.equal(review.ahead, 2);
  assert.deepEqual(readyToMerge(repo).map((r) => [r.taskId, r.into]), [['epic-1', 'release']]);
  assert.match(await landed('epic-1', { title: 'The epic' }), /into release/);
  assert.equal(git(['show', 'release:a.txt'], repo), 'a');
  assert.ok(!branches().includes('dispatch/epic-1'));
});

test('an epic kept as a branch lets its worktree go and keeps the branch', () => {
  prepareBranch(repo, 'epic-1');
  const wt = prepareWorktree(repo, 'epic-1', root)!;
  work(wt.path, 'a.txt', 'a\n', false);
  assert.throws(() => keepBranch(repo, 'epic-1'), /not committed/);
  work(wt.path, 'a.txt', 'a\n');
  assert.deepEqual(keepBranch(repo, 'epic-1'), { message: 'Kept dispatch/epic-1 as a branch' });
  assert.ok(!fs.existsSync(wt.path));
  assert.ok(branches().includes('dispatch/epic-1'));
  assert.equal(git(['show', 'dispatch/epic-1:a.txt'], repo), 'a');
  assert.throws(() => keepBranch(repo, 'epic-1'), /no worktree/);
});

test('the target is brought into an epic\'s branch: a fast-forward with nothing of its own, else a merge, aside', async () => {
  prepareBranch(repo, 'epic-1');
  work(repo, 'one.txt', 'one\n');
  const ff = await bringIn(repo, 'epic-1');
  assert.deepEqual(ff, { ok: true, moved: true, message: 'Brought main into dispatch/epic-1' });
  assert.equal(git(['rev-parse', 'dispatch/epic-1'], repo), git(['rev-parse', 'main'], repo));
  assert.deepEqual(await bringIn(repo, 'epic-1'), { ok: true, moved: false, message: 'dispatch/epic-1 already has main' });

  // A child lands on the epic's branch; main moves on.
  const child = prepareWorktree(repo, 'task-1', root, false, 'dispatch/epic-1')!;
  work(child.path, 'a.txt', 'a\n');
  await landed('task-1');
  work(repo, 'two.txt', 'two\n');
  const mainTip = git(['rev-parse', 'main'], repo);
  const before = git(['worktree', 'list', '--porcelain'], repo);
  const merged = await bringIn(repo, 'epic-1');
  assert.ok(merged.ok && merged.moved);
  assert.equal(git(['log', '-1', '--format=%s', 'dispatch/epic-1'], repo), 'Merge main into dispatch/epic-1');
  assert.equal(git(['rev-parse', 'dispatch/epic-1^2'], repo), mainTip);
  assert.equal(git(['show', 'dispatch/epic-1:a.txt'], repo), 'a');
  // Nothing left behind, and the person's checkout untouched.
  assert.equal(git(['worktree', 'list', '--porcelain'], repo), before);
  assert.equal(git(['status', '--porcelain'], repo), '');
  // Its review shows its own work, not what main brought.
  prepareWorktree(repo, 'epic-1', root);
  const review = reviewOf(repo, 'epic-1')!;
  assert.deepEqual(review.files.map((f) => f.path), ['a.txt']);
  // Checked out, it is left alone.
  assert.match((await bringIn(repo, 'epic-1')).ok ? '' : 'refused', /refused/);
});

test('a conflict bringing the target in names the files and what it met, and changes nothing', async () => {
  prepareBranch(repo, 'epic-1');
  const child = prepareWorktree(repo, 'task-1', root, false, 'dispatch/epic-1')!;
  work(child.path, 'README.md', 'the epic says\n');
  await landed('task-1');
  work(repo, 'README.md', 'main says\n');
  const tip = git(['rev-parse', 'dispatch/epic-1'], repo);
  const result = await bringIn(repo, 'epic-1');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.kind === 'conflict');
  if (!result.ok && result.kind === 'conflict') {
    assert.deepEqual(result.files, ['README.md']);
    assert.equal(result.into, 'main');
    assert.equal(result.branch, 'dispatch/epic-1');
    assert.deepEqual(result.collided.map((c) => c.subject), ['edit README.md']);
  }
  assert.equal(git(['rev-parse', 'dispatch/epic-1'], repo), tip);
  assert.equal(git(['worktree', 'list', '--porcelain'], repo).split('\n').filter((l) => l.startsWith('worktree ')).length, 2);
  assert.match((await bringIn(repo, 'epic-404')).ok ? '' : 'refused', /refused/);
});

test('the branches a hand-off could land on: local first, origin\'s, and the targets used here, never a hand-off\'s or the board\'s', () => {
  git(['branch', 'release/1.0'], repo);
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main:hotfix'], repo);
  git(['fetch', '-q', 'origin'], repo);
  prepareWorktree(repo, 'task-1', root, false, 'release/1.0');
  prepareBranch(repo, 'epic-1');
  const list = branchesOf(repo);
  assert.equal(list.trunk, 'main');
  assert.deepEqual([...list.local].sort(), ['main', 'release/1.0']);
  assert.deepEqual(list.remote, ['hotfix']);
  assert.deepEqual(list.recent, ['release/1.0']);
  assert.deepEqual(branchesOf(base), { trunk: null, local: [], remote: [], recent: [] });
});

test('lint: a target that is no branch here or on origin, or no branch name at all, is a warning', () => {
  git(['branch', 'release'], repo);
  const issues = lintLandsOn(repo, [
    { id: 'task-1', landsOn: 'release' },
    { id: 'task-2', landsOn: 'release/2.0' },
    { id: 'task-3', landsOn: 'two words' },
    { id: 'task-4' },
  ]);
  assert.deepEqual(issues.map((i) => [i.code, i.message.split(' ')[0]]), [
    ['lands-on-missing', 'task-2'],
    ['lands-on-invalid', 'task-3:'],
  ]);
  assert.deepEqual(lintLandsOn(base, [{ id: 'task-2', landsOn: 'release/2.0' }]), []);
});

// ── The target, read from the board (decision-16) ────────────────────────────

/** A document on the board, as its frontmatter lines. */
function onBoard(id: string, lines: string[] = []): void {
  fs.writeFileSync(path.join(repo, '.brainfile', 'board', `${id}.md`), ['---', `id: ${id}`, `title: ${id}`, 'column: todo', ...lines, '---', ''].join('\n'));
}

test('the board says where a hand-off forks from and lands: its own landsOn, its parent\'s, an epic\'s branch, else the trunk', () => {
  git(['branch', 'release'], repo);
  onBoard('epic-1', ['landsOn: release', 'epicBranch: true']);
  onBoard('task-2', ['parentId: epic-1']);
  onBoard('epic-2', ['landsOn: release']);
  onBoard('task-3', ['parentId: epic-2']);
  assert.deepEqual(handOffTarget(repo, 'task-1'), {});
  assert.deepEqual(handOffTarget(repo, 'task-3'), { base: 'release' });
  assert.deepEqual(handOffTarget(repo, 'epic-1'), { base: 'release' });
  assert.deepEqual(handOffTarget(repo, 'task-2'), { base: 'dispatch/epic-1', epic: { id: 'epic-1', branch: 'dispatch/epic-1', target: 'release' } });

  // A child handed off before any lead ran: the epic's branch is made from the epic's target first.
  assert.equal(prepareTarget(repo, 'task-1'), undefined);
  assert.equal(prepareTarget(repo, 'task-2'), 'dispatch/epic-1');
  assert.equal(git(['config', '--get', 'branch.dispatch/epic-1.brainfileBase'], repo), 'release');
  assert.equal(prepareWorktree(repo, 'task-2', root, false, prepareTarget(repo, 'task-2'))!.base, 'dispatch/epic-1');
  // Only an epic with epicBranch has one.
  assert.equal(prepareEpicBranch(repo, 'epic-2'), null);
  assert.equal(prepareEpicBranch(repo, 'epic-1'), 'dispatch/epic-1');
});

test('before a hand-off from an epic\'s branch its target is brought in; its last child landed, it is put up to merge', async () => {
  onBoard('epic-1', ['epicBranch: true']);
  onBoard('task-2', ['parentId: epic-1']);
  assert.equal(await refreshTarget(repo, 'task-1'), null);
  assert.equal(offerEpicBranch(repo, 'epic-1', root), null);
  assert.equal(prepareEpicBranch(repo, 'epic-1'), 'dispatch/epic-1');
  // Nothing on it yet: nothing to merge, and the branch goes.
  assert.equal(offerEpicBranch(repo, 'epic-1', root), null);
  assert.ok(!branches().includes('dispatch/epic-1'));

  prepareEpicBranch(repo, 'epic-1');
  work(repo, 'main.txt', 'main\n');
  const refreshed = await refreshTarget(repo, 'task-2');
  assert.ok(refreshed?.ok && refreshed.moved);
  const child = prepareWorktree(repo, 'task-2', root, false, prepareTarget(repo, 'task-2'))!;
  assert.ok(fs.existsSync(path.join(child.path, 'main.txt')));
  work(child.path, 'b.txt', 'b\n');
  await landed('task-2');
  assert.deepEqual(offerEpicBranch(repo, 'epic-1', root), { branch: 'dispatch/epic-1', into: 'main' });
  // Its worktree is under the root it was given, with the hand-offs', not under the person's home.
  assert.ok(reviewOf(repo, 'epic-1')!.path.startsWith(root));
  assert.deepEqual(readyToMerge(repo).map((r) => [r.taskId, r.into]), [['epic-1', 'main']]);
  // Offered again, it is the same item.
  assert.deepEqual(offerEpicBranch(repo, 'epic-1', root), { branch: 'dispatch/epic-1', into: 'main' });
  assert.equal(offerEpicBranch(repo, 'task-2', root), null);
});

test('a child does not land on an epic\'s branch while it is checked out to be merged; the epic is offered by its branch, not the flag', async () => {
  onBoard('epic-1', ['epicBranch: true']);
  onBoard('task-2', ['parentId: epic-1']);
  onBoard('task-3', ['parentId: epic-1']);
  prepareEpicBranch(repo, 'epic-1');
  const first = prepareWorktree(repo, 'task-2', root, false, prepareTarget(repo, 'task-2'))!;
  work(first.path, 'b.txt', 'b\n');
  await landed('task-2');
  const late = prepareWorktree(repo, 'task-3', root, false, prepareTarget(repo, 'task-3'))!;
  work(late.path, 'c.txt', 'c\n');

  // The flag turned off after a child landed on the branch: its work is still offered, not left behind.
  onBoard('epic-1', []);
  assert.deepEqual(offerEpicBranch(repo, 'epic-1', root), { branch: 'dispatch/epic-1', into: 'main' });
  const tip = git(['rev-parse', 'dispatch/epic-1'], repo);
  const why = (await refused('task-3')).error;
  assert.match(why, /dispatch\/epic-1 is checked out at .*: merge or discard that first/);
  assert.equal(git(['rev-parse', 'dispatch/epic-1'], repo), tip);
  assert.equal(git(['status', '--porcelain'], reviewOf(repo, 'epic-1')!.path), '');
});

// ── The landing lock, across processes (task-76) ────────────────────────────

/**
 * A node process that takes the landing lock with core's own module, says
 * `taken`, and, told `go` on stdin, lands a commit of its own on main (made
 * with commit-tree and moved with update-ref, as a landing does), lets the
 * lock go and says `released <sha>`. With `die`, it ends holding the lock.
 */
function otherProcess(lockFile: string, mode: 'land' | 'die' = 'land') {
  const typescript = (process.features as { typescript?: string }).typescript;
  const lockModule = typescript
    ? path.resolve(__dirname, '../repo/landingLock.ts')
    : path.resolve(__dirname, '../../dist/repo/landingLock.js');
  const script = path.join(base, 'other.mjs');
  fs.writeFileSync(
    script,
    `import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const [lockModule, lockFile, repo, mode] = process.argv.slice(2);
const { takeLandingLock } = await import(pathToFileURL(lockModule).href);
const lock = await takeLandingLock(lockFile, { timeoutMs: 10000 });
if (!lock.ok) { console.log('busy'); process.exit(1); }
console.log('taken');
if (mode === 'die') process.exit(0);
const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf-8' }).stdout.trim();
process.stdin.once('data', () => {
  const old = git(['rev-parse', 'main']);
  const made = git(['commit-tree', old + '^{tree}', '-p', old, '-m', 'Merge task-9: landed elsewhere']);
  git(['update-ref', 'refs/heads/main', made, old]);
  lock.release();
  console.log('released ' + made);
  process.exit(0);
});
`
  );
  const child = spawn(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, lockModule, lockFile, repo, mode], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let out = '';
  const said = (word: string) =>
    new Promise<string>((resolve, reject) => {
      const look = () => {
        const line = out.split('\n').find((l) => l.startsWith(word));
        if (line) resolve(line);
      };
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        look();
      });
      child.on('exit', () => (look(), reject(new Error(`the other process ended saying ${JSON.stringify(out)}`))));
      look();
    });
  const ended = new Promise<void>((resolve) => child.on('exit', () => resolve()));
  return { child, said, ended };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('two processes landing at once: the second waits for the first, and its checks run once, on the first\'s result', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  const lockFile = landingLockOf(repo);
  assert.equal(lockFile, path.join(repo, '.brainfile', 'state', 'landing.lock'));
  const other = otherProcess(lockFile);
  await other.said('taken');
  assert.equal(readLandingLock(lockFile)?.pid, other.child.pid);
  assert.equal(readLandingLock(lockFile)?.host, currentHost());

  const before = git(['rev-parse', 'main'], repo);
  const seen: string[] = [];
  const landing = landReview(repo, 'task-1', {
    title: 'One',
    lock: { pollMs: 20, maxPollMs: 50 },
    check: async () => {
      seen.push(git(['rev-parse', 'main'], repo) === before ? 'main as it was' : 'main moved');
      return { ok: true };
    },
  });
  await sleep(400);
  assert.deepEqual(seen, [], 'the checks ran while the other process held the lock');
  const released = other.said('released');
  other.child.stdin!.write('go\n');
  const theirs = (await released).split(' ')[1];
  const result = await landing;
  await other.ended;
  assert.ok(result.ok, result.ok ? '' : result.error);
  assert.deepEqual(seen, ['main moved']);
  assert.equal(git(['rev-parse', 'main^1'], repo), theirs);
  assert.equal(git(['show', 'main:a.txt'], repo), 'a');
  assert.ok(!fs.existsSync(lockFile));
});

test('a lock whose process is gone is taken over', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  const lockFile = landingLockOf(repo);
  const other = otherProcess(lockFile, 'die');
  await other.said('taken');
  await other.ended;
  assert.equal(readLandingLock(lockFile)?.pid, other.child.pid);
  assert.match(await landed('task-1', { lock: { timeoutMs: 2000 } }), /into main/);
  assert.ok(!fs.existsSync(lockFile));
});

test('a landing that waits too long for another says who holds the lock, and lands nothing', async () => {
  const wt = handOff('task-1');
  work(wt, 'a.txt', 'a\n');
  const lockFile = landingLockOf(repo);
  const other = otherProcess(lockFile);
  await other.said('taken');
  try {
    const before = git(['rev-parse', 'main'], repo);
    let ran = false;
    const result = await refused('task-1', { lock: { timeoutMs: 150, pollMs: 20 }, check: async () => ((ran = true), { ok: true }) });
    assert.match(result.error, new RegExp(`Another landing in this repository is still going \\(pid ${other.child.pid} on `));
    assert.equal(ran, false);
    assert.equal(git(['rev-parse', 'main'], repo), before);
    assert.ok(fs.existsSync(wt));
  } finally {
    other.child.kill();
    await other.ended;
  }
});

test('the lock: one holder at a time, a half-written file taken over once it is old, and only its own let go', async () => {
  const lockFile = path.join(base, 'state', 'landing.lock');
  const first = tryLandingLock(lockFile);
  assert.ok(first.ok);
  const second = tryLandingLock(lockFile);
  assert.ok(!second.ok);
  if (!second.ok) assert.equal(second.holder?.pid, process.pid);
  if (first.ok) first.release();
  assert.ok(!fs.existsSync(lockFile));

  // A taker that died between making the file and writing it.
  fs.writeFileSync(lockFile, '');
  assert.ok(!tryLandingLock(lockFile).ok);
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(lockFile, old, old);
  const taken = tryLandingLock(lockFile);
  assert.ok(taken.ok);

  // Taken over meanwhile: letting go leaves the new holder's lock alone.
  const theirs = JSON.stringify({ pid: process.pid, host: currentHost(), at: new Date(0).toISOString() });
  fs.writeFileSync(lockFile, theirs);
  if (taken.ok) taken.release();
  assert.equal(fs.readFileSync(lockFile, 'utf-8'), theirs);
  fs.rmSync(lockFile);

  // Another machine's lock is waited for, not judged by a pid that means nothing here.
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 999_999_999, host: 'elsewhere', at: new Date().toISOString() }));
  const waited = await takeLandingLock(lockFile, { timeoutMs: 60, pollMs: 10 });
  assert.ok(!waited.ok);
  if (!waited.ok) assert.match(waited.error, /pid 999999999 on elsewhere/);
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 999_999_999, host: 'elsewhere', at: new Date(Date.now() - 7 * 60 * 60_000).toISOString() }));
  assert.ok((await takeLandingLock(lockFile, { timeoutMs: 60 })).ok);
});
