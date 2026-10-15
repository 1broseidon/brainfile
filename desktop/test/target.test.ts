/**
 * Where a hand-off lands (decision-16), as the window sees it: the host puts
 * each task's target on its view, its own landsOn or inherited up the tree,
 * an epic's own branch under an epic with epicBranch; patchTask writes and
 * clears both. And Hand to…'s choice, in the real window state: what the
 * task would inherit anyway is written as nothing, the trunk as its name.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { build, transformSync } from 'esbuild';
import { compileModule } from 'svelte/compiler';
import { bundled } from './bundle.ts';
import type { Api, BoardSnapshot, Result, TaskView } from '../src/shared/api.ts';
import type * as State from '../src/renderer/lib/state.svelte.ts';

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile');
let project: string;

before(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-target-'));
  fs.cpSync(FIXTURE, path.join(project, '.brainfile'), { recursive: true });
});

after(async () => {
  await host.call('closeBoard', project);
  fs.rmSync(project, { recursive: true, force: true });
});

const view = async (id: string): Promise<TaskView> => {
  const board = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(board.ok);
  return board.value.tasks.find((t) => t.id === id)!;
};

test('a task lands on the trunk until it, or what it is under, names a branch; an epic with its own branch is its children\'s', async () => {
  assert.equal((await view('task-2')).target, undefined);

  const set = await host.call<Result>('patchTask', project, 'epic-1', { landsOn: 'release/0.38.0' });
  assert.ok(set.ok);
  assert.equal((await view('epic-1')).landsOn, 'release/0.38.0');
  assert.deepEqual((await view('task-2')).target, { branch: 'release/0.38.0', from: 'epic-1', epicBranch: false });
  assert.equal((await view('task-2')).landsOn, undefined);

  await host.call<Result>('patchTask', project, 'epic-1', { epicBranch: true });
  assert.equal((await view('epic-1')).epicBranch, true);
  assert.deepEqual((await view('task-2')).target, { branch: 'dispatch/epic-1', from: 'epic-1', epicBranch: true });
  // The epic itself lands on its own target.
  assert.deepEqual((await view('epic-1')).target, { branch: 'release/0.38.0', from: 'epic-1', epicBranch: false });

  const refused = await host.call<Result>('patchTask', project, 'task-2', { landsOn: 'two words' });
  assert.ok(!refused.ok);
  assert.match(refused.error, /not a branch name/);

  await host.call<Result>('patchTask', project, 'epic-1', { landsOn: null, epicBranch: null });
  assert.equal((await view('task-2')).target, undefined);
  assert.equal((await view('epic-1')).epicBranch, undefined);
});

/** The window's state, bundled as the window runs it, over a recording bridge. */
async function windowState(t: import('node:test').TestContext, patches: Parameters<Api['patchTask']>[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-target-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, 'state.cjs');
  await build({
    entryPoints: [path.resolve(import.meta.dirname, '../src/renderer/lib/state.svelte.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    conditions: ['browser'],
    format: 'cjs',
    plugins: [
      {
        name: 'svelte-state',
        setup(build) {
          build.onLoad({ filter: /\.svelte\.ts$/ }, ({ path: filename }) => {
            const source = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts' }).code;
            return { contents: compileModule(source, { filename, generate: 'client' }).js.code };
          });
        },
      },
    ],
  });
  const stored = new Map<string, string>();
  for (const [name, value] of Object.entries({
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
    window: {
      brainfile: {
        patchTask: async (...args: Parameters<Api['patchTask']>) => {
          patches.push(args);
          return { ok: true };
        },
        branches: async () => ({ ok: true, value: { trunk: 'main', local: ['main', 'release'], remote: [], recent: [] } }),
      },
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return (createRequire(import.meta.url)(outfile) as typeof State).app;
}

test('Hand to…\'s Lands on writes the task\'s own choice, and only that', async (t) => {
  const patches: Parameters<Api['patchTask']>[] = [];
  const app = await windowState(t, patches);
  const task = (id: string, extra: Partial<TaskView> = {}) => ({ id, title: id, column: 'todo', role: 'task', glyph: '', ...extra }) as TaskView;
  app.boards = {
    project: {
      projectId: 'project',
      tasks: [
        task('epic-1', { role: 'epic', landsOn: 'release', target: { branch: 'release', from: 'epic-1', epicBranch: false } }),
        task('task-1', { parentId: 'epic-1', target: { branch: 'release', from: 'epic-1', epicBranch: false } }),
        task('task-2'),
        task('epic-2', { role: 'epic', epicBranch: true }),
        task('task-3', { parentId: 'epic-2', target: { branch: 'dispatch/epic-2', from: 'epic-2', epicBranch: true } }),
      ],
      completed: [],
    } as unknown as BoardSnapshot,
  };
  app.activeId = 'project';
  await app.refreshBranches();

  // What it inherits anyway is nothing to write; the trunk, against its parent's release line, is written by name.
  await app.setLandsOn('task-1', 'release');
  assert.deepEqual(patches, []);
  await app.setLandsOn('task-1', null);
  assert.deepEqual(patches.at(-1), ['project', 'task-1', { landsOn: 'main' }]);
  // A task under nothing: another branch is written, the trunk clears it.
  await app.setLandsOn('task-2', 'release');
  assert.deepEqual(patches.at(-1), ['project', 'task-2', { landsOn: 'release' }]);
  await app.setLandsOn('task-2', null);
  assert.deepEqual(patches.at(-1), ['project', 'task-2', { landsOn: null }]);
  // Under an epic with its own branch, that branch is the inherited one.
  const before = patches.length;
  await app.setLandsOn('task-3', 'dispatch/epic-2');
  assert.equal(patches.length, before);
  await app.setLandsOn('task-3', 'release');
  assert.deepEqual(patches.at(-1), ['project', 'task-3', { landsOn: 'release' }]);
});
