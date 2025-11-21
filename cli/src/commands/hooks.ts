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

/**
 * Read JSON from stdin
 */
async function readStdin(): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    const rl = readline.createInterface({
      input: process.stdin,
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
export async function afterEditCommand() {
  try {
    const input = await readStdin();
    const parsed = parseHookInput(input);

    // Skip if no file path
    if (!parsed.filePath) {
      process.exit(0);
      return;
    }

    // Skip if editing brainfile itself
    if (parsed.filePath.includes('brainfile.md')) {
      process.exit(0);
      return;
    }

    // Check if brainfile exists
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      process.exit(0);
      return;
    }

    // Output reminder
    console.log('💡 Consider updating @brainfile.md');

    process.exit(0);
  } catch (error) {
    // Fail silently
    process.exit(0);
  }
}

/**
 * Handle before-prompt hook event
 */
export async function beforePromptCommand() {
  try {
    const input = await readStdin();
    const outputJSON = shouldOutputJSON(input);

    // Find brainfile
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      if (outputJSON) {
        console.log(JSON.stringify({ continue: true }));
      }
      process.exit(0);
      return;
    }

    // Check if brainfile is stale (>5 minutes old)
    const ageMinutes = getFileAgeMinutes(brainfilePath);
    if (ageMinutes < 5) {
      if (outputJSON) {
        console.log(JSON.stringify({ continue: true }));
      }
      process.exit(0);
      return;
    }

    // Check for uncommitted changes (excluding brainfile)
    const hasChanges = await hasUncommittedChanges(['brainfile.md', '.brainfile.md']);

    if (hasChanges) {
      console.log('\n⚠️  Files modified but @brainfile.md hasn\'t been updated.');
      console.log('Update task status before continuing.\n');
    }

    if (outputJSON) {
      console.log(JSON.stringify({ continue: true }));
    }

    process.exit(0);
  } catch (error) {
    // Fail silently with proper JSON response for Cursor
    const input = await readStdin();
    if (shouldOutputJSON(input)) {
      console.log(JSON.stringify({ continue: true }));
    }
    process.exit(0);
  }
}

/**
 * Handle session-start hook event
 */
export async function sessionStartCommand() {
  try {
    await readStdin(); // Read input even though we don't use it

    // Find brainfile
    const brainfilePath = findBrainfile();
    if (!brainfilePath) {
      process.exit(0);
      return;
    }

    // Output welcome message
    const fileName = brainfilePath.split('/').pop();
    console.log(`✅ Brainfile detected: @${fileName}`);
    console.log('Remember to update task status as you work.');

    process.exit(0);
  } catch (error) {
    // Fail silently
    process.exit(0);
  }
}

/**
 * Install hooks for a specific tool
 */
export function installCommand(options: { tool: string; scope: SettingsScope }) {
  try {
    const tool = options.tool as SupportedTool;

    // Validate tool
    if (tool !== 'claude-code' && tool !== 'cursor') {
      console.error(chalk.red(`Error: Unknown tool '${options.tool}'`));
      console.log(chalk.gray('Supported tools: claude-code, cursor'));
      process.exit(1);
    }

    // Install hooks
    installBrainfileHooks(tool, options.scope);

    const settingsPath = getSettingsPath(tool, options.scope);
    const toolName = tool === 'claude-code' ? 'Claude Code' : 'Cursor';

    console.log(chalk.green(`✅ Brainfile hooks installed for ${toolName}!`));
    console.log(chalk.gray(`   Settings: ${settingsPath}`));
    console.log(chalk.gray(`   Scope: ${options.scope}`));
    console.log('');
    console.log(chalk.white('Hooks configured:'));

    if (tool === 'claude-code') {
      console.log(chalk.gray('  • PostToolUse → brainfile hooks after-edit'));
      console.log(chalk.gray('  • UserPromptSubmit → brainfile hooks before-prompt'));
      console.log(chalk.gray('  • SessionStart → brainfile hooks session-start'));
    } else {
      console.log(chalk.gray('  • afterFileEdit → brainfile hooks after-edit'));
      console.log(chalk.gray('  • beforeSubmitPrompt → brainfile hooks before-prompt'));
      console.log(chalk.gray('  • stop → brainfile hooks session-start'));
    }

    console.log('');
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray(`  1. Restart ${toolName} to activate hooks`));
    console.log(chalk.gray('  2. Edit files and watch for brainfile reminders'));
    console.log(chalk.gray('  3. Run \'brainfile hooks list\' to verify installation'));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Uninstall hooks for a specific tool
 */
export function uninstallCommand(options: { tool: string; scope: SettingsScope | 'all' }) {
  try {
    const tool = options.tool as SupportedTool;

    // Validate tool
    if (tool !== 'claude-code' && tool !== 'cursor') {
      console.error(chalk.red(`Error: Unknown tool '${options.tool}'`));
      console.log(chalk.gray('Supported tools: claude-code, cursor'));
      process.exit(1);
    }

    const scopes: SettingsScope[] = options.scope === 'all'
      ? ['user', 'project']
      : [options.scope as SettingsScope];

    let removed = false;

    for (const scope of scopes) {
      if (areBrainfileHooksInstalled(tool, scope)) {
        uninstallBrainfileHooks(tool, scope);
        removed = true;

        const settingsPath = getSettingsPath(tool, scope);
        console.log(chalk.green(`✓ Removed brainfile hooks from ${scope} settings`));
        console.log(chalk.gray(`  ${settingsPath}`));
      }
    }

    if (!removed) {
      console.log(chalk.yellow('No brainfile hooks found to remove'));
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * List installed hooks
 */
export function listCommand(options: { tool?: string }) {
  try {
    const tools: SupportedTool[] = options.tool
      ? [options.tool as SupportedTool]
      : ['claude-code', 'cursor'];

    console.log(chalk.bold.white('\nBrainfile Hooks Status\n'));

    for (const tool of tools) {
      const toolName = tool === 'claude-code' ? 'Claude Code' : 'Cursor';
      console.log(chalk.cyan(toolName + ':'));

      // Check user scope
      const userInstalled = areBrainfileHooksInstalled(tool, 'user');
      const userPath = getSettingsPath(tool, 'user');

      console.log(chalk.white(`  User scope (${userPath}):`));
      if (userInstalled) {
        console.log(chalk.green('    ✓ PostToolUse/afterFileEdit → brainfile hooks after-edit'));
        console.log(chalk.green('    ✓ UserPromptSubmit/beforeSubmitPrompt → brainfile hooks before-prompt'));
        console.log(chalk.green('    ✓ SessionStart/stop → brainfile hooks session-start'));
      } else {
        console.log(chalk.gray('    ✗ Not installed'));
      }

      // Check project scope
      const projectInstalled = areBrainfileHooksInstalled(tool, 'project');
      const projectPath = getSettingsPath(tool, 'project');

      console.log(chalk.white(`  Project scope (${projectPath}):`));
      if (projectInstalled) {
        console.log(chalk.green('    ✓ PostToolUse/afterFileEdit → brainfile hooks after-edit'));
        console.log(chalk.green('    ✓ UserPromptSubmit/beforeSubmitPrompt → brainfile hooks before-prompt'));
        console.log(chalk.green('    ✓ SessionStart/stop → brainfile hooks session-start'));
      } else {
        console.log(chalk.gray('    ✗ Not installed'));
      }

      console.log('');
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
