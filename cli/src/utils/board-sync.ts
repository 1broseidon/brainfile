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
 *   brainfile.boardName     name on that remote, stored as refs/brainfile/<name>
 *                           (see `boardRemoteName`; 0.21.0's remoteBranch is
 *                           still read)
 *   brainfile.autosync      off | push | full
 *
 * On the remote the board is a ref, not a branch, so it never shows up in the
 * host's branch list or "recent pushes" banner. See BOARD_REF_NAMESPACE.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BOARD_NAME_CONFIG_KEY,
  DEFAULT_BOARD_NAME,
  LEGACY_REMOTE_BRANCH_CONFIG_KEY,
  boardBranch,
  boardRepoKind,
  boardTrackingRef,
  commitBoard,
  commitHandEdits,
  git,
  gitNetwork,
  homeBoardDir,
  isTrackedBoard,
  remoteBoardRef,
  unmergedFiles,
} from './board-repo';
import { summarizeFieldChanges } from '../commands/merge-driver';

export const REMOTE_CONFIG_KEY = 'brainfile.remote';
/** Set once this machine has looked for (and moved) a board 0.21.0 pushed as a branch. */
export const LEGACY_CHECKED_CONFIG_KEY = 'brainfile.legacyBranchChecked';
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
}

export interface SyncResult {
  /** True when every requested step succeeded (nothing to do also counts). */
  ok: boolean;
  /** Set when sync did not run at all. */
  skipped?: 'not-tracked' | 'no-remote';
  remote?: string;
  /** Where the board lives on the remote, e.g. `refs/brainfile/board`. */
  remoteRef?: string;
  /** Commits brought in from the remote. */
  pulled: number;
  /** Commits sent to the remote. */
  pushed: number;
  /** Files left with conflict markers for a human. */
  conflicts: string[];
  /** One-line, technical explanation when `ok` is false. */
  warning?: string;
  /** Why it failed, for plain-language messages (see `syncMessage`). */
  failure?: 'offline' | 'rejected' | 'conflict' | 'error';
  /** Set when a board 0.21.0 had pushed as a branch was moved to `remoteRef`. */
  movedFromBranch?: string;
}

export interface SyncState {
  at: string;
  remote: string;
  remoteRef: string;
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
 * Name of the board on the remote (`refs/brainfile/<name>`). Defaults keep
 * the "one private boards repo, one board per project" pattern from
 * colliding: `board` for a board inside a code repository, the parent
 * folder's basename for a standalone board, `home` for the global board.
 */
export function boardRemoteName(dotDir: string): string {
  const configured = configGet(dotDir, BOARD_NAME_CONFIG_KEY) ?? configGet(dotDir, LEGACY_REMOTE_BRANCH_CONFIG_KEY);
  if (configured) return configured;
  return defaultName(dotDir, DEFAULT_BOARD_NAME);
}

function defaultName(dotDir: string, inRepo: string): string {
  if (path.resolve(dotDir) === path.resolve(homeBoardDir())) return 'home';
  // A standalone board is named after the folder it sits in; anything else
  // (a linked board, or a code repo whose board is not checked out yet) is
  // the repository's board.
  if (boardRepoKind(dotDir) === 'standalone' && path.basename(path.resolve(dotDir)) === '.brainfile') {
    return path.basename(path.dirname(path.resolve(dotDir))) || inRepo;
  }
  return inRepo;
}

/** Full ref of the board on the remote, e.g. `refs/brainfile/board`. */
export function boardRemoteRef(dotDir: string): string {
  return remoteBoardRef(boardRemoteName(dotDir));
}

/** The branch 0.21.0 pushed this board to, for the one-time move. */
function legacyRemoteBranch(dotDir: string): string {
  return configGet(dotDir, LEGACY_REMOTE_BRANCH_CONFIG_KEY) ?? defaultName(dotDir, boardBranch(dotDir));
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
  remoteRef: string;
}

/**
 * Point the board at a remote: an existing remote name, or a URL/path that is
 * registered as the `board` remote. Throws an Error naming an unknown remote.
 * `cwd` may be the board directory or, when no board exists yet, the code
 * repository the board will be materialized into.
 */
export function setBoardRemote(cwd: string, target: string, boardName?: string): RemoteSetting {
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
  if (boardName !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(boardName)) {
    throw new Error(`'${boardName}' is not a usable board name: use letters, digits, '.', '_' or '-'.`);
  }
  configSet(cwd, REMOTE_CONFIG_KEY, remote);
  if (boardName) configSet(cwd, BOARD_NAME_CONFIG_KEY, boardName);
  registerMergeDriver(cwd);
  return {
    remote,
    url: git(['remote', 'get-url', remote], cwd).stdout || null,
    remoteRef: boardRemoteRef(cwd),
  };
}

/**
 * Register the field-level merge driver in the board's git config.
 *
 * Without an explicit `command` this only fills in a missing driver: a
 * driver someone configured on purpose (an absolute path to the CLI, or a
 * test's built bundle) is never overwritten by the next sync.
 */
export function registerMergeDriver(cwd: string, command?: string): boolean {
  const current = configGet(cwd, `merge.${MERGE_DRIVER_NAME}.driver`);
  if (command === undefined) {
    if (current) return false;
    command = DEFAULT_MERGE_DRIVER_COMMAND;
  }
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

/** Merge commits use the git user, with a fallback when none is configured. */
function identityArgs(dotDir: string): string[] {
  const args: string[] = ['-c', 'commit.gpgsign=false'];
  if (!git(['config', '--get', 'user.email'], dotDir).ok) {
    args.push('-c', 'user.name=brainfile', '-c', 'user.email=brainfile@localhost');
  }
  return args;
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

type MergeOutcome = { ok: true; pulled: number } | { ok: false; result: SyncResult };

/** Bring `incoming` into HEAD: nothing, a fast-forward, or a merge commit. */
function mergeIncoming(dotDir: string, incoming: string, result: SyncResult): MergeOutcome {
  if (git(['merge-base', '--is-ancestor', incoming, 'HEAD'], dotDir).ok) return { ok: true, pulled: 0 };
  const before = git(['rev-parse', 'HEAD'], dotDir).stdout;
  const id = identityArgs(dotDir);
  const merge = git([...id, 'merge', '--quiet', '--no-edit', incoming], dotDir);
  if (!merge.ok) {
    resolveCompleteVersusEdit(dotDir);
    const remaining = unmergedFiles(dotDir);
    if (remaining.length > 0) {
      return {
        ok: false,
        result: {
          ...result,
          ok: false,
          failure: 'conflict',
          conflicts: remaining,
          warning: `merge left conflicts in ${remaining.join(', ')} — resolve them in ${dotDir}, then run sync again`,
        },
      };
    }
    const commit = git([...id, 'commit', '--quiet', '--no-edit', '--no-verify'], dotDir);
    if (!commit.ok) {
      return { ok: false, result: { ...result, ok: false, failure: 'error', warning: `merge commit failed: ${firstLine(commit.stderr)}` } };
    }
  }
  // Count what came from the remote rather than our own merge commit.
  return { ok: true, pulled: commitCount(dotDir, `${before}..${incoming}`) };
}

function legacyChecked(dotDir: string, remote: string): boolean {
  return configGet(dotDir, LEGACY_CHECKED_CONFIG_KEY) === remote;
}

/**
 * fetch → fast-forward or merge → push. Runs entirely inside the board
 * directory. Never throws; network failures come back as `warning`.
 *
 * The first sync with a remote also looks for a board that 0.21.0 pushed as
 * a branch: it is merged in, published under refs/brainfile/, and the old
 * branch is deleted from the remote once nothing on it can be lost.
 */
export function syncBoard(dotDir: string, options: SyncOptions = {}): SyncResult {
  const push = options.push ?? true;
  const result: SyncResult = { ok: true, pulled: 0, pushed: 0, conflicts: [] };
  if (!isTrackedBoard(dotDir)) return { ...result, skipped: 'not-tracked' };
  const remote = boardRemote(dotDir);
  if (!remote) return { ...result, skipped: 'no-remote' };
  const name = boardRemoteName(dotDir);
  const remoteRef = remoteBoardRef(name);
  const tracking = boardTrackingRef(remote, name);
  result.remote = remote;
  result.remoteRef = remoteRef;
  const checkLegacy = !legacyChecked(dotDir, remote);
  // The one-time legacy check needs the remote's state even for a push.
  const pull = (options.pull ?? true) || checkLegacy;

  // Never sync a board that is mid-merge: a human owns it until it is clean.
  const stuck = unmergedFiles(dotDir);
  if (stuck.length > 0) {
    return finish(dotDir, { ...result, ok: false, failure: 'conflict', conflicts: stuck, warning: `unresolved conflicts: ${stuck.join(', ')}` });
  }

  commitHandEdits(dotDir);
  if (ensureBoardAttributes(dotDir)) commitBoard(dotDir, { message: 'chore: merge attributes' });
  registerMergeDriver(dotDir);

  let fetched = false;
  let legacy: { branch: string; sha: string } | null = null;
  let legacyAbsent = false;
  if (pull) {
    const fetch = git(['fetch', '--quiet', '--no-tags', remote, `+${remoteRef}:${tracking}`], dotDir);
    if (fetch.ok) {
      fetched = true;
    } else if (!isMissingRemoteRef(fetch.stderr)) {
      return finish(dotDir, { ...result, ok: false, failure: 'offline', warning: `fetch from ${remote} failed: ${firstLine(fetch.stderr)}` });
    } else {
      // Gone from the remote (or never there): forget the stale position.
      git(['update-ref', '-d', tracking], dotDir);
    }
    if (checkLegacy) {
      const branch = legacyRemoteBranch(dotDir);
      const old = git(['fetch', '--quiet', '--no-tags', remote, `refs/heads/${branch}`], dotDir);
      if (old.ok) {
        legacy = { branch, sha: git(['rev-parse', 'FETCH_HEAD'], dotDir).stdout };
      } else if (isMissingRemoteRef(old.stderr)) {
        legacyAbsent = true;
      }
    }
    for (const incoming of [fetched ? tracking : null, legacy?.sha ?? null]) {
      if (!incoming) continue;
      const merged = mergeIncoming(dotDir, incoming, result);
      if (!merged.ok) return finish(dotDir, merged.result);
      result.pulled += merged.pulled;
    }
  }

  if (push) {
    const known = git(['rev-parse', '--verify', '--quiet', tracking], dotDir).ok;
    const ahead = commitCount(dotDir, known ? `${tracking}..HEAD` : 'HEAD');
    if (ahead > 0) {
      const pushed = git(['push', '--quiet', remote, `HEAD:${remoteRef}`], dotDir);
      if (!pushed.ok) {
        const rejected = /rejected|non-fast-forward|fetch first/i.test(pushed.stderr);
        return finish(dotDir, {
          ...result,
          ok: false,
          failure: rejected ? 'rejected' : 'offline',
          warning: rejected
            ? `push to ${remote} rejected (the remote moved) — run sync again`
            : `push to ${remote} failed: ${firstLine(pushed.stderr)}`,
        });
      }
      git(['update-ref', tracking, 'HEAD'], dotDir);
      result.pushed = ahead;
    }
    if (legacy && git(['merge-base', '--is-ancestor', legacy.sha, tracking], dotDir).ok) {
      // Everything on the old branch is now under refs/brainfile/; the lease
      // keeps a 0.21.0 machine's push made in the meantime from being lost.
      const removed = git(
        ['push', '--quiet', `--force-with-lease=refs/heads/${legacy.branch}:${legacy.sha}`, remote, `:refs/heads/${legacy.branch}`],
        dotDir
      );
      if (removed.ok) {
        git(['update-ref', '-d', `refs/remotes/${remote}/${legacy.branch}`], dotDir);
        result.movedFromBranch = legacy.branch;
        configSet(dotDir, LEGACY_CHECKED_CONFIG_KEY, remote);
      }
    }
  }
  if (legacyAbsent) {
    git(['update-ref', '-d', `refs/remotes/${remote}/${legacyRemoteBranch(dotDir)}`], dotDir);
    configSet(dotDir, LEGACY_CHECKED_CONFIG_KEY, remote);
  }

  return finish(dotDir, result);
}

function finish(dotDir: string, result: SyncResult): SyncResult {
  writeSyncState(dotDir, {
    at: new Date().toISOString(),
    remote: result.remote ?? '',
    remoteRef: result.remoteRef ?? '',
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
 * Short status for a header: `synced 12s ago`, `local only` for a tracked
 * board nobody else has, `not synced · saved locally` after a failure. Null
 * for a plain board.
 */
export function syncStatusLabel(dotDir: string, now = Date.now()): string | null {
  if (!isTrackedBoard(dotDir)) return null;
  if (!boardRemote(dotDir)) return 'local only';
  const state = readSyncState(dotDir);
  if (!state) return 'not synced yet';
  if (!state.ok) return 'not synced · saved locally';
  const seconds = secondsSinceSync(dotDir, now) ?? 0;
  const age = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${Math.round(seconds / 3600)}h`;
  return `synced ${age} ago`;
}

/**
 * Commits on this machine the remote has not seen yet, judged against the
 * last-known remote position (no network). Null when the board is not shared.
 */
export function pendingChanges(dotDir: string): number {
  const remote = boardRemote(dotDir);
  if (!remote) return 0;
  const tracking = boardTrackingRef(remote, boardRemoteName(dotDir));
  const known = git(['rev-parse', '--verify', '--quiet', tracking], dotDir).ok;
  return commitCount(dotDir, known ? `${tracking}..HEAD` : 'HEAD');
}

/**
 * A page where people can see the board on the web, for hosts that show refs
 * outside branches: GitHub's commit history accepts a full ref name. Null for
 * other hosts.
 */
export function boardWebUrl(remoteUrl: string | null, remoteRef: string): string | null {
  if (!remoteUrl) return null;
  const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl);
  return m ? `https://github.com/${m[1]}/${m[2]}/commits/${remoteRef}` : null;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The one sentence a person needs after a sync: what moved, or why nothing
 * did and that nothing was lost. `detail` is the technical cause, if any.
 */
export function syncMessage(result: SyncResult): { text: string; tone: 'ok' | 'warn'; detail?: string } {
  if (result.skipped === 'not-tracked') {
    return { tone: 'warn', text: 'This board is plain files on this machine and is not shared. To share it: brainfile migrate --to-branch' };
  }
  if (result.skipped === 'no-remote') {
    return { tone: 'warn', text: 'This board is only on this machine. To share it: brainfile sync --set-remote origin' };
  }
  const remote = result.remote ?? 'the remote';
  if (!result.ok) {
    switch (result.failure) {
      case 'conflict':
        return {
          tone: 'warn',
          text: `Two edits collided in ${result.conflicts.join(', ')}. Open the file in .brainfile/, keep the right version, then run brainfile sync. Nothing else is shared until then.`,
        };
      case 'rejected':
        return { tone: 'warn', text: `Someone shared changes through ${remote} at the same moment. Run brainfile sync again to combine them. Nothing was lost.` };
      case 'offline':
        return {
          tone: 'warn',
          text: `Couldn't reach ${remote}. Nothing was lost: your changes are saved on this machine and will be sent on the next sync.`,
          detail: result.warning,
        };
      default:
        return { tone: 'warn', text: `Sync with ${remote} stopped. Your changes are saved on this machine.`, detail: result.warning };
    }
  }
  const parts: string[] = [];
  if (result.pulled > 0) parts.push(`received ${plural(result.pulled, 'change')}`);
  if (result.pushed > 0) parts.push(`sent ${plural(result.pushed, 'change')}`);
  return { tone: 'ok', text: parts.length ? `Shared through ${remote}: ${parts.join(', ')}.` : `Up to date with ${remote}.` };
}
