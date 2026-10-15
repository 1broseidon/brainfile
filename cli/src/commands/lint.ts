import * as fs from 'fs';
import * as path from 'path';
import {
  BrainfileLinter,
  LintIssue,
  buildDocGraph,
  lintDocGraph,
  lintDispatchRecords,
  lintTaskRefs,
  parseFrontmatter,
  readRelatedConfig,
  readTasksDir,
  type TypesConfig,
} from '@brainfile/core';
import chalk from 'chalk';
import { defaultLogger, type Logger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { boardConflictRelation, surveyBoards } from '../utils/board-sync';
import { pruneLostBoardCheckouts } from '../utils/board-repo';

interface LintOptions {
  file: string;
  fix?: boolean;
  check?: boolean; // For CI/CD - exits with error code if issues found
}

export interface LintResult {
  success: boolean;
  issues: LintIssue[];
  fixed: boolean;
  fixedCount: number;
}

/** What `lint` found, and what `--fix` changed: the data the CLI prints and the MCP lint tool returns. */
export interface LintReport {
  filePath: string;
  issues: LintIssue[];
  errors: LintIssue[];
  warnings: LintIssue[];
  fixable: LintIssue[];
  /** True when `fix` rewrote the config. */
  fixed: boolean;
  fixedCount: number;
  /** After a fix: what the config check still finds (not auto-fixable). */
  remaining: LintIssue[];
}

/**
 * Where the board lives (spec-15): another board that disagrees with it, the
 * board branch checked out away from `.brainfile/` (or lost), and a code
 * branch still tracking an old copy. Never throws; a failed look is no issue.
 */
export function lintBoardLocation(dotDir: string): LintIssue[] {
  let survey;
  try {
    survey = surveyBoards(dotDir);
  } catch {
    return [];
  }
  const issues: LintIssue[] = [];
  if (survey.conflict) {
    issues.push({
      type: 'error',
      code: 'two-boards',
      message: `${survey.conflict.message} ${boardConflictRelation(survey.conflict)} Writes are refused until: ${survey.conflict.resolve}`,
    });
  }
  if (survey.outsideHome) {
    issues.push({
      type: 'warning',
      code: 'board-checkout-elsewhere',
      message: `This board is checked out outside ${survey.outsideHome}, where it belongs. Move it home: brainfile adopt refs/heads/${boardBranchName(survey)}`,
    });
  }
  for (const stray of survey.strayWorktrees) {
    issues.push(
      stray.missing
        ? { type: 'warning', code: 'board-checkout-lost', fixable: true, message: `A checkout of the board branch at ${stray.path} is gone but still registered.` }
        : {
            type: 'warning',
            code: 'board-checkout-elsewhere',
            message: `The board branch is also checked out at ${stray.path}; it belongs at .brainfile/ only. Finish there, then: git worktree remove ${stray.path}`,
          }
    );
  }
  if (survey.trackedTwice) {
    issues.push({
      type: 'warning',
      code: 'board-tracked-twice',
      message: `${survey.trackedTwice.label.replace(/^the copy on /, '')} still tracks an old copy of .brainfile/ (${survey.trackedTwice.docs} docs). Remove it in one commit: brainfile migrate --to-branch`,
    });
  }
  return issues;
}

function boardBranchName(survey: ReturnType<typeof surveyBoards>): string {
  const branch = survey.boards[0]?.ref ?? 'refs/heads/brainfile';
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : 'brainfile';
}

/**
 * Lint a board: the config's syntax and shape, `dependsOn` references to
 * related boards, and the graph. With `fix`, write the fixable part back.
 * Never prints and never throws for issues; a missing file is a CLIError.
 */
export function lintBoard(filePath: string, options: { fix?: boolean } = {}): LintReport {
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = BrainfileLinter.lint(content, { autoFix: options.fix });
  result.issues.push(...lintDependsOnRefs(filePath, content));
  result.issues.push(...lintGraph(filePath, content));
  result.issues.push(...lintDispatchRecords(readTasksDir(path.join(path.dirname(filePath), 'board')).map((doc) => doc.task)));
  const location = lintBoardLocation(path.dirname(path.resolve(filePath)));
  result.issues.push(...location);
  const { errors, warnings, fixable } = BrainfileLinter.groupIssues(result);

  let fixed = false;
  let fixedCount = 0;
  const lost = location.filter((issue) => issue.code === 'board-checkout-lost');
  if (options.fix && lost.length > 0) {
    fixedCount += pruneLostBoardCheckouts(path.dirname(path.resolve(filePath))).length;
    fixed = fixedCount > 0;
  }
  let remaining: LintIssue[] = [];
  if (options.fix && result.fixedContent && result.issues.length > 0) {
    fs.writeFileSync(filePath, result.fixedContent, 'utf-8');
    fixed = true;
    fixedCount = fixable.length;
    remaining = BrainfileLinter.lint(result.fixedContent, { autoFix: false }).issues;
  }
  return { filePath, issues: result.issues, errors, warnings, fixable, fixed, fixedCount, remaining };
}

export function lintCommand(options: LintOptions, logger: Logger = defaultLogger): LintResult {
  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  logger.log(chalk.blue(`\n🔍 Linting: ${filePath}\n`));

  const report = lintBoard(filePath, { fix: options.fix });

  // Report findings
  if (report.issues.length === 0) {
    logger.log(chalk.green('✓ No issues found! Your brainfile.md is valid.\n'));
    return { success: true, issues: [], fixed: false, fixedCount: 0 };
  }

  const { errors, warnings, fixable } = report;

  // Display errors
  if (errors.length > 0) {
    logger.log(chalk.red.bold(`✗ ${errors.length} Error${errors.length > 1 ? 's' : ''}:`));
    errors.forEach(issue => {
      const location = issue.line ? chalk.gray(` [line ${issue.line}]`) : '';
      logger.log(chalk.red(`  • ${issue.message}${location}`));
    });
    logger.log('');
  }

  // Display warnings
  if (warnings.length > 0) {
    logger.log(chalk.yellow.bold(`⚠ ${warnings.length} Warning${warnings.length > 1 ? 's' : ''}:`));
    warnings.forEach(issue => {
      const location = issue.line ? chalk.gray(` [line ${issue.line}]`) : '';
      const fixableTag = issue.fixable ? chalk.gray(' [fixable]') : '';
      logger.log(chalk.yellow(`  • ${issue.message}${location}${fixableTag}`));
    });
    logger.log('');
  }

  // Fixes were applied by lintBoard when requested and possible
  if (report.fixed) {
    logger.log(chalk.green(`✓ Fixed ${fixable.length} issue${fixable.length > 1 ? 's' : ''}!\n`));

    const remainingIssues = report.remaining;
    if (remainingIssues.length > 0) {
      logger.log(chalk.yellow(`⚠ ${remainingIssues.length} issue${remainingIssues.length > 1 ? 's' : ''} remaining (not auto-fixable)\n`));
    }
  } else if (fixable.length > 0 && !options.fix) {
    logger.log(chalk.gray(`💡 Run with --fix to automatically fix ${fixable.length} issue${fixable.length > 1 ? 's' : ''}\n`));
  }

  // Summary
  logger.log(chalk.gray('─'.repeat(60)));
  logger.log(chalk.gray(`Total: ${report.issues.length} issue${report.issues.length > 1 ? 's' : ''} found`));
  if (fixable.length > 0 && !options.fix) {
    logger.log(chalk.gray(`       ${fixable.length} fixable with --fix`));
  }
  logger.log('');

  // Exit with error code in check mode
  if (options.check) {
    if (errors.length > 0 || warnings.length > 0) {
      throw new CLIError('Lint check failed', ExitCode.USER_ERROR);
    }
  }

  // Normal mode: only exit 1 on errors (not warnings)
  if (errors.length > 0) {
    throw new CLIError('Lint failed with errors', ExitCode.USER_ERROR);
  }

  return { success: true, issues: report.issues, fixed: report.fixed, fixedCount: report.fixedCount };
}

/**
 * spec-10: `dependsOn` entries on this board's open tasks that name a related
 * board must be well formed and name an alias under `related:`. A related
 * folder missing from this machine is fine; plain IDs are not checked.
 */
function lintDependsOnRefs(filePath: string, content: string): LintIssue[] {
  const config = parseFrontmatter<Record<string, unknown>>(content)?.data;
  const boardDir = path.join(path.dirname(filePath), 'board');
  const tasks = readTasksDir(boardDir).map((doc) => doc.task);
  return lintTaskRefs(tasks, readRelatedConfig(config));
}

/**
 * spec-12: the graph of open documents. Parents that are missing, loop or do
 * not fit the defaults (an error on a strict board), `decisions:` that name
 * nothing or something other than a decision, and links that treat a
 * decision as work.
 */
function lintGraph(filePath: string, content: string): LintIssue[] {
  const config = parseFrontmatter<Record<string, unknown>>(content)?.data;
  if (!config) return [];
  const dotDir = path.dirname(filePath);
  const boardDir = path.join(dotDir, 'board');
  if (!fs.existsSync(boardDir)) return [];
  const tasks = [
    ...readTasksDir(boardDir).map((doc) => doc.task),
    ...readTasksDir(path.join(dotDir, 'logs')).map((doc) => doc.task),
  ];
  const graph = buildDocGraph(tasks, { types: config.types as TypesConfig | undefined });
  return lintDocGraph(graph, { strict: config.strict === true });
}
