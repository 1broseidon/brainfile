/**
 * `brainfile pr` and the MCP `pull_request` tool (decision-16, spec-18): a
 * hand-off's branch pushed to origin (a bare repository here) and opened
 * through a fake forge, recorded on the task; `--status` follows it, and
 * merged completes the task and lets its worktree go. Nothing reaches the
 * network.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { parsePullRequest, readTaskFile } from '@brainfile/core';
import { prepareWorktree } from '@brainfile/core/repo';
import type { ForgeRepo, PullRequestForge, PullRequestView } from '@brainfile/core/forge';
import { prCommand } from '../commands/pr';
import { registerPullRequestTool } from '../mcp/tools/pull_request_tool';
import { MemoryLogger } from '../utils/logger';
import { FakeMcpServer, mcpText } from './helpers/mcp';

jest.setTimeout(30_000);

const ENV_KEYS = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' });
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

function identity(cwd: string): void {
  git(['config', 'user.name', 'Test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  git(['config', 'commit.gpgsign', 'false'], cwd);
}

const CONFIG = '---\ntitle: PR\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n';
const REPO: ForgeRepo = { forge: 'github', host: 'github.com', owner: 'o', name: 'r', url: 'https://github.com/o/r' };

let base: string;
let repo: string;
let origin: string;
let brainfilePath: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cli-pr-')));
  repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  identity(repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'code\n');
  git(['add', '-A'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  const home = path.join(repo, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], repo);
  fs.mkdirSync(path.join(home, 'board'));
  fs.mkdirSync(path.join(home, 'logs'));
  brainfilePath = path.join(home, 'brainfile.md');
  fs.writeFileSync(brainfilePath, CONFIG);
  fs.writeFileSync(path.join(home, 'board', 'task-1.md'), '---\nid: task-1\ntitle: Parse the thing\ncolumn: review\n---\n\n## Description\nRead it.\n');
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.brainfile/\n');
  origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', repo, origin], base);
  git(['remote', 'add', 'origin', origin], repo);
  git(['fetch', '-q', 'origin'], repo);
  git(['remote', 'set-head', 'origin', 'main'], repo);
  process.env.BRAINFILE_WORKTREES = path.join(base, 'worktrees');
});

afterEach(() => {
  delete process.env.BRAINFILE_WORKTREES;
  fs.rmSync(base, { recursive: true, force: true });
});

/** The agent's turn, on the task's own branch. */
function handOff(): string {
  const wt = prepareWorktree(repo, 'task-1')!;
  identity(wt.path);
  fs.writeFileSync(path.join(wt.path, 'parser.ts'), 'parse\n');
  git(['add', '-A'], wt.path);
  git(['commit', '-q', '-m', 'Parse'], wt.path);
  return wt.path;
}

function fakeForge() {
  let view: PullRequestView | null = null;
  const forge: PullRequestForge = {
    async openPullRequest(_repo, pr) {
      view = { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open', base: pr.base, head: pr.head, headSha: git(['rev-parse', pr.head], repo), title: pr.title, fetchedAt: Date.now() };
      return { ok: true, value: view };
    },
    async pullRequestState() {
      return view ? { ok: true, value: view } : { ok: false, error: 'none' };
    },
  };
  return { forge, set: (patch: Partial<PullRequestView>) => (view = { ...view!, ...patch }) };
}

const taskFile = () => path.join(repo, '.brainfile', 'board', 'task-1.md');

describe('brainfile pr', () => {
  test('opens the hand-off as a pull request into where it lands, and records it on the task', async () => {
    handOff();
    const { forge } = fakeForge();
    const logger = new MemoryLogger();
    const report = await prCommand('task-1', { file: brainfilePath }, logger, { github: forge, repo: REPO });
    expect(report).toMatchObject({ task: 'task-1', action: 'opened', pullRequest: { number: 3, state: 'open', base: 'main', head: 'dispatch/task-1' } });
    expect(logger.getOutput()).toContain('Opened pull request #3 dispatch/task-1 → main');
    expect(parsePullRequest(readTaskFile(taskFile())!.task.pullRequest)?.state).toBe('open');
    expect(spawnSync('git', ['--git-dir', origin, 'rev-parse', 'refs/heads/dispatch/task-1'], { encoding: 'utf-8' }).status).toBe(0);
    await expect(prCommand('task-1', { file: brainfilePath }, logger, { github: forge, repo: REPO })).rejects.toThrow(/has pull request #3 open already/);
  });

  test('--status: open says so; merged on the forge completes the task and removes its worktree', async () => {
    const at = handOff();
    const { forge, set } = fakeForge();
    await prCommand('task-1', { file: brainfilePath }, new MemoryLogger(), { github: forge, repo: REPO });
    const open = await prCommand('task-1', { file: brainfilePath, status: true }, new MemoryLogger(), { github: forge, repo: REPO });
    expect(open.pullRequest.state).toBe('open');

    git(['push', '-q', origin, 'dispatch/task-1:main'], repo);
    set({ state: 'merged' });
    const logger = new MemoryLogger();
    const merged = await prCommand('task-1', { file: brainfilePath, status: true, json: true }, logger, { github: forge, repo: REPO });
    expect(merged).toMatchObject({ action: 'followed', pullRequest: { state: 'merged' }, released: true, completed: true });
    expect(JSON.parse(logger.getOutput()).completed).toBe(true);
    expect(fs.existsSync(at)).toBe(false);
    expect(fs.existsSync(taskFile())).toBe(false);
    expect(parsePullRequest(readTaskFile(path.join(repo, '.brainfile', 'logs', 'task-1.md'))!.task.pullRequest)?.state).toBe('merged');
    // Asked again, it says how it ended.
    const again = await prCommand('task-1', { file: brainfilePath, status: true }, new MemoryLogger(), { github: forge, repo: REPO });
    expect(again.pullRequest.state).toBe('merged');
  });

  test('refused as a merge is, and for a task with no pull request to follow', async () => {
    const { forge } = fakeForge();
    await expect(prCommand('task-1', { file: brainfilePath }, new MemoryLogger(), { github: forge, repo: REPO })).rejects.toThrow('task-1 has no worktree to open a pull request for');
    await expect(prCommand('task-1', { file: brainfilePath, status: true }, new MemoryLogger(), { github: forge, repo: REPO })).rejects.toThrow('task-1 has no pull request');
    await expect(prCommand('task-9', { file: brainfilePath }, new MemoryLogger(), { github: forge, repo: REPO })).rejects.toThrow(/task-9/);
  });
});

describe('pull requests by role (decision-15)', () => {
  test("a worker's or a discussion's command line and server ask where one stands, and open none; a lead opens one only in its tree", async () => {
    handOff();
    const { forge } = fakeForge();
    const deps = { github: forge, repo: REPO };
    process.env.BRAINFILE_AGENT_ROLE = 'worker';
    try {
      await expect(prCommand('task-1', { file: brainfilePath }, new MemoryLogger(), deps)).rejects.toThrow("A worker cannot open a pull request: only a person, the board's chat or an epic's lead does");
      await expect(prCommand('task-1', { file: brainfilePath, status: true }, new MemoryLogger(), deps)).rejects.toThrow('task-1 has no pull request');
      process.env.BRAINFILE_AGENT_ROLE = 'lead';
      process.env.BRAINFILE_LEAD_SCOPE = 'epic-9';
      await expect(prCommand('task-1', { file: brainfilePath }, new MemoryLogger(), deps)).rejects.toThrow('task-1 is not under epic-9: a lead reaches only its own tree');
      await expect(prCommand('task-1', { file: brainfilePath, status: true }, new MemoryLogger(), deps)).rejects.toThrow('task-1 is not under epic-9');
    } finally {
      delete process.env.BRAINFILE_AGENT_ROLE;
      delete process.env.BRAINFILE_LEAD_SCOPE;
    }

    for (const role of ['worker', 'discuss'] as const) {
      const server = new FakeMcpServer();
      registerPullRequestTool(server as never, brainfilePath, () => deps, { role });
      const tool = server.handler('pull_request');
      // Asked to open, by name or by default, it is refused as the command line refuses, not quietly turned into status.
      for (const input of [{ task: 'task-1', action: 'open' }, { task: 'task-1' }]) {
        expect(mcpText(await tool(input))).toContain(`A ${role} cannot open a pull request: only a person, the board's chat or an epic's lead does (decision-15)`);
      }
      expect(parsePullRequest(readTaskFile(taskFile())!.task.pullRequest)).toBeNull();
      // Where one stands it may ask; with none, it is not sent to a command it may not run.
      const status = mcpText(await tool({ task: 'task-1', action: 'status' }));
      expect(status).toContain('task-1 has no pull request');
      expect(status).toContain("A person, the board's chat or an epic's lead opens one");
      expect(status).not.toContain('brainfile pr');
    }
  });
});

describe('MCP pull_request', () => {
  test('opens, then says where it stands', async () => {
    handOff();
    const { forge, set } = fakeForge();
    const server = new FakeMcpServer();
    registerPullRequestTool(server as never, brainfilePath, () => ({ github: forge, repo: REPO }));
    const tool = server.handler('pull_request');
    const opened = await tool({ task: 'task-1' });
    expect((opened as { structuredContent?: { pullRequest: { number: number } } }).structuredContent?.pullRequest.number).toBe(3);
    expect(mcpText(opened)).toBe('Opened pull request #3 dispatch/task-1 → main: https://github.com/o/r/pull/3');
    set({ state: 'closed' });
    const closed = await tool({ task: 'task-1', action: 'status' });
    expect(mcpText(closed)).toBe('#3 dispatch/task-1 → main: closed without merging: https://github.com/o/r/pull/3');
    expect(parsePullRequest(readTaskFile(taskFile())!.task.pullRequest)?.state).toBe('closed');
  });
});
