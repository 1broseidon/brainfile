import * as fs from 'fs';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import {
  CLIError,
  fileNotFound,
  missingRequired,
  parseFailure,
} from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { isV2, readV2BoardConfig } from '../utils/v2-detect';

export interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

export type TypesConfig = Record<string, TypeEntry>;

export interface TypesListOptions {
  file: string;
  json?: boolean;
}

export interface TypesAddOptions {
  file: string;
  name?: string;
  idPrefix?: string;
  completable?: boolean;
  schema?: string;
}

export interface TypesListResult {
  success: true;
  strict: boolean;
  types: TypesConfig;
}

export interface TypesAddResult {
  success: true;
  strict: boolean;
  typeName: string;
  entry: TypeEntry;
  filePath: string;
}

interface FrontmatterDocument {
  data: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): FrontmatterDocument {
  const lines = content.split('\n');

  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw parseFailure('Missing YAML frontmatter start delimiter (---)');
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw parseFailure('Missing YAML frontmatter end delimiter (---)');
  }

  const yamlContent = lines.slice(1, endIndex).join('\n');
  const parsed = yaml.load(yamlContent);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw parseFailure('YAML frontmatter must be a mapping/object');
  }

  return {
    data: parsed as Record<string, unknown>,
    body: lines.slice(endIndex + 1).join('\n'),
  };
}

function serializeFrontmatter(doc: FrontmatterDocument): string {
  const yamlContent = yaml.dump(doc.data, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  return `---\n${yamlContent}---\n${doc.body}`;
}

function readFrontmatter(filePath: string): FrontmatterDocument {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseFrontmatter(content);
}

function writeFrontmatter(filePath: string, doc: FrontmatterDocument): void {
  fs.writeFileSync(filePath, serializeFrontmatter(doc), 'utf-8');
}

function sanitizeTypesConfig(raw: unknown): TypesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const entries = raw as Record<string, unknown>;
  const out: TypesConfig = {};

  for (const [name, value] of Object.entries(entries)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const maybeEntry = value as Record<string, unknown>;
    const idPrefix = typeof maybeEntry.idPrefix === 'string' && maybeEntry.idPrefix.trim()
      ? maybeEntry.idPrefix.trim()
      : name;

    const entry: TypeEntry = { idPrefix };
    if (typeof maybeEntry.completable === 'boolean') {
      entry.completable = maybeEntry.completable;
    }
    if (typeof maybeEntry.schema === 'string' && maybeEntry.schema.trim()) {
      entry.schema = maybeEntry.schema.trim();
    }

    out[name] = entry;
  }

  return out;
}

function getV1TypesConfig(filePath: string): { strict: boolean; types: TypesConfig } {
  const doc = readFrontmatter(filePath);
  const strict = doc.data.strict === true;
  const types = getBoardTypes(doc.data);
  return { strict, types };
}

function getBoardTypes(board: Record<string, unknown>): TypesConfig {
  return sanitizeTypesConfig(board.types);
}

function normalizeName(name?: string): string {
  const normalized = name?.trim();
  if (!normalized) {
    throw missingRequired('<name>', 'brainfile types add <name> [options]');
  }
  return normalized;
}

function normalizeIdPrefix(name: string, idPrefix?: string): string {
  const normalized = idPrefix?.trim();
  if (!normalized) return name;
  return normalized;
}

export function parseBooleanFlag(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  throw new CLIError(
    `Invalid boolean value: ${value}`,
    undefined,
    'Use one of: true, false, 1, 0, yes, no, on, off'
  );
}

/**
 * List configured board types for v1/v2 boards.
 */
export function typesListCommand(
  options: TypesListOptions,
  logger: Logger = defaultLogger
): TypesListResult {
  const filePath = resolveCliBrainfilePath(options.file);

  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  let strict = false;
  let types: TypesConfig = {};

  if (isV2(filePath)) {
    const board = readV2BoardConfig(filePath);
    strict = (board as unknown as Record<string, unknown>).strict === true;
    types = getBoardTypes(board as unknown as Record<string, unknown>);
  } else {
    const config = getV1TypesConfig(filePath);
    strict = config.strict;
    types = config.types;
  }

  if (options.json) {
    logger.log(JSON.stringify({ strict, types }, null, 2));
  } else {
    logger.log(`Strict mode: ${strict ? 'on' : 'off'}`);

    const entries = Object.entries(types);
    if (entries.length === 0) {
      logger.log('No custom types defined. Add types to your brainfile.md or use \'brainfile types add\'.');
    } else {
      logger.log('Types:');
      const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));
      for (const [name, entry] of sorted) {
        const completable = entry.completable ?? true;
        const schema = entry.schema ? `, schema=${entry.schema}` : '';
        logger.log(`  ${name}: idPrefix=${entry.idPrefix}, completable=${completable}${schema}`);
      }
    }
  }

  return { success: true, strict, types };
}

/**
 * Add or update a type entry under board frontmatter.types for v1/v2 boards.
 */
export function typesAddCommand(
  options: TypesAddOptions,
  logger: Logger = defaultLogger
): TypesAddResult {
  const filePath = resolveCliBrainfilePath(options.file);

  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  const name = normalizeName(options.name);
  const idPrefix = normalizeIdPrefix(name, options.idPrefix);
  const completable = options.completable ?? true;
  const schema = options.schema?.trim();

  const doc = readFrontmatter(filePath);
  const strict = doc.data.strict === true;

  const existingTypes =
    doc.data.types && typeof doc.data.types === 'object' && !Array.isArray(doc.data.types)
      ? { ...(doc.data.types as Record<string, unknown>) }
      : {};

  const existingEntry =
    existingTypes[name] && typeof existingTypes[name] === 'object' && !Array.isArray(existingTypes[name])
      ? { ...(existingTypes[name] as Record<string, unknown>) }
      : {};

  const updatedEntry: Record<string, unknown> = {
    ...existingEntry,
    idPrefix,
    completable,
  };

  if (schema) {
    updatedEntry.schema = schema;
  }

  existingTypes[name] = updatedEntry;
  doc.data.types = existingTypes;

  writeFrontmatter(filePath, doc);

  const resultEntry: TypeEntry = {
    idPrefix,
    completable,
  };
  if (typeof updatedEntry.schema === 'string' && updatedEntry.schema.trim()) {
    resultEntry.schema = updatedEntry.schema.trim();
  }

  logger.log(chalk.green(`Saved type '${name}'.`));
  logger.log(chalk.gray(`  idPrefix: ${idPrefix}`));
  logger.log(chalk.gray(`  completable: ${completable}`));
  if (schema) {
    logger.log(chalk.gray(`  schema: ${schema}`));
  }

  return {
    success: true,
    strict,
    typeName: name,
    entry: resultEntry,
    filePath,
  };
}
