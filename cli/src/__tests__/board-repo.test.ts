/**
 * Board-on-a-branch (spec-9, phase 1): tracked storage, resolution from linked
 * worktrees and fresh clones, one commit per command, migration both ways.
 * Uses real git in temporary directories.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { initCommand } from '../commands/init';
import { addCommand } from '../commands/add';
import { migrateCommand } from '../commands/migrate';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import {
  boardRepoKind,
  commitBoard,
  describeCommandForCommit,
  findTrackedBoardDir,
} from '../utils/board-repo';
import { afterCommand, beforeCommand } from '../utils/board-commit-hooks';

function run(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}

function makeRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  run(['init', '--quiet', '-b', 'main'], dir);
  run(['config', 'user.name', 'Tester'], dir);
  run(['config', 'user.email', 'tester@example.com'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), 'code\n', 'utf-8');
  run(['add', '-A'], dir);
  run(['commit', '--quiet', '-m', 'code'], dir);
}

const subjects = (dotDir: string): string[] => run(['log', '--format=%s'], dotDir).split('\n').filter(Boolean);
const lastAuthor = (dotDir: string): string => run(['log', '-1', '--format=%an'], dotDir);
const excludeFile = (repo: string): string => {
  const p = path.join(repo, '.git', 'info', 'exclude');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
};

interface FakeCommand {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: FakeCommand | null;
}
function fakeCommand(names: string[], opts: Record<string, unknown> = {}, args: string[] = []): FakeCommand {
  const root: FakeCommand = { name: () => 'brainfile', args: [], opts: () => ({}), parent: null };
  let parent: FakeCommand = root;
  for (const [i, n] of names.entries()) {
    const last = i === names.length - 1;
    const cmd: FakeCommand = { name: () => n, args: last ? args : [], opts: () => (last ? opts : {}), parent };
    parent = cmd;
  }
  return parent;
}

describe('board on a branch (spec-9 phase 1)', () => {
  let base: string;
  let originalCwd: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_AGENT', 'BRAINFILE_GLOBAL']) {
      savedEnv[key] = process.env[key];
    }
    // Isolate from the developer's global git config (signing, hooks, default branch).
    process.env.GIT_CONFIG_GLOBAL = os.devNull;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    delete process.env.BRAINFILE_AGENT;
    delete process.env.BRAINFILE_GLOBAL;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-branch-')));
    originalCwd = process.cwd();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('init inside a git repo creates a worktree on the brainfile branch, hidden from the code branch', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);

    initCommand({});

    const dotDir = path.join(repo, '.brainfile');
    expect(fs.existsSync(path.join(dotDir, 'brainfile.md'))).toBe(true);
    expect(boardRepoKind(dotDir)).toBe('linked');
    expect(run(['rev-parse', '--verify', 'refs/heads/brainfile'], repo)).toMatch(/^[0-9a-f]{40}$/);
    expect(subjects(dotDir)).toEqual(['init board']);
    expect(run(['status', '--porcelain'], repo)).toBe('');
    expect(excludeFile(repo)).toContain('.brainfile/');
    expect(fs.existsSync(path.join(repo, '.gitignore'))).toBe(false);
  });

  it('init from a subdirectory of a repo places the board at the repository root', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    const sub = path.join(repo, 'packages', 'app');
    fs.mkdirSync(sub, { recursive: true });
    process.chdir(sub);

    initCommand({});

    expect(fs.existsSync(path.join(repo, '.brainfile', 'brainfile.md'))).toBe(true);
    expect(fs.existsSync(path.join(sub, '.brainfile'))).toBe(false);
  });

  it('init stays plain outside a repo and with --plain inside one; --tracked makes a standalone repository', () => {
    const plainDir = path.join(base, 'plain');
    fs.mkdirSync(plainDir);
    process.chdir(plainDir);
    initCommand({});
    expect(boardRepoKind(path.join(plainDir, '.brainfile'))).toBeNull();

    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({ plain: true });
    expect(boardRepoKind(path.join(repo, '.brainfile'))).toBeNull();
    expect(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/brainfile'], { cwd: repo }).status).not.toBe(0);

    const trackedDir = path.join(base, 'tracked');
    fs.mkdirSync(trackedDir);
    process.chdir(trackedDir);
    initCommand({ tracked: true });
    const dotDir = path.join(trackedDir, '.brainfile');
    expect(boardRepoKind(dotDir)).toBe('standalone');
    expect(subjects(dotDir)).toEqual(['init board']);
  });

  it('every command becomes one commit on the board branch, authored as the agent', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({});
    const dotDir = path.join(repo, '.brainfile');

    process.env.BRAINFILE_AGENT = 'codex';
    const command = fakeCommand(['add'], { title: 'Fix login', column: 'todo' });
    beforeCommand(command);
    addCommand({ file: 'brainfile.md', title: 'Fix login', column: 'todo' });
    expect(afterCommand(command)).toBe(true);
    delete process.env.BRAINFILE_AGENT;

    expect(subjects(dotDir)[0]).toBe('add: Fix login');
    expect(lastAuthor(dotDir)).toBe('codex');
    expect(run(['status', '--porcelain'], dotDir)).toBe('');
    // A second run with nothing changed commits nothing.
    expect(afterCommand(command)).toBe(false);
  });

  it('hand edits are committed on their own before a command runs', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({});
    const dotDir = path.join(repo, '.brainfile');

    fs.appendFileSync(path.join(dotDir, 'brainfile.md'), '\nEdited by hand.\n');
    expect(beforeCommand(fakeCommand(['list']))).toBe(true);
    expect(subjects(dotDir)[0]).toBe('edit: brainfile.md');
    expect(lastAuthor(dotDir)).toBe('Tester');
  });

  it('a linked code worktree resolves the same board without any setup', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({});
    const feature = path.join(base, 'repo-feature');
    run(['worktree', 'add', '--quiet', feature, '-b', 'feature'], repo);

    process.chdir(feature);
    expect(fs.existsSync(path.join(feature, '.brainfile'))).toBe(false);
    expect(findTrackedBoardDir(feature)).toBe(path.join(repo, '.brainfile'));
    expect(resolveCliBrainfilePath()).toBe(path.join(repo, '.brainfile', 'brainfile.md'));
    expect(resolveCliBrainfilePath('brainfile.md')).toBe(path.join(repo, '.brainfile', 'brainfile.md'));
  });

  it('a fresh clone materializes the board worktree from origin on first use', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({});
    addCommand({ file: 'brainfile.md', title: 'Shared task', column: 'todo' });
    commitBoard(path.join(repo, '.brainfile'), { message: 'add: Shared task' });

    const clone = path.join(base, 'clone');
    run(['clone', '--quiet', repo, clone], base);
    run(['config', 'user.name', 'Cloner'], clone);
    run(['config', 'user.email', 'cloner@example.com'], clone);
    process.chdir(clone);
    expect(fs.existsSync(path.join(clone, '.brainfile'))).toBe(false);

    const resolved = resolveCliBrainfilePath();
    expect(resolved).toBe(path.join(clone, '.brainfile', 'brainfile.md'));
    expect(boardRepoKind(path.join(clone, '.brainfile'))).toBe('linked');
    expect(fs.readdirSync(path.join(clone, '.brainfile', 'board')).filter((f) => f.endsWith('.md'))).toHaveLength(1);
    expect(subjects(path.join(clone, '.brainfile'))[0]).toBe('add: Shared task');
    expect(run(['status', '--porcelain'], clone)).toBe('');
    expect(excludeFile(clone)).toContain('.brainfile/');
  });

  it('discovery stops at the repository root instead of falling through to a board above it', () => {
    process.chdir(base);
    initCommand({});
    const homeBoard = path.join(base, '.brainfile', 'brainfile.md');
    expect(fs.existsSync(homeBoard)).toBe(true);

    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    expect(resolveCliBrainfilePath()).not.toBe(homeBoard);
    expect(fs.existsSync(resolveCliBrainfilePath())).toBe(false);
  });

  it('migrate --to-branch imports an untracked plain board and --to-plain converts it back', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({ plain: true });
    addCommand({ file: 'brainfile.md', title: 'Existing work', column: 'todo' });
    const dotDir = path.join(repo, '.brainfile');
    const filesBefore = fs.readdirSync(path.join(dotDir, 'board'));

    migrateCommand({ toBranch: true });
    expect(boardRepoKind(dotDir)).toBe('linked');
    expect(subjects(dotDir)).toEqual(['import board']);
    expect(fs.readdirSync(path.join(dotDir, 'board')).filter((f) => f !== '.gitkeep')).toEqual(filesBefore);
    expect(run(['status', '--porcelain'], repo)).toBe('');
    expect(excludeFile(repo)).toContain('.brainfile/');
    expect(fs.existsSync(`${dotDir}.migrating`)).toBe(false);

    migrateCommand({ toPlain: true });
    expect(boardRepoKind(dotDir)).toBeNull();
    expect(fs.readdirSync(path.join(dotDir, 'board')).filter((f) => f !== '.gitkeep')).toEqual(filesBefore);
    expect(run(['rev-parse', '--verify', 'refs/heads/brainfile'], repo)).toMatch(/^[0-9a-f]{40}$/);
    expect(excludeFile(repo)).not.toContain('.brainfile/');
  });

  it('migrate --to-branch keeps the history of a board committed on the code branch', () => {
    const repo = path.join(base, 'repo');
    makeRepo(repo);
    process.chdir(repo);
    initCommand({ plain: true });
    run(['add', '-A'], repo);
    run(['commit', '--quiet', '-m', 'board: initial'], repo);
    addCommand({ file: 'brainfile.md', title: 'Tracked on main', column: 'todo' });
    run(['add', '-A'], repo);
    run(['commit', '--quiet', '-m', 'board: add task'], repo);
    const dotDir = path.join(repo, '.brainfile');

    migrateCommand({ toBranch: true, commit: true });

    expect(boardRepoKind(dotDir)).toBe('linked');
    expect(subjects(dotDir)).toEqual(['board: add task', 'board: initial']);
    expect(run(['ls-files', '.brainfile'], repo)).toBe('');
    expect(run(['log', '-1', '--format=%s'], repo)).toContain('brainfile branch');
    expect(run(['status', '--porcelain'], repo)).toBe('');
    expect(fs.readdirSync(path.join(dotDir, 'board')).filter((f) => f.endsWith('.md'))).toHaveLength(1);
  });

  it('migrate --to-branch folds a standalone board repository into the surrounding repo', () => {
    const folder = path.join(base, 'folder');
    fs.mkdirSync(folder);
    process.chdir(folder);
    initCommand({ tracked: true });
    const dotDir = path.join(folder, '.brainfile');
    expect(boardRepoKind(dotDir)).toBe('standalone');

    // The folder later becomes a repository.
    run(['init', '--quiet', '-b', 'main'], folder);
    run(['config', 'user.name', 'Tester'], folder);
    run(['config', 'user.email', 'tester@example.com'], folder);
    fs.writeFileSync(path.join(folder, 'README.md'), 'code\n');
    run(['add', 'README.md'], folder);
    run(['commit', '--quiet', '-m', 'code'], folder);

    migrateCommand({ toBranch: true });
    expect(boardRepoKind(dotDir)).toBe('linked');
    expect(subjects(dotDir)).toContain('init board');
    expect(run(['status', '--porcelain'], folder)).toBe('');
  });

  it('commitBoard is a no-op on a plain board', () => {
    const plainDir = path.join(base, 'plain');
    fs.mkdirSync(plainDir);
    process.chdir(plainDir);
    initCommand({});
    expect(commitBoard(path.join(plainDir, '.brainfile'), { message: 'anything' })).toBe(false);
  });

  it('describes commands as "<verb> <id>: <detail>"', () => {
    expect(describeCommandForCommit(fakeCommand(['move'], { task: 'task-3', column: 'in-progress' }))).toBe('move task-3: in-progress');
    expect(describeCommandForCommit(fakeCommand(['add'], { title: 'Fix login bug', column: 'todo' }))).toBe('add: Fix login bug');
    expect(describeCommandForCommit(fakeCommand(['note'], { task: 'task-3' }, ['Tests pass on the new cache']))).toBe('note task-3: Tests pass on the new cache');
    expect(describeCommandForCommit(fakeCommand(['contract', 'pickup'], { task: 'task-2' }))).toBe('contract pickup task-2');
    expect(describeCommandForCommit(fakeCommand(['complete'], { task: 'task-9' }))).toBe('complete task-9');
  });
});
