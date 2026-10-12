/**
 * spec-15 phase 1: every board a repository has, and when two disagree.
 * Real git in temporary directories.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { boardConflictError, locateBoard, surveyBoards } from '../repo';

const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n';

function doc(id: string, title: string, updatedAt: string): string {
  return `---\nid: ${id}\ntitle: ${title}\ncolumn: todo\ncreatedAt: "2026-01-01T00:00:00.000Z"\nupdatedAt: "${updatedAt}"\n---\n`;
}

/** Write a board: `docs` maps `board/task-1.md` (or `logs/…`) to contents. */
function writeBoard(dotDir: string, docs: Record<string, string>): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), CONFIG);
  for (const [rel, content] of Object.entries(docs)) fs.writeFileSync(path.join(dotDir, rel), content);
}

const OLD = {
  'board/task-1.md': doc('task-1', 'One', '2026-02-01T00:00:00.000Z'),
  'board/task-2.md': doc('task-2', 'Two', '2026-02-01T00:00:00.000Z'),
};
const NEW = {
  ...OLD,
  'board/task-2.md': doc('task-2', 'Two, edited', '2026-03-01T00:00:00.000Z'),
  'board/task-3.md': doc('task-3', 'Three', '2026-03-01T00:00:00.000Z'),
  'board/task-4.md': doc('task-4', 'Four', '2026-03-02T00:00:00.000Z'),
};

describe('surveyBoards (spec-15)', () => {
  let base: string;
  let repo: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-boards-')));
    repo = path.join(base, 'repo');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'init'], repo);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  /** The board branch with `docs`, checked out at `at` (removed again when `keep` is false). */
  function boardBranch(docs: Record<string, string>, at = path.join(base, 'wt'), keep = false): string {
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', at], repo);
    writeBoard(at, docs);
    git(['add', '-A'], at);
    git(['commit', '-q', '-m', 'board'], at);
    if (!keep) git(['worktree', 'remove', at], repo);
    return at;
  }

  it('one board on its branch at .brainfile/: no conflict, nothing stray', () => {
    const dot = boardBranch(NEW, path.join(repo, '.brainfile'), true);
    const survey = surveyBoards(dot);
    expect(survey.conflict).toBeNull();
    expect(survey.strayWorktrees).toEqual([]);
    expect(survey.trackedTwice).toBeNull();
    expect(survey.boards).toEqual([
      expect.objectContaining({ kind: 'branch', docs: 4, lastChange: '2026-03-02T00:00:00.000Z' }),
    ]);
  });

  it("runprism.ai: an old folder tracked on main beside a newer branch checked out elsewhere", () => {
    const dot = path.join(repo, '.brainfile');
    writeBoard(dot, OLD);
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board on main'], repo);
    const stray = boardBranch(NEW, path.join(base, 'tmp-board'), true);

    const located = locateBoard(repo);
    expect(located).toMatchObject({ found: true, dotDir: dot, storage: 'plain' });
    if (!located.found) throw new Error('unreachable');
    expect(located.conflict).toMatchObject({
      relation: 'contained',
      message: "Two boards: this folder (2) and the 'brainfile' branch (4, newer).",
      resolve: 'brainfile adopt refs/heads/brainfile',
    });
    expect(located.conflict?.current).toMatchObject({ kind: 'folder', trackedBy: 'main' });
    expect(located.conflict?.other).toMatchObject({ kind: 'branch', path: stray });
    expect(boardConflictError(located.conflict!)).toMatch(
      /^Two boards: .*\. The 'brainfile' branch already has everything this folder has\. Nothing was written\. Settle it first: brainfile adopt refs\/heads\/brainfile/
    );

    const survey = surveyBoards(dot);
    expect(survey.strayWorktrees).toEqual([{ path: stray, missing: false }]);
  });

  it('a folder and a branch that each have something the other lacks have diverged', () => {
    boardBranch(NEW);
    const dot = path.join(repo, '.brainfile');
    writeBoard(dot, { ...OLD, 'board/task-9.md': doc('task-9', 'Only here', '2026-04-01T00:00:00.000Z') });
    const conflict = surveyBoards(dot).conflict;
    expect(conflict).toMatchObject({ relation: 'diverged', resolve: 'brainfile merge-boards refs/heads/brainfile' });
    expect(conflict?.message).toBe("Two boards: this folder (3, newer) and the 'brainfile' branch (4).");
  });

  it('a folder holding everything the branch has is offered as the one to keep', () => {
    boardBranch(OLD);
    const dot = path.join(repo, '.brainfile');
    writeBoard(dot, NEW);
    expect(surveyBoards(dot).conflict).toMatchObject({ relation: 'contains', resolve: `brainfile adopt ${dot}` });
  });

  it('a task completed on one side counts as newer than the open copy', () => {
    boardBranch(OLD);
    const dot = path.join(repo, '.brainfile');
    const { 'board/task-1.md': _done, ...rest } = OLD;
    writeBoard(dot, { ...rest, 'logs/task-1.md': doc('task-1', 'One', '2026-01-15T00:00:00.000Z') });
    expect(surveyBoards(dot).conflict?.relation).toBe('contains');
  });

  it('a folder identical to the branch is not a second board', () => {
    boardBranch(NEW);
    const dot = path.join(repo, '.brainfile');
    writeBoard(dot, NEW);
    const survey = surveyBoards(dot);
    expect(survey.conflict).toBeNull();
    expect(survey.boards.map((b) => b.kind)).toEqual(['folder', 'branch']);
  });

  it('the code branch still tracking .brainfile/ under the board worktree is reported, not a conflict', () => {
    const dot = path.join(repo, '.brainfile');
    writeBoard(dot, OLD);
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board on main'], repo);
    // Move the board to its branch without untracking it on main (PR not merged yet).
    fs.rmSync(dot, { recursive: true, force: true });
    boardBranch(NEW, dot, true);

    const survey = surveyBoards(dot);
    expect(survey.conflict).toBeNull();
    expect(survey.trackedTwice).toMatchObject({ kind: 'code-branch', label: 'the copy on main', docs: 2 });
  });

  it('a board-branch worktree whose folder is gone is reported as missing', () => {
    const dot = boardBranch(NEW, path.join(repo, '.brainfile'), true);
    const gone = path.join(base, 'gone');
    git(['worktree', 'add', '-q', '-f', gone, 'brainfile'], repo);
    fs.rmSync(gone, { recursive: true, force: true });
    expect(surveyBoards(dot).strayWorktrees).toEqual([{ path: gone, missing: true }]);
  });

  describe('against the remote', () => {
    let remote: string;

    beforeEach(() => {
      remote = path.join(base, 'remote.git');
      git(['init', '-q', '--bare', remote], base);
      git(['remote', 'add', 'origin', remote], repo);
    });

    /** Publish a board with `docs` as the remote's refs/brainfile/board from a scratch repo. */
    function publishUnrelated(docs: Record<string, string>): void {
      const other = path.join(base, 'other');
      fs.mkdirSync(other);
      git(['init', '-q', '-b', 'brainfile', other], base);
      writeBoard(other, docs);
      git(['add', '-A'], other);
      git(['commit', '-q', '-m', 'their board'], other);
      git(['push', '-q', remote, 'HEAD:refs/brainfile/board'], other);
    }

    it('reports ahead and behind as one board out of step', () => {
      const dot = boardBranch(OLD, path.join(repo, '.brainfile'), true);
      git(['push', '-q', 'origin', 'brainfile:refs/brainfile/board'], repo);
      fs.writeFileSync(path.join(dot, 'board', 'task-5.md'), doc('task-5', 'Five', '2026-05-01T00:00:00.000Z'));
      git(['add', '-A'], dot);
      git(['commit', '-q', '-m', 'five'], dot);

      const survey = surveyBoards(dot, { fetch: true });
      expect(survey.conflict).toBeNull();
      expect(survey.lineage).toEqual({ remote: 'origin', ref: 'refs/brainfile/remotes/origin/board', ahead: 1, behind: 0, unrelated: false });
      expect(survey.boards.map((b) => b.kind)).toEqual(['branch', 'remote']);
    });

    it("a local branch with no history in common with origin's board is two boards", () => {
      const dot = boardBranch(OLD, path.join(repo, '.brainfile'), true);
      publishUnrelated(NEW);
      expect(surveyBoards(dot).conflict).toBeNull(); // offline: origin's copy not fetched yet

      const survey = surveyBoards(dot, { fetch: true });
      expect(survey.lineage?.unrelated).toBe(true);
      expect(survey.conflict).toMatchObject({
        relation: 'unrelated',
        message: "Two boards: the 'brainfile' branch (2) and origin's (4, newer).",
        resolve: 'brainfile merge-boards refs/brainfile/remotes/origin/board',
      });
    });

    it("a plain folder in a clone whose origin already has a board", () => {
      const dot = path.join(repo, '.brainfile');
      writeBoard(dot, OLD);
      publishUnrelated(NEW);
      const survey = surveyBoards(dot, { fetch: true });
      expect(survey.conflict).toMatchObject({
        relation: 'contained',
        message: "Two boards: this folder (2) and origin's (4, newer).",
        resolve: 'brainfile adopt refs/brainfile/remotes/origin/board',
      });
    });
  });

  it('a board outside any repository is the only board', () => {
    const lone = path.join(base, 'lone', '.brainfile');
    writeBoard(lone, OLD);
    expect(surveyBoards(lone)).toMatchObject({ conflict: null, boards: [expect.objectContaining({ kind: 'folder', docs: 2 })] });
  });
});
