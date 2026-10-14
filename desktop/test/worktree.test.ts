/**
 * A worktree per hand-off (spec-14): made, found again, reviewed, merged and
 * discarded, on scratch git repositories whose board lives on the board
 * branch. Each repository carries its own git identity.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { locateBoard } from '@brainfile/core/repo';
import { canBranch, discardReview, mergeReview, onlyReads, prepareWorktree, readyToMerge, releaseReader, reviewOf, trunkOf, uncommittedIn } from '../src/agents/worktree.ts';

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

test('merge waits for uncommitted work, then merges and lets the worktree and branch go', () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'a\n');
  work(wt.path, 'b.txt', 'b\n', false);
  assert.throws(() => mergeReview(repo, 'task-1', 'One'), /not committed/);
  assert.ok(fs.existsSync(wt.path));
  fs.rmSync(path.join(wt.path, 'b.txt'));

  const result = mergeReview(repo, 'task-1', 'One');
  assert.match(result.message, /Merged dispatch\/task-1 into main/);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(git(['log', '-1', '--format=%s'], repo), 'Merge task-1: One');
  assert.ok(!fs.existsSync(wt.path));
  assert.ok(!branches().includes('dispatch/task-1'));
  assert.equal(reviewOf(repo, 'task-1'), null);
  // The repository's folder of worktrees goes with its last one.
  assert.ok(!fs.existsSync(path.dirname(wt.path)));
});

test('a merge that would conflict changes nothing', () => {
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'README.md', 'theirs\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'mine\n');
  git(['commit', '-q', '-am', 'mine'], repo);
  const head = git(['rev-parse', 'HEAD'], repo);
  assert.throws(() => mergeReview(repo, 'task-1'), /conflicts with main in README\.md/);
  assert.equal(git(['rev-parse', 'HEAD'], repo), head);
  assert.equal(git(['status', '--porcelain'], repo), '');
  assert.ok(fs.existsSync(wt.path));
});

test('nothing committed is nothing to merge', () => {
  prepareWorktree(repo, 'task-1', root);
  assert.throws(() => mergeReview(repo, 'task-1'), /no commits/);
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

test('its review goes into the trunk, and Merge waits until the checkout is on it', () => {
  onFeature();
  const wt = prepareWorktree(repo, 'task-1', root)!;
  work(wt.path, 'a.txt', 'a\n');
  const review = reviewOf(repo, 'task-1')!;
  assert.equal(review.into, 'main');
  assert.equal(review.checkout, 'feature');
  const feature = git(['rev-parse', 'feature'], repo);
  assert.throws(() => mergeReview(repo, 'task-1', 'One'), /goes into main, and your checkout is on feature/);
  assert.equal(git(['rev-parse', 'feature'], repo), feature);
  assert.ok(fs.existsSync(wt.path));

  git(['checkout', '-q', 'main'], repo);
  assert.match(mergeReview(repo, 'task-1', 'One').message, /into main/);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n');
  assert.equal(git(['rev-parse', 'feature'], repo), feature);
});

test('a branch made before decision-11 keeps going into the branch it was started from', () => {
  onFeature();
  const wt = prepareWorktree(repo, 'task-1', root)!;
  git(['config', 'branch.dispatch/task-1.brainfileBase', 'feature'], repo);
  work(wt.path, 'a.txt', 'a\n');
  assert.equal(reviewOf(repo, 'task-1')!.into, 'feature');
  assert.match(mergeReview(repo, 'task-1').message, /into feature/);
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

test('a hand-off that only reads gets a detached checkout of the trunk and no branch', () => {
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
  assert.throws(() => mergeReview(repo, 'task-1'), /nothing to merge/);
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
    found.map(({ taskId, into, ahead, added, removed, conflicts, checkout }) => ({ taskId, into, ahead, added, removed, conflicts, checkout })),
    [
      { taskId: 'task-1', into: 'main', ahead: 1, added: 2, removed: 0, conflicts: false, checkout: 'main' },
      { taskId: 'task-2', into: 'main', ahead: 1, added: 1, removed: 1, conflicts: true, checkout: 'main' },
    ]
  );
  // merge-tree wrote nothing: the trunk and the checkout are as they were.
  assert.equal(git(['status', '--porcelain'], repo), '');
});

test('ready to merge says where the checkout is, and a read-only checkout is never ready', () => {
  onFeature();
  work(handOff('task-1'), 'a.txt', 'a\n');
  prepareWorktree(repo, 'task-2', root, true);
  const found = readyToMerge(repo);
  assert.deepEqual(found.map((r) => [r.taskId, r.into, r.checkout]), [['task-1', 'main', 'feature']]);
});
