/**
 * Linear Authentication for Brainfile CLI
 *
 * Supports:
 * 1. OAuth Device Flow (browser-based)
 * 2. API Key (manual entry)
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import { authStore } from './auth-store';

// ============================================================================
// Types
// ============================================================================

interface LinearViewer {
  id: string;
  name: string;
  email: string;
}

interface LinearOrganization {
  id: string;
  name: string;
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const LINEAR_API_URL = 'https://api.linear.app/graphql';

// ============================================================================
// Linear Auth Functions
// ============================================================================

/**
 * Check if Linear is already authenticated
 */
export async function isLinearAuthenticated(): Promise<boolean> {
  return await authStore.isAuthenticated('linear');
}

/**
 * Get the current Linear token
 */
export async function getLinearToken(): Promise<string | null> {
  return await authStore.get('linear');
}

/**
 * Authenticate with Linear using API key
 */
export async function authenticateLinear(options: {
  token?: string;
  silent?: boolean;
}): Promise<{ success: boolean; workspace?: string; error?: string }> {
  const { token, silent } = options;

  if (!token) {
    if (!silent) {
      console.log('');
      console.log('To authenticate with Linear, you need an API key.');
      console.log('');
      console.log(`Get your API key from: ${chalk.underline('https://linear.app/settings/api')}`);
      console.log('');
    }
    return { success: false, error: 'Linear API key required. Use --token flag.' };
  }

  // Verify the token
  const viewer = await getLinearViewer(token);

  if (!viewer) {
    return { success: false, error: 'Invalid API key or API key lacks required permissions' };
  }

  // Get organization info
  const org = await getLinearOrganization(token);
  const workspace = org?.name || 'Unknown';

  await authStore.set('linear', token, {
    username: viewer.name,
    workspace,
  });

  if (!silent) {
    console.log(chalk.green('✓') + ' API key verified');
    console.log(chalk.green('✓') + ` Authenticated as ${chalk.cyan(viewer.name)} in ${chalk.cyan(workspace)}`);
  }

  return { success: true, workspace };
}

/**
 * Get Linear user info
 */
async function getLinearViewer(token: string): Promise<LinearViewer | null> {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              id
              name
              email
            }
          }
        `,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json() as LinearGraphQLResponse<{ viewer: LinearViewer }>;
    return json.data?.viewer || null;
  } catch {
    return null;
  }
}

/**
 * Get Linear organization info
 */
async function getLinearOrganization(token: string): Promise<LinearOrganization | null> {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            organization {
              id
              name
            }
          }
        `,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json() as LinearGraphQLResponse<{ organization: LinearOrganization }>;
    return json.data?.organization || null;
  } catch {
    return null;
  }
}

/**
 * Get Linear teams
 */
export async function getLinearTeams(): Promise<LinearTeam[]> {
  const token = await getLinearToken();
  if (!token) {
    return [];
  }

  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        `,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const json = await response.json() as LinearGraphQLResponse<{ teams: { nodes: LinearTeam[] } }>;
    return json.data?.teams?.nodes || [];
  } catch {
    return [];
  }
}

/**
 * Create a Linear issue
 */
export async function createLinearIssue(options: {
  teamId: string;
  title: string;
  description?: string;
  priority?: number;
  labelNames?: string[];
  stateName?: string;
}): Promise<{ success: boolean; issueId?: string; issueUrl?: string; error?: string }> {
  const token = await getLinearToken();

  if (!token) {
    return { success: false, error: 'Not authenticated with Linear. Run: brainfile auth linear' };
  }

  try {
    // First, get the "Done" state ID if stateName is specified
    let stateId: string | undefined;
    if (options.stateName) {
      stateId = await getStateId(token, options.teamId, options.stateName);
    }

    // Create the issue
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                url
              }
            }
          }
        `,
        variables: {
          input: {
            teamId: options.teamId,
            title: options.title,
            description: options.description,
            priority: options.priority,
            stateId,
          },
        },
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Linear API error: ${response.status}` };
    }

    interface IssueCreateResult {
      issueCreate: {
        success: boolean;
        issue: {
          id: string;
          identifier: string;
          url: string;
        };
      };
    }

    const json = await response.json() as LinearGraphQLResponse<IssueCreateResult>;

    if (json.errors) {
      return { success: false, error: json.errors[0]?.message || 'Unknown error' };
    }

    const result = json.data?.issueCreate;
    if (!result?.success) {
      return { success: false, error: 'Failed to create issue' };
    }

    return {
      success: true,
      issueId: result.issue.identifier,
      issueUrl: result.issue.url,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error creating issue',
    };
  }
}

/**
 * Get state ID by name
 */
async function getStateId(
  token: string,
  teamId: string,
  stateName: string
): Promise<string | undefined> {
  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query GetStates($teamId: String!) {
            team(id: $teamId) {
              states {
                nodes {
                  id
                  name
                  type
                }
              }
            }
          }
        `,
        variables: { teamId },
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    interface TeamStatesResult {
      team: {
        states: {
          nodes: Array<{ id: string; name: string; type: string }>;
        };
      };
    }

    const json = await response.json() as LinearGraphQLResponse<TeamStatesResult>;
    const states = json.data?.team?.states?.nodes || [];

    // Find state by name (case-insensitive)
    const state = states.find(
      (s) => s.name.toLowerCase() === stateName.toLowerCase()
    );

    return state?.id;
  } catch {
    return undefined;
  }
}

/**
 * Logout from Linear
 */
export async function logoutLinear(): Promise<void> {
  await authStore.clear('linear');
}
