import * as fs from 'fs';
import * as path from 'path';
import { BrainfileLinter, LintIssue } from '@brainfile/core';
import chalk from 'chalk';

interface LintOptions {
  file: string;
  fix?: boolean;
  check?: boolean; // For CI/CD - exits with error code if issues found
}

export function lintCommand(options: LintOptions) {
  try {
    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`Error: File not found: ${filePath}`));
      console.log('');
      console.log(chalk.gray('To create a new brainfile, run:'));
      console.log(chalk.cyan('  brainfile init'));
      process.exit(1);
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    console.log(chalk.blue(`\n🔍 Linting: ${filePath}\n`));

    // Run linter from core
    const result = BrainfileLinter.lint(content, { autoFix: options.fix });
    
    // Report findings
    if (result.issues.length === 0) {
      console.log(chalk.green('✓ No issues found! Your brainfile.md is valid.\n'));
      return; // Success - don't exit, just return
    }

    // Group issues by type
    const grouped = BrainfileLinter.groupIssues(result);
    const { errors, warnings, fixable } = grouped;

    // Display errors
    if (errors.length > 0) {
      console.log(chalk.red.bold(`✗ ${errors.length} Error${errors.length > 1 ? 's' : ''}:`));
      errors.forEach(issue => {
        const location = issue.line ? chalk.gray(` [line ${issue.line}]`) : '';
        console.log(chalk.red(`  • ${issue.message}${location}`));
      });
      console.log();
    }

    // Display warnings
    if (warnings.length > 0) {
      console.log(chalk.yellow.bold(`⚠ ${warnings.length} Warning${warnings.length > 1 ? 's' : ''}:`));
      warnings.forEach(issue => {
        const location = issue.line ? chalk.gray(` [line ${issue.line}]`) : '';
        const fixableTag = issue.fixable ? chalk.gray(' [fixable]') : '';
        console.log(chalk.yellow(`  • ${issue.message}${location}${fixableTag}`));
      });
      console.log();
    }

    // Apply fixes if requested and content was fixed
    if (options.fix && result.fixedContent) {
      fs.writeFileSync(filePath, result.fixedContent, 'utf-8');
      console.log(chalk.green(`✓ Fixed ${fixable.length} issue${fixable.length > 1 ? 's' : ''}!\n`));
      
      // Recheck after fixes
      const recheckResult = BrainfileLinter.lint(result.fixedContent, { autoFix: false });
      const remainingIssues = recheckResult.issues;
      
      if (remainingIssues.length > 0) {
        console.log(chalk.yellow(`⚠ ${remainingIssues.length} issue${remainingIssues.length > 1 ? 's' : ''} remaining (not auto-fixable)\n`));
      }
    } else if (fixable.length > 0 && !options.fix) {
      console.log(chalk.gray(`💡 Run with --fix to automatically fix ${fixable.length} issue${fixable.length > 1 ? 's' : ''}\n`));
    }

    // Summary
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`Total: ${result.issues.length} issue${result.issues.length > 1 ? 's' : ''} found`));
    if (fixable.length > 0 && !options.fix) {
      console.log(chalk.gray(`       ${fixable.length} fixable with --fix`));
    }
    console.log();

    // Exit with error code in check mode
    if (options.check) {
      if (errors.length > 0 || warnings.length > 0) {
        process.exit(1);
      }
    }

    // Normal mode: only exit 1 on errors (not warnings)
    if (errors.length > 0) {
      process.exit(1);
    }
    // Success - don't exit, just return

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
