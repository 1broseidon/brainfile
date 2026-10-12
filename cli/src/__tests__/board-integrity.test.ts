/**
 * spec-15 phase 1: with two boards in a repository, reads still work, every
 * write refuses with the command that settles it, and `where` shows both.
 * Real git in temporary directories.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { beforeCommand, commandWrites } from '../utils/board-commit-hooks';
import { whereCommand } from '../commands/where';
import { adoptCommand, backupsCommand, mergeBoardsCommand } from '../commands/boards';
import { toolWrites, withBoardCommit } from '../mcp/helpers';
import { CLIError } from '../utils/cli-error';
import { migrateToBranch } from '../commands/migrate-tracked';
import { lintBoard } from '../commands/lint';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

interface FakeCommand {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: FakeCommand | null;
}

function fakeCommand(names: string[], opts: Record<string, unknown> = {}, args: string[] = []): FakeCommand {
  let cursor: FakeCommand = { name: () => 'brainfile', args: [], opts: () => ({}), parent: null };
  names.forEach((name, i) => {
    const last = i === names.length - 1;
    cursor = { name: () => name, args: last ? args : [], opts: () => (last ? opts : {}), parent: cursor };
  });
  return cursor;
}

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n---\n';
const doc = (id: string, updatedAt: string) =>
  `---\nid: ${id}\ntitle: ${id}\ncolumn: todo\ncreatedAt: "2026-01-01T00:00:00.000Z"\nupdatedAt: "${updatedAt}"\n---\n`;

function writeBoard(dotDir: string, ids: string[], updatedAt: string): void {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), CONFIG);
  for (const id of ids) fs.writeFileSync(path.join(dotDir, 'board', `${id}.md`), doc(id, updatedAt));
}

const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'BRAINFILE_AUTOSYNC']) {
    saved[key] = process.env[key];
  }
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    BRAINFILE_AUTOSYNC: 'off',
  });
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('two boards in one repository (spec-15)', () => {
  let base: string;
  let repo: string;
  let dot: string;
  let originalCwd: string;
  beforeEach(() => {
    originalCwd = process.cwd();
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-integrity-')));
    repo = path.join(base, 'repo');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    // The old board, tracked on main.
    dot = path.join(repo, '.brainfile');
    writeBoard(dot, ['task-1', 'task-2'], '2026-02-01T00:00:00.000Z');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'board on main'], repo);
    // The newer board on its branch, checked out somewhere else.
    const stray = path.join(base, 'stray');
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', stray], repo);
    writeBoard(stray, ['task-1', 'task-2', 'task-3'], '2026-03-01T00:00:00.000Z');
    git(['add', '-A'], stray);
    git(['commit', '-q', '-m', 'board'], stray);
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('refuses a write, naming the command that settles it', () => {
    expect(() => beforeCommand(fakeCommand(['add'], { title: 'x' }))).toThrow(CLIError);
    expect(() => beforeCommand(fakeCommand(['move'], { task: 'task-1', column: 'todo' }))).toThrow(
      /Two boards: this folder \(2\) and the 'brainfile' branch \(3, newer\)\..*Settle it first: brainfile adopt refs\/heads\/brainfile/
    );
    // Nothing was committed on the way to refusing.
    expect(git(['status', '--porcelain'], repo)).toBe('');
  });

  it("migrate --to-branch says this folder and the branch are two boards, instead of failing on the checkout", () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => migrateToBranch({})).toThrow(
      /A board already lives on the 'brainfile' branch \(checked out at .*stray\), so this folder and it are two boards\..*brainfile merge-boards refs\/heads\/brainfile.*Nothing was changed\./
    );
    jest.restoreAllMocks();
    expect(git(['status', '--porcelain'], repo)).toBe('');
  });

  it('lint reports the two boards as an error', () => {
    const report = lintBoard(path.join(dot, 'brainfile.md'));
    expect(report.errors.map((i) => i.code)).toContain('two-boards');
    expect(report.warnings.map((i) => i.code)).toContain('board-checkout-elsewhere');
  });

  it('still reads', () => {
    expect(() => beforeCommand(fakeCommand(['list']))).not.toThrow();
    expect(() => beforeCommand(fakeCommand(['show'], { task: 'task-1' }))).not.toThrow();
    expect(() => beforeCommand(fakeCommand(['lint']))).not.toThrow();
    expect(() => beforeCommand(fakeCommand(['lint'], { fix: true }))).toThrow(CLIError);
  });

  it('where shows both boards and what to run', () => {
    const lines: string[] = [];
    const report = whereCommand({}, { log: (m: string) => lines.push(m), error: () => {}, warn: () => {} } as never);
    expect(report.conflict).toMatchObject({ relation: 'contained' });
    expect(report.boards.map((b) => [b.kind, b.docs])).toEqual([['folder', 2], ['branch', 3]]);
    expect(report.strayWorktrees).toEqual([{ path: path.join(base, 'stray'), missing: false }]);
    const text = lines.join('\n');
    expect(text).toMatch(/Boards\s+Two boards: this folder \(2\) and the 'brainfile' branch \(3, newer\)\./);
    expect(text).toMatch(/The 'brainfile' branch already has everything this folder has\./);
    expect(text).toMatch(/Nothing writes until you choose: brainfile adopt refs\/heads\/brainfile/);
    expect(text).toMatch(/the board branch is also checked out at .*stray/);
  });

  it('merge-boards settles it: the branch already had everything, so it is adopted and writes work again', () => {
    const lines: string[] = [];
    const logger = { log: (m: string) => lines.push(m), error: () => {}, warn: () => {} } as never;
    const result = mergeBoardsCommand({ ref: 'refs/heads/brainfile' }, logger);
    expect(result).toMatchObject({ adopted: 'other', dotDir: dot, removedCheckouts: [path.join(base, 'stray')] });
    const text = lines.join('\n');
    expect(text).toMatch(/The 'brainfile' branch already had everything this board had, so it was adopted as it is\./);
    expect(text).toMatch(/Saved first: \d{8}T\d{6}Z-folder, \d{8}T\d{6}Z-branch\./);
    expect(text).toMatch(/main stopped tracking \.brainfile\/ and ignores it, in one commit/);

    expect(() => beforeCommand(fakeCommand(['add'], { title: 'x' }))).not.toThrow();
    expect(whereCommand({}, { log: () => {}, error: () => {}, warn: () => {} } as never).conflict).toBeNull();

    const listed = backupsCommand({}, { log: () => {}, error: () => {}, warn: () => {} } as never) as Array<{ name: string; docs: number }>;
    expect(listed.map((b) => b.docs).sort()).toEqual([2, 3]);
  });

  it('adopt takes the named board as it is; backups restore puts the old one back', () => {
    const quiet = { log: () => {}, error: () => {}, warn: () => {} } as never;
    const adopted = adoptCommand({ ref: 'refs/heads/brainfile' }, quiet);
    expect(fs.readdirSync(path.join(dot, 'board')).filter((f) => f.endsWith('.md')).sort()).toEqual(['task-1.md', 'task-2.md', 'task-3.md']);
    const folder = adopted.backups.find((b) => b.endsWith('-folder'))!;
    backupsCommand({ action: 'restore', name: folder }, quiet);
    expect(fs.readdirSync(path.join(dot, 'board')).filter((f) => f.endsWith('.md')).sort()).toEqual(['task-1.md', 'task-2.md']);
    expect(() => backupsCommand({ action: 'restore' }, quiet)).toThrow(/Name the backup to restore/);
  });

  it('MCP refuses a writing tool call and lets a reading one through', async () => {
    let ran = 0;
    const handler = withBoardCommit('task_add', path.join(dot, 'brainfile.md'), async () => {
      ran += 1;
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    });
    const refused = (await handler({}, {})) as { isError?: boolean; content: Array<{ text: string }> };
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toMatch(/Two boards: .*brainfile adopt refs\/heads\/brainfile/);
    expect(ran).toBe(0);

    const reader = withBoardCommit('columns', path.join(dot, 'brainfile.md'), async () => {
      ran += 1;
      return { content: [{ type: 'text' as const, text: 'ok' }] };
    });
    await reader({ action: 'list' }, {});
    expect(ran).toBe(1);
  });
});

describe('which calls write', () => {
  it('classifies CLI invocations', () => {
    expect(commandWrites(fakeCommand(['add']))).toBe(true);
    expect(commandWrites(fakeCommand(['decide']))).toBe(true);
    expect(commandWrites(fakeCommand(['list']))).toBe(false);
    expect(commandWrites(fakeCommand(['where']))).toBe(false);
    expect(commandWrites(fakeCommand(['plan', 'list']))).toBe(false);
    expect(commandWrites(fakeCommand(['plan', 'add']))).toBe(true);
    expect(commandWrites(fakeCommand(['columns', 'list']))).toBe(false);
    expect(commandWrites(fakeCommand(['columns', 'add']))).toBe(true);
    expect(commandWrites(fakeCommand(['types'], {}, []))).toBe(false);
    expect(commandWrites(fakeCommand(['types'], {}, ['add']))).toBe(true);
    expect(commandWrites(fakeCommand(['template'], { list: true }))).toBe(false);
    expect(commandWrites(fakeCommand(['template'], { use: 'bug-report' }))).toBe(true);
  });

  it('classifies MCP tool calls', () => {
    expect(toolWrites('task_add', {})).toBe(true);
    expect(toolWrites('columns', {})).toBe(false);
    expect(toolWrites('columns', { action: 'rename' })).toBe(true);
    expect(toolWrites('board', {})).toBe(false);
    expect(toolWrites('board', { title: 'x' })).toBe(true);
    expect(toolWrites('lint', { fix: true })).toBe(true);
    expect(toolWrites('template', { action: 'use' })).toBe(true);
    expect(toolWrites('types', {})).toBe(false);
  });
});

describe('one home for the board branch (spec-15)', () => {
  let base: string;
  let repo: string;
  let home: string;
  let originalCwd: string;
  const quiet = { log: () => {}, error: () => {}, warn: () => {} } as never;

  beforeEach(() => {
    originalCwd = process.cwd();
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-home-')));
    repo = path.join(base, 'repo');
    home = path.join(repo, '.brainfile');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'init'], repo);
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  function branchAt(at: string): void {
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', at], repo);
    writeBoard(at, ['task-1', 'task-2'], '2026-03-01T00:00:00.000Z');
    git(['add', '-A'], at);
    git(['commit', '-q', '-m', 'board'], at);
  }

  it('migrate --to-branch finishes a move that left main tracking the old copy', () => {
    writeBoard(home, ['task-1'], '2026-02-01T00:00:00.000Z');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board on main'], repo);
    fs.rmSync(home, { recursive: true, force: true });
    branchAt(home);
    expect(whereCommand({}, quiet).trackedTwice).toMatchObject({ docs: 1 });

    jest.spyOn(console, 'log').mockImplementation(() => {});
    migrateToBranch({});
    expect(git(['ls-files', '.brainfile'], repo)).toBe('');
    expect(git(['log', '-1', '--format=%s', 'main'], repo)).toBe('chore: move the board to the brainfile branch');
    expect(git(['status', '--porcelain'], repo)).toBe('');
    expect(whereCommand({}, quiet).trackedTwice).toBeNull();
  });

  it('a checkout whose folder is gone is reported, and lint --fix forgets it', () => {
    branchAt(home);
    const gone = path.join(base, 'gone');
    git(['worktree', 'add', '-q', '-f', gone, 'brainfile'], repo);
    fs.rmSync(gone, { recursive: true, force: true });

    expect(whereCommand({}, quiet).strayWorktrees).toEqual([{ path: gone, missing: true }]);
    const report = lintBoard(path.join(home, 'brainfile.md'));
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'board-checkout-lost', fixable: true })]));
    expect(lintBoard(path.join(home, 'brainfile.md'), { fix: true }).fixed).toBe(true);
    expect(git(['worktree', 'list', '--porcelain'], repo)).not.toContain(gone);
  });

  it('a lost checkout no longer keeps the board from being checked out at home', () => {
    const gone = path.join(base, 'gone');
    branchAt(gone);
    fs.rmSync(gone, { recursive: true, force: true });
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(resolveCliBrainfilePath()).toBe(path.join(home, 'brainfile.md'));
    expect(git(['worktree', 'list', '--porcelain'], repo)).not.toContain(gone);
  });

  it('a board checked out only somewhere else is told where it belongs, and adopt moves it home', () => {
    const elsewhere = path.join(base, 'elsewhere');
    branchAt(elsewhere);
    expect(resolveCliBrainfilePath()).toBe(path.join(elsewhere, 'brainfile.md'));
    const report = whereCommand({}, quiet);
    expect(report.outsideHome).toBe(home);
    expect(report.conflict).toBeNull();
    expect(lintBoard(path.join(elsewhere, 'brainfile.md')).warnings.map((i) => i.code)).toContain('board-checkout-elsewhere');

    const result = adoptCommand({ ref: 'refs/heads/brainfile' }, quiet);
    expect(result).toMatchObject({ dotDir: home, removedCheckouts: [elsewhere] });
    expect(resolveCliBrainfilePath()).toBe(path.join(home, 'brainfile.md'));
    expect(whereCommand({}, quiet).outsideHome).toBeNull();
  });
});

/**
 * spec-15-8: runprism.ai's case end to end through the built CLI, the way a
 * person or an agent meets it. Skips without `npm run build`.
 */
const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
const withBundle = fs.existsSync(distCli) ? describe : describe.skip;

withBundle('runprism.ai, end to end (spec-15)', () => {
  let base: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-runprism-')));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  function cli(args: string[], cwd: string): { status: number | null; out: string } {
    const r = spawnSync(process.execPath, [distCli, ...args], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, BRAINFILE_AUTOSYNC: 'off', BRAINFILE_AGENT: '', NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  it('two boards are found, writes refuse, merge-boards makes one, and it syncs as a fast-forward', () => {
    const origin = path.join(base, 'origin.git');
    git(['init', '-q', '--bare', origin], base);
    const repo = path.join(base, 'runprism');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    git(['remote', 'add', 'origin', origin], repo);
    // The old plain-files board, tracked on main.
    writeBoard(path.join(repo, '.brainfile'), ['task-1', 'task-2', 'task-3'], '2026-08-12T00:00:00.000Z');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board'], repo);
    git(['push', '-q', 'origin', 'main'], repo);
    // The newer board on the brainfile branch, shared, checked out in a temp directory.
    const tmp = path.join(base, 'tmp', 'rp-board');
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', tmp], repo);
    writeBoard(tmp, ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'], '2026-10-12T00:00:00.000Z');
    git(['add', '-A'], tmp);
    git(['commit', '-q', '-m', 'linear import'], tmp);
    git(['push', '-q', 'origin', 'brainfile:refs/brainfile/board'], repo);
    git(['config', 'brainfile.remote', 'origin'], repo);

    const where = cli(['where', '--fetch'], repo);
    expect(where.status).toBe(0);
    expect(where.out).toMatch(/Two boards: this folder \(3\) and the 'brainfile' branch \(5, newer\)\./);
    expect(where.out).toMatch(/the board branch is also checked out at .*rp-board/);

    const refused = cli(['add', '-t', 'Lost write'], repo);
    expect(refused.status).not.toBe(0);
    expect(refused.out).toMatch(/Nothing was written\. Settle it first: brainfile adopt refs\/heads\/brainfile/);
    expect(cli(['list'], repo).status).toBe(0);

    const migrate = cli(['migrate', '--to-branch'], repo);
    expect(migrate.status).not.toBe(0);
    expect(migrate.out).toMatch(/two boards.*brainfile merge-boards refs\/heads\/brainfile/s);

    const merged = cli(['merge-boards', 'refs/heads/brainfile'], repo);
    expect(merged.status).toBe(0);
    expect(merged.out).toMatch(/already had everything this board had, so it was adopted as it is/);
    expect(fs.existsSync(tmp)).toBe(false);

    const added = cli(['add', '-t', 'After the fix'], repo);
    expect(added.status).toBe(0);
    const synced = cli(['sync'], repo);
    expect(synced.status).toBe(0);
    expect(git(['ls-tree', '-r', '--name-only', 'refs/brainfile/board'], origin)).toContain('board/task-6.md');

    expect(git(['ls-files', '.brainfile'], repo)).toBe('');
    expect(git(['log', '-1', '--format=%s', 'main'], repo)).toBe('chore: move the board to the brainfile branch');
    expect(cli(['backups'], repo).out).toMatch(/-folder\s+3 docs.*\n.*-branch\s+5 docs|-branch\s+5 docs.*\n.*-folder\s+3 docs/);
    expect(cli(['where'], repo).out).not.toMatch(/Two boards|Also/);
  });
});
