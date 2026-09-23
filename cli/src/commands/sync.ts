/**
 * `brainfile sync` — share a tracked board through a git remote (spec-9).
 *
 *   brainfile sync                        fetch, merge, push
 *   brainfile sync --pull | --push        one direction only
 *   brainfile sync --set-remote <name|url> [--board-name <name>]
 *   brainfile sync --autosync off|push|full
 *
 * With `--set-remote` in a repository that has no board yet, the board is
 * fetched from that remote and materialized as the board worktree.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { BRAINFILE_BASENAME } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { operationFailed, validationError } from '../utils/cli-error';
import { resolveCliBrainfilePath, tryResolveBoardDir } from '../utils/brainfile-path';
import { gitToplevel, isTrackedBoard, materializeBoardWorktree } from '../utils/board-repo';
import { clearPushLock } from '../utils/board-autosync';
import {
  type AutosyncMode,
  type SyncResult,
  boardAutosync,
  boardRemote,
  boardRemoteRef,
  boardWebUrl,
  setBoardAutosync,
  setBoardRemote,
  syncBoard,
  syncMessage,
} from '../utils/board-sync';

export interface SyncCommandOptions {
  file?: string;
  pull?: boolean;
  push?: boolean;
  setRemote?: string;
  boardName?: string;
  /** 0.21.0 spelling of `boardName`. */
  remoteBranch?: string;
  autosync?: string;
  json?: boolean;
  /** Milliseconds to sleep first; used by the detached autosync child. */
  wait?: string | number;
}

export const SYNC_COMMAND_HELP = `
Examples:
  brainfile sync                              Fetch, merge and push the board
  brainfile sync --pull                       Bring in other machines' changes only
  brainfile sync --set-remote origin          Share the board through the code remote
  brainfile sync --set-remote git@host:me/boards.git --board-name myproject
  brainfile sync --autosync full              Also fetch before reads (default: push after writes)

Nothing leaves this machine until you choose a remote. On the remote the board
is stored as refs/brainfile/<name>, not as a branch, so it never appears in the
branch list or pull requests. \`brainfile where\` shows where the board lives
and who has it.`;

function describe(result: SyncResult): string {
  const message = syncMessage(result);
  let text = message.tone === 'ok' ? chalk.green(message.text) : chalk.yellow(message.text);
  if (result.movedFromBranch && result.remoteRef) {
    text += `\n${chalk.gray(`  Moved the board off the '${result.movedFromBranch}' branch on ${result.remote}; it now lives in ${result.remoteRef}, outside your branches.`)}`;
  }
  return message.detail ? `${text}\n${chalk.gray(`  (${message.detail})`)}` : text;
}

function sleep(ms: number): void {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function syncCommand(options: SyncCommandOptions, logger: Logger = defaultLogger): SyncResult | undefined {
  const wait = options.wait !== undefined ? Number(options.wait) : 0;
  if (Number.isFinite(wait) && wait > 0) sleep(wait);
  let dotDir = tryResolveBoardDir(options.file);
  // The autosync child owns the pending-push lock; release it however we end.
  if (dotDir && options.wait !== undefined) clearPushLock(dotDir);

  const boardName = options.boardName ?? options.remoteBranch;
  if (options.setRemote !== undefined) {
    const cwd = dotDir ?? gitToplevel(process.cwd());
    if (!cwd) {
      throw operationFailed('No board here and not inside a git repository. Run: brainfile init');
    }
    let setting;
    try {
      setting = setBoardRemote(cwd, options.setRemote, boardName);
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : String(error));
    }
    logger.log(chalk.green(`This board is now shared through ${setting.remote}${setting.url ? ` (${setting.url})` : ''}.`));
    logger.log(chalk.gray(`  It is stored there as ${setting.remoteRef}, not a branch, so it stays out of branch lists and pull requests.`));
    logger.log(chalk.gray(`  Changes are sent automatically after each edit. Anyone who can read ${setting.remote} can read the board.`));
    const web = boardWebUrl(setting.url, setting.remoteRef);
    if (web) logger.log(chalk.gray(`  See it on the web: ${web}`));
    if (!dotDir) {
      dotDir = materializeBoardWorktree(cwd, { fresh: true });
      if (!dotDir) {
        logger.log(chalk.yellow(`There is no board on ${setting.remote} yet (looked for ${setting.remoteRef}).`) + chalk.gray(' Start one with: brainfile init'));
        return undefined;
      }
    }
  } else if (boardName !== undefined) {
    throw validationError('--board-name needs --set-remote');
  }

  if (!dotDir) {
    // Let the resolver raise the standard "not found" error.
    const resolved = resolveCliBrainfilePath(options.file);
    if (!fs.existsSync(resolved)) throw operationFailed(`No board found (looked for ${path.join('.brainfile', BRAINFILE_BASENAME)}). Run: brainfile init`);
    dotDir = path.dirname(resolved);
  }

  if (options.autosync !== undefined) {
    const mode = options.autosync as AutosyncMode;
    if (!['off', 'push', 'full'].includes(mode)) throw validationError('--autosync must be off, push or full');
    if (!isTrackedBoard(dotDir)) throw operationFailed('Autosync needs a tracked board. Run: brainfile migrate --to-branch');
    setBoardAutosync(dotDir, mode);
    logger.log(chalk.green(`Autosync: ${mode}.`));
  }

  const pullOnly = options.pull === true && options.push !== true;
  const pushOnly = options.push === true && options.pull !== true;
  const result = syncBoard(dotDir, {
    pull: !pushOnly,
    push: !pullOnly,
  });

  if (options.json) {
    logger.log(JSON.stringify({
      ...result,
      remote: result.remote ?? boardRemote(dotDir),
      remoteRef: result.remoteRef ?? boardRemoteRef(dotDir),
      autosync: boardAutosync(dotDir),
    }, null, 2));
  } else {
    logger.log(describe(result));
  }
  if (result.conflicts.length > 0) process.exitCode = 1;
  return result;
}
