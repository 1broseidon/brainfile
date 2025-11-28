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
import { authStore } from '../utils/auth-store';
import { authenticateGitHub, logoutGitHub } from '../utils/github-auth';
import { authenticateLinear, logoutLinear } from '../utils/linear-auth';
import { handleError } from '../utils/errorHandler';

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
