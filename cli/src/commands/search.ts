/**
 * Search command - search across active tasks and completed logs.
 *
 * Usage:
 * - brainfile search "auth bug"     Search title, description, tags, and log body
 * - brainfile search "auth" -c todo  Filter to specific column
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { missingRequired } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { readTasksDir, searchTasksRanked } from '@brainfile/core';
import { getV2Dirs } from '../utils/v2-detect';

export interface SearchOptions {
  file: string;
  query?: string;
  column?: string;
}

export interface SearchResult {
  success: true;
  results: Array<{
    id: string;
    title: string;
    column?: string;
    score: number;
    isLog: boolean;
    completedAt?: string;
  }>;
  count: number;
}

/**
 * Search across active tasks and completed logs.
 * Throws CLIError on failure.
 */
export function searchCommand(options: SearchOptions, logger: Logger = defaultLogger): SearchResult {
  if (!options.query) {
    throw missingRequired('query', 'brainfile search "search terms" [--column <name>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  return searchV2(filePath, options.query, options.column, logger);
}

function searchV2(filePath: string, query: string, column: string | undefined, logger: Logger): SearchResult {
  const dirs = getV2Dirs(filePath);

  // Active tasks (optionally restricted to one column)
  const taskMatches = searchTasksRanked(readTasksDir(dirs.boardDir), query, { column });

  const results: SearchResult['results'] = taskMatches.map(({ doc, score }) => ({
    id: doc.task.id,
    title: doc.task.title,
    column: doc.task.column,
    score,
    isLog: false,
  }));

  // Completed logs — skipped entirely when a column filter is active
  if (!column) {
    for (const { doc, score } of searchTasksRanked(readTasksDir(dirs.logsDir), query)) {
      results.push({
        id: doc.task.id,
        title: doc.task.title,
        score,
        isLog: true,
        completedAt: doc.task.completedAt,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  displayResults(results, query, logger);

  return { success: true, results, count: results.length };
}

function displayResults(results: SearchResult['results'], query: string, logger: Logger): void {
  logger.log('');
  logger.log(chalk.bold(`Search: "${query}" (${results.length} results)`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (results.length === 0) {
    logger.log(chalk.gray('  No matching tasks found.'));
  } else {
    for (const result of results) {
      const location = result.isLog
        ? chalk.yellow('(completed)')
        : chalk.cyan(result.column || '');
      logger.log(`  ${chalk.gray(`[${result.id}]`)} ${chalk.white(result.title)} ${location}`);
      if (result.completedAt) {
        logger.log(`    ${chalk.gray('Completed:')} ${result.completedAt}`);
      }
    }
  }
  logger.log('');
}
