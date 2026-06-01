import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Brainfile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { getV2Dirs, isV2, findV2Task } from '../utils/v2-detect';

export type AdrRuleCategory = 'prefer' | 'always' | 'never' | 'context';

export interface AdrPromoteOptions {
  file: string;
  task?: string;
  category?: string;
}

export interface PromotedRuleEntry {
  id: number;
  rule: string;
  source: string;
}

export interface AdrPromoteResult {
  success: true;
  taskId: string;
  category: AdrRuleCategory;
  rule: PromotedRuleEntry;
  completedAt: string;
}

const VALID_CATEGORIES: AdrRuleCategory[] = ['prefer', 'always', 'never', 'context'];

export const ADR_COMMAND_HELP = `
Examples:
  brainfile adr promote -t adr-1 --category prefer
  brainfile adr promote -t adr-12 --category always -f .brainfile/brainfile.md
`.trimEnd();

function assertSafeTaskId(taskId: string): void {
  const trimmed = taskId.trim();
  if (!trimmed || trimmed !== taskId) {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }

  if (taskId === '.' || taskId === '..') {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }

  if (path.isAbsolute(taskId) || /[\\/]/.test(taskId)) {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }
}

function validateCategory(category: string | undefined): AdrRuleCategory {
  if (!category) {
    throw missingRequired(
      '--category',
      'brainfile adr promote --task <adr-id> --category <prefer|always|never|context> [--file <path>]'
    );
  }

  const normalized = category.trim().toLowerCase() as AdrRuleCategory;
  if (!VALID_CATEGORIES.includes(normalized)) {
    throw new CLIError(
      `Invalid category: ${category}`,
      ExitCode.USER_ERROR,
      `Valid categories: ${VALID_CATEGORIES.join(', ')}`
    );
  }
  return normalized;
}

function readBoard(filePath: string): { board: any; resolvedPath: string } {
  const resolvedPath = resolveCliBrainfilePath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw fileNotFound(resolvedPath);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  return { board: parsed.board as any, resolvedPath };
}

function writeBoard(filePath: string, board: any): void {
  fs.writeFileSync(filePath, Brainfile.serialize(board), 'utf-8');
}

function extractRuleText(title: string): string {
  const trimmed = title.trim();
  const withoutAdrPrefix = trimmed.replace(/^ADR-\d+\s*:\s*/i, '').trim();
  return withoutAdrPrefix.length > 0 ? withoutAdrPrefix : trimmed;
}

function parseRuleId(id: unknown): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return id;
  }
  if (typeof id === 'string') {
    const prefixed = id.match(/^rule-(\d+)$/i);
    if (prefixed) {
      return Number(prefixed[1]);
    }
    const numeric = id.match(/^(\d+)$/);
    if (numeric) {
      return Number(numeric[1]);
    }
  }
  return null;
}

function getNextRuleId(rules: Record<string, unknown> | undefined): number {
  if (!rules) return 1;

  let maxId = 0;
  for (const categoryRules of Object.values(rules)) {
    if (!Array.isArray(categoryRules)) continue;
    for (const rule of categoryRules) {
      const parsedId = parseRuleId((rule as { id?: unknown })?.id);
      if (parsedId !== null) {
        maxId = Math.max(maxId, parsedId);
      }
    }
  }

  return maxId + 1;
}

export function adrPromoteCommand(
  options: AdrPromoteOptions,
  logger: Logger = defaultLogger
): AdrPromoteResult {
  if (!options.task) {
    throw missingRequired(
      '--task',
      'brainfile adr promote --task <adr-id> --category <prefer|always|never|context> [--file <path>]'
    );
  }

  const category = validateCategory(options.category);
  const { board, resolvedPath } = readBoard(options.file);

  if (!isV2(resolvedPath)) {
    throw operationFailed('adr promote requires v2 per-task file architecture. Run: brainfile migrate');
  }

  assertSafeTaskId(options.task);

  const dirs = getV2Dirs(resolvedPath);
  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const { doc, filePath: taskPath } = found;
  const task = doc.task;
  if ((task.type || '').toLowerCase() !== 'adr') {
    throw operationFailed(
      `Only ADRs can be promoted. ${task.id} has type "${task.type || 'unknown'}".`
    );
  }

  const ruleText = extractRuleText(task.title);
  const ruleId = getNextRuleId(board.rules as Record<string, unknown> | undefined);
  const promotedRule: PromotedRuleEntry = {
    id: ruleId,
    rule: ruleText,
    source: task.id,
  };

  if (!board.rules || typeof board.rules !== 'object' || Array.isArray(board.rules)) {
    board.rules = {};
  }

  const categoryRules: unknown[] = Array.isArray(board.rules[category])
    ? board.rules[category]
    : [];
  board.rules[category] = [...categoryRules, promotedRule];
  writeBoard(resolvedPath, board);

  const completedAt = new Date().toISOString();
  const promotedTask = {
    ...task,
    status: 'promoted',
    completedAt,
  } as Task & { status?: string };
  delete promotedTask.column;
  delete promotedTask.position;

  fs.mkdirSync(dirs.logsDir, { recursive: true });
  const logPath = path.join(dirs.logsDir, taskFileName(task.id));
  if (fs.existsSync(logPath)) {
    throw operationFailed(`Log already exists for ADR: ${task.id}`);
  }

  writeTaskFile(logPath, promotedTask as Task, doc.body);
  fs.unlinkSync(taskPath);

  logger.log(chalk.green('ADR promoted!'));
  logger.log('');
  logger.log(chalk.gray(`  ADR:         ${task.id} - ${task.title}`));
  logger.log(chalk.gray(`  Category:    ${category}`));
  logger.log(chalk.gray(`  Rule:        ${promotedRule.rule}`));
  logger.log(chalk.gray(`  Source:      ${promotedRule.source}`));
  logger.log(chalk.gray(`  Moved to:    logs/${task.id}.md`));

  return {
    success: true,
    taskId: task.id,
    category,
    rule: promotedRule,
    completedAt,
  };
}
