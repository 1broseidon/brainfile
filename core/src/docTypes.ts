/**
 * Document types and their place in the graph (spec-12).
 *
 * Brainfile ships five types with opinions about what each is for and how
 * they connect: epic, spec, plan, task and decision. They exist on every
 * board without being listed; `types:` in brainfile.md names only additions
 * and overrides. A type of your own can take a default's place with `like:`
 * (`bug: { like: task }`); one with no `like` behaves as a task.
 *
 * Containment is the tree, through `parentId`:
 *
 *     epic  ▸ spec · plan · task
 *     spec  ▸ plan · task
 *     plan  ▸ task
 *     task  ▸ task
 *
 * Decisions are never in it: they are standing choices, not work, with no
 * column and no completion.
 *
 * Browser-safe: no fs, path or child_process. The desktop renderer reads the
 * glyph, role and allowed-parents table from here.
 *
 * @packageDocumentation
 */

import type { LintIssue } from './linter';
import type { TypeEntry, TypesConfig } from './types/board';

/** The five built-in types. Every type, built in or your own, plays one of these roles. */
export type DocRole = 'epic' | 'spec' | 'plan' | 'task' | 'decision';

/** The built-in types in outline order. */
export const DOC_ROLES: readonly DocRole[] = ['epic', 'spec', 'plan', 'task', 'decision'];

/** What a built-in type is and where it sits. */
export interface DocTypeDefinition {
  role: DocRole;
  /** One line: what a document of this type is for. */
  summary: string;
  /** The TUI glyph. A plain task has none: the blank column is what makes typed documents stand out. */
  glyph: string;
  /** Roles a document of this type may sit under (its parentId). Empty: top level only. */
  parents: readonly DocRole[];
  /** Roles this type holds. */
  children: readonly DocRole[];
  /** Work has a column and completes; a decision does neither. */
  work: boolean;
  /** Other names accepted wherever a type is. New documents are written with the canonical name. */
  aliases: readonly string[];
}

/** The five, with their roles. */
export const DOC_TYPES: Readonly<Record<DocRole, DocTypeDefinition>> = {
  epic: {
    role: 'epic',
    summary: 'An outcome worth several pieces of work; done when everything under it is.',
    glyph: '▸',
    parents: [],
    children: ['spec', 'plan', 'task'],
    work: true,
    aliases: [],
  },
  spec: {
    role: 'spec',
    summary: 'What to build and why: behaviour, scope, what is not in scope.',
    glyph: '◆',
    parents: ['epic'],
    children: ['plan', 'task'],
    work: true,
    aliases: [],
  },
  plan: {
    role: 'plan',
    summary: 'How, and in what order; done when its tasks are.',
    glyph: '⎘',
    parents: ['epic', 'spec'],
    children: ['task'],
    work: true,
    aliases: [],
  },
  task: {
    role: 'task',
    summary: 'One piece of work a person or an agent can pick up.',
    glyph: '',
    parents: ['epic', 'spec', 'plan', 'task'],
    children: ['task'],
    work: true,
    aliases: ['issue'],
  },
  decision: {
    role: 'decision',
    summary: 'A standing choice: current until superseded, rejected or stale.',
    glyph: '●',
    parents: [],
    children: [],
    work: false,
    aliases: ['adr'],
  },
};

/** Alias → canonical type. `issue` is a task, `adr` a decision. */
export const TYPE_ALIASES: Readonly<Record<string, DocRole>> = {
  issue: 'task',
  adr: 'decision',
};

/** Glyph per role: ▸ epic, ◆ spec, ⎘ plan, ● decision, none for a task. */
export const TYPE_GLYPHS: Readonly<Record<DocRole, string>> = {
  epic: DOC_TYPES.epic.glyph,
  spec: DOC_TYPES.spec.glyph,
  plan: DOC_TYPES.plan.glyph,
  task: DOC_TYPES.task.glyph,
  decision: DOC_TYPES.decision.glyph,
};

/** A type as a board sees it: the built-in defaults with that board's `types:` applied. */
export interface ResolvedDocType {
  /** Canonical name, the one new documents are written with (`adr` resolves to `decision`). */
  name: string;
  /** The built-in whose place this type takes. */
  role: DocRole;
  /** True for the five. */
  builtIn: boolean;
  /** True when `types:` has an entry under this name. */
  configured: boolean;
  /** The type named by `like:`, canonicalised, when the entry has one. */
  like?: string;
  /** Prefix for new IDs: `epic` gives `epic-1`. */
  idPrefix: string;
  /** Whether moving it into a completion column completes it. Never true for a decision. */
  completable: boolean;
  glyph: string;
  /** Roles a document of this type may sit under. */
  parents: readonly DocRole[];
  /** Roles it holds. */
  children: readonly DocRole[];
  /** False for a decision: no column, never completed, never in the tree. */
  work: boolean;
  /** Other names for it (`issue` for task, `adr` for decision). */
  aliases: readonly string[];
  summary: string;
  schema?: string;
}

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** True for one of the five built-in names. */
export function isDocRole(value: unknown): value is DocRole {
  return typeof value === 'string' && hasOwn(DOC_TYPES, value);
}

/** True for `issue` and `adr`. */
export function isTypeAlias(name: string | undefined | null): boolean {
  return typeof name === 'string' && hasOwn(TYPE_ALIASES, name.trim().toLowerCase());
}

/**
 * The name a document of this type is written with. Empty means `task`;
 * the built-in names and their aliases are matched case-insensitively
 * (`ADR` → `decision`, `Issue` → `task`); any other name is returned as
 * written, trimmed.
 */
export function canonicalTypeName(type?: string | null): string {
  const trimmed = typeof type === 'string' ? type.trim() : '';
  if (!trimmed) return 'task';
  const lower = trimmed.toLowerCase();
  if (hasOwn(TYPE_ALIASES, lower)) return TYPE_ALIASES[lower];
  if (isDocRole(lower)) return lower;
  return trimmed;
}

/** True when two type names mean the same type (`adr` and `decision`, `issue` and `task`, or equal names). */
export function typesMatch(a?: string | null, b?: string | null): boolean {
  return canonicalTypeName(a) === canonicalTypeName(b);
}

/** True for one of the five (or an alias of one). */
export function isBuiltInType(type?: string | null): boolean {
  return isDocRole(canonicalTypeName(type));
}

/** The `types:` entry under a canonical name. Entries under an alias (`adr`, `issue`) do not configure the canonical type. */
function typeEntry(types: TypesConfig | undefined, name: string): TypeEntry | undefined {
  if (!types || typeof types !== 'object' || !hasOwn(types, name)) return undefined;
  const entry = (types as Record<string, unknown>)[name];
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as TypeEntry) : undefined;
}

function likeOf(entry: TypeEntry | undefined): string | undefined {
  const like = entry?.like;
  return typeof like === 'string' && like.trim() ? like.trim() : undefined;
}

/** The role a name plays, following `like:` through custom types. Unknown names and loops are tasks. */
function roleOf(name: string, types: TypesConfig | undefined, seen: Set<string>): DocRole {
  const canonical = canonicalTypeName(name);
  if (seen.has(canonical)) return isDocRole(canonical) ? canonical : 'task';
  seen.add(canonical);
  const like = likeOf(typeEntry(types, canonical));
  if (like) return roleOf(like, types, seen);
  return isDocRole(canonical) ? canonical : 'task';
}

/** A prefix that is safe in an ID and a file name. */
const ID_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Resolve a type name against a board's `types:`.
 *
 * - The five resolve to their built-in place; an entry under their name
 *   overrides it (explicit config wins over defaults).
 * - `issue` and `adr` resolve to `task` and `decision`. An entry under an
 *   alias name does not configure the canonical type; configure `task` or
 *   `decision` instead.
 * - A custom type with `like:` takes that type's parents, children,
 *   completion rule and glyph. Without `like` it behaves as a task.
 * - A `task` is always completable and a `decision` never is, whatever the
 *   config says; any other type is unless its entry sets `completable: false`.
 */
export function resolveDocType(type: string | undefined | null, types?: TypesConfig): ResolvedDocType {
  const name = canonicalTypeName(type);
  const entry = typeEntry(types, name);
  const like = likeOf(entry);
  const role = roleOf(name, types, new Set());
  const def = DOC_TYPES[role];
  const builtIn = isDocRole(name);

  const configuredPrefix = typeof entry?.idPrefix === 'string' ? entry.idPrefix.trim() : '';
  const idPrefix = ID_PREFIX_PATTERN.test(configuredPrefix) ? configuredPrefix : name;

  let completable: boolean;
  if (role === 'decision') completable = false;
  else if (name === 'task') completable = true;
  else if (typeof entry?.completable === 'boolean') completable = entry.completable;
  else completable = true;

  const schema = typeof entry?.schema === 'string' && entry.schema.trim() ? entry.schema.trim() : undefined;

  return {
    name,
    role,
    builtIn,
    configured: Boolean(entry),
    ...(like ? { like: canonicalTypeName(like) } : {}),
    idPrefix,
    completable,
    glyph: def.glyph,
    parents: def.parents,
    children: def.children,
    work: def.work,
    aliases: builtIn ? DOC_TYPES[name as DocRole].aliases : [],
    summary: builtIn && !like ? DOC_TYPES[name as DocRole].summary : def.summary,
    ...(schema ? { schema } : {}),
  };
}

/** The role a type plays on a board. */
export function docRole(type: string | undefined | null, types?: TypesConfig): DocRole {
  return resolveDocType(type, types).role;
}

/** The glyph a type shows: its role's (▸ ◆ ⎘ ●), none for a task. */
export function typeGlyph(type: string | undefined | null, types?: TypesConfig): string {
  return resolveDocType(type, types).glyph;
}

/** True when a type is defined on a board: one of the five, an alias of one, or an entry under `types:`. */
export function isKnownType(type: string | undefined | null, types?: TypesConfig): boolean {
  const name = canonicalTypeName(type);
  return isDocRole(name) || Boolean(typeEntry(types, name));
}

/**
 * Every type a board has: the five in outline order (with any overrides),
 * then the board's own types in the order `types:` lists them. Entries under
 * an alias name are not types of their own and are left out.
 */
export function listDocTypes(types?: TypesConfig): ResolvedDocType[] {
  const out: ResolvedDocType[] = DOC_ROLES.map((role) => resolveDocType(role, types));
  for (const key of Object.keys(types ?? {})) {
    const name = canonicalTypeName(key);
    if (isDocRole(name) || isTypeAlias(key) || !typeEntry(types, key)) continue;
    if (out.some((t) => t.name === name)) continue;
    out.push(resolveDocType(name, types));
  }
  return out;
}

/** Type names a board accepts, for messages: task first, then the other built-ins, then the board's own. */
export function availableTypeNames(types?: TypesConfig): string[] {
  const names = listDocTypes(types).map((t) => t.name);
  return ['task', ...names.filter((n) => n !== 'task')];
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function joinOr(words: readonly string[]): string {
  const items = words.map(article);
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** Whether a parent fits a child under the defaults, and why not when it does not. */
export interface ParentFit {
  fits: boolean;
  /** Plain-language reason, when it does not fit: "a spec goes under an epic, not under a plan". */
  reason?: string;
}

/**
 * Does a document of `parentType` hold one of `childType`? Decided by role,
 * so `bug: { like: task }` fits under a plan exactly as a task does.
 */
export function parentFit(
  childType: string | undefined | null,
  parentType: string | undefined | null,
  types?: TypesConfig,
): ParentFit {
  const child = resolveDocType(childType, types);
  const parent = resolveDocType(parentType, types);
  if (child.role === 'decision') {
    const what = child.name === 'decision' ? 'decisions' : `${article(child.name)} is a decision, and decisions`;
    return { fits: false, reason: `${what} are never in the tree` };
  }
  if (parent.role === 'decision') {
    const what = parent.name === 'decision' ? 'decisions' : `${article(parent.name)} is a decision, and decisions`;
    return { fits: false, reason: `${what} hold nothing` };
  }
  if (child.parents.includes(parent.role)) return { fits: true };
  const where = child.parents.length === 0
    ? 'sits at the top of the tree'
    : `goes under ${joinOr(child.parents)}`;
  return { fits: false, reason: `${article(child.name)} ${where}, not under ${article(parent.name)}` };
}

/** Roles a document of this type may sit under on a board. */
export function allowedParentRoles(type: string | undefined | null, types?: TypesConfig): readonly DocRole[] {
  return resolveDocType(type, types).parents;
}

/** Roles a document of this type holds on a board. */
export function allowedChildRoles(type: string | undefined | null, types?: TypesConfig): readonly DocRole[] {
  return resolveDocType(type, types).children;
}

/** Problems in a `types:` map itself: a `like:` naming no type, or a loop of `like:`s. */
export function lintTypesConfig(types: unknown): LintIssue[] {
  if (!types || typeof types !== 'object' || Array.isArray(types)) return [];
  const config = types as TypesConfig;
  const issues: LintIssue[] = [];
  for (const key of Object.keys(config)) {
    const like = likeOf(typeEntry(config, key));
    if (!like) continue;
    const target = canonicalTypeName(like);
    if (!isKnownType(target, config)) {
      issues.push({
        type: 'warning',
        message: `types.${key}.like: '${like}' is not a type (use epic, spec, plan, task, decision or one of yours)`,
        fixable: false,
        code: 'UNKNOWN_LIKE',
      });
      continue;
    }
    // A loop: following like from the target comes back to this key without reaching a built-in.
    const seen = new Set<string>([canonicalTypeName(key)]);
    let current: string | undefined = target;
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = likeOf(typeEntry(config, current));
      current = next ? canonicalTypeName(next) : undefined;
    }
    if (current && current === canonicalTypeName(key) && !isDocRole(current)) {
      issues.push({
        type: 'warning',
        message: `types.${key}.like: '${like}' loops back to ${key}; it behaves as a task`,
        fixable: false,
        code: 'LIKE_LOOP',
      });
    }
  }
  return issues;
}
