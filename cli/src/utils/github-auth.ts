/**
 * GitHub Authentication for Brainfile CLI
 *
 * Supports:
 * 1. Piggyback on gh CLI auth (if available)
 * 2. OAuth Device Flow (browser-based, no server needed)
 * 3. Personal Access Token (manual entry)
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import { authStore, getGitHubCLIToken, isGitHubCLIAvailable } from './auth-store';

// ============================================================================
// Types
// ============================================================================

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  login: string;
  name?: string;
}

// ============================================================================
// Constants
// ============================================================================

// GitHub OAuth App Client ID for Brainfile
// This is a public client ID for the device flow - safe to commit
// TODO: Register a Brainfile OAuth App and replace this
const GITHUB_CLIENT_ID = process.env.BRAINFILE_GITHUB_CLIENT_ID || 'Ov23liYourClientId';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

// ============================================================================
// GitHub Auth Functions
// ============================================================================

/**
 * Check if GitHub is already authenticated
 */
export async function isGitHubAuthenticated(): Promise<boolean> {
  return await authStore.isAuthenticated('github');
}

/**
 * Get the current GitHub token (from any source)
 */
export async function getGitHubToken(): Promise<string | null> {
  return await authStore.get('github');
}

/**
 * Authenticate with GitHub using the best available method
 *
 * Priority:
 * 1. Use existing gh CLI auth
 * 2. OAuth Device Flow
 * 3. Manual PAT entry
 */
export async function authenticateGitHub(options: {
  usePAT?: boolean;
  token?: string;
  silent?: boolean;
}): Promise<{ success: boolean; username?: string; error?: string }> {
  const { usePAT, token, silent } = options;

  // If token provided directly, verify and store it
  if (token) {
    return await verifyAndStoreToken(token, silent);
  }

  // If PAT mode requested, prompt for token
  if (usePAT) {
    return { success: false, error: 'PAT mode requires --token flag with token value' };
  }

  // Check if gh CLI is available
  if (isGitHubCLIAvailable()) {
    const ghToken = getGitHubCLIToken();
    if (ghToken) {
      if (!silent) {
        console.log(chalk.green('✓') + ' Found existing GitHub CLI authentication');
      }

      // Verify the token and get username
      const user = await getGitHubUser(ghToken);
      if (user) {
        // Store it in our auth store too for consistency
        await authStore.set('github', ghToken, { username: user.login });

        if (!silent) {
          console.log(chalk.green('✓') + ` Authenticated as ${chalk.cyan('@' + user.login)}`);
        }

        return { success: true, username: user.login };
      }
    }
  }

  // Fall back to OAuth Device Flow
  return await deviceFlowAuth(silent);
}

/**
 * Verify a token and store it
 */
async function verifyAndStoreToken(
  token: string,
  silent?: boolean
): Promise<{ success: boolean; username?: string; error?: string }> {
  const user = await getGitHubUser(token);

  if (!user) {
    return { success: false, error: 'Invalid token or token lacks required permissions' };
  }

  await authStore.set('github', token, { username: user.login });

  if (!silent) {
    console.log(chalk.green('✓') + ' Token verified');
    console.log(chalk.green('✓') + ` Authenticated as ${chalk.cyan('@' + user.login)}`);
  }

  return { success: true, username: user.login };
}

/**
 * OAuth Device Flow authentication
 */
async function deviceFlowAuth(
  silent?: boolean
): Promise<{ success: boolean; username?: string; error?: string }> {
  if (!silent) {
    console.log('');
    console.log('Starting GitHub OAuth authentication...');
    console.log('');
  }

  try {
    // Step 1: Request device code
    const deviceCode = await requestDeviceCode();

    if (!silent) {
      console.log(chalk.yellow('!') + ` First, copy your one-time code: ${chalk.bold.cyan(deviceCode.user_code)}`);
      console.log('');
      console.log(`Then visit: ${chalk.underline(deviceCode.verification_uri)}`);
      console.log('');
    }

    // Try to open browser
    try {
      const open = await import('open');
      await open.default(deviceCode.verification_uri);
      if (!silent) {
        console.log(chalk.gray('(Opening browser...)'));
      }
    } catch {
      // Browser open failed, user will need to manually navigate
    }

    if (!silent) {
      console.log('');
      console.log('Waiting for authentication...');
    }

    // Step 2: Poll for token
    const token = await pollForToken(deviceCode);

    if (!token) {
      return { success: false, error: 'Authentication timed out or was denied' };
    }

    // Step 3: Verify and store
    return await verifyAndStoreToken(token, silent);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during authentication',
    };
  }
}

/**
 * Request a device code from GitHub
 */
async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.status}`);
  }

  return (await response.json()) as DeviceCodeResponse;
}

/**
 * Poll for the access token after user authorizes
 */
async function pollForToken(deviceCode: DeviceCodeResponse): Promise<string | null> {
  const startTime = Date.now();
  const expiresAt = startTime + deviceCode.expires_in * 1000;
  const interval = Math.max(deviceCode.interval, 5) * 1000; // At least 5 seconds

  while (Date.now() < expiresAt) {
    await sleep(interval);

    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = (await response.json()) as TokenResponse;

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      // User hasn't authorized yet, keep polling
      continue;
    }

    if (data.error === 'slow_down') {
      // Back off
      await sleep(5000);
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
  }

  return null;
}

/**
 * Get the authenticated GitHub user
 */
async function getGitHubUser(token: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'brainfile-cli',
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GitHubUser;
  } catch {
    return null;
  }
}

/**
 * Create a GitHub Issue
 */
export async function createGitHubIssue(options: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  state?: 'open' | 'closed';
}): Promise<{ success: boolean; issueNumber?: number; issueUrl?: string; error?: string }> {
  const token = await getGitHubToken();

  if (!token) {
    return { success: false, error: 'Not authenticated with GitHub. Run: brainfile auth github' };
  }

  try {
    // Create the issue
    const createResponse = await fetch(
      `${GITHUB_API_URL}/repos/${options.owner}/${options.repo}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'brainfile-cli',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: options.title,
          body: options.body,
          labels: options.labels,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorData = await createResponse.json() as { message?: string };
      return {
        success: false,
        error: `Failed to create issue: ${errorData.message || createResponse.status}`,
      };
    }

    const issue = (await createResponse.json()) as { number: number; html_url: string };

    // Close the issue if requested
    if (options.state === 'closed') {
      await fetch(
        `${GITHUB_API_URL}/repos/${options.owner}/${options.repo}/issues/${issue.number}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'brainfile-cli',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state: 'closed' }),
        }
      );
    }

    return {
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error creating issue',
    };
  }
}

/**
 * Logout from GitHub
 */
export async function logoutGitHub(): Promise<void> {
  await authStore.clear('github');
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
