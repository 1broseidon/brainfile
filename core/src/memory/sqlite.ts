/**
 * The one place `node:sqlite` is loaded.
 *
 * Loaded lazily, inside try/catch, through `process.getBuiltinModule` (a
 * synchronous, bundler-proof lookup of a Node built-in). Where it is missing
 * (Node below 22.13, where `node:sqlite` is absent or flag-gated, or a Node
 * built without it) or FTS5 is not compiled in, `loadSqlite()` returns null
 * and every caller falls back to the plain scan; nothing fails. The
 * ExperimentalWarning older releases print for SQLite is swallowed, and only
 * that one.
 *
 * `BRAINFILE_INDEX=off` (or `0`, `false`, `no`) forces the fallback.
 *
 * @packageDocumentation
 */

/** The slice of `node:sqlite`'s `StatementSync` the index uses. */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

/** The slice of `node:sqlite`'s `DatabaseSync` the index uses. */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export interface SqliteModule {
  DatabaseSync: new (location: string, options?: Record<string, unknown>) => SqliteDatabase;
}

type Loader = () => SqliteModule | null;

let override: Loader | undefined;
let cached: SqliteModule | null | undefined;

/** True when `BRAINFILE_INDEX` says to stay off the index. */
export function indexDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env.BRAINFILE_INDEX ?? '').trim().toLowerCase();
  return value === 'off' || value === '0' || value === 'false' || value === 'no';
}

function isSqliteExperimentalWarning(warning: unknown, rest: unknown[]): boolean {
  const message = typeof warning === 'string' ? warning : (warning as { message?: unknown } | null)?.message;
  const first = rest[0];
  const type = typeof first === 'string'
    ? first
    : (first as { type?: unknown } | undefined)?.type ?? (warning as { name?: unknown } | null)?.name;
  return /sqlite/i.test(String(message ?? '')) && String(type ?? '') === 'ExperimentalWarning';
}

function requireSqlite(): SqliteModule | null {
  const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltin !== 'function') return null;

  const original = process.emitWarning;
  process.emitWarning = function patched(this: unknown, warning: unknown, ...rest: unknown[]) {
    if (isSqliteExperimentalWarning(warning, rest)) return;
    return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  } as typeof process.emitWarning;

  try {
    const mod = getBuiltin.call(process, 'node:sqlite') as SqliteModule | undefined;
    if (!mod || typeof mod.DatabaseSync !== 'function') return null;
    // FTS5 is what the index needs; a build without it is as good as none.
    const probe = new mod.DatabaseSync(':memory:');
    try {
      probe.exec('CREATE VIRTUAL TABLE probe USING fts5(x)');
    } finally {
      probe.close();
    }
    return mod;
  } catch {
    return null;
  } finally {
    process.emitWarning = original;
  }
}

/**
 * `node:sqlite` with FTS5, or null when this Node cannot give it (or
 * `BRAINFILE_INDEX=off`). Loaded once per process.
 */
export function loadSqlite(): SqliteModule | null {
  if (override) return override();
  if (indexDisabledByEnv()) return null;
  if (cached === undefined) cached = requireSqlite();
  return cached;
}

/** True when the local index can be used in this process. */
export function sqliteAvailable(): boolean {
  return loadSqlite() !== null;
}

/**
 * Replace the loader (tests simulate a Node without `node:sqlite` with
 * `() => null`). Pass undefined to restore the real one.
 */
export function setSqliteLoaderForTesting(loader: Loader | undefined): void {
  override = loader;
  cached = undefined;
}
