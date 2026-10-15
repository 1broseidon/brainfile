/**
 * `brainfile fix` and the MCP `where` tool's action fix | undo (task-78): the
 * desktop's Fix and Undo from core, with the plan said in the desktop's
 * words and run only while it is the plan shown. Undo works from another
 * process than the fix, through `.brainfile/state/last-fix.json`. Real git
 * in temporary directories.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fixCommand } from '../commands/fix';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { WireClient, type ToolResult } from './helpers/mcp-wire';

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

const WORDS = "Back up both, then untrack main's copy";
const logged = (logger: MemoryLogger): string => logger.logs.map((line) => line.join(' ')).join('\n');

describe('brainfile fix (task-78)', () => {
  let base: string;
  let repo: string;
  let home: string;
  let file: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-fix-cli-')));
    repo = path.join(base, 'repo');
    home = path.join(repo, '.brainfile');
    file = path.join(home, 'brainfile.md');
    fs.mkdirSync(repo);
    git(['init', '-q', '-b', 'main'], repo);
    // The old board, committed on main; then the board moved to its branch, and main still tracks the old copy.
    writeBoard(home, ['task-1', 'task-2'], '2026-02-01T00:00:00.000Z');
    git(['add', '-A'], repo);
    git(['commit', '-q', '-m', 'old board on main'], repo);
    fs.rmSync(home, { recursive: true, force: true });
    git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], repo);
    writeBoard(home, ['task-1', 'task-2', 'task-3'], '2026-03-01T00:00:00.000Z');
    git(['add', '-A'], home);
    git(['commit', '-q', '-m', 'board'], home);
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('--dry-run says the problem and the plan in the desktop\'s words, and changes nothing', () => {
    const before = git(['rev-parse', 'main'], repo);
    const logger = new MemoryLogger();
    const report = fixCommand({ file, dryRun: true }, logger);
    expect(report.problems).toEqual([{ short: 'old copy in main', line: 'An old copy of .brainfile/ (2 docs) is still tracked on main.' }]);
    expect(report.plan).toEqual({ kind: 'untrack', words: WORDS });
    expect(logged(logger)).toContain('old copy in main');
    expect(logged(logger)).toContain(WORDS);
    expect(git(['rev-parse', 'main'], repo)).toBe(before);
  });

  it('runs nothing when the plan is not the one expected', () => {
    const before = git(['rev-parse', 'main'], repo);
    expect(() => fixCommand({ file, expected: 'Back up both, then keep this one' }, new MemoryLogger())).toThrow(/The board changed: Fix would now untrack main's copy/);
    expect(git(['rev-parse', 'main'], repo)).toBe(before);
  });

  it('fixes, then --undo puts it back; a second --undo is too late', () => {
    const before = git(['rev-parse', 'main'], repo);
    const logger = new MemoryLogger();
    const report = fixCommand({ file }, logger);
    expect(report.applied).toMatchObject({ message: "Untracked main's copy.", undoUntil: expect.any(String) });
    expect(report.applied!.backups).toHaveLength(2);
    expect(report.problems).toEqual([]);
    expect(report.plan).toBeNull();
    expect(logged(logger)).toContain('brainfile fix --undo');
    expect(git(['ls-files', '.brainfile'], repo)).toBe('');
    expect(fs.existsSync(path.join(home, 'state', 'last-fix.json'))).toBe(true);

    const undone = fixCommand({ file, undo: true }, new MemoryLogger());
    expect(undone.undone).toBe('Put back as it was.');
    expect(undone.plan).toEqual({ kind: 'untrack', words: WORDS });
    expect(git(['rev-parse', 'main'], repo)).toBe(before);
    expect(() => fixCommand({ file, undo: true }, new MemoryLogger())).toThrow(CLIError);
  });

  it('with nothing wrong, says so', () => {
    fixCommand({ file }, new MemoryLogger());
    const logger = new MemoryLogger();
    const report = fixCommand({ file }, logger);
    expect(report.plan).toBeNull();
    expect(logged(logger)).toContain('Nothing to fix');
  });

  describe('the MCP where tool', () => {
    const data = <T = any>(result: ToolResult): T => result.structuredContent as T;
    let client: WireClient;

    beforeEach(async () => {
      client = await WireClient.open(file, 'modern');
    });

    afterEach(async () => {
      await client.close();
    });

    it('says the plan; action=fix runs it only with the words expected; action=undo puts it back', async () => {
      const before = git(['rev-parse', 'main'], repo);
      const where = await client.callTool('where', {});
      expect(where.isError).toBeFalsy();
      expect(data(where).fix).toEqual({ problems: [{ short: 'old copy in main', line: expect.any(String) }], plan: { kind: 'untrack', words: WORDS } });
      expect(WireClient.text(where)).toContain(`Fix would: ${WORDS}`);

      expect((await client.callTool('where', { action: 'fix' })).isError).toBe(true);
      const stale = await client.callTool('where', { action: 'fix', expected: 'Back up both, then keep this one' });
      expect(stale.isError).toBe(true);
      expect(WireClient.text(stale)).toContain('The board changed');
      expect(git(['rev-parse', 'main'], repo)).toBe(before);

      const fixed = await client.callTool('where', { action: 'fix', expected: WORDS });
      expect(fixed.isError).toBeFalsy();
      expect(data(fixed)).toMatchObject({ trackedTwice: null, fix: { problems: [], plan: null, applied: { message: "Untracked main's copy." } } });
      expect(git(['ls-files', '.brainfile'], repo)).toBe('');

      const undone = await client.callTool('where', { action: 'undo' });
      expect(undone.isError).toBeFalsy();
      expect(data(undone).fix).toMatchObject({ undone: 'Put back as it was.', plan: { words: WORDS } });
      expect(git(['rev-parse', 'main'], repo)).toBe(before);
      expect((await client.callTool('where', { action: 'undo' })).isError).toBe(true);
    });
  });

  const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
  (fs.existsSync(distCli) ? it : it.skip)('undoes from another process: brainfile fix, then brainfile fix --undo', () => {
    const cli = (args: string[]) => {
      const r = spawnSync(process.execPath, [distCli, ...args], {
        cwd: repo,
        encoding: 'utf-8',
        env: { ...process.env, BRAINFILE_AUTOSYNC: 'off', BRAINFILE_AGENT: '', NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const before = git(['rev-parse', 'main'], repo);
    const dry = cli(['fix', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.out).toContain(WORDS);
    const fixed = cli(['fix', '--expected', WORDS]);
    expect(fixed.status).toBe(0);
    expect(fixed.out).toContain("Untracked main's copy.");
    expect(git(['rev-parse', 'main'], repo)).not.toBe(before);
    const undone = cli(['fix', '--undo']);
    expect(undone.status).toBe(0);
    expect(undone.out).toContain('Put back as it was.');
    expect(git(['rev-parse', 'main'], repo)).toBe(before);
  });
});
