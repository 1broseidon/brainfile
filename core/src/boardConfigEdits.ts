/**
 * Editing the board's own config (spec-13): its columns, its title, the agent
 * instructions and the related boards.
 *
 * Pure and browser-safe: every function takes a `BoardConfig` and returns a
 * new one, leaving the one passed in untouched. Columns are always handed
 * back in the order a person sees them (by `order` where a column has one,
 * then as listed, the TUI's rule); when any column carries `order`, every
 * column's is renumbered 1..n so the list and the field agree. The disk side,
 * which also moves the tasks out of a column being removed, is
 * `boardConfigOperations.ts`.
 *
 * @packageDocumentation
 */

import type { BoardConfig, ColumnConfig } from './types/board';
import { RELATED_ALIAS_PATTERN, readRelatedConfig, type RelatedConfig } from './related';

/** A column ID: letters, digits, `-` and `_`, starting with a letter or digit. */
export const COLUMN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface BoardConfigEditResult {
  success: boolean;
  /** The edited config, on success. */
  config?: BoardConfig;
  /** The column added, renamed or removed. */
  column?: ColumnConfig;
  error?: string;
}

/** A column ID from a title: `In Review` → `in-review`. Empty when nothing usable is left. */
export function columnIdFromTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The board's columns in the order a person sees them: by `order`, then as listed. */
export function orderedColumns(config: Pick<BoardConfig, 'columns'>): ColumnConfig[] {
  const columns = Array.isArray(config.columns) ? config.columns : [];
  return columns
    .map((column, index) => ({ column, index }))
    .sort((a, b) => {
      const orderA = typeof a.column.order === 'number' ? a.column.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.column.order === 'number' ? b.column.order : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.index - b.index;
    })
    .map(({ column }) => ({ ...column }));
}

/** A column by ID, else by title (case-insensitive). */
export function findColumnConfig(config: Pick<BoardConfig, 'columns'>, ref: string): ColumnConfig | undefined {
  const columns = Array.isArray(config.columns) ? config.columns : [];
  const wanted = ref.trim();
  return columns.find((c) => c.id === wanted)
    ?? columns.find((c) => typeof c.title === 'string' && c.title.toLowerCase() === wanted.toLowerCase());
}

/** The columns as written back: renumbered when the board uses `order`. */
function withColumns(config: BoardConfig, columns: ColumnConfig[]): BoardConfig {
  const numbered = columns.some((c) => typeof c.order === 'number');
  return {
    ...config,
    columns: numbered ? columns.map((c, index) => ({ ...c, order: index + 1 })) : columns,
  };
}

function fail(error: string): BoardConfigEditResult {
  return { success: false, error };
}

function columnList(config: BoardConfig): string {
  return orderedColumns(config).map((c) => `${c.id} (${c.title})`).join(', ');
}

function titleTaken(columns: ColumnConfig[], title: string, except?: string): boolean {
  return columns.some((c) => c.id !== except && typeof c.title === 'string' && c.title.toLowerCase() === title.toLowerCase());
}

export interface AddColumnInput {
  title: string;
  /** Default: from the title (`In Review` → `in-review`). */
  id?: string;
  /** Place it after this column (ID or title). Default: last. */
  after?: string;
  /** Place it before this column (ID or title). */
  before?: string;
  /** Tasks moved into it are complete (`completionColumn: true`). */
  completionColumn?: boolean;
}

/** Add a column. Its ID and title must be new on the board. */
export function addColumn(config: BoardConfig, input: AddColumnInput): BoardConfigEditResult {
  const title = input.title?.trim() ?? '';
  if (!title) return fail('a column needs a title');
  const id = input.id?.trim() || columnIdFromTitle(title);
  if (!id) return fail(`cannot make a column ID from '${title}'; give one`);
  if (!COLUMN_ID_PATTERN.test(id)) return fail(`column ID '${id}' must use letters, digits, '-' and '_'`);
  if (input.after && input.before) return fail('give after or before, not both');

  const columns = orderedColumns(config);
  if (columns.some((c) => c.id === id)) return fail(`a column with ID '${id}' already exists`);
  if (titleTaken(columns, title)) return fail(`a column titled '${title}' already exists`);

  const column: ColumnConfig = { id, title, ...(input.completionColumn ? { completionColumn: true } : {}) };
  let at = columns.length;
  const anchorRef = input.after ?? input.before;
  if (anchorRef) {
    const anchor = findColumnConfig({ columns }, anchorRef);
    if (!anchor) return fail(`column not found: ${anchorRef}. Columns: ${columnList(config)}`);
    const index = columns.findIndex((c) => c.id === anchor.id);
    at = input.after ? index + 1 : index;
  }
  columns.splice(at, 0, column);
  const next = withColumns(config, columns);
  return { success: true, config: next, column: next.columns.find((c) => c.id === id) };
}

/** Rename a column. Its ID stays, so the tasks in it stay in it. */
export function renameColumn(config: BoardConfig, ref: string, title: string): BoardConfigEditResult {
  const newTitle = title?.trim() ?? '';
  if (!newTitle) return fail('a column needs a title');
  const columns = orderedColumns(config);
  const found = findColumnConfig({ columns }, ref);
  if (!found) return fail(`column not found: ${ref}. Columns: ${columnList(config)}`);
  if (titleTaken(columns, newTitle, found.id)) return fail(`a column titled '${newTitle}' already exists`);
  const renamed = columns.map((c) => (c.id === found.id ? { ...c, title: newTitle } : c));
  const next = withColumns(config, renamed);
  return { success: true, config: next, column: next.columns.find((c) => c.id === found.id) };
}

/**
 * Reorder the columns. The ones named come first, in that order; the rest
 * follow in their current order, so naming every column sets the whole order.
 */
export function reorderColumns(config: BoardConfig, order: readonly string[]): BoardConfigEditResult {
  const refs = (order ?? []).map((r) => r.trim()).filter(Boolean);
  if (refs.length === 0) return fail('name the columns in their new order');
  const columns = orderedColumns(config);
  const first: ColumnConfig[] = [];
  for (const ref of refs) {
    const found = findColumnConfig({ columns }, ref);
    if (!found) return fail(`column not found: ${ref}. Columns: ${columnList(config)}`);
    if (first.some((c) => c.id === found.id)) return fail(`column named twice: ${ref}`);
    first.push(columns.find((c) => c.id === found.id)!);
  }
  const rest = columns.filter((c) => !first.some((f) => f.id === c.id));
  return { success: true, config: withColumns(config, [...first, ...rest]) };
}

/**
 * Remove a column from the config. Pure: it does not look at tasks; the disk
 * side refuses a column that still holds any unless told where they go. The
 * last column is never removed.
 */
export function removeColumn(config: BoardConfig, ref: string): BoardConfigEditResult {
  const columns = orderedColumns(config);
  const found = findColumnConfig({ columns }, ref);
  if (!found) return fail(`column not found: ${ref}. Columns: ${columnList(config)}`);
  if (columns.length === 1) return fail(`'${found.id}' is the board's only column`);
  return { success: true, config: withColumns(config, columns.filter((c) => c.id !== found.id)), column: found };
}

// ── title, agent instructions, related boards ─────────────────────────────

/** The board's own settings, as the `board` MCP tool reports them. */
export interface BoardSettings {
  title: string;
  /** `agent.instructions`: what every agent reads on its first brief. */
  instructions: string[];
  /** `related:`: short name → repo folder, relative to the project root. */
  related: RelatedConfig;
}

export interface BoardSettingsPatch {
  title?: string;
  /** Replace `agent.instructions` with these. */
  instructions?: string[];
  /** Append these (ones already there are skipped). */
  addInstructions?: string[];
  /** Remove these, matched exactly (after trimming). */
  removeInstructions?: string[];
  /** Add or repoint related boards: short name → folder. */
  addRelated?: Record<string, string>;
  /** Remove related boards by short name. */
  removeRelated?: string[];
}

export interface BoardSettingsResult {
  success: boolean;
  config?: BoardConfig;
  /** Which settings changed: `title`, `instructions`, `related`. */
  changed: Array<'title' | 'instructions' | 'related'>;
  error?: string;
}

/** The title, agent instructions and related boards of a board config. */
export function readBoardSettings(config: BoardConfig): BoardSettings {
  const raw = config.agent?.instructions;
  return {
    title: typeof config.title === 'string' ? config.title : '',
    instructions: Array.isArray(raw) ? raw.filter((line): line is string => typeof line === 'string') : [],
    related: readRelatedConfig(config),
  };
}

function cleanLines(lines: readonly string[] | undefined): string[] {
  return (lines ?? []).map((line) => (typeof line === 'string' ? line.trim() : '')).filter(Boolean);
}

/**
 * Change the title, agent instructions or related boards. Instructions are
 * replaced first, then removed, then added. All or nothing: an instruction or
 * a related name that is not there, or a bad related entry, changes nothing.
 */
export function updateBoardSettings(config: BoardConfig, patch: BoardSettingsPatch): BoardSettingsResult {
  const before = readBoardSettings(config);
  const changed: BoardSettingsResult['changed'] = [];
  let next: BoardConfig = { ...config };

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { success: false, changed: [], error: 'the title cannot be empty' };
    if (title !== before.title) {
      next.title = title;
      changed.push('title');
    }
  }

  const touchesInstructions = patch.instructions !== undefined
    || patch.addInstructions !== undefined
    || patch.removeInstructions !== undefined;
  if (touchesInstructions) {
    let lines = patch.instructions !== undefined ? cleanLines(patch.instructions) : [...before.instructions];
    const remove = cleanLines(patch.removeInstructions);
    const missing = remove.filter((line) => !lines.includes(line));
    if (missing.length > 0) {
      return { success: false, changed: [], error: `not an instruction on this board: ${missing.map((l) => `"${l}"`).join(', ')}` };
    }
    lines = lines.filter((line) => !remove.includes(line));
    for (const line of cleanLines(patch.addInstructions)) {
      if (!lines.includes(line)) lines.push(line);
    }
    if (JSON.stringify(lines) !== JSON.stringify(before.instructions)) {
      next = { ...next, agent: { ...(config.agent ?? {}), instructions: lines } };
      changed.push('instructions');
    }
  }

  if (patch.addRelated !== undefined || patch.removeRelated !== undefined) {
    const raw = config.related && typeof config.related === 'object' && !Array.isArray(config.related)
      ? { ...(config.related as Record<string, unknown>) }
      : {};
    for (const alias of (patch.removeRelated ?? []).map((a) => a.trim()).filter(Boolean)) {
      if (!Object.prototype.hasOwnProperty.call(raw, alias)) {
        return { success: false, changed: [], error: `no related board named '${alias}'` };
      }
      delete raw[alias];
    }
    for (const [aliasRaw, folderRaw] of Object.entries(patch.addRelated ?? {})) {
      const alias = aliasRaw.trim();
      const folder = typeof folderRaw === 'string' ? folderRaw.trim() : '';
      if (!RELATED_ALIAS_PATTERN.test(alias)) {
        return { success: false, changed: [], error: `related name '${aliasRaw}' must use letters, digits, '-' and '_'` };
      }
      if (!folder) return { success: false, changed: [], error: `related.${alias} needs a folder` };
      raw[alias] = folder;
    }
    if (JSON.stringify(raw) !== JSON.stringify(config.related ?? {})) {
      next = { ...next };
      if (Object.keys(raw).length > 0) next.related = raw;
      else delete next.related;
      changed.push('related');
    }
  }

  return { success: true, config: next, changed };
}
