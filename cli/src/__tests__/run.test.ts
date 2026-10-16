/**
 * `brainfile run` (task-82): the foreground runner against a scratch
 * repository whose board lives on its own branch, with a fake ACP agent (a
 * small agent over the real SDK, started as a custom agent) as the workers
 * and an epic's lead. It works the queue and says each change in a line,
 * `--once` returns, Ctrl-C ends its runs and gives their tasks back to the
 * queue, two runners share one queue, an epic handed off is led and its
 * children run; and what the TUI's rows read from the run files.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';
import { currentHost, findV2Task, getV2Dirs, readDispatchRecord, readLeadRecord } from '@brainfile/core';
import { listRunFiles, listRunners, writeRunFile, type RunFile } from '@brainfile/core/repo';
import type { PermissionAsk } from '@brainfile/core/dispatch';
import { dispatchReport, statusReport } from '../commands/dispatch';
import { runCommand, runLoop, terminalAsk, type RunSummary } from '../commands/run';
import { liveRunsOf } from '../tui/hooks/useRuns';
import { MemoryLogger } from '../utils/logger';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as core's runner test does.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(60_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;

/**
 * A worker says which task it was handed and ends its turn when released. A
 * lead, on its first turn, queues the children named in `lead-queues` as
 * its `brainfile mcp` would (a request by the lead on each), and answers.
 */
const FAKE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.FAKE_DIR;
const board = process.env.FAKE_BOARD;
const sessions = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (name) => fs.existsSync(path.join(dir, name));
new AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
  async newSession() { const sessionId = 's' + sessions.size; sessions.set(sessionId, { cancelled: false }); return { sessionId }; },
  async authenticate() { return {}; },
  async prompt({ sessionId, prompt }) {
    const text = prompt.map((p) => p.text ?? '').join('');
    const session = sessions.get(sessionId);
    const lead = /You lead ([a-z]+-\\d+)/.exec(text)?.[1] ?? (/What happened:/.test(text) ? 'turn' : null);
    if (lead) {
      fs.appendFileSync(path.join(dir, 'lead-turns'), lead + '\\n');
      if (lead !== 'turn' && has('lead-queues')) {
        for (const id of fs.readFileSync(path.join(dir, 'lead-queues'), 'utf-8').split('\\n').filter(Boolean)) {
          const file = path.join(board, id + '.md');
          const body = fs.readFileSync(file, 'utf-8');
          // As its brainfile mcp's dispatch writes it: a request with its tries, none yet.
          if (!body.includes('dispatch:')) fs.writeFileSync(file, body.replace(/^---\\n/, '---\\ndispatch:\\n  agent: "custom:Fake"\\n  by: lead\\n  at: "' + new Date().toISOString() + '"\\n  tries: 0\\n'));
        }
      }
    } else {
      const taskId = /You have been handed ([a-z]+-\\d+)/.exec(text)?.[1] ?? 'none';
      fs.appendFileSync(path.join(dir, 'started'), taskId + '\\n');
      while (!session.cancelled && !has('release-' + taskId) && !has('release-all')) await sleep(20);
      if (session.cancelled) return { stopReason: 'cancelled' };
    }
    await conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: lead ? 'Planned it.' : 'Done.' } } });
    return { stopReason: 'end_turn' };
  },
  async cancel({ sessionId }) { const s = sessions.get(sessionId); if (s) s.cancelled = true; },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`;

const AGENT = 'custom:Fake';
const CONFIG = `---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n  - id: review\n    title: Review\n---\n`;
const ENV = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_WORKTREES', 'BRAINFILE_DATA_DIR', 'PATH', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];

let base: string;
let project: string;
let fakeDir: string;
let filePath: string;
const savedEnv: Record<string, string | undefined> = {};
const children: ChildProcess[] = [];
const loops: Promise<unknown>[] = [];
const aborts: AbortController[] = [];

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function taskFile(id: string, fields: string[] = []): string {
  return ['---', `id: ${id}`, `title: Task ${id}`, 'column: todo', ...fields, '---', '', `Do ${id}.`, ''].join('\n');
}

/** A repository whose board lives on its own branch, so hand-offs get worktrees. */
function gitBoard(tasks: Record<string, string[]>): void {
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
  for (const [id, fields] of Object.entries(tasks)) fs.writeFileSync(path.join(home, 'board', `${id}.md`), taskFile(id, fields));
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(project, '.git', 'info', 'exclude'), '.brainfile/\n');
  filePath = path.join(home, 'brainfile.md');
}

const dotDir = () => path.dirname(filePath);
const found = (id: string) => findV2Task(getV2Dirs(filePath), id, true);
const recordOf = (id: string) => readDispatchRecord(found(id)!.doc.task);
const leadOf = (id: string) => readLeadRecord(found(id)!.doc.task as never);
const mark = (name: string, body = '') => fs.writeFileSync(path.join(fakeDir, name), body);
const lines = (name: string) => (fs.existsSync(path.join(fakeDir, name)) ? fs.readFileSync(path.join(fakeDir, name), 'utf-8').split('\n').filter(Boolean) : []);
const said = (logger: MemoryLogger) => logger.logs.map((l) => String(l[0])).join('\n');
const liveRunFiles = () => listRunFiles(dotDir()).filter((f) => f.endedAt === undefined && ['starting', 'working', 'waiting'].includes(f.state));

/** A process on this machine that stands for another runner: alive, and ours to end. */
function otherProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  children.push(child);
  return child.pid!;
}

async function until<T>(what: string, check: () => T | undefined | null | false, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A runner left running, as in a terminal split, until its controller aborts it (Ctrl-C). */
function openLoop(options: Parameters<typeof runLoop>[1] = {}, logger = new MemoryLogger()): { done: Promise<RunSummary>; stop: () => void; logger: MemoryLogger } {
  const controller = new AbortController();
  aborts.push(controller);
  const done = runLoop(filePath, { sigint: false, signal: controller.signal, ...options }, logger);
  loops.push(done.catch(() => {}));
  return { done, stop: () => controller.abort(), logger };
}

beforeAll(() => {
  for (const key of ENV) savedEnv[key] = process.env[key];
});

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cli-run-')));
  project = path.join(base, 'repo');
  fakeDir = path.join(base, 'fake');
  const dataDir = path.join(base, 'data');
  const bin = path.join(base, 'bin');
  for (const dir of [fakeDir, dataDir, bin]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
  // A `brainfile` on PATH, so the runner hands its agents a board server.
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
});

afterEach(async () => {
  mark('release-all');
  for (const controller of aborts.splice(0)) controller.abort();
  await Promise.all(loops.splice(0));
  for (const child of children.splice(0)) child.kill();
  await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(base, { recursive: true, force: true });
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('brainfile run: the queue in the foreground', () => {
  test('--once works the queue, says each change in a line, and returns when nothing more can start', async () => {
    gitBoard({ 'task-1': [], 'task-2': [], 'task-3': ['dependsOn: [task-9]'], 'task-9': [] });
    await dispatchReport(filePath, { ids: ['task-1', 'task-2', 'task-3'] }, { agent: 'fake' });
    mark('release-all');
    const logger = new MemoryLogger();
    const summary = await runLoop(filePath, { once: true, sigint: false }, logger);

    expect([...summary.started].sort()).toEqual(['task-1', 'task-2']);
    expect(summary.interrupted).toBe(false);
    // task-3 waits on task-9, which is open: it stays queued, and the runner says so.
    expect(summary.queued).toEqual([{ task: 'task-3', waitsOn: ['task-9'] }]);
    const text = said(logger);
    expect(text).toMatch(/^Working the queue on repo: at most 3 at once\. Ctrl-C lets go\./);
    expect(text).toMatch(/task-1 · Fake · starting/);
    expect(text).toContain('task-1 in Review');
    expect(text).toContain('task-2 in Review');
    expect(text).toContain('Still queued: task-3 (waits on task-9).');
    for (const id of ['task-1', 'task-2']) expect(recordOf(id)!.claim).toMatchObject({ runner: 'cli', outcome: 'review' });
    expect(recordOf('task-3')!.claim).toBeUndefined();
    // Its presence went with it.
    expect(listRunners(dotDir())).toEqual([]);
    // What it wrote on the board was committed before it returned.
    expect(git(['status', '--porcelain'], dotDir())).toBe('');
  });

  test('left open, it is up (its runner file), takes what is queued later, and runs at most --max at once', async () => {
    gitBoard({ 'task-1': [], 'task-2': [] });
    const run = openLoop({ max: 1 });
    await until('its runner file', () => listRunners(dotDir()).some((r) => r.pid === process.pid && r.runner === 'cli'));
    expect((await statusReport(filePath)).runners).toEqual([]);

    // Queued after it started: it looks again and takes them, one at a time.
    const queued = await dispatchReport(filePath, { ids: ['task-1', 'task-2'] }, { agent: 'fake' });
    expect(queued.runnerUp).toBe(false); // the same process: dispatch does not count itself
    await until('one to start', () => lines('started').length === 1);
    await new Promise((r) => setTimeout(r, 1500));
    expect(liveRunFiles()).toHaveLength(1);
    const first = lines('started')[0];
    mark(`release-${first}`);
    await until('the other to start', () => lines('started').length === 2);
    expect(new Set(lines('started')).size).toBe(2);
    run.stop();
    await run.done;
  });

  test('Ctrl-C lets go: its sessions stop, its run files end, and its tasks wait in the queue again', async () => {
    gitBoard({ 'task-1': [], 'task-2': [] });
    await dispatchReport(filePath, { ids: ['task-1', 'task-2'] }, { agent: 'fake' });
    const run = openLoop();
    await until('both to start', () => lines('started').length === 2);
    expect(recordOf('task-1')!.claim).toMatchObject({ pid: process.pid });
    expect(liveRunFiles().map((f) => f.taskId).sort()).toEqual(['task-1', 'task-2']);

    run.stop();
    const summary = await run.done;
    expect(summary.interrupted).toBe(true);
    expect([...summary.letGo].sort()).toEqual(['task-1', 'task-2']);
    expect(said(run.logger)).toContain('Back in the queue: ');
    // Their requests stay, unclaimed: the next runner takes them.
    for (const id of ['task-1', 'task-2']) {
      expect(recordOf(id)).toMatchObject({ agent: AGENT });
      expect(recordOf(id)!.claim).toBeUndefined();
    }
    expect((await statusReport(filePath)).queued.map((q) => q.task).sort()).toEqual(['task-1', 'task-2']);
    expect(liveRunFiles()).toEqual([]);
    expect(listRunFiles(dotDir()).map((f) => f.state)).toEqual(['stopped', 'stopped']);
    expect(listRunners(dotDir())).toEqual([]);
    expect(git(['status', '--porcelain'], dotDir())).toBe('');

    // And the next runner does.
    mark('release-all');
    const again = await runLoop(filePath, { once: true, sigint: false }, new MemoryLogger());
    expect([...again.started].sort()).toEqual(['task-1', 'task-2']);
  });

  test('two runners on one machine share the queue, and never start one task', async () => {
    gitBoard({ 'task-1': [], 'task-2': [], 'task-3': [], 'task-4': [] });
    await dispatchReport(filePath, { ids: ['task-1', 'task-2', 'task-3', 'task-4'] }, { agent: 'fake' });
    const other = otherProcess();
    const a = openLoop({ max: 1 });
    const b = openLoop({ max: 1, runner: { pid: other } });
    await until('two to start', () => lines('started').length === 2);
    // One each: neither starts what the other holds.
    const held = ['task-1', 'task-2', 'task-3', 'task-4'].map((id) => recordOf(id)?.claim?.pid).filter(Boolean);
    expect(held.sort()).toEqual([process.pid, other].sort());
    mark('release-all');
    await until('all four to end', () => ['task-1', 'task-2', 'task-3', 'task-4'].every((id) => recordOf(id)?.claim?.outcome === 'review'));
    a.stop();
    b.stop();
    const [ra, rb] = await Promise.all([a.done, b.done]);
    expect(lines('started').sort()).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
    expect([...ra.started, ...rb.started].sort()).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
    expect(ra.started.length).toBeGreaterThan(0);
    expect(rb.started.length).toBeGreaterThan(0);
  });

  test('an epic handed off: --once runs its lead and the children it queues to Review, then lets the lead go for the next runner', async () => {
    gitBoard({
      'epic-1': ['type: epic'],
      'task-1': ['parentId: epic-1', 'relatedFiles: [a.ts]'],
      'task-2': ['parentId: epic-1', 'relatedFiles: [b.ts]'],
    });
    const queued = await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: 'fake' });
    expect(queued.queued).toEqual([expect.objectContaining({ task: 'epic-1', lead: true })]);
    mark('lead-queues', 'task-1\ntask-2\n');
    mark('release-all');
    const logger = new MemoryLogger();
    const summary = await runLoop(filePath, { once: true, sigint: false }, logger);

    expect(summary.led).toEqual(['epic-1']);
    expect([...summary.started].sort()).toEqual(['task-1', 'task-2']);
    expect(lines('lead-turns')[0]).toBe('epic-1');
    for (const id of ['task-1', 'task-2']) expect(recordOf(id)).toMatchObject({ by: 'lead', tries: 1, claim: { outcome: 'review' } });
    const text = said(logger);
    expect(text).toMatch(/epic-1 · lead · Fake · leading/);
    expect(text).toContain('task-1 in Review');
    expect(text).toContain("epic-1's lead waits for a runner to take it up.");
    // Its claim on the epic given back: its record waits for a runner, which carries on from its notes.
    expect(leadOf('epic-1')).toMatchObject({ agent: AGENT, role: 'lead', claim: { outcome: 'stopped' } });
    expect(leadOf('epic-1')!.paused).toBeUndefined();
    expect((await statusReport(filePath)).leads).toEqual([expect.objectContaining({ epic: 'epic-1', state: 'waiting' })]);
  });

  test('--until and --max are checked', async () => {
    gitBoard({});
    await expect(runCommand({ file: filePath, until: 'later' })).rejects.toThrow('--until is review or done, not later');
    await expect(runCommand({ file: filePath, max: '0' })).rejects.toThrow('--max is a whole number of at least 1, not 0');
  });
});

describe('asks at the terminal', () => {
  const ask = (id: string, runId = 'run-1'): PermissionAsk => ({
    id,
    runId,
    projectId: '/p',
    agentId: 'codex',
    title: `Run ${id}`,
    options: [
      { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'always', name: 'Always', kind: 'allow_always' },
      { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
    ],
  });
  const tty = () => Object.assign(new PassThrough(), { isTTY: true });

  test('one at a time, naming the run; the option picked by number', async () => {
    const input = tty();
    const output = new PassThrough();
    let shown = '';
    output.on('data', (d) => (shown += String(d)));
    const asker = terminalAsk(new MemoryLogger(), () => ({ taskId: 'task-74' }) as never, { input, output });
    const first = asker.ask(ask('a'));
    const second = asker.ask(ask('b'));
    await until('the first prompt', () => shown.includes('task-74 · codex asks: Run a'));
    expect(shown).toContain('1) Allow once  2) Always  3) Deny');
    expect(shown).not.toContain('Run b');
    input.write('2\n');
    expect(await first).toBe('always');
    await until('the second prompt', () => shown.includes('Run b'));
    input.write('3\n');
    expect(await second).toBe('deny');
  });

  test('an ask withdrawn (its run stopped) or answered elsewhere is taken down; with no terminal nothing is allowed', async () => {
    const input = tty();
    const output = new PassThrough();
    const shown = new MemoryLogger();
    const asker = terminalAsk(shown, () => undefined, { input, output });
    const pending = asker.ask(ask('a'));
    await new Promise((r) => setTimeout(r, 50));
    asker.cancel('a');
    expect(await pending).toBeNull();
    expect(said(shown)).toContain('That ask was withdrawn: its run stopped.');
    const answered = asker.ask(ask('c'));
    await new Promise((r) => setTimeout(r, 50));
    asker.cancel('c', 'answered');
    expect(await answered).toBeNull();
    expect(said(shown)).toContain('That ask was answered outside this terminal.');

    const logger = new MemoryLogger();
    const plain = terminalAsk(logger, () => undefined, { input: new PassThrough(), output: new PassThrough() });
    expect(await plain.ask(ask('b'))).toBeNull();
    expect(said(logger)).toContain('run-1 · codex asks: Run b. Refused: no terminal to answer in.');
  });
});

describe("the TUI's rows: live runs from the run files", () => {
  function runFile(fields: Partial<RunFile>): RunFile {
    const now = Date.now();
    const file: RunFile = {
      id: `run-${Math.random().toString(36).slice(2)}`,
      kind: 'dispatch',
      agent: 'codex',
      state: 'working',
      activity: 'editing',
      startedAt: now - 1000,
      host: currentHost(),
      pid: process.pid,
      runner: 'cli',
      beatAt: now,
      projectId: project,
      ...fields,
    };
    writeRunFile(dotDir(), file);
    return file;
  }

  test("each task's live run, as `agent · activity`; ended, lost and chat runs say nothing", () => {
    gitBoard({});
    runFile({ taskId: 'task-1' });
    runFile({ taskId: 'task-2', agent: 'custom:Muse Code', state: 'waiting', activity: 'running', ask: { title: 'Run npm test', options: [] } });
    runFile({ taskId: 'epic-1', kind: 'lead', activity: 'reading' });
    runFile({ taskId: 'task-3', state: 'done', endedAt: Date.now() });
    runFile({ taskId: 'task-4', pid: otherProcess(), beatAt: Date.now() - 60_000 });
    runFile({ taskId: 'task-5', kind: 'ask' });
    expect(Object.fromEntries(liveRunsOf(dotDir()))).toEqual({
      'task-1': 'codex · editing',
      'task-2': 'Muse Code · asking',
      'epic-1': 'codex · leading',
    });
  });
});
