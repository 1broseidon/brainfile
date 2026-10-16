/**
 * The shared runner (task-80), driven against a fake ACP agent: a small
 * agent over the real SDK, started as a custom agent, that says which task
 * it was handed, commits what it is told to in its worktree, asks when told
 * to, and ends its turn when its release file appears (or is cancelled).
 * Two runners stand for two processes by claiming as two live pids.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import { claimDispatchFile, readDispatchRecord } from '../dispatchRecord';
import { listRunFiles, readRunFile, readRunStop, runStopPath, writeRunFile, type RunFile } from '../repo/runFiles';
import { readyToMerge } from '../repo/worktree';
import { Runner, fileBoard, runOf, type RunnerOptions } from '../dispatch/runner';
import { findV2Task, getV2Dirs } from '../workspace';
import type { AgentRun, PermissionAsk } from '../dispatch/types';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as the agents process loads it.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(60_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;

const FAKE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK)};
import { Readable, Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.FAKE_DIR;
const sessions = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (name) => fs.existsSync(path.join(dir, name));
new AgentSideConnection((conn) => ({
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }; },
  async newSession() { const sessionId = 's' + sessions.size; sessions.set(sessionId, { cancelled: false }); return { sessionId }; },
  async authenticate() { return {}; },
  async prompt({ sessionId, prompt }) {
    const text = prompt.map((p) => p.text ?? '').join('');
    const taskId = /You have been handed ([a-z]+-\\d+)/.exec(text)?.[1] ?? 'none';
    const session = sessions.get(sessionId);
    fs.appendFileSync(path.join(dir, 'started'), taskId + '\\n');
    fs.writeFileSync(path.join(dir, 'brief-' + taskId), text);
    if (has('ask-' + taskId)) {
      const answer = await conn.requestPermission({ sessionId, toolCall: { toolCallId: 't1', title: 'Run rm -rf build', kind: 'execute' },
        options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] });
      fs.writeFileSync(path.join(dir, 'answer-' + taskId), JSON.stringify(answer.outcome));
    }
    if (has('commit-' + taskId)) {
      fs.writeFileSync(path.join(process.cwd(), 'work-' + taskId + '.txt'), String(Date.now()) + Math.random());
      execFileSync('git', ['add', '-A'], { cwd: process.cwd() });
      execFileSync('git', ['commit', '-q', '-m', 'work on ' + taskId], { cwd: process.cwd() });
    }
    while (!session.cancelled && !has('release-' + taskId) && !has('release-all')) await sleep(20);
    if (session.cancelled) return { stopReason: 'cancelled' };
    await conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Did ' + taskId } } });
    return { stopReason: 'end_turn' };
  },
  async cancel({ sessionId }) { const s = sessions.get(sessionId); if (s) s.cancelled = true; },
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`;

const AGENT = 'custom:Fake' as const;
const CONFIG = (extra = '') => `---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n  - id: review\n    title: Review\n${extra}---\n`;

let base: string;
let project: string;
let dataDir: string;
let fakeDir: string;
const runners: Runner[] = [];
const savedEnv: Record<string, string | undefined> = {};
const ENV = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'BRAINFILE_WORKTREES', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function taskFile(id: string, fields: string[] = []): string {
  return ['---', `id: ${id}`, `title: Task ${id}`, 'column: todo', ...fields, '---', '', `Do ${id}.`, ''].join('\n');
}

function settings(extra: object = {}): void {
  fs.writeFileSync(
    path.join(dataDir, 'dispatch.json'),
    JSON.stringify({ agentServers: { Fake: { command: process.execPath, args: [path.join(fakeDir, 'agent.mjs')], env: { FAKE_DIR: fakeDir } } }, ...extra })
  );
}

/** A plain board: no git, so a hand-off works in the folder itself. */
function plainBoard(tasks: Record<string, string[]>, config = CONFIG()): void {
  const home = path.join(project, '.brainfile');
  fs.mkdirSync(path.join(home, 'board'), { recursive: true });
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(home, 'brainfile.md'), config);
  for (const [id, fields] of Object.entries(tasks)) fs.writeFileSync(path.join(home, 'board', `${id}.md`), taskFile(id, fields));
}

/** A repository whose board lives on its own branch, so hand-offs get worktrees and land. */
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
  fs.writeFileSync(path.join(home, 'brainfile.md'), CONFIG());
  for (const [id, fields] of Object.entries(tasks)) fs.writeFileSync(path.join(home, 'board', `${id}.md`), taskFile(id, fields));
  git(['add', '-A'], home);
  git(['commit', '-q', '-m', 'board'], home);
  fs.appendFileSync(path.join(project, '.git', 'info', 'exclude'), '.brainfile/\n');
}

const dotDir = () => path.join(project, '.brainfile');
const dirs = () => getV2Dirs(path.join(dotDir(), 'brainfile.md'));
const taskOf = (id: string) => findV2Task(dirs(), id, true)?.doc;
const recordOf = (id: string) => readDispatchRecord(taskOf(id)!.task);
const lines = (name: string) => (fs.existsSync(path.join(fakeDir, name)) ? fs.readFileSync(path.join(fakeDir, name), 'utf-8').split('\n').filter(Boolean) : []);
const release = (taskId: string) => fs.writeFileSync(path.join(fakeDir, `release-${taskId}`), '');

async function until<T>(what: string, check: () => T | undefined | null | false, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function runner(options: Partial<RunnerOptions> = {}): Runner {
  const made = new Runner({ dataDir, runner: 'cli', ask: async () => null, watchMs: 50, ...options });
  runners.push(made);
  return made;
}

/** Another live process on this machine, to claim as: the one that started this one. */
const OTHER_PID = process.ppid;

beforeAll(() => {
  for (const key of ENV) savedEnv[key] = process.env[key];
});

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-runner-')));
  project = path.join(base, 'repo');
  dataDir = path.join(base, 'data');
  fakeDir = path.join(base, 'fake');
  fs.mkdirSync(project);
  fs.mkdirSync(dataDir);
  fs.mkdirSync(fakeDir);
  fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    BRAINFILE_WORKTREES: path.join(base, 'worktrees'),
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  });
  settings();
});

afterEach(async () => {
  fs.writeFileSync(path.join(fakeDir, 'release-all'), '');
  for (const r of runners.splice(0)) r.close();
  await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(base, { recursive: true, force: true });
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('queue writes the request; start claims it, briefs the agent and runs its turn, with run files and events', async () => {
  plainBoard({ 'task-1': [] });
  const events: { run: AgentRun; was: string | null }[] = [];
  const a = runner({ onRun: (run, was) => events.push({ run, was }) });
  const queued = await a.queue(project, ['task-1'], { agent: AGENT, by: 'cli', until: 'review' });
  expect(queued.ok).toBe(true);
  expect(recordOf('task-1')).toMatchObject({ agent: AGENT, by: 'cli', until: 'review' });
  expect(taskOf('task-1')!.task.assignee).toBe(AGENT);
  expect(a.queued(project)).toEqual(['task-1']);

  const started = await a.start(project, 'task-1');
  if (!started.ok) throw new Error(started.error);
  const { run } = started.value;
  expect(recordOf('task-1')!.claim).toMatchObject({ runner: 'cli', pid: process.pid });
  expect(a.queued(project)).toEqual([]);
  await until('the agent to start', () => lines('started').includes('task-1'));
  expect(fs.readFileSync(path.join(fakeDir, 'brief-task-1'), 'utf-8')).toContain('Do task-1.');
  const file = readRunFile(dotDir(), run.id)!;
  expect(file).toMatchObject({ kind: 'dispatch', taskId: 'task-1', agent: AGENT, runner: 'cli', pid: process.pid, projectId: project });
  expect(runOf(file, project)).toMatchObject({ id: run.id, projectId: project, agentId: AGENT, taskId: 'task-1' });

  release('task-1');
  await until('the run to end', () => a.get(run.id)?.state === 'done');
  expect(a.get(run.id)!.reply).toBe('Did task-1');
  expect(readRunFile(dotDir(), run.id)).toMatchObject({ state: 'done', reply: 'Did task-1' });
  await until('the claim to be given back', () => recordOf('task-1')!.claim?.outcome === 'review');
  // Answered: no longer queued.
  expect(a.queued(project)).toEqual([]);
  expect(events[0].was).toBeNull();
  expect(events.some((e) => e.run.state === 'done' && e.was === 'working')).toBe(true);
});

test('two runners never start one task, and a live run refuses another start', async () => {
  plainBoard({ 'task-1': [] });
  const a = runner();
  const b = runner({ pid: OTHER_PID });
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'cli' });
  const [first, second] = await Promise.all([a.start(project, 'task-1'), b.start(project, 'task-1')]);
  const oks = [first, second].filter((r) => r.ok);
  expect(oks).toHaveLength(1);
  const refused = [first, second].find((r) => !r.ok) as { ok: false; error: string };
  expect(refused.error).toMatch(/claimed by|already working|starting on/);
  await until('the agent to start', () => lines('started').includes('task-1'));
  // Either runner sees the other's run, from its file.
  for (const r of [a, b]) {
    const again = await r.start(project, 'task-1');
    expect(again.ok).toBe(false);
    expect(r.liveDispatch(project, 'task-1')).toBeTruthy();
    expect(r.busy(project, 'task-1')).toMatch(/Fake is still working on task-1/);
  }
  expect(lines('started')).toEqual(['task-1']);
});

test('start waits while a dependsOn is open on this board', async () => {
  plainBoard({ 'task-1': [], 'task-2': ['dependsOn:', '  - task-1'] });
  const a = runner();
  await a.queue(project, ['task-2'], { agent: AGENT, by: 'cli' });
  const started = await a.start(project, 'task-2');
  expect(started).toEqual({ ok: false, error: 'task-2 waits on task-1: hand it off once it has landed' });
  expect(recordOf('task-2')!.claim).toBeUndefined();
  expect(await a.work(project)).toEqual([]);
  expect(a.queued(project)).toEqual(['task-2']);
});

test('work takes queued requests in order, at most dispatch.maxRunning at once, and the next as one ends', async () => {
  plainBoard({ 'task-1': [], 'task-2': [], 'task-3': [] }, CONFIG('dispatch:\n  maxRunning: 2\n'));
  const a = runner();
  expect(a.limit(project)).toBe(2);
  for (const id of ['task-1', 'task-2', 'task-3']) {
    await a.queue(project, [id], { agent: AGENT, by: 'cli' });
    await new Promise((r) => setTimeout(r, 5));
  }
  const started = await a.work(project);
  expect(started.map((s) => s.run.taskId)).toEqual(['task-1', 'task-2']);
  expect(a.live(project)).toHaveLength(2);
  // Another runner on this repository counts the same runs.
  const b = runner({ pid: OTHER_PID });
  expect(b.live(project)).toHaveLength(2);
  expect(await b.work(project)).toEqual([]);
  b.idle(project);

  release('task-1');
  await until('task-3 to start', () => lines('started').includes('task-3'));
  expect(a.live(project).length).toBeLessThanOrEqual(2);
  expect(lines('started')).toEqual(['task-1', 'task-2', 'task-3']);
});

test('a request the desktop wrote before runners claimed is not run again on upgrade, whatever its column; a send-back and a new request are', async () => {
  const at = 'at: "2026-10-01T10:00:00.000Z"';
  // No claim and no tries: Hand to…, the chat or the lead started it at once, before runners claimed.
  plainBoard({
    'task-1': ['dispatch:', '  agent: codex', '  by: lead', `  ${at}`],
    // A send-back queued: it waits on task-4 here, so nothing starts.
    'task-2': ['dispatch:', '  agent: codex', '  by: lead', `  ${at}`, '  tries: 1', 'dependsOn: [task-4]'],
    'task-3': ['dispatch:', `  agent: ${AGENT}`, '  by: person', `  ${at}`],
    'task-4': ['dispatch:', '  agent: codex', '  by: cli', `  ${at}`],
  });
  for (const [id, column] of [['task-1', 'review'], ['task-3', 'in-progress'], ['task-4', 'todo']]) {
    const file = path.join(dotDir(), 'board', `${id}.md`);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('column: todo', `column: ${column}`));
  }
  const a = runner();
  expect(a.queued(project)).toEqual(['task-2']);
  // The window's board changed: nothing of before is started, or claimed.
  a.boardChanged(project);
  expect(await a.work(project)).toEqual([]);
  a.idle(project);
  expect(recordOf('task-3')!.claim).toBeUndefined();
  expect(lines('started')).toEqual([]);
  // Asked for again, it is queued as any request is.
  await a.queue(project, ['task-3'], { agent: AGENT, by: 'person' });
  expect(recordOf('task-3')).toMatchObject({ by: 'person', tries: 0 });
  expect(a.queued(project)).toEqual(['task-2', 'task-3']);
});

test('a claim the board refuses starts nothing: no agent without a claim, so its task is never queued and started again', async () => {
  plainBoard({ 'task-1': [] });
  const files = fileBoard();
  // As the desktop's host refuses on a board conflict, or a task file stays busy.
  const refusing = { ...files, claim: async () => ({ ok: false as const, held: false, error: 'the board has a conflict' }) };
  const a = runner({ board: refusing });
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'cli' });
  expect(await a.start(project, 'task-1')).toEqual({ ok: false, error: 'task-1 could not be claimed, so it was not started: the board has a conflict' });
  expect(await a.work(project)).toEqual([]);
  a.idle(project);
  expect(await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' })).toMatchObject({ ok: false, error: expect.stringMatching(/could not be claimed/) });
  await new Promise((r) => setTimeout(r, 200));
  expect(lines('started')).toEqual([]);
  expect(a.list()).toEqual([]);
  expect(listRunFiles(dotDir())).toEqual([]);
});

test('the board config wins over the app setting, which wins over 3', () => {
  plainBoard({});
  const a = runner();
  expect(a.limit(project)).toBe(3);
  settings({ projects: { [project]: { concurrency: 5 } } });
  expect(a.limit(project)).toBe(5);
});

test('a stop from another process: a stop file beside the run, which its runner honours, never a signal', async () => {
  plainBoard({ 'task-1': [] });
  // A runner beaten often, so its writes of the run file come between the stop and its look.
  const a = runner({ watchMs: 300, beatMs: 10 });
  const b = runner({ pid: OTHER_PID });
  const kill = jest.spyOn(process, 'kill');
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'cli' });
  const started = await a.start(project, 'task-1');
  if (!started.ok) throw new Error(started.error);
  const runId = started.value.run.id;
  await until('the agent to start', () => lines('started').includes('task-1'));

  const stopped = await b.stop(runId, project);
  expect(stopped.ok).toBe(true);
  // Apart from the run file, which only its runner writes: no write of its runner's loses it.
  expect(readRunStop(dotDir(), runId)).toMatchObject({ at: expect.any(Number) });
  expect(readRunFile(dotDir(), runId)).not.toHaveProperty('stop');
  await until('the run to stop', () => a.get(runId)?.state === 'stopped');
  expect(fs.existsSync(runStopPath(dotDir(), runId))).toBe(false);
  expect(kill.mock.calls.filter(([, signal]) => signal === 'SIGTERM')).toEqual([]);
  kill.mockRestore();
  await until('its file to say so', () => readRunFile(dotDir(), runId)?.state === 'stopped');
  await until('the claim to say so', () => recordOf('task-1')!.claim?.outcome === 'stopped');
  // Nothing left to stop.
  expect((await b.stop(runId, project)).ok).toBe(true);
  expect(await b.stop('run-nope', project)).toEqual({ ok: false, error: 'No run run-nope on this machine' });
});

test('stopping its own run cancels the session and the ask it was waiting on', async () => {
  plainBoard({ 'task-1': [] });
  settings({ projects: {} });
  fs.writeFileSync(path.join(fakeDir, 'ask-task-1'), '');
  const asks: PermissionAsk[] = [];
  const cancelled: string[] = [];
  const a = runner({ ask: (ask) => (asks.push(ask), new Promise(() => {})), cancelAsk: (id) => cancelled.push(id) });
  const started = await a.start(project, 'task-1', { agent: AGENT });
  if (!started.ok) throw new Error(started.error);
  const runId = started.value.run.id;
  // No request was written: the claim wrote one.
  expect(recordOf('task-1')).toMatchObject({ agent: AGENT, by: 'cli', claim: { pid: process.pid } });
  await until('the ask', () => asks.length === 1);
  expect(asks[0]).toMatchObject({ runId, title: 'Run rm -rf build' });
  await until('the run to wait', () => a.get(runId)?.state === 'waiting');
  expect(readRunFile(dotDir(), runId)!.ask).toMatchObject({ title: 'Run rm -rf build' });

  await a.stop(runId);
  expect(cancelled).toEqual([asks[0].id]);
  expect(a.get(runId)!.state).toBe('stopped');
  // A hand-off's session goes with its turn.
  expect(a.sessions.size).toBe(0);
  expect(readRunFile(dotDir(), runId)!.ask).toBeUndefined();
});

test('an ask answered from another process: an answer file beside the run, which its runner applies and takes down', async () => {
  plainBoard({ 'task-1': [] });
  fs.writeFileSync(path.join(fakeDir, 'ask-task-1'), '');
  const asks: PermissionAsk[] = [];
  const cancelled: string[] = [];
  const fromOf = jest.fn(() => 'run-chat-1');
  const a = runner({ ask: (ask) => (asks.push(ask), new Promise(() => {})), cancelAsk: (id) => cancelled.push(id), fromOf });
  const b = runner({ pid: OTHER_PID });
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'chat' });
  const started = await a.start(project, 'task-1');
  if (!started.ok) throw new Error(started.error);
  const runId = started.value.run.id;
  // The host named the chat turn behind a request the chat made.
  expect(fromOf).toHaveBeenCalledWith(project, 'task-1', expect.objectContaining({ by: 'chat' }));
  expect(started.value.run.from).toBe('run-chat-1');
  await until('the ask', () => asks.length === 1);
  const file = await until('the ask in its file', () => readRunFile(dotDir(), runId)?.ask);
  expect(file.id).toBe(asks[0].id);
  expect(b.others(project).map((f) => f.id)).toEqual([runId]);

  expect(b.answerAsk(runId, 'ask-elsewhere', 'yes', project)).toEqual({ ok: false, error: `${runId} is not asking that now` });
  expect(b.answerAsk(runId, asks[0].id, 'yes', project)).toEqual({ ok: true, value: undefined });
  await until('the agent to have its answer', () => lines('answer-task-1').length > 0);
  expect(JSON.parse(lines('answer-task-1')[0])).toEqual({ outcome: 'selected', optionId: 'yes' });
  // Its own prompt was taken down, the answer file went, and the run goes on.
  expect(cancelled).toEqual([asks[0].id]);
  expect(fs.existsSync(path.join(dotDir(), 'state', 'runs', `${runId}.answer.json`))).toBe(false);
  await until('the ask to leave its file', () => readRunFile(dotDir(), runId) && !readRunFile(dotDir(), runId)!.ask);
  expect(a.get(runId)!.state).toBe('working');
  release('task-1');
  await until('the run to end', () => a.get(runId)?.state === 'done');
  expect(b.answerAsk(runId, asks[0].id, 'yes', project)).toEqual({ ok: false, error: `${runId} has ended` });
});

test('closing lets go of its runs: stopped, their claims kept as stopped, so none starts again on its own; handing one off again is the same try', async () => {
  plainBoard({ 'task-1': [] });
  const a = runner();
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'person' });
  const started = await a.start(project, 'task-1');
  if (!started.ok) throw new Error(started.error);
  const runId = started.value.run.id;
  await until('the agent to start', () => lines('started').includes('task-1'));
  expect(recordOf('task-1')!.tries).toBe(1);

  // The desktop quitting: its process exits, and nothing is awaited.
  a.close();
  expect(readRunFile(dotDir(), runId)).toMatchObject({ state: 'stopped', endedAt: expect.any(Number) });
  expect(recordOf('task-1')!.claim).toMatchObject({ pid: process.pid, outcome: 'stopped' });
  const b = runner({ pid: OTHER_PID });
  expect(b.queued(project)).toEqual([]);
  expect(await b.work(project)).toEqual([]);
  b.idle(project);

  // The person hands it off again: it carries on the try the stop cut short.
  const again = await b.dispatch(project, 'task-1', { agent: AGENT, by: 'person' });
  if (!again.ok) throw new Error(again.error);
  expect(recordOf('task-1')).toMatchObject({ tries: 1, claim: { pid: OTHER_PID } });
});

test('quit waits for the board: its hand-offs end stopped and their claims say so', async () => {
  plainBoard({ 'task-1': [] });
  const a = runner();
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' });
  if (!started.ok) throw new Error(started.error);
  await until('the agent to start', () => lines('started').includes('task-1'));
  await a.quit();
  expect(a.get(started.value.run.id)!.state).toBe('stopped');
  expect(recordOf('task-1')!.claim).toMatchObject({ outcome: 'stopped' });
  expect(await a.start(project, 'task-1')).toMatchObject({ ok: false });
});

test('a runner that stays up tidies its run files as it goes, not only when it first looks', async () => {
  plainBoard({});
  const a = runner({ pruneMs: 100 });
  await a.work(project);
  const old: RunFile = { id: 'run-old', kind: 'dispatch', taskId: 'task-9', agent: AGENT, state: 'done', activity: 'done', startedAt: 1, endedAt: 2, host: a.host, pid: OTHER_PID, runner: 'cli', beatAt: 2 };
  writeRunFile(dotDir(), old);
  expect(readRunFile(dotDir(), 'run-old')).toBeTruthy();
  await until('the old run to be pruned', () => !readRunFile(dotDir(), 'run-old'));
  a.idle(project);
});

test('the limit holds when passes come together: each takes its place before it waits', async () => {
  plainBoard({ 'task-1': [], 'task-2': [], 'task-3': [], 'task-4': [] }, CONFIG('dispatch:\n  maxRunning: 2\n'));
  const a = runner();
  for (const id of ['task-1', 'task-2', 'task-3', 'task-4']) {
    await a.queue(project, [id], { agent: AGENT, by: 'cli' });
    await new Promise((r) => setTimeout(r, 5));
  }
  const passes = await Promise.all([a.work(project), a.work(project), a.workLed(project), a.work(project)]);
  expect(passes.flat().map((s) => s.run.taskId)).toEqual(['task-1', 'task-2']);
  expect(a.live(project)).toHaveLength(2);
  await until('both agents', () => lines('started').length === 2);
  a.idle(project);
});

test("a lost runner's claim is taken again", async () => {
  plainBoard({ 'task-1': [] });
  const a = runner();
  await a.queue(project, ['task-1'], { agent: AGENT, by: 'cli' });
  // A runner that died mid-run: its process is gone, its run file never ended.
  const dead = 2 ** 22 + 12345;
  const taken = claimDispatchFile(findV2Task(dirs(), 'task-1')!.filePath, { host: a.host, runner: 'cli', pid: dead });
  expect(taken.ok).toBe(true);
  const lost: RunFile = { id: 'run-lost', kind: 'dispatch', taskId: 'task-1', agent: AGENT, state: 'working', activity: 'editing', startedAt: 1, host: a.host, pid: dead, runner: 'cli', beatAt: 1 };
  writeRunFile(dotDir(), lost);
  expect(a.live(project)).toEqual([]);
  expect(a.queued(project)).toEqual(['task-1']);

  const started = await a.work(project);
  expect(started.map((s) => s.run.taskId)).toEqual(['task-1']);
  expect(recordOf('task-1')!.claim).toMatchObject({ pid: process.pid });
  await until('the agent to start', () => lines('started').includes('task-1'));
});

test('until done in a bypass repository: a failed check goes back to the same agent up to maxRetries, then parks in Review', async () => {
  gitBoard({
    'task-1': ['contract:', '  status: ready', '  maxRetries: 2', '  deliverables:', '    - type: file', '      path: work.txt', '  validation:', '    commands:', '      - test -f ok.txt'],
  });
  settings({ bypass: true });
  fs.writeFileSync(path.join(fakeDir, 'commit-task-1'), '');
  fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
  const a = runner();
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, model: 'fast', by: 'cli', until: 'done' });
  if (!started.ok) throw new Error(started.error);
  expect(started.value.worktree?.branch).toBe('dispatch/task-1');

  await until('three runs and a park', () => taskOf('task-1')?.task.column === 'review', 45_000);
  expect(lines('started')).toEqual(['task-1', 'task-1', 'task-1']);
  const runs = a.list().filter((r) => r.taskId === 'task-1');
  expect(runs.map((r) => [r.agentId, r.model])).toEqual([
    [AGENT, 'fast'],
    [AGENT, 'fast'],
    [AGENT, 'fast'],
  ]);
  const body = taskOf('task-1')!.body;
  expect(body.match(/Landing sent back \(\d of 2\)/g)).toEqual(['Landing sent back (1 of 2)', 'Landing sent back (2 of 2)']);
  expect(body).toMatch(/Not landed/);
  await until('the claim to say review', () => recordOf('task-1')!.claim?.outcome === 'review');
  expect(git(['rev-list', '--count', 'main'], project)).toBe('1');
});

test('until done in a bypass repository: a passing check lands it and completes the task', async () => {
  gitBoard({ 'task-1': ['contract:', '  status: ready', '  validation:', '    commands:', '      - test -n "$(ls work-*.txt)"'] });
  settings({ bypass: true });
  fs.writeFileSync(path.join(fakeDir, 'commit-task-1'), '');
  fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
  const landed: string[] = [];
  const a = runner({ landed: (_p, id) => landed.push(id) });
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, by: 'cli', until: 'done' });
  if (!started.ok) throw new Error(started.error);
  await until('the task to complete', () => findV2Task(dirs(), 'task-1', true)?.isLog, 30_000);
  expect(landed).toEqual(['task-1']);
  expect(git(['log', '-1', '--format=%s', 'main'], project)).toBe('Merge task-1: Task task-1');
  await until('the claim to say done', () => recordOf('task-1')!.claim?.outcome === 'done');
  expect(listRunFiles(dotDir()).map((f) => f.state)).toEqual(['done']);
});

test('land refuses while the agent is still at it', async () => {
  plainBoard({ 'task-1': [] });
  const a = runner();
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' });
  if (!started.ok) throw new Error(started.error);
  expect(await a.land(project, 'task-1')).toEqual({ ok: false, kind: 'refused', error: 'Fake is still working on task-1', sentBack: false });
});

test('a task being landed starts nothing until its landing is done: landing in progress', async () => {
  const gate = path.join(base, 'gate');
  gitBoard({ 'task-1': ['contract:', '  status: ready', '  validation:', '    commands:', `      - while [ ! -f ${gate} ]; do sleep 0.05; done`] });
  fs.writeFileSync(path.join(fakeDir, 'commit-task-1'), '');
  fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
  const a = runner();
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' });
  if (!started.ok) throw new Error(started.error);
  await until('the run to end', () => a.get(started.value.run.id)?.state === 'done');
  await until('the claim to be given back', () => recordOf('task-1')!.claim?.outcome === 'review');

  // Merge: its checks run for as long as they take.
  const landing = a.land(project, 'task-1');
  await new Promise((r) => setTimeout(r, 100));
  expect(a.busy(project, 'task-1')).toBe('task-1 is being landed: landing in progress');
  expect(await a.start(project, 'task-1', { agent: AGENT })).toEqual({ ok: false, error: 'task-1 is being landed: landing in progress' });
  expect(await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' })).toEqual({ ok: false, error: 'task-1 is being landed: landing in progress' });
  expect(await a.land(project, 'task-1')).toMatchObject({ ok: false, kind: 'refused', error: 'task-1 is being landed: landing in progress' });
  expect(lines('started')).toEqual(['task-1']);

  fs.writeFileSync(gate, '');
  expect(await landing).toMatchObject({ ok: true, completed: true });
  expect(a.busy(project, 'task-1')).toBeNull();
});

test("an epic's last child landed through the runner, with no lead, puts the epic's own branch up to merge", async () => {
  gitBoard({
    'epic-1': ['type: epic', 'epicBranch: true'],
    'task-1': ['parentId: epic-1'],
  });
  fs.writeFileSync(path.join(fakeDir, 'commit-task-1'), '');
  fs.writeFileSync(path.join(fakeDir, 'release-task-1'), '');
  const a = runner();
  const started = await a.dispatch(project, 'task-1', { agent: AGENT, by: 'person' });
  if (!started.ok) throw new Error(started.error);
  expect(started.value.worktree?.branch).toBe('dispatch/task-1');
  await until('the run to end', () => a.get(started.value.run.id)?.state === 'done');
  await until('the claim to be given back', () => recordOf('task-1')!.claim?.outcome === 'review');
  expect(readyToMerge(project).map((r) => r.taskId)).toEqual(['task-1']);

  // `brainfile land`, the MCP's land or Merge: all the Runner's land.
  expect(await a.land(project, 'task-1')).toMatchObject({ ok: true, completed: true });
  expect(git(['log', '-1', '--format=%s', 'dispatch/epic-1'], project)).toBe('Merge task-1: Task task-1');
  expect(readyToMerge(project).map((r) => r.taskId)).toEqual(['epic-1']);
  expect(findV2Task(dirs(), 'epic-1')).toBeTruthy();
});
