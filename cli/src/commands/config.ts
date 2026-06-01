/**
 * Config command for Brainfile CLI
 *
 * Manage user configuration stored in ~/.config/brainfile/config.json
 *
 * Usage:
 *   brainfile config list              # Show all config values
 *   brainfile config get <key>         # Get a specific value
 *   brainfile config set <key> <value> # Set a value
 *   brainfile config path              # Show config file path
 *
 * Keys use dot notation:
 *   archive.default          - Default archive destination (local, github, linear)
 *   archive.github.owner     - GitHub repository owner
 *   archive.github.repo      - GitHub repository name
 *   archive.github.labels    - Comma-separated labels for GitHub issues
 *   archive.linear.teamId    - Linear team ID
 *   archive.linear.projectId - Linear project ID
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  type BrainfileConfig,
} from '../utils/config';

// ============================================================================
// Types
// ============================================================================

interface ConfigOptions {
  key?: string;
  value?: string;
}

type ConfigAction = 'list' | 'get' | 'set' | 'path';

// ============================================================================
// Main Command
// ============================================================================

export function configCommand(action: ConfigAction, options: ConfigOptions) {
  switch (action) {
    case 'list':
      listConfig();
      break;
    case 'get':
      if (!options.key) {
        console.log(chalk.red('Error:') + ' Missing key. Usage: brainfile config get <key>');
        process.exit(1);
      }
      getConfigValue(options.key);
      break;
    case 'set':
      if (!options.key) {
        console.log(chalk.red('Error:') + ' Missing key. Usage: brainfile config set <key> <value>');
        process.exit(1);
      }
      if (options.value === undefined) {
        console.log(chalk.red('Error:') + ' Missing value. Usage: brainfile config set <key> <value>');
        process.exit(1);
      }
      setConfigValue(options.key, options.value);
      break;
    case 'path':
      showConfigPath();
      break;
    default:
      console.log(chalk.red('Error:') + ` Unknown action: ${action}`);
      console.log('');
      console.log('Available actions:');
      console.log('  list              Show all config values');
      console.log('  get <key>         Get a specific value');
      console.log('  set <key> <value> Set a value');
      console.log('  path              Show config file path');
      process.exit(1);
  }
}

// ============================================================================
// Actions
// ============================================================================

function listConfig() {
  const config = loadConfig();

  if (Object.keys(config).length === 0) {
    console.log(chalk.gray('No configuration set.'));
    console.log('');
    console.log('Use ' + chalk.cyan('brainfile config set <key> <value>') + ' to set values.');
    console.log('');
    showAvailableKeys();
    return;
  }

  console.log(chalk.bold('Brainfile Configuration'));
  console.log('');

  const flattened = flattenConfig(config);
  const maxKeyLen = Math.max(...Object.keys(flattened).map((k) => k.length));

  for (const [key, value] of Object.entries(flattened)) {
    const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
    console.log(`  ${chalk.cyan(key.padEnd(maxKeyLen))}  ${displayValue}`);
  }

  console.log('');
  console.log(chalk.gray(`Config file: ${getConfigPath()}`));
}

function getConfigValue(key: string) {
  const config = loadConfig();
  const value = getNestedValue(config, key);

  if (value === undefined) {
    console.log(chalk.gray('(not set)'));
    return;
  }

  if (Array.isArray(value)) {
    console.log(value.join(', '));
  } else if (typeof value === 'object') {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

function setConfigValue(key: string, value: string) {
  const config = loadConfig();

  // Validate key
  if (!isValidKey(key)) {
    console.log(chalk.red('Error:') + ` Invalid key: ${key}`);
    console.log('');
    showAvailableKeys();
    process.exit(1);
  }

  // Parse value based on key
  const parsedValue = parseValue(key, value);

  // Set the value
  setNestedValue(config, key, parsedValue);
  saveConfig(config);

  console.log(chalk.green('') + ` Set ${chalk.cyan(key)} = ${formatValue(parsedValue)}`);
}

function showConfigPath() {
  console.log(getConfigPath());
}

// ============================================================================
// Helpers
// ============================================================================

const VALID_KEYS = [
  'archive.default',
  'archive.github.owner',
  'archive.github.repo',
  'archive.github.labels',
  'archive.linear.teamId',
  'archive.linear.projectId',
];

function isValidKey(key: string): boolean {
  return VALID_KEYS.includes(key);
}

function showAvailableKeys() {
  console.log('Available keys:');
  console.log('  ' + chalk.cyan('archive.default') + '          Default archive destination (local, github, linear)');
  console.log('  ' + chalk.cyan('archive.github.owner') + '     GitHub repository owner');
  console.log('  ' + chalk.cyan('archive.github.repo') + '      GitHub repository name');
  console.log('  ' + chalk.cyan('archive.github.labels') + '    Comma-separated labels for GitHub issues');
  console.log('  ' + chalk.cyan('archive.linear.teamId') + '    Linear team ID');
  console.log('  ' + chalk.cyan('archive.linear.projectId') + ' Linear project ID');
}

function parseValue(key: string, value: string): string | string[] {
  // Handle array values (labels)
  if (key === 'archive.github.labels') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Validate archive.default
  if (key === 'archive.default') {
    const valid = ['local', 'github', 'linear'];
    if (!valid.includes(value)) {
      console.log(chalk.red('Error:') + ` Invalid value for archive.default. Must be one of: ${valid.join(', ')}`);
      process.exit(1);
    }
  }

  return value;
}

function formatValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value;
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

function flattenConfig(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenConfig(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}
