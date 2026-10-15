/**
 * A hand-off opened as a pull request (decision-16, spec-18): the agents
 * process follows the board's open ones at most once a minute each, and a
 * merged one completes its task; the window lists them apart from what can
 * merge, opens one, and says when the trunk is ahead of origin. The forge,
 * git and the board are fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { build, transformSync } from 'esbuild';
import { compileModule } from 'svelte/compiler';
import { FOLLOW_EVERY_MS, PullRequestWatch, SCAN_EVERY_MS, type Followed, type PullRequestWatchDeps } from '../src/agents/pullRequests.ts';
import type { Api, BoardSnapshot, PullRequestRecord, TaskView } from '../src/shared/api.ts';
import type * as State from '../src/renderer/lib/state.svelte.ts';

function watch(over: Partial<PullRequestWatchDeps> & { states?: Record<string, Followed> } = {}) {
  let now = 1_000_000;
  const asked: string[] = [];
  const settled: string[] = [];
  const said: string[] = [];
  const states = over.states ?? {};
  const deps: PullRequestWatchDeps = {
    open: () => Object.keys(states),
    async follow(_projectId, taskId) {
      asked.push(taskId);
      return { ok: true, value: states[taskId] };
    },
    async settle(_projectId, taskId) {
      settled.push(taskId);
      return { ok: true, value: undefined };
    },
    busy: () => false,
    said: (_projectId, _taskId, text) => said.push(text),
    now: () => now,
    ...over,
  };
  return { watch: new PullRequestWatch(deps), asked, settled, said, later: (ms: number) => (now += ms) };
}

test('each open pull request is asked about at most once a minute, and the board looked through at most every few seconds', async () => {
  const { watch: w, asked, later } = watch({ states: { 'task-1': { state: 'open' }, 'task-2': { state: 'open' } } });
  await w.check('p');
  assert.deepEqual(asked, ['task-1', 'task-2']);
  await w.check('p');
  later(SCAN_EVERY_MS);
  await w.check('p');
  assert.equal(asked.length, 2, 'not again within the minute');
  later(FOLLOW_EVERY_MS);
  await w.check('p');
  assert.deepEqual(asked, ['task-1', 'task-2', 'task-1', 'task-2']);
});

test('merged on the forge, the task is settled as after a Merge, and the lead hears it', async () => {
  const { watch: w, settled, said } = watch({ states: { 'task-1': { state: 'merged', released: true, said: 'gone' }, 'task-2': { state: 'closed' } } });
  await w.check('p');
  assert.deepEqual(settled, ['task-1']);
  assert.deepEqual(said.sort(), ['task-1 landed: its pull request merged on the forge', "task-2's pull request was closed without merging: it is back in Ready to merge"]);
});

test('a worktree kept after the merge is said; a task that will not settle stays open, and says why', async () => {
  const kept = watch({ states: { 'task-1': { state: 'merged', released: false, said: 'dispatch/task-1 has commits the pull request did not carry, so its worktree stays' } } });
  await kept.watch.check('p');
  assert.deepEqual(kept.said, ['task-1 landed: its pull request merged on the forge (dispatch/task-1 has commits the pull request did not carry, so its worktree stays)']);

  const refused = watch({ states: { 'task-1': { state: 'merged', released: true, said: '' } }, settle: async () => ({ ok: false, error: '2 subtasks left' }) });
  await refused.watch.check('p');
  assert.deepEqual(refused.said, ["task-1's pull request merged, but it stays open: 2 subtasks left"]);
});

test('one an agent is at waits; one the forge did not answer is asked again at the next minute', async () => {
  let reachable = false;
  const { watch: w, asked, later } = watch({
    states: { 'task-1': { state: 'open' }, 'task-2': { state: 'open' } },
    busy: (_p, taskId) => taskId === 'task-2',
    follow: async (_p, taskId) => {
      asked.push(taskId);
      return reachable ? { ok: true, value: { state: 'open' } } : { ok: false, error: 'Could not reach GitHub.' };
    },
  });
  await w.check('p');
  assert.deepEqual(asked, ['task-1']);
  reachable = true;
  later(FOLLOW_EVERY_MS);
  await w.check('p');
  assert.deepEqual(asked, ['task-1', 'task-1']);
});

test('a board that cannot be read, or a follow that throws, is let be until the next look', async () => {
  const unreadable = watch({ open: () => { throw new Error('no board'); } });
  await unreadable.watch.check('p');
  const throwing = watch({ states: { 'task-1': { state: 'open' } }, follow: async () => { throw new Error('git refused'); } });
  await throwing.watch.check('p');
  assert.deepEqual(throwing.settled, []);
});

// ── The window ──────────────────────────────────────────────────────────────

const PR: PullRequestRecord = { number: 7, url: 'https://github.com/o/r/pull/7', state: 'open', base: 'main', head: 'dispatch/task-2', at: '2026-10-15T12:00:00.000Z' };

function task(id: string, extra: Partial<TaskView> = {}): TaskView {
  return { id, title: `Task ${id}`, column: 'review', role: 'task', glyph: '', ...extra };
}

async function loadState(t: { after(fn: () => void): void }, brainfile: Partial<Api>): Promise<typeof State> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pr-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, 'state.cjs');
  await build({
    entryPoints: [path.resolve(import.meta.dirname, '../src/renderer/lib/state.svelte.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    conditions: ['browser'],
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'svelte-state',
      setup(build) {
        build.onLoad({ filter: /\.svelte\.ts$/ }, ({ path: filename }) => {
          const source = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts' }).code;
          return { contents: compileModule(source, { filename, generate: 'client' }).js.code };
        });
      },
    }],
  });
  const stored = new Map<string, string>();
  for (const [name, value] of Object.entries({
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, v: string) => stored.set(key, v), removeItem: (key: string) => stored.delete(key) },
    window: { brainfile },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return createRequire(import.meta.url)(outfile) as typeof State;
}

test('the window lists open pull requests apart from what can merge, opens one, and says the trunk ahead of origin', async (t) => {
  const opened: Parameters<Api['openPullRequest']>[] = [];
  let ahead = 0;
  const { app, aheadOfOrigin } = await loadState(t, {
    openPullRequest: async (...args: Parameters<Api['openPullRequest']>) => {
      opened.push(args);
      return { ok: true, value: { ...PR, head: `dispatch/${args[1]}` } };
    },
    readyToMerge: async () => ({ ok: true, value: [{ taskId: 'task-1', into: 'main', ahead: 1, added: 3, removed: 0, conflicts: false }] }),
    unpushed: async () => ({ ok: true, value: { branch: 'main', ahead } }),
  });
  app.projects = [{ id: 'p', name: 'p', path: 'p', state: { status: 'ready' } } as never];
  app.boards = { p: { projectId: 'p', tasks: [task('task-1'), task('task-2', { pullRequest: PR }), task('task-3', { pullRequest: { ...PR, number: 5, state: 'closed' } })], completed: [] } as unknown as BoardSnapshot };
  app.activeId = 'p';

  assert.deepEqual(app.pullRequests.map((p) => [p.taskId, p.pr.number]), [['task-2', 7]]);

  app.forges = { p: null };
  assert.equal(app.canOpenPullRequest(), false, 'only where origin is on GitHub');
  app.forges = { p: { forge: 'github', host: 'github.com', owner: 'o', name: 'r', url: 'https://github.com/o/r' } };
  assert.equal(app.canOpenPullRequest(), true);

  const pr = await app.openPullRequest('task-1');
  assert.deepEqual(opened, [['p', 'task-1']]);
  assert.equal(pr?.number, 7);
  assert.deepEqual(app.openingPullRequest, {});

  ahead = 0;
  app.refreshReady('p', true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(app.unpushed.p, null, 'nothing to say when origin has it all');
  assert.equal(app.waiting.length, 1);
  ahead = 3;
  app.refreshReady('p', true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(app.unpushedLines, [{ projectId: 'p', text: 'main is 3 commits ahead of origin' }]);
  assert.equal(aheadOfOrigin({ branch: 'release/1.0', ahead: 1 }), 'release/1.0 is 1 commit ahead of origin');
});

test('a pull request the forge would not open is said, and nothing is recorded', async (t) => {
  const { app } = await loadState(t, {
    openPullRequest: async () => ({ ok: false, error: 'Opening a pull request needs GitHub credentials.' }),
    readyToMerge: async () => ({ ok: true, value: [] }),
    unpushed: async () => ({ ok: true, value: null }),
  });
  app.activeId = 'p';
  assert.equal(await app.openPullRequest('task-1'), null);
  assert.equal(app.problem, 'Opening a pull request needs GitHub credentials.');
});
