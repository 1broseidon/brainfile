/**
 * `state/` is this machine's bookkeeping (sync status, the autosync lock, TUI
 * state) and never travels with the board, whatever its `.gitignore` says.
 * Real git in scratch repositories, each with its own identity: CI has none.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  IGNORE_STATE_MESSAGE,
  UNTRACK_STATE_MESSAGE,
  boardDirtyFiles,
  boardIsDirty,
  commitBoard,
  commitHandEdits,
  fetchBeforeRead,
  registerMergeDriver,
  setBoardRemote,
  syncBoard,
} from '../repo';

const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_AUTOSYNC'];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  // No global identity or settings leak in; every scratch repo sets its own.
  process.env.GIT_CONFIG_GLOBAL = os.devNull;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  delete process.env.BRAINFILE_AUTOSYNC;
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

function identify(dir: string, name = 'Tester'): void {
  git(['config', 'user.name', name], dir);
  git(['config', 'user.email', `${name.toLowerCase()}@example.com`], dir);
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n';

function write(dotDir: string, rel: string, content: string): void {
  const file = path.join(dotDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

const read = (dotDir: string, rel: string): string => fs.readFileSync(path.join(dotDir, rel), 'utf-8');
const task = (id: string, title: string): string => `---\nid: ${id}\ntitle: ${title}\ncolumn: todo\n---\n`;
const subjects = (dotDir: string): string[] => git(['log', '--format=%s'], dotDir).split('\n').filter(Boolean);
const tracked = (dotDir: string, rev = 'HEAD'): string[] => git(['ls-tree', '-r', '--name-only', rev], dotDir).split('\n').filter(Boolean);
/** Every path any commit on any ref ever recorded. */
const everCommitted = (dotDir: string): string[] =>
  git(['log', '--all', '--format=', '--name-only'], dotDir).split('\n').filter(Boolean);

/** A standalone board repository with no commits and no `.gitignore`. */
function newBoard(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '--quiet', '-b', 'main'], dir);
  identify(dir);
  write(dir, 'brainfile.md', CONFIG);
  write(dir, 'board/task-1.md', task('task-1', 'One'));
  write(dir, 'board/.gitkeep', '');
  write(dir, 'logs/.gitkeep', '');
  return dir;
}

/** The board as 0.22.0 left it: `state/sync.json` committed, no `.gitignore` entry. */
function boardTrackingState(dir: string): string {
  newBoard(dir);
  write(dir, 'state/sync.json', '{"at":"2026-10-11T00:00:00.000Z"}\n');
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'list [claude]'], dir);
  return dir;
}

describe("state/ stays this machine's", () => {
  let base: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-board-state-')));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('a board that tracks state/sync.json has it untracked on the next commit, and the file stays on disk', () => {
    const dotDir = boardTrackingState(path.join(base, '.brainfile'));
    write(dotDir, 'state/sync.json', '{"at":"2026-10-13T00:00:00.000Z"}\n');
    write(dotDir, 'board/task-2.md', task('task-2', 'Two'));

    expect(commitBoard(dotDir, { message: 'add task-2' })).toBe(true);

    // The untrack is its own commit, before the command's.
    expect(subjects(dotDir)).toEqual(['add task-2', UNTRACK_STATE_MESSAGE, 'list [claude]']);
    expect(git(['show', '--name-status', '--format=', 'HEAD~1'], dotDir).split('\n')).toEqual(
      expect.arrayContaining(['D\tstate/sync.json', 'A\t.gitignore'])
    );
    expect(tracked(dotDir).filter((f) => f.startsWith('state/'))).toEqual([]);
    expect(tracked(dotDir)).toContain('board/task-2.md');
    expect(read(dotDir, 'state/sync.json')).toBe('{"at":"2026-10-13T00:00:00.000Z"}\n');
    expect(read(dotDir, '.gitignore')).toBe('state/\n');
    expect(git(['status', '--porcelain'], dotDir)).toBe('');

    // From now on, a rewrite of the bookkeeping is no change at all.
    write(dotDir, 'state/sync.json', '{"at":"2026-10-13T00:01:00.000Z"}\n');
    expect(boardIsDirty(dotDir)).toBe(false);
    expect(commitBoard(dotDir, { message: 'list', agent: 'claude' })).toBe(false);
    expect(subjects(dotDir)).toHaveLength(3);
  });

  it('a read on such a board makes one untrack commit, then none: no "edit: state/" or "list" commits', () => {
    const dotDir = boardTrackingState(path.join(base, '.brainfile'));
    const readOnlyCommand = (): void => {
      // What a read-only command does: hand edits first, then its own commit.
      write(dotDir, 'state/sync.json', `{"at":"${new Date().toISOString()}"}\n`);
      expect(boardDirtyFiles(dotDir)).toEqual([]);
      commitHandEdits(dotDir);
      commitBoard(dotDir, { message: 'show task-21', agent: 'claude' });
    };
    readOnlyCommand();
    expect(subjects(dotDir)).toEqual([UNTRACK_STATE_MESSAGE, 'list [claude]']);
    readOnlyCommand();
    readOnlyCommand();
    expect(subjects(dotDir)).toEqual([UNTRACK_STATE_MESSAGE, 'list [claude]']);
    expect(fs.existsSync(path.join(dotDir, 'state', 'sync.json'))).toBe(true);
  });

  it('a staged state/ file (a hand `git add -f`) is dropped from the next commit', () => {
    const dotDir = newBoard(path.join(base, '.brainfile'));
    write(dotDir, '.gitignore', 'state/\n');
    expect(commitBoard(dotDir, { message: 'init board' })).toBe(true);
    write(dotDir, 'state/tui.json', '{}\n');
    git(['add', '-f', 'state/tui.json'], dotDir);
    write(dotDir, 'board/task-2.md', task('task-2', 'Two'));

    expect(commitBoard(dotDir, { message: 'add task-2' })).toBe(true);
    expect(subjects(dotDir)).toEqual(['add task-2', 'init board']);
    expect(everCommitted(dotDir).filter((f) => f.startsWith('state/'))).toEqual([]);
    expect(fs.existsSync(path.join(dotDir, 'state', 'tui.json'))).toBe(true);
  });

  it('a board without a .gitignore never commits state/', () => {
    const dotDir = newBoard(path.join(base, '.brainfile'));
    write(dotDir, 'state/sync.json', '{}\n');
    write(dotDir, 'state/autosync.lock', '12345');
    write(dotDir, 'state/tui.json', '{}\n');

    // First commit: the ignore entry rides along with the board.
    expect(commitBoard(dotDir, { message: 'init board' })).toBe(true);
    expect(subjects(dotDir)).toEqual(['init board']);
    expect(tracked(dotDir)).toContain('.gitignore');

    // A person removes the .gitignore; state/ still stays out, and the entry comes back on its own.
    git(['rm', '--quiet', '.gitignore'], dotDir);
    git(['commit', '--quiet', '-m', 'drop .gitignore by hand'], dotDir);
    write(dotDir, 'state/sync.json', '{"changed":true}\n');
    expect(commitHandEdits(dotDir)).toBe(false);
    write(dotDir, 'board/task-2.md', task('task-2', 'Two'));
    expect(commitBoard(dotDir, { message: 'add task-2' })).toBe(true);
    expect(subjects(dotDir)).toEqual(['add task-2', IGNORE_STATE_MESSAGE, 'drop .gitignore by hand', 'init board']);
    expect(read(dotDir, '.gitignore')).toBe('state/\n');

    expect(everCommitted(dotDir).filter((f) => f.startsWith('state/'))).toEqual([]);
    expect(fs.readdirSync(path.join(dotDir, 'state')).sort()).toEqual(['autosync.lock', 'sync.json', 'tui.json']);
  });

  it('adds to an existing .gitignore without rewriting it, and leaves one that already lists /state alone', () => {
    const dotDir = newBoard(path.join(base, '.brainfile'));
    write(dotDir, '.gitignore', '*.tmp\n# keep\nscratch');
    write(dotDir, 'state/sync.json', '{}\n');
    commitBoard(dotDir, { message: 'init board' });
    expect(read(dotDir, '.gitignore')).toBe('*.tmp\n# keep\nscratch\nstate/\n');

    const other = newBoard(path.join(base, 'other', '.brainfile'));
    write(other, '.gitignore', '/state\n');
    write(other, 'state/sync.json', '{}\n');
    commitBoard(other, { message: 'init board' });
    expect(read(other, '.gitignore')).toBe('/state\n');
  });

  describe('sync', () => {
    let remote: string;

    beforeEach(() => {
      remote = path.join(base, 'boards.git');
      git(['init', '--quiet', '--bare', remote], base);
    });

    afterEach(() => {
      delete process.env.BRAINFILE_AUTOSYNC;
    });

    function share(dotDir: string): void {
      setBoardRemote(dotDir, remote, 'shared');
      // Never call out to an installed CLI; these tests keep merges conflict-free.
      registerMergeDriver(dotDir, 'false');
    }

    it('a sync or a read that only changes state/ makes no commit', () => {
      const dotDir = newBoard(path.join(base, 'a', '.brainfile'));
      write(dotDir, '.gitignore', 'state/\n');
      commitBoard(dotDir, { message: 'init board' });
      share(dotDir);
      expect(syncBoard(dotDir).ok).toBe(true);
      const head = git(['rev-parse', 'HEAD'], dotDir);

      for (let i = 0; i < 3; i++) {
        const result = syncBoard(dotDir);
        expect(result).toMatchObject({ ok: true, pulled: 0, pushed: 0 });
        // autosync=full: a read fetches first, then the command commits what it changed.
        process.env.BRAINFILE_AUTOSYNC = 'full';
        commitHandEdits(dotDir);
        expect(fetchBeforeRead(dotDir, 0)).toMatchObject({ ok: true });
        expect(commitBoard(dotDir, { message: 'list', agent: 'claude' })).toBe(false);
      }
      expect(fs.existsSync(path.join(dotDir, 'state', 'sync.json'))).toBe(true);
      expect(git(['rev-parse', 'HEAD'], dotDir)).toBe(head);
      expect(git(['rev-parse', 'refs/brainfile/shared'], remote)).toBe(head);
    });

    it('the first sync of a board tracking state/ sends the untrack; the remote never holds state/ again', () => {
      const dotDir = boardTrackingState(path.join(base, 'a', '.brainfile'));
      share(dotDir);
      const result = syncBoard(dotDir);
      expect(result).toMatchObject({ ok: true, pushed: 3 });
      expect(subjects(dotDir)).toEqual(['chore: merge attributes', UNTRACK_STATE_MESSAGE, 'list [claude]']);
      expect(tracked(remote, 'refs/brainfile/shared').filter((f) => f.startsWith('state/'))).toEqual([]);
      expect(fs.existsSync(path.join(dotDir, 'state', 'sync.json'))).toBe(true);

      const head = git(['rev-parse', 'HEAD'], dotDir);
      expect(syncBoard(dotDir)).toMatchObject({ ok: true, pulled: 0, pushed: 0 });
      expect(git(['rev-parse', 'HEAD'], dotDir)).toBe(head);
    });

    it("another machine's state/ (an older version still committing it) neither conflicts nor overwrites this one's", () => {
      // Both machines start from a board that tracks state/.
      const dotA = boardTrackingState(path.join(base, 'a', '.brainfile'));
      write(dotA, 'state/tui.json', '{"machine":"A","base":true}\n');
      git(['add', '-A'], dotA);
      git(['commit', '--quiet', '-m', 'edit: state/tui.json'], dotA);
      git(['push', '--quiet', remote, 'HEAD:refs/brainfile/shared'], dotA);

      const dotB = path.join(base, 'b', '.brainfile');
      fs.mkdirSync(dotB, { recursive: true });
      git(['init', '--quiet', '-b', 'main'], dotB);
      identify(dotB, 'Other');
      git(['fetch', '--quiet', remote, 'refs/brainfile/shared'], dotB);
      git(['reset', '--quiet', '--hard', 'FETCH_HEAD'], dotB);

      // A runs the fix and untracks state/, locally only for now.
      write(dotA, 'state/tui.json', '{"machine":"A"}\n');
      write(dotA, 'board/task-a.md', task('task-a', 'From A'));
      expect(commitBoard(dotA, { message: 'add task-a' })).toBe(true);

      // B, on 0.22.0, commits its own bookkeeping with a change and pushes first.
      write(dotB, 'state/tui.json', '{"machine":"B"}\n');
      write(dotB, 'state/claude.json', '{"machine":"B"}\n');
      write(dotB, 'board/task-b.md', task('task-b', 'From B'));
      git(['add', '-A'], dotB);
      git(['commit', '--quiet', '-m', 'add task-b'], dotB);
      git(['push', '--quiet', remote, 'HEAD:refs/brainfile/shared'], dotB);

      share(dotA);
      const result = syncBoard(dotA);
      expect(result).toMatchObject({ ok: true, conflicts: [], pulled: 1 });
      expect(fs.existsSync(path.join(dotA, 'board', 'task-b.md'))).toBe(true);
      // A keeps its own bookkeeping, and never picks up B's.
      expect(read(dotA, 'state/tui.json')).toBe('{"machine":"A"}\n');
      expect(fs.existsSync(path.join(dotA, 'state', 'claude.json'))).toBe(false);
      expect(tracked(dotA).filter((f) => f.startsWith('state/'))).toEqual([]);
      expect(tracked(remote, 'refs/brainfile/shared').filter((f) => f.startsWith('state/'))).toEqual([]);
      expect(git(['status', '--porcelain'], dotA)).toBe('');
    });
  });
});
