import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Board } from '@brainfile/core';

import { PALETTE, BOX } from './theme.js';
import type { AppState, TUIProps, LayoutMode } from './types.js';
import { HEADER_ROWS, FOOTER_ROWS, LAYOUT } from './types.js';
import { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { parseSearchQuery, taskMatchesFilter } from './utils.js';
import { loadArchive } from './actions.js';
import {
  Header,
  ProgressBar,
  SearchBar,
  ColumnTabs,
  TaskList,
  StackedTaskList,
  flattenTasks,
  StatusBar,
  HelpOverlay,
  StatusMessageDisplay,
  MoveOverlay,
  DeleteConfirmOverlay,
  SubtaskOverlay,
  NewTaskOverlay,
  MainPanelTabs,
  RulesPanel,
  ArchivePanel,
} from './components/index.js';

type BoardColumn = Board['columns'][number];

const initialState: AppState = {
  board: null,
  error: null,
  lastUpdated: new Date(),
  activePanel: 'tasks',
  activeColumnIndex: 0,
  selectedTaskIndex: 0,
  selectedGlobalIndex: 0,
  mode: 'browse',
  searchQuery: '',
  expandedTaskIds: new Set(),
  reloadFlash: false,
  lastContentHash: null,
  statusMessage: null,
  moveTargetIndex: 0,
  selectedSubtaskIndex: 0,
  newTaskTitle: '',
  // Rules panel
  activeRuleType: 'always',
  selectedRuleIndex: 0,
  ruleEditText: '',
  ruleEditId: null,
  // Archive panel
  archive: [],
  selectedArchiveIndex: 0,
  archiveSearchQuery: '',
  archiveRestoreColumnIndex: 0,
  expandedArchiveIds: new Set(),
};

export function BrainfileTUI({ filePath }: TUIProps) {
  const { stdout } = useStdout();

  // Track terminal dimensions with resize listener
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns ?? process.stdout.columns ?? 80,
    height: stdout?.rows ?? process.stdout.rows ?? 24,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: process.stdout.columns ?? 80,
        height: process.stdout.rows ?? 24,
      });
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  const termWidth = dimensions.width;
  const termHeight = dimensions.height;
  const isTooSmall = termWidth < LAYOUT.NARROW_MIN_WIDTH || termHeight < LAYOUT.MIN_HEIGHT;

  // Determine layout mode based on width
  const layoutMode: LayoutMode = termWidth >= LAYOUT.WIDE_MIN_WIDTH ? 'wide' : 'narrow';

  const [state, setState] = useState<AppState>(initialState);

  const viewportHeight = Math.max(termHeight - HEADER_ROWS - FOOTER_ROWS, 5);
  // Height available for task lists after accounting for in-panel UI (search bar, column tabs + separator)
  const searchBarRows = state.mode === 'search'
    ? (state.searchQuery.trim().length === 0 ? 2 : 1)
    : 0;
  const columnHeaderRows = layoutMode === 'wide' ? 3 : 0; // ColumnTabs (2) + separator (1)
  const tasksViewportHeight = Math.max(1, viewportHeight - searchBarRows - columnHeaderRows);

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

  // Filtered columns based on search with structured filters
  const searchQuery = state.searchQuery.trim();
  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  const hasActiveFilter = searchQuery.length > 0;

  const filteredColumns = useMemo(() => {
    if (!orderedColumns.length) return [];
    if (!hasActiveFilter) return orderedColumns;

    return orderedColumns.map(col => ({
      ...col,
      tasks: col.tasks.filter(task => taskMatchesFilter(task, parsedSearch)),
    })).filter(col => col.tasks.length > 0);
  }, [orderedColumns, hasActiveFilter, parsedSearch]);

  // Check if search has no results
  const hasNoSearchResults = hasActiveFilter && filteredColumns.length === 0;

  // Flatten tasks for narrow mode
  const flatTasks = useMemo(() => flattenTasks(filteredColumns), [filteredColumns]);
  const maxGlobalIndex = Math.max(0, flatTasks.length - 1);

  // Current column and its tasks (wide mode)
  const currentColumn = filteredColumns[state.activeColumnIndex];
  const currentTasks = currentColumn?.tasks || [];
  const currentTask = layoutMode === 'wide'
    ? currentTasks[state.selectedTaskIndex]
    : flatTasks[state.selectedGlobalIndex]?.task;
  const maxTaskIndex = Math.max(0, currentTasks.length - 1);

  // Keep selection in bounds
  useEffect(() => {
    setState(prev => ({
      ...prev,
      activeColumnIndex: Math.min(prev.activeColumnIndex, Math.max(0, filteredColumns.length - 1)),
      selectedTaskIndex: Math.min(prev.selectedTaskIndex, maxTaskIndex),
      selectedGlobalIndex: Math.min(prev.selectedGlobalIndex, maxGlobalIndex),
    }));
  }, [filteredColumns.length, maxTaskIndex, maxGlobalIndex]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!state.board) return { total: 0, done: 0, percentage: 0 };

    const total = state.board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    const doneCol = state.board.columns.find(col => col.id === 'done' || col.title.toLowerCase() === 'done');
    const done = doneCol?.tasks.length || 0;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, percentage };
  }, [state.board]);

  // Calculate rules count
  const rulesCount = useMemo(() => {
    if (!state.board?.rules) return 0;
    const r = state.board.rules;
    return (r.always?.length || 0) + (r.never?.length || 0) + (r.prefer?.length || 0) + (r.context?.length || 0);
  }, [state.board?.rules]);

  // Load archive when switching to archive panel
  useEffect(() => {
    if (state.activePanel === 'archive') {
      const result = loadArchive(filePath);
      setState(prev => ({ ...prev, archive: result.archive }));
    }
  }, [state.activePanel, filePath, state.lastUpdated]);

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
    layoutMode,
    flatTasks,
    maxGlobalIndex,
  });

  // Check minimum terminal size (after all hooks)
  if (isTooSmall) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} justifyContent="center" alignItems="center">
        <Text color={PALETTE.error} bold>Terminal too small</Text>
        <Text color={PALETTE.textSecondary}>
          Minimum: {LAYOUT.NARROW_MIN_WIDTH}x{LAYOUT.MIN_HEIGHT} · Current: {termWidth}x{termHeight}
        </Text>
        <Box marginTop={1}>
          <Text color={PALETTE.textMuted}>Resize terminal to continue</Text>
        </Box>
      </Box>
    );
  }

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
    return <HelpOverlay termWidth={termWidth} termHeight={termHeight} layoutMode={layoutMode} />;
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Header
        title={state.board.title || 'Brainfile'}
        stats={stats}
        reloadFlash={state.reloadFlash}
        layoutMode={layoutMode}
        termWidth={termWidth}
      />

      {/* Progress Bar (wide mode only - narrow mode shows % in header) */}
      {layoutMode === 'wide' && (
        <ProgressBar done={stats.done} total={stats.total} width={termWidth - 4} />
      )}

      {/* Main Panel Tabs (Tasks / Rules / Archive) */}
      <MainPanelTabs
        activePanel={state.activePanel}
        rulesCount={rulesCount}
        archiveCount={state.archive.length}
        layoutMode={layoutMode}
      />

      {/* Separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 2))}</Text>
      </Box>

      {/* Panel content */}
      <Box flexGrow={1} flexDirection="column">
        {/* ===== TASKS PANEL ===== */}
        {state.activePanel === 'tasks' && (
          <>
            {/* Search bar (if active) */}
            {state.mode === 'search' && (
              <SearchBar query={state.searchQuery} width={termWidth - 2} />
            )}

            {/* Column tabs (wide mode only) */}
            {layoutMode === 'wide' && (
              <>
                <ColumnTabs
                  columns={filteredColumns}
                  activeIndex={state.activeColumnIndex}
                  termWidth={termWidth}
                />
              <Box paddingLeft={1}>
                <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 2))}</Text>
              </Box>
            </>
          )}

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
              layoutMode === 'wide' ? (
                <TaskList
                  tasks={currentTasks}
                  selectedIndex={state.selectedTaskIndex}
                  expandedIds={state.expandedTaskIds}
                  viewportHeight={tasksViewportHeight}
                  termWidth={termWidth}
                />
              ) : (
                <StackedTaskList
                  columns={filteredColumns}
                  selectedGlobalIndex={state.selectedGlobalIndex}
                  expandedIds={state.expandedTaskIds}
                  viewportHeight={tasksViewportHeight}
                  termWidth={termWidth}
                />
              )
            )}
          </>
        )}

        {/* ===== RULES PANEL ===== */}
        {state.activePanel === 'rules' && (
          <RulesPanel
            rules={state.board.rules}
            activeRuleType={state.activeRuleType}
            selectedRuleIndex={state.selectedRuleIndex}
            viewportHeight={viewportHeight}
            termWidth={termWidth}
            mode={state.mode}
            editText={state.ruleEditText}
            layoutMode={layoutMode}
          />
        )}

        {/* ===== ARCHIVE PANEL ===== */}
        {state.activePanel === 'archive' && (
          <ArchivePanel
            archive={state.archive}
            selectedIndex={state.selectedArchiveIndex}
            viewportHeight={viewportHeight}
            termWidth={termWidth}
            expandedIds={state.expandedArchiveIds}
            mode={state.mode}
            columns={orderedColumns}
            restoreColumnIndex={state.archiveRestoreColumnIndex}
            layoutMode={layoutMode}
          />
        )}
      </Box>

      {/* Footer separator */}
      <Box paddingLeft={1}>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 2))}</Text>
      </Box>

      {/* Status message (toast) - always reserve space to prevent layout shift */}
      <Box height={1}>
        {state.statusMessage && (
          <StatusMessageDisplay message={state.statusMessage} />
        )}
      </Box>

      {/* Status bar */}
      <StatusBar
        mode={state.mode}
        columnName={state.activePanel === 'tasks'
          ? (layoutMode === 'wide' ? (currentColumn?.title || '') : 'ALL')
          : state.activePanel}
        taskIndex={state.activePanel === 'tasks'
          ? (layoutMode === 'wide' ? state.selectedTaskIndex + 1 : state.selectedGlobalIndex + 1)
          : (state.activePanel === 'archive' ? state.selectedArchiveIndex + 1 : state.selectedRuleIndex + 1)}
        taskCount={state.activePanel === 'tasks'
          ? (layoutMode === 'wide' ? currentTasks.length : flatTasks.length)
          : (state.activePanel === 'archive' ? state.archive.length : (state.board.rules?.[state.activeRuleType]?.length || 0))}
        termWidth={termWidth}
        activePanel={state.activePanel}
        layoutMode={layoutMode}
      />
    </Box>
  );
}
