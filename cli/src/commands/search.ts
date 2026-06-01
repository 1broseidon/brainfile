/**
 * Search command - search across active tasks and completed logs.
 *
 * Usage:
 * - brainfile search "auth bug"     Search title, description, tags, and log body
 * - brainfile search "auth" -c todo  Filter to specific column
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import chalk from 'chalk';
import { Brainfile, searchTasks as coreSearchTasks, type Task } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { readTasksDir, type TaskDocument } from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  extractDescription,
  extractLog,
} from '../utils/v2-detect';

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
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  if (isV2(filePath)) {
    return searchV2(filePath, options.query, options.column, logger);
  }

  return searchV1(filePath, options.query, options.column, logger);
}

function searchV2(filePath: string, query: string, column: string | undefined, logger: Logger): SearchResult {
  const dirs = getV2Dirs(filePath);
  const queryLower = query.toLowerCase();

  const results: SearchResult['results'] = [];

  // Search active tasks
  const taskDocs = readTasksDir(dirs.boardDir);
  for (const doc of taskDocs) {
    const task = doc.task;

    // Column filter
    if (column && task.column !== column) continue;

    const score = scoreMatch(task, doc, queryLower);
    if (score > 0) {
      results.push({
        id: task.id,
        title: task.title,
        column: task.column,
        score,
        isLog: false,
      });
    }
  }

  // Search logs (completed tasks)
  if (!column) {
    const logDocs = readTasksDir(dirs.logsDir);
    for (const doc of logDocs) {
      const task = doc.task;
      const score = scoreMatch(task, doc, queryLower);
      if (score > 0) {
        results.push({
          id: task.id,
          title: task.title,
          score,
          isLog: true,
          completedAt: task.completedAt,
        });
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  displayResults(results, query, logger);

  return { success: true, results, count: results.length };
}

function searchV1(filePath: string, query: string, column: string | undefined, logger: Logger): SearchResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  const board = parsed.board;
  const queryLower = query.toLowerCase();
  const results: SearchResult['results'] = [];

  for (const col of board.columns) {
    if (column && col.id !== column && col.title.toLowerCase() !== column.toLowerCase()) continue;

    for (const task of col.tasks) {
      const score = scoreMatchV1(task, queryLower);
      if (score > 0) {
        results.push({
          id: task.id,
          title: task.title,
          column: col.title,
          score,
          isLog: false,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);

  displayResults(results, query, logger);

  return { success: true, results, count: results.length };
}

function scoreMatch(task: { id: string; title: string; description?: string; tags?: string[] }, doc: TaskDocument, queryLower: string): number {
  let score = 0;

  // ID exact match
  if (task.id.toLowerCase() === queryLower) score += 20;

  // Title match
  if (task.title.toLowerCase().includes(queryLower)) {
    score += 10;
    if (task.title.toLowerCase().startsWith(queryLower)) score += 5;
  }

  // Description match (frontmatter)
  if (task.description?.toLowerCase().includes(queryLower)) score += 5;

  // Markdown description match
  const description = extractDescription(doc.body);
  if (description?.toLowerCase().includes(queryLower)) score += 5;

  // Tag match
  if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) score += 3;

  // Log body match
  const logContent = extractLog(doc.body);
  if (logContent?.toLowerCase().includes(queryLower)) score += 2;

  return score;
}

function scoreMatchV1(task: Task, queryLower: string): number {
  let score = 0;

  if (task.id.toLowerCase() === queryLower) score += 20;
  if (task.title.toLowerCase().includes(queryLower)) {
    score += 10;
    if (task.title.toLowerCase().startsWith(queryLower)) score += 5;
  }
  if (task.description?.toLowerCase().includes(queryLower)) score += 5;
  if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) score += 3;

  return score;
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
