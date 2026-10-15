/**
 * GitHub issues beside the board (task-26): the task an issue becomes, and
 * the main process reading issues through core's GitHub client (task-77),
 * whose own tests (core/src/__tests__/forge.test.ts) cover pages, the ETag
 * and the credentials. GitHub itself is a fake fetch, so plain `node --test`
 * runs these.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { forgeFromRemote, GitHub } from '@brainfile/core/forge';
import { bundled } from './bundle.ts';
import { intakeColumn, issueTask, labelTag, linkedTask, sourceLabel } from '../src/shared/issues.ts';
import type { BoardSnapshot, ForgeRepo, IssuesView, IssueView, Result, TaskView } from '../src/shared/api.ts';

test("the window's issues come from core's client, in the shapes the window knows", async () => {
  const repo: ForgeRepo = forgeFromRemote('git@github.com:o/r.git')!;
  const github = new GitHub({
    fetch: (async () =>
      new Response(JSON.stringify([{ number: 1, title: 'One', body: '', labels: [], html_url: 'https://github.com/o/r/issues/1' }]), {
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
    ghToken: async () => null,
    env: {},
    store: { read: () => null, write: () => {} },
    signIn: 'Sign in with `gh auth login`, or save a token in Settings.',
  });
  const result: Result<IssuesView> = await github.listIssues(repo);
  assert.ok(result.ok);
  assert.deepEqual(result.value.issues.map((i) => i.url), ['https://github.com/o/r/issues/1']);
  assert.equal(result.value.repo.url, 'https://github.com/o/r');
});

// ── The task an issue becomes ──────────────────────────────────────────────

const issue: IssueView = {
  number: 12,
  title: '  Crash on empty board ',
  body: 'Steps:\r\n1. Open\r\n',
  labels: ['bug', 'Good First Issue', 'area/desktop', 'bug'],
  url: 'https://github.com/o/r/issues/12',
  comments: 0,
  createdAt: '',
  updatedAt: '',
};

test('an issue becomes a task with its title, body, labels as tags and a link back', () => {
  assert.deepEqual(issueTask(issue, 'todo'), {
    title: 'Crash on empty board',
    column: 'todo',
    description: 'Steps:\n1. Open',
    tags: ['bug', 'good-first-issue', 'area-desktop'],
    source: 'https://github.com/o/r/issues/12',
  });
  assert.deepEqual(issueTask({ ...issue, title: '', body: '  ', labels: [] }, 'todo'), {
    title: 'Issue #12',
    column: 'todo',
    source: 'https://github.com/o/r/issues/12',
  });
});

test('labels read as tags', () => {
  assert.equal(labelTag('Good First Issue'), 'good-first-issue');
  assert.equal(labelTag('type: bug'), 'type-bug');
  assert.equal(labelTag(' 🐛 bug '), 'bug');
  assert.equal(labelTag('v1.2'), 'v1.2');
});

test('a new task from an issue lands in the first column that is not done', () => {
  assert.equal(intakeColumn([{ id: 'done', title: 'Done', completionColumn: true }, { id: 'todo', title: 'To Do' }]), 'todo');
  assert.equal(intakeColumn([]), undefined);
});

test('an issue already on the board is found by its URL, with or without a trailing slash', () => {
  assert.equal(linkedTask(issue, { 'https://github.com/o/r/issues/12': 'task-4' }), 'task-4');
  assert.equal(linkedTask({ ...issue, url: issue.url + '/' }, { 'https://github.com/o/r/issues/12': 'task-4' }), 'task-4');
  assert.equal(linkedTask(issue, { 'https://github.com/o/r/issues/13': 'task-5' }), undefined);
});

test('a source reads as owner/name#number', () => {
  assert.equal(sourceLabel('https://github.com/o/r/issues/12'), 'o/r#12');
  assert.equal(sourceLabel('https://linear.app/x/issue/ABC-1'), 'https://linear.app/x/issue/ABC-1');
});

// ── The host ───────────────────────────────────────────────────────────────

const { inProcessHost } = bundled<typeof import('../src/link/inProcess.ts')>('src/link/inProcess.ts');
const host = inProcessHost(() => bundled('src/host/host.ts'));
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-issues-'));
fs.cpSync(path.resolve(import.meta.dirname, 'fixtures', 'link', 'brainfile'), path.join(project, '.brainfile'), { recursive: true });

// The host watches an open board; closed, nothing keeps the test running.
after(async () => {
  await host.call('closeBoard', project);
  fs.rmSync(project, { recursive: true, force: true });
});

test('the host writes an issue\'s task with source: once, and the board knows it', async () => {
  const opened = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(opened.ok);
  const made = await host.call<Result<TaskView>>('addTask', project, issueTask({ ...issue, url: issue.url + '/' }, 'todo'));
  assert.ok(made.ok, !made.ok ? made.error : '');
  const file = fs.readFileSync(path.join(project, '.brainfile', 'board', `${made.value.id}.md`), 'utf-8');
  assert.match(file, /^source: https:\/\/github\.com\/o\/r\/issues\/12$/m);

  const again = await host.call<Result<TaskView>>('addTask', project, issueTask(issue, 'todo'));
  assert.ok(!again.ok);
  assert.equal(again.error, `That issue is already ${made.value.id}.`);

  const board = await host.call<Result<BoardSnapshot>>('openBoard', project);
  assert.ok(board.ok);
  assert.equal(linkedTask(issue, board.value.sources), made.value.id);
});
