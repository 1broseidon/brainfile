/**
 * Configuration file management for Brainfile CLI
 *
 * Handles reading/writing ~/.config/brainfile/config.json for:
 * - Archive destination defaults
 * - GitHub connection details (owner, repo)
 * - Linear connection details (teamId)
 * - User preferences
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface GitHubConfig {
  /** GitHub repository owner (username or org) */
  owner?: string;
  /** GitHub repository name */
  repo?: string;
  /** Extra labels to add to archived issues */
  labels?: string[];
}

export interface LinearConfig {
  /** Linear team ID */
  teamId?: string;
  /** Linear project ID (optional) */
  projectId?: string;
}

export interface ArchiveConfig {
  /** Default archive destination: 'local' | 'github' | 'linear' */
  default?: 'local' | 'github' | 'linear';
  /** GitHub-specific settings */
  github?: GitHubConfig;
  /** Linear-specific settings */
  linear?: LinearConfig;
}

export interface BrainfileConfig {
  /** Archive configuration */
  archive?: ArchiveConfig;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.config', 'brainfile');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ============================================================================
// Config Functions
// ============================================================================

/**
 * Get the path to the config directory
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Ensure the config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load the config file
 * @returns Config object, or empty object if file doesn't exist
 */
export function loadConfig(): BrainfileConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as BrainfileConfig;
    }
  } catch (error) {
    // If file is corrupted, return empty config
    console.error(`Warning: Could not read config file: ${error}`);
  }
  return {};
}

/**
 * Save the config file
 * @param config - Config object to save
 */
export function saveConfig(config: BrainfileConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Update specific config values (merges with existing)
 * @param updates - Partial config to merge
 */
export function updateConfig(updates: Partial<BrainfileConfig>): BrainfileConfig {
  const current = loadConfig();
  const updated = deepMerge(current, updates);
  saveConfig(updated);
  return updated;
}

/**
 * Get archive configuration with defaults
 */
export function getArchiveConfig(): ArchiveConfig {
  const config = loadConfig();
  return config.archive || { default: 'local' };
}

/**
 * Set archive default destination
 */
export function setArchiveDefault(destination: 'local' | 'github' | 'linear'): void {
  const config = loadConfig();
  config.archive = config.archive || {};
  config.archive.default = destination;
  saveConfig(config);
}

/**
 * Set GitHub configuration
 */
export function setGitHubConfig(github: GitHubConfig): void {
  const config = loadConfig();
  config.archive = config.archive || {};
  config.archive.github = { ...config.archive.github, ...github };
  saveConfig(config);
}

/**
 * Set Linear configuration
 */
export function setLinearConfig(linear: LinearConfig): void {
  const config = loadConfig();
  config.archive = config.archive || {};
  config.archive.linear = { ...config.archive.linear, ...linear };
  saveConfig(config);
}

/**
 * Get the effective archive destination
 * Priority: brainfile.md archive.destination > config default > 'local'
 *
 * @param brainfileDestination - Destination from brainfile.md (if any)
 * @returns The effective destination
 */
export function getEffectiveArchiveDestination(
  brainfileDestination?: string
): 'local' | 'github' | 'linear' {
  // Priority 1: brainfile.md setting
  if (brainfileDestination && isValidDestination(brainfileDestination)) {
    return brainfileDestination as 'local' | 'github' | 'linear';
  }

  // Priority 2: config default
  const config = getArchiveConfig();
  if (config.default && isValidDestination(config.default)) {
    return config.default;
  }

  // Priority 3: fallback to local
  return 'local';
}

// ============================================================================
// Helper Functions
// ============================================================================

function isValidDestination(dest: string): dest is 'local' | 'github' | 'linear' {
  return ['local', 'github', 'linear'].includes(dest);
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}
