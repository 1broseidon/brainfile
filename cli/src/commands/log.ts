/**
 * Log command - view, search, and append notes to completed task logs.
 *
 * Subcommands:
 * - brainfile log -t task-67        View a completed task's log
 * - brainfile log --search "auth"   Search across all logs
 * - brainfile log --recent          List recently completed tasks
 * - brainfile log note -t task-67 "Found the root cause"  Append a note
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { readTasksDir, writeTaskFile, type TaskDocument } from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  findV2Task,
  extractDescription,
  extractLog,
  composeBody,
  type V2Dirs,
} from '../utils/v2-detect';

export interface LogOptions {
  file: string;
  task?: string;
  search?: string;
  recent?: boolean;
}

export interface LogNoteOptions {
  file: string;
  task?: string;
  message?: string;
  agent?: string;
}

export interface LogResult {
  success: true;
  tasks?: Array<{ id: string; title: string; completedAt?: string }>;
  task?: { id: string; title: string; log?: string };
}

export interface LogNoteResult {
  success: true;
  taskId: string;
  entry: string;
}

/**
 * View or search completed task logs.
 */
export function logCommand(options: LogOptions, logger: Logger = defaultLogger): LogResult {
  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  if (!isV2(filePath)) {
    throw operationFailed('Log command requires v2 per-task file architecture. Run: brainfile migrate --v2');
  }

  const dirs = getV2Dirs(filePath);

  // View a specific task log
  if (options.task) {
    return viewTaskLog(dirs, options.task, logger);
  }

  // Search across all logs
  if (options.search) {
    return searchLogs(dirs, options.search, logger);
  }

  // List recent completions (default if --recent or no specific option)
  return listRecentLogs(dirs, logger);
}

/**
 * Append a timestamped note to a task's log section.
 * Works on both active tasks and completed logs.
 */
export function logNoteCommand(options: LogNoteOptions, logger: Logger = defaultLogger): LogNoteResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile log note --task <task-id> "message"');
  }
  if (!options.message) {
    throw missingRequired('message', 'brainfile log note --task <task-id> "message"');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  if (!isV2(filePath)) {
    throw operationFailed('Log note command requires v2 per-task file architecture. Run: brainfile migrate --v2');
  }

  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, options.task, true);

  if (!found) {
    throw taskNotFound(options.task);
  }

  const { doc, filePath: taskPath } = found;
  const timestamp = new Date().toISOString();
  const agentPrefix = options.agent ? `[${options.agent}] ` : '';
  const entry = `- ${timestamp}: ${agentPrefix}${options.message}`;

  // Extract existing sections from body
  const existingDesc = extractDescription(doc.body);
  const existingLog = extractLog(doc.body);
  const newLog = existingLog ? `${existingLog}\n${entry}` : entry;

  const newBody = composeBody(existingDesc, newLog);
  writeTaskFile(taskPath, doc.task, newBody);

  logger.log(chalk.green('Log entry added.'));
  logger.log(chalk.gray(`  Task: ${options.task}`));
  logger.log(chalk.gray(`  ${entry}`));

  return { success: true, taskId: options.task, entry };
}

function viewTaskLog(dirs: V2Dirs, taskId: string, logger: Logger): LogResult {
  // Search in both tasks and logs
  const found = findV2Task(dirs, taskId, true);

  if (!found) {
    throw taskNotFound(taskId);
  }

  const { doc } = found;
  const task = doc.task;
  const description = extractDescription(doc.body);
  const logContent = extractLog(doc.body);

  logger.log('');
  logger.log(chalk.bold(`Task: ${task.id} - ${task.title}`));
  if (task.completedAt) {
    logger.log(chalk.gray(`Completed: ${task.completedAt}`));
  }

  if (description) {
    logger.log('');
    logger.log(chalk.bold('Description:'));
    logger.log(description);
  }

  if (logContent) {
    logger.log('');
    logger.log(chalk.bold('Log:'));
    logger.log(logContent);
  } else {
    logger.log('');
    logger.log(chalk.gray('(no log entries)'));
  }
  logger.log('');

  return {
    success: true,
    task: { id: task.id, title: task.title, log: logContent },
  };
}

function searchLogs(dirs: V2Dirs, query: string, logger: Logger): LogResult {
  const logDocs = readTasksDir(dirs.logsDir);
  const queryLower = query.toLowerCase();

  const matches: Array<{ id: string; title: string; completedAt?: string; matchContext: string }> = [];

  for (const doc of logDocs) {
    const task = doc.task;
    const description = extractDescription(doc.body);
    const logContent = extractLog(doc.body);
    const fullText = [
      task.title,
      task.description || '',
      description || '',
      logContent || '',
    ].join(' ').toLowerCase();

    if (fullText.includes(queryLower)) {
      // Find match context
      let matchContext = '';
      if (task.title.toLowerCase().includes(queryLower)) {
        matchContext = `Title: ${task.title}`;
      } else if (logContent && logContent.toLowerCase().includes(queryLower)) {
        // Find the line containing the match
        const lines = logContent.split('\n');
        const matchLine = lines.find(l => l.toLowerCase().includes(queryLower));
        matchContext = matchLine ? matchLine.trim() : 'Log entry';
      } else {
        matchContext = 'Description match';
      }

      matches.push({
        id: task.id,
        title: task.title,
        completedAt: task.completedAt,
        matchContext,
      });
    }
  }

  logger.log('');
  logger.log(chalk.bold(`Log search: "${query}" (${matches.length} results)`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (matches.length === 0) {
    logger.log(chalk.gray('  No matching logs found.'));
  } else {
    for (const match of matches) {
      logger.log(`  ${chalk.gray(`[${match.id}]`)} ${chalk.white(match.title)}`);
      if (match.completedAt) {
        logger.log(`    ${chalk.gray('Completed:')} ${match.completedAt}`);
      }
      logger.log(`    ${chalk.gray('Match:')} ${match.matchContext}`);
      logger.log('');
    }
  }

  return {
    success: true,
    tasks: matches.map(m => ({ id: m.id, title: m.title, completedAt: m.completedAt })),
  };
}

function listRecentLogs(dirs: V2Dirs, logger: Logger): LogResult {
  const logDocs = readTasksDir(dirs.logsDir);

  // Sort by completedAt descending
  logDocs.sort((a, b) => {
    const aDate = a.task.completedAt || '';
    const bDate = b.task.completedAt || '';
    return bDate.localeCompare(aDate);
  });

  logger.log('');
  logger.log(chalk.bold(`Recently completed tasks (${logDocs.length})`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (logDocs.length === 0) {
    logger.log(chalk.gray('  No completed tasks found.'));
  } else {
    for (const doc of logDocs.slice(0, 20)) {
      const task = doc.task;
      logger.log(`  ${chalk.gray(`[${task.id}]`)} ${chalk.white(task.title)}`);
      if (task.completedAt) {
        logger.log(`    ${chalk.gray('Completed:')} ${task.completedAt}`);
      }
      logger.log('');
    }
  }

  return {
    success: true,
    tasks: logDocs.map(doc => ({
      id: doc.task.id,
      title: doc.task.title,
      completedAt: doc.task.completedAt,
    })),
  };
}
