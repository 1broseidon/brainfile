import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Board } from '@brainfile/core';

import { PALETTE, BOX } from './theme.js';
import type { AppState, TUIProps } from './types.js';
import { HEADER_ROWS, FOOTER_ROWS } from './types.js';
import { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import {
  Header,
  ProgressBar,
  SearchBar,
  ColumnTabs,
  TaskList,
  StatusBar,
  HelpOverlay,
  StatusMessageDisplay,
  MoveOverlay,
  DeleteConfirmOverlay,
  SubtaskOverlay,
  NewTaskOverlay,
} from './components/index.js';

type BoardColumn = Board['columns'][number];

const initialState: AppState = {
  board: null,
  error: null,
  lastUpdated: new Date(),
  activeColumnIndex: 0,
  selectedTaskIndex: 0,
  mode: 'browse',
  searchQuery: '',
  expandedTaskIds: new Set(),
  reloadFlash: false,
  lastContentHash: null,
  statusMessage: null,
  moveTargetIndex: 0,
  selectedSubtaskIndex: 0,
  newTaskTitle: '',
};

// Minimum terminal dimensions
const MIN_WIDTH = 60;
const MIN_HEIGHT = 16;

export function BrainfileTUI({ filePath }: TUIProps) {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? process.stdout.columns ?? 80;
  const termHeight = stdout?.rows ?? process.stdout.rows ?? 24;

  const [state, setState] = useState<AppState>(initialState);

  // Check minimum terminal size
  if (termWidth < MIN_WIDTH || termHeight < MIN_HEIGHT) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={PALETTE.error} bold>Terminal too small</Text>
        <Text color={PALETTE.textSecondary}>
          Minimum size: {MIN_WIDTH}x{MIN_HEIGHT}
        </Text>
        <Text color={PALETTE.textSecondary}>
          Current size: {termWidth}x{termHeight}
        </Text>
        <Box marginTop={1}>
          <Text color={PALETTE.textMuted}>Resize your terminal and restart.</Text>
        </Box>
      </Box>
    );
  }

  const viewportHeight = Math.max(termHeight - HEADER_ROWS - FOOTER_ROWS, 5);

  // Load brainfile and watch for changes
  const { loadBrainfile } = useBrainfileLoader(filePath, state, setState);

  // Sort columns by order property (like VSCode extension)
  const orderedColumns = useMemo(() => {
    if (!state.board) return [];
    return [...state.board.columns].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [state.board]);

  // Filtered columns based on search
  const searchQuery = state.searchQuery.trim().toLowerCase();
  const filteredColumns = useMemo(() => {
    if (!orderedColumns.length) return [];
    if (!searchQuery) return orderedColumns;

    return orderedColumns.map(col => ({
      ...col,
      tasks: col.tasks.filter(task =>
        task.title.toLowerCase().includes(searchQuery) ||
        task.id.toLowerCase().includes(searchQuery) ||
        task.tags?.some(t => t.toLowerCase().includes(searchQuery)) ||
        task.priority?.toLowerCase().includes(searchQuery) ||
        task.description?.toLowerCase().includes(searchQuery)
      ),
    })).filter(col => col.tasks.length > 0);
  }, [orderedColumns, searchQuery]);

  // Check if search has no results
  const hasNoSearchResults = searchQuery.length > 0 && filteredColumns.length === 0;

  // Current column and its tasks
  const currentColumn = filteredColumns[state.activeColumnIndex];
  const currentTasks = currentColumn?.tasks || [];
  const currentTask = currentTasks[state.selectedTaskIndex];
  const maxTaskIndex = Math.max(0, currentTasks.length - 1);

  // Keep selection in bounds
  useEffect(() => {
    setState(prev => ({
      ...prev,
      activeColumnIndex: Math.min(prev.activeColumnIndex, Math.max(0, filteredColumns.length - 1)),
      selectedTaskIndex: Math.min(prev.selectedTaskIndex, maxTaskIndex),
    }));
  }, [filteredColumns.length, maxTaskIndex]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!state.board) return { total: 0, done: 0, percentage: 0 };

    const total = state.board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    const doneCol = state.board.columns.find(col => col.id === 'done' || col.title.toLowerCase() === 'done');
    const done = doneCol?.tasks.length || 0;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, percentage };
  }, [state.board]);

  // Keyboard navigation
  useKeyboardNavigation({
    state,
    setState,
    currentTasks,
    maxTaskIndex,
    filteredColumnsLength: filteredColumns.length,
    viewportHeight,
    loadBrainfile,
    filePath,
    allColumns: orderedColumns,
  });

  // Error state
  if (state.error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={PALETTE.error} bold>Error</Text>
        <Box marginTop={1}>
          <Text color={PALETTE.textSecondary}>{state.error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={PALETTE.textMuted}>Press <Text color={PALETTE.accent}>q</Text> to quit, <Text color={PALETTE.accent}>r</Text> to retry</Text>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (!state.board) {
    return (
      <Box padding={1}>
        <Text color={PALETTE.textMuted}>Loading...</Text>
      </Box>
    );
  }

  // Help overlay
  if (state.mode === 'help') {
    return <HelpOverlay termWidth={termWidth} termHeight={termHeight} />;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Header
        title={state.board.title || 'Brainfile'}
        stats={stats}
        reloadFlash={state.reloadFlash}
      />

      {/* Progress Bar */}
      <ProgressBar done={stats.done} total={stats.total} width={termWidth - 4} />

      {/* Search bar (if active) */}
      {state.mode === 'search' && (
        <SearchBar query={state.searchQuery} width={termWidth - 2} />
      )}

      {/* Column tabs */}
      <ColumnTabs
        columns={filteredColumns}
        activeIndex={state.activeColumnIndex}
        termWidth={termWidth}
      />

      {/* Separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 2))}</Text>
      </Box>

      {/* Task list for active column - takes remaining space */}
      <Box flexGrow={1} flexDirection="column">
        {/* Overlays take precedence over task list */}
        {state.mode === 'move' && currentTask && (
          <MoveOverlay
            columns={orderedColumns}
            selectedIndex={state.moveTargetIndex}
            taskTitle={currentTask.title}
            termWidth={termWidth}
          />
        )}

        {state.mode === 'delete-confirm' && currentTask && (
          <DeleteConfirmOverlay
            taskId={currentTask.id}
            taskTitle={currentTask.title}
            termWidth={termWidth}
          />
        )}

        {state.mode === 'subtask' && currentTask && (
          <SubtaskOverlay
            task={currentTask}
            selectedIndex={state.selectedSubtaskIndex}
            termWidth={termWidth}
          />
        )}

        {state.mode === 'new-task' && (
          <NewTaskOverlay
            title={state.newTaskTitle}
            columnName={currentColumn?.title || 'Unknown'}
            termWidth={termWidth}
          />
        )}

        {/* No search results message */}
        {hasNoSearchResults && (
          <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Text color={PALETTE.textSecondary}>
              No results for "<Text color={PALETTE.text}>{state.searchQuery}</Text>"
            </Text>
            <Text color={PALETTE.textMuted}>Press ESC to clear search</Text>
          </Box>
        )}

        {/* Task list (hidden when overlay is active or no results) */}
        {!hasNoSearchResults && state.mode !== 'move' && state.mode !== 'delete-confirm' && state.mode !== 'subtask' && state.mode !== 'new-task' && (
          <TaskList
            tasks={currentTasks}
            selectedIndex={state.selectedTaskIndex}
            expandedIds={state.expandedTaskIds}
            viewportHeight={viewportHeight - (state.mode === 'search' ? 1 : 0)}
            termWidth={termWidth}
          />
        )}
      </Box>

      {/* Footer separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 2))}</Text>
      </Box>

      {/* Status message (toast) */}
      {state.statusMessage && (
        <StatusMessageDisplay message={state.statusMessage} />
      )}

      {/* Status bar */}
      <StatusBar
        mode={state.mode}
        columnName={currentColumn?.title || ''}
        taskIndex={state.selectedTaskIndex + 1}
        taskCount={currentTasks.length}
        termWidth={termWidth}
      />
    </Box>
  );
}
