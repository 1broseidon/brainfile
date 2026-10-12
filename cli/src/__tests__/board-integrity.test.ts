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
import { toolWrites, withBoardCommit } from '../mcp/helpers';
import { CLIError } from '../utils/cli-error';

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

describe('two boards in one repository (spec-15)', () => {
  let base: string;
  let repo: string;
  let dot: string;
  let originalCwd: string;
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
