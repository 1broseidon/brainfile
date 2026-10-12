import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  chunkText,
  firstHeading,
  ftsTerms,
  getIndexPath,
  indexDisabledByEnv,
  isSkippedPath,
  isSupportedTextPath,
  isUnminableRoot,
  listProjectDocs,
  loadSqlite,
  MemoryIndex,
  MAX_FILE_BYTES,
  scanSearch,
  searchMemory,
  setSqliteLoaderForTesting,
  sqliteAvailable,
} from '../memory';
import { writeTaskFile } from '../taskFile';
import { appendLedgerRecord } from '../ledger';
import { ACTION_CUE_WORDS } from '../decisions';

const HAS_SQLITE = sqliteAvailable();
const itIndex = HAS_SQLITE ? it : it.skip;

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

interface Project {
  root: string;
  brainfilePath: string;
  boardDir: string;
  logsDir: string;
}

function makeProject(options: { git?: boolean } = {}): Project {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-index-'));
  const dot = path.join(root, '.brainfile');
  const boardDir = path.join(dot, 'board');
  const logsDir = path.join(dot, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  const brainfilePath = path.join(dot, 'brainfile.md');
  fs.writeFileSync(brainfilePath, '---\ntitle: Index Board\ncolumns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n---\n');
  if (options.git) {
    git(root, 'init', '-q');
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\nsecret.md\n');
  }
  return { root, brainfilePath, boardDir, logsDir };
}

function write(root: string, rel: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

describe('chunkText', () => {
  it('keeps markdown sections together and records line ranges', () => {
    const text = '# Title\n\nIntro line.\n\n## One\n\nalpha\n\n## Two\n\nbeta\n';
    const chunks = chunkText(text, { maxChars: 24 });
    expect(chunks.map((c) => [c.heading, c.startLine, c.endLine])).toEqual([
      ['Title', 1, 3],
      ['One', 5, 7],
      ['Two', 9, 11],
    ]);
    const packed = chunkText(text);
    expect(packed).toHaveLength(1);
    expect(packed[0]).toMatchObject({ startLine: 1, endLine: 11, heading: 'Title' });
  });

  it('ignores headings inside fences and cuts oversized sections between lines', () => {
    const fenced = '```\n# not a heading\n```\nafter\n';
    expect(chunkText(fenced, { maxChars: 1000 })).toHaveLength(1);
    expect(firstHeading(fenced)).toBeUndefined();
    expect(firstHeading('text\n## Real\n')).toBe('Real');
    const big = `## Big\n${Array.from({ length: 10 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')}\n`;
    const chunks = chunkText(big, { maxChars: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.heading === 'Big')).toBe(true);
    expect(chunks[chunks.length - 1].endLine).toBe(11);
  });

  it('offsets lines, handles plain text and empties', () => {
    expect(chunkText('a\nb\n', { lineOffset: 5, markdown: false })[0]).toMatchObject({ startLine: 6, endLine: 7 });
    expect(chunkText('\n\n  \n')).toEqual([]);
    expect(chunkText('\r\nx\r\n')[0]).toMatchObject({ text: 'x', startLine: 2, endLine: 2 });
  });
});

describe('mining a project', () => {
  let project: Project;
  afterEach(() => fs.rmSync(project.root, { recursive: true, force: true }));

  it('knows which paths are documents', () => {
    project = makeProject();
    expect(isSupportedTextPath('docs/guide.md')).toBe(true);
    expect(isSupportedTextPath('notes.TXT')).toBe(true);
    expect(isSupportedTextPath('README')).toBe(true);
    expect(isSupportedTextPath('security.ts')).toBe(false);
    expect(isSupportedTextPath('main.go')).toBe(false);
    expect(isSkippedPath('node_modules/x/README.md')).toBe(true);
    expect(isSkippedPath('.brainfile/board/task-1.md')).toBe(true);
    expect(isSkippedPath('.hidden/notes.md')).toBe(true);
    expect(isSkippedPath('.github/CONTRIBUTING.md')).toBe(false);
    expect(isSkippedPath('docs/dist.md')).toBe(false);
    expect(isUnminableRoot(os.homedir())).toBe(true);
    expect(isUnminableRoot('/')).toBe(true);
  });

  it('lists through git, honouring .gitignore, and always includes root agent instructions', () => {
    project = makeProject({ git: true });
    write(project.root, 'README.md', '# Readme\n');
    write(project.root, 'docs/guide.md', '# Guide\n');
    write(project.root, 'ignored/notes.md', '# Ignored\n');
    write(project.root, 'secret.md', 'secret\n');
    write(project.root, 'src/code.ts', 'export {}\n');
    write(project.root, 'node_modules/pkg/README.md', '# dep\n');
    write(project.root, 'big.md', 'x'.repeat(MAX_FILE_BYTES + 1));
    fs.appendFileSync(path.join(project.root, '.gitignore'), 'CLAUDE.md\n');
    write(project.root, 'CLAUDE.md', '# Local instructions\n');
    const mined = listProjectDocs(project.root);
    expect(mined.via).toBe('git');
    expect(mined.files.map((f) => f.rel)).toEqual(['CLAUDE.md', 'README.md', 'docs/guide.md']);
  });

  it('walks outside git with the same skip list, and stops at a ceiling', () => {
    project = makeProject();
    write(project.root, 'README.md', '# Readme\n');
    write(project.root, 'a/one.md', '1');
    write(project.root, 'a/two.txt', '2');
    write(project.root, 'dist/out.md', 'built');
    write(project.root, '.cache/x.md', 'cached');
    const mined = listProjectDocs(project.root);
    expect(mined.via).toBe('walk');
    expect(mined.files.map((f) => f.rel)).toEqual(['README.md', 'a/one.md', 'a/two.txt']);
    expect(listProjectDocs(project.root, { maxFiles: 1 }).files).toHaveLength(1);
    expect(listProjectDocs(path.join(project.root, 'missing')).via).toBe('none');
  });
});

describe('the local index', () => {
  let project: Project;
  beforeEach(() => {
    project = makeProject({ git: true });
    write(project.root, 'README.md', '# Widget service\n\nThe widget service renders dashboards.\n\n## Deploying\n\nDeploy with the release pipeline.\n');
    write(project.root, 'docs/http.md', '# HTTP client\n\nOutbound requests go through undici with retries.\n');
    writeTaskFile(path.join(project.boardDir, 'task-1.md'), { id: 'task-1', title: 'Fix auth bug', column: 'todo', priority: 'high', tags: ['auth'], assignee: 'codex' }, '## Description\nAuthentication fails on mobile\n');
    writeTaskFile(path.join(project.boardDir, 'task-2.md'), { id: 'task-2', title: 'Add rate limiter', column: 'in-progress' }, '## Description\nToken bucket rate limiting\n');
    writeTaskFile(path.join(project.boardDir, 'decision-2.md'), { id: 'decision-2', title: 'Use undici for HTTP', type: 'decision', status: 'current', claimKey: 'dependency.http-client', supersedes: 'decision-1' });
    writeTaskFile(path.join(project.logsDir, 'decision-1.md'), { id: 'decision-1', title: 'Use axios for HTTP', type: 'decision', status: 'superseded', supersededBy: 'decision-2', claimKey: 'dependency.http-client' });
    writeTaskFile(path.join(project.logsDir, 'task-3.md'), { id: 'task-3', title: 'Auth refactor', completedAt: '2026-02-17T10:00:00Z' }, '## Description\nRefactored authentication\n');
    appendLedgerRecord(project.logsDir, { id: 'task-3', type: 'task', title: 'Auth refactor', filesChanged: [], createdAt: '2026-02-01T00:00:00Z', completedAt: '2026-02-17T10:00:00Z', cycleTimeHours: 1, summary: 'auth refactor shipped' });
    appendLedgerRecord(project.logsDir, { id: 'task-0', type: 'task', title: 'Ancient auth fix', filesChanged: ['src/auth.ts'], createdAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-02T00:00:00Z', cycleTimeHours: 24, summary: 'only in the ledger' });
    write(project.root, '.brainfile/plans/http-plan.md', '# HTTP plan\n\nMove every client to undici.\n');
  });
  afterEach(() => {
    setSqliteLoaderForTesting(undefined);
    delete process.env.BRAINFILE_INDEX;
    fs.rmSync(project.root, { recursive: true, force: true });
  });

  itIndex('indexes board, logs, ledger, plans and the project, and tracks files by size, mtime and hash', () => {
    const index = MemoryIndex.open(project.brainfilePath)!;
    try {
      expect(index.path).toBe(getIndexPath(project.brainfilePath));
      expect(fs.readFileSync(path.join(project.root, '.brainfile', '.gitignore'), 'utf-8')).toContain('state/');
      const first = index.refresh();
      expect(first).toMatchObject({ added: 9, updated: 0, removed: 0, via: 'git', busy: false, incomplete: false });
      const status = index.status();
      expect(status.files).toEqual({ board: 3, logs: 2, ledger: 1, plans: 1, repo: 2 });
      expect(status.chunks.ledger).toBe(2);
      expect(status.lastRefresh).toBeDefined();

      expect(index.refresh()).toMatchObject({ added: 0, updated: 0, unchanged: 9 });

      // Same content, new mtime: hashed, not re-chunked.
      const readme = path.join(project.root, 'README.md');
      const later = new Date(Date.now() + 5000);
      fs.utimesSync(readme, later, later);
      expect(index.refresh()).toMatchObject({ updated: 0, unchanged: 9 });

      // A changed file replaces its chunks; a deleted one drops out.
      fs.writeFileSync(readme, '# Widget service\n\nNow with gizmos.\n');
      fs.rmSync(path.join(project.root, 'docs', 'http.md'));
      expect(index.refresh()).toMatchObject({ updated: 1, removed: 1 });
      expect(index.search('gizmos')!.current.map((h) => h.path)).toEqual(['README.md']);
      expect(index.search('dashboards')!.current).toEqual([]);
      expect(index.search('retries')!.current).toEqual([]);
    } finally {
      index.close();
    }
  });

  itIndex('ranks AND before OR, keeps history in its own lane, and gives every hit a path and lines', () => {
    const index = MemoryIndex.open(project.brainfilePath)!;
    try {
      index.refresh();
      const http = index.search('undici http')!;
      expect(http.current[0]).toMatchObject({ id: 'decision-2', source: 'board', role: 'decision', status: 'current', lane: 'current', claimKey: 'dependency.http-client' });
      expect(http.current.map((h) => h.id)).toEqual(expect.arrayContaining(['docs/http.md:1-3']));
      const doc = http.current.find((h) => h.source === 'repo')!;
      expect(doc).toMatchObject({ path: 'docs/http.md', startLine: 1, endLine: 3, title: 'HTTP client' });
      expect(doc.snippet).toContain('undici');
      expect(http.history.map((h) => h.id)).toEqual(['decision-1']);
      expect(http.history[0]).toMatchObject({ status: 'superseded', isLog: true });

      // OR fills in when AND finds too little.
      const loose = index.search('undici dashboards')!;
      expect(loose.current.map((h) => h.path)).toEqual(expect.arrayContaining(['README.md', 'docs/http.md']));

      // A document beats its own ledger record; a ledger-only record is still found.
      const auth = index.search('auth')!;
      expect(auth.current.map((h) => h.id)).toEqual(['task-1']);
      expect(auth.history.map((h) => [h.id, h.source])).toEqual(expect.arrayContaining([['task-3', 'logs'], ['task-0', 'ledger']]));
      expect(auth.history.filter((h) => h.id === 'task-3')).toHaveLength(1);
      expect(auth.history.find((h) => h.id === 'task-0')).toMatchObject({ path: '.brainfile/logs/ledger.jsonl', startLine: 2, endLine: 2 });
    } finally {
      index.close();
    }
  });

  itIndex('applies filter tokens to board documents only, and exact IDs first', () => {
    const index = MemoryIndex.open(project.brainfilePath)!;
    try {
      index.refresh();
      expect(index.search('p:high auth')!.current.map((h) => h.id)).toEqual(['task-1']);
      expect(index.search('auth', { filters: { priority: 'low' } })!.current).toEqual([]);
      expect(index.search('@codex auth')!.current.map((h) => h.id)).toEqual(['task-1']);
      expect(index.search('#auth fix')!.current.map((h) => h.id)).toEqual(['task-1']);
      const column = index.search('rate', { filters: { column: 'in-progress' } })!;
      expect(column.current.map((h) => h.id)).toEqual(['task-2']);
      expect(column.history).toEqual([]);
      expect(index.search('type:decision http')!.current.map((h) => h.id)).toEqual(['decision-2']);
      expect(index.search('p:high')).toBeNull();
      expect(index.search('task-2')!.current[0].id).toBe('task-2');
      expect(index.search('dependency.http-client')!.current[0].id).toBe('decision-2');
      expect(index.search('http', { sources: ['repo', 'plans'] })!.current.every((h) => h.source === 'repo' || h.source === 'plans')).toBe(true);
      expect(index.search('http', { role: 'work' })!.current.every((h) => h.role !== 'decision')).toBe(true);
      expect(index.search('http', { sources: [] })).toEqual({ current: [], history: [] });
      expect(index.decisionCandidates('switch to axios', { ignoreWords: ACTION_CUE_WORDS })).toEqual(['decision-1']);
      expect(index.decisionCandidates('http client').sort()).toEqual(['decision-1', 'decision-2']);
      expect(index.decisionCandidates('use', { ignoreWords: ACTION_CUE_WORDS })).toEqual([]);
    } finally {
      index.close();
    }
  });

  itIndex('honours a refresh deadline, then catches up', () => {
    const index = MemoryIndex.open(project.brainfilePath)!;
    try {
      const cut = index.refresh({ deadline: Date.now() - 1 });
      expect(cut.incomplete).toBe(true);
      expect(cut.skipped).toBe(9);
      expect(index.refresh()).toMatchObject({ added: 9, incomplete: false });
    } finally {
      index.close();
    }
  });

  itIndex('re-reads board documents when the board types change, and rebuilds on demand', () => {
    const index = MemoryIndex.open(project.brainfilePath)!;
    try {
      index.refresh();
      fs.appendFileSync(project.brainfilePath, '');
      const config = fs.readFileSync(project.brainfilePath, 'utf-8').replace('columns:', 'types:\n  bug:\n    like: task\ncolumns:');
      fs.writeFileSync(project.brainfilePath, config);
      expect(index.refresh().updated).toBe(5);
      expect(index.rebuild()).toMatchObject({ added: 9 });
    } finally {
      index.close();
    }
  });

  itIndex('starts over from a corrupt file, and does not create one when asked not to', () => {
    const dbPath = getIndexPath(project.brainfilePath);
    expect(MemoryIndex.open(project.brainfilePath, { create: false })).toBeNull();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, 'this is not a database');
    const index = MemoryIndex.open(project.brainfilePath)!;
    expect(index).not.toBeNull();
    expect(index.refresh().added).toBe(9);
    index.close();
    const again = MemoryIndex.open(project.brainfilePath, { create: false })!;
    expect(again.status().totalFiles).toBe(9);
    again.close();
  });

  itIndex('searchMemory uses the index and keeps lanes', () => {
    const result = searchMemory(project.brainfilePath, 'auth');
    expect(result.mode).toBe('index');
    expect(result.refresh?.added).toBe(9);
    expect(result.results.map((h) => h.lane)).toEqual(['current', 'history', 'history']);
    expect(result.count).toBe(3);
  });

  it('falls back to the scan when node:sqlite is unavailable', () => {
    setSqliteLoaderForTesting(() => null);
    expect(loadSqlite()).toBeNull();
    expect(MemoryIndex.open(project.brainfilePath)).toBeNull();
    const result = searchMemory(project.brainfilePath, 'auth');
    expect(result.mode).toBe('scan');
    expect(result.current.map((h) => h.id)).toEqual(['task-1']);
    expect(result.history.map((h) => h.id)).toEqual(['task-3']);
    expect(result.current[0]).toMatchObject({ path: '.brainfile/board/task-1.md', startLine: 1, column: 'todo', priority: 'high' });
    expect(result.current[0].endLine).toBeGreaterThan(1);
    expect(fs.existsSync(getIndexPath(project.brainfilePath))).toBe(false);
  });

  it('falls back with BRAINFILE_INDEX=off, and for filter-only queries', () => {
    process.env.BRAINFILE_INDEX = 'off';
    expect(indexDisabledByEnv()).toBe(true);
    expect(searchMemory(project.brainfilePath, 'auth').mode).toBe('scan');
    delete process.env.BRAINFILE_INDEX;
    expect(indexDisabledByEnv({ BRAINFILE_INDEX: '0' })).toBe(true);
    expect(indexDisabledByEnv({})).toBe(false);
    const filterOnly = searchMemory(project.brainfilePath, 'p:high');
    expect(filterOnly.mode).toBe('scan');
    expect(filterOnly.current.map((h) => h.id)).toEqual(['task-1']);
  });

  it('scans decisions into lanes by status and skips logs under a column filter', () => {
    const scan = scanSearch(project.brainfilePath, 'http');
    expect(scan.current.map((h) => h.id)).toEqual(['decision-2']);
    expect(scan.history.map((h) => [h.id, h.status])).toEqual([['decision-1', 'superseded']]);
    expect(scanSearch(project.brainfilePath, 'auth', { filters: { column: 'todo' } }).history).toEqual([]);
    expect(scanSearch(project.brainfilePath, 'auth', { sources: ['logs'] }).current).toEqual([]);
    expect(scanSearch(project.brainfilePath, 'a', { limit: 1 }).current.length).toBeLessThanOrEqual(1);
  });
});

describe('ftsTerms', () => {
  it('makes phrases of compound words and prefixes of longer tokens', () => {
    expect(ftsTerms('fix the auth bug')).toEqual(['"fix"*', '"auth"*', '"bug"*']);
    expect(ftsTerms('task-1 dependency.http-client')).toEqual(['"task 1"', '"dependency http client"*']);
    expect(ftsTerms('use axios', new Set(['use']))).toEqual(['"axios"*']);
    expect(ftsTerms('the of')).toEqual(['"the"*', '"of"']);
    expect(ftsTerms('!!!')).toEqual([]);
  });
});
