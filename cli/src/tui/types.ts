import type { Board, Task } from '@brainfile/core';

export type BoardColumn = Board['columns'][number];

/**
 * Panels reachable from the board. v3 redesigns the board panel only; rules and
 * logs keep their v2 presentation and their `1`/`2`/`3` entry points (the v3
 * header is a single row and has no slot for a panel switcher, and the design
 * spec is silent on whether these views survive — so they are preserved rather
 * than deleted on an inference).
 */
export type MainPanel = 'board' | 'rules' | 'logs';

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

/** Rule categories (rules panel). */
export type RuleType = 'always' | 'never' | 'prefer' | 'context';

export type ViewMode =
  // v3 board modes
  | 'browse'
  | 'detail'
  | 'filter'
  | 'help'
  | 'move'
  | 'complete-confirm'
  | 'add'
  | 'delete-confirm'
  // Rules panel modes (unchanged from v2)
  | 'rule-add'
  | 'rule-edit'
  | 'rule-delete-confirm'
  // Logs panel modes (unchanged from v2)
  | 'logs-restore'
  | 'logs-delete-confirm';

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

  activePanel: MainPanel;

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
  completeConfirm: CompleteConfirmTarget | null;

  statusMessage: StatusMessage | null;
  lastContentHash: string | null;
  reloadFlash: boolean;

  // Rules panel state
  activeRuleType: RuleType;
  selectedRuleIndex: number;
  ruleEditText: string;
  ruleEditId: number | null;

  // Logs panel state
  logs: Task[];
  selectedLogIndex: number;
  logRestoreColumnIndex: number;
  expandedLogIds: Set<string>;
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
