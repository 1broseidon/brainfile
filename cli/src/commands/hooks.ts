import * as readline from 'readline';
import chalk from 'chalk';
import {
  SupportedTool,
  SettingsScope,
  getSettingsPath,
  installBrainfileHooks,
  uninstallBrainfileHooks,
  areBrainfileHooksInstalled
} from '../utils/hook-settings';
import { findBrainfile, getFileAgeMinutes } from '../utils/brainfile-finder';
import { hasUncommittedChanges } from '../utils/git-helper';
import { parseHookInput, shouldOutputJSON } from '../utils/hook-parser';
import { defaultLogger, type Logger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';

/**
 * Read JSON from stdin
 */
async function readStdin(inputParams: { stdin?: NodeJS.ReadStream } = {}): Promise<any> {
  const stdin = inputParams.stdin || process.stdin;

  // If stdin is a TTY (terminal), no data is being piped, so return empty object
  if (stdin.isTTY) {
    return {};
  }

  return new Promise((resolve) => {
    let data = '';
    const rl = readline.createInterface({
      input: stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      data += line;
    });

    rl.on('close', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Handle after-edit hook event
 */
export async function afterEditCommand(logger: Logger = defaultLogger, stdin?: NodeJS.ReadStream) {
  try {
    const input = await readStdin({ stdin });
    const parsed = parseHookInput(input);

    // Skip if no file path
    if (!parsed.filePath) {
      return;
    }

    // Skip if editing brainfile itself
    if (parsed.filePath.includes('brainfile.md')) {
      return;
    }

    // Check if brainfile exists
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      return;
    }

    // Output reminder
    logger.log('💡 Consider updating @brainfile.md');

  } catch (error) {
    // Fail silently
    return;
  }
}

/**
 * Handle before-prompt hook event
 */
export async function beforePromptCommand(logger: Logger = defaultLogger, stdin?: NodeJS.ReadStream) {
  try {
    const input = await readStdin({ stdin });
    const outputJSON = shouldOutputJSON(input);

    // Find brainfile
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      if (outputJSON) {
        logger.log(JSON.stringify({ continue: true }));
      }
      return;
    }

    // Check if brainfile is stale (>5 minutes old)
    const ageMinutes = getFileAgeMinutes(brainfilePath);
    if (ageMinutes < 5) {
      if (outputJSON) {
        logger.log(JSON.stringify({ continue: true }));
      }
      return;
    }

    // Check for uncommitted changes (excluding brainfile)
    const hasChanges = await hasUncommittedChanges(['brainfile.md', '.brainfile.md', '.brainfile/brainfile.md']);

    if (hasChanges) {
      logger.log('\n⚠️  Files modified but @brainfile.md hasn\'t been updated.');
      logger.log('Update task status before continuing.\n');
    }

    if (outputJSON) {
      logger.log(JSON.stringify({ continue: true }));
    }

  } catch (error) {
    // Fail silently with proper JSON response for Cursor
    try {
      // Create a fresh promise for reading input if the previous one failed? 
      // Actually readStdin handles empty input gracefull. 
      // But if we are here, something threw.
      // We can't easily re-read stdin if it was consumed. 
      // For now, just assume we should output JSON if we can infer or default to it?
      // Or just fail silently.
      // Original code re-read stdin?
      // const input = await readStdin(); // This would fail or hang if stdin used?
      // Assuming we just want to output continue: true if we crashed.
      logger.log(JSON.stringify({ continue: true }));
    } catch {
      // Ignore
    }
  }
}

/**
 * Handle session-start hook event
 */
export async function sessionStartCommand(logger: Logger = defaultLogger, stdin?: NodeJS.ReadStream) {
  try {
    await readStdin({ stdin }); // Read input even though we don't use it

    // Find brainfile
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      return;
    }

    // Output welcome message
    const fileName = brainfilePath.split('/').pop();
    logger.log(`✅ Brainfile detected: @${fileName}`);
    logger.log('Remember to update task status as you work.');

  } catch (error) {
    // Fail silently
  }
}

/**
 * Install hooks for a specific tool
 */
export function installCommand(options: { tool: string; scope: SettingsScope }, logger: Logger = defaultLogger) {
  const tool = options.tool as SupportedTool;

  // Validate tool
  if (tool !== 'claude-code' && tool !== 'cursor' && tool !== 'cline') {
    logger.error(chalk.red(`Error: Unknown tool '${options.tool}'`));
    logger.log(chalk.gray('Supported tools: claude-code, cursor, cline'));
    throw new CLIError(`Unknown tool '${options.tool}'`, ExitCode.USER_ERROR);
  }

  try {
    // Install hooks
    installBrainfileHooks(tool, options.scope);
  } catch (error) {
    throw new CLIError(
      `Failed to install hooks: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.USER_ERROR
    );
  }

  const settingsPath = getSettingsPath(tool, options.scope);
  const toolName = tool === 'claude-code' ? 'Claude Code' : tool === 'cursor' ? 'Cursor' : 'Cline';

  logger.log(chalk.green(`✅ Brainfile hooks installed for ${toolName}!`));
  logger.log(chalk.gray(`   Settings: ${settingsPath}`));
  logger.log(chalk.gray(`   Scope: ${options.scope}`));
  logger.log('');
  logger.log(chalk.white('Hooks configured:'));

  if (tool === 'claude-code') {
    logger.log(chalk.gray('  • PostToolUse → brainfile hooks after-edit'));
    logger.log(chalk.gray('  • UserPromptSubmit → brainfile hooks before-prompt'));
    logger.log(chalk.gray('  • SessionStart → brainfile hooks session-start'));
  } else if (tool === 'cursor') {
    logger.log(chalk.gray('  • afterFileEdit → brainfile hooks after-edit'));
    logger.log(chalk.gray('  • beforeSubmitPrompt → brainfile hooks before-prompt'));
    logger.log(chalk.gray('  • stop → brainfile hooks session-start'));
  } else if (tool === 'cline') {
    logger.log(chalk.gray('  • PostToolUse → brainfile hooks after-edit'));
    logger.log(chalk.gray('  • UserPromptSubmit → brainfile hooks before-prompt'));
    logger.log(chalk.gray('  • TaskStart → brainfile hooks session-start'));
  }

  logger.log('');
  logger.log(chalk.gray('Next steps:'));
  logger.log(chalk.gray(`  1. Restart ${toolName} to activate hooks`));
  logger.log(chalk.gray('  2. Edit files and watch for brainfile reminders'));
  logger.log(chalk.gray('  3. Run \'brainfile hooks list\' to verify installation'));
}

/**
 * Uninstall hooks for a specific tool
 */
export function uninstallCommand(options: { tool: string; scope: SettingsScope | 'all' }, logger: Logger = defaultLogger) {
  const tool = options.tool as SupportedTool;

  // Validate tool
  if (tool !== 'claude-code' && tool !== 'cursor' && tool !== 'cline') {
    logger.error(chalk.red(`Error: Unknown tool '${options.tool}'`));
    logger.log(chalk.gray('Supported tools: claude-code, cursor, cline'));
    throw new CLIError(`Unknown tool '${options.tool}'`, ExitCode.USER_ERROR);
  }

  const scopes: SettingsScope[] = options.scope === 'all'
    ? ['user', 'project']
    : [options.scope as SettingsScope];

  let removed = false;

  for (const scope of scopes) {
    if (areBrainfileHooksInstalled(tool, scope)) {
      try {
        uninstallBrainfileHooks(tool, scope);
        removed = true;

        const settingsPath = getSettingsPath(tool, scope);
        logger.log(chalk.green(`✓ Removed brainfile hooks from ${scope} settings`));
        logger.log(chalk.gray(`  ${settingsPath}`));
      } catch (error) {
        logger.warn(`Failed to remove hooks from ${scope}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!removed) {
    logger.log(chalk.yellow('No brainfile hooks found to remove'));
  }
}

/**
 * List installed hooks
 */
export function listCommand(options: { tool?: string }, logger: Logger = defaultLogger) {
  const tools: SupportedTool[] = options.tool
    ? [options.tool as SupportedTool]
    : ['claude-code', 'cursor', 'cline'];

  logger.log(chalk.bold.white('\nBrainfile Hooks Status\n'));

  for (const tool of tools) {
    const toolName = tool === 'claude-code' ? 'Claude Code' : tool === 'cursor' ? 'Cursor' : 'Cline';
    logger.log(chalk.cyan(toolName + ':'));

    // Check user scope
    try {
      const userInstalled = areBrainfileHooksInstalled(tool, 'user');
      const userPath = getSettingsPath(tool, 'user');

      logger.log(chalk.white(`  User scope (${userPath}):`));
      if (userInstalled) {
        if (tool === 'cline') {
          logger.log(chalk.green('    ✓ PostToolUse → brainfile hooks after-edit'));
          logger.log(chalk.green('    ✓ UserPromptSubmit → brainfile hooks before-prompt'));
          logger.log(chalk.green('    ✓ TaskStart → brainfile hooks session-start'));
        } else {
          logger.log(chalk.green('    ✓ PostToolUse/afterFileEdit → brainfile hooks after-edit'));
          logger.log(chalk.green('    ✓ UserPromptSubmit/beforeSubmitPrompt → brainfile hooks before-prompt'));
          logger.log(chalk.green('    ✓ SessionStart/stop → brainfile hooks session-start'));
        }
      } else {
        logger.log(chalk.gray('    ✗ Not installed'));
      }
    } catch (error) {
      logger.log(chalk.gray(`    Error checking user scope: ${error}`));
    }

    // Check project scope
    try {
      const projectInstalled = areBrainfileHooksInstalled(tool, 'project');
      const projectPath = getSettingsPath(tool, 'project');

      logger.log(chalk.white(`  Project scope (${projectPath}):`));
      if (projectInstalled) {
        if (tool === 'cline') {
          logger.log(chalk.green('    ✓ PostToolUse → brainfile hooks after-edit'));
          logger.log(chalk.green('    ✓ UserPromptSubmit → brainfile hooks before-prompt'));
          logger.log(chalk.green('    ✓ TaskStart → brainfile hooks session-start'));
        } else {
          logger.log(chalk.green('    ✓ PostToolUse/afterFileEdit → brainfile hooks after-edit'));
          logger.log(chalk.green('    ✓ UserPromptSubmit/beforeSubmitPrompt → brainfile hooks before-prompt'));
          logger.log(chalk.green('    ✓ SessionStart/stop → brainfile hooks session-start'));
        }
      } else {
        logger.log(chalk.gray('    ✗ Not installed'));
      }
    } catch (error) {
      logger.log(chalk.gray(`    Error checking project scope: ${error}`));
    }

    logger.log('');
  }
}
