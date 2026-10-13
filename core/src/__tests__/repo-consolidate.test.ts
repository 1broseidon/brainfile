/**
 * spec-15 phase 2: backups, adopt and merge-boards. Real git in temporary
 * directories.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  adoptBoard,
  listBackups,
  listWorktrees,
  mergeBoardFiles,
  mergeBoards,
  restoreBackup,
  saveBoardBackup,
  surveyBoards,
  untrackBoardOnCodeBranch,
} from '../repo';

const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  });
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

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n';

function doc(id: string, title: string, createdAt: string, updatedAt: string, extra = '', body = ''): string {
  return `---\nid: ${id}\ntitle: ${title}\ncolumn: todo\n${extra}createdAt: "${createdAt}"\nupdatedAt: "${updatedAt}"\n---\n${body}`;
}

function writeBoard(dotDir: string, docs: Record<string, string>): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), CONFIG);
  for (const [rel, content] of Object.entries(docs)) fs.writeFileSync(path.join(dotDir, rel), content);
}

const T0 = '2026-01-01T00:00:00.000Z';
const OLD = {
  'board/task-1.md': doc('task-1', 'One', T0, '2026-02-01T00:00:00.000Z'),
  'board/task-2.md': doc('task-2', 'Two', T0, '2026-02-01T00:00:00.000Z'),
};
const NEW = {
  ...OLD,
  'board/task-2.md': doc('task-2', 'Two, edited', T0, '2026-03-01T00:00:00.000Z'),
  'board/task-3.md': doc('task-3', 'Three', T0, '2026-03-01T00:00:00.000Z'),
  'board/task-4.md': doc('task-4', 'Four', T0, '2026-03-02T00:00:00.000Z'),
};

function boardFiles(dir: string): string[] {
  return ['board', 'logs'].flatMap((sub) =>
    fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith('.md')).map((f) => `${sub}/${f}`) : []
  ).sort();
}

describe('one board out of two (spec-15 phase 2)', () => {
  let base: string;
  let repo: string;
  let home: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-consolidate-')));
    repo = path.join(base, 'repo');
    home = path.join(repo, '.brainfile');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'init'], repo);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  function branchBoard(docs: Record<string, string>, at: string, keep: boolean): void {
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', at], repo);
    writeBoard(at, docs);
    git(['add', '-A'], at);
    git(['commit', '-q', '-m', 'board'], at);
    if (!keep) git(['worktree', 'remove', at], repo);
  }

  function oldBoardOnMain(): void {
    writeBoard(home, OLD);
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board on main'], repo);
  }

  it("runprism.ai: merge-boards sees the branch already has everything and adopts it, ending with one board in one place", () => {
    oldBoardOnMain();
    const stray = path.join(base, 'tmp-board');
    branchBoard(NEW, stray, true);
    fs.mkdirSync(path.join(home, 'state'));
    fs.writeFileSync(path.join(home, 'state', 'brief.json'), '{}');

    const result = mergeBoards(home, 'refs/heads/brainfile');
    expect(result).toMatchObject({ relation: 'contained', adopted: 'other', removedCheckouts: [stray], unchanged: false });
    expect(result.untracked).toMatchObject({ branch: 'main' });
    expect(result.backups).toEqual([expect.stringMatching(/^\d{8}T\d{6}Z-folder$/), expect.stringMatching(/^\d{8}T\d{6}Z-branch$/)]);

    // One board, on its branch, at .brainfile/, with everything the branch had.
    expect(listWorktrees(repo).filter((w) => w.branch === 'refs/heads/brainfile').map((w) => w.path)).toEqual([home]);
    expect(boardFiles(home)).toEqual(['board/task-1.md', 'board/task-2.md', 'board/task-3.md', 'board/task-4.md']);
    expect(fs.existsSync(stray)).toBe(false);
    expect(fs.readFileSync(path.join(home, 'state', 'brief.json'), 'utf-8')).toBe('{}');

    // main stopped tracking it, in one commit, and ignores it.
    expect(git(['ls-files', '.brainfile'], repo)).toBe('');
    expect(git(['log', '-1', '--format=%s', 'main'], repo)).toBe('chore: move the board to the brainfile branch');
    expect(git(['show', 'main:.gitignore'], repo)).toContain('.brainfile/');
    expect(git(['status', '--porcelain'], repo)).toBe('');

    const survey = surveyBoards(home);
    expect(survey.conflict).toBeNull();
    expect(survey.trackedTwice).toBeNull();
    expect(survey.strayWorktrees).toEqual([]);

    const backups = listBackups(home);
    expect(backups.map((b) => [b.name.replace(/^\d+T\d+Z/, 'T'), b.docs])).toEqual(
      expect.arrayContaining([['T-folder', 2], ['T-branch', 4]])
    );
    expect(backups.find((b) => b.name.endsWith('-folder'))?.note).toBe(`the folder ${home} before adopt the 'brainfile' branch`);
  });

  it('a board whose .gitignore lists state/ can be backed up and merged; state/ stays out of both', () => {
    oldBoardOnMain();
    branchBoard(NEW, path.join(base, 'wt'), false);
    fs.mkdirSync(path.join(home, 'state'));
    fs.writeFileSync(path.join(home, 'state', 'sync.json'), '{}');
    fs.writeFileSync(path.join(home, '.gitignore'), 'state/\n');

    const result = mergeBoards(home, 'refs/heads/brainfile');
    expect(result).toMatchObject({ relation: 'contained', adopted: 'other' });
    for (const backup of result.backups) {
      expect(git(['ls-tree', '-r', '--name-only', `refs/brainfile/backups/${backup}`], repo)).not.toMatch(/^state\//m);
    }
    expect(git(['ls-tree', '-r', '--name-only', 'brainfile'], repo)).not.toMatch(/^state\//m);
    expect(fs.readFileSync(path.join(home, 'state', 'sync.json'), 'utf-8')).toBe('{}');
  });

  it('keeping this folder over the branch makes the branch hold the folder, descending from what it had', () => {
    branchBoard(OLD, path.join(base, 'wt'), false);
    const oldTip = git(['rev-parse', 'brainfile'], repo);
    writeBoard(home, NEW);

    const result = adoptBoard(home, home);
    expect(result.source.label).toBe(`the folder ${home}`);
    expect(boardFiles(home)).toEqual(['board/task-1.md', 'board/task-2.md', 'board/task-3.md', 'board/task-4.md']);
    expect(fs.readFileSync(path.join(home, 'board', 'task-2.md'), 'utf-8')).toContain('Two, edited');
    expect(git(['merge-base', '--is-ancestor', oldTip, 'brainfile'], repo)).toBe('');
    expect(result.untracked).toBeNull();
    expect(surveyBoards(home).conflict).toBeNull();
  });

  it("a new board commit descends from origin's copy, so the next push is a fast-forward", () => {
    const remote = path.join(base, 'remote.git');
    git(['init', '-q', '--bare', remote], base);
    git(['remote', 'add', 'origin', remote], repo);
    // Origin's board, from somewhere else entirely.
    const other = path.join(base, 'other');
    fs.mkdirSync(other);
    git(['init', '-q', '-b', 'brainfile', other], base);
    writeBoard(other, NEW);
    git(['add', '-A'], other);
    git(['commit', '-q', '-m', 'their board'], other);
    git(['push', '-q', remote, 'HEAD:refs/brainfile/board'], other);
    git(['fetch', '-q', 'origin', '+refs/brainfile/board:refs/brainfile/remotes/origin/board'], repo);

    writeBoard(home, { ...OLD, 'board/task-9.md': doc('task-9', 'Only here', T0, '2026-04-01T00:00:00.000Z') });
    expect(surveyBoards(home).conflict?.relation).toBe('diverged');

    const result = mergeBoards(home, 'refs/brainfile/remotes/origin/board');
    expect(result).toMatchObject({ relation: 'diverged', adopted: null, renumbered: [] });
    expect(boardFiles(home)).toEqual(['board/task-1.md', 'board/task-2.md', 'board/task-3.md', 'board/task-4.md', 'board/task-9.md']);
    // The newer edit of task-2 won.
    expect(fs.readFileSync(path.join(home, 'board', 'task-2.md'), 'utf-8')).toContain('Two, edited');
    git(['merge-base', '--is-ancestor', 'refs/brainfile/remotes/origin/board', 'brainfile'], repo);
    git(['push', '-q', 'origin', 'brainfile:refs/brainfile/board'], repo);
    expect(surveyBoards(home).conflict).toBeNull();
    // It came from origin, so it is shared back there.
    expect(git(['config', '--get', 'brainfile.remote'], repo)).toBe('origin');
  });

  it('restoring a backup puts it back and backs up what it replaces', () => {
    oldBoardOnMain();
    branchBoard(NEW, path.join(base, 'wt'), false);
    const first = mergeBoards(home, 'refs/heads/brainfile');
    const folderBackup = first.backups.find((b) => b.endsWith('-folder'))!;

    const restored = restoreBackup(home, folderBackup);
    expect(restored.source.label).toBe(`backup ${folderBackup}`);
    expect(restored.backups).toEqual([expect.stringMatching(/-branch(-\d+)?$/)]);
    expect(boardFiles(home)).toEqual(['board/task-1.md', 'board/task-2.md']);
    expect(listBackups(home)).toHaveLength(3);
    expect(() => restoreBackup(home, 'nope')).toThrow(/No backup named 'nope'/);
  });

  it('refuses before changing anything when something else sits where the board belongs', () => {
    const stray = path.join(base, 'tmp-board');
    branchBoard(NEW, stray, true);
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'junk.txt'), 'not a board');
    const tip = git(['rev-parse', 'brainfile'], repo);

    expect(() => adoptBoard(stray, 'refs/heads/brainfile')).toThrow(/holds no board\. Move it away first\. Nothing was changed\./);
    expect(() => mergeBoards(stray, path.join(base, 'missing'))).toThrow(/neither a folder with a board nor a git ref/);
    expect(fs.existsSync(stray)).toBe(true);
    expect(git(['rev-parse', 'brainfile'], repo)).toBe(tip);
    expect(listBackups(stray)).toEqual([]);
  });

  it('saveBoardBackup saves one copy at a time, a folder or a tree in a code commit, as backups lists them', () => {
    oldBoardOnMain();
    const stamp = '20261012T120000Z';
    const folder = saveBoardBackup(home, { dir: home }, `the folder ${home} before fix`, 'folder', stamp);
    const onMain = saveBoardBackup(home, { treeish: `${git(['rev-parse', 'HEAD'], repo)}:.brainfile` }, 'the copy on main before fix', 'main', stamp);
    const again = saveBoardBackup(home, { dir: home }, 'again', 'folder', stamp);
    expect([folder, onMain, again]).toEqual([`${stamp}-folder`, `${stamp}-main`, `${stamp}-folder-2`]);
    // A tree inside a code commit is saved without the code's history.
    expect(git(['rev-list', '--count', `refs/brainfile/backups/${onMain}`], repo)).toBe('1');
    expect(git(['ls-tree', '--name-only', `refs/brainfile/backups/${onMain}`, 'board/'], repo)).toBe('board/task-1.md\nboard/task-2.md');
    expect(listBackups(home).map((b) => b.name).sort()).toEqual([folder, again, onMain].sort());
    expect(() => saveBoardBackup(home, { dir: path.join(base, 'nothing') }, 'x', 'folder')).toThrow(/holds no board/);
  });
});

describe('mergeBoardFiles', () => {
  const b = (text: string) => Buffer.from(text);

  it('keeps the older of two documents sharing an ID and renumbers the newer, rewriting references', () => {
    const ours = new Map([
      ['brainfile.md', b(CONFIG)],
      ['board/task-1.md', b(doc('task-1', 'Fix login', T0, T0))],
    ]);
    const theirs = new Map([
      ['brainfile.md', b(CONFIG)],
      ['board/task-1.md', b(doc('task-1', 'Write the importer', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '', '## Description\nSee task-1 and task-10.\n'))],
      ['board/task-2.md', b(doc('task-2', 'Importer tests', T0, T0, 'dependsOn:\n  - task-1\n'))],
      ['logs/ledger.jsonl', b('{"id":"task-1","title":"Write the importer"}\n')],
    ]);
    const { files, renumbered } = mergeBoardFiles(ours, theirs, null);
    expect(renumbered).toEqual([{ from: 'task-1', to: 'task-3', side: 'other', title: 'Write the importer' }]);
    expect(files.get('board/task-1.md')!.toString()).toContain('title: Fix login');
    const moved = files.get('board/task-3.md')!.toString();
    expect(moved).toContain('id: task-3');
    expect(moved).toContain('See task-3 and task-10.');
    expect(moved).toMatch(/\[merge-boards\] renumbered from task-1: the other board already had task-1 \(Fix login\)/);
    expect(files.get('board/task-2.md')!.toString()).toMatch(/dependsOn:\n {2}- task-3/);
    expect(files.get('logs/ledger.jsonl')!.toString()).toBe('{"id":"task-3","title":"Write the importer"}\n');
  });

  it('treats one ID with the same title as one document, newer fields winning and logs unioned', () => {
    const ours = new Map([
      ['board/task-1.md', b(doc('task-1', 'One', T0, '2026-03-01T00:00:00.000Z', 'priority: high\n', '## Log\n- 2026-01-02T00:00:00.000Z: ours\n'))],
    ]);
    const theirs = new Map([
      ['board/task-1.md', b(doc('task-1', 'One', '2026-01-05T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 'priority: low\n', '## Log\n- 2026-01-01T00:00:00.000Z: theirs\n'))],
    ]);
    const { files, renumbered } = mergeBoardFiles(ours, theirs, null);
    expect(renumbered).toEqual([]);
    const merged = files.get('board/task-1.md')!.toString();
    expect(merged).toContain('priority: high');
    expect(merged).toMatch(/- 2026-01-01T00:00:00.000Z: theirs\n- 2026-01-02T00:00:00.000Z: ours/);
  });

  it('completion wins over an edit', () => {
    const ours = new Map([['board/task-1.md', b(doc('task-1', 'One', T0, '2026-03-01T00:00:00.000Z'))]]);
    const theirs = new Map([['logs/task-1.md', b(doc('task-1', 'One', T0, '2026-02-01T00:00:00.000Z', 'completedAt: "2026-02-01T00:00:00.000Z"\n'))]]);
    const { files } = mergeBoardFiles(ours, theirs, null);
    expect([...files.keys()]).toEqual(['logs/task-1.md']);
    expect(files.get('logs/task-1.md')!.toString()).toContain('completedAt');
  });
});

describe('untrackBoardOnCodeBranch', () => {
  it('commits only the untracking and the ignore line, leaving other staged work staged', () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-untrack-')));
    try {
      const repo = path.join(base, 'repo');
      fs.mkdirSync(repo);
      git(['init', '-q', '-b', 'main'], repo);
      writeBoard(path.join(repo, '.brainfile'), OLD);
      fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
      git(['add', '-A'], repo);
      git(['commit', '-q', '-m', 'init'], repo);
      fs.writeFileSync(path.join(repo, 'staged.txt'), 'mine\n');
      git(['add', 'staged.txt'], repo);

      expect(untrackBoardOnCodeBranch(repo)).toMatchObject({ branch: 'main' });
      expect(git(['show', '--name-status', '--format=', 'HEAD'], repo).split('\n').sort()).toEqual([
        'D\t.brainfile/board/task-1.md',
        'D\t.brainfile/board/task-2.md',
        'D\t.brainfile/brainfile.md',
        'M\t.gitignore',
      ]);
      expect(git(['show', 'HEAD:.gitignore'], repo)).toBe('node_modules/\n.brainfile/');
      expect(git(['status', '--porcelain'], repo)).toBe('A  staged.txt');
      expect(fs.existsSync(path.join(repo, '.brainfile', 'board', 'task-1.md'))).toBe(true);
      expect(untrackBoardOnCodeBranch(repo)).toBeNull();
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
