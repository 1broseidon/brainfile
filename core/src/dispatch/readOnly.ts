/**
 * Sessions that write no code (decision-14, decision-15): an epic's lead,
 * and the desktop's board chat and discussions, which build on these. They
 * read the code freely, change the board through `brainfile mcp`, and run
 * only the brainfile command line and git where they only read; an edit or
 * any other command is refused before anyone is asked.
 */
import type { AgentModes } from './types';

/** The board's own tools as an agent names them: `mcp__brainfile__note`, `brainfile.note`. */
export const BOARD_TOOL_NAME = /^(?:mcp(?:__|\.))?brainfile(?:__|[_.])(\w+)/i;

/** What a session that writes no code never does, whatever its policy. */
export const REFUSED_KINDS: ReadonlySet<string> = new Set(['edit', 'delete', 'move', 'execute', 'switch_mode']);

/** The words of a command an agent asks to run: its raw input's `command` (a string, or argv), else the title without its backticks or `Run`. */
export function commandOf(title: string, rawInput?: unknown): string {
  const raw = rawInput && typeof rawInput === 'object' ? (rawInput as { command?: unknown }).command : undefined;
  const words = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map(String).join(' ') : title;
  return words.trim().replace(/^`+|`+$/g, '').replace(/^run\s+/i, '').trim();
}

/** One command, nothing chained, piped, redirected or substituted after it. */
const PLAIN = /^[^;&|<>`$\n]*$/;
/** The board's own command line, its fallback when the MCP tools are missing. */
const BOARD_COMMAND = /^(?:npx\s+)?brainfile(?:\s|$)/;
/** brainfile commands that only read, whatever they are given. */
const READING_BOARD = new Set(['list', 'show', 'brief', 'search', 'log', 'check', 'where', 'review', 'agents', 'schema', 'help']);
/** brainfile commands that only read as their second word says: `dispatch status`, `columns` or `columns list`. */
const READING_SECOND: Record<string, ReadonlySet<string | undefined>> = {
  dispatch: new Set(['status']),
  types: new Set([undefined, 'list']),
  columns: new Set([undefined, 'list']),
  plan: new Set(['list', 'show']),
  config: new Set(['list', 'get', 'path']),
  hooks: new Set(['list']),
};
/** git that only reads. */
const READING_GIT = /^git\s+(?:status|log|diff|show|rev-parse|merge-base|ls-files|blame|shortlog|describe|worktree\s+list|branch\s+(?:--list|-a|-r|-v|-vv|--show-current|--contains|--merged))(?:\s|$)/;

/** Whether a command is git that only reads, alone. */
export function readsGit(command: string): boolean {
  return PLAIN.test(command) && READING_GIT.test(command) && !/\s--output\b/.test(command);
}

/**
 * Whether a command is the brainfile command line reading, alone: `list`,
 * `show`, `review`, `dispatch status`, `lint` without --fix, `issues`
 * without --import, `pr --status`, any command's --help. Never what changes
 * the board's work or starts one (dispatch, land, discard, run, discuss):
 * those are for the board's tools, which keep to the session's role.
 */
export function readsBoard(command: string): boolean {
  if (!PLAIN.test(command) || !BOARD_COMMAND.test(command)) return false;
  const words = command.split(/\s+/).map((w) => w.replace(/['"]/g, '')).filter(Boolean);
  let rest = words.slice(words[0] === 'npx' ? 2 : 1);
  while (rest[0] === '-g' || rest[0] === '--global') rest = rest.slice(1);
  const has = (flag: string) => rest.some((w) => w === flag || w.startsWith(`${flag}=`));
  if (has('--help') || has('-h') || (rest.length === 1 && (has('--version') || has('-V')))) return true;
  const [name, second] = rest;
  if (!name || name.startsWith('-')) return false;
  if (READING_BOARD.has(name)) return true;
  if (name === 'lint') return !has('--fix');
  if (name === 'issues') return !has('--import');
  if (name === 'pr') return has('--status');
  if (name === 'index') return has('--status');
  if (name === 'template') return has('--list') || has('-l');
  return READING_SECOND[name]?.has(second?.startsWith('-') ? undefined : second) ?? false;
}

/** Whether a command is one a session that writes no code may run unasked: the brainfile command line reading, or git that only reads. */
export function readsOnly(command: string): boolean {
  return readsBoard(command) || readsGit(command);
}

/**
 * How an epic's lead answers an agent that asks before it acts
 * (decision-15): the board's tools, and the brainfile command line and git
 * where they only read, are allowed; an edit, a delete, a move, a change of
 * mode or any other command is refused; reading and searching are asked as
 * usual.
 */
export function leadPermission(title: string, kind?: string | null, rawInput?: unknown): 'allow' | 'refuse' | 'usual' {
  const named = title.trim();
  if (BOARD_TOOL_NAME.test(named)) return 'allow';
  if (kind === 'execute') return readsOnly(commandOf(named, rawInput)) ? 'allow' : 'refuse';
  return kind && REFUSED_KINDS.has(kind) ? 'refuse' : 'usual';
}

/** A mode that only reads: Codex's Read Only. */
const READ_ONLY = /read.?only/i;

/**
 * The mode a session that writes no code runs in: one that only reads when
 * the agent has one; else the one it starts in, its own default, which asks
 * before an edit or a command. Never the mode chosen for hand-offs, which may
 * accept edits unasked, and never the bypass mode, where nothing would be
 * asked and so nothing refused.
 */
export function readOnlyMode(modes: AgentModes): string {
  const readOnly = modes.options.find((m) => READ_ONLY.test(m.id) || READ_ONLY.test(m.name));
  if (readOnly) return readOnly.id;
  if (modes.initial !== modes.bypass) return modes.initial;
  return modes.options.find((m) => m.id !== modes.bypass)?.id ?? modes.initial;
}
