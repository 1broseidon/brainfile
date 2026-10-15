/**
 * Fix from the health list (task-34), in core since task-78: the plan, the
 * fix with every copy backed up first, and Undo, on scratch git
 * repositories, ported from the desktop's suite. Undo reads what it needs
 * from `state/last-fix.json`, so it works from another process than the
 * fix. Each repository carries its own git identity: environment variables
 * set here do not reach spawned git in every runner.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FIX_UNDO_MS, applyFix, boardProblems, lastFix, lastFixFile, planFix, surveyBoards, undoFix } from '../repo';

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
  expect(planFix(home, repo)).toBe(null);
  expect(() => applyFix(home)).toThrow(/No safe fix/);
  expect(backups(repo)).toEqual([]);
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
  expect(surveyBoards(home).trackedTwice).toBeTruthy();

  const plan = planFix(home, repo);
  expect(plan?.kind).toBe('untrack');
  expect(plan?.words).toBe("Back up both, then untrack main's copy");

  const applied = applyFix(home, { expected: plan!.words, project: repo });
  expect(applied.message).toBe("Untracked main's copy. Push main to share it.");
  expect(applied.backups.length).toBe(2);
  expect(backups(repo).map((b) => b.replace(/^\d{8}T\d{6}Z-/, '')).sort()).toEqual(['branch', 'main']);
  // The old copy is saved as it was on main.
  const mainBackup = backups(repo).find((b) => b.endsWith('-main'))!;
  expect(git(['ls-tree', '--name-only', `refs/brainfile/backups/${mainBackup}`, 'board/'], repo)).toBe('board/task-1.md\nboard/task-2.md');

  expect(git(['log', '-1', '--format=%s', 'main'], repo)).toBe('chore: move the board to the brainfile branch');
  expect(git(['rev-parse', 'main~1'], repo)).toBe(before);
  expect(git(['ls-files', '.brainfile'], repo)).toBe('');
  expect(git(['show', 'main:.gitignore'], repo)).toMatch(/\.brainfile\//);
  expect(git(['diff', '--cached', '--name-only'], repo)).toBe('work.txt');
  expect(surveyBoards(home).trackedTwice).toBe(null);
  expect(planFix(home, repo)).toBe(null);

  expect(undoFix(home)).toBe('Put back as it was.');
  expect(git(['rev-parse', 'main'], repo)).toBe(before);
  expect(git(['ls-files', '.brainfile'], repo)).not.toBe('');
  expect(fs.existsSync(path.join(repo, '.gitignore'))).toBe(false);
  expect(git(['diff', '--cached', '--name-only'], repo)).toBe('work.txt');
  expect(surveyBoards(home).trackedTwice).toBeTruthy();
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
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
  expect(surveyBoards(home).conflict?.relation).toBe('contained');

  const plan = planFix(home, repo);
  expect(plan?.kind).toBe('adopt');
  expect(plan?.words).toBe("Back up both, then use the branch, untrack main's copy");
  // The project's own folder is never closed under it.
  expect(planFix(home, path.join(stray, 'board'))).toBe(null);

  const applied = applyFix(home, { expected: plan!.words, project: repo });
  // No remote: nowhere to push main, so nothing about pushing is said.
  expect(applied.message).toBe('Using the branch.');
  // Ours first (the folder and the branch with its checkout), then adopt's own.
  expect(applied.backups.length).toBeGreaterThanOrEqual(2);
  expect(applied.backups[0]).toMatch(/-folder$/);
  expect(applied.backups[1]).toMatch(/-branch$/);

  // One board, on its branch, at .brainfile/ only, with everything; main no longer tracks it.
  expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], home)).toBe('brainfile');
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
  expect(fs.existsSync(stray)).toBe(false);
  expect(git(['ls-files', '.brainfile'], repo)).toBe('');
  expect(fs.readFileSync(path.join(home, 'state', 'brief.json'), 'utf-8')).toBe('{}');
  const survey = surveyBoards(home);
  expect(survey.conflict).toBe(null);
  expect(survey.trackedTwice).toBe(null);
  expect(survey.strayWorktrees).toEqual([]);

  expect(undoFix(home)).toBe('Put back as it was.');
  // The folder is back as it was, tracked by main; the branch is back, checked out where it was.
  expect(fs.existsSync(path.join(home, '.git'))).toBe(false);
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md']);
  expect(fs.readFileSync(path.join(home, 'board', 'task-2.md'), 'utf-8')).toBe(OLD['board/task-2.md']);
  expect(fs.readFileSync(path.join(home, 'state', 'brief.json'), 'utf-8')).toBe('{}');
  expect(git(['rev-parse', 'main'], repo)).toBe(mainBefore);
  expect(git(['rev-parse', 'brainfile'], repo)).toBe(branchBefore);
  expect(git(['status', '--porcelain'], repo)).toBe(statusBefore);
  expect(boardFiles(stray)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
  expect(surveyBoards(home).conflict?.relation).toBe('contained');
  // The board as the fix left it was saved before Undo replaced it.
  expect(backups(repo).some((b) => b.endsWith('-undo'))).toBeTruthy();
});

test('two copies that each have changes: no fix, a person decides', () => {
  writeBoard(home, { ...OLD, 'board/task-9.md': doc('task-9', 'Only here', '2026-04-01T00:00:00.000Z') });
  branchBoard(NEW, path.join(base, 'tmp-board'), false);
  expect(surveyBoards(home).conflict?.relation).toBe('diverged');
  expect(planFix(home, repo)).toBe(null);
});

test('a plan that changed since it was confirmed runs nothing', () => {
  oldBoardOnMain();
  fs.rmSync(home, { recursive: true, force: true });
  branchBoard(NEW, home);
  const before = git(['rev-parse', 'main'], repo);
  expect(() => applyFix(home, { expected: 'Back up both, then keep this one' })).toThrow(/changed/);
  expect(git(['rev-parse', 'main'], repo)).toBe(before);
  expect(backups(repo)).toEqual([]);
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
  expect(() => applyFix(home)).toThrow();
  expect(git(['rev-parse', 'main'], repo)).toBe(before);
  expect(git(['ls-files', '.brainfile'], repo)).not.toBe('');
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
  expect(survey.conflict?.relation).toBe('contained');
  const theirs = git(['rev-parse', 'refs/brainfile/remotes/origin/board'], repo);

  const plan = planFix(home, repo);
  expect(plan?.words).toBe("Back up both, then use origin's, untrack main's copy");
  const applied = applyFix(home, { expected: plan!.words, project: repo });
  expect(applied.message).toBe("Using origin's. Push main to share it.");
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
  expect(git(['merge-base', '--is-ancestor', theirs, 'brainfile'], repo)).toBe('');
  expect(surveyBoards(home).conflict).toBe(null);

  undoFix(home);
  expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/brainfile'], { cwd: repo }).status).toBe(1);
  expect(git(['rev-parse', 'refs/brainfile/remotes/origin/board'], repo)).toBe(theirs);
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md']);
  expect(surveyBoards(home).conflict?.relation).toBe('contained');
});

test('two copies, this folder has everything: keeps it on the branch, and Undo puts the folder back', () => {
  writeBoard(home, NEW);
  branchBoard(OLD, path.join(base, 'tmp-board'), false);
  const branchBefore = git(['rev-parse', 'brainfile'], repo);
  expect(surveyBoards(home).conflict?.relation).toBe('contains');

  const plan = planFix(home, repo);
  expect(plan?.words).toBe('Back up both, then keep this one');
  const applied = applyFix(home, { expected: plan!.words, project: repo });
  expect(applied.message).toBe('Kept this one.');
  expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], home)).toBe('brainfile');
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
  expect(git(['merge-base', '--is-ancestor', branchBefore, 'brainfile'], repo)).toBe('');
  expect(surveyBoards(home).conflict).toBe(null);

  undoFix(home);
  expect(fs.existsSync(path.join(home, '.git'))).toBe(false);
  expect(boardFiles(home)).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
  expect(git(['rev-parse', 'brainfile'], repo)).toBe(branchBefore);
  expect(surveyBoards(home).conflict?.relation).toBe('contains');
});

/** main still tracks the old copy while the board lives on its branch at .brainfile/. */
function trackedTwice(): void {
  oldBoardOnMain();
  fs.rmSync(home, { recursive: true, force: true });
  branchBoard(NEW, home);
}

test('Undo from another process: the fix leaves what Undo needs in state/last-fix.json, and a fresh copy of core puts it back', () => {
  trackedTwice();
  const before = git(['rev-parse', 'main'], repo);
  const plan = planFix(home, repo)!;
  const applied = applyFix(home, { expected: plan.words, project: repo });

  const file = path.join(home, 'state', 'last-fix.json');
  expect(lastFixFile(home)).toBe(file);
  const kept = JSON.parse(fs.readFileSync(file, 'utf-8'));
  expect(kept.words).toBe("Back up both, then untrack main's copy");
  expect(kept.record).toEqual(applied.undo);
  expect(Date.now() - Date.parse(kept.at)).toBeLessThan(FIX_UNDO_MS);

  // Nothing of the fix is left in memory: a module loaded afresh, as brainfile fix --undo or the desktop would, finds it on disk.
  let fresh!: typeof import('../repo');
  jest.isolateModules(() => {
    fresh = require('../repo');
  });
  expect(fresh.lastFix(home)?.words).toBe(plan.words);
  expect(fresh.undoFix(home)).toBe('Put back as it was.');
  expect(git(['rev-parse', 'main'], repo)).toBe(before);
  expect(surveyBoards(home).trackedTwice).toBeTruthy();
  // One go: the record is gone, and a second Undo changes nothing.
  expect(fs.existsSync(file)).toBe(false);
  expect(() => undoFix(home)).toThrow(/Too late to undo/);
  expect(git(['rev-parse', 'main'], repo)).toBe(before);
});

test('Undo is refused once 20 seconds have passed, and changes nothing', () => {
  trackedTwice();
  const plan = planFix(home, repo)!;
  const at = Date.now();
  applyFix(home, { expected: plan.words, project: repo, now: at });
  const after = git(['rev-parse', 'main'], repo);
  expect(lastFix(home, at + FIX_UNDO_MS)).toBeTruthy();
  expect(lastFix(home, at + FIX_UNDO_MS + 1)).toBe(null);
  expect(() => undoFix(home, { now: at + FIX_UNDO_MS + 1 })).toThrow(/Too late to undo/);
  expect(git(['rev-parse', 'main'], repo)).toBe(after);
  expect(surveyBoards(home).trackedTwice).toBe(null);
});

test('a lost checkout is forgotten, with nothing to undo; the last fix\'s Undo goes with it', () => {
  branchBoard(NEW, home);
  const lost = path.join(base, 'lost-board');
  // A second checkout of the branch (only by force), whose folder then goes missing.
  git(['worktree', 'add', '-q', '-f', lost, 'brainfile'], repo);
  fs.rmSync(lost, { recursive: true, force: true });
  fs.mkdirSync(path.join(home, 'state'), { recursive: true });
  fs.writeFileSync(lastFixFile(home), JSON.stringify({ at: new Date().toISOString(), words: 'an older fix', record: { root: repo, code: null, exclude: null, board: null } }));
  expect(lastFix(home)).toBeTruthy();

  const plan = planFix(home, repo);
  expect(plan?.kind).toBe('prune');
  expect(plan?.words).toBe('Back up, then forget the lost checkout');
  const applied = applyFix(home, { expected: plan!.words });
  expect(applied.message).toBe('Forgot the lost checkout.');
  expect(applied.undo).toBe(null);
  expect(applied.backups.length).toBe(1);
  expect(lastFix(home)).toBe(null);
  expect(surveyBoards(home).strayWorktrees).toEqual([]);
});

test("the problems, worst first, in the health list's words", () => {
  trackedTwice();
  const survey = surveyBoards(home);
  expect(boardProblems(survey)).toEqual([{ short: 'old copy in main', line: 'An old copy of .brainfile/ (2 docs) is still tracked on main.' }]);
  expect(boardProblems(survey, ['board/task-1.md', 'board/task-2.md']).map((p) => p.short)).toEqual(['merge unfinished', 'old copy in main']);
  expect(boardProblems(survey, ['board/task-1.md', 'board/task-2.md'])[0].line).toBe('A merge stopped with conflicts in board/task-1.md and 1 more.');
});
