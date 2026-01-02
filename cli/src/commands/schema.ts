/**
 * Schema command for Brainfile CLI
 *
 * View and manage brainfile schemas locally, eliminating network access for basic usage.
 *
 * Usage:
 *   brainfile schema                # List available schemas
 *   brainfile schema <name>         # Display specific schema
 *   brainfile schema update         # Check for and download schema updates
 *   brainfile schema --json         # Output in JSON format
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import {
  loadConfig,
  saveConfig,
  getConfigDir,
  ensureConfigDir,
} from '../utils/config';

// ============================================================================
// Types
// ============================================================================

export interface SchemaOptions {
  name?: string;
  json?: boolean;
}

export interface SchemaResult {
  success: true;
  action: 'list' | 'show' | 'update';
  schemas?: string[];
  schema?: object;
  updated?: boolean;
}

interface SchemaInfo {
  id: string;
  description: string;
  file: string;
}

interface SchemaConfig {
  lastCheck?: string;
  versions?: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_BASE_URL = 'https://brainfile.md/v1';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Get bundled schemas directory (relative to this file after compilation)
function getBundledSchemasDir(): string {
  // In development: cli/src/schemas
  // In production:  cli/dist/schemas
  const distPath = path.join(__dirname, '..', 'schemas');
  const srcPath = path.join(__dirname, '..', '..', 'src', 'schemas');

  if (fs.existsSync(distPath)) {
    return distPath;
  }
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }

  // Fallback for development
  return path.join(__dirname, 'schemas');
}

// Schema metadata
const BUNDLED_SCHEMAS: SchemaInfo[] = [
  {
    id: 'board',
    description: 'Board structure (columns, tasks, contracts)',
    file: 'board.json',
  },
  {
    id: 'base',
    description: 'Base types (rules, agent instructions)',
    file: 'base.json',
  },
];

// ============================================================================
// Help Text
// ============================================================================

export const SCHEMA_COMMAND_HELP = `
Examples:
  brainfile schema                # List available schemas
  brainfile schema board          # View the board schema
  brainfile schema base           # View the base schema
  brainfile schema update         # Check for schema updates
  brainfile schema board --json   # Output board schema as JSON

Bundled schemas:
  board  - Board structure (columns, tasks, contracts)
  base   - Base types (rules, agent instructions)

Notes:
  - Schemas are bundled with the CLI (no network required for basic usage)
  - Use 'schema update' to check for newer versions from brainfile.md
  - Auto-checks once per 24 hours (non-blocking notification)
`.trimEnd();

// ============================================================================
// Main Command
// ============================================================================

export function schemaCommand(
  options: SchemaOptions,
  logger: Logger = defaultLogger
): SchemaResult {
  const { name, json } = options;

  // Handle update subcommand
  if (name === 'update') {
    return schemaUpdateCommand({ json }, logger);
  }

  // Handle show specific schema
  if (name) {
    return schemaShowCommand(name, { json }, logger);
  }

  // List all schemas
  return schemaListCommand({ json }, logger);
}

// ============================================================================
// List Schemas
// ============================================================================

function schemaListCommand(
  options: { json?: boolean },
  logger: Logger
): SchemaResult {
  if (options.json) {
    const output = {
      schemas: BUNDLED_SCHEMAS.map((s) => ({
        id: s.id,
        description: s.description,
      })),
    };
    logger.log(JSON.stringify(output, null, 2));
  } else {
    logger.log('');
    logger.log(chalk.bold('Available schemas:'));
    logger.log('');

    const maxIdLen = Math.max(...BUNDLED_SCHEMAS.map((s) => s.id.length));
    for (const schema of BUNDLED_SCHEMAS) {
      logger.log(
        `  ${chalk.cyan(schema.id.padEnd(maxIdLen))}  ${chalk.gray('-')} ${schema.description}`
      );
    }

    logger.log('');
    logger.log(chalk.gray('Run: brainfile schema <name> to view schema'));
    logger.log(chalk.gray('Run: brainfile schema update to check for updates'));
  }

  // Check for auto-update (non-blocking)
  checkAutoUpdate(logger);

  return {
    success: true,
    action: 'list',
    schemas: BUNDLED_SCHEMAS.map((s) => s.id),
  };
}

// ============================================================================
// Show Schema
// ============================================================================

function schemaShowCommand(
  name: string,
  options: { json?: boolean },
  logger: Logger
): SchemaResult {
  const schemaInfo = BUNDLED_SCHEMAS.find((s) => s.id === name);

  if (!schemaInfo) {
    const availableIds = BUNDLED_SCHEMAS.map((s) => s.id).join(', ');
    throw new CLIError(
      `Unknown schema: ${name}`,
      ExitCode.USER_ERROR,
      `Available schemas: ${availableIds}`
    );
  }

  const schemasDir = getBundledSchemasDir();
  const schemaPath = path.join(schemasDir, schemaInfo.file);

  if (!fs.existsSync(schemaPath)) {
    throw new CLIError(
      `Schema file not found: ${schemaInfo.file}`,
      ExitCode.USER_ERROR,
      `Expected at: ${schemaPath}`
    );
  }

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(content);

  if (options.json) {
    logger.log(JSON.stringify(schema, null, 2));
  } else {
    logger.log('');
    logger.log(chalk.bold(`Schema: ${name}`));
    logger.log(chalk.gray(`Description: ${schemaInfo.description}`));
    logger.log(chalk.gray(`Source: ${SCHEMA_BASE_URL}/${schemaInfo.file}`));
    logger.log('');
    logger.log(JSON.stringify(schema, null, 2));
  }

  return {
    success: true,
    action: 'show',
    schema,
  };
}

// ============================================================================
// Update Schemas
// ============================================================================

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export function schemaUpdateCommand(
  options: { json?: boolean },
  logger: Logger = defaultLogger
): SchemaResult {
  // Run the async update and handle synchronously for CLI
  schemaUpdateAsync(options, logger);

  return {
    success: true,
    action: 'update',
    updated: false, // Will be updated by async function
  };
}

async function schemaUpdateAsync(
  options: { json?: boolean },
  logger: Logger
): Promise<void> {
  if (!options.json) {
    logger.log('');
    logger.log(chalk.bold('Checking for schema updates...'));
    logger.log('');
  }

  const schemasDir = getBundledSchemasDir();
  const results: Array<{ id: string; status: 'updated' | 'current' | 'error'; error?: string }> = [];

  for (const schemaInfo of BUNDLED_SCHEMAS) {
    const url = `${SCHEMA_BASE_URL}/${schemaInfo.file}`;
    const localPath = path.join(schemasDir, schemaInfo.file);

    try {
      const response = await fetchWithTimeout(url, 10000);

      if (!response.ok) {
        results.push({
          id: schemaInfo.id,
          status: 'error',
          error: `HTTP ${response.status}`,
        });
        continue;
      }

      const remoteContent = await response.text();
      const remoteSchema = JSON.parse(remoteContent);

      // Compare with local
      let localSchema: object | null = null;
      if (fs.existsSync(localPath)) {
        const localContent = fs.readFileSync(localPath, 'utf-8');
        localSchema = JSON.parse(localContent);
      }

      // Simple comparison using JSON stringification
      const remoteStr = JSON.stringify(remoteSchema);
      const localStr = localSchema ? JSON.stringify(localSchema) : '';

      if (remoteStr !== localStr) {
        // Update local schema
        fs.writeFileSync(localPath, JSON.stringify(remoteSchema, null, 2));
        results.push({ id: schemaInfo.id, status: 'updated' });
      } else {
        results.push({ id: schemaInfo.id, status: 'current' });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ id: schemaInfo.id, status: 'error', error: errorMsg });
    }
  }

  // Update last check time
  updateLastCheckTime();

  // Output results
  if (options.json) {
    logger.log(JSON.stringify({ schemas: results }, null, 2));
  } else {
    for (const result of results) {
      if (result.status === 'updated') {
        logger.log(`  ${chalk.green('+')} ${chalk.cyan(result.id)} - Updated`);
      } else if (result.status === 'current') {
        logger.log(`  ${chalk.gray('=')} ${chalk.cyan(result.id)} - Up to date`);
      } else {
        logger.log(
          `  ${chalk.red('!')} ${chalk.cyan(result.id)} - Error: ${result.error}`
        );
      }
    }

    const updatedCount = results.filter((r) => r.status === 'updated').length;
    logger.log('');
    if (updatedCount > 0) {
      logger.log(chalk.green(`Updated ${updatedCount} schema(s)`));
    } else {
      logger.log(chalk.gray('All schemas are up to date'));
    }
  }
}

// ============================================================================
// Auto-Update Check
// ============================================================================

function getSchemaConfig(): SchemaConfig {
  const config = loadConfig();
  return (config as any).schema || {};
}

function saveSchemaConfig(schemaConfig: SchemaConfig): void {
  const config = loadConfig();
  (config as any).schema = schemaConfig;
  saveConfig(config);
}

function updateLastCheckTime(): void {
  const schemaConfig = getSchemaConfig();
  schemaConfig.lastCheck = new Date().toISOString();
  saveSchemaConfig(schemaConfig);
}

function shouldAutoCheck(): boolean {
  const schemaConfig = getSchemaConfig();

  if (!schemaConfig.lastCheck) {
    return true;
  }

  const lastCheck = new Date(schemaConfig.lastCheck).getTime();
  const now = Date.now();

  return now - lastCheck > CHECK_INTERVAL_MS;
}

function checkAutoUpdate(logger: Logger): void {
  if (!shouldAutoCheck()) {
    return;
  }

  // Run async check in background (non-blocking)
  checkForUpdatesAsync(logger).catch(() => {
    // Silently ignore errors during auto-check
  });
}

async function checkForUpdatesAsync(logger: Logger): Promise<void> {
  const schemasDir = getBundledSchemasDir();
  let hasUpdates = false;

  for (const schemaInfo of BUNDLED_SCHEMAS) {
    const url = `${SCHEMA_BASE_URL}/${schemaInfo.file}`;
    const localPath = path.join(schemasDir, schemaInfo.file);

    try {
      const response = await fetchWithTimeout(url, 5000);

      if (!response.ok) {
        continue;
      }

      const remoteContent = await response.text();
      const remoteSchema = JSON.parse(remoteContent);

      // Compare with local
      if (fs.existsSync(localPath)) {
        const localContent = fs.readFileSync(localPath, 'utf-8');
        const localSchema = JSON.parse(localContent);

        const remoteStr = JSON.stringify(remoteSchema);
        const localStr = JSON.stringify(localSchema);

        if (remoteStr !== localStr) {
          hasUpdates = true;
          break;
        }
      }
    } catch {
      // Silently ignore errors during auto-check
    }
  }

  // Update last check time
  updateLastCheckTime();

  // Notify user if updates available
  if (hasUpdates) {
    logger.log('');
    logger.log(
      chalk.yellow('Hint: ') +
        'Schema updates available. Run ' +
        chalk.cyan('brainfile schema update') +
        ' to update.'
    );
  }
}
