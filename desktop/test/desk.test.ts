/**
 * The desk (spec-16): the chat's dispatch tools, over the socket the agents
 * process listens on. A token is required, the board is the token's and
 * never the caller's, an unknown task is refused, and stop stops. The stdio
 * MCP server is bundled and spoken to as an agent would.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { buildSync } from 'esbuild';
import { DeskBridge, callDesk, deskTools, type DeskDeps, type DeskGrant } from '../src/agents/desk.ts';
import type { AgentId, AgentRun } from '../src/shared/api.ts';

const HERE = '/repos/here';
const THERE = '/repos/there';

/** Two boards: task-1 here, task-9 only there. */
const BOARDS: Record<string, Record<string, string>> = {
  [HERE]: { 'task-1': 'Write a hello file', 'task-2': 'Second' },
  [THERE]: { 'task-9': 'Elsewhere' },
};

let base: string;
let bridge: DeskBridge;
let runs: AgentRun[];
let started: { projectId: string; taskId: string; agentId: AgentId; model?: string; effort?: string }[];
let stopped: string[];
let nextRun: number;

const grantHere: DeskGrant = { projectId: HERE, agentId: 'claude', model: 'opus', models: { codex: 'gpt-5.5' }, key: 'ask:t-1:claude:opus' };

/** The known agents and one of the person's own (task-47). */
const AGENTS: { id: AgentId; name: string }[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'grok', name: 'Grok Build' },
  { id: 'custom:Muse Code', name: 'Muse Code' },
];

function deps(): DeskDeps {
  return {
    agents: () => AGENTS,
    findTask: (projectId, taskId) => (BOARDS[projectId]?.[taskId] ? { title: BOARDS[projectId][taskId] } : null),
    unavailable: (agentId) => (agentId === 'grok' ? 'Grok Build is not installed on this Mac' : null),
    async start(grant, taskId, agentId, model, effort) {
      started.push({ projectId: grant.projectId, taskId, agentId, model, ...(effort ? { effort } : {}) });
      const run: AgentRun = {
        id: `run-${nextRun++}`,
        projectId: grant.projectId,
        agentId,
        kind: 'dispatch',
        taskId,
        ...(model ? { model } : {}),
        state: 'working',
        activity: 'thinking',
        startedAt: Date.now(),
      };
      runs.push(run);
      return { ok: true, value: { run, branch: `dispatch/${taskId}` } };
    },
    runs: () => runs,
    async stop(runId) {
      stopped.push(runId);
      const run = runs.find((r) => r.id === runId);
      if (run) Object.assign(run, { state: 'stopped', endedAt: Date.now() });
    },
  };
}

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-desk-')));
  runs = [];
  started = [];
  stopped = [];
  nextRun = 1;
  bridge = new DeskBridge(deskTools(deps()), path.join(base, 'desk.sock'));
  await bridge.listen();
});

afterEach(() => {
  bridge.close();
  fs.rmSync(base, { recursive: true, force: true });
});

test('the socket is the person’s alone', () => {
  assert.equal(fs.statSync(bridge.socketPath).mode & 0o777, 0o600);
});

test('a call without a token the desk minted is refused, and nothing starts', async () => {
  bridge.grant(grantHere);
  for (const token of ['', 'guess', 'a'.repeat(48)]) {
    const result = await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1' } });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : '', /Not allowed/);
  }
  const garbled = await callDesk(bridge.socketPath, { tool: 'runs' } as never);
  assert.equal(garbled.ok, false);
  assert.equal(started.length, 0);
});

test('a revoked token stops working', async () => {
  const token = bridge.grant(grantHere);
  assert.equal((await callDesk(bridge.socketPath, { token, tool: 'runs' })).ok, true);
  bridge.revoke(token);
  const result = await callDesk(bridge.socketPath, { token, tool: 'runs' });
  assert.equal(result.ok, false);
});

test('the board is the token’s: another board named is refused, and an argument cannot move it', async () => {
  const token = bridge.grant(grantHere);
  const elsewhere = await callDesk(bridge.socketPath, { token, project: THERE, tool: 'dispatch', args: { taskId: 'task-9' } });
  assert.equal(elsewhere.ok, false);
  assert.match(!elsewhere.ok ? elsewhere.error : '', /another board/);
  // A project slipped into the arguments is ignored: task-9 is not on this board.
  const slipped = await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-9', projectId: THERE } });
  assert.equal(slipped.ok, false);
  const here = await callDesk(bridge.socketPath, { token, project: HERE, tool: 'dispatch', args: { taskId: 'task-1', projectId: THERE } });
  assert.equal(here.ok, true);
  assert.deepEqual(started.map((s) => s.projectId), [HERE]);
});

test('an unknown task, a malformed ID, an unknown or missing agent are refused', async () => {
  const token = bridge.grant(grantHere);
  const call = (args: Record<string, unknown>) => callDesk(bridge.socketPath, { token, tool: 'dispatch', args });
  const unknown = await call({ taskId: 'task-404' });
  assert.match(!unknown.ok ? unknown.error : '', /task-404 is not an open task on this board/);
  assert.equal((await call({ taskId: '../../etc' })).ok, false);
  assert.equal((await call({})).ok, false);
  const agent = await call({ taskId: 'task-1', agent: 'gpt' });
  assert.match(!agent.ok ? agent.error : '', /Unknown agent gpt/);
  const missing = await call({ taskId: 'task-1', agent: 'grok' });
  assert.match(!missing.ok ? missing.error : '', /not installed/);
  assert.equal(started.length, 0);
});

test('a hand-off takes the selector’s effort with its model; a model named in the call does not', async () => {
  const token = bridge.grant({ ...grantHere, effort: 'high', efforts: { codex: 'xhigh' } });
  const call = (args: Record<string, unknown>) => callDesk(bridge.socketPath, { token, tool: 'dispatch', args });
  const own = await call({ taskId: 'task-1' });
  assert.match(own.ok ? own.value : '', /to claude \(opus, high\)/);
  await call({ taskId: 'task-2', agent: 'codex', model: 'gpt-5.5-mini' });
  assert.deepEqual(started, [
    { projectId: HERE, taskId: 'task-1', agentId: 'claude', model: 'opus', effort: 'high' },
    { projectId: HERE, taskId: 'task-2', agentId: 'codex', model: 'gpt-5.5-mini' },
  ]);
});

test('another agent takes the effort chosen for it on this board', async () => {
  const token = bridge.grant({ ...grantHere, efforts: { codex: 'xhigh' } });
  const result = await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-2', agent: 'codex' } });
  assert.equal(result.ok, true);
  assert.equal(started[0].model, 'gpt-5.5');
  assert.equal(started[0].effort, 'xhigh');
});

test('with no agent named it is the chat’s own, and its model; another agent takes the person’s model for it', async () => {
  const token = bridge.grant(grantHere);
  const call = (args: Record<string, unknown>) => callDesk(bridge.socketPath, { token, tool: 'dispatch', args });
  const own = await call({ taskId: 'task-1' });
  assert.equal(own.ok, true);
  assert.match(own.ok ? own.value : '', /Handed task-1 \("Write a hello file"\) to claude \(opus\).*dispatch\/task-1/);
  await call({ taskId: 'task-2', agent: 'Codex' });
  assert.deepEqual(started, [
    { projectId: HERE, taskId: 'task-1', agentId: 'claude', model: 'opus' },
    { projectId: HERE, taskId: 'task-2', agentId: 'codex', model: 'gpt-5.5' },
  ]);
});

test('a custom agent is named by its ID, or by its name in any case, and takes the person’s model for it', async () => {
  const token = bridge.grant({ ...grantHere, models: { 'custom:Muse Code': 'muse-large' } });
  const call = (args: Record<string, unknown>) => callDesk(bridge.socketPath, { token, tool: 'dispatch', args });
  const byId = await call({ taskId: 'task-1', agent: 'custom:Muse Code' });
  assert.match(byId.ok ? byId.value : '', /to custom:Muse Code \(muse-large\)/);
  assert.equal((await call({ taskId: 'task-2', agent: 'muse code' })).ok, true);
  assert.deepEqual(
    started.map((s) => [s.agentId, s.model]),
    [
      ['custom:Muse Code', 'muse-large'],
      ['custom:Muse Code', 'muse-large'],
    ]
  );
  // A known agent is found by its name too, and still refused when it is not installed.
  const grok = await call({ taskId: 'task-1', agent: 'Grok Build' });
  assert.match(!grok.ok ? grok.error : '', /already working|not installed/);
  const unknown = await call({ taskId: 'task-1', agent: 'custom:Nobody' });
  assert.match(!unknown.ok ? unknown.error : '', /Unknown agent custom:Nobody: use one of .*custom:Muse Code/);
});

test('a named model wins, and an agent with no choice here gets its own default', async () => {
  const token = bridge.grant({ ...grantHere, models: {} });
  await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1', agent: 'codex' } });
  await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-2', agent: 'claude', model: 'sonnet' } });
  assert.deepEqual(
    started.map((s) => [s.agentId, s.model]),
    [
      ['codex', undefined],
      ['claude', 'sonnet'],
    ]
  );
});

test('a turn brings the person’s current model choices', async () => {
  const token = bridge.grant({ ...grantHere, models: {} });
  bridge.update(token, { models: { codex: 'gpt-5.5-mini' } });
  await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1', agent: 'codex' } });
  assert.equal(started[0].model, 'gpt-5.5-mini');
});

test('a task already being worked on is not handed off twice', async () => {
  const token = bridge.grant(grantHere);
  assert.equal((await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1' } })).ok, true);
  const again = await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1', agent: 'codex' } });
  assert.match(!again.ok ? again.error : '', /claude is already working on task-1/);
  assert.equal(started.length, 1);
});

/** Deps whose start waits, as the real one waits on the host's board write, until `go` is called. */
function deferredStart(outcome: () => 'ok' | 'fail' | 'throw') {
  const base = deps();
  const waiting: (() => void)[] = [];
  const tools = deskTools({
    ...base,
    async start(grant, taskId, agentId, model, effort) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      const how = outcome();
      if (how === 'throw') throw new Error('host went away');
      if (how === 'fail') return { ok: false, error: 'worktree could not be made' };
      return base.start(grant, taskId, agentId, model, effort);
    },
  });
  return { tools, go: () => waiting.splice(0).forEach((resolve) => resolve()), waiting: () => waiting.length };
}

test('two dispatches that overlap the start are not both let through to one task', async () => {
  const { tools, go, waiting } = deferredStart(() => 'ok');
  const first = tools.call(grantHere, 'dispatch', { taskId: 'task-1' });
  const second = tools.call(grantHere, 'dispatch', { taskId: 'task-1', agent: 'codex' });
  // Another task on the board is not held up.
  const other = tools.call(grantHere, 'dispatch', { taskId: 'task-2' });
  assert.equal(waiting(), 2);
  go();
  const [a, b, c] = await Promise.all([first, second, other]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.match(!b.ok ? b.error : '', /already starting on task-1/);
  assert.equal(c.ok, true);
  assert.deepEqual(started.map((s) => s.taskId), ['task-1', 'task-2']);
});

test('a start that fails or throws lets go of the task', async () => {
  for (const how of ['fail', 'throw'] as const) {
    let next: 'ok' | 'fail' | 'throw' = how;
    const { tools, go } = deferredStart(() => next);
    const failing = Promise.resolve(tools.call(grantHere, 'dispatch', { taskId: 'task-1' })).catch((err: Error) => ({ ok: false, error: err.message }));
    go();
    const failed = await failing;
    assert.equal(failed.ok, false);
    next = 'ok';
    const retry = tools.call(grantHere, 'dispatch', { taskId: 'task-1' });
    go();
    assert.equal((await retry).ok, true, `after a start that went ${how}`);
    runs.length = 0;
    started.length = 0;
  }
});

test('stop stops the hand-off on this board, and only on this board', async () => {
  const token = bridge.grant(grantHere);
  const there = bridge.grant({ ...grantHere, projectId: THERE });
  await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1', agent: 'codex' } });
  const nothing = await callDesk(bridge.socketPath, { token, tool: 'stop', args: { taskId: 'task-2' } });
  assert.match(!nothing.ok ? nothing.error : '', /Nothing is running on task-2/);
  const fromThere = await callDesk(bridge.socketPath, { token: there, tool: 'stop', args: { taskId: 'task-1' } });
  assert.equal(fromThere.ok, false);
  assert.deepEqual(stopped, []);
  const stop = await callDesk(bridge.socketPath, { token, tool: 'stop', args: { taskId: 'task-1' } });
  assert.match(stop.ok ? stop.value : '', /Stopped codex on task-1/);
  assert.deepEqual(stopped, ['run-1']);
  // Once stopped it can be handed off again.
  assert.equal((await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1' } })).ok, true);
});

test('runs says what is running on this Mac, and what finished on this board', async () => {
  const token = bridge.grant(grantHere);
  assert.match(((await callDesk(bridge.socketPath, { token, tool: 'runs' })) as { value: string }).value, /Nothing has been handed off/);
  runs.push({ id: 'run-x', projectId: THERE, agentId: 'cursor', kind: 'dispatch', taskId: 'task-9', state: 'waiting', activity: 'editing', startedAt: Date.now() });
  runs.push({ id: 'run-a', projectId: HERE, agentId: 'claude', kind: 'ask', state: 'working', activity: 'thinking', startedAt: Date.now() });
  await callDesk(bridge.socketPath, { token, tool: 'dispatch', args: { taskId: 'task-1', agent: 'codex' } });
  await callDesk(bridge.socketPath, { token, tool: 'stop', args: { taskId: 'task-1' } });
  const result = await callDesk(bridge.socketPath, { token, tool: 'runs' });
  assert.ok(result.ok);
  assert.match(result.value, /Running on this Mac:\n- task-9 · cursor · waiting, editing · there/);
  assert.match(result.value, /Finished on this board:\n- task-1 · codex \(gpt-5\.5\) · stopped · this board/);
  // The chat's own turns are not hand-offs.
  assert.equal(result.value.split('\n').filter((l) => l.startsWith('- ')).length, 2);
});

test('an unknown tool is refused', async () => {
  const token = bridge.grant(grantHere);
  const result = await callDesk(bridge.socketPath, { token, tool: 'merge' });
  assert.match(!result.ok ? result.error : '', /Unknown tool merge/);
});

test('the stdio MCP server lists the tools and passes a call through with its token and board', async () => {
  const token = bridge.grant(grantHere);
  const script = path.join(base, 'desk-mcp.js');
  buildSync({ entryPoints: [path.join(import.meta.dirname, '..', 'src', 'agents', 'desk-mcp.ts')], outfile: script, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      BRAINFILE_DESK_SOCKET: bridge.socketPath,
      BRAINFILE_DESK_TOKEN: token,
      BRAINFILE_DESK_PROJECT: HERE,
      BRAINFILE_DESK_AGENTS: JSON.stringify(AGENTS.map((a) => a.id)),
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const replies = new Map<number, (value: any) => void>();
  let buffer = '';
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      replies.get(message.id)?.(message);
    }
  });
  let id = 0;
  const request = (method: string, params: object = {}) =>
    new Promise<any>((resolve) => {
      const n = ++id;
      replies.set(n, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
    });

  const init = await request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'desk');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const list = await request('tools/list');
  assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), ['dispatch', 'runs', 'stop']);
  // The person's own agents are offered beside the known ones.
  assert.deepEqual(list.result.tools[0].inputSchema.properties.agent.enum, AGENTS.map((a) => a.id));
  const call = await request('tools/call', { name: 'dispatch', arguments: { taskId: 'task-1', agent: 'codex' } });
  assert.equal(call.result.isError, undefined);
  assert.match(call.result.content[0].text, /Handed task-1/);
  const refused = await request('tools/call', { name: 'dispatch', arguments: { taskId: 'task-9' } });
  assert.equal(refused.result.isError, true);
  const unknown = await request('nope');
  assert.equal(unknown.error.code, -32601);
  assert.deepEqual(started, [{ projectId: HERE, taskId: 'task-1', agentId: 'codex', model: 'gpt-5.5' }]);

  // Closing stdin is the signal to go.
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
  child.stdin.end();
  assert.equal(await exited, 0);
});
