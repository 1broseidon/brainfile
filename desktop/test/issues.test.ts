/**
 * GitHub issues beside the board (task-26): finding GitHub in a remote, signing
 * in, reading issues without spending the rate limit, and the task an issue
 * becomes. GitHub itself is a fake fetch, so plain `node --test` runs these.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeFromRemote, parseRemoteUrl } from '../src/main/forge.ts';
import { GitHub, nextLink, toIssue, type GitHubDeps } from '../src/main/github.ts';
import { intakeColumn, issueTask, labelTag, linkedTask, sourceLabel } from '../src/shared/issues.ts';
import type { ForgeRepo, IssueView } from '../src/shared/api.ts';

test('GitHub is found in every form of origin git writes', () => {
  const want = { forge: 'github', host: 'github.com', owner: '1broseidon', name: 'brainfile', url: 'https://github.com/1broseidon/brainfile' };
  for (const remote of [
    'https://github.com/1broseidon/brainfile.git',
    'https://github.com/1broseidon/brainfile',
    'https://github.com/1broseidon/brainfile/',
    'https://george@github.com/1broseidon/brainfile.git',
    'https://x-access-token:abc@github.com/1broseidon/brainfile.git',
    'git@github.com:1broseidon/brainfile.git',
    'git@github.com:1broseidon/brainfile',
    'ssh://git@github.com/1broseidon/brainfile.git',
    'ssh://git@github.com:22/1broseidon/brainfile.git',
    'git://github.com/1broseidon/brainfile.git',
    'https://GitHub.com/1broseidon/brainfile.git',
    '  git@github.com:1broseidon/brainfile.git\n',
  ]) {
    assert.deepEqual(forgeFromRemote(remote), want, remote);
  }
});

test('other forges, local paths and odd URLs are not GitHub', () => {
  for (const remote of [
    'https://gitlab.com/group/project.git',
    'git@gitlab.com:group/project.git',
    'https://github.com/only-owner',
    'https://github.com/owner/name/extra',
    '/Users/george/repos/brainfile',
    '../brainfile.git',
    'file:///Users/george/repos/brainfile.git',
    'C:\\repos\\brainfile',
    '',
  ]) {
    assert.equal(forgeFromRemote(remote), null, remote);
  }
});

test('a remote is read into host and path whatever the forge, so another forge is one more matcher', () => {
  assert.deepEqual(parseRemoteUrl('git@gitlab.com:group/sub/project.git'), { host: 'gitlab.com', path: 'group/sub/project' });
  assert.deepEqual(parseRemoteUrl('https://codeberg.org/me/thing'), { host: 'codeberg.org', path: 'me/thing' });
});

test('the next page is read from a Link header', () => {
  const link =
    '<https://api.github.com/repositories/1/issues?page=2>; rel="next", <https://api.github.com/repositories/1/issues?page=5>; rel="last"';
  assert.equal(nextLink(link), 'https://api.github.com/repositories/1/issues?page=2');
  assert.equal(nextLink('<https://api.github.com/x?page=1>; rel="prev"'), null);
  assert.equal(nextLink(null), null);
});

test('pull requests are left out of the issues', () => {
  assert.equal(toIssue({ number: 3, title: 'PR', pull_request: {} }), null);
  assert.deepEqual(toIssue(item(4, { labels: [{ name: 'bug' }, 'help wanted', { name: '' }] }))?.labels, ['bug', 'help wanted']);
});

// ── The client ─────────────────────────────────────────────────────────────

const repo: ForgeRepo = { forge: 'github', host: 'github.com', owner: 'o', name: 'r', url: 'https://github.com/o/r' };

function item(number: number, over: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: 'Body',
    labels: [],
    html_url: `https://github.com/o/r/issues/${number}`,
    user: { login: 'someone' },
    comments: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    ...over,
  };
}

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** A GitHub that answers from `routes`, and remembers what it was asked. */
function fake(routes: (call: Call) => Response, over: Partial<GitHubDeps> = {}) {
  const calls: Call[] = [];
  let saved: string | null = null;
  const deps: GitHubDeps = {
    fetch: (async (url: string, init?: { headers?: Record<string, string> }) => {
      const call = { url: String(url), headers: init?.headers ?? {} };
      calls.push(call);
      return routes(call);
    }) as typeof fetch,
    ghToken: async () => null,
    env: {},
    store: { read: () => saved, write: (t) => void (saved = t) },
    ...over,
  };
  return { github: new GitHub(deps), calls, saved: () => saved };
}

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('the gh CLI login comes first, then the environment, then the saved token', async () => {
  const env = { GITHUB_TOKEN: 'env-token' };
  const store = { read: () => 'saved-token', write: () => {} };
  const routes = () => json([]);
  assert.deepEqual(await fake(routes, { ghToken: async () => 'gh-token', env, store }).github.credentials(), { source: 'gh', token: 'gh-token' });
  assert.deepEqual(await fake(routes, { env, store }).github.credentials(), { source: 'env', token: 'env-token' });
  assert.deepEqual(await fake(routes, { store }).github.credentials(), { source: 'token', token: 'saved-token' });
  assert.deepEqual(await fake(routes).github.credentials(), { source: 'none', token: null });
});

test('issues are read with the credentials, pull requests dropped, pages followed', async () => {
  const { github, calls } = fake(
    (call) => {
      if (call.url.includes('page=2')) return json([item(1)], { 'x-ratelimit-remaining': '4990' });
      return json([item(3), { ...item(2), pull_request: {} }], {
        etag: 'W/"one"',
        link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"',
      });
    },
    { ghToken: async () => 'gh-token' }
  );
  const result = await github.listIssues(repo);
  assert.ok(result.ok);
  assert.deepEqual(result.value.issues.map((i) => i.number), [3, 1]);
  assert.equal(result.value.auth, 'gh');
  assert.equal(result.value.rateRemaining, 4990);
  assert.equal(result.value.truncated, false);
  assert.equal(calls[0].headers.Authorization, 'Bearer gh-token');
  assert.match(calls[0].url, /\/repos\/o\/r\/issues\?state=open/);
});

test('within a minute the issues come from memory; after it, an unchanged answer is a free 304', async () => {
  let asked = 0;
  const { github, calls } = fake((call) => {
    asked++;
    if (call.headers['If-None-Match'] === 'W/"one"') return new Response(null, { status: 304 });
    return json([item(7)], { etag: 'W/"one"' });
  });
  const first = await github.listIssues(repo);
  const second = await github.listIssues(repo);
  assert.equal(asked, 1, 'the second read within the minute stays home');
  assert.ok(first.ok && second.ok);
  assert.deepEqual(second.value.issues, first.value.issues);

  const forced = await github.listIssues(repo, true);
  assert.equal(asked, 2);
  assert.equal(calls[1].headers['If-None-Match'], 'W/"one"');
  assert.ok(forced.ok);
  assert.deepEqual(forced.value.issues.map((i) => i.number), [7]);
});

test('a refusal says what to do about it', async () => {
  const missing = await fake(() => json({ message: 'Not Found' }, {}, 404)).github.listIssues(repo);
  assert.ok(!missing.ok);
  assert.match(missing.error, /no public o\/r.*gh auth login/);

  const spent = await fake(() => json({}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791850000' }, 403)).github.listIssues(repo);
  assert.ok(!spent.ok);
  assert.match(spent.error, /rate limit is spent until/);

  const offline = await fake(() => {
    throw new TypeError('fetch failed');
  }).github.listIssues(repo);
  assert.ok(!offline.ok);
  assert.match(offline.error, /Could not reach GitHub/);
});

test('a token is kept only once GitHub accepts it', async () => {
  const good = fake((call) => (call.headers.Authorization === 'Bearer good' ? json({ login: 'george' }) : json({}, {}, 401)));
  const refused = await good.github.setToken('bad');
  assert.ok(!refused.ok);
  assert.equal(good.saved(), null);

  const kept = await good.github.setToken('  good  ');
  assert.ok(kept.ok);
  assert.equal(good.saved(), 'good');
  assert.deepEqual(kept.value, { source: 'token', saved: true, login: 'george' });

  const forgot = await good.github.setToken(null);
  assert.ok(forgot.ok);
  assert.equal(good.saved(), null);
  assert.deepEqual(forgot.value, { source: 'none', saved: false });
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
