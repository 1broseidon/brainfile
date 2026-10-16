/**
 * Hand-offs from the CLI and MCP (task-81): queue, status from the run
 * files, stop, review, land and discard against a scratch repository whose
 * board lives on its own branch, with a fake ACP agent (a small agent over
 * the real SDK, started as a custom agent) doing the work; and the roles
 * that keep a worker's server from dispatching.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';
import { claimDispatchFile, currentHost, findV2Task, getV2Dirs, readDispatchRecord, readLeadRecord } from '@brainfile/core';
import { readRunFile, readRunStop, writeRunFile, writeRunnerFile, type RunFile } from '@brainfile/core/repo';
import { agentRoleOf } from '@brainfile/core/dispatch';
import { NO_RUNNER, dispatchCommand, dispatchReport, dispatchStatusCommand, dispatchStopCommand, leadReport, statusReport, statusText, stopReport } from '../commands/dispatch';
import { discardCommand, discardReport, landCommand, landReport, readyReport, reviewCommand, reviewReport } from '../commands/review';
import { runCommand } from '../commands/run';
import { discussCommand } from '../commands/discuss';
import { MemoryLogger } from '../utils/logger';
import { WireClient } from './helpers/mcp-wire';

// The SDK is ESM only: loaded through node's own require (jest's cannot), as core's runner test does.
const nodeRequire = (process as unknown as { getBuiltinModule(id: 'module'): typeof import('module') }).getBuiltinModule('module').createRequire(__filename);
jest.mock('@agentclientprotocol/sdk', () => nodeRequire('@agentclientprotocol/sdk'));

jest.setTimeout(60_000);

const SDK = pathToFileURL(nodeRequire.resolve('@agentclientprotocol/sdk')).href;

/** Says which task it was handed, keeps the MCP servers it was given, commits when told to, ends its turn when released. */
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
  async newSession({ mcpServers }) { const sessionId = 's' + sessions.size; sessions.set(sessionId, { cancelled: false, mcpServers }); return { sessionId }; },
  async authenticate() { return {}; },
  async prompt({ sessionId, prompt }) {
    const text = prompt.map((p) => p.text ?? '').join('');
    const taskId = /You have been handed ([a-z]+-\\d+)/.exec(text)?.[1] ?? 'none';
    const session = sessions.get(sessionId);
    fs.appendFileSync(path.join(dir, 'started'), taskId + '\\n');
    fs.writeFileSync(path.join(dir, 'mcp-' + taskId), JSON.stringify(session.mcpServers));
    if (has('commit-' + taskId)) {
      fs.writeFileSync(path.join(process.cwd(), 'work-' + taskId + '.txt'), 'from the agent\\n');
      execFileSync('git', ['add', '-A'], { cwd: process.cwd() });
      execFileSync('git', ['commit', '-q', '-m', 'work on ' + taskId], { cwd: process.cwd() });
    }
    while (!session.cancelled && !has('release-' + taskId) && !has('release-all')) await sleep(20);
    if (session.cancelled) return { stopReason: 'cancelled' };
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
const clients: WireClient[] = [];

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function taskFile(id: string, fields: string[] = []): string {
  return ['---', `id: ${id}`, `title: Task ${id}`, ...(fields.some((f) => f.startsWith('column:')) ? [] : ['column: todo']), ...fields, '---', '', `Do ${id}.`, ''].join('\n');
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
const mark = (name: string) => fs.writeFileSync(path.join(fakeDir, name), '');

/** A process on this machine that stands for another runner: alive, and ours to end. */
function otherRunner(): number {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  children.push(child);
  return child.pid!;
}

function runFile(pid: number, fields: Partial<RunFile>): RunFile {
  const now = Date.now();
  const file: RunFile = {
    id: `run-other-${pid}`,
    kind: 'dispatch',
    agent: AGENT,
    state: 'working',
    activity: 'editing',
    startedAt: now - 60_000,
    host: currentHost(),
    pid,
    runner: 'cli',
    beatAt: now,
    projectId: project,
    ...fields,
  };
  writeRunFile(dotDir(), file);
  return file;
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

beforeAll(() => {
  for (const key of ENV) savedEnv[key] = process.env[key];
});

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-cli-dispatch-')));
  project = path.join(base, 'repo');
  fakeDir = path.join(base, 'fake');
  const dataDir = path.join(base, 'data');
  const bin = path.join(base, 'bin');
  for (const dir of [fakeDir, dataDir, bin]) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(fakeDir, 'agent.mjs'), FAKE_AGENT);
  // A `brainfile` on PATH, so the runner hands its agents a board server and says what role it has.
  fs.writeFileSync(path.join(bin, 'brainfile'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(dataDir, 'dispatch.json'),
    JSON.stringify({ agentServers: { Fake: { command: process.execPath, args: [path.join(fakeDir, 'agent.mjs')], env: { FAKE_DIR: fakeDir } } } }),
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
  for (const client of clients.splice(0)) await client.close();
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

describe('dispatch: the queue', () => {
  test('queues named tasks for an agent, and says plainly when no runner is up', async () => {
    gitBoard({ 'task-1': [], 'task-2': [] });
    const report = await dispatchReport(filePath, { ids: ['task-1', 'task-2'] }, { agent: 'fake', model: 'm1', effort: 'high', until: 'done' });
    expect(report.queued.map((q) => q.task)).toEqual(['task-1', 'task-2']);
    expect(report.runnerUp).toBe(false);
    expect(report.said).toContain(NO_RUNNER);
    expect(recordOf('task-1')).toMatchObject({ agent: AGENT, model: 'm1', effort: 'high', until: 'done', by: 'cli' });
    expect(found('task-1')!.doc.task.assignee).toBe(AGENT);
    // The request is committed on the board's branch before the command returns.
    expect(git(['log', '--format=%s', '-3'], dotDir())).toMatch(/dispatch task-\d: custom:Fake \(asked by cli\)/);
    // This command's own runner file is gone.
    expect(fs.readdirSync(path.join(dotDir(), 'state', 'runners'))).toEqual([]);
  });

  test('with a runner up on this machine, it says nothing more', async () => {
    gitBoard({ 'task-1': [] });
    const pid = otherRunner();
    writeRunnerFile(dotDir(), { host: currentHost(), pid, runner: 'cli', startedAt: Date.now(), beatAt: Date.now() });
    const report = await dispatchReport(filePath, { ids: ['task-1'] }, { agent: AGENT });
    expect(report.runnerUp).toBe(true);
    expect(report.said).toBe('Queued task-1 for Fake.');
  });

  test('--column and --parent pick the open work; decisions, parents and what waits are said', async () => {
    gitBoard({
      'epic-1': ['type: epic'],
      'task-1': ['parentId: epic-1'],
      'task-2': ['parentId: epic-1', 'dependsOn:\n  - task-1'],
      'task-3': ['column: in-progress'],
      'decision-1': ['type: decision'],
    });
    const byParent = await dispatchReport(filePath, { parent: 'epic-1' }, { agent: AGENT });
    expect(byParent.queued).toEqual([{ task: 'task-1', agent: AGENT }, { task: 'task-2', agent: AGENT, waitsOn: ['task-1'] }]);
    expect(byParent.said).toContain('task-2 waits on task-1: it starts once that has landed.');

    const byColumn = await dispatchReport(filePath, { column: 'In Progress' }, { agent: AGENT });
    expect(byColumn.queued.map((q) => q.task)).toEqual(['task-3']);

    const named = await dispatchReport(filePath, { ids: ['epic-1', 'decision-1', 'task-9'] }, { agent: AGENT });
    // An epic named gets a lead (task-83).
    expect(named.queued).toEqual([{ task: 'epic-1', agent: AGENT, until: 'review', lead: true }]);
    expect(named.skipped).toEqual([
      { task: 'decision-1', why: 'a decision is not work' },
      { task: 'task-9', why: 'there is no such task on the board' },
    ]);
    await expect(dispatchReport(filePath, { column: 'nowhere' }, { agent: AGENT })).rejects.toThrow('No column nowhere');
  });

  test('with no agent, the one it was handed to before, else its assignee; else it is skipped', async () => {
    gitBoard({ 'task-1': [], 'task-2': [`assignee: ${AGENT}`], 'task-3': ['assignee: someone'] });
    await dispatchReport(filePath, { ids: ['task-1'] }, { agent: AGENT, model: 'm1' });
    const again = await dispatchReport(filePath, { ids: ['task-1', 'task-2', 'task-3'] }, {});
    expect(again.queued).toEqual([{ task: 'task-1', agent: AGENT, model: 'm1' }, { task: 'task-2', agent: AGENT }]);
    expect(again.skipped).toEqual([{ task: 'task-3', why: 'no agent: name one with --agent' }]);
    await expect(dispatchReport(filePath, { ids: ['task-1'] }, { agent: 'nobody' })).rejects.toThrow('Unknown agent nobody');
  });

  test('a task another runner holds is not queued again', async () => {
    gitBoard({ 'task-1': [] });
    await dispatchReport(filePath, { ids: ['task-1'] }, { agent: AGENT });
    const pid = otherRunner();
    claimDispatchFile(found('task-1')!.filePath, { host: currentHost(), runner: 'desktop', pid });
    writeRunnerFile(dotDir(), { host: currentHost(), pid, runner: 'desktop', startedAt: Date.now(), beatAt: Date.now() });
    const report = await dispatchReport(filePath, { ids: ['task-1'] }, { agent: AGENT });
    expect(report.skipped).toEqual([{ task: 'task-1', why: `a desktop runner on ${currentHost()} has it` }]);
  });
});

describe('dispatch status and stop: from the run files', () => {
  test('status lists the runners, the live runs, the queue and the claims', async () => {
    gitBoard({ 'task-1': [], 'task-2': [] });
    await dispatchReport(filePath, { ids: ['task-1', 'task-2'] }, { agent: AGENT, model: 'm1' });
    const pid = otherRunner();
    writeRunnerFile(dotDir(), { host: currentHost(), pid, runner: 'desktop', startedAt: Date.now(), beatAt: Date.now() });
    claimDispatchFile(found('task-2')!.filePath, { host: currentHost(), runner: 'desktop', pid });
    runFile(pid, { taskId: 'task-2', branch: 'dispatch/task-2', runner: 'desktop', ask: { title: 'Run npm test', options: [] } });

    const status = await statusReport(filePath);
    expect(status.limit).toBe(3);
    expect(status.runners).toEqual([expect.objectContaining({ runner: 'desktop', pid })]);
    expect(status.running).toEqual([
      expect.objectContaining({ id: `run-other-${pid}`, task: 'task-2', agent: AGENT, state: 'working', runner: 'desktop', pid, branch: 'dispatch/task-2', asking: 'Run npm test' }),
    ]);
    expect(status.queued).toEqual([expect.objectContaining({ task: 'task-1', agent: AGENT, model: 'm1', by: 'cli' })]);
    expect(status.claims).toEqual([expect.objectContaining({ task: 'task-2', runner: 'desktop', pid, lost: false })]);
  });

  test('stop by task id asks the run\'s runner through its file, and waits for it to end', async () => {
    gitBoard({ 'task-1': [] });
    const pid = otherRunner();
    const file = runFile(pid, { taskId: 'task-1' });
    // The other runner honours the stop it finds beside its file.
    const honour = setInterval(() => {
      const now = readRunFile(dotDir(), file.id);
      if (now && readRunStop(dotDir(), file.id) && !now.endedAt) writeRunFile(dotDir(), { ...now, state: 'stopped', endedAt: Date.now() });
    }, 50);
    try {
      const report = await stopReport(filePath, 'task-1', { waitMs: 5_000 });
      expect(report).toMatchObject({ run: file.id, task: 'task-1', stopped: true });
      expect(report.said).toBe('Stopped Fake on task-1. Its worktree and branch stay for review.');
    } finally {
      clearInterval(honour);
    }
    await expect(stopReport(filePath, 'task-1')).rejects.toThrow('Nothing is running on task-1 on this machine');
    await expect(stopReport(filePath, file.id)).resolves.toMatchObject({ stopped: true, said: `${file.id} has already ended (stopped)` });
  });

  test('a stop not yet honoured says so', async () => {
    gitBoard({ 'task-1': [] });
    const pid = otherRunner();
    const file = runFile(pid, { taskId: 'task-1' });
    const report = await stopReport(filePath, file.id);
    expect(report.stopped).toBe(false);
    expect(report.said).toBe('Asked Fake on task-1 to stop; its runner stops it when it next looks, within a second while it is up.');
    expect(readRunStop(dotDir(), file.id)).toMatchObject({ at: expect.any(Number) });
    expect(readRunFile(dotDir(), file.id)).not.toHaveProperty('stop');
  });
});

describe('dispatch --now, review, land and discard: with a fake agent', () => {
  test('--now runs the hand-off here as a worker; review shows it; land checks, lands and completes it', async () => {
    gitBoard({ 'task-1': [] });
    mark('commit-task-1');
    mark('release-task-1');
    const logger = new MemoryLogger();
    await dispatchCommand(['task-1'], { file: filePath, agent: AGENT, now: true }, logger);
    const said = logger.logs.map((l) => String(l[0])).join('\n');
    expect(said).toContain('Queued task-1 for Fake.');
    expect(said).not.toContain(NO_RUNNER);
    expect(said).toMatch(/task-1 · Fake · (starting|working|thinking|editing)/);
    expect(said).toContain('task-1 in Review');
    // Its claim was given back as a hand-off for review.
    expect(recordOf('task-1')!.claim).toMatchObject({ runner: 'cli', outcome: 'review' });
    // The agent's board server was told it is a worker.
    const servers = JSON.parse(fs.readFileSync(path.join(fakeDir, 'mcp-task-1'), 'utf-8')) as { name: string; env: { name: string; value: string }[] }[];
    expect(servers.find((s) => s.name === 'brainfile')!.env).toEqual(expect.arrayContaining([{ name: 'BRAINFILE_AGENT_ROLE', value: 'worker' }]));

    const review = await reviewReport(filePath, 'task-1');
    expect(review.review).toMatchObject({ branch: 'dispatch/task-1', into: 'main', ahead: 1, conflicts: [], uncommitted: 0 });
    expect(review.review!.files.map((f) => f.path)).toEqual(['work-task-1.txt']);
    expect(review.canLand).toBe(true);
    expect((await readyReport(filePath)).ready).toEqual([expect.objectContaining({ task: 'task-1', into: 'main', ahead: 1, conflicts: false })]);

    const landed = await landReport(filePath, 'task-1');
    expect(landed).toMatchObject({ task: 'task-1', landed: true, completed: true });
    expect(found('task-1')!.isLog).toBe(true);
    expect(git(['show', 'main:work-task-1.txt'], project)).toBe('from the agent');
  });

  test('a conflict on landing is sent back through the queue, with a note', async () => {
    gitBoard({ 'task-1': [] });
    mark('commit-task-1');
    mark('release-task-1');
    await dispatchCommand(['task-1'], { file: filePath, agent: AGENT, model: 'm1', now: true }, new MemoryLogger());
    // The trunk changes the same file meanwhile.
    fs.writeFileSync(path.join(project, 'work-task-1.txt'), 'from the trunk\n');
    git(['add', '-A'], project);
    git(['commit', '-q', '-m', 'trunk work'], project);

    const review = await reviewReport(filePath, 'task-1');
    expect(review.review!.conflicts).toEqual(['work-task-1.txt']);

    const landed = await landReport(filePath, 'task-1');
    expect(landed).toMatchObject({ landed: false, kind: 'conflict', sentBack: true });
    expect(landed.message).toContain('sent back to Fake to settle');
    expect(landed.message).toContain('it waits in the queue for a runner');
    // Queued again for the same agent and model; no claim, so the next runner takes it.
    expect(recordOf('task-1')).toMatchObject({ agent: AGENT, model: 'm1' });
    expect(recordOf('task-1')!.claim).toBeUndefined();
    expect((await statusReport(filePath)).queued.map((q) => q.task)).toEqual(['task-1']);
    expect(found('task-1')!.doc.body).toContain('Landing sent back');
  });

  test('discard throws the worktree and branch away; refused while a run is live', async () => {
    gitBoard({ 'task-1': [] });
    mark('commit-task-1');
    mark('release-task-1');
    await dispatchCommand(['task-1'], { file: filePath, agent: AGENT, now: true }, new MemoryLogger());
    const pid = otherRunner();
    const live = runFile(pid, { taskId: 'task-1' });
    await expect(discardReport(filePath, 'task-1')).rejects.toThrow('Fake is still working on task-1');
    await expect(landReport(filePath, 'task-1')).resolves.toMatchObject({ landed: false, kind: 'refused' });
    writeRunFile(dotDir(), { ...live, state: 'stopped', endedAt: Date.now() });

    const discarded = await discardReport(filePath, 'task-1');
    expect(discarded.message).toBe('Discarded dispatch/task-1');
    expect(git(['branch', '--list', 'dispatch/task-1'], project)).toBe('');
    expect((await reviewReport(filePath, 'task-1')).review).toBeNull();
  });
});

describe('roles: what an agent\'s server lists', () => {
  const names = async (client: WireClient) => (await client.listTools()).map((t) => t.name);

  test('the role comes from BRAINFILE_AGENT_ROLE; a lead\'s tree from BRAINFILE_LEAD_SCOPE; one unknown is a worker, not a person', () => {
    expect(agentRoleOf({})).toEqual({});
    expect(agentRoleOf({ BRAINFILE_AGENT_ROLE: 'Worker' })).toEqual({ role: 'worker' });
    expect(agentRoleOf({ BRAINFILE_AGENT_ROLE: 'lead', BRAINFILE_LEAD_SCOPE: 'epic-1' })).toEqual({ role: 'lead', scope: 'epic-1' });
    const said: string[] = [];
    expect(agentRoleOf({ BRAINFILE_AGENT_ROLE: 'admin' }, (line) => said.push(line))).toEqual({ role: 'worker' });
    expect(said).toEqual(['BRAINFILE_AGENT_ROLE=admin is not a role (chat, lead, worker, discuss): treated as worker']);
  });

  test('a worker\'s server lists no dispatch, stop, land or discard; its instructions match', async () => {
    gitBoard({ 'task-1': [] });
    const client = await WireClient.open(filePath, 'modern', { role: 'worker' });
    clients.push(client);
    const listed = await names(client);
    expect(listed).toEqual(expect.arrayContaining(['dispatch_status', 'review', 'agents', 'note']));
    expect(listed).not.toContain('dispatch');
    expect(listed).not.toContain('dispatch_stop');
    const review = (await client.listTools()).find((t) => t.name === 'review')!;
    expect((review.inputSchema as { properties: { action: { enum: string[] } } }).properties.action.enum).toEqual(['show', 'ready']);
    const refused = await client.callTool('review', { action: 'land', task: 'task-1' });
    expect(refused.isError).toBe(true);
    const instructions = String(client.opening.instructions ?? '');
    expect(instructions).not.toMatch(/^- dispatch: /m);
    expect(instructions).not.toContain('Hand-offs:');
  });

  test('a discussion is a worker here too; the chat and a person see everything', async () => {
    gitBoard({ 'task-1': [] });
    for (const [access, dispatches] of [[{ role: 'discuss' as const }, false], [{ role: 'chat' as const }, true], [{}, true]] as const) {
      const client = await WireClient.open(filePath, 'modern', access);
      clients.push(client);
      expect((await names(client)).includes('dispatch')).toBe(dispatches);
      expect(String(client.opening.instructions).includes('ask the person before dispatching more than three tasks at once. Never dispatch a task whose dependsOn are open.')).toBe(dispatches);
    }
  });

  test('the chat\'s dispatch is recorded as the chat\'s and says when no runner is up', async () => {
    gitBoard({ 'task-1': [] });
    const client = await WireClient.open(filePath, 'modern', { role: 'chat' });
    clients.push(client);
    const result = await client.callTool('dispatch', { task: 'task-1', agent: AGENT });
    expect(result.isError).toBeFalsy();
    expect(result.content![0].text).toBe(`Queued task-1 for Fake.\n${NO_RUNNER}`);
    expect(recordOf('task-1')).toMatchObject({ agent: AGENT, by: 'chat' });
  });

  test('a lead reaches only its own tree', async () => {
    gitBoard({ 'epic-1': ['type: epic'], 'task-1': ['parentId: epic-1'], 'task-2': ['parentId: task-1'], 'task-3': [] });
    const client = await WireClient.open(filePath, 'modern', { role: 'lead', scope: 'epic-1' });
    clients.push(client);
    const result = await client.callTool('dispatch', { task: ['task-2', 'task-3'], agent: AGENT });
    expect(result.structuredContent).toMatchObject({
      queued: [{ task: 'task-2', agent: AGENT }],
      skipped: [{ task: 'task-3', why: 'task-3 is not under epic-1: a lead reaches only its own tree' }],
    });
    expect(recordOf('task-2')).toMatchObject({ by: 'lead' });
    expect(recordOf('task-3')).toBeNull();
    const outside = await client.callTool('review', { action: 'discard', task: 'task-3' });
    expect(outside.isError).toBe(true);
    expect(outside.content![0].text).toContain('task-3 is not under epic-1');
    const status = await client.callTool('dispatch_status', {});
    expect((status.structuredContent as { queued: { task: string }[] }).queued.map((q) => q.task)).toEqual(['task-2']);
    expect(String(client.opening.instructions)).toContain('You lead epic-1: dispatch, stop and land reach only the tasks under it.');
  });
});

describe("roles: the command line in an agent's own shell", () => {
  /** Runs `work` as a command run in a shell whose session was started with this role. */
  async function as<T>(role: string, scope: string | undefined, work: () => Promise<T>): Promise<T> {
    process.env.BRAINFILE_AGENT_ROLE = role;
    if (scope) process.env.BRAINFILE_LEAD_SCOPE = scope;
    try {
      return await work();
    } finally {
      delete process.env.BRAINFILE_AGENT_ROLE;
      delete process.env.BRAINFILE_LEAD_SCOPE;
    }
  }
  const quiet = () => new MemoryLogger();

  test('a worker or a discussion hands off, stops, lands and discards nothing; it reads the status and the review', async () => {
    gitBoard({ 'task-1': [] });
    for (const role of ['worker', 'discuss']) {
      await as(role, undefined, async () => {
        await expect(dispatchCommand(['task-1'], { file: filePath, agent: AGENT }, quiet())).rejects.toThrow(`A ${role} cannot dispatch`);
        await expect(dispatchStopCommand('task-1', { file: filePath }, quiet())).rejects.toThrow(`A ${role} cannot stop a run`);
        await expect(landCommand('task-1', { file: filePath }, quiet())).rejects.toThrow(`A ${role} cannot land`);
        await expect(discardCommand('task-1', { file: filePath }, quiet())).rejects.toThrow(`A ${role} cannot discard`);
        await expect(dispatchStatusCommand({ file: filePath }, quiet())).resolves.toMatchObject({ queued: [] });
        await expect(reviewCommand(undefined, { file: filePath, ready: true }, quiet())).resolves.toMatchObject({ ready: [] });
      });
    }
    expect(recordOf('task-1')).toBeNull();
  });

  test('no agent starts a runner or another agent inside its turn: run, dispatch --now and discuss are refused, whatever its role', async () => {
    gitBoard({ 'epic-1': ['type: epic'], 'task-1': ['parentId: epic-1'] });
    for (const [role, scope] of [['worker'], ['chat'], ['lead', 'epic-1'], ['discuss']] as const) {
      await as(role, scope, async () => {
        await expect(runCommand({ file: filePath, once: true }, quiet())).rejects.toThrow(`A ${role} cannot run a runner: an agent never starts agents inside its own turn`);
        await expect(dispatchCommand(['task-1'], { file: filePath, agent: AGENT, now: true }, quiet())).rejects.toThrow(`A ${role} cannot run a hand-off here with --now`);
        await expect(discussCommand('task-1', { file: filePath, agent: AGENT }, quiet())).rejects.toThrow(`A ${role} cannot start a discussion`);
      });
    }
    expect(recordOf('task-1')).toBeNull();
  });

  test("a lead's command line reaches only its own tree, as its server does", async () => {
    gitBoard({ 'epic-1': ['type: epic'], 'task-1': ['parentId: epic-1'], 'task-3': [] });
    await as('lead', 'epic-1', async () => {
      const report = await dispatchCommand(['task-1', 'task-3'], { file: filePath, agent: AGENT }, quiet());
      expect(report.queued.map((q) => q.task)).toEqual(['task-1']);
      expect(report.skipped).toEqual([{ task: 'task-3', why: 'task-3 is not under epic-1: a lead reaches only its own tree' }]);
      await expect(landCommand('task-3', { file: filePath }, quiet())).rejects.toThrow('task-3 is not under epic-1');
      await expect(discardCommand('task-3', { file: filePath }, quiet())).rejects.toThrow('task-3 is not under epic-1');
      await expect(reviewCommand('task-3', { file: filePath }, quiet())).rejects.toThrow('task-3 is not under epic-1');
    });
    expect(recordOf('task-1')).toMatchObject({ by: 'lead' });
    expect(recordOf('task-3')).toBeNull();
  });
});

describe('leads (task-83): an epic handed off from the CLI and MCP', () => {
  const leadOf = (id: string) => readLeadRecord(found(id)!.doc.task as never);

  test('dispatch queues a lead on the epic; status, pause, resume and stop reach it through its record', async () => {
    gitBoard({ 'epic-1': ['type: epic'], 'task-1': ['parentId: epic-1'], 'task-2': ['parentId: epic-1'] });
    const report = await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: AGENT, model: 'm1' });
    expect(report.said).toBe(`Queued a lead for epic-1: Fake (m1) checks the plan, then hands off its children in order.\n${NO_RUNNER}`);
    expect(leadOf('epic-1')).toMatchObject({ agent: AGENT, model: 'm1', role: 'lead', by: 'cli', until: 'review' });
    const again = await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: AGENT });
    expect(again.skipped).toEqual([{ task: 'epic-1', why: 'it already has a lead, waiting for a runner' }]);

    const status = await statusReport(filePath);
    expect(status.leads).toEqual([{ epic: 'epic-1', agent: AGENT, model: 'm1', state: 'waiting', until: 'review', by: 'cli', at: expect.any(String) }]);
    // A worker's queue never shows a lead's request.
    expect(status.queued).toEqual([]);
    expect(statusText(status)).toContain(`epic-1 · ${AGENT} (m1) · waiting for a runner`);

    const paused = await leadReport(filePath, 'epic-1', 'pause');
    expect(paused).toEqual({ epic: 'epic-1', state: 'paused', said: "Paused epic-1's lead: it hands off nothing until resumed; what is running goes on." });
    expect((await statusReport(filePath)).leads[0].state).toBe('paused');
    const resumed = await leadReport(filePath, 'epic-1', 'resume');
    expect(resumed).toMatchObject({ state: 'waiting', said: expect.stringMatching(/^epic-1's lead waits for a runner to take it up\. Run `brainfile run` or open Brainfile to take it up\.$/) });
    await expect(leadReport(filePath, 'task-1', 'pause')).rejects.toThrow('task-1 has no lead');

    const stopped = await stopReport(filePath, 'epic-1');
    expect(stopped).toMatchObject({ run: 'epic-1', stopped: true, said: "Stopped epic-1's lead. What it handed off goes on, and is yours now." });
    expect(leadOf('epic-1')).toBeNull();
    expect(found('epic-1')!.doc.task.dispatch).toBeUndefined();
  });

  test("in a led tree the chat is refused, a lead holds to its rules, and a lead never leads; the person's own goes", async () => {
    gitBoard({
      'epic-1': ['type: epic'],
      'task-1': ['parentId: epic-1'],
      'task-2': ['parentId: epic-1', 'contract:\n  status: draft\n  deliverables: []'],
      'epic-2': ['type: epic', 'parentId: epic-1'],
      'task-3': ['parentId: epic-2'],
    });
    await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: AGENT });
    const chat = await dispatchReport(filePath, { ids: ['task-1'] }, { agent: AGENT }, { access: { role: 'chat' } });
    expect(chat.skipped).toEqual([{ task: 'task-1', why: "epic-1's lead runs that tree: only the lead hands off its children. Pause or stop it first" }]);
    const nested = await dispatchReport(filePath, { ids: ['epic-2'] }, { agent: AGENT });
    expect(nested.skipped).toEqual([{ task: 'epic-2', why: "epic-1's lead runs it" }]);

    const lead = await dispatchReport(filePath, { ids: ['task-1', 'task-2', 'epic-2'] }, { agent: AGENT }, { kind: 'mcp', access: { role: 'lead', scope: 'epic-1' } });
    expect(lead.queued).toEqual([{ task: 'task-1', agent: AGENT }]);
    expect(lead.skipped).toEqual([
      { task: 'epic-2', why: 'epic-2 has children of its own: hand those off instead' },
      { task: 'task-2', why: "task-2's contract is a draft: it waits for the person to make it ready. Say so in your reply." },
    ]);
    expect(recordOf('task-1')).toMatchObject({ by: 'lead' });

    const person = await dispatchReport(filePath, { ids: ['task-2'] }, { agent: AGENT });
    expect(person.queued).toEqual([{ task: 'task-2', agent: AGENT }]);
  });

  test("MCP: dispatch_lead pauses and resumes; a worker's server has none", async () => {
    gitBoard({ 'epic-1': ['type: epic'], 'task-1': ['parentId: epic-1'] });
    await dispatchReport(filePath, { ids: ['epic-1'] }, { agent: AGENT });
    const client = await WireClient.open(filePath, 'modern', {});
    clients.push(client);
    const paused = await client.callTool('dispatch_lead', { epic: 'epic-1', action: 'pause' });
    expect(paused.isError).toBeFalsy();
    expect(paused.structuredContent).toMatchObject({ epic: 'epic-1', state: 'paused' });
    expect(leadOf('epic-1')?.paused).toBeTruthy();
    const stopped = await client.callTool('dispatch_stop', { run: 'epic-1' });
    expect(stopped.structuredContent).toMatchObject({ run: 'epic-1', stopped: true });

    const worker = await WireClient.open(filePath, 'modern', { role: 'worker' });
    clients.push(worker);
    expect((await worker.listTools()).map((t) => t.name)).not.toContain('dispatch_lead');
  });
});
