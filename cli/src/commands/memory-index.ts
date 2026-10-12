/**
 * `brainfile index`: the local index, for operators (spec-11).
 *
 *   brainfile index            Bring it up to date and say what changed
 *   brainfile index --rebuild  Drop it and index from scratch
 *   brainfile index --status   What is in it, without refreshing
 *
 * The index lives at `.brainfile/state/index.db`: local to this machine,
 * gitignored, rebuildable, never the source of truth. Every search, brief
 * and check refreshes it first, so this command is never required.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  getIndexPath,
  indexDisabledByEnv,
  MemoryIndex,
  sqliteAvailable,
  type IndexStatus,
  type RefreshStats,
} from '@brainfile/core/memory';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';

export interface IndexOptions {
  file?: string;
  rebuild?: boolean;
  status?: boolean;
  json?: boolean;
}

export interface IndexCommandResult {
  success: true;
  /** False where node:sqlite is missing (or BRAINFILE_INDEX=off): search scans instead. */
  available: boolean;
  path: string;
  action: 'refresh' | 'rebuild' | 'status' | 'unavailable';
  refresh?: RefreshStats;
  status?: IndexStatus;
  /** Why the index is not available, when it is not. */
  reason?: string;
}

function unavailableReason(): string {
  if (indexDisabledByEnv()) return 'BRAINFILE_INDEX is off';
  return `node:sqlite with FTS5 is not available in Node ${process.versions.node} (it needs Node 22.13 or later)`;
}

export function indexCommand(options: IndexOptions, logger: Logger = defaultLogger): IndexCommandResult {
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);
  const dbPath = getIndexPath(filePath);

  if (!sqliteAvailable()) {
    const result: IndexCommandResult = { success: true, available: false, path: dbPath, action: 'unavailable', reason: unavailableReason() };
    if (options.json) logger.log(JSON.stringify(result, null, 2));
    else {
      logger.log(chalk.yellow(`No local index: ${result.reason}.`));
      logger.log(chalk.gray('search, brief and check scan the board instead; nothing else changes.'));
    }
    return result;
  }

  if (options.status && !fs.existsSync(dbPath)) {
    const result: IndexCommandResult = { success: true, available: true, path: dbPath, action: 'status' };
    if (options.json) logger.log(JSON.stringify(result, null, 2));
    else logger.log(chalk.gray(`No index yet at ${dbPath}; the next search builds it (or run brainfile index).`));
    return result;
  }

  const index = MemoryIndex.open(filePath);
  if (!index) throw new CLIError(`Could not open the index at ${dbPath}`);
  try {
    let refresh: RefreshStats | undefined;
    let action: IndexCommandResult['action'] = 'status';
    if (options.rebuild) {
      refresh = index.rebuild();
      action = 'rebuild';
    } else if (!options.status) {
      refresh = index.refresh();
      action = 'refresh';
    }
    const status = index.status();
    const result: IndexCommandResult = { success: true, available: true, path: dbPath, action, ...(refresh ? { refresh } : {}), status };
    if (options.json) logger.log(JSON.stringify(result, null, 2));
    else render(result, logger);
    return result;
  } finally {
    index.close();
  }
}

function render(result: IndexCommandResult, logger: Logger): void {
  const status = result.status!;
  const r = result.refresh;
  if (r) {
    const verb = result.action === 'rebuild' ? 'Rebuilt' : 'Refreshed';
    if (r.busy) {
      logger.log(chalk.yellow('Another process is writing the index; showing it as it stands.'));
    } else {
      logger.log(chalk.green(`${verb} in ${r.ms}ms`) + chalk.gray(` · ${r.added} added, ${r.updated} changed, ${r.removed} removed, ${r.unchanged} unchanged`));
    }
  }
  logger.log(chalk.bold(`Index: ${status.path}`));
  logger.log(chalk.gray(`  Project: ${status.projectRoot}${r ? ` (listed via ${r.via})` : ''}`));
  const rows: Array<[string, keyof IndexStatus['files']]> = [
    ['Board', 'board'], ['Logs', 'logs'], ['Ledger', 'ledger'], ['Plans', 'plans'], ['Project docs', 'repo'],
  ];
  for (const [label, key] of rows) {
    logger.log(`  ${label.padEnd(13)} ${String(status.files[key]).padStart(5)} files  ${String(status.chunks[key]).padStart(6)} chunks`);
  }
  logger.log(chalk.gray(`  ${status.totalFiles} files, ${status.totalChunks} chunks, ${(status.sizeBytes / 1024).toFixed(0)} KiB${status.lastRefresh ? `, refreshed ${status.lastRefresh}` : ''}`));
}
