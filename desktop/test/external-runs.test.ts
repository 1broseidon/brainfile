/**
 * Runs started outside the window (task-84): a runner in another process
 * (core's Runner, as `brainfile run` has it, claiming as another live pid)
 * writes its run file; the host's watch says so, the window's runner reads
 * it, and external.ts shows it as a run marked `in a terminal`, with its ask
 * in the band. Answering it writes `<run-id>.answer.json`, which that runner
 * applies, taking its own prompt down; its end reaches the window too.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bundled } from './bundle.ts';
import type { AgentEvent, AgentRun, BoardSnapshot, PermissionAsk, Result } from '../src/shared/api.ts';

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));
const { ExternalRuns } = bundled<typeof import('../src/agents/external.ts')>('src/agents/external.ts');
const dispatch = bundled<typeof import('@brainfile/core/dispatch')>('../core/src/dispatch/index.ts');
const repo = bundled<typeof import('@brainfile/core/repo')>('../core/src/repo/index.ts');

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile');
/** Another live process on this machine: the terminal's runner claims as it. */
const TERMINAL_PID = process.ppid;

let base: string;
let project: string;
let dotDir: string;
const runs: string[] = [];
const runners: { close(): void }[] = [];

before(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-external-')));
  project = path.join(base, 'repo');
  dotDir = path.join(project, '.brainfile');
  fs.mkdirSync(path.join(base, 'data'));
  fs.cpSync(FIXTURE, dotDir, { recursive: true });
  host.onRuns((projectId) => runs.push(projectId));
});

after(async () => {
  for (const runner of runners) runner.close();
  await host.call('closeBoard', project);
  fs.rmSync(base, { recursive: true, force: true });
});

async function until<T>(what: string, check: () => T | undefined | null | false, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function runner(options: Partial<import('@brainfile/core/dispatch').RunnerOptions> = {}) {
  const made = new dispatch.Runner({ dataDir: path.join(base, 'data'), runner: 'desktop', ask: async () => null, watchMs: 50, ...options });
  runners.push(made);
  return made;
}

/** The host's watch said the board's runs changed since `from`, debounced. */
async function told(from: number): Promise<void> {
  await until('the host to say the runs changed', () => runs.slice(from).includes(project));
}

test('a run from a terminal shows as a run, its ask is answered from the band through an answer file, and it ends', async () => {
  const opened = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(opened.ok);

  // The terminal: `brainfile run`, its prompt standing in as an ask that never answers itself.
  const prompts: PermissionAsk[] = [];
  const takenDown: string[] = [];
  const terminal = runner({ runner: 'cli', pid: TERMINAL_PID, ask: (ask) => (prompts.push(ask), new Promise(() => {})), cancelAsk: (id) => takenDown.push(id) });
  // The window.
  const window = runner();
  const events: AgentEvent[] = [];
  const external = new ExternalRuns({
    others: (projectId) => window.others(projectId),
    answer: (runId, askId, optionId, projectId) => window.answerAsk(runId, askId, optionId, projectId),
    emit: (event) => events.push(event),
  });
  const said = (kind: AgentEvent['kind']) => events.filter((e) => e.kind === kind);
  const runEvents = () => said('run').map((e) => (e as { run: AgentRun }).run);

  let mark = runs.length;
  const run = terminal.newRun(project, 'codex', 'dispatch', 'task-2', { model: 'gpt-5' });
  terminal.update(run, { state: 'working', activity: 'editing' });
  await told(mark);
  external.look(project);
  const shown = runEvents().at(-1)!;
  assert.equal(shown.id, run.id);
  assert.equal(shown.taskId, 'task-2');
  assert.equal(shown.activity, 'editing');
  assert.equal(shown.where, 'in a terminal');
  assert.deepEqual(external.list().map((r) => r.id), [run.id]);
  // Core's runner counts it busy for the window: Merge and Hand to… wait on it.
  assert.equal(window.liveDispatch(project, 'task-2')?.id, run.id);
  assert.match(window.busy(project, 'task-2') ?? '', /still working on task-2/);

  // Nothing changed: nothing more is said.
  const before = events.length;
  external.look(project);
  assert.equal(events.length, before);

  // It asks, at the terminal; the band shows it too, saying where it waits.
  mark = runs.length;
  const answered = terminal.ctx.ask({
    id: 'ask-1',
    runId: run.id,
    projectId: project,
    agentId: 'codex',
    title: 'Run make test',
    kind: 'execute',
    options: [
      { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
      { optionId: 'no', name: 'Reject', kind: 'reject_once' },
    ],
  });
  await told(mark);
  external.look(project);
  const ask = (said('permission').at(-1) as { ask: PermissionAsk }).ask;
  assert.equal(ask.id, `${run.id}/ask-1`, 'every runner counts its asks from 1, so the run names it');
  assert.equal(ask.where, 'in a terminal');
  assert.equal(ask.title, 'Run make test');
  assert.deepEqual(external.asks().map((a) => a.id), [ask.id]);
  assert.equal(prompts.length, 1);

  // Allow, in the band: the answer file, the band's ask taken down at once.
  assert.deepEqual(external.answer(ask.id, 'yes'), { ok: true, value: undefined });
  assert.deepEqual(said('permission-done').at(-1), { kind: 'permission-done', id: ask.id });
  assert.deepEqual(external.asks(), []);
  // Read again before the terminal applies it: not put up a second time.
  const permissions = said('permission').length;
  external.look(project);
  assert.equal(said('permission').length, permissions);

  // The terminal's runner applies it and takes its own prompt down.
  assert.equal(await answered, 'yes');
  assert.deepEqual(takenDown, ['ask-1']);
  assert.equal(fs.existsSync(repo.runAnswerPath(dotDir, run.id)), false);
  await until('the ask to leave the run file', () => !repo.readRunFile(dotDir, run.id)?.ask);

  // It ends: the window hears it ended, as its own runs end (Ready to merge is asked again).
  mark = runs.length;
  terminal.update(run, { state: 'done', reply: 'Did task-2', endedAt: Date.now() });
  await told(mark);
  external.look(project);
  const ended = runEvents().at(-1)!;
  assert.equal(ended.state, 'done');
  assert.equal(ended.reply, 'Did task-2');
  assert.ok(ended.endedAt);
  assert.equal(window.liveDispatch(project, 'task-2'), undefined);
  assert.deepEqual(external.going(), []);
  assert.deepEqual(external.answer(ask.id, 'no'), { ok: false, error: 'That ask has gone' });
});

test('a run whose runner went away is said as failed; a stop from the window reaches a live one through its file', async () => {
  // The stop's SIGTERM would go to the pid the run file names, this test's parent: its grace outlasts the test.
  const window = runner({ stopGraceMs: 10 * 60_000 });
  const events: AgentEvent[] = [];
  const external = new ExternalRuns({ others: (p) => window.others(p), answer: (r, a, o, p) => window.answerAsk(r, a, o, p), emit: (e) => events.push(e) });
  const now = Date.now();
  const file = (id: string, fields: object) =>
    repo.writeRunFile(dotDir, { id, kind: 'dispatch', taskId: 'task-1', agent: 'claude', state: 'working', activity: 'running', startedAt: now, host: window.host, pid: TERMINAL_PID, runner: 'mcp', beatAt: now, projectId: project, ...fields });
  file('run-gone', { pid: 2 ** 22 + 4321 });
  file('run-going', {});
  external.look(project);
  const byId = Object.fromEntries(external.list().map((r) => [r.id, r]));
  assert.equal(byId['run-gone'].state, 'failed');
  assert.match(byId['run-gone'].error ?? '', /runner went away/);
  assert.equal(byId['run-going'].state, 'working');
  assert.equal(byId['run-going'].where, 'from an MCP client');
  assert.equal(external.projectOf('run-going'), project);
  assert.deepEqual(external.going(), [project]);

  assert.deepEqual(await window.stop('run-going', external.projectOf('run-going')), { ok: true, value: undefined });
  assert.equal(repo.readRunFile(dotDir, 'run-going')?.stop, true);
  file('run-going', { state: 'stopped', endedAt: Date.now(), stop: true });
  external.look(project);
  assert.equal(external.list().find((r) => r.id === 'run-going')?.state, 'stopped');
  assert.deepEqual(external.going(), []);
});
