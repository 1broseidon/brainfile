/**
 * Board sync (spec-9 phase 2): remote configuration and the fetch → merge →
 * push algorithm for tracked boards. Everything here runs inside the board
 * directory, so the code tree is never touched, and nothing throws on network
 * failure — a mutation must never fail because sync failed.
 *
 * Config keys live in the board's git config (the shared `.git/config` for a
 * linked worktree, its own for a standalone repository):
 *
 *   brainfile.remote        remote name to sync with (never defaults to origin)
 *   brainfile.remoteBranch  branch on that remote (see `boardRemoteBranch`)
 *   brainfile.autosync      off | push | full
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  boardBranch,
  boardRepoKind,
  commitBoard,
  commitHandEdits,
  git,
  homeBoardDir,
  isTrackedBoard,
  unmergedFiles,
} from './board-repo';
import { summarizeFieldChanges } from '../commands/merge-driver';

export const REMOTE_CONFIG_KEY = 'brainfile.remote';
export const REMOTE_BRANCH_CONFIG_KEY = 'brainfile.remoteBranch';
export const AUTOSYNC_CONFIG_KEY = 'brainfile.autosync';
/** Remote name used when `--set-remote` is given a URL instead of a name. */
export const URL_REMOTE_NAME = 'board';
export const MERGE_DRIVER_NAME = 'brainfile';
export const DEFAULT_MERGE_DRIVER_COMMAND = 'brainfile merge-driver %O %A %B';
const SYNC_STATE_FILE = path.join('state', 'sync.json');

export const BOARD_GITATTRIBUTES = [
  'logs/ledger.jsonl merge=union',
  'board/*.md merge=brainfile',
  'logs/*.md merge=brainfile',
  'brainfile.md merge=brainfile',
];

export type AutosyncMode = 'off' | 'push' | 'full';

export interface SyncOptions {
  pull?: boolean;
  push?: boolean;
  agent?: string | null;
}

export interface SyncResult {
  /** True when every requested step succeeded (nothing to do also counts). */
  ok: boolean;
  /** Set when sync did not run at all. */
  skipped?: 'not-tracked' | 'no-remote';
  remote?: string;
  remoteBranch?: string;
  /** Commits brought in from the remote. */
  pulled: number;
  /** Commits sent to the remote. */
  pushed: number;
  /** Files left with conflict markers for a human. */
  conflicts: string[];
  /** One-line, user-facing explanation when `ok` is false. */
  warning?: string;
}

export interface SyncState {
  at: string;
  remote: string;
  remoteBranch: string;
  ok: boolean;
  warning?: string;
}

function configGet(dotDir: string, key: string): string | null {
  const r = git(['config', '--get', key], dotDir);
  return r.ok && r.stdout ? r.stdout : null;
}

function configSet(dotDir: string, key: string, value: string): boolean {
  return git(['config', key, value], dotDir).ok;
}

export function boardRemote(dotDir: string): string | null {
  return configGet(dotDir, REMOTE_CONFIG_KEY);
}

/**
 * Branch name on the remote. Defaults keep the "one private boards repo, one
 * branch per project" pattern from colliding: the board branch name inside a
 * repo, the parent folder's basename for a standalone board, `home` for the
 * global board.
 */
export function boardRemoteBranch(dotDir: string): string {
  const configured = configGet(dotDir, REMOTE_BRANCH_CONFIG_KEY);
  if (configured) return configured;
  if (boardRepoKind(dotDir) === 'linked') return boardBranch(dotDir);
  if (path.resolve(dotDir) === path.resolve(homeBoardDir())) return 'home';
  return path.basename(path.dirname(path.resolve(dotDir))) || boardBranch(dotDir);
}

export function boardAutosync(dotDir: string): AutosyncMode {
  const value = configGet(dotDir, AUTOSYNC_CONFIG_KEY);
  if (value === 'off' || value === 'push' || value === 'full') return value;
  return boardRemote(dotDir) ? 'push' : 'off';
}

export function setBoardAutosync(dotDir: string, mode: AutosyncMode): boolean {
  return configSet(dotDir, AUTOSYNC_CONFIG_KEY, mode);
}

/** True when `target` names a place rather than an existing git remote. */
export function looksLikeRemoteUrl(target: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return true; // ssh://, https://, file://
  if (/^[^/\s]+@[^/\s]+:/.test(target)) return true; // git@host:path
  if (target.startsWith('/') || target.startsWith('.') || target.startsWith('~')) return true;
  if (target.includes('/') && fs.existsSync(target)) return true;
  return false;
}

export interface RemoteSetting {
  remote: string;
  url: string | null;
  remoteBranch: string;
}

/**
 * Point the board at a remote: an existing remote name, or a URL/path that is
 * registered as the `board` remote. Throws an Error naming an unknown remote.
 * `cwd` may be the board directory or, when no board exists yet, the code
 * repository the board will be materialized into.
 */
export function setBoardRemote(cwd: string, target: string, remoteBranch?: string): RemoteSetting {
  const trimmed = target.trim();
  if (!trimmed) throw new Error('remote is required');
  let remote: string;
  if (looksLikeRemoteUrl(trimmed)) {
    remote = URL_REMOTE_NAME;
    const url = trimmed.startsWith('~/') ? path.join(os.homedir(), trimmed.slice(2)) : trimmed;
    const exists = git(['remote', 'get-url', remote], cwd).ok;
    const r = exists ? git(['remote', 'set-url', remote, url], cwd) : git(['remote', 'add', remote, url], cwd);
    if (!r.ok) throw new Error(r.stderr || `could not register remote '${remote}'`);
  } else {
    remote = trimmed;
    if (!git(['remote', 'get-url', remote], cwd).ok) {
      const known = git(['remote'], cwd).stdout.split('\n').filter(Boolean);
      const hint = known.length ? ` Known remotes: ${known.join(', ')}.` : '';
      throw new Error(`'${remote}' is not a git remote here.${hint} Pass a URL to add one.`);
    }
  }
  configSet(cwd, REMOTE_CONFIG_KEY, remote);
  if (remoteBranch) configSet(cwd, REMOTE_BRANCH_CONFIG_KEY, remoteBranch);
  registerMergeDriver(cwd);
  return {
    remote,
    url: git(['remote', 'get-url', remote], cwd).stdout || null,
    remoteBranch: remoteBranch ?? boardRemoteBranch(cwd),
  };
}

/**
 * Register the field-level merge driver in the board's git config. Idempotent;
 * `command` exists for tests, which cannot rely on `brainfile` being on PATH.
 */
export function registerMergeDriver(cwd: string, command = DEFAULT_MERGE_DRIVER_COMMAND): boolean {
  const current = configGet(cwd, `merge.${MERGE_DRIVER_NAME}.driver`);
  if (current === command) return false;
  configSet(cwd, `merge.${MERGE_DRIVER_NAME}.name`, 'brainfile board merge (field-level, last writer wins)');
  return configSet(cwd, `merge.${MERGE_DRIVER_NAME}.driver`, command);
}

/**
 * Make sure `.gitattributes` on the board declares the merge strategies.
 * Returns true when the file was created or extended (caller commits).
 */
export function ensureBoardAttributes(dotDir: string): boolean {
  const file = path.join(dotDir, '.gitattributes');
  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf-8');
  } catch {
    /* absent */
  }
  const lines = existing.split('\n').map((l) => l.trim());
  const missing = BOARD_GITATTRIBUTES.filter((l) => !lines.includes(l));
  if (missing.length === 0) return false;
  const prefix = existing.length > 0 && !existing.endsWith('\n') ? `${existing}\n` : existing;
  fs.writeFileSync(file, `${prefix}${missing.join('\n')}\n`, 'utf-8');
  return true;
}

export function readSyncState(dotDir: string): SyncState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dotDir, SYNC_STATE_FILE), 'utf-8')) as SyncState;
    return typeof parsed?.at === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSyncState(dotDir: string, state: SyncState): void {
  try {
    fs.mkdirSync(path.join(dotDir, 'state'), { recursive: true });
    fs.writeFileSync(path.join(dotDir, SYNC_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  } catch {
    /* state is a convenience; never fail sync over it */
  }
}

function firstLine(text: string): string {
  return text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

function isMissingRemoteRef(stderr: string): boolean {
  return /couldn't find remote ref|Remote branch .* not found|invalid refspec|no such ref/i.test(stderr);
}

function commitCount(dotDir: string, range: string): number {
  const r = git(['rev-list', '--count', range], dotDir);
  return r.ok ? Number.parseInt(r.stdout, 10) || 0 : 0;
}

function identity(dotDir: string, agent?: string | null): { args: string[]; env: NodeJS.ProcessEnv } {
  const args: string[] = ['-c', 'commit.gpgsign=false'];
  if (!git(['config', '--get', 'user.email'], dotDir).ok) {
    args.push('-c', 'user.name=brainfile', '-c', 'user.email=brainfile@localhost');
  }
  const env: NodeJS.ProcessEnv = {};
  const name = agent?.replace(/[\r\n<>]/g, '').trim();
  if (name) {
    env.GIT_AUTHOR_NAME = name;
    env.GIT_AUTHOR_EMAIL = `${name}@brainfile.local`;
  }
  return { args, env };
}

/**
 * Complete-vs-edit: one side archived a task (deleted `board/<id>.md`, wrote
 * `logs/<id>.md`) while the other edited it. Completion wins; the edit is
 * appended to the archived file as a log entry. Returns the paths resolved.
 */
export function resolveCompleteVersusEdit(dotDir: string): string[] {
  const status = git(['status', '--porcelain', '-z'], dotDir);
  if (!status.ok) return [];
  const resolved: string[] = [];
  for (const entry of status.stdout.split('\0')) {
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const file = entry.slice(3);
    if (xy !== 'DU' && xy !== 'UD') continue;
    if (!file.startsWith('board/')) continue;
    // DU: deleted by us, modified by them. UD: the reverse.
    const editedStage = xy === 'DU' ? 3 : 2;
    const base = git(['show', `:1:${file}`], dotDir);
    const edited = git(['show', `:${editedStage}:${file}`], dotDir);
    const archived = path.join(dotDir, 'logs', path.basename(file));
    if (edited.ok && fs.existsSync(archived)) {
      const summary = summarizeFieldChanges(base.ok ? base.stdout : '', edited.stdout);
      const entryLine = `- ${new Date().toISOString()}: [sync] edited elsewhere after completion${summary ? ` (${summary})` : ''}`;
      let content = fs.readFileSync(archived, 'utf-8');
      if (/^## Log\s*$/m.test(content)) {
        content = `${content.replace(/\s+$/, '')}\n${entryLine}\n`;
      } else {
        content = `${content.replace(/\s+$/, '')}\n\n## Log\n${entryLine}\n`;
      }
      fs.writeFileSync(archived, content, 'utf-8');
      git(['add', '--', path.relative(dotDir, archived)], dotDir);
    }
    if (git(['rm', '--quiet', '--cached', '--', file], dotDir).ok) {
      try {
        fs.rmSync(path.join(dotDir, file), { force: true });
      } catch {
        /* already gone */
      }
      resolved.push(file);
    }
  }
  return resolved;
}

/**
 * fetch → fast-forward or merge → push. Runs entirely inside the board
 * directory. Never throws; network failures come back as `warning`.
 */
export function syncBoard(dotDir: string, options: SyncOptions = {}): SyncResult {
  const pull = options.pull ?? true;
  const push = options.push ?? true;
  const result: SyncResult = { ok: true, pulled: 0, pushed: 0, conflicts: [] };
  if (!isTrackedBoard(dotDir)) return { ...result, skipped: 'not-tracked' };
  const remote = boardRemote(dotDir);
  if (!remote) return { ...result, skipped: 'no-remote' };
  const remoteBranch = boardRemoteBranch(dotDir);
  result.remote = remote;
  result.remoteBranch = remoteBranch;

  // Never sync a board that is mid-merge: a human owns it until it is clean.
  const stuck = unmergedFiles(dotDir);
  if (stuck.length > 0) {
    return finish(dotDir, { ...result, ok: false, conflicts: stuck, warning: `unresolved conflicts: ${stuck.join(', ')}` });
  }

  commitHandEdits(dotDir);
  if (ensureBoardAttributes(dotDir)) commitBoard(dotDir, { message: 'chore: merge attributes' });
  registerMergeDriver(dotDir);

  let fetched = false;
  if (pull) {
    const fetch = git(['fetch', '--quiet', remote, remoteBranch], dotDir);
    if (fetch.ok) {
      fetched = true;
    } else if (!isMissingRemoteRef(fetch.stderr)) {
      return finish(dotDir, { ...result, ok: false, warning: `fetch from ${remote} failed: ${firstLine(fetch.stderr)}` });
    }
    if (fetched && !git(['merge-base', '--is-ancestor', 'FETCH_HEAD', 'HEAD'], dotDir).ok) {
      const before = git(['rev-parse', 'HEAD'], dotDir).stdout;
      const id = identity(dotDir, options.agent);
      const merge = git([...id.args, 'merge', '--quiet', '--no-edit', 'FETCH_HEAD'], dotDir, id.env);
      if (!merge.ok) {
        resolveCompleteVersusEdit(dotDir);
        const remaining = unmergedFiles(dotDir);
        if (remaining.length > 0) {
          return finish(dotDir, {
            ...result,
            ok: false,
            conflicts: remaining,
            warning: `merge left conflicts in ${remaining.join(', ')} — resolve them in ${dotDir}, then run sync again`,
          });
        }
        const commit = git([...id.args, 'commit', '--quiet', '--no-edit', '--no-verify'], dotDir, id.env);
        if (!commit.ok) {
          return finish(dotDir, { ...result, ok: false, warning: `merge commit failed: ${firstLine(commit.stderr)}` });
        }
      }
      // Count what came from the remote rather than our own merge commit.
      result.pulled = commitCount(dotDir, `${before}..FETCH_HEAD`);
    }
  }

  if (push) {
    const ahead = fetched ? commitCount(dotDir, 'FETCH_HEAD..HEAD') : commitCount(dotDir, 'HEAD');
    if (ahead > 0) {
      const pushed = git(['push', '--quiet', remote, `HEAD:refs/heads/${remoteBranch}`], dotDir);
      if (!pushed.ok) {
        const rejected = /rejected|non-fast-forward|fetch first/i.test(pushed.stderr);
        return finish(dotDir, {
          ...result,
          ok: false,
          warning: rejected
            ? `push to ${remote} rejected (the remote moved) — run sync again`
            : `push to ${remote} failed: ${firstLine(pushed.stderr)}`,
        });
      }
      result.pushed = ahead;
    }
  }

  return finish(dotDir, result);
}

function finish(dotDir: string, result: SyncResult): SyncResult {
  writeSyncState(dotDir, {
    at: new Date().toISOString(),
    remote: result.remote ?? '',
    remoteBranch: result.remoteBranch ?? '',
    ok: result.ok,
    ...(result.warning ? { warning: result.warning } : {}),
  });
  return result;
}

/** Seconds since the last recorded sync attempt, or null when there was none. */
export function secondsSinceSync(dotDir: string, now = Date.now()): number | null {
  const state = readSyncState(dotDir);
  if (!state) return null;
  const at = Date.parse(state.at);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((now - at) / 1000));
}

/**
 * Short status for a header: `synced 12s ago`, `synced 3m ago`, `sync failed`.
 * Null when the board is not shared (plain, or no remote).
 */
export function syncStatusLabel(dotDir: string, now = Date.now()): string | null {
  if (!isTrackedBoard(dotDir) || !boardRemote(dotDir)) return null;
  const state = readSyncState(dotDir);
  if (!state) return 'not synced yet';
  if (!state.ok) return 'sync failed';
  const seconds = secondsSinceSync(dotDir, now) ?? 0;
  const age = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${Math.round(seconds / 3600)}h`;
  return `synced ${age} ago`;
}
