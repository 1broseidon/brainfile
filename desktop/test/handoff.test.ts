import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { build, transformSync } from 'esbuild';
import { compileModule } from 'svelte/compiler';
import type { AgentId, Api } from '../src/shared/api.ts';
import type * as State from '../src/renderer/lib/state.svelte.ts';

/** Exercise the real reactive window state with a recording IPC bridge. */
test('hand-offs keep chat backend, model and effort preferences separate', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-handoff-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outfile = path.join(dir, 'state.cjs');
  await build({
    entryPoints: [path.resolve(import.meta.dirname, '../src/renderer/lib/state.svelte.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    conditions: ['browser'],
    format: 'cjs',
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

  for (const handedTo of ['claude', 'codex'] as AgentId[]) {
    await t.test(`hand to ${handedTo} from a Codex chat`, async (t) => {
      const stored = new Map<string, string>();
      const dispatches: Parameters<Api['dispatch']>[] = [];
      const asks: Parameters<Api['ask']>[] = [];
      const patches: Parameters<Api['patchTask']>[] = [];
      for (const [name, value] of Object.entries({
        localStorage: {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => stored.set(key, value),
        },
        window: { brainfile: {
          patchTask: async (...args: Parameters<Api['patchTask']>) => { patches.push(args); return { ok: true }; },
          dispatch: async (...args: Parameters<Api['dispatch']>) => { dispatches.push(args); return { ok: true }; },
          ask: async (...args: Parameters<Api['ask']>) => { asks.push(args); return { ok: true, value: { id: 'chat-run' } }; },
        } },
      })) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
          if (original) Object.defineProperty(globalThis, name, original);
          else Reflect.deleteProperty(globalThis, name);
        });
      }
      const require = createRequire(import.meta.url);
      const instance = path.join(dir, `${handedTo}.cjs`);
      fs.copyFileSync(outfile, instance);
      const { app } = require(instance) as typeof State;
      app.activeId = 'project';
      app.agents = [
        { id: 'codex', name: 'Codex', available: true },
        { id: 'claude', name: 'Claude', available: true },
      ];
      app.chooseModel('codex', 'gpt-chat', 'medium');
      app.chooseModel('claude', 'opus-task', 'high');
      await app.askBoard('Before handing off', 'codex');
      const preferences = JSON.stringify(app.prefs);
      const savedPreferences = new Map(stored);
      const model = app.modelFor('codex');
      const effort = app.effortFor('codex');

      await app.dispatch('task-67', handedTo);

      assert.deepEqual(patches, [['project', 'task-67', { assignee: handedTo }]]);
      assert.deepEqual(dispatches, [[
        'project', 'task-67', handedTo,
        handedTo === 'claude' ? 'opus-task' : 'gpt-chat',
        handedTo === 'claude' ? 'high' : 'medium',
      ]]);
      assert.equal(app.defaultAgent, 'codex');
      assert.equal(app.lastAgent, 'codex');
      assert.equal(app.modelFor('codex'), model);
      assert.equal(app.effortFor('codex'), effort);
      assert.equal(JSON.stringify(app.prefs), preferences);
      for (const key of ['brainfile.lastAgent', 'brainfile.projectPrefs', 'brainfile.models', 'brainfile.efforts']) {
        assert.equal(stored.get(key), savedPreferences.get(key), key);
      }

      await app.askBoard('After handing off', app.defaultAgent!);
      assert.equal(asks.length, 2);
      assert.equal(asks[1][1], 'codex');
      assert.equal(asks[1][4], model);
      assert.equal(asks[1][8], effort);
      assert.equal(asks[1][3], asks[0][3], 'continue the original chat thread');
    });
  }
});
