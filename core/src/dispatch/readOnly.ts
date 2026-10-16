/**
 * Sessions that write no code (decision-14, decision-15): an epic's lead,
 * and the desktop's board chat and discussions, which build on these. They
 * read the code freely, change the board through `brainfile mcp`, and run
 * only the brainfile command line and git that only reads; an edit or any
 * other command is refused before anyone is asked.
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
/** git that only reads. */
const READING_GIT = /^git\s+(?:status|log|diff|show|rev-parse|merge-base|ls-files|blame|shortlog|describe|worktree\s+list|branch\s+(?:--list|-a|-r|-v|-vv|--show-current|--contains|--merged))(?:\s|$)/;

/** Whether a command is git that only reads, alone. */
export function readsGit(command: string): boolean {
  return PLAIN.test(command) && READING_GIT.test(command) && !/\s--output\b/.test(command);
}

/** Whether a command is one a session that writes no code may run: the brainfile command line, or git that only reads. */
export function readsOnly(command: string): boolean {
  return (PLAIN.test(command) && BOARD_COMMAND.test(command)) || readsGit(command);
}

/**
 * How an epic's lead answers an agent that asks before it acts
 * (decision-15): the board's tools, the brainfile command line and git that
 * only reads are allowed; an edit, a delete, a move, a change of mode or any
 * other command is refused; reading and searching are asked as usual.
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
