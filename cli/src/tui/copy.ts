/**
 * User-facing TUI copy.
 *
 * Voice: operator-short, specific verbs, one word per concept.
 * document = any board item · complete = `c` · done = `L` archive view ·
 * filter = `/`. Errors name the failure; the action result supplies why.
 */

export const STATUS = {
  completed: (id: string) => `Completed ${id}`,
  deleted: (id: string) => `Deleted ${id}`,
  moved: (column: string) => `Moved to ${column}`,
  added: (id: string) => `Added ${id}`,
  addedGeneric: 'Added',
  titleRequired: 'Title required',
  completeCancelled: 'Complete cancelled',
  deleteCancelled: 'Delete cancelled',
  readOnly: 'Completed documents are read-only here',
  alreadyCompleted: 'Already completed',
  cannotComplete: (id: string) => `${id} cannot be completed`,
  noDocument: 'No document selected',
  noParent: 'No parent',
  noSubtasks: 'No subtasks',
  reloaded: 'Reloaded',
  toggled: (id: string) => `Toggled ${id}`,
  copied: (id: string) => `Copied ${id}`,
  copyFailed: 'Copy failed',
  editorNeedsTty: '$EDITOR needs an interactive terminal',
  editorFailed: (msg: string) => `Editor failed: ${msg}`,
  completeFailed: 'Could not complete',
  deleteFailed: 'Could not delete',
  moveFailed: 'Could not move',
  addFailed: 'Could not add',
  toggleFailed: 'Could not toggle',
  priorityFailed: 'Could not update priority',
  priorityUpdated: (priority: string) => `Priority: ${priority}`,
  archived: (id: string) => `Archived ${id}`,
  archiving: 'Archiving…',
  archiveFailed: 'Could not archive',
} as const;

export const EMPTY = {
  noMatches: 'No matches · esc to clear',
  nothingCompleted: 'Nothing completed yet · L board',
  emptyColumn: 'No documents in this column · a add',
  noType: (type: string) => `No ${type} documents`,
  noDocuments: 'No documents',
} as const;

export const CHROME = {
  filterAffordance: '/ filter  ? help',
  helpTitle: 'help',
  helpDismiss: 'any key dismisses · q quit',
  tooSmall: 'Terminal too small',
  loading: 'Loading…',
  errorTitle: 'Error',
  errorHint: 'q quit · r retry',
} as const;

export function matchCountLabel(
  matchCount: number,
  totalCount: number,
  query: string,
): string {
  if (!query) return '';
  const word = matchCount === 1 ? 'match' : 'matches';
  return `${matchCount}/${totalCount} ${word} "${query}"`;
}

export function itemCountLabel(n: number): string {
  return `${n} item${n === 1 ? '' : 's'}`;
}

export function incompleteChildrenLabel(n: number): string {
  return `${n} incomplete child task${n === 1 ? '' : 's'}:`;
}
