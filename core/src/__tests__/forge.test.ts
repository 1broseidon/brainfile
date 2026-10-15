import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  detectForge,
  fileTokenStore,
  forgeFromRemote,
  GitHub,
  nextLink,
  parseRemoteUrl,
  PULL_REQUEST_TTL_MS,
  toIssue,
  toPullRequest,
  type ForgeRepo,
  type GitHubDeps,
} from '../forge';

/**
 * `@brainfile/core/forge` (task-26, task-77): finding GitHub in a remote,
 * signing in, and reading issues without spending the rate limit. GitHub
 * itself is a fake fetch; nothing here reaches the network.
 */

describe('forge detection', () => {
  it('GitHub is found in every form of origin git writes', () => {
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
      expect([remote, forgeFromRemote(remote)]).toEqual([remote, want]);
    }
  });

  it('other forges, local paths and odd URLs are not GitHub', () => {
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
      expect([remote, forgeFromRemote(remote)]).toEqual([remote, null]);
    }
  });

  it('a remote is read into host and path whatever the forge, so another forge is one more matcher', () => {
    expect(parseRemoteUrl('git@gitlab.com:group/sub/project.git')).toEqual({ host: 'gitlab.com', path: 'group/sub/project' });
    expect(parseRemoteUrl('https://codeberg.org/me/thing')).toEqual({ host: 'codeberg.org', path: 'me/thing' });
  });

  it("a folder's origin is read with git", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-forge-'));
    try {
      expect(await detectForge(dir)).toBeNull();
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo);
      execFileSync('git', ['init', '-q'], { cwd: repo });
      execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:o/r.git'], { cwd: repo });
      expect(await detectForge(repo)).toEqual({ forge: 'github', host: 'github.com', owner: 'o', name: 'r', url: 'https://github.com/o/r' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the GitHub client', () => {
  it('the next page is read from a Link header', () => {
    const link =
      '<https://api.github.com/repositories/1/issues?page=2>; rel="next", <https://api.github.com/repositories/1/issues?page=5>; rel="last"';
    expect(nextLink(link)).toBe('https://api.github.com/repositories/1/issues?page=2');
    expect(nextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });

  it('pull requests are left out of the issues', () => {
    expect(toIssue({ number: 3, title: 'PR', pull_request: {} })).toBeNull();
    expect(toIssue(item(4, { labels: [{ name: 'bug' }, 'help wanted', { name: '' }] }))?.labels).toEqual(['bug', 'help wanted']);
  });

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
    method?: string;
    headers: Record<string, string>;
    body?: string;
  }

  /** A GitHub that answers from `routes`, and remembers what it was asked. */
  function fake(routes: (call: Call) => Response, over: Partial<GitHubDeps> = {}) {
    const calls: Call[] = [];
    let saved: string | null = null;
    const deps: GitHubDeps = {
      fetch: (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
        const call = { url: String(url), method: init?.method, headers: init?.headers ?? {}, body: init?.body };
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

  it('the gh CLI login comes first, then the environment, then the saved token', async () => {
    const env = { GITHUB_TOKEN: 'env-token' };
    const store = { read: () => 'saved-token', write: () => {} };
    const routes = () => json([]);
    expect(await fake(routes, { ghToken: async () => 'gh-token', env, store }).github.credentials()).toEqual({ source: 'gh', token: 'gh-token' });
    expect(await fake(routes, { env, store }).github.credentials()).toEqual({ source: 'env', token: 'env-token' });
    expect(await fake(routes, { env: { GH_TOKEN: 'gh-env', GITHUB_TOKEN: 'env-token' } }).github.credentials()).toEqual({ source: 'env', token: 'gh-env' });
    expect(await fake(routes, { store }).github.credentials()).toEqual({ source: 'token', token: 'saved-token' });
    expect(await fake(routes, { store: { read: async () => 'kept', write: async () => {} } }).github.credentials()).toEqual({ source: 'token', token: 'kept' });
    expect(await fake(routes).github.credentials()).toEqual({ source: 'none', token: null });
  });

  it('issues are read with the credentials, pull requests dropped, pages followed', async () => {
    const { github, calls } = fake(
      (call) => {
        if (call.url.includes('page=2')) return json([item(1)], { 'x-ratelimit-remaining': '4990' });
        return json([item(3), { ...item(2), pull_request: {} }], {
          etag: 'W/"one"',
          link: '<https://api.github.com/repos/o/r/issues?page=2>; rel="next"',
        });
      },
      { ghToken: async () => 'gh-token', userAgent: 'brainfile-test' }
    );
    const result = await github.listIssues(repo);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.issues.map((i) => i.number)).toEqual([3, 1]);
    expect(result.value.auth).toBe('gh');
    expect(result.value.rateRemaining).toBe(4990);
    expect(result.value.truncated).toBe(false);
    expect(calls[0].headers.Authorization).toBe('Bearer gh-token');
    expect(calls[0].headers['User-Agent']).toBe('brainfile-test');
    expect(calls[0].url).toMatch(/^https:\/\/api\.github\.com\/repos\/o\/r\/issues\?state=open/);
  });

  it('within a minute the issues come from memory; after it, an unchanged answer is a free 304', async () => {
    let asked = 0;
    const { github, calls } = fake((call) => {
      asked++;
      if (call.headers['If-None-Match'] === 'W/"one"') return new Response(null, { status: 304 });
      return json([item(7)], { etag: 'W/"one"' });
    });
    const first = await github.listIssues(repo);
    const second = await github.listIssues(repo);
    expect(asked).toBe(1);
    if (!first.ok || !second.ok) throw new Error('not read');
    expect(second.value.issues).toEqual(first.value.issues);

    const forced = await github.listIssues(repo, true);
    expect(asked).toBe(2);
    expect(calls[1].headers['If-None-Match']).toBe('W/"one"');
    if (!forced.ok) throw new Error(forced.error);
    expect(forced.value.issues.map((i) => i.number)).toEqual([7]);
  });

  it('a refusal says what to do about it', async () => {
    const missing = await fake(() => json({ message: 'Not Found' }, {}, 404)).github.listIssues(repo);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/no public o\/r.*gh auth login/);

    const told = await fake(() => json({}, {}, 404), { signIn: 'Run brainfile auth github.' }).github.listIssues(repo);
    if (!told.ok) expect(told.error).toMatch(/If it is private: Run brainfile auth github\.$/);

    const spent = await fake(() => json({}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791850000' }, 403)).github.listIssues(repo);
    if (!spent.ok) expect(spent.error).toMatch(/rate limit is spent until/);
    expect(spent.ok).toBe(false);

    const refused = await fake(() => json({}, {}, 401), { ghToken: async () => 'old' }).github.listIssues(repo);
    if (!refused.ok) expect(refused.error).toMatch(/did not accept the gh CLI login/);

    const gone = await fake(() => json({}, {}, 410), { env: { GH_TOKEN: 't' } }).github.listIssues(repo);
    if (!gone.ok) expect(gone.error).toBe('o/r has issues turned off.');

    const hidden = await fake(() => json({}, {}, 404), { env: { GH_TOKEN: 't' } }).github.listIssues(repo);
    if (!hidden.ok) expect(hidden.error).toBe('GitHub has no o/r these credentials can see.');

    const odd = await fake(() => json({}, {}, 500)).github.listIssues(repo);
    if (!odd.ok) expect(odd.error).toBe('GitHub answered 500 for o/r.');

    const offline = await fake(() => {
      throw new TypeError('fetch failed');
    }).github.listIssues(repo);
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.error).toMatch(/Could not reach GitHub/);
  });

  it('a token is kept only once GitHub accepts it', async () => {
    const good = fake((call) => (call.headers.Authorization === 'Bearer good' ? json({ login: 'george' }) : json({}, {}, 401)));
    const refused = await good.github.setToken('bad');
    expect(refused.ok).toBe(false);
    expect(good.saved()).toBeNull();

    const kept = await good.github.setToken('  good  ');
    expect(kept).toEqual({ ok: true, value: { source: 'token', saved: true, login: 'george' } });
    expect(good.saved()).toBe('good');

    const forgot = await good.github.setToken(null);
    expect(forgot).toEqual({ ok: true, value: { source: 'none', saved: false } });
    expect(good.saved()).toBeNull();
  });

  it('a request carries its method and a JSON body, for the calls that write', async () => {
    const { github, calls } = fake(() => json({ number: 1 }, {}, 201));
    const res = await github.request('/repos/o/r/pulls', { token: 't', method: 'POST', body: { title: 'T' } });
    expect(res.status).toBe(201);
    expect(calls[0]).toMatchObject({
      url: 'https://api.github.com/repos/o/r/pulls',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: '{"title":"T"}',
    });
  });

  function pull(number: number, over: Record<string, unknown> = {}) {
    return {
      number,
      title: `PR ${number}`,
      state: 'open',
      merged: false,
      merged_at: null,
      html_url: `https://github.com/o/r/pull/${number}`,
      base: { ref: 'main' },
      head: { ref: 'dispatch/task-1', sha: 'abc123' },
      ...over,
    };
  }

  it('a pull request is read as open, merged or closed', () => {
    expect(toPullRequest(pull(4), 5)).toEqual({
      number: 4,
      url: 'https://github.com/o/r/pull/4',
      state: 'open',
      base: 'main',
      head: 'dispatch/task-1',
      headSha: 'abc123',
      title: 'PR 4',
      fetchedAt: 5,
    });
    expect(toPullRequest(pull(4, { state: 'closed', merged: true }))?.state).toBe('merged');
    // The list endpoint says merged_at, not merged.
    expect(toPullRequest(pull(4, { state: 'closed', merged: undefined, merged_at: '2026-10-15T00:00:00Z' }))?.state).toBe('merged');
    expect(toPullRequest(pull(4, { state: 'closed' }))?.state).toBe('closed');
    expect(toPullRequest({ title: 'no number' })).toBeNull();
  });

  it('a pull request is opened with the credentials, from head into base', async () => {
    const { github, calls } = fake(() => json(pull(12), {}, 201), { env: { GH_TOKEN: 't' } });
    const opened = await github.openPullRequest(repo, { head: 'dispatch/task-1', base: 'main', title: 'One', body: 'Body' });
    expect(opened).toEqual({ ok: true, value: expect.objectContaining({ number: 12, state: 'open', url: 'https://github.com/o/r/pull/12' }) });
    expect(calls[0]).toMatchObject({ url: 'https://api.github.com/repos/o/r/pulls', method: 'POST', headers: { Authorization: 'Bearer t' } });
    expect(JSON.parse(calls[0].body!)).toEqual({ title: 'One', head: 'dispatch/task-1', base: 'main', body: 'Body' });
  });

  it('opening one needs credentials, and says why GitHub would not', async () => {
    const anonymous = fake(() => json(pull(1), {}, 201));
    const none = await anonymous.github.openPullRequest(repo, { head: 'h', base: 'main', title: 'T', body: '' });
    expect(none).toEqual({ ok: false, error: expect.stringMatching(/needs GitHub credentials\. Sign in with `gh auth login`/) });
    expect(anonymous.calls).toHaveLength(0);

    const env = { env: { GH_TOKEN: 't' } };
    const said = (body: unknown, status = 422) => fake(() => json(body, {}, status), env).github.openPullRequest(repo, { head: 'dispatch/task-1', base: 'release', title: 'T', body: '' });
    expect(await said({ message: 'Validation Failed', errors: [{ resource: 'PullRequest', code: 'custom', message: 'No commits between release and dispatch/task-1' }] })).toEqual({
      ok: false,
      error: 'dispatch/task-1 has nothing release lacks on GitHub: there is nothing to open.',
    });
    expect(await said({ message: 'Validation Failed', errors: [{ resource: 'PullRequest', field: 'base', code: 'invalid' }] })).toEqual({ ok: false, error: 'release is not on GitHub: push it first.' });
    expect(await said({ message: 'Validation Failed', errors: [{ message: 'Something else' }] })).toEqual({ ok: false, error: 'GitHub would not open it: Validation Failed: Something else' });
    expect(await said({ message: 'Resource not accessible by personal access token' }, 403)).toEqual({ ok: false, error: expect.stringMatching(/may not open pull requests on o\/r/) });
  });

  it('one already open from the branch is found, not opened twice', async () => {
    const { github, calls } = fake(
      (call) =>
        call.method === 'POST'
          ? json({ message: 'Validation Failed', errors: [{ message: 'A pull request already exists for o:dispatch/task-1.' }] }, {}, 422)
          : json([pull(9)]),
      { env: { GH_TOKEN: 't' } }
    );
    const opened = await github.openPullRequest(repo, { head: 'dispatch/task-1', base: 'main', title: 'T', body: '' });
    expect(opened).toEqual({ ok: true, value: expect.objectContaining({ number: 9 }) });
    expect(calls[1].url).toBe('https://api.github.com/repos/o/r/pulls?head=o%3Adispatch%2Ftask-1&state=open&per_page=1');
  });

  it("a pull request's state is asked at most once a minute, then with its ETag, so an unchanged one is a free 304", async () => {
    let state = 'open';
    const { github, calls } = fake((call) => {
      if (call.headers['If-None-Match'] === 'W/"pr"' && state === 'open') return new Response(null, { status: 304 });
      return json(pull(3, { state, merged: state === 'merged' }), { etag: 'W/"pr"' });
    });
    const first = await github.pullRequestState(repo, 3);
    const again = await github.pullRequestState(repo, 3);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/pulls/3');
    expect(first.ok && again.ok && again.value.state).toBe('open');

    const realNow = Date.now;
    try {
      Date.now = () => realNow() + PULL_REQUEST_TTL_MS + 1;
      const unchanged = await github.pullRequestState(repo, 3);
      expect(calls).toHaveLength(2);
      expect(calls[1].headers['If-None-Match']).toBe('W/"pr"');
      expect(unchanged.ok && unchanged.value.state).toBe('open');
    } finally {
      Date.now = realNow;
    }
    state = 'merged';
    const forced = await github.pullRequestState(repo, 3, true);
    expect(forced.ok && forced.value.state).toBe('merged');

    const missing = await fake(() => json({}, {}, 404)).github.pullRequestState(repo, 99);
    expect(missing).toEqual({ ok: false, error: 'GitHub has no pull request #99 on o/r these credentials can see.' });
  });

  it('a saved token is sealed in its file and opened again', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-token-'));
    try {
      const file = path.join(dir, 'github.json');
      const store = fileTokenStore(file, (text) => Buffer.from(text.split('').reverse().join('')), (sealed) => sealed.toString().split('').reverse().join(''));
      expect(store.read()).toBeNull();
      store.write('secret');
      expect(fs.readFileSync(file, 'utf-8')).not.toContain('secret');
      expect(store.read()).toBe('secret');
      store.write(null);
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
