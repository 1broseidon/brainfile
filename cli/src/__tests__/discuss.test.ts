/**
 * `brainfile discuss` (task-110, decision-19): a task talked over in the
 * terminal with a fake ACP agent (a small agent over the real SDK, started as
 * a custom agent), against a scratch repository whose board lives on its own
 * branch. The session runs at role discuss in the read-only mode, opens with
 * core's discussSession, refuses an edit before anyone is asked, brings any
 * other ask to the prompt, and when the person ends it the agent notes what
 * was agreed on the task.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { extractLog, findV2Task, getV2Dirs } from '@brainfile/core';
import { listRunFiles, listRunners } from '@brainfile/core/repo';
import { DISCUSS_DONE, discussAgent, discussLoop, type DiscussSummary } from '../commands/discuss';
import { MemoryLogger } from '../utils/logger';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as core's runner test does.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(60_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;
const CORE = pathToFileURL(nodeRequire.resolve('@brainfile/core')).href;

/**
 * Offers three modes and says which it is put in. On the first turn it says
 * where the task stands; asked to edit, it asks to edit a file, run git that
 * only reads, and read a file, and says what each came to; told the person is
 * done, it notes what was agreed on the task as its `brainfile mcp`'s note
 * tool would.
 */
const FAKE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import core from ${JSON.stringify(CORE)};
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.FAKE_DIR;
const board = process.env.FAKE_BOARD;
const log = (name, value) => fs.appendFileSync(path.join(dir, name), JSON.stringify(value) + '\\n');
const options = [
  { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'always', name: 'Always', kind: 'allow_always' },
  { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
];
new AgentSideConnection((conn) => {
  const ask = async (sessionId, title, kind, rawInput) => {
    const answer = await conn.requestPermission({ sessionId, toolCall: { toolCallId: title, title, kind, rawInput }, options });
    log('asked', { title, outcome: answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled' });
  };
  return {
    async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
    async newSession({ mcpServers }) {
      log('sessions', mcpServers);
      return {
        sessionId: 's1',
        modes: {
          currentModeId: 'default',
          availableModes: [
            { id: 'default', name: 'Default' },
            { id: 'read-only', name: 'Read Only' },
            { id: 'bypassPermissions', name: 'Bypass Permissions' },
          ],
        },
      };
    },
    async setSessionMode({ modeId }) { log('modes', modeId); return {}; },
    async authenticate() { return {}; },
    async prompt({ sessionId, prompt }) {
      const text = prompt.map((p) => p.text ?? '').join('');
      log('prompts', text);
      let reply;
      if (text.includes('<discussion-rules>')) reply = 'task-1 is in To Do. What do you want to talk over?';
      else if (text === 'edit it') {
        await ask(sessionId, 'Edit src/x.ts', 'edit');
        await ask(sessionId, 'Run git', 'execute', { command: 'git log --oneline' });
        await ask(sessionId, 'Read README.md', 'read');
        reply = 'I may not edit code here. Shall we narrow the description to the parser instead?';
      } else if (text === ${JSON.stringify(DISCUSS_DONE)}) {
        core.appendLog(path.join(board, 'task-1.md'), 'Agreed: narrow task-1 to the parser.', 'Fake');
        reply = 'Noted on task-1.';
      } else reply = 'Yes.';
      await conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } } });
      return { stopReason: 'end_turn' };
    },
    async cancel() {},
  };
}, ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`;

const AGENT = 'custom:Fake';
const CONFIG = `---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n  - id: review\n    title: Review\n---\n`;
const ENV = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_WORKTREES', 'BRAINFILE_DATA_DIR', 'PATH', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];

let base: string;
let project: string;
let fakeDir: string;
let filePath: string;
const savedEnv: Record<string, string | undefined> = {};
const aborts: AbortController[] = [];
const loops: Promise<unknown>[] = [];

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repository whose board lives on its own branch, with task-1 on it. */
function gitBoard(): void {
  fs.mkdirSync(project, { recursive: true });
  git(['init', '-q', '-b', 'main'], project);
  fs.writeFileSync(path.join(project, 'README.md'), 'code\n');
  git(['add', '-A'], project);
  git(['commit', '-q', '-m', 'init'], project);
  const home = path.join(project, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], project);
  fs.mkdirSync(path.join(home, 'board'));
  fs.mkdirSync(path.join(home, 'logs'));
  fs.writeFileSync(path.join(home, 'brainfile.md'), CONFIG);
  fs.writeFileSync(path.join(home, 'board', 'task-1.md'), ['---', 'id: task-1', 'title: Parse the config', 'column: todo', 'assignee: Fake', '---', '', 'Parse the config and the flags.', ''].join('\n'));
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(project, '.git', 'info', 'exclude'), '.brainfile/\n');
  filePath = path.join(home, 'brainfile.md');
}

const lines = (name: string): unknown[] =>
  fs.existsSync(path.join(fakeDir, name)) ? fs.readFileSync(path.join(fakeDir, name), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const said = (logger: MemoryLogger) => logger.logs.map((l) => String(l[0])).join('\n');
const tty = () => Object.assign(new PassThrough(), { isTTY: true });

async function until<T>(what: string, check: () => T | undefined | null | false, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A discussion left open, as in a terminal, until its controller aborts it (Ctrl-C). */
function openDiscussion(input: PassThrough, output: PassThrough, logger = new MemoryLogger()) {
  const controller = new AbortController();
  aborts.push(controller);
  const done = discussLoop(filePath, 'task-1', { agent: AGENT, input, output, sigint: false, signal: controller.signal }, logger);
  loops.push(done.catch(() => {}));
  return { done, stop: () => controller.abort(), logger };
}

beforeAll(() => {
  for (const key of ENV) savedEnv[key] = process.env[key];
});

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cli-discuss-')));
  project = path.join(base, 'repo');
  fakeDir = path.join(base, 'fake');
  const dataDir = path.join(base, 'data');
  const bin = path.join(base, 'bin');
  for (const dir of [fakeDir, dataDir, bin]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
  // A `brainfile` on PATH, so the session is handed a board server.
  fs.writeFileSync(path.join(bin, 'brainfile'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(dataDir, 'dispatch.json'),
    JSON.stringify({
      agentServers: {
        Fake: { command: process.execPath, args: [path.join(fakeDir, 'agent.mjs')], env: { FAKE_DIR: fakeDir, FAKE_BOARD: path.join(project, '.brainfile', 'board') } },
      },
    }),
  );
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    BRAINFILE_WORKTREES: path.join(base, 'worktrees'),
    BRAINFILE_DATA_DIR: dataDir,
    PATH: `${bin}:${savedEnv.PATH ?? ''}`,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  gitBoard();
});

afterEach(async () => {
  for (const controller of aborts.splice(0)) controller.abort();
  await Promise.all(loops.splice(0));
  await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(base, { recursive: true, force: true });
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('brainfile discuss: a task talked over in the terminal', () => {
  test("core's rules and mode, an edit refused before asking, other asks at the prompt, and a note when it ends", async () => {
    const input = tty();
    const output = new PassThrough();
    let shown = '';
    output.on('data', (d) => (shown += String(d)));
    const talk = openDiscussion(input, output);

    // The opening turn is core's discussSession; the session is at role discuss, in the read-only mode.
    await until('the opening reply', () => said(talk.logger).includes('task-1 is in To Do. What do you want to talk over?'));
    const [opening] = lines('prompts') as string[];
    expect(opening).toContain('<task-information id="task-1"');
    expect(opening).toContain('<discussion-rules>');
    expect(opening).toContain('When you change the board, say in a line what you changed.');
    expect(opening).toMatch(/Begin with where task-1 stands/);
    expect(lines('modes')).toEqual(['read-only']);
    const [servers] = lines('sessions') as { env: { name: string; value: string }[] }[][];
    expect(servers[0].env).toContainEqual({ name: 'BRAINFILE_AGENT_ROLE', value: 'discuss' });

    // Each line the person types is a turn. The edit is refused and git that only reads allowed, unasked; the read comes to the prompt.
    await until('the prompt', () => shown.endsWith('> '));
    input.write('edit it\n');
    await until('the read to be asked', () => shown.includes('Read README.md'));
    expect(shown).toContain('task-1 · Fake asks: Read README.md');
    expect(shown).toContain('1) Allow once  2) Always  3) Deny');
    expect(shown).not.toContain('Edit src/x.ts');
    input.write('1\n');
    await until('the reply', () => said(talk.logger).includes('Shall we narrow the description'));
    expect(lines('asked')).toEqual([
      { title: 'Edit src/x.ts', outcome: 'deny' },
      { title: 'Run git', outcome: 'once' },
      { title: 'Read README.md', outcome: 'once' },
    ]);

    // Ctrl-C ends it: the agent is told the person is done, and notes what was agreed.
    await until('the prompt again', () => shown.endsWith('> '));
    talk.stop();
    const summary: DiscussSummary = await talk.done;
    expect(summary).toMatchObject({ task: 'task-1', agent: AGENT, said: 1, leftAtOnce: false });
    expect(summary.replies.at(-1)).toBe('Noted on task-1.');
    expect((lines('prompts') as string[]).at(-1)).toBe(DISCUSS_DONE);
    expect(said(talk.logger)).toContain('Ending: Fake notes what was agreed on task-1.');
    const task = findV2Task(getV2Dirs(filePath), 'task-1')!;
    expect(extractLog(task.doc.body)).toContain('[Fake]: Agreed: narrow task-1 to the parser.');

    // The session was let go: no runner file left, no run still going.
    expect(listRunners(path.dirname(filePath))).toEqual([]);
    expect(listRunFiles(path.dirname(filePath)).filter((f) => ['starting', 'working', 'waiting'].includes(f.state))).toEqual([]);
  });

  test('ended before the person says anything, the agent is not asked to note; end of input ends it too', async () => {
    const input = tty();
    const output = new PassThrough();
    let shown = '';
    output.on('data', (d) => (shown += String(d)));
    const talk = openDiscussion(input, output);
    await until('the prompt', () => shown.endsWith('> '));
    input.end();
    const summary = await talk.done;
    expect(summary.said).toBe(0);
    expect(lines('prompts')).toHaveLength(1);
    expect(said(talk.logger)).toContain('Ending.');
  });

  test('the agent: the one named, else the one it was handed to or its assignee; an unknown one is refused', () => {
    expect(discussAgent(filePath, 'task-1', 'fake')).toBe(AGENT);
    expect(discussAgent(filePath, 'task-1')).toBe(AGENT);
    expect(() => discussAgent(filePath, 'task-1', 'nobody')).toThrow('Unknown agent nobody');
    expect(() => discussAgent(filePath, 'task-9')).toThrow('Task task-9 not found');
  });

  test('a task that is not on the board is refused before any agent starts', async () => {
    await expect(discussLoop(filePath, 'task-9', { agent: AGENT, input: tty(), output: new PassThrough(), sigint: false })).rejects.toThrow('task-9');
    expect(lines('sessions')).toEqual([]);
  });
});
