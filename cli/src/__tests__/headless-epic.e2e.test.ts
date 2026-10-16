/**
 * Without the desktop, end to end (task-88, decision-17): epic-6's parts put
 * together on one demo repository with a remote (a bare clone), with no
 * window running. The agents are one fake ACP agent over the real SDK,
 * started as a custom agent, that talks to the board only through the real
 * `brainfile mcp` its session is handed (the built CLI, on PATH as
 * `brainfile`): a lead dispatches through it; a worker commits in its
 * worktree, runs its contract's checks there and moves its task; a
 * discussion notes what was agreed.
 *
 * 1. A terminal only: `brainfile run --once` with an epic handed to its lead.
 *    The lead is shown the plan's overlap, hands off its three children, at
 *    most two at once; each lands with its checks, the one that conflicts goes
 *    back to its agent and lands after, the dependent forks only once both
 *    have landed, and the epic completes with its last child.
 * 2. An MCP client only (`brainfile mcp` over stdio, as Claude Code starts
 *    it), a terminal runner up: dispatch, status, stop, dispatch again, land.
 * 3. The desktop's view: a core Runner as the window's (desktop/src/agents
 *    holds no more than that and external.ts) sees the terminal's runs live,
 *    answers an ask the terminal put up (the terminal's prompt comes down),
 *    merges a task the terminal ran, and stops one. Opened together with
 *    `brainfile run`, the two never take one lead or one child, and a request
 *    answered before claims existed is run by neither.
 * 4. `brainfile discuss` and `brainfile fix` on the same board, beside a live
 *    hand-off: the discussion takes no claim and is not counted as a hand-off,
 *    and leaves its note when it ends; fix finds nothing wrong.
 */
import { describe, test, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';
import { extractLog, findV2Task, getV2Dirs, readDispatchRecord, readLeadRecord } from '@brainfile/core';
import { listRunFiles, listRunners, projectOfBoard } from '@brainfile/core/repo';
import { Runner, type RunnerOptions } from '@brainfile/core/dispatch';
import { dispatchReport } from '../commands/dispatch';
import { runLoop, type RunSummary } from '../commands/run';
import { DISCUSS_DONE, discussLoop } from '../commands/discuss';
import { fixCommand } from '../commands/fix';
import { MemoryLogger } from '../utils/logger';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as core's runner test does.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(120_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;
/** The built CLI: what an agent's `brainfile mcp` and the MCP client run. */
const CLI = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
const BUILT = fs.existsSync(CLI);

/**
 * An MCP client over stdio, as Claude Code or an agent starts `brainfile
 * mcp`: newline-delimited JSON-RPC, the 2025 handshake. Shared by the fake
 * agent and the test.
 */
const MCP_CLIENT = `
const { spawn } = require('child_process');
function connect(command, args, options) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], ...options });
  const pending = new Map();
  let buffer = '';
  let next = 1;
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', (d) => {
    buffer += d;
    for (let i; (i = buffer.indexOf('\\n')) >= 0; ) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message + '\\n' + stderr));
      else waiter.resolve(message.result);
    }
  });
  child.on('exit', () => { for (const w of pending.values()) w.reject(new Error('brainfile mcp exited: ' + stderr)); pending.clear(); });
  const send = (message) => child.stdin.write(JSON.stringify(message) + '\\n');
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });
  const ready = request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'headless-e2e', version: '0' } }).then(() =>
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
  );
  return {
    async tools() { await ready; return ((await request('tools/list')).tools || []).map((t) => t.name); },
    async call(name, args = {}) {
      await ready;
      const result = await request('tools/call', { name, arguments: args });
      if (result.isError) throw new Error(name + ' ' + JSON.stringify(args) + ': ' + textOf(result));
      return result;
    },
    close() { child.kill(); },
  };
}
const textOf = (result) => (result.content || []).map((c) => c.text || '').join('\\n');
module.exports = { connect, textOf };
`;

/**
 * One agent, three parts, by the role its board server is started with:
 * - lead: on its first turn notes a plan on its epic and dispatches what
 *   lead.json names for it, and tries a task outside its tree; later turns
 *   only say they read what happened.
 * - worker: does what work.json says for its task: holds until released or
 *   stopped, waits for another task to start or for the trunk to carry a
 *   line, asks before running something, writes and commits its files; when
 *   its branch comes back with a landing sent back in its log, merges the
 *   trunk and settles the conflict; then runs its contract's checks in its worktree and moves its
 *   task to Review, through its own board server.
 * - discuss: answers, and when the person is done notes what was agreed.
 * Every prompt, tool list, start and ask is logged in FAKE_DIR.
 */
const FAKE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { connect, textOf } = require('./mcp-client.cjs');
const dir = process.env.FAKE_DIR;
const log = (name, value) => fs.appendFileSync(path.join(dir, name), JSON.stringify(value) + '\\n');
const lines = (name) => (fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), 'utf-8').split('\\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const has = (name) => fs.existsSync(path.join(dir, name));
const plan = (name, id) => (has(name) ? JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8'))[id] : undefined) || {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf-8' });
const options = [
  { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
];
const sessions = new Map();

function boardOf(s) {
  if (!s.board) {
    const server = s.servers.find((m) => m.name === 'brainfile');
    const env = { ...process.env, ...Object.fromEntries(server.env.map((e) => [e.name, e.value])) };
    s.board = connect(server.command, server.args, { cwd: s.cwd, env });
  }
  return s.board;
}

new AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
  async newSession({ cwd, mcpServers }) {
    const sessionId = 's' + sessions.size;
    const role = mcpServers.find((m) => m.name === 'brainfile')?.env.find((e) => e.name === 'BRAINFILE_AGENT_ROLE')?.value ?? 'none';
    sessions.set(sessionId, { cwd, servers: mcpServers, role, cancelled: false });
    return { sessionId };
  },
  async authenticate() { return {}; },
  async prompt(params) {
    try {
      return await turn(conn, params);
    } catch (err) {
      log('errors', String(err && err.stack || err));
      throw err;
    }
  },
  async cancel({ sessionId }) { const s = sessions.get(sessionId); if (s) s.cancelled = true; },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));

async function turn(conn, { sessionId, prompt }) {
    const text = prompt.map((p) => p.text ?? '').join('');
    const s = sessions.get(sessionId);
    s.cancelled = false;
    const board = boardOf(s);
    const say = async (reply) => {
      await conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } } });
      return { stopReason: 'end_turn' };
    };
    if (!s.tools) {
      s.tools = await board.tools();
      log('tools', { role: s.role, cwd: s.cwd, tools: s.tools, server: s.servers.find((m) => m.name === 'brainfile') });
    }

    if (s.role === 'lead') {
      const epic = /You lead ([a-z]+-\\d+)/.exec(text)?.[1];
      log('lead-prompts', { epic: epic ?? s.epic, text });
      if (!epic) return say('Read what happened; nothing more to hand off.');
      s.epic = epic;
      const mine = plan('lead.json', epic);
      await board.call('note', { task: epic, message: 'Plan: ' + (mine.dispatch || []).join(', ') + ', in the order dependsOn gives.' });
      const handed = await board.call('dispatch', { task: mine.dispatch, agent: 'Fake' });
      log('lead-dispatch', { epic, said: textOf(handed) });
      if (mine.outside) log('lead-outside', { epic, said: textOf(await board.call('dispatch', { task: mine.outside, agent: 'Fake' })) });
      return say('Handed off ' + mine.dispatch.join(', ') + '.');
    }

    if (s.role === 'discuss') {
      const task = /<task-information id="([a-z]+-\\d+)"/.exec(text)?.[1];
      if (task) s.task = task;
      log('discuss-prompts', text);
      if (text === ${JSON.stringify(DISCUSS_DONE)}) {
        await board.call('note', { task: s.task, message: 'Agreed: keep ' + s.task + ' to one file.' });
        return say('Noted on ' + s.task + '.');
      }
      return say(task ? task + ' is being worked on. What do you want to talk over?' : 'Yes.');
    }

    const taskId = /You have been handed ([a-z]+-\\d+)/.exec(text)?.[1];
    const work = plan('work.json', taskId);
    // Its own landing went back: its branch was here before, and its log says why (a dependency's notes may say so too).
    const sentBack = text.includes('It has been here before') && text.includes('Landing sent back');
    const shared = fs.existsSync(path.join(s.cwd, 'shared.txt')) ? fs.readFileSync(path.join(s.cwd, 'shared.txt'), 'utf-8') : null;
    log('started', { task: taskId, cwd: s.cwd, branch: git(['branch', '--show-current'], s.cwd).stdout.trim(), shared, sentBack });
    await board.call('task_move', { task: taskId, column: 'in-progress' });
    const wait = async (ready) => { while (!s.cancelled && !ready()) await sleep(25); return !s.cancelled; };
    if (work.hold && !(await wait(() => has('release-' + taskId)))) return { stopReason: 'cancelled' };
    if (work.after && !(await wait(() => lines('started').some((l) => l.task === work.after)))) return { stopReason: 'cancelled' };
    if (work.trunkHas && !(await wait(() => git(['show', 'main:' + work.trunkHas.file], s.cwd).stdout.includes(work.trunkHas.text)))) return { stopReason: 'cancelled' };
    if (work.ask) {
      const answer = await conn.requestPermission({ sessionId, toolCall: { toolCallId: 'ask-' + taskId, title: work.ask, kind: 'execute' }, options });
      log('asked', { task: taskId, outcome: answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled' });
    }
    if (sentBack) {
      // As the log asks: the trunk merged into this branch, what both sides meant kept.
      const merged = git(['merge', '--no-edit', 'main'], s.cwd);
      if (merged.status !== 0) {
        for (const [file, body] of Object.entries(work.settle || {})) fs.writeFileSync(path.join(s.cwd, file), body);
        git(['add', '-A'], s.cwd);
        git(['commit', '-q', '--no-edit'], s.cwd);
      }
      log('settled', { task: taskId, conflicted: merged.status !== 0 });
    } else if (work.files) {
      for (const [file, body] of Object.entries(work.files)) fs.writeFileSync(path.join(s.cwd, file), body);
      git(['add', '-A'], s.cwd);
      git(['commit', '-q', '-m', taskId + ': ' + Object.keys(work.files).join(', ')], s.cwd);
    }
    const task = JSON.parse(textOf(await board.call('get_task', { task: taskId })));
    const checks = (task.contract?.validation?.commands ?? []).map((command) => ({ command, ok: spawnSync('sh', ['-c', command], { cwd: s.cwd }).status === 0 }));
    log('validated', { task: taskId, cwd: s.cwd, checks });
    await board.call('note', { task: taskId, message: 'Did ' + taskId + ' on its branch.' });
    await board.call('task_move', { task: taskId, column: 'review' });
    return say('Did ' + taskId + '.');
}
`;

const AGENT = 'custom:Fake';
const ENV = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_WORKTREES', 'BRAINFILE_DATA_DIR', 'PATH', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
const CONFIG = [
  '---',
  'title: Demo',
  'dispatch:',
  '  maxRunning: 2',
  'columns:',
  '  - id: todo',
  '    title: To Do',
  '  - id: in-progress',
  '    title: In Progress',
  '  - id: review',
  '    title: Review',
  '---',
  '',
].join('\n');
const SHARED = 'alpha\nmiddle\nomega\n';

let base: string;
let project: string;
let fakeDir: string;
let dataDir: string;
let filePath: string;
let projectId: string;
const savedEnv: Record<string, string | undefined> = {};
const children: ChildProcess[] = [];
const loops: Promise<unknown>[] = [];
const aborts: AbortController[] = [];
const runners: Runner[] = [];
const clients: { close(): void }[] = [];

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const checks = (...commands: string[]) => ['contract:', '  status: ready', '  validation:', '    commands:', ...commands.map((c) => `      - ${JSON.stringify(c)}`)];

function taskFile(id: string, fields: string[], body = `Do ${id}.`, column = 'todo'): string {
  return ['---', `id: ${id}`, `title: Task ${id}`, `column: ${column}`, 'createdAt: "2026-01-01T00:00:00.000Z"', ...fields, '---', '', body, ''].join('\n');
}

/**
 * The demo: code on main, pushed to a bare clone as origin; the board on its
 * own branch, so hand-offs get worktrees. epic-1's task-1 and task-2 change
 * the same line of shared.txt and neither waits on the other; task-3 waits on
 * both. task-4 to task-6 are loose tasks for the MCP client and the window;
 * epic-2 is led with the window open; task-9 was handed off and reviewed
 * before runners claimed.
 */
function demo(): void {
  fs.mkdirSync(project, { recursive: true });
  git(['init', '-q', '-b', 'main'], project);
  fs.writeFileSync(path.join(project, 'README.md'), 'demo\n');
  fs.writeFileSync(path.join(project, 'shared.txt'), SHARED);
  git(['add', '-A'], project);
  git(['commit', '-q', '-m', 'init'], project);
  const origin = path.join(base, 'origin.git');
  git(['clone', '-q', '--bare', project, origin], base);
  git(['remote', 'add', 'origin', origin], project);
  git(['fetch', '-q', 'origin'], project);
  git(['remote', 'set-head', 'origin', 'main'], project);
  git(['branch', '-q', '--set-upstream-to', 'origin/main', 'main'], project);

  const home = path.join(project, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', home], project);
  fs.mkdirSync(path.join(home, 'board'));
  fs.mkdirSync(path.join(home, 'logs'));
  fs.writeFileSync(path.join(home, 'brainfile.md'), CONFIG);
  const tasks: Record<string, string> = {
    'epic-1': taskFile('epic-1', ['type: epic'], 'Say one and two in shared.txt, and sum them up in whole.txt.'),
    'task-1': taskFile('task-1', ['parentId: epic-1', 'relatedFiles: [shared.txt]', ...checks('grep -q "middle: one" shared.txt')]),
    'task-2': taskFile('task-2', ['parentId: epic-1', 'relatedFiles: [shared.txt]', ...checks('grep -q "middle: two" shared.txt')]),
    'task-3': taskFile('task-3', ['parentId: epic-1', 'dependsOn: [task-1, task-2]', 'relatedFiles: [whole.txt]', ...checks('grep -q both whole.txt', 'grep -q "middle: one" shared.txt', 'grep -q "middle: two" shared.txt')]),
    'task-4': taskFile('task-4', ['relatedFiles: [four.txt]', ...checks('test -f four.txt')]),
    'task-5': taskFile('task-5', ['relatedFiles: [five.txt]', ...checks('test -f five.txt')]),
    'task-6': taskFile('task-6', ['relatedFiles: [six.txt]']),
    'epic-2': taskFile('epic-2', ['type: epic']),
    'task-7': taskFile('task-7', ['parentId: epic-2', 'relatedFiles: [seven.txt]', ...checks('test -f seven.txt')]),
    'task-8': taskFile('task-8', ['parentId: epic-2', 'relatedFiles: [eight.txt]', ...checks('test -f eight.txt')]),
    // Handed off by the desktop before claims, and its run is over: in Review, no claim and no tries.
    'task-9': taskFile('task-9', ['dispatch:', `  agent: "${AGENT}"`, '  by: person', '  at: "2026-01-02T00:00:00.000Z"'], 'Done before.', 'review'),
  };
  for (const [id, body] of Object.entries(tasks)) fs.writeFileSync(path.join(home, 'board', `${id}.md`), body);
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(project, '.git', 'info', 'exclude'), '.brainfile/\n');
  filePath = path.join(home, 'brainfile.md');
  projectId = projectOfBoard(filePath);
}

/** dispatch.json: the fake agent, and this repository's policy (bypass: asks are allowed, and an epic's lead lands each child). */
function settings(permissions: 'bypass' | 'ask'): void {
  fs.writeFileSync(
    path.join(dataDir, 'dispatch.json'),
    JSON.stringify({
      agentServers: { Fake: { command: process.execPath, args: [path.join(fakeDir, 'agent.mjs')], env: { FAKE_DIR: fakeDir } } },
      projects: { [projectId]: { permissions } },
    }),
  );
}

function plans(name: 'work.json' | 'lead.json', value: Record<string, unknown>): void {
  fs.writeFileSync(path.join(fakeDir, name), JSON.stringify(value));
}

const dotDir = () => path.dirname(filePath);
const found = (id: string) => findV2Task(getV2Dirs(filePath), id, true);
const recordOf = (id: string) => readDispatchRecord(found(id)!.doc.task);
const leadOf = (id: string) => readLeadRecord(found(id)!.doc.task as never);
const done = (id: string) => !!found(id)?.isLog;
const columnOf = (id: string) => found(id)?.doc.task.column;
const logOf = (id: string) => extractLog(found(id)!.doc.body);
const mark = (name: string) => fs.writeFileSync(path.join(fakeDir, name), '');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lines = <T = any>(name: string): T[] =>
  fs.existsSync(path.join(fakeDir, name)) ? fs.readFileSync(path.join(fakeDir, name), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T) : [];
const started = (id?: string) => lines<{ task: string; cwd: string; branch: string; shared: string | null; sentBack: boolean }>('started').filter((l) => !id || l.task === id);
const said = (logger: MemoryLogger) => logger.logs.map((l) => String(l[0])).join('\n');
const tty = () => Object.assign(new PassThrough(), { isTTY: true });
const LIVE = ['starting', 'working', 'waiting'];
const liveFiles = () => listRunFiles(dotDir()).filter((f) => f.endedAt === undefined && LIVE.includes(f.state));
const trunkHas = (file: string) => spawnSync('git', ['show', `main:${file}`], { cwd: project, encoding: 'utf-8' }).stdout;

async function until<T>(what: string, check: () => T | undefined | null | false, ms = 30_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A process on this machine that stands for the window's: alive, and ours to end. */
function otherProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore' });
  children.push(child);
  return child.pid!;
}

/** `brainfile run` left open in a terminal split, until its controller aborts it (Ctrl-C). */
function openLoop(options: Parameters<typeof runLoop>[1] = {}, logger = new MemoryLogger()): { done: Promise<RunSummary>; stop: () => void; logger: MemoryLogger } {
  const controller = new AbortController();
  aborts.push(controller);
  const finished = runLoop(filePath, { sigint: false, signal: controller.signal, ...options }, logger);
  loops.push(finished.catch(() => {}));
  return { done: finished, stop: () => controller.abort(), logger };
}

/**
 * The window's runner, as desktop/src/agents/agents.ts makes it, claiming as
 * another live process: its list and dock read `others` (external.ts), its
 * band answers through `answerAsk`, its Merge is `land` and its Stop `stop`.
 */
function windowRunner(options: Partial<RunnerOptions> = {}): Runner {
  const runner = new Runner({ dataDir, runner: 'desktop', pid: otherProcess(), ask: async () => null, watchMs: 50, ...options });
  runners.push(runner);
  return runner;
}

/** Claude Code's `brainfile mcp`: the built CLI over stdio, in the repository, with no role. */
function mcpClient(): { tools(): Promise<string[]>; call(name: string, args?: object): Promise<{ content?: { text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }>; close(): void } {
  const { connect } = nodeRequire(path.join(fakeDir, 'mcp-client.cjs'));
  const client = connect(process.execPath, [CLI, 'mcp'], { cwd: project, env: { ...process.env } });
  clients.push(client);
  return client;
}
const textOf = (result: { content?: { text?: string }[] }) => (result.content ?? []).map((c) => c.text ?? '').join('\n');

beforeAll(() => {
  if (!BUILT) return;
  for (const key of ENV) savedEnv[key] = process.env[key];
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-headless-')));
  project = path.join(base, 'repo');
  fakeDir = path.join(base, 'fake');
  dataDir = path.join(base, 'data');
  const bin = path.join(base, 'bin');
  for (const dir of [fakeDir, dataDir, bin]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
  fs.writeFileSync(path.join(fakeDir, 'mcp-client.cjs'), MCP_CLIENT);
  // The built CLI as `brainfile` on PATH: each session is handed the real board server.
  fs.symlinkSync(CLI, path.join(bin, 'brainfile'));
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
  demo();
  settings('bypass');
});

afterEach(async () => {
  if (!BUILT) return;
  mark('release-all');
  for (const controller of aborts.splice(0)) controller.abort();
  await Promise.all(loops.splice(0));
  for (const runner of runners.splice(0)) await runner.letGo();
  for (const client of clients.splice(0)) client.close();
});

afterAll(async () => {
  if (!BUILT) return;
  for (const child of children.splice(0)) child.kill();
  await new Promise((r) => setTimeout(r, 200));
  if (process.env.KEEP_E2E) console.log(`[headless-epic] kept ${base}`);
  else fs.rmSync(base, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const e2e = BUILT ? describe : describe.skip;
if (!BUILT) console.warn('[headless-epic] dist/cli.js not found: run `npm run build` to run the end-to-end checks.');

e2e('without the desktop, end to end', () => {
  test('1. a terminal only: brainfile run --once leads the epic from hand-off to landed', async () => {
    plans('lead.json', { 'epic-1': { dispatch: ['task-1', 'task-2', 'task-3'], outside: 'task-4' } });
    plans('work.json', {
      // task-1 ends once task-2 has forked too, so the two run together.
      'task-1': { after: 'task-2', files: { 'shared.txt': 'alpha\nmiddle: one\nomega\n' } },
      // task-2 ends once task-1 has landed: its landing conflicts, and goes back to it.
      'task-2': { trunkHas: { file: 'shared.txt', text: 'middle: one' }, files: { 'shared.txt': 'alpha\nmiddle: two\nomega\n' }, settle: { 'shared.txt': 'alpha\nmiddle: one\nmiddle: two\nomega\n' } },
      'task-3': { files: { 'whole.txt': 'both\n' } },
    });
    const queued = await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: 'fake' });
    expect(queued.queued).toEqual([expect.objectContaining({ task: 'epic-1', lead: true, until: 'done' })]);

    let peak = 0;
    const sampler = setInterval(() => (peak = Math.max(peak, liveFiles().filter((f) => f.kind === 'dispatch').length)), 20);
    const logger = new MemoryLogger();
    const summary = await runLoop(filePath, { once: true, sigint: false }, logger).finally(() => clearInterval(sampler));
    const text = said(logger);
    expect(lines('errors')).toEqual([]);

    // The lead checked the plan: the overlap and the order were put to it, and it wrote its plan on the epic.
    expect(summary.led).toEqual(['epic-1']);
    const [first] = lines<{ epic: string; text: string }>('lead-prompts');
    expect(first.epic).toBe('epic-1');
    expect(first.text).toContain('task-1 and task-2 both touch shared.txt, and neither waits on the other');
    expect(first.text).toMatch(/By dependsOn, the order is:\n1\. task-1, task-2\n2\. task-3/);
    expect(first.text).toContain('at most 2 hand-offs at once');
    expect(logOf('epic-1')).toContain('Plan: task-1, task-2, task-3');
    // It dispatched through its own board server, which reaches only its tree.
    const [handed] = lines<{ said: string }>('lead-dispatch');
    expect(handed.said).toContain('Queued task-1, task-2, task-3 for Fake');
    expect(handed.said).toContain('task-3 waits on task-1, task-2');
    expect(lines<{ said: string }>('lead-outside')[0].said).toMatch(/Skipped task-4: .*not under epic-1/);
    const toolsOf = (role: string) => lines<{ role: string; tools: string[] }>('tools').filter((t) => t.role === role);
    expect(toolsOf('lead')[0].tools).toEqual(expect.arrayContaining(['dispatch', 'dispatch_status', 'dispatch_stop', 'review']));

    // At most two at once; task-1 and task-2 together, each in its own worktree on its own branch.
    expect(peak).toBe(2);
    expect(summary.started.slice(0, 2).sort()).toEqual(['task-1', 'task-2']);
    expect(summary.started.slice(2)).toEqual(['task-2', 'task-3']);
    const worktrees = path.join(base, 'worktrees');
    for (const id of ['task-1', 'task-2', 'task-3']) {
      const [at] = started(id);
      expect(at.cwd.startsWith(worktrees)).toBe(true);
      expect(at.branch).toBe(`dispatch/${id}`);
    }
    // A worker's board server has no dispatch, stop or land (decision-15).
    for (const { tools } of toolsOf('worker')) {
      expect(tools).toContain('dispatch_status');
      expect(tools).not.toEqual(expect.arrayContaining(['dispatch']));
      expect(tools).not.toContain('dispatch_stop');
      expect(tools).not.toContain('dispatch_lead');
    }
    // Workers validated in their worktrees.
    for (const v of lines<{ task: string; cwd: string; checks: { ok: boolean }[] }>('validated')) {
      expect(v.cwd).toBe(started(v.task)[0].cwd);
      expect(v.checks.length).toBeGreaterThan(0);
      expect(v.checks.every((c) => c.ok)).toBe(true);
    }

    // task-2's landing conflicted: it went back to its agent, which settled it on its branch, and it landed.
    const [, again] = started('task-2');
    expect(again.sentBack).toBe(true);
    expect(lines('settled')).toEqual([{ task: 'task-2', conflicted: true }]);
    expect(logOf('task-2')).toMatch(/Landing sent back \(1 of 1\): dispatch\/task-2 conflicts with main in shared\.txt\. On main since this branch started: [0-9a-f]+ task-1: shared\.txt \(task-1\)\. Merge main into this branch/);
    expect(recordOf('task-2')).toMatchObject({ by: 'lead', tries: 2 });

    // task-3 forked only once both had landed.
    expect(started('task-3')).toHaveLength(1);
    expect(started('task-3')[0].shared).toBe('alpha\nmiddle: one\nmiddle: two\nomega\n');

    // Each landed on the trunk with its checks, and the epic completed with its last child.
    const merges = git(['log', '--format=%s', '--first-parent', 'main'], project).split('\n');
    expect(merges.slice(0, 3)).toEqual(['Merge task-3: Task task-3', 'Merge task-2: Task task-2', 'Merge task-1: Task task-1']);
    expect(trunkHas('shared.txt')).toBe('alpha\nmiddle: one\nmiddle: two\nomega\n');
    expect(trunkHas('whole.txt')).toBe('both\n');
    for (const id of ['task-1', 'task-2', 'task-3', 'epic-1']) expect(done(id)).toBe(true);
    expect(git(['branch', '--list', 'dispatch/*'], project)).toBe('');
    expect(text).toMatch(/epic-1 · lead · Fake · leading/);
    expect(text).toContain('task-1 landed');
    expect(text).toContain('task-3 landed');
    expect(text).toMatch(/epic-1 · lead · Fake · done: epic-1 is done: every child is\./);
    // The request the desktop answered before claims existed was not run.
    expect(started('task-9')).toEqual([]);
    expect(columnOf('task-9')).toBe('review');
    // Its writes on the board were committed. Landing does not push: origin's main is where it was.
    expect(git(['status', '--porcelain'], dotDir())).toBe('');
    expect(git(['rev-parse', 'origin/main'], project)).toBe(git(['rev-list', '--max-parents=0', 'main'], project));
  });

  test('2. an MCP client only: dispatch, status, stop, dispatch again, land', async () => {
    plans('work.json', { 'task-4': { hold: true, files: { 'four.txt': 'four\n' } } });
    const terminal = openLoop();
    await until('the terminal runner to be up', () => listRunners(dotDir()).some((r) => r.runner === 'cli' && r.pid === process.pid));
    const client = mcpClient();
    expect(await client.tools()).toEqual(expect.arrayContaining(['dispatch', 'dispatch_status', 'dispatch_stop', 'review']));

    const queued = await client.call('dispatch', { task: 'task-4', agent: 'Fake' });
    expect(textOf(queued)).toContain('Queued task-4 for Fake.');
    expect(queued.structuredContent).toMatchObject({ runnerUp: true });
    await until('task-4 to start', () => started('task-4').length === 1);

    const status = await client.call('dispatch_status');
    expect(status.structuredContent).toMatchObject({ running: [expect.objectContaining({ task: 'task-4', agent: AGENT, runner: 'cli' })] });
    expect(textOf(status)).toContain('task-4');

    const stopped = await client.call('dispatch_stop', { run: 'task-4' });
    expect(stopped.structuredContent).toMatchObject({ task: 'task-4', stopped: true });
    await until('its claim given back as stopped', () => recordOf('task-4')?.claim?.outcome === 'stopped');
    expect(said(terminal.logger)).toMatch(/task-4 · Fake · stopped/);

    // Again, and this time it finishes: in Review, its branch ready to land.
    plans('work.json', { 'task-4': { files: { 'four.txt': 'four\n' } } });
    const again = await client.call('dispatch', { task: 'task-4', agent: 'Fake' });
    expect(textOf(again)).toContain('Queued task-4 for Fake.');
    await until('task-4 in Review', () => recordOf('task-4')?.claim?.outcome === 'review' && columnOf('task-4') === 'review');
    expect(started('task-4')).toHaveLength(2);

    const landed = await client.call('review', { action: 'land', task: 'task-4' });
    expect(landed.isError).toBeFalsy();
    expect(textOf(landed)).toContain('task-4 is done.');
    expect(done('task-4')).toBe(true);
    expect(trunkHas('four.txt')).toBe('four\n');
    terminal.stop();
    await terminal.done;
  });

  test('3 and 4. the window watches the terminal live: its band answers an ask, its Merge and Stop act; discuss and fix beside them', async () => {
    settings('ask');
    plans('work.json', { 'task-5': { ask: 'Run make test', files: { 'five.txt': 'five\n' } }, 'task-6': { hold: true, files: { 'six.txt': 'six\n' } } });
    const input = tty();
    const output = new PassThrough();
    let prompt = '';
    output.on('data', (d) => (prompt += String(d)));
    const terminal = openLoop({ input, output });
    // The window is open and starts nothing: it reads the run files and acts when asked.
    const window = windowRunner();
    await dispatchReport(filePath, { ids: ['task-5', 'task-6'] }, { agent: 'fake' });

    // Both show live in the window, as run files of a terminal's runner.
    await until('both to show in the window', () => ['task-5', 'task-6'].every((id) => window.liveDispatch(projectId, id)));
    const shown = window.others(projectId).filter((f) => f.kind === 'dispatch' && !f.endedAt);
    expect(shown.map((f) => [f.taskId, f.runner]).sort()).toEqual([['task-5', 'cli'], ['task-6', 'cli']]);
    expect(window.busy(projectId, 'task-6')).toMatch(/still working on task-6/);

    // task-5 asks at the terminal; the window's band answers it through its answer file.
    await until('the prompt in the terminal', () => prompt.includes('task-5 · Fake asks: Run make test'));
    const asking = await until('the ask in its run file', () => window.others(projectId).find((f) => f.taskId === 'task-5' && f.ask));
    expect(window.answerAsk(asking.id, asking.ask!.id!, 'once', projectId)).toEqual({ ok: true, value: undefined });
    await until('the terminal to take its prompt down', () => said(terminal.logger).includes('That ask was answered outside this terminal.'));
    await until('task-5 to go on to Review', () => recordOf('task-5')?.claim?.outcome === 'review');
    expect(lines('asked')).toEqual([{ task: 'task-5', outcome: 'once' }]);

    // 4. A discussion of task-6 while its hand-off works: no claim taken, not a hand-off.
    const talkIn = tty();
    const talkOut = new PassThrough();
    let talkShown = '';
    talkOut.on('data', (d) => (talkShown += String(d)));
    const talkStop = new AbortController();
    aborts.push(talkStop);
    const talkLogger = new MemoryLogger();
    const talk = discussLoop(filePath, 'task-6', { agent: AGENT, input: talkIn, output: talkOut, sigint: false, signal: talkStop.signal }, talkLogger);
    loops.push(talk.catch(() => {}));
    await until('the discussion to open', () => said(talkLogger).includes('task-6 is being worked on.'));
    const claim = recordOf('task-6')!.claim!;
    expect(claim).toMatchObject({ runner: 'cli', pid: process.pid });
    expect(claim.outcome).toBeUndefined();
    expect(window.live(projectId).map((r) => r.taskId)).toEqual(['task-6']);
    const status = await mcpClient().call('dispatch_status');
    expect((status.structuredContent as { running: { task: string }[] }).running.map((r) => r.task)).toEqual(['task-6']);
    // The window sees the discussion's run file (one a turn), and shows it nowhere: external.ts leaves kind 'ask' out.
    expect(window.others(projectId).some((f) => f.kind === 'ask' && f.taskId === 'task-6' && f.runner === 'cli')).toBe(true);
    await until('the prompt', () => talkShown.endsWith('> '));
    talkIn.write('keep it small\n');
    await until('the reply', () => lines('discuss-prompts').length === 2 && talkShown.endsWith('> '));
    talkStop.abort();
    const talked = await talk;
    expect(talked).toMatchObject({ task: 'task-6', said: 1 });
    expect(lines<string>('discuss-prompts').at(-1)).toBe(DISCUSS_DONE);
    expect(logOf('task-6')).toContain('Agreed: keep task-6 to one file.');
    expect(recordOf('task-6')!.claim).toMatchObject({ runner: 'cli', pid: process.pid });

    // brainfile fix, with hand-off worktrees about: nothing wrong with where the board lives.
    const fixLogger = new MemoryLogger();
    const fix = fixCommand({ file: filePath, dryRun: true }, fixLogger);
    expect(fix.problems).toEqual([]);
    expect(fix.plan).toBeNull();

    // The window's Merge lands what the terminal ran.
    const merged = await window.land(projectId, 'task-5');
    expect(merged).toMatchObject({ ok: true, completed: true });
    expect(done('task-5')).toBe(true);
    expect(trunkHas('five.txt')).toBe('five\n');

    // The window's Stop reaches the terminal's run through its file.
    const six = window.liveDispatch(projectId, 'task-6')!;
    expect(await window.stop(six.id, projectId)).toEqual({ ok: true, value: undefined });
    await until('the terminal to stop it', () => recordOf('task-6')?.claim?.outcome === 'stopped');
    expect(window.others(projectId).find((f) => f.id === six.id)).toMatchObject({ state: 'stopped' });
    expect(said(terminal.logger)).toMatch(/task-6 · Fake · stopped/);
    terminal.stop();
    await terminal.done;
  });

  test('3. the window and brainfile run open together never both take one lead or one child, nor run what was answered before claims', async () => {
    settings('ask');
    plans('lead.json', { 'epic-2': { dispatch: ['task-7', 'task-8'] } });
    plans('work.json', { 'task-7': { files: { 'seven.txt': 'seven\n' } }, 'task-8': { files: { 'eight.txt': 'eight\n' } } });
    await dispatchReport(filePath, { ids: ['epic-2'] }, { agent: 'fake' });
    const before = lines('lead-prompts').length;

    // Opened together: the terminal works the queue, and the window takes up leads and starts what is queued.
    const terminal = openLoop();
    const window = windowRunner({ leads: true });
    const opened = window.work(projectId);
    await opened;
    await until('both children in Review', () => ['task-7', 'task-8'].every((id) => recordOf(id)?.claim?.outcome === 'review'));

    const leadTurns = lines<{ epic: string }>('lead-prompts').slice(before).filter((p) => p.epic === 'epic-2');
    expect(leadTurns.length).toBeGreaterThanOrEqual(1);
    expect(lines<{ epic: string; text: string }>('lead-prompts').filter((p) => p.text.includes('You lead epic-2'))).toHaveLength(1);
    const holder = leadOf('epic-2')!.claim!;
    expect([process.pid, window.pid]).toContain(holder.pid);
    // The children went to the runner that leads them, once each.
    for (const id of ['task-7', 'task-8']) {
      expect(started(id)).toHaveLength(1);
      expect(recordOf(id)).toMatchObject({ by: 'lead', tries: 1, claim: { pid: holder.pid } });
    }
    expect(started('task-9')).toEqual([]);
    expect(recordOf('task-9')!.claim).toBeUndefined();
    terminal.stop();
    await terminal.done;
  });
});
