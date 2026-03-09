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

function resolveHomeDir(): string {
  const envHome = process.env.XDG_CONFIG_HOME?.trim();
  if (envHome) {
    return envHome;
  }

  const home = process.env.HOME?.trim();
  return home || os.homedir();
}

// ============================================================================
// Config Functions
// ============================================================================

/**
 * Get the path to the config directory
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, 'brainfile');
  }

  return path.join(resolveHomeDir(), '.config', 'brainfile');
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure the config directory exists
 */
export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load the config file
 * @returns Config object, or empty object if file doesn't exist
 */
export function loadConfig(): BrainfileConfig {
  const configFile = getConfigPath();
  try {
    if (fs.existsSync(configFile)) {
      const content = fs.readFileSync(configFile, 'utf-8');
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
  const configFile = getConfigPath();
  ensureConfigDir();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), {
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
// Destination Parsing
// ============================================================================

export interface ParsedDestination {
  type: 'local' | 'github' | 'linear';
  /** GitHub owner (from github:owner/repo) */
  owner?: string;
  /** GitHub repo (from github:owner/repo) */
  repo?: string;
  /** Linear team key (from linear:TEAM) */
  teamKey?: string;
}

/**
 * Parse an archive destination string
 *
 * Formats:
 * - `local` → local archive
 * - `github` → GitHub with config defaults
 * - `github:owner/repo` → GitHub with explicit owner/repo
 * - `linear` → Linear with config defaults
 * - `linear:TEAM` → Linear with explicit team key
 *
 * @param destination - Destination string from brainfile.md or CLI
 * @returns Parsed destination with type and optional target info
 */
export function parseArchiveDestination(destination: string): ParsedDestination | null {
  if (!destination) return null;

  // Simple destinations
  if (destination === 'local') {
    return { type: 'local' };
  }

  if (destination === 'github') {
    return { type: 'github' };
  }

  if (destination === 'linear') {
    return { type: 'linear' };
  }

  // Extended format: github:owner/repo
  if (destination.startsWith('github:')) {
    const target = destination.slice(7); // Remove 'github:'
    const parts = target.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { type: 'github', owner: parts[0], repo: parts[1] };
    }
    // Invalid format, treat as plain github
    return { type: 'github' };
  }

  // Extended format: linear:TEAM
  if (destination.startsWith('linear:')) {
    const teamKey = destination.slice(7); // Remove 'linear:'
    if (teamKey) {
      return { type: 'linear', teamKey };
    }
    // Invalid format, treat as plain linear
    return { type: 'linear' };
  }

  return null;
}

/**
 * Get effective archive destination with full config resolution
 *
 * @param brainfileDestination - Destination from brainfile.md (may include target)
 * @returns Fully resolved destination with type and target info
 */
export function getEffectiveDestination(brainfileDestination?: string): ParsedDestination {
  // Priority 1: brainfile.md setting (may have inline target)
  if (brainfileDestination) {
    const parsed = parseArchiveDestination(brainfileDestination);
    if (parsed) {
      // Fill in missing config from global config
      const config = getArchiveConfig();

      if (parsed.type === 'github' && !parsed.owner) {
        parsed.owner = config.github?.owner;
        parsed.repo = config.github?.repo;
      }

      if (parsed.type === 'linear' && !parsed.teamKey) {
        // We'll resolve teamKey to teamId later in the archive command
      }

      return parsed;
    }
  }

  // Priority 2: config default
  const config = getArchiveConfig();
  if (config.default && isValidDestination(config.default)) {
    return { type: config.default };
  }

  // Priority 3: fallback to local
  return { type: 'local' };
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
