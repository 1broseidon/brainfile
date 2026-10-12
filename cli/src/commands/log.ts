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
import { resolveActor } from '../utils/actor';
import { readTasksDir, resolveDocType, writeTaskFile, scoreTaskDocument, type TaskDocument } from '@brainfile/core';
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
    throw operationFailed('Log command requires v2 per-task file architecture. Run: brainfile migrate');
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

/** A note appended to a task's log. */
export interface TaskNote {
  taskId: string;
  /** The line written: `- <timestamp>: [<who>] <message>`. */
  entry: string;
  /** Who it is attributed to, when anyone could be told. */
  agent?: string;
  /** True when the task is completed (its file is in logs/). */
  isLog: boolean;
}

/**
 * Append a timestamped note to a task's `## Log` section, on an open task or
 * a completed one. Attributed to `agent`, else the detected agent, else the
 * git user. The CLI's `note` and the MCP `note` tool both write through this.
 */
export function appendTaskNote(filePath: string, taskId: string, message: string, agent?: string): TaskNote {
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }
  if (!isV2(filePath)) {
    throw operationFailed('Log note command requires v2 per-task file architecture. Run: brainfile migrate');
  }

  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, taskId, true);
  if (!found) {
    throw taskNotFound(taskId);
  }

  const { doc, filePath: taskPath } = found;
  const timestamp = new Date().toISOString();
  // Who wrote it: --agent, else the detected agent, else the git user.
  const actor = agent?.trim() || resolveActor(path.dirname(filePath))?.name;
  const agentPrefix = actor ? `[${actor}] ` : '';
  const entry = `- ${timestamp}: ${agentPrefix}${message}`;

  // Extract existing sections from body
  const existingDesc = extractDescription(doc.body);
  const existingLog = extractLog(doc.body);
  const newLog = existingLog ? `${existingLog}\n${entry}` : entry;

  writeTaskFile(taskPath, doc.task, composeBody(existingDesc, newLog));
  return { taskId, entry, ...(actor ? { agent: actor } : {}), isLog: found.isLog };
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
  const { entry } = appendTaskNote(filePath, options.task, options.message, options.agent);

  logger.log(chalk.green('Log entry added.'));
  logger.log(chalk.gray(`  Task: ${options.task}`));
  logger.log(chalk.gray(`  ${entry}`));

  return { success: true, taskId: options.task, entry };
}

/** One task's log, open or completed. */
export interface TaskLogView {
  id: string;
  title: string;
  completedAt?: string;
  isLog: boolean;
  description?: string;
  log?: string;
}

/** A task's description and log, from board/ or logs/. */
export function readTaskLog(dirs: V2Dirs, taskId: string): TaskLogView {
  const found = findV2Task(dirs, taskId, true);
  if (!found) {
    throw taskNotFound(taskId);
  }
  const task = found.doc.task;
  const description = extractDescription(found.doc.body);
  const log = extractLog(found.doc.body);
  return {
    id: task.id,
    title: task.title,
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    isLog: found.isLog,
    ...(description ? { description } : {}),
    ...(log ? { log } : {}),
  };
}

/** A completed task whose title, description or log matches a search. */
export interface LogSearchMatch {
  id: string;
  title: string;
  completedAt?: string;
  /** Where it matched: the title, the log line, or the description. */
  match: string;
}

/** Search the completed tasks in logs/: title, description and log. */
export function searchLogEntries(dirs: V2Dirs, query: string): LogSearchMatch[] {
  const queryLower = query.toLowerCase();
  const matches: LogSearchMatch[] = [];
  for (const doc of readTasksDir(dirs.logsDir)) {
    const task = doc.task;
    // Matching decision is core's; the match-context snippet below is presentation.
    if (scoreTaskDocument(doc, queryLower) <= 0) continue;
    const logContent = extractLog(doc.body);
    let match: string;
    if (task.title.toLowerCase().includes(queryLower)) {
      match = `Title: ${task.title}`;
    } else if (logContent && logContent.toLowerCase().includes(queryLower)) {
      // Find the line containing the match
      const matchLine = logContent.split('\n').find(l => l.toLowerCase().includes(queryLower));
      match = matchLine ? matchLine.trim() : 'Log entry';
    } else {
      match = 'Description match';
    }
    matches.push({ id: task.id, title: task.title, completedAt: task.completedAt, match });
  }
  return matches;
}

/** A completed task, newest first. */
export interface RecentLogEntry {
  id: string;
  title: string;
  completedAt?: string;
  /** Only in ledger.jsonl, with no file in logs/. */
  ledgerOnly?: boolean;
}

/**
 * Completed work, newest first: logs/ (decisions retired there were never
 * completed and are left out) and ledger records with no file there.
 */
export function recentLogEntries(dirs: V2Dirs): RecentLogEntry[] {
  // A decision retired to logs/ (spec-11) was never completed: not a recent completion.
  const logDocs = readTasksDir(dirs.logsDir)
    .filter((d) => d.task.completedAt || resolveDocType(d.task.type).role !== 'decision');

  // Union in ledger records that have no markdown archive. Under the
  // dual-artifact model both always exist, but boards touched by the
  // pre-2026-08-13 destructive --logs-to-ledger may have ledger-only history.
  const seenIds = new Set(logDocs.map((d) => d.task.id));
  const entries: RecentLogEntry[] =
    logDocs.map((d) => ({ id: d.task.id, title: d.task.title, completedAt: d.task.completedAt }));
  const ledgerPath = path.join(dirs.logsDir, 'ledger.jsonl');
  if (fs.existsSync(ledgerPath)) {
    for (const line of fs.readFileSync(ledgerPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        if (record?.id && !seenIds.has(record.id)) {
          seenIds.add(record.id);
          entries.push({ id: record.id, title: record.title ?? record.id, completedAt: record.completedAt, ledgerOnly: true });
        }
      } catch { /* skip malformed lines */ }
    }
  }

  entries.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  return entries;
}

function viewTaskLog(dirs: V2Dirs, taskId: string, logger: Logger): LogResult {
  const view = readTaskLog(dirs, taskId);

  logger.log('');
  logger.log(chalk.bold(`Task: ${view.id} - ${view.title}`));
  if (view.completedAt) {
    logger.log(chalk.gray(`Completed: ${view.completedAt}`));
  }

  if (view.description) {
    logger.log('');
    logger.log(chalk.bold('Description:'));
    logger.log(view.description);
  }

  if (view.log) {
    logger.log('');
    logger.log(chalk.bold('Log:'));
    logger.log(view.log);
  } else {
    logger.log('');
    logger.log(chalk.gray('(no log entries)'));
  }
  logger.log('');

  return {
    success: true,
    task: { id: view.id, title: view.title, log: view.log },
  };
}

function searchLogs(dirs: V2Dirs, query: string, logger: Logger): LogResult {
  const matches = searchLogEntries(dirs, query);

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
      logger.log(`    ${chalk.gray('Match:')} ${match.match}`);
      logger.log('');
    }
  }

  return {
    success: true,
    tasks: matches.map(m => ({ id: m.id, title: m.title, completedAt: m.completedAt })),
  };
}

function listRecentLogs(dirs: V2Dirs, logger: Logger): LogResult {
  const entries = recentLogEntries(dirs);

  logger.log('');
  logger.log(chalk.bold(`Recently completed tasks (${entries.length})`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (entries.length === 0) {
    logger.log(chalk.gray('  No completed tasks found.'));
  } else {
    for (const entry of entries.slice(0, 20)) {
      const marker = entry.ledgerOnly ? chalk.gray(' (ledger only)') : '';
      logger.log(`  ${chalk.gray(`[${entry.id}]`)} ${chalk.white(entry.title)}${marker}`);
      if (entry.completedAt) {
        logger.log(`    ${chalk.gray('Completed:')} ${entry.completedAt}`);
      }
      logger.log('');
    }
  }

  return {
    success: true,
    tasks: entries.map(({ id, title, completedAt }) => ({ id, title, completedAt })),
  };
}
