/**
 * `pullRequest:` on the board host (decision-16, spec-18): the snapshot the
 * window and every phone read carries it, and `recordPullRequest` writes it
 * through core with a line in the task's log, on an open task or one its
 * worker completed before it landed. The real host, over a copy of a board.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bundled } from './bundle.ts';
import type { BoardSnapshot, PullRequestRecord, Result } from '../src/shared/api.ts';

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));
const core = bundled<typeof import('@brainfile/core')>('../core/src/index.ts');

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile');
let project: string;

before(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pull-'));
  fs.cpSync(FIXTURE, path.join(project, '.brainfile'), { recursive: true });
});

after(async () => {
  await host.call('closeBoard', project);
  fs.rmSync(project, { recursive: true, force: true });
});

const pr: PullRequestRecord = { number: 40, url: 'https://github.com/o/r/pull/40', state: 'open', base: 'main', head: 'dispatch/task-2', at: '2026-10-15T13:00:00.000Z' };
const file = (dir: string, id: string) => path.join(project, '.brainfile', dir, `${id}.md`);

test('the snapshot every phone reads says a task is waiting on its pull request', async () => {
  const opened = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(opened.ok);
  const task8 = opened.value.tasks.find((t) => t.id === 'task-8');
  assert.deepEqual(task8?.pullRequest, { number: 31, url: 'https://github.com/1broseidon/brainfile/pull/31', state: 'open', base: 'main', head: 'dispatch/task-8', at: '2026-10-15T12:00:00.000Z' });
  assert.equal(opened.value.tasks.find((t) => t.id === 'task-7')?.pullRequest, undefined);
});

test('recordPullRequest writes the record and says so in the log; closed and taken off the same way', async () => {
  const written = await host.call<Result>('recordPullRequest', project, 'task-2', pr, 'Opened pull request #40 from dispatch/task-2 into main');
  assert.ok(written.ok, !written.ok ? written.error : '');
  const doc = core.readTaskFile(file('board', 'task-2'))!;
  assert.deepEqual(core.parsePullRequest(doc.task.pullRequest), pr);
  assert.match(doc.body, /Opened pull request #40 from dispatch\/task-2 into main/);
  assert.deepEqual(doc.task.decisions, ['decision-1'], 'the rest of the task is kept');

  await host.call<Result>('recordPullRequest', project, 'task-2', { ...pr, state: 'closed' }, 'Pull request #40 was closed without merging');
  assert.equal(core.parsePullRequest(core.readTaskFile(file('board', 'task-2'))!.task.pullRequest)?.state, 'closed');
  await host.call<Result>('recordPullRequest', project, 'task-2', null);
  assert.equal(core.readTaskFile(file('board', 'task-2'))!.task.pullRequest, undefined);
});

test('a task its worker completed before it landed is written in logs/', async () => {
  const written = await host.call<Result>('recordPullRequest', project, 'task-6', { ...pr, head: 'dispatch/task-6', state: 'merged' }, 'Pull request #40 was merged into main');
  assert.ok(written.ok, !written.ok ? written.error : '');
  assert.equal(core.parsePullRequest(core.readTaskFile(file('logs', 'task-6'))!.task.pullRequest)?.state, 'merged');
  const missing = await host.call<Result>('recordPullRequest', project, 'task-99', pr);
  assert.equal(missing.ok, false);
});
