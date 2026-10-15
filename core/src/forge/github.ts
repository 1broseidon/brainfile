/**
 * GitHub, as far as a board needs it (task-26, task-77): who to sign in as,
 * and a repository's open issues. The CLI and the desktop share this client.
 *
 * Credentials are looked for in one order: the gh CLI's own login
 * (`gh auth token`), then GH_TOKEN or GITHUB_TOKEN in the environment, then
 * the token the person saved (the desktop's in the Keychain's care, the CLI's
 * in its auth store). With none, public repositories still answer, on
 * GitHub's smaller anonymous rate limit.
 *
 * Issues are asked for at most once a minute per repository unless the person
 * asks; the first page carries its ETag, and an unchanged answer (304) costs
 * no rate limit. Everything outside (fetch, gh, the saved token) is passed in,
 * so tests run this against a fake GitHub. Every call goes through `request`,
 * so another endpoint (pull requests) is one more method beside the issues.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import type { Issue } from '../issues';
import type { ForgeRepo } from './remote';

const API = 'https://api.github.com';
/** 100 a page, so at most this many pages: the issues are a list to pick from, not an archive. */
const MAX_PAGES = 3;
/** A repository's issues are asked for again no sooner than this, unless the person asks. */
export const ISSUES_TTL_MS = 60_000;
/** gh's answer is kept this long; a refusal from GitHub asks it again. */
const GH_TTL_MS = 5 * 60_000;

/** Where the credentials came from: the gh CLI's login, the environment, the saved token, or none (public repositories only). */
export type GitHubAuthSource = 'gh' | 'env' | 'token' | 'none';

/** A call that worked, or why not in a sentence. */
export type ForgeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface Credentials {
  source: GitHubAuthSource;
  token: string | null;
}

/** Where the person's saved token is kept: the desktop seals it with the Keychain; the CLI keeps its auth store. */
export interface TokenStore {
  read(): string | null | Promise<string | null>;
  write(token: string | null): void | Promise<void>;
}

export interface GitHubDeps {
  fetch: typeof fetch;
  /** The gh CLI's token for github.com, or null when gh is missing or signed out. */
  ghToken: () => Promise<string | null>;
  env: Record<string, string | undefined>;
  store: TokenStore;
  /** Sent as User-Agent, which GitHub requires. */
  userAgent?: string;
  /** How to sign in, said after a refusal that signing in would fix. */
  signIn?: string;
}

/** A repository's open issues, as read. */
export interface IssueList {
  repo: ForgeRepo;
  /** Open issues, pull requests left out, most recently updated first. */
  issues: Issue[];
  /** When GitHub was last asked (ms). */
  fetchedAt: number;
  auth: GitHubAuthSource;
  /** Requests left in the hour, as GitHub last said. */
  rateRemaining?: number;
  /** More open issues than were read. */
  truncated: boolean;
}

export interface GitHubAuth {
  source: GitHubAuthSource;
  /** Who GitHub says the credentials belong to, when it was asked and they work. */
  login?: string;
  /** A token is saved. */
  saved: boolean;
  /** Why the credentials found do not work. */
  error?: string;
}

/** One request to GitHub's API: a path under it or a full URL, with the token and ETag to send. */
export interface GitHubRequest {
  token: string | null;
  etag?: string | null;
  method?: string;
  /** Sent as JSON. */
  body?: unknown;
}

/** `gh auth token`, when gh is installed and signed in to github.com. */
export function ghCliToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 4000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null);
    });
  });
}

/** A token store in one file, sealed and opened by `seal` / `open` (Electron's safeStorage). */
export function fileTokenStore(file: string, seal: (text: string) => Buffer, open: (sealed: Buffer) => string): TokenStore {
  return {
    read() {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as { token?: string };
        return saved.token ? open(Buffer.from(saved.token, 'base64')) : null;
      } catch {
        return null;
      }
    },
    write(token) {
      if (!token) return fs.rmSync(file, { force: true });
      fs.writeFileSync(file, JSON.stringify({ token: seal(token).toString('base64') }), { mode: 0o600 });
    },
  };
}

/** The `next` page in a Link header, if there is one. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part);
    if (m) return m[1];
  }
  return null;
}

/** An item from GitHub's issues list as a board reads it; null for a pull request, which the list also returns. */
export function toIssue(item: any): Issue | null {
  if (!item || typeof item !== 'object' || item.pull_request) return null;
  return {
    number: item.number,
    title: String(item.title ?? ''),
    body: typeof item.body === 'string' ? item.body : '',
    labels: (Array.isArray(item.labels) ? item.labels : [])
      .map((l: unknown) => (typeof l === 'string' ? l : (l as { name?: string })?.name))
      .filter((l: unknown): l is string => typeof l === 'string' && l.length > 0),
    url: String(item.html_url ?? ''),
    ...(item.user?.login ? { author: item.user.login } : {}),
    comments: Number(item.comments ?? 0),
    createdAt: String(item.created_at ?? ''),
    updatedAt: String(item.updated_at ?? ''),
  };
}

interface Cached {
  view: IssueList;
  etag: string | null;
  /** The credentials the answer was read with: other credentials may see other issues. */
  token: string | null;
}

export class GitHub {
  #deps: GitHubDeps;
  #gh: { at: number; token: string | null } | null = null;
  #issues = new Map<string, Cached>();

  constructor(deps: GitHubDeps) {
    this.#deps = deps;
  }

  /** The credentials to use now: gh's, the environment's, then the saved token. */
  async credentials(): Promise<Credentials> {
    if (!this.#gh || Date.now() - this.#gh.at > GH_TTL_MS) this.#gh = { at: Date.now(), token: await this.#deps.ghToken() };
    if (this.#gh.token) return { source: 'gh', token: this.#gh.token };
    const env = this.#deps.env.GH_TOKEN || this.#deps.env.GITHUB_TOKEN;
    if (env) return { source: 'env', token: env };
    const saved = await this.#deps.store.read();
    if (saved) return { source: 'token', token: saved };
    return { source: 'none', token: null };
  }

  /** One call to GitHub's API. Throws only when GitHub cannot be reached. */
  request(url: string, { token, etag, method, body }: GitHubRequest): Promise<Response> {
    return this.#deps.fetch(url.startsWith('https://') ? url : `${API}${url}`, {
      ...(method ? { method } : {}),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': this.#deps.userAgent ?? 'Brainfile',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(etag ? { 'If-None-Match': etag } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Who a token belongs to, or why GitHub will not say. */
  async #whoAmI(token: string): Promise<{ login?: string; error?: string }> {
    try {
      const res = await this.request('/user', { token });
      if (res.ok) return { login: ((await res.json()) as { login?: string }).login };
      return { error: res.status === 401 ? 'GitHub did not accept the token.' : `GitHub answered ${res.status}.` };
    } catch {
      return { error: 'Could not reach GitHub.' };
    }
  }

  async auth(): Promise<GitHubAuth> {
    const creds = await this.credentials();
    const saved = !!(await this.#deps.store.read());
    if (!creds.token) return { source: 'none', saved };
    return { source: creds.source, saved, ...(await this.#whoAmI(creds.token)) };
  }

  /** Keep a token once GitHub accepts it; null forgets the saved one. */
  async setToken(token: string | null): Promise<ForgeResult<GitHubAuth>> {
    const trimmed = token?.trim() || null;
    if (trimmed) {
      const who = await this.#whoAmI(trimmed);
      if (!who.login) return { ok: false, error: who.error ?? 'GitHub did not accept the token.' };
    }
    try {
      await this.#deps.store.write(trimmed);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    this.#issues.clear();
    return { ok: true, value: await this.auth() };
  }

  async listIssues(repo: ForgeRepo, force = false): Promise<ForgeResult<IssueList>> {
    const key = `${repo.owner}/${repo.name}`.toLowerCase();
    const creds = await this.credentials();
    const cached = this.#issues.get(key);
    const usable = cached && cached.token === creds.token ? cached : undefined;
    if (usable && !force && Date.now() - usable.view.fetchedAt < ISSUES_TTL_MS) return { ok: true, value: usable.view };

    const first = `/repos/${repo.owner}/${repo.name}/issues?state=open&sort=updated&direction=desc&per_page=100`;
    let res: Response;
    try {
      res = await this.request(first, { token: creds.token, etag: usable?.etag });
    } catch {
      return { ok: false, error: usable ? 'Could not reach GitHub; these are the issues from earlier.' : 'Could not reach GitHub.' };
    }
    const rate = (r: Response) => {
      const left = r.headers.get('x-ratelimit-remaining');
      return left === null ? undefined : Number(left);
    };
    if (res.status === 304 && usable) {
      usable.view = { ...usable.view, fetchedAt: Date.now(), rateRemaining: rate(res) ?? usable.view.rateRemaining };
      return { ok: true, value: usable.view };
    }
    if (!res.ok) {
      // gh's token may have been revoked since it was asked; ask gh again next time.
      if (res.status === 401 && creds.source === 'gh') this.#gh = null;
      return { ok: false, error: problem(res, repo, creds.source, this.#deps.signIn) };
    }

    const issues: Issue[] = [];
    let page: Response | null = res;
    let pages = 0;
    let next: string | null = null;
    while (page) {
      for (const item of (await page.json()) as unknown[]) {
        const issue = toIssue(item);
        if (issue) issues.push(issue);
      }
      pages += 1;
      next = nextLink(page.headers.get('link'));
      if (!next || pages >= MAX_PAGES) break;
      try {
        page = await this.request(next, { token: creds.token });
      } catch {
        break;
      }
      if (!page.ok) break;
    }
    const view: IssueList = {
      repo,
      issues,
      fetchedAt: Date.now(),
      auth: creds.source,
      rateRemaining: rate(page ?? res),
      truncated: !!next,
    };
    this.#issues.set(key, { view, etag: res.headers.get('etag'), token: creds.token });
    return { ok: true, value: view };
  }
}

/** A refusal from GitHub, in a sentence that says what to do about it. */
function problem(res: Response, repo: ForgeRepo, source: GitHubAuthSource, signIn = 'Sign in with `gh auth login`, or save a token.'): string {
  const where = `${repo.owner}/${repo.name}`;
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const at = reset ? new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'later';
    return `GitHub's rate limit is spent until ${at}.${source === 'none' ? ` ${signIn}` : ''}`;
  }
  if (res.status === 401) return `GitHub did not accept the ${source === 'gh' ? 'gh CLI login' : 'token'}. ${signIn}`;
  if (res.status === 404) return source === 'none' ? `GitHub has no public ${where}. If it is private: ${signIn}` : `GitHub has no ${where} these credentials can see.`;
  if (res.status === 410) return `${where} has issues turned off.`;
  return `GitHub answered ${res.status} for ${where}.`;
}
