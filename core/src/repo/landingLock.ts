/**
 * One landing at a time per repository, across processes (task-76). The
 * desktop and the CLI both land hand-offs, so what keeps them serial is a
 * file they share, `.brainfile/state/landing.lock`, not a queue in one
 * process's memory. It says who holds it (pid, host, when), is made with
 * O_EXCL so only one taker wins, and is taken over once the process that
 * holds it is gone. A landing that finds it held waits, polling with
 * backoff, until it is free or its time is up.
 *
 * The compare-and-swap in landReview already stops a lost update; the lock
 * keeps landings serial, so one does not start again from a tip another is
 * about to move, and keeps the checks from running twice.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const LANDING_LOCK_FILE = 'landing.lock';

/** Who holds the lock, as its file says. */
export interface LandingLockHolder {
  pid: number;
  host: string;
  /** When it was taken (ISO). */
  at: string;
}

export interface LandingLockOptions {
  /** How long to wait for another landing before giving up (ms). A landing's checks can take a while: 30 minutes. */
  timeoutMs?: number;
  /** The first wait between tries (ms); it doubles up to `maxPollMs`. */
  pollMs?: number;
  maxPollMs?: number;
}

export type LandingLock =
  | { ok: true; release: () => void }
  | { ok: false; holder: LandingLockHolder | null; error: string };

const TIMEOUT_MS = 30 * 60_000;
const POLL_MS = 50;
const MAX_POLL_MS = 1000;
/** A lock file that cannot be read is one being written; older than this, its writer died before it finished. */
const HALF_WRITTEN_MS = 5000;
/** Another machine's process cannot be asked whether it lives (a board on a shared disk): its lock is let go after this. */
const OTHER_HOST_MS = 6 * 60 * 60_000;

/** `<state dir>/landing.lock`. */
export function landingLockPath(stateDir: string): string {
  return path.join(stateDir, LANDING_LOCK_FILE);
}

function parse(raw: string): LandingLockHolder | null {
  try {
    const held = JSON.parse(raw) as Partial<LandingLockHolder>;
    return typeof held.pid === 'number' && typeof held.host === 'string' && typeof held.at === 'string' ? (held as LandingLockHolder) : null;
  } catch {
    return null;
  }
}

/** Who holds the lock at `file`; null when nobody does, or its file cannot be read. */
export function readLandingLock(file: string): LandingLockHolder | null {
  try {
    return parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it lives, as another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Whether the lock's holder is gone: its process has ended, or it never finished writing it. */
function gone(file: string, holder: LandingLockHolder | null): boolean {
  if (!holder) {
    try {
      return Date.now() - fs.statSync(file).mtimeMs > HALF_WRITTEN_MS;
    } catch {
      return false;
    }
  }
  if (holder.host === os.hostname()) return !pidAlive(holder.pid);
  const at = Date.parse(holder.at);
  return !Number.isFinite(at) || Date.now() - at > OTHER_HOST_MS;
}

/**
 * Lets a dead holder's lock go. Moved aside first, which only one taker
 * can do, and put back if what was moved is not the file judged dead (a
 * live holder took it meanwhile).
 */
function takeOver(file: string, seen: string): void {
  const aside = `${file}.${process.pid}.${Date.now()}.gone`;
  try {
    fs.renameSync(file, aside);
  } catch {
    return; // Another taker moved it first.
  }
  let moved = '';
  try {
    moved = fs.readFileSync(aside, 'utf-8');
  } catch {
    /* gone already */
  }
  if (moved !== seen) {
    try {
      fs.linkSync(aside, file);
    } catch {
      /* someone holds it anew */
    }
  }
  fs.rmSync(aside, { force: true });
}

/** Takes the lock at `file` now, or says who holds it. A dead holder's lock is taken over. */
export function tryLandingLock(file: string): { ok: true; release: () => void } | { ok: false; holder: LandingLockHolder | null } {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let holder: LandingLockHolder | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const mine = JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() } satisfies LandingLockHolder);
    let fd: number;
    try {
      fd = fs.openSync(file, 'wx');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      let seen = '';
      try {
        seen = fs.readFileSync(file, 'utf-8');
      } catch {
        continue; // Let go between the open and the read: try again.
      }
      holder = parse(seen);
      if (!gone(file, holder)) return { ok: false, holder };
      takeOver(file, seen);
      continue;
    }
    try {
      fs.writeSync(fd, mine);
    } finally {
      fs.closeSync(fd);
    }
    return {
      ok: true,
      release: () => {
        // Only its own: a lock taken over meanwhile is the new holder's.
        try {
          if (fs.readFileSync(file, 'utf-8') === mine) fs.rmSync(file, { force: true });
        } catch {
          /* gone already */
        }
      },
    };
  }
  return { ok: false, holder };
}

function describe(holder: LandingLockHolder | null): string {
  return holder ? ` (pid ${holder.pid} on ${holder.host}, since ${holder.at})` : '';
}

/**
 * Takes the lock at `file`, waiting while another landing holds it: polls,
 * backing off from `pollMs` to `maxPollMs`, until it is free or `timeoutMs`
 * has passed. The first try is made before this returns, so of two calls in
 * one process the first one made takes it.
 */
export async function takeLandingLock(file: string, options: LandingLockOptions = {}): Promise<LandingLock> {
  const deadline = Date.now() + (options.timeoutMs ?? TIMEOUT_MS);
  const maxPoll = options.maxPollMs ?? MAX_POLL_MS;
  let wait = options.pollMs ?? POLL_MS;
  for (;;) {
    const taken = tryLandingLock(file);
    if (taken.ok) return taken;
    const left = deadline - Date.now();
    if (left <= 0) {
      return { ok: false, holder: taken.holder, error: `Another landing in this repository is still going${describe(taken.holder)}: nothing was merged, try again once it is done` };
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, left)));
    wait = Math.min(wait * 2, maxPoll);
  }
}
