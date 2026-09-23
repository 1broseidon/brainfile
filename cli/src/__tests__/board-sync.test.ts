/**
 * Board-on-a-branch (spec-9, phase 2): remote config, sync, the merge driver
 * and brief auto-sync. Two clones share a bare "boards" remote while the code
 * remote never sees board refs. Uses real git in temporary directories; the
 * git-invoked merge driver needs the built CLI (`npm run build`), so the two
 * conflict tests skip without it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { initCommand } from '../commands/init';
import { addCommand } from '../commands/add';
import { moveCommand } from '../commands/move';
import { completeCommand } from '../commands/complete';
import { briefCommand } from '../commands/brief';
import { syncCommand } from '../commands/sync';
import { mergeBodies, mergeBoardDocuments, mergeFields } from '../commands/merge-driver';
import { commitBoard, findTrackedBoardDir } from '../utils/board-repo';
import { afterCommand, beforeCommand } from '../utils/board-commit-hooks';
import { fetchBeforeRead, installAutosync, schedulePush } from '../utils/board-autosync';
import {
  boardAutosync,
  boardRemote,
  boardRemoteBranch,
  readSyncState,
  registerMergeDriver,
  syncBoard,
  syncMessage,
  syncStatusLabel,
} from '../utils/board-sync';
import { whereCommand } from '../commands/where';

interface FakeCommand {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: FakeCommand | null;
}
function fakeCommand(name: string, opts: Record<string, unknown> = {}): FakeCommand {
  const root: FakeCommand = { name: () => 'brainfile', args: [], opts: () => ({}), parent: null };
  return { name: () => name, args: [], opts: () => opts, parent: root };
}

function waitFor(check: () => boolean, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return check();
}

const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
const hasBundle = fs.existsSync(distCli);
const driverCommand = `${process.execPath} ${distCli} merge-driver %O %A %B`;
const withDriver = hasBundle ? it : it.skip;

function run(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}

function refs(bare: string): string[] {
  return run(['for-each-ref', '--format=%(refname:short)'], bare).split('\n').filter(Boolean);
}

function makeBare(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  run(['init', '--quiet', '--bare', dir], dir);
  return dir;
}

function makeClone(origin: string, dir: string): string {
  run(['clone', '--quiet', origin, dir], path.dirname(dir));
  run(['config', 'user.name', 'Tester'], dir);
  run(['config', 'user.email', 'tester@example.com'], dir);
  return dir;
}

function taskFile(dotDir: string, id: string): string {
  return fs.readFileSync(path.join(dotDir, 'board', `${id}.md`), 'utf-8');
}

function column(dotDir: string, id: string): string {
  return /^column: (.+)$/m.exec(taskFile(dotDir, id))?.[1] ?? '';
}

function ledgerIds(dotDir: string): string[] {
  const file = path.join(dotDir, 'logs', 'ledger.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { id: string }).id).sort();
}

describe('board sync (spec-9 phase 2)', () => {
  let base: string;
  let originalCwd: string;
  let codeRemote: string;
  let boardsRemote: string;
  let repoA: string;
  let repoB: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_AGENT', 'BRAINFILE_GLOBAL', 'BRAINFILE_AUTOSYNC', 'BRAINFILE_AUTOSYNC_DELAY_MS']) {
      savedEnv[key] = process.env[key];
    }
    process.env.GIT_CONFIG_GLOBAL = os.devNull;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    delete process.env.BRAINFILE_AGENT;
    delete process.env.BRAINFILE_GLOBAL;
    // Background pushes would race the explicit syncs below; the autosync
    // tests opt back in one at a time.
    process.env.BRAINFILE_AUTOSYNC = 'off';
    process.env.BRAINFILE_AUTOSYNC_DELAY_MS = '200';
    if (!hasBundle) {
      // eslint-disable-next-line no-console
      console.warn('[board-sync] dist/cli.js not found — merge-driver conflict tests skipped. Run `npm run build`.');
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-sync-')));
    originalCwd = process.cwd();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    codeRemote = makeBare(path.join(base, 'code.git'));
    boardsRemote = makeBare(path.join(base, 'boards.git'));
    // Seed the code remote with one commit so clones have a main branch.
    const seed = path.join(base, 'seed');
    makeClone(codeRemote, seed);
    fs.writeFileSync(path.join(seed, 'README.md'), 'code\n', 'utf-8');
    run(['add', '-A'], seed);
    run(['commit', '--quiet', '-m', 'code'], seed);
    run(['push', '--quiet', '-u', 'origin', 'HEAD:main'], seed);
    repoA = makeClone(codeRemote, path.join(base, 'A'));
    repoB = makeClone(codeRemote, path.join(base, 'B'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  /** A tracked board in A pointed at the boards remote, with its driver on the built CLI. */
  function boardInA(): string {
    process.chdir(repoA);
    initCommand({});
    const dotDir = path.join(repoA, '.brainfile');
    syncCommand({ setRemote: boardsRemote });
    if (hasBundle) registerMergeDriver(dotDir, driverCommand);
    return dotDir;
  }

  /** Materialize the shared board in B from the boards remote. */
  function boardInB(): string {
    process.chdir(repoB);
    syncCommand({ setRemote: boardsRemote });
    const dotDir = findTrackedBoardDir(repoB);
    if (!dotDir) throw new Error('board was not materialized in B');
    if (hasBundle) registerMergeDriver(dotDir, driverCommand);
    return dotDir;
  }

  describe('merge driver', () => {
    it('takes the side that changed a field, and the later updatedAt when both did', () => {
      const base = { column: 'todo', title: 'T', updatedAt: '2026-01-01T00:00:00Z' };
      const ours = { column: 'in-progress', title: 'T', updatedAt: '2026-01-02T00:00:00Z' };
      const theirs = { column: 'todo', title: 'Renamed', assignee: 'b', updatedAt: '2026-01-03T00:00:00Z' };
      expect(mergeFields(base, ours, theirs)).toEqual({
        column: 'in-progress',
        title: 'Renamed',
        updatedAt: '2026-01-03T00:00:00Z',
        assignee: 'b',
      });

      const both = mergeFields(base, { ...ours, column: 'review' }, { ...theirs, column: 'done' });
      expect(both.column).toBe('done');
      const oursLater = mergeFields(base, { ...ours, column: 'review', updatedAt: '2026-01-09T00:00:00Z' }, { ...theirs, column: 'done' });
      expect(oursLater.column).toBe('review');
      const tie = mergeFields(base, { ...ours, column: 'review', updatedAt: theirs.updatedAt }, { ...theirs, column: 'done' });
      expect(tie.column).toBe('done');
    });

    it('unions conflicting log entries ordered by timestamp and keeps markers elsewhere', () => {
      const base = '## Log\n- 2026-01-01T00:00:00Z: start\n';
      const ours = '## Log\n- 2026-01-01T00:00:00Z: start\n- 2026-01-03T00:00:00Z: [a] ours\n';
      const theirs = '## Log\n- 2026-01-01T00:00:00Z: start\n- 2026-01-02T00:00:00Z: [b] theirs\n';
      const merged = mergeBodies(base, ours, theirs);
      expect(merged.clean).toBe(true);
      expect(merged.content.split('\n').filter(Boolean)).toEqual([
        '## Log',
        '- 2026-01-01T00:00:00Z: start',
        '- 2026-01-02T00:00:00Z: [b] theirs',
        '- 2026-01-03T00:00:00Z: [a] ours',
      ]);

      const prose = mergeBodies('## Description\nold\n', '## Description\nours\n', '## Description\ntheirs\n');
      expect(prose.clean).toBe(false);
      expect(prose.content).toContain('<<<<<<<');
    });

    it('merges a whole document: frontmatter by field, body by text', () => {
      const doc = (column: string, updatedAt: string, log: string) =>
        `---\nid: task-1\ntitle: "T"\ncolumn: ${column}\nupdatedAt: "${updatedAt}"\n---\n\n## Description\nBody\n\n## Log\n- 2026-01-01T00:00:00Z: start\n${log}`;
      const out = mergeBoardDocuments(
        doc('todo', '2026-01-01T00:00:00Z', ''),
        doc('in-progress', '2026-01-02T00:00:00Z', '- 2026-01-02T00:00:00Z: [a] took it\n'),
        doc('review', '2026-01-03T00:00:00Z', '- 2026-01-03T00:00:00Z: [b] reviewed\n'),
      );
      expect(out.clean).toBe(true);
      expect(out.content).toContain('column: review');
      expect(out.content).toContain('[a] took it');
      expect(out.content).toContain('[b] reviewed');
      expect(out.content).not.toContain('<<<<<<<');
    });
  });

  it('reports plain boards and missing remotes instead of failing', () => {
    process.chdir(repoA);
    initCommand({ plain: true });
    expect(syncBoard(path.join(repoA, '.brainfile')).skipped).toBe('not-tracked');

    fs.rmSync(path.join(repoA, '.brainfile'), { recursive: true, force: true });
    initCommand({});
    const dotDir = path.join(repoA, '.brainfile');
    expect(boardRemote(dotDir)).toBeNull();
    expect(boardAutosync(dotDir)).toBe('off');
    expect(syncBoard(dotDir).skipped).toBe('no-remote');
    expect(refs(codeRemote)).toEqual(['main']);
  });

  it('--set-remote with a URL registers the board remote; origin never receives board refs', () => {
    const dotDir = boardInA();
    expect(boardRemote(dotDir)).toBe('board');
    expect(run(['remote', 'get-url', 'board'], repoA)).toBe(boardsRemote);
    expect(boardRemoteBranch(dotDir)).toBe('brainfile');
    expect(boardAutosync(dotDir)).toBe('push');
    expect(run(['config', '--get', 'merge.brainfile.driver'], dotDir)).toContain('merge-driver %O %A %B');
    expect(fs.readFileSync(path.join(dotDir, '.gitattributes'), 'utf-8')).toContain('logs/ledger.jsonl merge=union');

    expect(refs(boardsRemote)).toEqual(['brainfile']);
    expect(refs(codeRemote)).toEqual(['main']);
    expect(readSyncState(dotDir)?.ok).toBe(true);
  });

  it('--set-remote rejects an unknown remote name and lists the known ones', () => {
    process.chdir(repoA);
    initCommand({});
    expect(() => syncCommand({ setRemote: 'upstream' })).toThrow(/not a git remote.*origin/);
  });

  it('a fresh clone materializes the board from the remote and sees new work after sync', () => {
    const dotA = boardInA();
    addCommand({ file: 'brainfile.md', title: 'Shared task', column: 'todo' });
    commitBoard(dotA, { message: 'add task-1', agent: 'a' });
    const pushed = syncCommand({});
    expect(pushed?.pushed).toBe(1);

    const dotB = boardInB();
    expect(dotB).toBe(path.join(repoB, '.brainfile'));
    expect(column(dotB, 'task-1')).toBe('todo');
    expect(run(['status', '--porcelain'], repoB)).toBe('');

    process.chdir(repoA);
    addCommand({ file: 'brainfile.md', title: 'Second task', column: 'todo' });
    commitBoard(dotA, { message: 'add task-2', agent: 'a' });
    syncCommand({});

    process.chdir(repoB);
    const pulled = syncCommand({ pull: true });
    expect(pulled?.pulled).toBe(1);
    expect(fs.existsSync(path.join(dotB, 'board', 'task-2.md'))).toBe(true);
  });

  it('brief syncs a shared board first unless --offline', () => {
    const dotA = boardInA();
    addCommand({ file: 'brainfile.md', title: 'Seen by brief', column: 'todo' });
    commitBoard(dotA, { message: 'add task-1', agent: 'a' });
    syncCommand({});
    const dotB = boardInB();

    process.chdir(repoA);
    addCommand({ file: 'brainfile.md', title: 'Added after clone', column: 'todo' });
    commitBoard(dotA, { message: 'add task-2', agent: 'a' });
    syncCommand({});

    process.chdir(repoB);
    briefCommand({ agent: 'b', offline: true, peek: true });
    expect(fs.existsSync(path.join(dotB, 'board', 'task-2.md'))).toBe(false);
    briefCommand({ agent: 'b', peek: true });
    expect(fs.existsSync(path.join(dotB, 'board', 'task-2.md'))).toBe(true);
  });

  withDriver('a both-move conflict resolves to the later move on every machine', () => {
    const dotA = boardInA();
    addCommand({ file: 'brainfile.md', title: 'Contested', column: 'todo' });
    commitBoard(dotA, { message: 'add task-1', agent: 'a' });
    syncCommand({});
    const dotB = boardInB();

    // B moves first and does not sync; A moves later and pushes. When B
    // syncs, the incoming (later) move must win. A merge that silently kept
    // B's own side would leave 'review', so this proves the driver ran.
    process.chdir(repoB);
    moveCommand({ file: 'brainfile.md', task: 'task-1', column: 'review' });
    commitBoard(dotB, { message: 'move task-1', agent: 'b' });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);

    process.chdir(repoA);
    moveCommand({ file: 'brainfile.md', task: 'task-1', column: 'in-progress' });
    commitBoard(dotA, { message: 'move task-1', agent: 'a' });
    syncCommand({});

    process.chdir(repoB);
    const merged = syncCommand({});
    expect(merged?.ok).toBe(true);
    expect(merged?.conflicts).toEqual([]);
    expect(column(dotB, 'task-1')).toBe('in-progress');
    expect(run(['config', '--get', 'merge.brainfile.driver'], dotB)).toBe(driverCommand);
    expect(run(['status', '--porcelain'], dotB)).toBe('');
    expect(run(['log', '-1', '--format=%P'], dotB).split(' ')).toHaveLength(2);

    process.chdir(repoA);
    const back = syncCommand({});
    expect(back?.ok).toBe(true);
    expect(column(dotA, 'task-1')).toBe('in-progress');
    expect(run(['rev-parse', 'HEAD'], dotA)).toBe(run(['rev-parse', 'HEAD'], dotB));
  });

  withDriver('concurrent completions union the ledger and keep both archives', () => {
    const dotA = boardInA();
    addCommand({ file: 'brainfile.md', title: 'Done by A', column: 'todo' });
    addCommand({ file: 'brainfile.md', title: 'Done by B', column: 'todo' });
    commitBoard(dotA, { message: 'add tasks', agent: 'a' });
    syncCommand({});
    const dotB = boardInB();

    process.chdir(repoA);
    completeCommand({ file: 'brainfile.md', task: 'task-1' });
    commitBoard(dotA, { message: 'complete task-1', agent: 'a' });
    syncCommand({});

    process.chdir(repoB);
    completeCommand({ file: 'brainfile.md', task: 'task-2' });
    commitBoard(dotB, { message: 'complete task-2', agent: 'b' });
    const merged = syncCommand({});
    expect(merged?.ok).toBe(true);
    expect(ledgerIds(dotB)).toEqual(['task-1', 'task-2']);
    expect(fs.existsSync(path.join(dotB, 'logs', 'task-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(dotB, 'logs', 'task-2.md'))).toBe(true);
    expect(fs.existsSync(path.join(dotB, 'board', 'task-1.md'))).toBe(false);

    process.chdir(repoA);
    syncCommand({});
    expect(ledgerIds(dotA)).toEqual(['task-1', 'task-2']);
  });

  describe('autosync (phase 3)', () => {
    afterEach(() => {
      process.env.BRAINFILE_AUTOSYNC = 'off';
    });

    withDriver('push mode: a committed mutation is pushed by a detached child', () => {
      const dotA = boardInA();
      process.env.BRAINFILE_AUTOSYNC = 'push';
      installAutosync();
      addCommand({ file: 'brainfile.md', title: 'Pushed in the background', column: 'todo' });
      expect(afterCommand(fakeCommand('add', { file: 'brainfile.md', title: 'Pushed in the background' }))).toBe(true);
      const head = run(['rev-parse', 'HEAD'], dotA);
      expect(waitFor(() => run(['rev-parse', 'brainfile'], boardsRemote) === head, 15000)).toBe(true);
      expect(fs.existsSync(path.join(dotA, 'state', 'autosync.lock'))).toBe(false);
    });

    it('push mode is a no-op without a remote or when disabled', () => {
      process.chdir(repoA);
      initCommand({});
      const dotDir = path.join(repoA, '.brainfile');
      process.env.BRAINFILE_AUTOSYNC = 'push';
      expect(schedulePush(dotDir)).toBe(false);
      process.env.BRAINFILE_AUTOSYNC = 'off';
      syncCommand({ setRemote: boardsRemote });
      expect(schedulePush(dotDir)).toBe(false);
    });

    it('full mode fetches before a read once the last sync is stale', () => {
      const dotA = boardInA();
      addCommand({ file: 'brainfile.md', title: 'First', column: 'todo' });
      commitBoard(dotA, { message: 'add task-1', agent: 'a' });
      syncCommand({});
      const dotB = boardInB();

      process.chdir(repoA);
      addCommand({ file: 'brainfile.md', title: 'Second', column: 'todo' });
      commitBoard(dotA, { message: 'add task-2', agent: 'a' });
      syncCommand({});

      process.chdir(repoB);
      process.env.BRAINFILE_AUTOSYNC = 'full';
      // B just synced: within the freshness window nothing is fetched.
      expect(fetchBeforeRead(dotB)).toBeNull();
      expect(fs.existsSync(path.join(dotB, 'board', 'task-2.md'))).toBe(false);
      // Age the last sync past the window and read again through the hook.
      const state = JSON.parse(fs.readFileSync(path.join(dotB, 'state', 'sync.json'), 'utf-8'));
      state.at = new Date(Date.now() - 120_000).toISOString();
      fs.writeFileSync(path.join(dotB, 'state', 'sync.json'), JSON.stringify(state));
      beforeCommand(fakeCommand('list', { file: 'brainfile.md' }));
      expect(fs.existsSync(path.join(dotB, 'board', 'task-2.md'))).toBe(true);
      expect(run(['rev-parse', 'brainfile'], boardsRemote)).toBe(run(['rev-parse', 'HEAD'], dotA));
    });

    it('formats a header status that always says whether the board is shared', () => {
      process.chdir(repoA);
      initCommand({ plain: true });
      expect(syncStatusLabel(path.join(repoA, '.brainfile'))).toBeNull();
      fs.rmSync(path.join(repoA, '.brainfile'), { recursive: true, force: true });
      initCommand({});
      const dotDir = path.join(repoA, '.brainfile');
      expect(syncStatusLabel(dotDir)).toBe('local only');
      syncCommand({ setRemote: boardsRemote });
      expect(syncStatusLabel(dotDir)).toMatch(/^synced \d+s ago$/);
      expect(syncStatusLabel(dotDir, Date.now() + 5 * 60_000)).toBe('synced 5m ago');
      fs.writeFileSync(path.join(dotDir, 'state', 'sync.json'), JSON.stringify({ at: new Date().toISOString(), remote: 'board', remoteBranch: 'brainfile', ok: false }));
      expect(syncStatusLabel(dotDir)).toBe('not synced · saved locally');
    });
  });

  it('an unreachable remote is a warning, never a throw', () => {
    process.chdir(repoA);
    initCommand({});
    const dotDir = path.join(repoA, '.brainfile');
    syncCommand({ setRemote: path.join(base, 'missing.git') });
    const result = syncBoard(dotDir);
    expect(result.ok).toBe(false);
    expect(result.warning).toMatch(/fetch from board failed/);
    expect(result.failure).toBe('offline');
    expect(syncMessage(result).text).toMatch(/^Couldn't reach board\. Nothing was lost/);
    expect(readSyncState(dotDir)?.ok).toBe(false);
  });

  describe('UX pass: clones, where, plain language', () => {
    it('a clone of a board shared through origin gets a working board that sends back to origin', () => {
      process.chdir(repoA);
      run(['remote', 'set-url', 'origin', codeRemote], repoA);
      initCommand({});
      const dotA = path.join(repoA, '.brainfile');
      syncCommand({ setRemote: 'origin' });

      // The empty board travels with its directories intact.
      expect(run(['ls-tree', '-r', '--name-only', 'origin/brainfile'], repoA).split('\n')).toEqual(
        expect.arrayContaining(['board/.gitkeep', 'logs/.gitkeep']),
      );

      const repoC = makeClone(codeRemote, path.join(base, 'C'));
      process.chdir(repoC);
      const writes: string[] = [];
      (process.stderr.write as unknown as jest.Mock).mockImplementation((chunk: unknown) => { writes.push(String(chunk)); return true; });
      addCommand({ file: 'brainfile.md', title: 'From the clone', column: 'todo' });
      expect(writes.join('')).toMatch(/Checked out the shared board from origin into \.brainfile\//);

      const dotC = path.join(repoC, '.brainfile');
      expect(fs.existsSync(path.join(dotC, 'logs'))).toBe(true);
      expect(boardRemote(dotC)).toBe('origin');
      commitBoard(dotC, { message: 'add from clone', agent: 'c' });
      expect(syncCommand({})?.pushed).toBe(1);

      process.chdir(repoA);
      syncCommand({});
      expect(fs.existsSync(path.join(dotA, 'board', 'task-1.md'))).toBe(true);
    });

    it('--set-remote from a repo with no board yet looks for the brainfile branch, not the folder name', () => {
      boardInA();
      process.chdir(repoB);
      const logs: string[] = [];
      syncCommand({ setRemote: boardsRemote }, { log: (m: string) => logs.push(m), error: () => {}, warn: () => {} } as never);
      expect(logs.join('\n')).toContain("branch 'brainfile'");
      expect(findTrackedBoardDir(repoB)).toBe(path.join(repoB, '.brainfile'));
    });

    it('where answers location, storage and sharing without touching the network', () => {
      process.chdir(repoA);
      initCommand({});
      const dotDir = path.join(repoA, '.brainfile');
      const quiet = { log: () => {}, error: () => {}, warn: () => {} } as never;
      expect(whereCommand({}, quiet)).toMatchObject({ storage: 'branch', branch: 'brainfile', remote: null, pendingChanges: 0 });

      syncCommand({ setRemote: boardsRemote });
      addCommand({ file: 'brainfile.md', title: 'Not sent yet', column: 'todo' });
      commitBoard(dotDir, { message: 'add task-1', agent: 'a' });
      const report = whereCommand({}, quiet);
      expect(report).toMatchObject({ storage: 'branch', remote: 'board', remoteBranch: 'brainfile', pendingChanges: 1 });

      const lines: string[] = [];
      whereCommand({}, { log: (m: string) => lines.push(m), error: () => {}, warn: () => {} } as never);
      const text = lines.join('\n');
      expect(text).toMatch(/Stored\s+as commits on the 'brainfile' branch/);
      expect(text).toMatch(/1 change waiting to be sent/);
      expect(text).toMatch(/Anyone who can read board can read this board/);
    });

    it('plain boards and unshared boards say so in words', () => {
      expect(syncMessage({ ok: true, skipped: 'no-remote', pulled: 0, pushed: 0, conflicts: [] }).text)
        .toBe('This board is only on this machine. To share it: brainfile sync --set-remote origin');
      expect(syncMessage({ ok: true, remote: 'origin', pulled: 1, pushed: 2, conflicts: [] }).text)
        .toBe('Shared through origin: received 1 change, sent 2 changes.');
      expect(syncMessage({ ok: false, failure: 'conflict', remote: 'origin', pulled: 0, pushed: 0, conflicts: ['board/task-3.md'] }).text)
        .toMatch(/^Two edits collided in board\/task-3\.md/);
    });
  });
});
