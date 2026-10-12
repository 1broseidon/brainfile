/**
 * spec-11 at the real process boundary: the built bundle.
 *
 * - `brainfile hooks session-start` runs from the lean entry (`dist/hook.mjs`),
 *   whose static import graph reaches neither ink/react/yoga nor commander or
 *   the MCP server;
 * - decide/supersede commit once per command on a tracked board;
 * - check's exit codes; search's forced fallback (`BRAINFILE_INDEX=off`).
 *
 * Skips loudly on a checkout that has not been built.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dist = path.join(__dirname, '..', '..', 'dist');
const distCli = path.join(dist, 'cli.js');
const hasBundle = fs.existsSync(distCli) && fs.existsSync(path.join(dist, 'hook.mjs'));
const maybe = hasBundle ? test : test.skip;

/** Generous: the hook measures ~150ms warm; this only catches a structural regression. */
const HOOK_BUDGET_MS = 2000;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
};

function run(args: string[], cwd: string, extra: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, [distCli, ...args], {
    cwd,
    encoding: 'utf-8',
    input: extra.input ?? '',
    env: { ...process.env, ...GIT_ENV, NO_COLOR: '1', FORCE_COLOR: '0', BRAINFILE_DETECT_AGENT: 'off', ...extra.env },
  });
}

function git(cwd: string, ...args: string[]) {
  return spawnSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } });
}

/** Every chunk `hook.mjs` loads statically, following `import … from "./x.mjs"` and `import "./x.mjs"`. */
function staticGraph(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(path.join(dist, file), 'utf-8');
    for (const match of source.matchAll(/^\s*(?:import|export)\s[^;]*?["']\.\/([\w.-]+\.mjs)["']/gm)) visit(match[1]);
    for (const match of source.matchAll(/^import\s+["']\.\/([\w.-]+\.mjs)["']/gm)) visit(match[1]);
  };
  visit(entry);
  return [...seen];
}

describe('built CLI: spec-11', () => {
  let root: string;

  beforeAll(() => {
    if (!hasBundle) {
      // eslint-disable-next-line no-console
      console.warn('[memory-bundle] dist/hook.mjs not found — skipping. Run `npm run build` to enable.');
      return;
    }
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-memory-bundle-'));
    git(root, 'init', '-q');
    fs.writeFileSync(path.join(root, 'README.md'), '# Bundle test\n\nOutbound HTTP uses one client.\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'init');
    const init = run(['init'], root);
    expect(init.status).toBe(0);
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  maybe('the hook entry never reaches ink, react, commander or the MCP server', () => {
    const graph = staticGraph('hook.mjs');
    expect(graph).not.toContain('cli.mjs');
    for (const file of graph) {
      const source = fs.readFileSync(path.join(dist, file), 'utf-8');
      expect(`${file}: ${/node_modules\/(ink|react|react-reconciler|yoga-layout|commander|@modelcontextprotocol)\//.test(source)}`).toBe(`${file}: false`);
    }
    const launcher = fs.readFileSync(distCli, 'utf-8');
    expect(launcher).toContain("'./hook.mjs'");
    // node:sqlite is never bundled: it is looked up at run time.
    for (const file of fs.readdirSync(dist).filter((f) => f.endsWith('.mjs'))) {
      expect(fs.readFileSync(path.join(dist, file), 'utf-8')).not.toMatch(/from\s+["']node:sqlite["']/);
    }
  });

  maybe('decide commits once per command; supersede too', () => {
    const before = Number(git(root, 'rev-list', '--count', 'brainfile').stdout.trim());
    expect(run(['decide', '-k', 'dependency.http-client', '--stance', 'forbids', '--subject', 'axios', 'Use undici, never axios'], root).status).toBe(0);
    expect(run(['decide', '-k', 'storage.index', 'Index with sqlite fts5'], root).status).toBe(0);
    const supersede = run(['supersede', 'decision-2', 'Index with sqlite fts5 in state/', '--json'], root);
    expect(supersede.status).toBe(0);
    expect(JSON.parse(supersede.stdout)).toMatchObject({ superseded: ['decision-2'], decision: { id: 'decision-3' } });
    const after = Number(git(root, 'rev-list', '--count', 'brainfile').stdout.trim());
    expect(after - before).toBe(3);
    const subjects = git(root, 'log', '-3', '--format=%s', 'brainfile').stdout.trim().split('\n');
    expect(subjects.some((s) => s.startsWith('supersede'))).toBe(true);
    expect(subjects.filter((s) => s.startsWith('decide'))).toHaveLength(2);
  });

  maybe('check exits 2 for review, 3 for use_replacement, 0 otherwise', () => {
    expect(run(['check', 'add axios for retries'], root).status).toBe(2);
    expect(run(['check', 'decision-2'], root).status).toBe(3);
    expect(run(['check', 'rename the logger module'], root).status).toBe(0);
    const json = run(['check', '-k', 'storage.index', '--json'], root);
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({ verdict: 'use', exitCode: 0 });
  });

  maybe('search falls back to the scan when forced, and uses the index otherwise', () => {
    const scan = JSON.parse(run(['search', 'http', '--json'], root, { env: { BRAINFILE_INDEX: 'off' } }).stdout);
    expect(scan.mode).toBe('scan');
    const indexed = JSON.parse(run(['search', 'http', '--json'], root).stdout);
    expect(['index', 'scan']).toContain(indexed.mode);
    if (indexed.mode === 'index') {
      expect(indexed.results.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['README.md:1-3']));
    }
  });

  maybe('hooks session-start injects the brief for Claude Code, inside the budget', () => {
    const input = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: root });
    run(['hooks', 'session-start'], root, { input, env: { BRAINFILE_AGENT: 'warmup' } });
    const started = Date.now();
    const result = run(['hooks', 'session-start'], root, { input });
    const ms = Date.now() - started;
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(payload.hookSpecificOutput.additionalContext).toContain('## Current decisions');
    expect(payload.hookSpecificOutput.additionalContext).toContain('dependency.http-client: Use undici, never axios');
    expect(payload.hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(1600);
    expect(ms).toBeLessThan(HOOK_BUDGET_MS);
    // Plain text for anything else; nothing at all outside a board.
    expect(run(['hooks', 'session-start'], root, { input: '{}' }).stdout).toContain('Brainfile brief for');
    expect(run(['hooks', 'session-start'], os.tmpdir(), { input: '{}' }).stdout).toBe('');
  });
});
