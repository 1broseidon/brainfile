/**
 * `brainfile where` — where the board lives, how it is stored, who else
 * has it, and any other copy of it in this repository (spec-15). Read-only
 * and offline unless `--fetch` asks the remote for its copy first, so it is
 * always safe to run when you are unsure what happened to your board.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { fileNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { boardBranch, boardRepoKind, git, gitToplevel, homeBoardDir } from '../utils/board-repo';
import { effectiveAutosync } from '../utils/board-autosync';
import {
  boardRemote,
  boardRemoteRef,
  boardWebUrl,
  pendingChanges,
  readSyncState,
  secondsSinceSync,
  surveyBoards,
  boardConflictRelation,
  type BoardConflict,
  type BoardSighting,
  type BoardSurvey,
} from '../utils/board-sync';

export interface WhereOptions {
  file?: string;
  json?: boolean;
  /** Ask the remote for its copy of the board first (the only network call `where` makes). */
  fetch?: boolean;
}

export interface WhereReport {
  path: string;
  storage: 'plain' | 'branch' | 'repository';
  branch: string | null;
  repository: string | null;
  remote: string | null;
  remoteUrl: string | null;
  /** Where the board lives on the remote, e.g. `refs/brainfile/board`. */
  remoteRef: string | null;
  /** A web page showing the board's history, for hosts that have one. */
  webUrl: string | null;
  autosync: 'off' | 'push' | 'full' | null;
  lastSyncSecondsAgo: number | null;
  lastSyncOk: boolean | null;
  pendingChanges: number;
  /** Commits on the remote's copy not here yet, from its last-known position. */
  behind: number;
  /** Every copy of the board in this repository (spec-15), this one first. */
  boards: BoardSighting[];
  /** Set when another copy disagrees with this one; writes refuse until it is settled. */
  conflict: BoardConflict | null;
  /** Checkouts of the board branch away from `.brainfile/`. */
  strayWorktrees: BoardSurvey['strayWorktrees'];
  /** The code branch's own copy of `.brainfile/`, when it still tracks one. */
  trackedTwice: BoardSighting | null;
}

/** `42s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function whereReport(dotDir: string, options: { fetch?: boolean } = {}): WhereReport {
  const survey = surveyBoards(dotDir, { fetch: options.fetch });
  const kind = boardRepoKind(dotDir);
  const storage = kind === 'linked' ? 'branch' : kind === 'standalone' ? 'repository' : 'plain';
  const remote = kind ? boardRemote(dotDir) : null;
  const state = remote ? readSyncState(dotDir) : null;
  const remoteUrl = remote ? git(['remote', 'get-url', remote], dotDir).stdout || null : null;
  const remoteRef = remote ? boardRemoteRef(dotDir) : null;
  return {
    path: dotDir,
    storage,
    branch: kind === 'linked' ? boardBranch(dotDir) : null,
    repository: kind === 'linked' ? gitToplevel(path.dirname(dotDir)) : null,
    remote,
    remoteUrl,
    remoteRef,
    webUrl: remoteRef ? boardWebUrl(remoteUrl, remoteRef) : null,
    autosync: remote ? effectiveAutosync(dotDir) : null,
    lastSyncSecondsAgo: remote ? secondsSinceSync(dotDir) : null,
    lastSyncOk: state ? state.ok : null,
    pendingChanges: remote ? pendingChanges(dotDir) : 0,
    behind: survey.lineage?.behind ?? 0,
    boards: survey.boards,
    conflict: survey.conflict,
    strayWorktrees: survey.strayWorktrees,
    trackedTwice: survey.trackedTwice,
  };
}

function day(stamp: string | null): string {
  return stamp ? stamp.slice(0, 10) : 'never';
}

/** The boards section: every copy found, and what to do when they disagree. */
function printBoards(report: WhereReport, logger: Logger): void {
  const label = (name: string) => chalk.bold(name.padEnd(8));
  const more = (text: string) => logger.log(`${' '.repeat(8)}  ${text}`);
  const { conflict } = report;
  if (conflict) {
    logger.log('');
    logger.log(`${label('Boards')}  ${chalk.yellow(conflict.message)}`);
    const width = Math.max(...[conflict.current, conflict.other].map((b) => b.label.length));
    for (const b of [conflict.current, conflict.other]) {
      const where = b.path && b.kind !== 'folder' ? ` at ${b.path}` : b.kind === 'folder' ? ` ${b.path}` : ` ${b.ref}`;
      more(`${b.label.padEnd(width)}  ${String(b.docs).padStart(3)} docs, last change ${day(b.lastChange)}${chalk.gray(where)}`);
    }
    more(boardConflictRelation(conflict));
    more(`Nothing writes until you choose: ${chalk.cyan(conflict.resolve)}`);
  }
  for (const stray of report.strayWorktrees) {
    logger.log(
      `${label('Also')}  ${stray.missing
        ? `a checkout of the board branch at ${stray.path} whose folder is gone`
        : `the board branch is also checked out at ${stray.path}`}`
    );
    more(chalk.gray(stray.missing ? 'Drop it: git worktree prune' : 'It belongs at .brainfile/ only; finish there, then remove this checkout.'));
  }
  if (report.trackedTwice) {
    const copy = report.trackedTwice;
    logger.log(`${label('Also')}  ${copy.label.replace(/^the copy on /, '')} still tracks an old copy of .brainfile/ (${copy.docs} docs, last change ${day(copy.lastChange)})`);
    more(chalk.gray('Brainfile never writes to it, but it rides along with code commits. Remove it: brainfile migrate --to-branch'));
  }
}

export function whereCommand(options: WhereOptions, logger: Logger = defaultLogger): WhereReport {
  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) throw fileNotFound(filePath);
  const dotDir = path.dirname(filePath);
  const report = whereReport(dotDir, { fetch: options.fetch });

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  const label = (name: string) => chalk.bold(name.padEnd(8));
  const more = (text: string) => logger.log(`${' '.repeat(8)}  ${text}`);
  const shown = path.relative(process.cwd(), dotDir) || '.';
  const isHome = path.resolve(dotDir) === path.resolve(homeBoardDir());

  logger.log(`${label('Board')}  ${shown}/${isHome ? chalk.gray('  (your home board)') : ''}`);

  if (report.storage === 'plain') {
    logger.log(`${label('Stored')}  as plain files, not tracked by git`);
  } else if (report.storage === 'branch') {
    logger.log(`${label('Stored')}  as commits on the '${report.branch}' branch of this repository`);
    more(chalk.gray('Kept out of your code branch, its commits and pull requests.'));
  } else {
    logger.log(`${label('Stored')}  as commits in its own git repository inside ${shown}/`);
  }

  if (!report.remote) {
    logger.log(`${label('Shared')}  nowhere: this board is only on this machine`);
    more(chalk.gray('To share it: ') + chalk.cyan(report.storage === 'plain' ? 'brainfile migrate --to-branch' : 'brainfile sync --set-remote origin'));
    printBoards(report, logger);
    return report;
  }

  const url = report.remoteUrl ? ` (${report.remoteUrl})` : '';
  logger.log(`${label('Shared')}  through ${report.remote}${url}`);
  more(chalk.gray(`Stored there as ${report.remoteRef}, not a branch, so it stays out of branch lists and pull requests.`));
  if (report.webUrl) more(chalk.gray(`On the web: ${report.webUrl}`));
  const last = report.lastSyncSecondsAgo === null
    ? ''
    : report.lastSyncOk === false
      ? chalk.yellow(`Last sync failed ${ago(report.lastSyncSecondsAgo)}; your changes are safe on this machine.`)
      : `Last synced ${ago(report.lastSyncSecondsAgo)}.`;
  const waiting = report.pendingChanges > 0
    ? `${report.pendingChanges} change${report.pendingChanges === 1 ? '' : 's'} waiting to be sent.`
    : 'Nothing waiting to be sent.';
  const incoming = report.behind > 0
    ? `${report.behind} change${report.behind === 1 ? '' : 's'} on ${report.remote} not here yet (brainfile sync).`
    : '';
  more([last, waiting, incoming].filter(Boolean).join(' '));
  if (report.autosync === 'off') {
    more(chalk.gray('Automatic sharing is off; run brainfile sync to send and receive.'));
  } else {
    more(chalk.gray(report.autosync === 'full'
      ? 'Changes are sent after each edit and fetched before reading.'
      : 'Changes are sent automatically after each edit.'));
  }
  more(chalk.gray(`Anyone who can read ${report.remote} can read this board.`));
  printBoards(report, logger);
  return report;
}
