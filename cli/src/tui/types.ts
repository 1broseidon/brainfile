import type { Board, Task } from '@brainfile/core';

export type BoardColumn = Board['columns'][number];

/** Responsive layout mode. Only the *detail* presentation varies by width. */
export type LayoutMode = 'wide' | 'narrow';

export const LAYOUT = {
  /** ≥ this width, detail is a persistent right pane; below it, fullscreen. */
  DETAIL_PANE_MIN_WIDTH: 110,
  /** Fraction of the terminal the detail pane occupies in wide mode. */
  DETAIL_PANE_FRACTION: 0.45,
  MIN_WIDTH: 50,
  MIN_HEIGHT: 16,
} as const;

/**
 * Every mode the TUI can be in. adr-2 collapsed the 1/2/3 panel system, so the
 * rules- and logs-panel modes are gone; completed work is a stop on the `t`
 * type-cycle rendered by the ordinary list and detail views (§B2).
 */
export type ViewMode =
  | 'browse'
  | 'detail'
  | 'filter'
  | 'help'
  | 'move'
  | 'complete-confirm'
  | 'add'
  | 'delete-confirm';

export interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'info';
  timestamp: number;
}

/** A `c complete` blocked by core's epic-safety gate, awaiting confirmation. */
export interface CompleteConfirmTarget {
  id: string;
  title: string;
  incompleteChildren: Array<{ id: string; title: string }>;
}

export interface AppState {
  board: Board | null;
  error: string | null;
  lastUpdated: Date;

  // Board navigation
  activeColumnIndex: number;
  /** Index into the *rendered row list* (parents and children are both rows). */
  selectedTaskIndex: number;

  mode: ViewMode;
  /** Incremental filter query, fed to core `searchTasksRanked`. */
  filterQuery: string;

  /**
   * Collapsed parent ids (§A1). Persisted to `.brainfile/state/tui.json`;
   * loaded once at mount and kept in sync with the file on every toggle.
   */
  collapsedIds: Set<string>;

  /**
   * Active type-cycle filter (§A2): `'all'` or a document type. Composes with
   * `filterQuery` (AND). In-memory only — not persisted.
   */
  activeTypeFilter: string;

  /**
   * Detail drill-down stack (§B2): document ids, root first, current last.
   * Empty outside detail mode. `enter` on a child stop pushes; `esc` pops one
   * level (or leaves detail mode entirely from the root).
   */
  detailPath: string[];
  /** Flat-cursor index across the current detail doc's children then subtasks. */
  detailCursor: number;
  /** Body scroll offset (lines), cursor-independent (§B2). */
  detailScroll: number;

  // Overlay state
  moveTargetIndex: number;
  newTaskTitle: string;
  /**
   * The add overlay was opened by `N` rather than `a`: on submit, hand the
   * newly created document straight to `$EDITOR` (§C1). A title is still
   * required first, so aborting the editor cannot leave an untitled stray.
   */
  addThenEdit: boolean;
  completeConfirm: CompleteConfirmTarget | null;

  statusMessage: StatusMessage | null;
  lastContentHash: string | null;
  reloadFlash: boolean;

  /**
   * Documents read from `logs/` for the `done` type-cycle stop (§B2). Refreshed
   * by the loader alongside the board, since chokidar already watches logsDir.
   */
  logs: Task[];
}

export interface TUIProps {
  filePath: string;
  /**
   * Terminal dimension overrides. Present so render tests can pin a width and
   * height deterministically — ink-testing-library's fake stdout hardcodes
   * `columns = 100` and exposes no `rows`, which cannot produce a controlled
   * wide (≥110) or narrow frame on its own.
   */
  width?: number;
  height?: number;
}

/** header row + rule */
export const HEADER_ROWS = 2;
/** rule + status-message line + footer row */
export const FOOTER_ROWS = 3;
