/**
 * Rules command for Brainfile CLI
 *
 * Manage project rules (always, never, prefer, context) in brainfile.md.
 *
 * Usage:
 *   brainfile rules                     # List all rules
 *   brainfile rules list                # List all rules
 *   brainfile rules add <category> <text>   # Add a rule
 *   brainfile rules delete <category> <id>  # Delete a rule by ID
 *   brainfile rules --json              # Output in JSON format
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  Brainfile,
  addRule,
  deleteRule,
  type Rules,
  type Rule,
} from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

// ============================================================================
// Types
// ============================================================================

export type RuleCategory = 'always' | 'never' | 'prefer' | 'context';

export interface RulesListOptions {
  file: string;
  json?: boolean;
  category?: RuleCategory;
}

export interface RulesAddOptions {
  file: string;
  category: RuleCategory;
  text: string;
  json?: boolean;
}

export interface RulesDeleteOptions {
  file: string;
  category: RuleCategory;
  id: number;
  json?: boolean;
}

export interface RulesListResult {
  success: true;
  action: 'list';
  rules: Rules;
  totalCount: number;
}

export interface RulesAddResult {
  success: true;
  action: 'add';
  category: RuleCategory;
  rule: Rule;
}

export interface RulesDeleteResult {
  success: true;
  action: 'delete';
  category: RuleCategory;
  id: number;
}

export type RulesResult = RulesListResult | RulesAddResult | RulesDeleteResult;

// ============================================================================
// Constants
// ============================================================================

const VALID_CATEGORIES: RuleCategory[] = ['always', 'never', 'prefer', 'context'];

const CATEGORY_DESCRIPTIONS: Record<RuleCategory, string> = {
  always: 'Rules that must always be followed',
  never: 'Things that should never be done',
  prefer: 'Preferred approaches when applicable',
  context: 'Context-specific guidelines',
};

// ============================================================================
// Help Text
// ============================================================================

export const RULES_COMMAND_HELP = `
Examples:
  brainfile rules                     # List all rules
  brainfile rules list                # List all rules
  brainfile rules list --category always  # List only 'always' rules
  brainfile rules add always "Use TypeScript strict mode"
  brainfile rules add never "Commit .env files"
  brainfile rules add prefer "Functional over imperative style"
  brainfile rules add context "For API routes, use Express middleware"
  brainfile rules delete always 1     # Delete rule with id=1 from 'always'
  brainfile rules --json              # Output as JSON

Categories:
  always   - ${CATEGORY_DESCRIPTIONS.always}
  never    - ${CATEGORY_DESCRIPTIONS.never}
  prefer   - ${CATEGORY_DESCRIPTIONS.prefer}
  context  - ${CATEGORY_DESCRIPTIONS.context}

Notes:
  - Rules are stored in brainfile.md frontmatter under the 'rules' field
  - Each rule has an auto-generated numeric ID within its category
  - Rules provide guidance to AI agents working on the project
`.trimEnd();

// ============================================================================
// Helpers
// ============================================================================

function validateCategory(category: string): RuleCategory {
  const lower = category.toLowerCase() as RuleCategory;
  if (!VALID_CATEGORIES.includes(lower)) {
    throw new CLIError(
      `Invalid category: ${category}`,
      ExitCode.USER_ERROR,
      `Valid categories: ${VALID_CATEGORIES.join(', ')}`
    );
  }
  return lower;
}

function readBoardFromFile(filePath: string) {
  const resolvedPath = resolveCliBrainfilePath(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new CLIError(
      `File not found: ${resolvedPath}`,
      ExitCode.USER_ERROR
    );
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);

  if (!result.board) {
    throw new CLIError(
      'Failed to parse brainfile',
      ExitCode.USER_ERROR,
      result.error
    );
  }

  return { board: result.board, resolvedPath };
}

function writeBoard(filePath: string, board: any): void {
  const content = Brainfile.serialize(board);
  fs.writeFileSync(filePath, content, 'utf-8');
}

function countRules(rules: Rules | undefined): number {
  if (!rules) return 0;
  return (
    (rules.always?.length || 0) +
    (rules.never?.length || 0) +
    (rules.prefer?.length || 0) +
    (rules.context?.length || 0)
  );
}

// ============================================================================
// List Command
// ============================================================================

export function rulesListCommand(
  options: RulesListOptions,
  logger: Logger = defaultLogger
): RulesListResult {
  const { board } = readBoardFromFile(options.file);
  const rules = board.rules || {};
  const totalCount = countRules(rules);

  // Filter by category if specified
  let displayRules = rules;
  if (options.category) {
    const cat = validateCategory(options.category);
    displayRules = { [cat]: rules[cat] || [] } as Rules;
  }

  if (options.json) {
    const output = {
      rules: displayRules,
      totalCount: options.category
        ? (displayRules[options.category]?.length || 0)
        : totalCount,
    };
    logger.log(JSON.stringify(output, null, 2));
  } else {
    if (totalCount === 0) {
      logger.log('');
      logger.log(chalk.gray('No rules defined.'));
      logger.log(chalk.gray('Run: brainfile rules add <category> "<rule text>"'));
    } else {
      logger.log('');
      logger.log(chalk.bold('Project Rules'));
      logger.log('');

      for (const category of VALID_CATEGORIES) {
        if (options.category && options.category !== category) continue;

        const categoryRules = displayRules[category];
        if (!categoryRules || categoryRules.length === 0) continue;

        const categoryColor = getCategoryColor(category);
        logger.log(categoryColor(`${category.toUpperCase()}:`));

        for (const rule of categoryRules) {
          logger.log(`  ${chalk.gray(`[${rule.id}]`)} ${rule.rule}`);
        }
        logger.log('');
      }
    }
  }

  return {
    success: true,
    action: 'list',
    rules: displayRules,
    totalCount,
  };
}

function getCategoryColor(category: RuleCategory) {
  switch (category) {
    case 'always':
      return chalk.green;
    case 'never':
      return chalk.red;
    case 'prefer':
      return chalk.blue;
    case 'context':
      return chalk.yellow;
  }
}

// ============================================================================
// Add Command
// ============================================================================

export function rulesAddCommand(
  options: RulesAddOptions,
  logger: Logger = defaultLogger
): RulesAddResult {
  const category = validateCategory(options.category);
  const { board, resolvedPath } = readBoardFromFile(options.file);

  const result = addRule(board, category, options.text);

  if (!result.success || !result.board) {
    throw new CLIError(
      result.error || 'Failed to add rule',
      ExitCode.USER_ERROR
    );
  }

  writeBoard(resolvedPath, result.board);

  // Find the newly added rule (last one in the category)
  const newRules = result.board.rules?.[category] || [];
  const newRule = newRules[newRules.length - 1];

  if (options.json) {
    const output = {
      success: true,
      action: 'add',
      category,
      rule: newRule,
    };
    logger.log(JSON.stringify(output, null, 2));
  } else {
    const categoryColor = getCategoryColor(category);
    logger.log('');
    logger.log(
      `${chalk.green('+')} Added ${categoryColor(category)} rule: ${chalk.gray(`[${newRule.id}]`)} ${newRule.rule}`
    );
  }

  return {
    success: true,
    action: 'add',
    category,
    rule: newRule,
  };
}

// ============================================================================
// Delete Command
// ============================================================================

export function rulesDeleteCommand(
  options: RulesDeleteOptions,
  logger: Logger = defaultLogger
): RulesDeleteResult {
  const category = validateCategory(options.category);
  const { board, resolvedPath } = readBoardFromFile(options.file);

  // Find the rule being deleted for the message
  const existingRules = board.rules?.[category] || [];
  const ruleToDelete = existingRules.find((r: Rule) => r.id === options.id);

  if (!ruleToDelete) {
    throw new CLIError(
      `Rule ${options.id} not found in ${category}`,
      ExitCode.USER_ERROR,
      existingRules.length > 0
        ? `Available IDs in ${category}: ${existingRules.map((r: Rule) => r.id).join(', ')}`
        : `No rules in ${category} category`
    );
  }

  const result = deleteRule(board, category, options.id);

  if (!result.success || !result.board) {
    throw new CLIError(
      result.error || 'Failed to delete rule',
      ExitCode.USER_ERROR
    );
  }

  writeBoard(resolvedPath, result.board);

  if (options.json) {
    const output = {
      success: true,
      action: 'delete',
      category,
      id: options.id,
      deletedRule: ruleToDelete,
    };
    logger.log(JSON.stringify(output, null, 2));
  } else {
    const categoryColor = getCategoryColor(category);
    logger.log('');
    logger.log(
      `${chalk.red('-')} Deleted ${categoryColor(category)} rule: ${chalk.gray(`[${options.id}]`)} ${ruleToDelete.rule}`
    );
  }

  return {
    success: true,
    action: 'delete',
    category,
    id: options.id,
  };
}

// ============================================================================
// Main Command (dispatches to subcommands)
// ============================================================================

export interface RulesOptions {
  file: string;
  json?: boolean;
  category?: string;
  // For add subcommand
  addCategory?: string;
  addText?: string;
  // For delete subcommand
  deleteCategory?: string;
  deleteId?: string;
}

export function rulesCommand(
  action: 'list' | 'add' | 'delete' | undefined,
  args: string[],
  options: RulesOptions,
  logger: Logger = defaultLogger
): RulesResult {
  // Default action is list
  const effectiveAction = action || 'list';

  switch (effectiveAction) {
    case 'list':
      return rulesListCommand(
        {
          file: options.file,
          json: options.json,
          category: options.category as RuleCategory | undefined,
        },
        logger
      );

    case 'add': {
      // args should be [category, ...textParts]
      if (args.length < 2) {
        throw new CLIError(
          'Usage: brainfile rules add <category> <text>',
          ExitCode.USER_ERROR,
          `Categories: ${VALID_CATEGORIES.join(', ')}`
        );
      }
      const [category, ...textParts] = args;
      const text = textParts.join(' ');
      return rulesAddCommand(
        {
          file: options.file,
          category: category as RuleCategory,
          text,
          json: options.json,
        },
        logger
      );
    }

    case 'delete': {
      // args should be [category, id]
      if (args.length < 2) {
        throw new CLIError(
          'Usage: brainfile rules delete <category> <id>',
          ExitCode.USER_ERROR,
          `Categories: ${VALID_CATEGORIES.join(', ')}`
        );
      }
      const [category, idStr] = args;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        throw new CLIError(
          `Invalid rule ID: ${idStr}`,
          ExitCode.USER_ERROR,
          'Rule ID must be a number'
        );
      }
      return rulesDeleteCommand(
        {
          file: options.file,
          category: category as RuleCategory,
          id,
          json: options.json,
        },
        logger
      );
    }

    default:
      throw new CLIError(
        `Unknown action: ${effectiveAction}`,
        ExitCode.USER_ERROR,
        'Valid actions: list, add, delete'
      );
  }
}
