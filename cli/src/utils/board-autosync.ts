/**
 * Autosync (spec-9 phase 3): keep a shared board flowing without anyone
 * typing `sync`.
 *
 *   push  after every committed mutation, a detached `brainfile sync --push`
 *         runs a few seconds later so bursts collapse into one push and the
 *         mutation itself never waits on the network
 *   full  additionally fetch before a read when the last sync is older than
 *         a minute
 *
 * `BRAINFILE_AUTOSYNC=off|push|full` overrides the board's config for one
 * process (tests and CI set `off`).
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { isTrackedBoard, onBoardCommitted } from './board-repo';
import { type AutosyncMode, type SyncResult, boardAutosync, boardRemote, secondsSinceSync, syncBoard } from './board-sync';

export const AUTOSYNC_DELAY_MS = 5000;
export const FETCH_MAX_AGE_SECONDS = 60;
const LOCK_FILE = path.join('state', 'autosync.lock');
/** A pending push older than this is assumed dead (crashed child). */
const LOCK_STALE_MS = 60_000;

export function effectiveAutosync(dotDir: string): AutosyncMode {
  const override = process.env.BRAINFILE_AUTOSYNC;
  if (override === 'off' || override === 'push' || override === 'full') return override;
  return boardAutosync(dotDir);
}

/** The runnable CLI: the bundle we live in, or the built one next to the sources. */
export function autosyncCliPath(): string | null {
  const candidates = [
    path.join(__dirname, 'cli.js'),
    path.join(__dirname, '..', 'cli.js'),
    path.join(__dirname, '..', '..', 'dist', 'cli.js'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pushPending(dotDir: string): boolean {
  const lock = path.join(dotDir, LOCK_FILE);
  try {
    const st = fs.statSync(lock);
    if (Date.now() - st.mtimeMs > LOCK_STALE_MS) return false;
    const pid = Number.parseInt(fs.readFileSync(lock, 'utf-8'), 10);
    return Number.isFinite(pid) && pidAlive(pid);
  } catch {
    return false;
  }
}

export function clearPushLock(dotDir: string): void {
  try {
    fs.rmSync(path.join(dotDir, LOCK_FILE), { force: true });
  } catch {
    /* nothing to clear */
  }
}

/**
 * Queue a background push for the board. Returns true when a child was
 * started; false when autosync is off, no remote is set, a push is already
 * pending (it will carry this commit too), or there is no CLI to run.
 */
export function schedulePush(dotDir: string, delayMs = AUTOSYNC_DELAY_MS): boolean {
  if (!isTrackedBoard(dotDir)) return false;
  const mode = effectiveAutosync(dotDir);
  if (mode === 'off' || !boardRemote(dotDir)) return false;
  if (pushPending(dotDir)) return false;
  const cli = autosyncCliPath();
  if (!cli) return false;
  const delay = process.env.BRAINFILE_AUTOSYNC_DELAY_MS ? Number(process.env.BRAINFILE_AUTOSYNC_DELAY_MS) : delayMs;
  try {
    const child = spawn(
      process.execPath,
      [cli, 'sync', '--push', '--file', path.join(dotDir, 'brainfile.md'), '--wait', String(delay)],
      { cwd: dotDir, detached: true, stdio: 'ignore', env: { ...process.env, BRAINFILE_AUTOSYNC: 'off' } }
    );
    child.unref();
    if (child.pid) {
      fs.mkdirSync(path.join(dotDir, 'state'), { recursive: true });
      fs.writeFileSync(path.join(dotDir, LOCK_FILE), String(child.pid), 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * In `full` mode, bring the board up to date before a read when the last
 * sync attempt is older than `maxAgeSeconds`. Returns the sync result, or
 * null when nothing was fetched.
 */
export function fetchBeforeRead(dotDir: string, maxAgeSeconds = FETCH_MAX_AGE_SECONDS): SyncResult | null {
  if (!isTrackedBoard(dotDir)) return null;
  if (effectiveAutosync(dotDir) !== 'full') return null;
  const age = secondsSinceSync(dotDir);
  if (age !== null && age < maxAgeSeconds) return null;
  return syncBoard(dotDir, { pull: true, push: false });
}

let installed = false;
/** Push after every successful board commit made by this process. */
export function installAutosync(): void {
  if (installed) return;
  installed = true;
  onBoardCommitted((dotDir) => {
    schedulePush(dotDir);
  });
}
