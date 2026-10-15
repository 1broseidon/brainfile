/**
 * The host's `recordDispatch` writes the hand-off through core (task-74), on
 * the real host over a copy of a board: the assignee and core's `dispatch:`
 * record, what core does not know kept, and a claim that still holds left
 * where it is.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bundled } from './bundle.ts';
import type { BoardSnapshot, DispatchRecord, Result } from '../src/shared/api.ts';

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));
const core = bundled<typeof import('@brainfile/core')>('../core/src/index.ts');

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile');
let project: string;
let file: string;

before(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-dispatch-'));
  fs.cpSync(FIXTURE, path.join(project, '.brainfile'), { recursive: true });
  file = path.join(project, '.brainfile', 'board', 'task-2.md');
});

after(async () => {
  await host.call('closeBoard', project);
  fs.rmSync(project, { recursive: true, force: true });
});

const record = (fields: Partial<DispatchRecord> = {}): DispatchRecord => ({ agent: 'codex', model: 'gpt-5', by: 'person', at: '2026-10-15T10:00:00.000Z', ...fields });

test('recordDispatch writes the assignee and core’s record', async () => {
  const opened = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(opened.ok);
  const written = await host.call<Result>('recordDispatch', project, 'task-2', record());
  assert.ok(written.ok, !written.ok ? written.error : '');
  const task = core.readTaskFile(file)!.task;
  assert.equal(task.assignee, 'codex');
  assert.deepEqual(core.readDispatchRecord(task), record());
  assert.deepEqual(task.decisions, ['decision-1']);
});

test('a second request keeps keys core does not know and a claim that holds', async () => {
  const claimed = core.claimDispatchFile(file, { host: core.currentHost(), runner: 'desktop', pid: process.pid, at: '2026-10-15T10:00:01.000Z' });
  assert.ok(claimed.ok);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('  by: person\n', '  by: person\n  x-later: kept\n'), 'utf-8');

  const written = await host.call<Result>('recordDispatch', project, 'task-2', record({ agent: 'claude', model: undefined, by: 'lead' }));
  assert.ok(written.ok);
  const now = core.readDispatchRecord(core.readTaskFile(file)!.task)!;
  assert.equal(now.agent, 'claude');
  assert.equal(now.by, 'lead');
  assert.equal(now.model, undefined, 'the old model goes with the old request');
  assert.equal(now['x-later'], 'kept');
  assert.equal(now.claim?.pid, process.pid);
});

test('a task that is not there is refused', async () => {
  const missing = await host.call<Result>('recordDispatch', project, 'task-99', record());
  assert.equal(missing.ok, false);
});
