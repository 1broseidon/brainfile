/**
 * Authentication commands for Brainfile CLI
 *
 * Commands:
 * - brainfile auth github [--token <token>]
 * - brainfile auth linear --token <token>
 * - brainfile auth status
 * - brainfile auth logout <provider>
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import * as readline from 'readline';
import { authStore } from '../utils/auth-store';
import { authenticateGitHub, logoutGitHub } from '../utils/github-auth';
import { authenticateLinear, logoutLinear, getLinearTeams } from '../utils/linear-auth';
import { setLinearConfig, setArchiveDefault, getArchiveConfig } from '../utils/config';
import { handleError } from '../utils/errorHandler';

// ============================================================================
// Helper Functions
// ============================================================================

async function promptSetDefaultDestination(destination: 'github' | 'linear'): Promise<void> {
  const currentConfig = getArchiveConfig();

  // Skip if already set to this destination
  if (currentConfig.default === destination) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const currentDefault = currentConfig.default || 'local';
  console.log('');
  console.log(`Current default archive destination: ${chalk.cyan(currentDefault)}`);

  const answer = await new Promise<string>((resolve) => {
    rl.question(`Set ${destination} as default? [y/N]: `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    setArchiveDefault(destination);
    console.log(chalk.green('✓') + ` Default archive destination set to ${chalk.cyan(destination)}`);
  }
}

// ============================================================================
// GitHub Auth Command
// ============================================================================

interface GitHubAuthOptions {
  token?: string;
}

export async function githubAuthCommand(options: GitHubAuthOptions) {
  try {
    const result = await authenticateGitHub({
      token: options.token,
      usePAT: !!options.token,
    });

    if (!result.success) {
      console.log(chalk.red('✗') + ` Authentication failed: ${result.error}`);
      process.exit(1);
    }

    console.log('');
    console.log(chalk.green('GitHub authentication complete!'));
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Linear Auth Command
// ============================================================================

interface LinearAuthOptions {
  token?: string;
}

export async function linearAuthCommand(options: LinearAuthOptions) {
  try {
    if (!options.token) {
      console.log('');
      console.log('Linear authentication requires an API key.');
      console.log('');
      console.log(`Get your API key from: ${chalk.underline('https://linear.app/settings/api')}`);
      console.log('');
      console.log('Then run:');
      console.log(chalk.cyan('  brainfile auth linear --token <your-api-key>'));
      console.log('');
      return;
    }

    const result = await authenticateLinear({
      token: options.token,
    });

    if (!result.success) {
      console.log(chalk.red('✗') + ` Authentication failed: ${result.error}`);
      process.exit(1);
    }

    // Fetch available teams and configure default
    const teams = await getLinearTeams();

    if (teams.length === 0) {
      console.log(chalk.yellow('⚠') + ' No teams found. You may need to configure a team later.');
    } else if (teams.length === 1) {
      // Auto-select the only team
      const team = teams[0];
      setLinearConfig({ teamId: team.id });
      console.log(chalk.green('✓') + ` Default team set to ${chalk.cyan(team.name)} (${team.key})`);

      // Ask if they want to set Linear as default destination
      await promptSetDefaultDestination('linear');
    } else {
      // Multiple teams - prompt user to choose
      console.log('');
      console.log('Multiple teams found. Select a default team for archiving:');
      console.log('');
      teams.forEach((team, index) => {
        console.log(`  ${chalk.cyan(index + 1)}) ${team.name} (${team.key})`);
      });
      console.log('');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`Enter number [1-${teams.length}]: `, resolve);
      });
      rl.close();

      const selection = parseInt(answer, 10);
      if (selection >= 1 && selection <= teams.length) {
        const team = teams[selection - 1];
        setLinearConfig({ teamId: team.id });
        console.log('');
        console.log(chalk.green('✓') + ` Default team set to ${chalk.cyan(team.name)} (${team.key})`);

        // Ask if they want to set Linear as default destination
        await promptSetDefaultDestination('linear');
      } else {
        console.log(chalk.yellow('⚠') + ' Invalid selection. You can set a team later with:');
        console.log(chalk.cyan('  brainfile config set archive.linear.teamId <team-id>'));
      }
    }

    console.log('');
    console.log(chalk.green('Linear authentication complete!'));
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Status Command
// ============================================================================

export async function authStatusCommand() {
  try {
    const status = await authStore.getStatus();

    console.log('');
    console.log(chalk.bold('Authentication Status'));
    console.log('');

    // GitHub
    if (status.github.authenticated) {
      const source = status.github.source;
      const username = status.github.username ? ` as ${chalk.cyan('@' + status.github.username)}` : '';
      console.log(
        chalk.green('✓') +
          ` GitHub: authenticated${username} ${chalk.gray(`(${source})`)}`
      );
    } else {
      console.log(chalk.red('✗') + ' GitHub: not configured');
    }

    // Linear
    if (status.linear.authenticated) {
      const source = status.linear.source;
      const username = status.linear.username ? ` as ${chalk.cyan(status.linear.username)}` : '';
      console.log(
        chalk.green('✓') +
          ` Linear: authenticated${username} ${chalk.gray(`(${source})`)}`
      );
    } else {
      console.log(chalk.red('✗') + ' Linear: not configured');
    }

    console.log('');
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Logout Command
// ============================================================================

interface LogoutOptions {
  all?: boolean;
}

export async function authLogoutCommand(provider?: string, options?: LogoutOptions) {
  try {
    if (options?.all || provider === 'all') {
      await logoutGitHub();
      await logoutLinear();
      console.log(chalk.green('✓') + ' Logged out from all providers');
      return;
    }

    if (!provider) {
      console.log('');
      console.log('Usage:');
      console.log('  brainfile auth logout github');
      console.log('  brainfile auth logout linear');
      console.log('  brainfile auth logout --all');
      console.log('');
      return;
    }

    switch (provider.toLowerCase()) {
      case 'github':
        await logoutGitHub();
        console.log(chalk.green('✓') + ' Logged out from GitHub');
        break;
      case 'linear':
        await logoutLinear();
        console.log(chalk.green('✓') + ' Logged out from Linear');
        break;
      default:
        console.log(chalk.red('✗') + ` Unknown provider: ${provider}`);
        console.log('Valid providers: github, linear');
        process.exit(1);
    }
  } catch (error) {
    handleError(error);
  }
}
