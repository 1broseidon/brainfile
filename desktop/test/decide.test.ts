/**
 * The host's two calls for the phone link (task-40), on the real host over a
 * copy of a board: `decide` records a decision as `brainfile decide` does,
 * through core, superseding the claim key's current one; `sharing` says
 * where a board's refs go, which a plain folder board has nowhere.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bundled } from './bundle.ts';
import type { BoardSnapshot, DecisionView, Result } from '../src/shared/api.ts';

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile');
let project: string;

before(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-decide-'));
  fs.cpSync(FIXTURE, path.join(project, '.brainfile'), { recursive: true });
});

// The host watches an open board; closed, nothing keeps the test running.
after(async () => {
  await host.call('closeBoard', project);
  fs.rmSync(project, { recursive: true, force: true });
});

const decide = (input: Record<string, unknown>) => host.call<Result<DecisionView>>('decide', project, input);

test('decide supersedes the claim key’s current decision, as brainfile decide does', async () => {
  const opened = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(opened.ok);
  assert.deepEqual(opened.value.decisions.map((d) => [d.id, d.status]), [['decision-1', 'current']]);

  const first = await decide({ title: 'Use undici for HTTP', claimKey: 'dependency.http-client', description: 'It ships with Node.' });
  assert.ok(first.ok, !first.ok ? first.error : '');
  assert.equal(first.value.id, 'decision-2');
  assert.equal(first.value.status, 'current');
  assert.equal(first.value.claimKey, 'dependency.http-client');
  assert.equal(first.value.description, 'It ships with Node.');

  const second = await decide({ title: 'Use fetch: it retries now', claimKey: 'dependency.http-client' });
  assert.ok(second.ok);
  assert.equal(second.value.id, 'decision-3');
  assert.deepEqual(second.value.supersedes, ['decision-2']);
  assert.ok(fs.existsSync(path.join(project, '.brainfile', 'logs', 'decision-2.md')), 'the old one moved to logs/');

  const board = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(board.ok);
  const old = board.value.decisions.find((d) => d.id === 'decision-2')!;
  assert.equal(old.status, 'superseded');
  assert.equal(old.supersededBy, 'decision-3');
  // Another family is untouched.
  assert.equal(board.value.decisions.find((d) => d.id === 'decision-1')!.status, 'current');
});

test('the same words again are the current decision, written once', async () => {
  const again = await decide({ title: 'Use fetch: it retries now', claimKey: 'dependency.http-client' });
  assert.ok(again.ok);
  assert.equal(again.value.id, 'decision-3');
  assert.ok(!fs.existsSync(path.join(project, '.brainfile', 'board', 'decision-4.md')));
});

test('a decision needs a title; a claim key is optional and must be dotted words', async () => {
  const loose = await decide({ title: 'Ship the phone on TestFlight first' });
  assert.ok(loose.ok);
  assert.equal(loose.value.claimKey, undefined);
  const bad = await decide({ title: 'x', claimKey: 'not a key!' });
  assert.equal(bad.ok, false);
  const nowhere = await host.call<Result<DecisionView>>('decide', path.join(project, 'missing'), { title: 'x' });
  assert.equal(nowhere.ok, false);
});

test('a plain folder board is shared nowhere', async () => {
  assert.deepEqual(await host.call('sharing', project), { url: null, ref: null });
  assert.deepEqual(await host.call('sharing', path.join(project, 'missing')), { url: null, ref: null });
});
