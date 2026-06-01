import * as fs from 'fs';
import { BrainfileLinter, LintIssue } from '@brainfile/core';
import chalk from 'chalk';
import { defaultLogger, type Logger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

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

export function lintCommand(options: LintOptions, logger: Logger = defaultLogger): LintResult {
  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');

  logger.log(chalk.blue(`\n🔍 Linting: ${filePath}\n`));

  // Run linter from core
  const result = BrainfileLinter.lint(content, { autoFix: options.fix });

  // Report findings
  if (result.issues.length === 0) {
    logger.log(chalk.green('✓ No issues found! Your brainfile.md is valid.\n'));
    return { success: true, issues: [], fixed: false, fixedCount: 0 };
  }

  // Group issues by type
  const grouped = BrainfileLinter.groupIssues(result);
  const { errors, warnings, fixable } = grouped;

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

  let fixedCount = 0;
  let fixed = false;

  // Apply fixes if requested and content was fixed
  if (options.fix && result.fixedContent) {
    fs.writeFileSync(filePath, result.fixedContent, 'utf-8');
    fixedCount = fixable.length;
    fixed = true;
    logger.log(chalk.green(`✓ Fixed ${fixable.length} issue${fixable.length > 1 ? 's' : ''}!\n`));

    // Recheck after fixes
    const recheckResult = BrainfileLinter.lint(result.fixedContent, { autoFix: false });
    const remainingIssues = recheckResult.issues;

    if (remainingIssues.length > 0) {
      logger.log(chalk.yellow(`⚠ ${remainingIssues.length} issue${remainingIssues.length > 1 ? 's' : ''} remaining (not auto-fixable)\n`));
    }
  } else if (fixable.length > 0 && !options.fix) {
    logger.log(chalk.gray(`💡 Run with --fix to automatically fix ${fixable.length} issue${fixable.length > 1 ? 's' : ''}\n`));
  }

  // Summary
  logger.log(chalk.gray('─'.repeat(60)));
  logger.log(chalk.gray(`Total: ${result.issues.length} issue${result.issues.length > 1 ? 's' : ''} found`));
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

  return { success: true, issues: result.issues, fixed, fixedCount };
}
