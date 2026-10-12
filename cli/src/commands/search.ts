/**
 * Search command: one search over the board, its history and the project's
 * own docs (spec-11).
 *
 * Usage:
 * - brainfile search "auth bug"          Current results, then history
 * - brainfile search "auth" -c todo      Filter to one column (board only)
 * - brainfile search "auth" --type spec  Filter by document type (aliases work)
 * - brainfile search "p:high #auth"      Filter tokens work as before
 * - brainfile search "auth" --json       Stable JSON
 *
 * With `node:sqlite` (Node 22.13+) the local index answers: board and logs
 * documents, the ledger, plans/ and the project's markdown, ranked by bm25.
 * Without it (or with BRAINFILE_INDEX=off) the scan over board/ and logs/
 * answers, in the same shape.
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import { searchMemory, type MemoryHit } from '@brainfile/core/memory';
import { type Logger, defaultLogger } from '../utils/logger';
import { missingRequired } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';

export interface SearchOptions {
  file: string;
  query?: string;
  column?: string;
  /** Document type; aliases work (`adr` finds decisions). Same as `type:` in the query. */
  type?: string;
  /** Most hits per lane (default 20). */
  limit?: string | number;
  /** Only current results (commander's --no-history). */
  history?: boolean;
  json?: boolean;
}

/** One hit. Board documents by ID; files by `path:start-end`. */
export interface SearchResultItem {
  id: string;
  title: string;
  /** `current`, or `history` (completed work; superseded, rejected or stale decisions). */
  lane: 'current' | 'history';
  /** board, logs, ledger, plans or repo. */
  source: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  column?: string;
  type?: string;
  status?: string;
  claimKey?: string;
  completedAt?: string;
  snippet?: string;
  /** True for logs/ and the ledger. */
  isLog: boolean;
}

export interface SearchResult {
  success: true;
  /** `index` when the local index answered, `scan` for the fallback. */
  mode: 'index' | 'scan';
  query: string;
  /** Current results, then history. */
  results: SearchResultItem[];
  count: number;
}

function toItem(hit: MemoryHit): SearchResultItem {
  return {
    id: hit.id,
    title: hit.title,
    lane: hit.lane,
    source: hit.source,
    path: hit.path,
    startLine: hit.startLine,
    endLine: hit.endLine,
    score: hit.score,
    ...(hit.column ? { column: hit.column } : {}),
    ...(hit.type ? { type: hit.type } : {}),
    ...(hit.status ? { status: hit.status } : {}),
    ...(hit.claimKey ? { claimKey: hit.claimKey } : {}),
    ...(hit.completedAt ? { completedAt: hit.completedAt } : {}),
    ...(hit.snippet ? { snippet: hit.snippet } : {}),
    isLog: hit.isLog,
  };
}

function parseLimit(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Search the board and the project.
 * Throws CLIError on failure.
 */
export function searchCommand(options: SearchOptions, logger: Logger = defaultLogger): SearchResult {
  if (!options.query) {
    throw missingRequired('query', 'brainfile search "search terms" [--column <name>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const limit = parseLimit(options.limit);
  const found = searchMemory(filePath, options.query, {
    ...(limit ? { limit } : {}),
    filters: { column: options.column, type: options.type },
  });
  const hits = options.history === false ? found.current : found.results;
  const result: SearchResult = {
    success: true,
    mode: found.mode,
    query: options.query,
    results: hits.map(toItem),
    count: hits.length,
  };

  if (options.json) {
    logger.log(JSON.stringify(result, null, 2));
  } else {
    displayResults(result, logger);
  }
  return result;
}

function where(item: SearchResultItem): string {
  if (item.source === 'repo' || item.source === 'plans') return chalk.gray(`${item.path}:${item.startLine}-${item.endLine}`);
  if (item.type === 'decision' || item.claimKey) {
    return chalk.magenta(`${item.status ?? 'decision'}${item.claimKey ? ` · ${item.claimKey}` : ''}`);
  }
  if (item.isLog) return chalk.yellow('(completed)');
  return chalk.cyan(item.column || '');
}

function displayResults(result: SearchResult, logger: Logger): void {
  logger.log('');
  logger.log(chalk.bold(`Search: "${result.query}" (${result.count} results)`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (result.count === 0) {
    logger.log(chalk.gray('  No matching tasks found.'));
    logger.log('');
    return;
  }

  const lanes: Array<['current' | 'history', string]> = [['current', 'Current'], ['history', 'History']];
  const showHeadings = result.results.some((r) => r.lane === 'history');
  for (const [lane, label] of lanes) {
    const items = result.results.filter((r) => r.lane === lane);
    if (items.length === 0) continue;
    if (showHeadings) logger.log(chalk.bold(`${label}`));
    for (const item of items) {
      const isFile = item.source === 'repo' || item.source === 'plans';
      const key = isFile ? '' : `${chalk.gray(`[${item.id}]`)} `;
      logger.log(`  ${key}${chalk.white(item.title)} ${where(item)}`);
      if (item.snippet && result.mode === 'index') {
        logger.log(`    ${chalk.gray(item.snippet.length > 140 ? `${item.snippet.slice(0, 139)}…` : item.snippet)}`);
      }
      if (item.completedAt && !isFile) {
        logger.log(`    ${chalk.gray('Completed:')} ${item.completedAt}`);
      }
    }
  }
  logger.log('');
}
