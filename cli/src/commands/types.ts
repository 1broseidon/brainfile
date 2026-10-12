import * as fs from 'fs';
import * as yaml from 'js-yaml';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import {
  CLIError,
  missingRequired,
  parseFailure,
} from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import {
  canonicalTypeName,
  isDocRole,
  isKnownType,
  isTypeAlias,
  listDocTypes,
  TYPE_ALIASES,
  type ResolvedDocType,
} from '@brainfile/core';

export interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
  /** The built-in type whose place this one takes. */
  like?: string;
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
  /** Take a built-in type's place: its parents, children, completion rule and glyph. */
  like?: string;
}

/** One type and its place in the graph, as `types --json` reports it. */
export interface TypeGraphEntry {
  name: string;
  role: string;
  builtIn: boolean;
  configured: boolean;
  like?: string;
  idPrefix: string;
  completable: boolean;
  glyph: string;
  /** Roles it may sit under. */
  parents: string[];
  /** Roles it holds. */
  children: string[];
  /** False for decisions: no column, never completed, never in the tree. */
  work: boolean;
  aliases: string[];
  summary: string;
  schema?: string;
}

export interface TypesListResult {
  success: true;
  strict: boolean;
  /** The board's own `types:` entries, as written (built-ins appear only when overridden). */
  types: TypesConfig;
  /** Every type the board has: the five built-ins, then its own. */
  graph: TypeGraphEntry[];
  /** Entries under an alias name (`adr`, `issue`): they do not configure the canonical type. */
  aliasEntries: string[];
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
    if (typeof maybeEntry.like === 'string' && maybeEntry.like.trim()) {
      entry.like = maybeEntry.like.trim();
    }

    out[name] = entry;
  }

  return out;
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

function toGraphEntry(type: ResolvedDocType): TypeGraphEntry {
  return {
    name: type.name,
    role: type.role,
    builtIn: type.builtIn,
    configured: type.configured,
    ...(type.like ? { like: type.like } : {}),
    idPrefix: type.idPrefix,
    completable: type.completable,
    glyph: type.glyph,
    parents: [...type.parents],
    children: [...type.children],
    work: type.work,
    aliases: [...type.aliases],
    summary: type.summary,
    ...(type.schema ? { schema: type.schema } : {}),
  };
}

function joinRoles(roles: readonly string[]): string {
  return roles.join(' · ');
}

/** The place column: where it sits and what it holds. */
function placeOf(type: ResolvedDocType): { under: string; holds: string } {
  if (!type.work) return { under: 'never in the tree', holds: '—' };
  return {
    under: type.parents.length > 0 ? joinRoles(type.parents) : 'top level',
    holds: type.children.length > 0 ? joinRoles(type.children) : '—',
  };
}

function notesOf(type: ResolvedDocType, rawEntry: TypeEntry | undefined): string[] {
  const notes: string[] = [];
  if (type.like) notes.push(`like ${type.like}`);
  else if (!type.builtIn) notes.push('behaves as a task');
  if (type.aliases.length > 0) notes.push(`alias ${type.aliases.join(', ')}`);
  if (!type.work) notes.push('no column, never completed');
  else if (!type.completable) notes.push('not completable');
  if (rawEntry?.schema) notes.push(`schema ${rawEntry.schema}`);
  return notes;
}

/**
 * List every type a board has, with its place in the graph: the five
 * built-ins (whether listed or not) and the board's own.
 */
export function typesListCommand(
  options: TypesListOptions,
  logger: Logger = defaultLogger
): TypesListResult {
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const doc = readFrontmatter(filePath);
  const strict = doc.data.strict === true;
  const types: TypesConfig = sanitizeTypesConfig(doc.data.types);
  const rawTypes = (doc.data.types && typeof doc.data.types === 'object' && !Array.isArray(doc.data.types))
    ? doc.data.types as Record<string, TypeEntry>
    : undefined;
  const resolved = listDocTypes(rawTypes as any);
  const graph = resolved.map(toGraphEntry);
  const aliasEntries = Object.keys(types).filter((name) => isTypeAlias(name));

  if (options.json) {
    logger.log(JSON.stringify({ strict, types, graph, aliasEntries }, null, 2));
    return { success: true, strict, types, graph, aliasEntries };
  }

  logger.log(`Strict mode: ${strict ? 'on' : 'off'}`);
  logger.log('');

  const rows = resolved.map((type) => {
    const place = placeOf(type);
    return {
      glyph: type.glyph || ' ',
      name: type.name,
      id: `${type.idPrefix}-N`,
      under: place.under,
      holds: place.holds,
      notes: notesOf(type, types[type.name]).join(' · '),
    };
  });
  const width = (key: 'name' | 'id' | 'under' | 'holds', heading: string) =>
    Math.max(heading.length, ...rows.map((row) => row[key].length));
  const w = { name: width('name', 'TYPE'), id: width('id', 'ID'), under: width('under', 'GOES UNDER'), holds: width('holds', 'HOLDS') };

  logger.log(chalk.gray(`  ${'TYPE'.padEnd(w.name)}  ${'ID'.padEnd(w.id)}  ${'GOES UNDER'.padEnd(w.under)}  HOLDS`));
  rows.forEach((row, index) => {
    if (index === 5 && rows.length > 5) logger.log('');
    const line = `${row.glyph} ${row.name.padEnd(w.name)}  ${chalk.gray(row.id.padEnd(w.id))}  ${row.under.padEnd(w.under)}  ${row.holds.padEnd(w.holds)}`;
    logger.log(row.notes ? `${line}  ${chalk.gray(row.notes)}` : line.trimEnd());
  });

  if (resolved.length === 5) {
    logger.log('');
    logger.log(chalk.gray("No types of your own. Add one under types: in brainfile.md, or: brainfile types add bug --like task"));
  }

  for (const alias of aliasEntries) {
    const canonical = TYPE_ALIASES[alias.toLowerCase()];
    logger.log(chalk.yellow(`types.${alias}: '${alias}' is an alias of ${canonical}; that entry is not used. Configure ${canonical} instead.`));
  }

  return { success: true, strict, types, graph, aliasEntries };
}

/**
 * Add or update a type entry under the v2 board config frontmatter.types.
 */
export function typesAddCommand(
  options: TypesAddOptions,
  logger: Logger = defaultLogger
): TypesAddResult {
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const name = normalizeName(options.name);
  if (isTypeAlias(name)) {
    const canonical = canonicalTypeName(name);
    throw new CLIError(`'${name}' is an alias of ${canonical}. Configure ${canonical} instead: brainfile types add ${canonical} …`);
  }
  const idPrefix = normalizeIdPrefix(name, options.idPrefix);
  const like = options.like?.trim();
  // A type that takes a built-in's place keeps that built-in's completion rule unless told otherwise.
  const completable = options.completable ?? (like ? undefined : true);
  const schema = options.schema?.trim();

  const doc = readFrontmatter(filePath);
  const strict = doc.data.strict === true;

  if (like) {
    const existing = (doc.data.types && typeof doc.data.types === 'object' && !Array.isArray(doc.data.types))
      ? doc.data.types as Record<string, unknown>
      : {};
    if (canonicalTypeName(like) === name || !isKnownType(like, existing as any)) {
      throw new CLIError(
        `Cannot use like: '${like}'.`,
        undefined,
        'like names the type whose place this one takes: epic, spec, plan, task, decision, or a type already on the board.',
      );
    }
  }

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
    ...(completable !== undefined && { completable }),
  };

  if (like) {
    updatedEntry.like = canonicalTypeName(like);
  }
  if (schema) {
    updatedEntry.schema = schema;
  }

  existingTypes[name] = updatedEntry;
  doc.data.types = existingTypes;

  writeFrontmatter(filePath, doc);

  const resultEntry: TypeEntry = {
    idPrefix,
    ...(typeof updatedEntry.completable === 'boolean' && { completable: updatedEntry.completable }),
  };
  if (typeof updatedEntry.schema === 'string' && updatedEntry.schema.trim()) {
    resultEntry.schema = updatedEntry.schema.trim();
  }
  if (typeof updatedEntry.like === 'string') {
    resultEntry.like = updatedEntry.like;
  }

  logger.log(chalk.green(`Saved type '${name}'.`));
  logger.log(chalk.gray(`  idPrefix: ${idPrefix}`));
  if (resultEntry.like) {
    logger.log(chalk.gray(`  like: ${resultEntry.like}`));
  }
  if (resultEntry.completable !== undefined) {
    logger.log(chalk.gray(`  completable: ${resultEntry.completable}`));
  }
  if (isDocRole(name)) {
    logger.log(chalk.gray(`  ${name} is built in; this entry overrides its defaults.`));
  }
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
