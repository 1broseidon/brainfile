import type { Board } from '@brainfile/core';

export type BoardColumn = Board['columns'][number];

export type ViewMode = 'browse' | 'search' | 'help' | 'move' | 'delete-confirm' | 'subtask' | 'new-task';

export interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'info';
  timestamp: number;
}

export interface AppState {
  board: Board | null;
  error: string | null;
  lastUpdated: Date;

  // Navigation
  activeColumnIndex: number;
  selectedTaskIndex: number;

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
}

export interface TUIProps {
  filePath: string;
}

export const HEADER_ROWS = 7; // title(1) + progress(3: padTop+content+padBottom) + tabs(2: marginTop+content) + separator(1)
export const FOOTER_ROWS = 3; // separator + status bar (2 rows: content + bottom padding)
