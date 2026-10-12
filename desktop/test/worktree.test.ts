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
import { canBranch, discardReview, mergeReview, prepareWorktree, reviewOf } from '../src/agents/worktree.ts';

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
