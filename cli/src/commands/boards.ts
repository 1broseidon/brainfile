/**
 * `brainfile adopt`, `brainfile merge-boards` and `brainfile backups`
 * (spec-15): settle a repository that has two boards into one, with every
 * board that is replaced saved first as a backup ref.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { boardRemote } from '../utils/board-sync';
import {
  type BackupInfo,
  type MergeBoardsResult,
  type SettleResult,
  adoptBoard,
  listBackups,
  mergeBoards,
  restoreBackup,
} from '@brainfile/core/repo';

export interface BoardsOptions {
  file?: string;
  json?: boolean;
}

function boardDir(file?: string): string {
  const filePath = resolveCliBrainfilePath(file);
  if (!fs.existsSync(filePath)) throw fileNotFound(filePath);
  return path.dirname(filePath);
}

function shown(dir: string): string {
  const relative = path.relative(process.cwd(), dir);
  return relative === '' ? '.' : relative.startsWith('..') ? dir : relative;
}

function run<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof CLIError) throw error;
    throw new CLIError(error instanceof Error ? error.message : String(error));
  }
}

/** What happened besides the headline: backups, removed checkouts, the code-branch commit, next steps. */
function printAftermath(result: SettleResult, logger: Logger): void {
  const say = (text: string) => logger.log(`  ${text}`);
  if (result.backups.length > 0) {
    say(chalk.gray(`Saved first: ${result.backups.join(', ')}. Undo with brainfile backups restore <name>.`));
  }
  for (const removed of result.removedCheckouts) {
    say(chalk.gray(`Removed the other checkout of the board at ${removed}; everything in it is on the branch.`));
  }
  if (result.untracked) {
    say(`${result.untracked.branch} stopped tracking .brainfile/ and ignores it, in one commit (${result.untracked.commit.slice(0, 7)}).`);
    say(chalk.gray(`Push it like any commit: git push (a pull request, if ${result.untracked.branch} is protected).`));
  }
  if (boardRemote(result.dotDir)) say(chalk.gray('Share it: brainfile sync'));
}

export function adoptCommand(options: BoardsOptions & { ref: string }, logger: Logger = defaultLogger): SettleResult {
  const dotDir = boardDir(options.file);
  const result = run(() => adoptBoard(dotDir, options.ref));
  if (options.json) {
    logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  if (result.unchanged) {
    logger.log(chalk.green(`Already one board: ${result.source.label}, at ${shown(result.dotDir)}/.`));
    return result;
  }
  logger.log(chalk.green(`Adopted ${result.source.label}: one board now, at ${shown(result.dotDir)}/.`));
  printAftermath(result, logger);
  return result;
}

export function mergeBoardsCommand(options: BoardsOptions & { ref: string }, logger: Logger = defaultLogger): MergeBoardsResult {
  const dotDir = boardDir(options.file);
  const result = run(() => mergeBoards(dotDir, options.ref));
  if (options.json) {
    logger.log(JSON.stringify(result, null, 2));
    return result;
  }
  const other = result.source.label;
  if (result.adopted === 'other') {
    logger.log(chalk.green(`${other[0].toUpperCase()}${other.slice(1)} already had everything this board had, so it was adopted as it is.`));
  } else if (result.adopted === 'this') {
    logger.log(chalk.green(`This board already had everything ${other} had, so it was kept as it is.`));
  } else {
    logger.log(chalk.green(`Merged ${other} into this board, document by document.`));
  }
  logger.log(`  One board now, at ${shown(result.dotDir)}/.`);
  for (const r of result.renumbered) {
    logger.log(`  ${r.from} was two different documents; ${r.side === 'other' ? `${other}'s` : "this board's"} "${r.title}" is now ${chalk.bold(r.to)} (references to it were rewritten).`);
  }
  if (result.keptOurs.length > 0) {
    logger.log(chalk.gray(`  Both had different versions of ${result.keptOurs.join(', ')}; this board's were kept (the other's are in the backup).`));
  }
  printAftermath(result, logger);
  return result;
}

export interface BackupsOptions extends BoardsOptions {
  action?: string;
  name?: string;
}

export function backupsCommand(options: BackupsOptions, logger: Logger = defaultLogger): BackupInfo[] | SettleResult {
  const dotDir = boardDir(options.file);
  const action = options.action ?? 'list';
  if (action === 'restore') {
    if (!options.name) throw new CLIError('Name the backup to restore.', undefined, 'brainfile backups lists them.');
    const result = run(() => restoreBackup(dotDir, options.name!));
    if (options.json) {
      logger.log(JSON.stringify(result, null, 2));
      return result;
    }
    logger.log(chalk.green(`Restored ${result.source.label}: one board, at ${shown(result.dotDir)}/.`));
    printAftermath(result, logger);
    return result;
  }
  if (action !== 'list') throw new CLIError(`Unknown action '${action}'.`, undefined, 'Use: brainfile backups, or brainfile backups restore <name>');

  const backups = run(() => listBackups(dotDir));
  if (options.json) {
    logger.log(JSON.stringify(backups, null, 2));
    return backups;
  }
  if (backups.length === 0) {
    logger.log('No backups. adopt, merge-boards and backups restore save one before they replace a board.');
    return backups;
  }
  const width = Math.max(...backups.map((b) => b.name.length));
  for (const b of backups) {
    logger.log(`${chalk.bold(b.name.padEnd(width))}  ${String(b.docs).padStart(3)} docs  ${chalk.gray(b.note)}`);
  }
  logger.log(chalk.gray('\nKept on this machine as refs/brainfile/backups/<name>. Put one back: brainfile backups restore <name>'));
  return backups;
}
