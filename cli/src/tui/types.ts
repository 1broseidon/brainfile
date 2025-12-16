import type { Board, Task } from '@brainfile/core';

export type BoardColumn = Board['columns'][number];

/** Main panel tabs */
export type MainPanel = 'tasks' | 'rules' | 'archive';

/** Responsive layout mode */
export type LayoutMode = 'wide' | 'narrow';

/** Layout breakpoints */
export const LAYOUT = {
  WIDE_MIN_WIDTH: 80,    // Full tabbed layout
  NARROW_MIN_WIDTH: 50,  // Stacked columns layout
  MIN_HEIGHT: 16,
} as const;

/** Rule categories */
export type RuleType = 'always' | 'never' | 'prefer' | 'context';

export type ViewMode =
  | 'browse'
  | 'search'
  | 'help'
  | 'move'
  | 'delete-confirm'
  | 'subtask'
  | 'new-task'
  // Rules modes
  | 'rule-add'
  | 'rule-edit'
  | 'rule-delete-confirm'
  // Archive modes
  | 'archive-restore'
  | 'archive-delete-confirm';

export interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'info';
  timestamp: number;
}

export interface AppState {
  board: Board | null;
  error: string | null;
  lastUpdated: Date;

  // Main panel (tabs)
  activePanel: MainPanel;

  // Navigation (Tasks panel)
  activeColumnIndex: number;
  selectedTaskIndex: number;
  selectedGlobalIndex: number; // For narrow/stacked layout

  // Modes
  mode: ViewMode;
  searchQuery: string;

  // UI
  expandedTaskIds: Set<string>;
  reloadFlash: boolean;

  // Realtime sync
  lastContentHash: string | null;

  // Status messages
  statusMessage: StatusMessage | null;

  // Move mode: selected column index for move picker
  moveTargetIndex: number;

  // Subtask mode: selected subtask index
  selectedSubtaskIndex: number;

  // New task mode: title input
  newTaskTitle: string;

  // Rules panel state
  activeRuleType: RuleType;
  selectedRuleIndex: number;
  ruleEditText: string;
  ruleEditId: number | null; // null for new rule

  // Archive panel state
  archive: Task[];
  selectedArchiveIndex: number;
  archiveSearchQuery: string;
  archiveRestoreColumnIndex: number;
  expandedArchiveIds: Set<string>;
}

export interface TUIProps {
  filePath: string;
}

export const HEADER_ROWS = 7; // title(1) + progress(3: padTop+content+padBottom) + tabs(2: marginTop+content) + separator(1)
export const FOOTER_ROWS = 4; // separator(1) + status message(1) + status bar(2)
