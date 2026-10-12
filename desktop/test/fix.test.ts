/**
 * Fix from the health list (task-34): the plan, the fix with every copy
 * backed up first, and Undo, on scratch git repositories. Each repository
 * carries its own git identity: environment variables set here do not reach
 * spawned git in every runner.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { surveyBoards } from '@brainfile/core/repo';
import { applyFix, planFix, undoFix } from '../src/host/fix.ts';

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n';

function doc(id: string, title: string, updatedAt: string): string {
  return `---\nid: ${id}\ntitle: ${title}\ncolumn: todo\ncreatedAt: "2026-01-01T00:00:00.000Z"\nupdatedAt: "${updatedAt}"\n---\n`;
}

const OLD = {
  'board/task-1.md': doc('task-1', 'One', '2026-02-01T00:00:00.000Z'),
  'board/task-2.md': doc('task-2', 'Two', '2026-02-01T00:00:00.000Z'),
};
const NEW = {
  ...OLD,
  'board/task-2.md': doc('task-2', 'Two, edited', '2026-03-01T00:00:00.000Z'),
  'board/task-3.md': doc('task-3', 'Three', '2026-03-01T00:00:00.000Z'),
};

function writeBoard(dotDir: string, docs: Record<string, string>): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), CONFIG);
  for (const [rel, content] of Object.entries(docs)) fs.writeFileSync(path.join(dotDir, rel), content);
}

function boardFiles(dir: string): string[] {
  return fs.existsSync(path.join(dir, 'board')) ? fs.readdirSync(path.join(dir, 'board')).filter((f) => f.endsWith('.md')).sort() : [];
}

const backups = (repo: string): string[] =>
  git(['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/brainfile/backups/'], repo).split('\n').filter(Boolean);

let base: string;
let repo: string;
let home: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-fix-')));
  repo = path.join(base, 'repo');
  home = path.join(repo, '.brainfile');
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.name', 'Test'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'commit.gpgsign', 'false'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** The board on its own branch, checked out at `at`; kept there or not. */
function branchBoard(docs: Record<string, string>, at: string, keep = true): void {
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', at], repo);
  writeBoard(at, docs);
  git(['add', '-A'], at);
  git(['commit', '-q', '-m', 'board'], at);
  if (!keep) git(['worktree', 'remove', at], repo);
}

/** An old plain-files board, committed on main. */
function oldBoardOnMain(): void {
  writeBoard(home, OLD);
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'old board on main'], repo);
}

test('nothing to fix: one board on its branch, at home', () => {
  branchBoard(NEW, home);
  assert.equal(planFix(home, repo), null);
  assert.throws(() => applyFix(home), /No safe fix/);
  assert.deepEqual(backups(repo), []);
});

test('old copy still in main: backs up both, untracks it in one commit, leaves staged work alone, and Undo puts it back', () => {
  oldBoardOnMain();
  // The board moved to its branch, but main still tracks the old copy (runprism.ai after the adopt).
  fs.rmSync(home, { recursive: true, force: true });
  branchBoard(NEW, home);
  fs.writeFileSync(path.join(repo, 'work.txt'), 'staged\n');
  git(['add', 'work.txt'], repo);
  // Somewhere to push main to, so the result says to.
  git(['init', '-q', '--bare', path.join(base, 'remote.git')], base);
  git(['remote', 'add', 'origin', path.join(base, 'remote.git')], repo);
  const before = git(['rev-parse', 'main'], repo);
  assert.ok(surveyBoards(home).trackedTwice);

  const plan = planFix(home, repo);
  assert.equal(plan?.kind, 'untrack');
  assert.equal(plan?.words, "Back up both, then untrack main's copy");

  const applied = applyFix(home, { expected: plan!.words, project: repo });
  assert.equal(applied.message, "Untracked main's copy. Push main to share it.");
  assert.equal(applied.backups.length, 2);
  assert.deepEqual(backups(repo).map((b) => b.replace(/^\d{8}T\d{6}Z-/, '')).sort(), ['branch', 'main']);
  // The old copy is saved as it was on main.
  const mainBackup = backups(repo).find((b) => b.endsWith('-main'))!;
  assert.equal(git(['ls-tree', '--name-only', `refs/brainfile/backups/${mainBackup}`, 'board/'], repo), 'board/task-1.md\nboard/task-2.md');

  assert.equal(git(['log', '-1', '--format=%s', 'main'], repo), 'chore: move the board to the brainfile branch');
  assert.equal(git(['rev-parse', 'main~1'], repo), before);
  assert.equal(git(['ls-files', '.brainfile'], repo), '');
  assert.match(git(['show', 'main:.gitignore'], repo), /\.brainfile\//);
  assert.equal(git(['diff', '--cached', '--name-only'], repo), 'work.txt');
  assert.equal(surveyBoards(home).trackedTwice, null);
  assert.equal(planFix(home, repo), null);

  assert.equal(undoFix(applied.undo!), 'Put back as it was.');
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.notEqual(git(['ls-files', '.brainfile'], repo), '');
  assert.equal(fs.existsSync(path.join(repo, '.gitignore')), false);
  assert.equal(git(['diff', '--cached', '--name-only'], repo), 'work.txt');
  assert.ok(surveyBoards(home).trackedTwice);
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md', 'task-3.md']);
});

test("two copies, the branch has everything (runprism.ai): backs up both, uses it, and Undo puts both back where they were", () => {
  oldBoardOnMain();
  const stray = path.join(base, 'tmp-board');
  branchBoard(NEW, stray);
  fs.mkdirSync(path.join(home, 'state'));
  fs.writeFileSync(path.join(home, 'state', 'brief.json'), '{}');
  const mainBefore = git(['rev-parse', 'main'], repo);
  const branchBefore = git(['rev-parse', 'brainfile'], repo);
  const statusBefore = git(['status', '--porcelain'], repo);
  assert.equal(surveyBoards(home).conflict?.relation, 'contained');

  const plan = planFix(home, repo);
  assert.equal(plan?.kind, 'adopt');
  assert.equal(plan?.words, "Back up both, then use the branch, untrack main's copy");
  // The project's own folder is never closed under it.
  assert.equal(planFix(home, path.join(stray, 'board')), null);

  const applied = applyFix(home, { expected: plan!.words, project: repo });
  // No remote: nowhere to push main, so nothing about pushing is said.
  assert.equal(applied.message, 'Using the branch.');
  // Ours first (the folder and the branch with its checkout), then adopt's own.
  assert.ok(applied.backups.length >= 2);
  assert.match(applied.backups[0], /-folder$/);
  assert.match(applied.backups[1], /-branch$/);

  // One board, on its branch, at .brainfile/ only, with everything; main no longer tracks it.
  assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD'], home), 'brainfile');
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md', 'task-3.md']);
  assert.equal(fs.existsSync(stray), false);
  assert.equal(git(['ls-files', '.brainfile'], repo), '');
  assert.equal(fs.readFileSync(path.join(home, 'state', 'brief.json'), 'utf-8'), '{}');
  const survey = surveyBoards(home);
  assert.equal(survey.conflict, null);
  assert.equal(survey.trackedTwice, null);
  assert.deepEqual(survey.strayWorktrees, []);

  assert.equal(undoFix(applied.undo!), 'Put back as it was.');
  // The folder is back as it was, tracked by main; the branch is back, checked out where it was.
  assert.equal(fs.existsSync(path.join(home, '.git')), false);
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md']);
  assert.equal(fs.readFileSync(path.join(home, 'board', 'task-2.md'), 'utf-8'), OLD['board/task-2.md']);
  assert.equal(fs.readFileSync(path.join(home, 'state', 'brief.json'), 'utf-8'), '{}');
  assert.equal(git(['rev-parse', 'main'], repo), mainBefore);
  assert.equal(git(['rev-parse', 'brainfile'], repo), branchBefore);
  assert.equal(git(['status', '--porcelain'], repo), statusBefore);
  assert.deepEqual(boardFiles(stray), ['task-1.md', 'task-2.md', 'task-3.md']);
  assert.equal(surveyBoards(home).conflict?.relation, 'contained');
  // The board as the fix left it was saved before Undo replaced it.
  assert.ok(backups(repo).some((b) => b.endsWith('-undo')));
});

test('two copies that each have changes: no fix, a person decides', () => {
  writeBoard(home, { ...OLD, 'board/task-9.md': doc('task-9', 'Only here', '2026-04-01T00:00:00.000Z') });
  branchBoard(NEW, path.join(base, 'tmp-board'), false);
  assert.equal(surveyBoards(home).conflict?.relation, 'diverged');
  assert.equal(planFix(home, repo), null);
});

test('a plan that changed since it was confirmed runs nothing', () => {
  oldBoardOnMain();
  fs.rmSync(home, { recursive: true, force: true });
  branchBoard(NEW, home);
  const before = git(['rev-parse', 'main'], repo);
  assert.throws(() => applyFix(home, { expected: 'Back up both, then keep this one' }), /changed/);
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.deepEqual(backups(repo), []);
});

test('a backup that cannot be saved stops the fix before anything changes', () => {
  oldBoardOnMain();
  fs.rmSync(home, { recursive: true, force: true });
  branchBoard(NEW, home);
  const before = git(['rev-parse', 'main'], repo);
  // A file where the backups' folder of refs would go: no backup can be written.
  const refs = path.join(repo, '.git', 'refs', 'brainfile');
  fs.mkdirSync(refs, { recursive: true });
  fs.writeFileSync(path.join(refs, 'backups'), 'not a folder\n');
  assert.throws(() => applyFix(home));
  assert.equal(git(['rev-parse', 'main'], repo), before);
  assert.notEqual(git(['ls-files', '.brainfile'], repo), '');
});

test("a folder board on main and origin's newer copy: uses origin's, and Undo leaves origin's copy as it was", () => {
  oldBoardOnMain();
  const remote = path.join(base, 'remote.git');
  git(['init', '-q', '--bare', remote], base);
  git(['remote', 'add', 'origin', remote], repo);
  // Someone else's board, published to origin.
  const other = path.join(base, 'other');
  fs.mkdirSync(other);
  git(['init', '-q', '-b', 'brainfile', other], base);
  git(['config', 'user.name', 'Other'], other);
  git(['config', 'user.email', 'other@example.com'], other);
  git(['config', 'commit.gpgsign', 'false'], other);
  writeBoard(other, NEW);
  git(['add', '-A'], other);
  git(['commit', '-q', '-m', 'their board'], other);
  git(['push', '-q', remote, 'HEAD:refs/brainfile/board'], other);
  const survey = surveyBoards(home, { fetch: true });
  assert.equal(survey.conflict?.relation, 'contained');
  const theirs = git(['rev-parse', 'refs/brainfile/remotes/origin/board'], repo);

  const plan = planFix(home, repo);
  assert.equal(plan?.words, "Back up both, then use origin's, untrack main's copy");
  const applied = applyFix(home, { expected: plan!.words, project: repo });
  assert.equal(applied.message, "Using origin's. Push main to share it.");
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md', 'task-3.md']);
  assert.ok(git(['merge-base', '--is-ancestor', theirs, 'brainfile'], repo) === '');
  assert.equal(surveyBoards(home).conflict, null);

  undoFix(applied.undo!);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/brainfile'], { cwd: repo }).status, 1);
  assert.equal(git(['rev-parse', 'refs/brainfile/remotes/origin/board'], repo), theirs);
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md']);
  assert.equal(surveyBoards(home).conflict?.relation, 'contained');
});

test('two copies, this folder has everything: keeps it on the branch, and Undo puts the folder back', () => {
  writeBoard(home, NEW);
  branchBoard(OLD, path.join(base, 'tmp-board'), false);
  const branchBefore = git(['rev-parse', 'brainfile'], repo);
  assert.equal(surveyBoards(home).conflict?.relation, 'contains');

  const plan = planFix(home, repo);
  assert.equal(plan?.words, 'Back up both, then keep this one');
  const applied = applyFix(home, { expected: plan!.words, project: repo });
  assert.equal(applied.message, 'Kept this one.');
  assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD'], home), 'brainfile');
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md', 'task-3.md']);
  assert.ok(git(['merge-base', '--is-ancestor', branchBefore, 'brainfile'], repo) === '');
  assert.equal(surveyBoards(home).conflict, null);

  undoFix(applied.undo!);
  assert.equal(fs.existsSync(path.join(home, '.git')), false);
  assert.deepEqual(boardFiles(home), ['task-1.md', 'task-2.md', 'task-3.md']);
  assert.equal(git(['rev-parse', 'brainfile'], repo), branchBefore);
  assert.equal(surveyBoards(home).conflict?.relation, 'contains');
});
