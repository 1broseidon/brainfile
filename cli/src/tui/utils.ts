import type { Task } from '@brainfile/core';
import { PALETTE } from './theme.js';

// Structured search parsing/filtering lives in core so the CLI, MCP tools, and
// TUI all agree on filter syntax. Re-exported here under the TUI's historical
// names. The v3 board itself filters through core `searchTasksRanked` (which
// parses the same tokens *and* ranks); these unranked helpers stay exported for
// the other CLI surfaces that already consume them.
export {
  parseSearchQuery,
  taskMatchesFilters,
  taskMatchesFilters as taskMatchesFilter,
  searchTasksRanked,
} from '@brainfile/core';

export type { ParsedSearchQuery, ParsedSearchQuery as ParsedSearch } from '@brainfile/core';

export { truncate, safeTruncate, wrapText, pad } from './text.js';
export { getContractStateColor } from './theme.js';

export function getPriorityColor(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return PALETTE.critical;
    case 'high':
      return PALETTE.high;
    case 'medium':
      return PALETTE.medium;
    case 'low':
      return PALETTE.low;
    default:
      return PALETTE.textDim;
  }
}

/** The document's type, normalised. Untyped documents are plain tasks. */
export function getDocType(task: Task): string {
  return (task.type || 'task').toLowerCase();
}

/**
 * `c complete` is only offered for documents that represent work.
 *
 * Design §4.1 states the footer shows the actions valid for the selected
 * document — "an adr never shows `c complete`". An ADR is a record of a
 * decision, not a unit of work, so completing it is meaningless. Every other
 * type (task, epic, spec, plan, custom) stays completable; core's own gate
 * decides whether a *particular* document may actually complete.
 */
export function isCompletable(task: Task | undefined): boolean {
  if (!task) return false;
  return getDocType(task) !== 'adr';
}

/** `2/5`, or undefined when the document has no checklist. */
export function getSubtaskProgress(task: Task): string | undefined {
  const subtasks = task.subtasks ?? [];
  if (subtasks.length === 0) return undefined;
  const done = subtasks.filter((s) => s.completed).length;
  return `${done}/${subtasks.length}`;
}

/** Contract state of a document, if it carries a contract at all. */
export function getContractState(task: Task): string | undefined {
  const contract = task.contract as { status?: string } | undefined;
  return contract?.status;
}
