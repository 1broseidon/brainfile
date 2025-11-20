import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, BrainfileValidator } from '@brainfile/core';
import chalk from 'chalk';
import * as yaml from 'js-yaml';

interface LintOptions {
  file: string;
  fix?: boolean;
  check?: boolean; // For CI/CD - exits with error code if issues found
}

interface LintIssue {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  fixable?: boolean;
}

export function lintCommand(options: LintOptions) {
  try {
    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`Error: File not found: ${filePath}`));
      process.exit(1);
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');
    const issues: LintIssue[] = [];
    let fixedContent = content;

    console.log(chalk.blue(`\n🔍 Linting: ${filePath}\n`));

    // Step 1: Check for fixable YAML issues (unquoted strings with colons)
    const quotableStrings = findUnquotedStringsWithColons(content);
    if (quotableStrings.length > 0) {
      quotableStrings.forEach(({ line, text }) => {
        issues.push({
          type: 'warning',
          message: `Unquoted string with colon at line ${line}: "${text}"`,
          line,
          fixable: true
        });
      });

      if (options.fix) {
        fixedContent = fixUnquotedStrings(content, quotableStrings);
      }
    }

    // Step 2: Check YAML syntax (use fixed content if fixes were applied)
    const contentToValidate = options.fix && fixedContent !== content ? fixedContent : content;
    const yamlIssues = checkYAMLSyntax(contentToValidate);
    
    // Only report YAML issues if they persist after fixes
    if (yamlIssues.length > 0) {
      // If we applied fixes, check if the issues still exist
      if (options.fix && fixedContent !== content) {
        const remainingYamlIssues = checkYAMLSyntax(fixedContent);
        issues.push(...remainingYamlIssues);
      } else {
        issues.push(...yamlIssues);
      }
    }

    // Step 3: Validate board structure (if YAML is valid after any fixes)
    const finalYamlIssues = options.fix ? checkYAMLSyntax(fixedContent) : yamlIssues;
    if (finalYamlIssues.length === 0) {
      const result = Brainfile.parseWithErrors(contentToValidate);

      if (result.board) {
        // Check for duplicate column IDs
        const duplicates = findDuplicateColumnIds(result.board);
        if (duplicates.length > 0) {
          duplicates.forEach(id => {
            issues.push({
              type: 'warning',
              message: `Duplicate column ID found: "${id}"`,
              fixable: false
            });
          });
        }

        // Run structural validation
        const validation = BrainfileValidator.validate(result.board);
        if (!validation.valid) {
          validation.errors.forEach(err => {
            issues.push({
              type: 'error',
              message: `${err.path}: ${err.message}`,
              fixable: false
            });
          });
        }
      } else if (result.error) {
        issues.push({
          type: 'error',
          message: `Parse error: ${result.error}`,
          fixable: false
        });
      }
    }

    // Report findings
    if (issues.length === 0) {
      console.log(chalk.green('✓ No issues found! Your brainfile.md is valid.\n'));
      return; // Success - don't exit, just return
    }

    // Group issues by type
    const errors = issues.filter(i => i.type === 'error');
    const warnings = issues.filter(i => i.type === 'warning');
    const fixableCount = issues.filter(i => i.fixable).length;

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
        const fixable = issue.fixable ? chalk.gray(' [fixable]') : '';
        console.log(chalk.yellow(`  • ${issue.message}${location}${fixable}`));
      });
      console.log();
    }

    // Apply fixes if requested
    let remainingErrors = errors;
    let remainingWarnings = warnings;
    
    if (options.fix && fixableCount > 0) {
      fs.writeFileSync(filePath, fixedContent, 'utf-8');
      console.log(chalk.green(`✓ Fixed ${fixableCount} issue${fixableCount > 1 ? 's' : ''}!\n`));
      
      // Calculate remaining issues after fixes
      const remainingIssues = issues.filter(i => !i.fixable);
      remainingErrors = remainingIssues.filter(i => i.type === 'error');
      remainingWarnings = remainingIssues.filter(i => i.type === 'warning');
      
      if (remainingIssues.length > 0) {
        console.log(chalk.yellow(`⚠ ${remainingIssues.length} issue${remainingIssues.length > 1 ? 's' : ''} remaining (not auto-fixable)\n`));
      }
    } else if (fixableCount > 0 && !options.fix) {
      console.log(chalk.gray(`💡 Run with --fix to automatically fix ${fixableCount} issue${fixableCount > 1 ? 's' : ''}\n`));
    }

    // Summary
    const displayIssues = options.fix ? (remainingErrors.length + remainingWarnings.length) : (errors.length + warnings.length);
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`Total: ${displayIssues} issue${displayIssues > 1 ? 's' : ''} ${options.fix && fixableCount > 0 ? 'remaining' : 'found'}`));
    if (fixableCount > 0 && !options.fix) {
      console.log(chalk.gray(`       ${fixableCount} fixable with --fix`));
    }
    console.log();

    // Exit with error code in check mode
    if (options.check) {
      const checkErrors = options.fix ? remainingErrors : errors;
      const checkWarnings = options.fix ? remainingWarnings : warnings;
      if (checkErrors.length > 0 || checkWarnings.length > 0) {
        process.exit(1);
      }
    }

    // Normal mode: only exit 1 on errors (not warnings)
    const finalErrors = options.fix ? remainingErrors : errors;
    if (finalErrors.length > 0) {
      process.exit(1);
    }
    // Success - don't exit, just return

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Check YAML syntax by attempting to parse
 */
function checkYAMLSyntax(content: string): LintIssue[] {
  const issues: LintIssue[] = [];

  try {
    const lines = content.split('\n');
    
    // Find frontmatter boundaries
    if (!lines[0].trim().startsWith('---')) {
      issues.push({
        type: 'error',
        message: 'Missing YAML frontmatter opening (---)',
        line: 1,
        fixable: false
      });
      return issues;
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) {
      issues.push({
        type: 'error',
        message: 'Missing YAML frontmatter closing (---)',
        fixable: false
      });
      return issues;
    }

    // Extract and parse YAML
    const yamlContent = lines.slice(1, endIndex).join('\n');
    yaml.load(yamlContent);

  } catch (error: any) {
    if (error.mark) {
      issues.push({
        type: 'error',
        message: `YAML syntax error: ${error.message}`,
        line: error.mark.line + 2, // Adjust for frontmatter offset
        fixable: false
      });
    } else {
      issues.push({
        type: 'error',
        message: `YAML error: ${error.message}`,
        fixable: false
      });
    }
  }

  return issues;
}

/**
 * Find strings with colons that should be quoted
 */
function findUnquotedStringsWithColons(content: string): Array<{ line: number; text: string; fullLine: string }> {
  const results: Array<{ line: number; text: string; fullLine: string }> = [];
  const lines = content.split('\n');

  // Look for title: or rule: fields with unquoted strings containing colons
  const titlePattern = /^(\s+)(title|rule):\s+([^"'][^"\n]*:\s*[^"\n]+)$/;

  lines.forEach((line, index) => {
    const match = line.match(titlePattern);
    if (match) {
      const text = match[3].trim();
      // Check if it contains a colon followed by space (YAML separator)
      if (text.includes(': ')) {
        results.push({
          line: index + 1,
          text,
          fullLine: line
        });
      }
    }
  });

  return results;
}

/**
 * Fix unquoted strings by adding quotes
 */
function fixUnquotedStrings(content: string, issues: Array<{ line: number; text: string; fullLine: string }>): string {
  const lines = content.split('\n');

  issues.forEach(issue => {
    const lineIndex = issue.line - 1;
    const line = lines[lineIndex];
    
    // Match the pattern and replace with quoted version
    const match = line.match(/^(\s+)(title|rule):\s+(.+)$/);
    if (match) {
      const indent = match[1];
      const key = match[2];
      const value = match[3].trim();
      
      // Only quote if not already quoted
      if (!value.startsWith('"') && !value.startsWith("'")) {
        lines[lineIndex] = `${indent}${key}: "${value}"`;
      }
    }
  });

  return lines.join('\n');
}

/**
 * Find duplicate column IDs
 */
function findDuplicateColumnIds(board: any): string[] {
  const columnIds: string[] = board.columns?.map((col: any) => col.id) || [];
  const duplicates = columnIds.filter((id: string, index: number) => columnIds.indexOf(id) !== index);
  return Array.from(new Set<string>(duplicates)); // Return unique duplicates
}

