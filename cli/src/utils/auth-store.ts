/**
 * Authentication token storage for Brainfile CLI
 *
 * Stores tokens with the following priority:
 * 1. System keychain (via keytar, if available)
 * 2. Config file (~/.config/brainfile/auth.json)
 * 3. Environment variables (read-only)
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getConfigDir, ensureConfigDir } from './config';

// ============================================================================
// Types
// ============================================================================

export type AuthProvider = 'github' | 'linear';

export interface StoredToken {
  token: string;
  savedAt: string;
  username?: string;
  workspace?: string; // For Linear
}

interface AuthFile {
  github?: StoredToken;
  linear?: StoredToken;
}

// ============================================================================
// Constants
// ============================================================================

const SERVICE_NAME = 'brainfile';
const AUTH_FILE = path.join(getConfigDir(), 'auth.json');

const ENV_VAR_MAP: Record<AuthProvider, string[]> = {
  github: ['GITHUB_TOKEN', 'GH_TOKEN'],
  linear: ['LINEAR_API_KEY', 'LINEAR_TOKEN'],
};

// ============================================================================
// Keytar Integration (Optional)
// ============================================================================

let keytar: any = null;
let keytarChecked = false;

/**
 * Try to load keytar (system keychain integration)
 * Returns null if keytar is not available
 */
function getKeytar(): any {
  if (keytarChecked) {
    return keytar;
  }

  keytarChecked = true;

  try {
    // Dynamic require to make keytar optional
    keytar = require('keytar');
    return keytar;
  } catch {
    // keytar not installed or native module not built
    return null;
  }
}

// ============================================================================
// GitHub CLI Integration
// ============================================================================

/**
 * Try to get GitHub token from gh CLI
 * @returns Token from gh CLI, or null if not available
 */
export function getGitHubCLIToken(): string | null {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (token && token.length > 0) {
      return token;
    }
  } catch {
    // gh CLI not installed or not authenticated
  }

  return null;
}

/**
 * Check if gh CLI is installed and authenticated
 */
export function isGitHubCLIAvailable(): boolean {
  return getGitHubCLIToken() !== null;
}

// ============================================================================
// Auth Store Class
// ============================================================================

export class AuthStore {
  /**
   * Get a token for a provider
   * Checks: env vars → keychain → config file → gh CLI (for github)
   */
  async get(provider: AuthProvider): Promise<string | null> {
    // 1. Check environment variables
    const envToken = this.getFromEnv(provider);
    if (envToken) {
      return envToken;
    }

    // 2. Check system keychain
    const kt = getKeytar();
    if (kt) {
      try {
        const keychainToken = await kt.getPassword(SERVICE_NAME, provider);
        if (keychainToken) {
          return keychainToken;
        }
      } catch {
        // Keychain access failed, continue to next option
      }
    }

    // 3. Check config file
    const fileToken = this.getFromFile(provider);
    if (fileToken) {
      return fileToken;
    }

    // 4. For GitHub, check gh CLI as last resort
    if (provider === 'github') {
      return getGitHubCLIToken();
    }

    return null;
  }

  /**
   * Get stored token info (includes metadata like username)
   */
  async getTokenInfo(provider: AuthProvider): Promise<StoredToken | null> {
    // Check config file for metadata
    const authData = this.loadAuthFile();
    return authData[provider] || null;
  }

  /**
   * Store a token for a provider
   * Stores in: keychain (if available) AND config file (for metadata)
   */
  async set(
    provider: AuthProvider,
    token: string,
    metadata?: { username?: string; workspace?: string }
  ): Promise<void> {
    const storedToken: StoredToken = {
      token,
      savedAt: new Date().toISOString(),
      ...metadata,
    };

    // 1. Try to store in keychain
    const kt = getKeytar();
    if (kt) {
      try {
        await kt.setPassword(SERVICE_NAME, provider, token);
      } catch {
        // Keychain storage failed, will fall back to file
      }
    }

    // 2. Store in config file (always, for metadata)
    this.saveToFile(provider, storedToken);
  }

  /**
   * Clear a token for a provider
   */
  async clear(provider: AuthProvider): Promise<void> {
    // 1. Remove from keychain
    const kt = getKeytar();
    if (kt) {
      try {
        await kt.deletePassword(SERVICE_NAME, provider);
      } catch {
        // Ignore errors
      }
    }

    // 2. Remove from config file
    this.removeFromFile(provider);
  }

  /**
   * Check if a provider is authenticated
   */
  async isAuthenticated(provider: AuthProvider): Promise<boolean> {
    const token = await this.get(provider);
    return token !== null;
  }

  /**
   * Get authentication status for all providers
   */
  async getStatus(): Promise<Record<AuthProvider, { authenticated: boolean; source?: string; username?: string }>> {
    const result: Record<AuthProvider, { authenticated: boolean; source?: string; username?: string }> = {
      github: { authenticated: false },
      linear: { authenticated: false },
    };

    for (const provider of ['github', 'linear'] as AuthProvider[]) {
      // Check env first
      if (this.getFromEnv(provider)) {
        result[provider] = { authenticated: true, source: 'environment' };
        continue;
      }

      // Check keychain
      const kt = getKeytar();
      if (kt) {
        try {
          const token = await kt.getPassword(SERVICE_NAME, provider);
          if (token) {
            const info = await this.getTokenInfo(provider);
            result[provider] = {
              authenticated: true,
              source: 'keychain',
              username: info?.username,
            };
            continue;
          }
        } catch {
          // Continue to next check
        }
      }

      // Check config file
      const fileToken = this.getFromFile(provider);
      if (fileToken) {
        const info = await this.getTokenInfo(provider);
        result[provider] = {
          authenticated: true,
          source: 'config',
          username: info?.username,
        };
        continue;
      }

      // For GitHub, check gh CLI
      if (provider === 'github' && getGitHubCLIToken()) {
        result[provider] = { authenticated: true, source: 'gh-cli' };
      }
    }

    return result;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getFromEnv(provider: AuthProvider): string | null {
    const vars = ENV_VAR_MAP[provider];
    for (const varName of vars) {
      const value = process.env[varName];
      if (value && value.length > 0) {
        return value;
      }
    }
    return null;
  }

  private loadAuthFile(): AuthFile {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        const content = fs.readFileSync(AUTH_FILE, 'utf-8');
        return JSON.parse(content) as AuthFile;
      }
    } catch {
      // File corrupted or unreadable
    }
    return {};
  }

  private saveAuthFile(data: AuthFile): void {
    ensureConfigDir();
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });
  }

  private getFromFile(provider: AuthProvider): string | null {
    const data = this.loadAuthFile();
    return data[provider]?.token || null;
  }

  private saveToFile(provider: AuthProvider, tokenInfo: StoredToken): void {
    const data = this.loadAuthFile();
    data[provider] = tokenInfo;
    this.saveAuthFile(data);
  }

  private removeFromFile(provider: AuthProvider): void {
    const data = this.loadAuthFile();
    delete data[provider];
    this.saveAuthFile(data);
  }
}

// Export singleton instance
export const authStore = new AuthStore();
