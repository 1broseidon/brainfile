/**
 * `brainfile sync` — share a tracked board through a git remote (spec-9).
 *
 *   brainfile sync                        fetch, merge, push
 *   brainfile sync --pull | --push        one direction only
 *   brainfile sync --set-remote <name|url> [--remote-branch <name>]
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
import { gitToplevel, isTrackedBoard, materializeBoardWorktree, resolveAgentName } from '../utils/board-repo';
import { clearPushLock } from '../utils/board-autosync';
import {
  type AutosyncMode,
  type SyncResult,
  boardAutosync,
  boardRemote,
  boardRemoteBranch,
  setBoardAutosync,
  setBoardRemote,
  syncBoard,
} from '../utils/board-sync';

export interface SyncCommandOptions {
  file?: string;
  pull?: boolean;
  push?: boolean;
  setRemote?: string;
  remoteBranch?: string;
  autosync?: string;
  json?: boolean;
  /** Milliseconds to sleep first; used by the detached autosync child. */
  wait?: string | number;
}

export const SYNC_COMMAND_HELP = `
Examples:
  brainfile sync                              Fetch, merge and push the board branch
  brainfile sync --pull                       Bring in other machines' changes only
  brainfile sync --set-remote origin          Share the board through the code remote
  brainfile sync --set-remote git@host:me/boards.git --remote-branch myproject
  brainfile sync --autosync full              Also fetch before reads (default: push after writes)

The board never syncs with origin unless you say so: boards are often private
notes living next to public code.`;

function describe(result: SyncResult): string {
  if (result.skipped === 'not-tracked') {
    return `${chalk.yellow('Board is a plain directory.')} Track it first: ${chalk.cyan('brainfile migrate --to-branch')}`;
  }
  if (result.skipped === 'no-remote') {
    return `${chalk.yellow('No remote set.')} Share this board with: ${chalk.cyan('brainfile sync --set-remote <name|url>')}`;
  }
  const where = `${result.remote}/${result.remoteBranch}`;
  if (!result.ok) return chalk.yellow(`Sync incomplete (${where}): ${result.warning ?? 'unknown error'}`);
  const parts: string[] = [];
  if (result.pulled > 0) parts.push(`pulled ${result.pulled}`);
  if (result.pushed > 0) parts.push(`pushed ${result.pushed}`);
  return chalk.green(parts.length ? `Synced with ${where}: ${parts.join(', ')}.` : `Up to date with ${where}.`);
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

  if (options.setRemote !== undefined) {
    const cwd = dotDir ?? gitToplevel(process.cwd());
    if (!cwd) {
      throw operationFailed('No board here and not inside a git repository. Run: brainfile init');
    }
    let setting;
    try {
      setting = setBoardRemote(cwd, options.setRemote, options.remoteBranch);
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : String(error));
    }
    logger.log(chalk.green(`Board remote: ${setting.remote}${setting.url ? ` (${setting.url})` : ''}, branch '${setting.remoteBranch}'.`));
    if (!dotDir) {
      dotDir = materializeBoardWorktree(cwd);
      if (!dotDir) {
        logger.log(chalk.yellow(`No board found on ${setting.remote}/${setting.remoteBranch}.`) + chalk.gray(' Create one with: brainfile init'));
        return undefined;
      }
      logger.log(chalk.gray(`  Board checked out at ${dotDir}`));
    }
  } else if (options.remoteBranch !== undefined) {
    throw validationError('--remote-branch needs --set-remote');
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
    agent: resolveAgentName(),
  });

  if (options.json) {
    logger.log(JSON.stringify({
      ...result,
      remote: result.remote ?? boardRemote(dotDir),
      remoteBranch: result.remoteBranch ?? boardRemoteBranch(dotDir),
      autosync: boardAutosync(dotDir),
    }, null, 2));
  } else {
    logger.log(describe(result));
  }
  if (result.conflicts.length > 0) process.exitCode = 1;
  return result;
}
