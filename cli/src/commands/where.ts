/**
 * `brainfile where` — where the board lives, how it is stored, and who else
 * has it. Read-only and offline: it never fetches or pushes, so it is always
 * safe to run when you are unsure what happened to your board.
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
} from '../utils/board-sync';

export interface WhereOptions {
  file?: string;
  json?: boolean;
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
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function whereReport(dotDir: string): WhereReport {
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
  };
}

export function whereCommand(options: WhereOptions, logger: Logger = defaultLogger): WhereReport {
  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) throw fileNotFound(filePath);
  const dotDir = path.dirname(filePath);
  const report = whereReport(dotDir);

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
  more([last, waiting].filter(Boolean).join(' '));
  if (report.autosync === 'off') {
    more(chalk.gray('Automatic sharing is off; run brainfile sync to send and receive.'));
  } else {
    more(chalk.gray(report.autosync === 'full'
      ? 'Changes are sent after each edit and fetched before reading.'
      : 'Changes are sent automatically after each edit.'));
  }
  more(chalk.gray(`Anyone who can read ${report.remote} can read this board.`));
  return report;
}
