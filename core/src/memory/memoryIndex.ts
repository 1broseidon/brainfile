/**
 * The local index (spec-11): `.brainfile/state/index.db`, SQLite with FTS5
 * through `node:sqlite`. Local to the machine, gitignored, rebuildable from
 * the files at any time, never the source of truth.
 *
 * What it holds, each chunk with its path and line range:
 * - board/ and logs/ documents, with their type, role, status, column and
 *   lane (current, or history for completed work and superseded, rejected
 *   or stale decisions);
 * - the ledger, one record per chunk;
 * - the board's `plans/`;
 * - the project's own markdown and text (see `mine.ts`).
 *
 * Every file is tracked by size, mtime and sha256: an unchanged size and
 * mtime skip the read, an unchanged hash skips the re-chunk, a changed file
 * replaces its chunks, and a deleted one drops out. `refresh()` does this
 * incrementally and is called before every read.
 *
 * Search is recoil's: an AND query first, an OR query when that finds too
 * little, ranked by bm25 with the title weighted over the body; current
 * results and history are kept in separate lanes.
 *
 * @packageDocumentation
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Task } from '../types/base';
import type { BoardConfig, TypesConfig } from '../types/board';
import type { LedgerRecord } from '../types/ledger';
import { parseFrontmatter } from '../frontmatter';
import { readBoardConfig } from '../boardFile';
import { getV2Dirs, type V2Dirs } from '../workspace';
import { getBriefStateDir } from '../briefState';
import { ensureDotBrainfileGitignore } from '../utils/files';
import { resolveDocType } from '../docTypes';
import { decisionStatus } from '../docGraph';
import { parseSearchQuery, taskMatchesFilters, type SearchFilters } from '../search';
import { claimKeyOf, isHistoricalStatus, significantTokens, tokenCoverage } from '../decisions';
import { chunkText, firstHeading, type TextChunk } from './chunk';
import { listProjectDocs, type MineResult } from './mine';
import { loadSqlite, type SqliteDatabase, type SqliteStatement } from './sqlite';

export const INDEX_SCHEMA_VERSION = '2';
export const INDEX_FILENAME = 'index.db';

/** Where a chunk comes from. */
export type IndexSource = 'board' | 'logs' | 'ledger' | 'plans' | 'repo';
/** Current results, or history: completed work and decisions that no longer stand. */
export type MemoryLane = 'current' | 'history';

export const INDEX_SOURCES: readonly IndexSource[] = ['board', 'logs', 'ledger', 'plans', 'repo'];

/** `.brainfile/state/index.db` for a board. */
export function getIndexPath(brainfilePath: string): string {
  return path.join(getBriefStateDir(brainfilePath), INDEX_FILENAME);
}

/** One search hit: a board document by ID, or a file by path and line range. */
export interface MemoryHit {
  /** A board document's ID; for a file, `path:start-end`. */
  id: string;
  title: string;
  source: IndexSource;
  lane: MemoryLane;
  /** Relative to the project root (the folder holding `.brainfile/`), `/`-separated. */
  path: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  score: number;
  /** The matching passage, when the index found one. */
  snippet?: string;
  /** For board documents: the canonical type (absent for a plain task). */
  type?: string;
  /** For board documents: `decision`, or the work role (`epic`, `spec`, `plan`, `task`). */
  role?: string;
  /** A decision's status (current, superseded, …); `completed` for completed work. */
  status?: string;
  column?: string;
  completedAt?: string;
  claimKey?: string;
  priority?: string;
  tags?: string[];
  assignee?: string;
  /** True for anything from logs/ or the ledger (kept for older callers). */
  isLog: boolean;
}

export interface RefreshStats {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Files left for the next refresh (deadline reached, or unreadable). */
  skipped: number;
  /** True when a deadline cut the refresh short. */
  incomplete: boolean;
  /** True when another process held the index; nothing was written. */
  busy: boolean;
  /** How the project's own files were listed. */
  via: MineResult['via'];
  ms: number;
}

export interface IndexStatus {
  path: string;
  projectRoot: string;
  schemaVersion: string;
  sizeBytes: number;
  lastRefresh?: string;
  files: Record<IndexSource, number>;
  chunks: Record<IndexSource, number>;
  totalFiles: number;
  totalChunks: number;
}

export interface IndexSearchOptions {
  /** Most hits per lane (default 20). */
  limit?: number;
  /** Structured filters; merged over the `p:`/`#tag`/`@user`/`type:` tokens in the query (explicit values win). */
  filters?: SearchFilters;
  /** Only these sources. */
  sources?: readonly IndexSource[];
  /** Only decisions, or only work. */
  role?: 'decision' | 'work';
  /** Words that never count on their own (dropped from the query unless nothing else is left). */
  ignoreWords?: ReadonlySet<string>;
  /**
   * Keep an OR (loose) match only when it covers at least this share of the
   * query's words (0–1). AND matches always count. For long queries, such as
   * a task's title, where one shared word is not relevance.
   */
  minCoverage?: number;
}

export interface IndexSearchResult {
  current: MemoryHit[];
  history: MemoryHit[];
}

export interface OpenIndexOptions {
  /** Create the database when it does not exist (default true). */
  create?: boolean;
  /** The folder whose own documents are indexed. Defaults to the one holding `.brainfile/`. */
  projectRoot?: string;
}

interface SourceFile {
  /** Relative to the project root, `/`-separated: the key. */
  path: string;
  abs: string;
  source: IndexSource;
  size: number;
  mtimeMs: number;
}

interface ChunkRow {
  path: string;
  source: IndexSource;
  docId: string | null;
  title: string;
  body: string;
  ident: string;
  heading: string | null;
  startLine: number;
  endLine: number;
  lane: MemoryLane;
  type: string | null;
  role: string | null;
  status: string | null;
  column: string | null;
  meta: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime_ms REAL NOT NULL,
  hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  doc_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ident TEXT NOT NULL,
  heading TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  lane TEXT NOT NULL,
  type TEXT,
  role TEXT,
  status TEXT,
  column_id TEXT,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS chunks_path ON chunks(path);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  title, body, ident,
  content='chunks', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, title, body, ident) VALUES (new.id, new.title, new.body, new.ident);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, title, body, ident) VALUES ('delete', old.id, old.title, old.body, old.ident);
END;
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, title, body, ident) VALUES ('delete', old.id, old.title, old.body, old.ident);
  INSERT INTO chunks_fts(rowid, title, body, ident) VALUES (new.id, new.title, new.body, new.ident);
END;
`;

const DROP = `
DROP TRIGGER IF EXISTS chunks_ai;
DROP TRIGGER IF EXISTS chunks_ad;
DROP TRIGGER IF EXISTS chunks_au;
DROP TABLE IF EXISTS chunks_fts;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS meta;
`;

/** bm25 column weights: title, body, ident (IDs, claim keys, tags, subject). */
const BM25_WEIGHTS = '4.0, 1.0, 2.0';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '']);

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function posixRelative(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

function decodeUtf8(data: Buffer): string | null {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

function listMarkdown(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  const visit = (current: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive && depth < 6 && !entry.name.startsWith('.')) visit(abs, depth + 1);
      } else if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) {
        out.push(abs);
      }
    }
  };
  visit(dir, 0);
  return out.sort();
}

function frontmatterLines(text: string): number {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') return i + 1 + (lines[i + 1] === '' ? 1 : 0);
  }
  return 0;
}

/**
 * The FTS5 terms for a query: one per word, stopwords (and `ignore` words)
 * dropped. A single word matches as a prefix (`auth` finds `authentication`);
 * a one-letter word means nothing to a full-text index and is left out, so a
 * query of only those has no terms and the caller scans instead. A word made
 * of several tokens (`task-1`, `dependency.http-client`, `board-repo.ts`) is
 * a phrase, so its parts must be adjacent, its last token a prefix when it
 * has three letters or more (`task-1` does not find `task-12`). At most 32.
 */
export function ftsTerms(query: string, ignore?: ReadonlySet<string>): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const terms: string[] = [];
  const seen = new Set<string>();
  const keep = (tokens: string[]) => {
    const key = tokens.join(' ');
    if (!key || seen.has(key) || terms.length >= 32) return;
    if (tokens.length === 1 && key.length < 2) return;
    seen.add(key);
    const last = tokens[tokens.length - 1];
    terms.push(`"${key}"${tokens.length === 1 || last.length >= 3 ? '*' : ''}`);
  };
  const significant = new Set(significantTokens(query, ignore));
  for (const word of words) {
    const tokens = word.match(/[a-z0-9_]+/g) ?? [];
    if (tokens.length === 0) continue;
    if (tokens.length === 1) {
      if (significant.has(tokens[0])) keep(tokens);
      continue;
    }
    if (tokens.some((t) => significant.has(t))) keep(tokens);
  }
  return terms;
}

function normalizeRank(rank: number): number {
  const abs = Math.abs(rank);
  return abs / (1 + abs);
}

/** A small, fixed nudge by where a file sits: instructions up, fixtures and generated files down. */
function pathPrior(source: IndexSource, rel: string): number {
  if (source !== 'repo') return 0;
  const lower = rel.toLowerCase();
  const base = path.posix.basename(lower);
  const parts = lower.split('/');
  if (base === 'agents.md' || base === 'claude.md') return 0.06;
  if (parts.length === 1 && base.startsWith('readme')) return 0.04;
  if (base.includes('changelog') || base.includes('release-notes')) return -0.05;
  if (parts.some((p) => ['fixtures', 'fixture', 'testdata', '__tests__', 'examples', 'example', 'public', 'static'].includes(p))) return -0.1;
  if (parts.some((p) => p === 'docs' || p === 'doc')) return 0.02;
  return 0;
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** The local index of one board and its project. Open with `MemoryIndex.open`; close when done. */
export class MemoryIndex {
  readonly path: string;
  readonly brainfilePath: string;
  readonly projectRoot: string;
  readonly dirs: V2Dirs;
  private readonly db: SqliteDatabase;
  private statements = new Map<string, SqliteStatement>();

  private constructor(db: SqliteDatabase, dbPath: string, brainfilePath: string, projectRoot: string) {
    this.db = db;
    this.path = dbPath;
    this.brainfilePath = brainfilePath;
    this.projectRoot = projectRoot;
    this.dirs = getV2Dirs(brainfilePath);
  }

  /**
   * Open (or create) the index of a board. Null when `node:sqlite` is not
   * available, the index is turned off, `create: false` and there is none, or
   * the database cannot be opened even after a rebuild.
   */
  static open(brainfilePath: string, options: OpenIndexOptions = {}): MemoryIndex | null {
    const sqlite = loadSqlite();
    if (!sqlite) return null;
    const resolved = path.resolve(brainfilePath);
    const dbPath = getIndexPath(resolved);
    const exists = fs.existsSync(dbPath);
    if (!exists && options.create === false) return null;
    const projectRoot = path.resolve(options.projectRoot ?? path.dirname(path.dirname(resolved)));

    const attempt = (): MemoryIndex => {
      if (!exists) {
        ensureDotBrainfileGitignore(resolved);
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      }
      const db = new sqlite.DatabaseSync(dbPath);
      try {
        db.exec('PRAGMA busy_timeout = 3000');
        try {
          db.exec('PRAGMA journal_mode = WAL');
        } catch {
          // Another process is opening it; the default journal is fine.
        }
        db.exec('PRAGMA synchronous = NORMAL');
        const index = new MemoryIndex(db, dbPath, resolved, projectRoot);
        index.ensureSchema();
        return index;
      } catch (err) {
        db.close();
        throw err;
      }
    };

    try {
      return attempt();
    } catch {
      // A corrupt or foreign file: the index is rebuildable, so start over once.
      try {
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
        return attempt();
      } catch {
        return null;
      }
    }
  }

  close(): void {
    this.statements.clear();
    try {
      this.db.close();
    } catch {
      // Already closed.
    }
  }

  private stmt(sql: string): SqliteStatement {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private getMeta(key: string): string | undefined {
    const row = this.stmt('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? String(row.value) : undefined;
  }

  private setMeta(key: string, value: string): void {
    this.stmt('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  private ensureSchema(): void {
    let version: string | undefined;
    try {
      version = this.getMeta('schema_version');
    } catch {
      version = undefined;
    }
    if (version === INDEX_SCHEMA_VERSION) return;
    this.statements.clear();
    this.db.exec(DROP);
    this.db.exec(SCHEMA);
    this.setMeta('schema_version', INDEX_SCHEMA_VERSION);
  }

  /** Drop everything and index from scratch. */
  rebuild(): RefreshStats {
    this.statements.clear();
    this.db.exec(DROP);
    this.db.exec(SCHEMA);
    this.setMeta('schema_version', INDEX_SCHEMA_VERSION);
    return this.refresh();
  }

  private boardConfig(): BoardConfig | null {
    return readBoardConfig(this.dirs.brainfilePath)?.config ?? null;
  }

  private collectFiles(): { files: SourceFile[]; via: MineResult['via'] } {
    const files: SourceFile[] = [];
    const add = (abs: string, source: IndexSource) => {
      try {
        const stat = fs.statSync(abs);
        if (!stat.isFile()) return;
        files.push({ path: posixRelative(this.projectRoot, abs), abs, source, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // Gone between listing and stat.
      }
    };
    for (const abs of listMarkdown(this.dirs.boardDir, false)) if (abs.endsWith('.md')) add(abs, 'board');
    for (const abs of listMarkdown(this.dirs.logsDir, false)) if (abs.endsWith('.md')) add(abs, 'logs');
    add(path.join(this.dirs.logsDir, 'ledger.jsonl'), 'ledger');
    for (const abs of listMarkdown(path.join(this.dirs.dotDir, 'plans'), true)) add(abs, 'plans');

    const mined = listProjectDocs(this.projectRoot);
    const dotPrefix = posixRelative(this.projectRoot, this.dirs.dotDir);
    for (const file of mined.files) {
      if (dotPrefix && (file.rel === dotPrefix || file.rel.startsWith(`${dotPrefix}/`))) continue;
      files.push({ path: file.rel, abs: file.abs, source: 'repo', size: file.size, mtimeMs: file.mtimeMs });
    }
    return { files, via: mined.via };
  }

  /**
   * Bring the index up to date with the files: unchanged files (same size and
   * mtime, or same hash) are left alone, changed ones replace their chunks,
   * deleted ones drop out. With a `deadline` (epoch ms), files not reached in
   * time are left for the next refresh. When another process is writing the
   * index, nothing is done and `busy` is set.
   */
  refresh(options: { deadline?: number } = {}): RefreshStats {
    const started = Date.now();
    const stats: RefreshStats = { added: 0, updated: 0, unchanged: 0, removed: 0, skipped: 0, incomplete: false, busy: false, via: 'none', ms: 0 };
    const config = this.boardConfig();
    const typesKey = sha256(JSON.stringify(config?.types ?? {}));
    const typesChanged = this.getMeta('types_key') !== typesKey;
    const { files, via } = this.collectFiles();
    stats.via = via;

    const known = new Map<string, { size: number; mtime: number; hash: string; source: string }>();
    for (const row of this.stmt('SELECT path, source, size, mtime_ms, hash FROM sources').all()) {
      known.set(String(row.path), { size: Number(row.size), mtime: Number(row.mtime_ms), hash: String(row.hash), source: String(row.source) });
    }

    try {
      this.db.exec('BEGIN IMMEDIATE');
    } catch {
      stats.busy = true;
      stats.ms = Date.now() - started;
      return stats;
    }

    try {
      const seen = new Set<string>();
      const now = new Date().toISOString();
      for (const file of files) {
        if (seen.has(file.path)) continue;
        seen.add(file.path);
        const prev = known.get(file.path);
        const forced = typesChanged && (file.source === 'board' || file.source === 'logs');
        if (prev && !forced && prev.source === file.source && prev.size === file.size && prev.mtime === file.mtimeMs) {
          stats.unchanged++;
          continue;
        }
        if (options.deadline !== undefined && Date.now() > options.deadline) {
          stats.incomplete = true;
          stats.skipped++;
          continue;
        }
        let data: Buffer;
        try {
          data = fs.readFileSync(file.abs);
        } catch {
          stats.skipped++;
          continue;
        }
        const hash = sha256(data);
        if (prev && !forced && prev.source === file.source && prev.hash === hash) {
          this.stmt('UPDATE sources SET size = ?, mtime_ms = ? WHERE path = ?').run(file.size, file.mtimeMs, file.path);
          stats.unchanged++;
          continue;
        }
        const content = decodeUtf8(data);
        const rows = content === null ? [] : this.chunksFor(file, content, config?.types);
        this.stmt('DELETE FROM chunks WHERE path = ?').run(file.path);
        const insert = this.stmt(`INSERT INTO chunks
          (path, source, doc_id, title, body, ident, heading, start_line, end_line, lane, type, role, status, column_id, meta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of rows) {
          insert.run(row.path, row.source, row.docId, row.title, row.body, row.ident, row.heading, row.startLine, row.endLine,
            row.lane, row.type, row.role, row.status, row.column, row.meta);
        }
        this.stmt(`INSERT INTO sources(path, source, size, mtime_ms, hash, indexed_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(path) DO UPDATE SET source = excluded.source, size = excluded.size, mtime_ms = excluded.mtime_ms,
          hash = excluded.hash, indexed_at = excluded.indexed_at`).run(file.path, file.source, file.size, file.mtimeMs, hash, now);
        if (prev) stats.updated++;
        else stats.added++;
      }
      for (const key of known.keys()) {
        if (seen.has(key)) continue;
        this.stmt('DELETE FROM chunks WHERE path = ?').run(key);
        this.stmt('DELETE FROM sources WHERE path = ?').run(key);
        stats.removed++;
      }
      if (!stats.incomplete) this.setMeta('types_key', typesKey);
      this.setMeta('last_refresh', now);
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Nothing to roll back.
      }
      throw err;
    }
    stats.ms = Date.now() - started;
    return stats;
  }

  private chunksFor(file: SourceFile, content: string, types: TypesConfig | undefined): ChunkRow[] {
    if (file.source === 'ledger') return this.ledgerChunks(file, content);
    if (file.source === 'board' || file.source === 'logs') {
      const rows = this.boardChunks(file, content, types);
      if (rows) return rows;
    }
    return this.fileChunks(file, content);
  }

  private boardChunks(file: SourceFile, content: string, types: TypesConfig | undefined): ChunkRow[] | null {
    const parsed = parseFrontmatter<Task>(content);
    if (!parsed || !parsed.data || typeof parsed.data.id !== 'string' || typeof parsed.data.title !== 'string') return null;
    const task = parsed.data;
    const resolved = resolveDocType(task.type, types);
    const isDecision = resolved.role === 'decision';
    const status = isDecision
      ? decisionStatus(task as Task & { status?: unknown })
      : file.source === 'logs' || task.completedAt ? 'completed' : 'open';
    const lane: MemoryLane = isDecision
      ? (isHistoricalStatus(status as ReturnType<typeof decisionStatus>) ? 'history' : 'current')
      : status === 'completed' ? 'history' : 'current';
    const record = task as Task & Record<string, unknown>;
    const claimKey = claimKeyOf(task);
    const tags = Array.isArray(task.tags) ? task.tags.filter((t): t is string => typeof t === 'string') : [];
    // Words that say what a document is about, beyond its title and body. Not
    // its ID or type: a search for "task" should not match every task (an
    // exact ID is looked up directly, and type: filters by type).
    const ident = [
      claimKey ? claimKey.replace(/[.-]/g, ' ') : '',
      ...tags,
      text(record.subject) ?? '',
      text(record.kind) ?? '',
      text(record.stance) ?? '',
    ].filter(Boolean).join(' ');
    const meta = JSON.stringify({
      ...(task.priority ? { priority: task.priority } : {}),
      ...(tags.length ? { tags } : {}),
      ...(text(task.assignee) ? { assignee: text(task.assignee) } : {}),
      ...(text(task.dueDate) ? { dueDate: text(task.dueDate) } : {}),
      ...(task.contract?.status ? { contract: task.contract.status } : {}),
      ...(text(task.completedAt) ? { completedAt: text(task.completedAt) } : {}),
      ...(claimKey ? { claimKey } : {}),
      ...(text(task.parentId) ? { parentId: text(task.parentId) } : {}),
      ...(text(record.supersededBy) ? { supersededBy: text(record.supersededBy) } : {}),
    });
    const description = text(task.description);
    const offset = frontmatterLines(content);
    const chunks: TextChunk[] = chunkText(parsed.body, { lineOffset: offset });
    if (chunks.length === 0) chunks.push({ text: '', startLine: 1, endLine: Math.max(1, offset) });
    if (description) chunks[0] = { ...chunks[0], text: `${description}\n\n${chunks[0].text}`.trim() };
    return chunks.map((chunk) => ({
      path: file.path,
      source: file.source,
      docId: task.id,
      title: task.title,
      body: chunk.text,
      ident,
      heading: chunk.heading ?? null,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      lane,
      type: resolved.name === 'task' ? null : resolved.name,
      role: resolved.role,
      status,
      column: isDecision || file.source === 'logs' ? null : text(task.column) ?? null,
      meta,
    }));
  }

  private ledgerChunks(file: SourceFile, content: string): ChunkRow[] {
    const rows: ChunkRow[] = [];
    content.split('\n').forEach((line, index) => {
      if (!line.trim()) return;
      let record: LedgerRecord;
      try {
        record = JSON.parse(line);
      } catch {
        return;
      }
      if (!record || typeof record.id !== 'string') return;
      const files = Array.isArray(record.filesChanged) ? record.filesChanged.join(' ') : '';
      const tags = Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === 'string') : [];
      rows.push({
        path: file.path,
        source: 'ledger',
        docId: record.id,
        title: typeof record.title === 'string' ? record.title : record.id,
        body: [typeof record.summary === 'string' ? record.summary : '', files ? `Files: ${files}` : ''].filter(Boolean).join('\n'),
        ident: tags.join(' '),
        heading: null,
        startLine: index + 1,
        endLine: index + 1,
        lane: 'history',
        type: typeof record.type === 'string' && record.type !== 'task' ? record.type : null,
        role: record.type === 'adr' ? 'decision' : 'task',
        status: 'completed',
        column: null,
        meta: JSON.stringify({
          ...(record.priority ? { priority: record.priority } : {}),
          ...(tags.length ? { tags } : {}),
          ...(text(record.assignee) ? { assignee: text(record.assignee) } : {}),
          ...(text(record.completedAt) ? { completedAt: text(record.completedAt) } : {}),
          ...(record.contractStatus ? { contract: record.contractStatus } : {}),
        }),
      });
    });
    return rows;
  }

  private fileChunks(file: SourceFile, content: string): ChunkRow[] {
    const ext = path.posix.extname(file.path).toLowerCase();
    const markdown = MARKDOWN_EXTENSIONS.has(ext);
    const docTitle = (markdown ? firstHeading(content) : undefined) ?? path.posix.basename(file.path);
    return chunkText(content, { markdown }).map((chunk) => ({
      path: file.path,
      source: file.source,
      docId: null,
      title: chunk.heading && chunk.heading !== docTitle ? `${docTitle} › ${chunk.heading}` : docTitle,
      body: chunk.text,
      ident: file.path.replace(/[/._-]+/g, ' '),
      heading: chunk.heading ?? null,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      lane: 'current' as MemoryLane,
      type: null,
      role: null,
      status: null,
      column: null,
      meta: null,
    }));
  }

  /** Counts by source, size on disk and the last refresh. */
  status(): IndexStatus {
    const empty = (): Record<IndexSource, number> => ({ board: 0, logs: 0, ledger: 0, plans: 0, repo: 0 });
    const files = empty();
    const chunks = empty();
    for (const row of this.stmt('SELECT source, COUNT(*) AS n FROM sources GROUP BY source').all()) {
      files[String(row.source) as IndexSource] = Number(row.n);
    }
    for (const row of this.stmt('SELECT source, COUNT(*) AS n FROM chunks GROUP BY source').all()) {
      chunks[String(row.source) as IndexSource] = Number(row.n);
    }
    let sizeBytes = 0;
    for (const suffix of ['', '-wal']) {
      try {
        sizeBytes += fs.statSync(`${this.path}${suffix}`).size;
      } catch {
        // No WAL file.
      }
    }
    const lastRefresh = this.getMeta('last_refresh');
    return {
      path: this.path,
      projectRoot: this.projectRoot,
      schemaVersion: INDEX_SCHEMA_VERSION,
      sizeBytes,
      ...(lastRefresh ? { lastRefresh } : {}),
      files,
      chunks,
      totalFiles: Object.values(files).reduce((a, b) => a + b, 0),
      totalChunks: Object.values(chunks).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Search the index. Null when the query has no words to search on (a
   * filter-only query such as `p:high`): the caller falls back to the scan.
   */
  search(query: string, options: IndexSearchOptions = {}): IndexSearchResult | null {
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const parsed = parseSearchQuery(query);
    const filters: SearchFilters = {};
    for (const [key, value] of Object.entries({ ...parsed, ...definedOnly(options.filters) })) {
      if (key !== 'text' && value !== undefined && value !== '') (filters as Record<string, unknown>)[key] = value;
    }
    const terms = ftsTerms(parsed.text, options.ignoreWords);
    if (terms.length === 0) return null;
    const exactId = parsed.text.trim();

    const structural = Object.keys(filters).length > 0;
    let sources = (options.sources ?? INDEX_SOURCES).filter((s) => INDEX_SOURCES.includes(s));
    if (structural) sources = sources.filter((s) => s === 'board' || s === 'logs' || s === 'ledger');
    if (filters.column) sources = sources.filter((s) => s === 'board');
    if (sources.length === 0) return { current: [], history: [] };

    const where: string[] = [`chunks.source IN (${sources.map(() => '?').join(', ')})`];
    const params: unknown[] = [...sources];
    if (options.role === 'decision') where.push(`chunks.role = 'decision'`);
    if (options.role === 'work') where.push(`(chunks.role IS NULL OR chunks.role != 'decision')`);
    const sql = `SELECT chunks.*, bm25(chunks_fts, ${BM25_WEIGHTS}) AS rank,
        snippet(chunks_fts, 1, '', '', '…', 16) AS snippet
      FROM chunks_fts JOIN chunks ON chunks.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ? AND ${where.join(' AND ')}
      ORDER BY rank LIMIT ?`;
    const sqlLimit = Math.max(limit * 6, 60);

    const best = new Map<string, MemoryHit>();
    const coverageTokens = options.minCoverage ? significantTokens(parsed.text, options.ignoreWords) : [];
    const consider = (row: Record<string, unknown>, strict: boolean) => {
      if (!strict && options.minCoverage
        && tokenCoverage(coverageTokens, `${row.title}\n${row.body}\n${row.ident}`) < options.minCoverage) return;
      const hit = this.hitFromRow(row);
      if (structural && !this.rowMatchesFilters(hit, row, filters)) return;
      hit.score = normalizeRank(Number(row.rank)) + (strict ? 1 : 0) + pathPrior(hit.source, hit.path)
        + (hit.role === 'decision' && hit.lane === 'current' ? 0.05 : 0)
        + (exactId && hit.id.toLowerCase() === exactId ? 10 : 0);
      hit.score = Math.round(hit.score * 10000) / 10000;
      const key = hit.source === 'board' || hit.source === 'logs' || hit.source === 'ledger' ? `doc:${hit.id}` : `file:${hit.path}`;
      const existing = best.get(key);
      // A document beats its own ledger record; otherwise the better chunk wins.
      if (!existing
        || (existing.source === 'ledger' && hit.source !== 'ledger')
        || (hit.score > existing.score && !(hit.source === 'ledger' && existing.source !== 'ledger'))) {
        best.set(key, hit);
      }
    };
    const run = (match: string, strict: boolean) => {
      for (const row of this.stmt(sql).all(match, ...params, sqlLimit)) consider(row, strict);
    };
    run(terms.join(' AND '), true);
    if (best.size < limit && terms.length > 1) run(terms.join(' OR '), false);

    // An exact ID that the words did not reach (e.g. `task-1` against many tasks).
    if (exactId && /^[a-z0-9][\w-]*-\d+$/i.test(exactId) && !best.has(`doc:${exactId}`)) {
      const row = this.db.prepare(`SELECT chunks.*, 0 AS rank, NULL AS snippet FROM chunks
        WHERE doc_id = ? AND source IN (${sources.map(() => '?').join(', ')}) ORDER BY start_line LIMIT 1`).get(exactId, ...sources);
      if (row) consider(row, true);
    }

    const hits = [...best.values()].sort((a, b) => b.score - a.score);
    return {
      current: hits.filter((h) => h.lane === 'current').slice(0, limit),
      history: hits.filter((h) => h.lane === 'history').slice(0, limit),
    };
  }

  private hitFromRow(row: Record<string, unknown>): MemoryHit {
    const meta = parseMeta(row.meta);
    const source = String(row.source) as IndexSource;
    const rel = String(row.path);
    const start = Number(row.start_line);
    const end = Number(row.end_line);
    const docId = typeof row.doc_id === 'string' && row.doc_id ? row.doc_id : null;
    const snippet = typeof row.snippet === 'string' && row.snippet.trim()
      ? row.snippet.replace(/\s+/g, ' ').trim()
      : undefined;
    return {
      id: docId ?? `${rel}:${start}-${end}`,
      title: String(row.title),
      source,
      lane: String(row.lane) === 'history' ? 'history' : 'current',
      path: rel,
      startLine: start,
      endLine: end,
      score: 0,
      ...(snippet ? { snippet } : {}),
      ...(typeof row.type === 'string' && row.type ? { type: row.type } : {}),
      ...(typeof row.role === 'string' && row.role ? { role: row.role } : {}),
      ...(typeof row.status === 'string' && row.status ? { status: row.status } : {}),
      ...(typeof row.column_id === 'string' && row.column_id ? { column: row.column_id } : {}),
      ...(typeof meta.completedAt === 'string' ? { completedAt: meta.completedAt } : {}),
      ...(typeof meta.claimKey === 'string' ? { claimKey: meta.claimKey } : {}),
      ...(typeof meta.priority === 'string' ? { priority: meta.priority } : {}),
      ...(Array.isArray(meta.tags) ? { tags: meta.tags as string[] } : {}),
      ...(typeof meta.assignee === 'string' ? { assignee: meta.assignee } : {}),
      isLog: source === 'logs' || source === 'ledger',
    };
  }

  private rowMatchesFilters(hit: MemoryHit, row: Record<string, unknown>, filters: SearchFilters): boolean {
    if (hit.source === 'repo' || hit.source === 'plans') return false;
    const meta = parseMeta(row.meta);
    const pseudo: Task = {
      id: hit.id,
      title: hit.title,
      ...(hit.type ? { type: hit.type } : {}),
      ...(hit.column ? { column: hit.column } : {}),
      ...(hit.priority ? { priority: hit.priority as Task['priority'] } : {}),
      ...(hit.tags ? { tags: hit.tags } : {}),
      ...(hit.assignee ? { assignee: hit.assignee } : {}),
      ...(typeof meta.dueDate === 'string' ? { dueDate: meta.dueDate } : {}),
      ...(typeof meta.contract === 'string' ? { contract: { status: meta.contract } as Task['contract'] } : {}),
    };
    return taskMatchesFilters(pseudo, filters);
  }

  /**
   * Documents that share a text's most distinctive words: the query's terms
   * that occur in `sources`, rarest first; the three rarest ANDed, then two,
   * then one, until something matches. How the brief finds the docs that
   * bear on a task from its title, where an OR over every word would match
   * anything that says "board".
   */
  relatedDocs(text: string, options: { limit?: number; sources?: readonly IndexSource[] } = {}): MemoryHit[] {
    const limit = options.limit ?? 2;
    const sources = (options.sources ?? ['repo', 'plans']).filter((s) => INDEX_SOURCES.includes(s));
    if (sources.length === 0) return [];
    const placeholders = sources.map(() => '?').join(', ');
    const countSql = `SELECT count(*) AS n FROM chunks_fts JOIN chunks ON chunks.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ? AND chunks.source IN (${placeholders})`;
    const ranked = ftsTerms(text)
      .map((term) => ({ term, n: Number(this.stmt(countSql).get(term, ...sources)?.n ?? 0) }))
      .filter((t) => t.n > 0)
      .sort((a, b) => a.n - b.n);
    const sql = `SELECT chunks.*, bm25(chunks_fts, ${BM25_WEIGHTS}) AS rank,
        snippet(chunks_fts, 1, '', '', '…', 16) AS snippet
      FROM chunks_fts JOIN chunks ON chunks.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ? AND chunks.source IN (${placeholders})
      ORDER BY rank LIMIT ?`;
    for (let k = Math.min(3, ranked.length); k >= 1; k--) {
      const match = ranked.slice(0, k).map((t) => t.term).join(' AND ');
      const best = new Map<string, MemoryHit>();
      for (const row of this.stmt(sql).all(match, ...sources, limit * 4)) {
        const hit = this.hitFromRow(row);
        hit.score = Math.round((normalizeRank(Number(row.rank)) + k + pathPrior(hit.source, hit.path)) * 10000) / 10000;
        const existing = best.get(hit.path);
        if (!existing || hit.score > existing.score) best.set(hit.path, hit);
      }
      if (best.size > 0) return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    }
    return [];
  }

  /** The decisions whose words best match a text, best first (any status): how `check` finds a claim family. */
  decisionCandidates(query: string, options: { limit?: number; ignoreWords?: ReadonlySet<string> } = {}): string[] {
    const result = this.search(query, {
      limit: options.limit ?? 8,
      sources: ['board', 'logs'],
      role: 'decision',
      ...(options.ignoreWords ? { ignoreWords: options.ignoreWords } : {}),
    });
    if (!result) return [];
    return [...result.current, ...result.history].sort((a, b) => b.score - a.score).map((hit) => hit.id);
  }
}

function definedOnly<T extends object>(value: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, v] of Object.entries(value ?? {})) {
    if (v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}
