/**
 * TUI v3 root.
 *
 * The shell is three fixed pieces — a one-row header + rule, a flexible content
 * region, and a rule + status line + one-row footer — with no borders anywhere
 * (design §1). The content region is either the board list, the board list
 * beside a detail pane (wide), a fullscreen detail (narrow), an overlay, or one
 * of the carried-over rules/logs panels.
 *
 * Filtering runs through core `searchTasksRanked`, so the TUI ranks results the
 * same way `brainfile search` and the MCP `search` tool do, and inherits the
 * full token vocabulary (`p:`, `#`, `@`, `type:`, `contract:`, `due:`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Task } from '@brainfile/core';
import { searchTasksRanked } from '@brainfile/core';

import { PALETTE } from './theme.js';
import type { AppState, TUIProps, LayoutMode, BoardColumn } from './types.js';
import { HEADER_ROWS, FOOTER_ROWS, LAYOUT } from './types.js';
import { buildRows } from './rows.js';
import { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { loadLogs } from './actions.js';
import {
  HeaderBar,
  FooterBar,
  browseActions,
  detailActions,
  DocumentList,
  DetailView,
  HelpOverlay,
  StatusMessageDisplay,
  MoveOverlay,
  DeleteConfirmOverlay,
  CompleteConfirmOverlay,
  AddOverlay,
  RulesPanel,
  LogsPanel,
} from './components/index.js';

const initialState: AppState = {
  board: null,
  error: null,
  lastUpdated: new Date(),
  activePanel: 'board',
  activeColumnIndex: 0,
  selectedTaskIndex: 0,
  mode: 'browse',
  filterQuery: '',
  selectedSubtaskIndex: 0,
  moveTargetIndex: 0,
  newTaskTitle: '',
  completeConfirm: null,
  statusMessage: null,
  lastContentHash: null,
  reloadFlash: false,
  activeRuleType: 'always',
  selectedRuleIndex: 0,
  ruleEditText: '',
  ruleEditId: null,
  logs: [],
  selectedLogIndex: 0,
  logRestoreColumnIndex: 0,
  expandedLogIds: new Set(),
};

export function BrainfileTUI({ filePath, width, height }: TUIProps) {
  const { stdout } = useStdout();

  const [dimensions, setDimensions] = useState({
    width: width ?? stdout?.columns ?? process.stdout.columns ?? 80,
    height: height ?? stdout?.rows ?? process.stdout.rows ?? 24,
  });

  useEffect(() => {
    if (width !== undefined && height !== undefined) return undefined;
    const handleResize = () => {
      setDimensions({
        width: width ?? process.stdout.columns ?? 80,
        height: height ?? process.stdout.rows ?? 24,
      });
    };
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, [width, height]);

  const termWidth = width ?? dimensions.width;
  const termHeight = height ?? dimensions.height;
  const isTooSmall = termWidth < LAYOUT.MIN_WIDTH || termHeight < LAYOUT.MIN_HEIGHT;
  const layoutMode: LayoutMode = termWidth >= LAYOUT.DETAIL_PANE_MIN_WIDTH ? 'wide' : 'narrow';

  const [state, setState] = useState<AppState>(initialState);

  const viewportHeight = Math.max(termHeight - HEADER_ROWS - FOOTER_ROWS, 3);

  const { loadBrainfile } = useBrainfileLoader(filePath, state, setState);

  const orderedColumns = useMemo(() => {
    if (!state.board) return [];
    return [...state.board.columns].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [state.board]);

  const totalCount = useMemo(
    () => orderedColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0),
    [orderedColumns],
  );

  const filterQuery = state.filterQuery.trim();
  const hasFilter = filterQuery.length > 0;

  /**
   * Ranked filter. `searchTasksRanked` wants documents, not board tasks, so the
   * board's in-memory tasks are wrapped; the returned order is the ranking, and
   * we keep it per column.
   */
  const filteredColumns = useMemo<BoardColumn[]>(() => {
    if (!hasFilter) return orderedColumns as BoardColumn[];
    return orderedColumns.map((column) => {
      const docs = (column.tasks ?? []).map((task) => ({ task, body: task.description ?? '' }));
      const matches = searchTasksRanked(docs, filterQuery);
      return { ...column, tasks: matches.map((match) => match.doc.task) };
    }) as BoardColumn[];
  }, [orderedColumns, hasFilter, filterQuery]);

  const matchCount = useMemo(
    () => filteredColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0),
    [filteredColumns],
  );

  const activeColumnIndex = Math.min(
    state.activeColumnIndex,
    Math.max(0, filteredColumns.length - 1),
  );
  const currentColumn = filteredColumns[activeColumnIndex];
  const rows = useMemo(() => buildRows(currentColumn?.tasks ?? []), [currentColumn]);
  const maxRowIndex = Math.max(0, rows.length - 1);
  const selectedIndex = Math.min(state.selectedTaskIndex, maxRowIndex);
  const selectedTask: Task | undefined = rows[selectedIndex]?.task;

  const allBoardTasks = useMemo(
    () => orderedColumns.flatMap((column) => column.tasks ?? []),
    [orderedColumns],
  );
  const parentTask = selectedTask?.parentId
    ? allBoardTasks.find((task) => task.id === selectedTask.parentId)
    : undefined;

  // Keep the selection in bounds when the board or the filter changes.
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      activeColumnIndex: Math.min(prev.activeColumnIndex, Math.max(0, filteredColumns.length - 1)),
      selectedTaskIndex: Math.min(prev.selectedTaskIndex, maxRowIndex),
    }));
  }, [filteredColumns.length, maxRowIndex]);

  useEffect(() => {
    if (state.activePanel === 'logs') {
      const result = loadLogs(filePath);
      setState((prev) => ({ ...prev, logs: result.logs }));
    }
  }, [state.activePanel, filePath, state.lastUpdated]);

  useKeyboardNavigation({
    state: { ...state, activeColumnIndex, selectedTaskIndex: selectedIndex },
    setState,
    rows,
    filteredColumnsLength: filteredColumns.length,
    viewportHeight,
    loadBrainfile,
    filePath,
    allColumns: orderedColumns as BoardColumn[],
  });

  if (isTooSmall) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingLeft={1}>
        <Text color={PALETTE.error}>Terminal too small</Text>
        <Text color={PALETTE.textMuted}>
          Minimum {LAYOUT.MIN_WIDTH}x{LAYOUT.MIN_HEIGHT} · current {termWidth}x{termHeight}
        </Text>
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text color={PALETTE.error}>Error</Text>
        <Text color={PALETTE.textSecondary}>{state.error}</Text>
        <Text color={PALETTE.textMuted}>q quit · r retry</Text>
      </Box>
    );
  }

  if (!state.board) {
    return (
      <Box paddingLeft={1}>
        <Text color={PALETTE.textMuted}>Loading…</Text>
      </Box>
    );
  }

  if (state.mode === 'help') {
    return <HelpOverlay termWidth={termWidth} termHeight={termHeight} />;
  }

  const boardTitle = state.board.title || 'brainfile';
  // The state chip and detail state line use the column *id* (`todo`), not its
  // display title — the header tabs already carry the titles (design §4.1/§4.2).
  const columnLabel = currentColumn?.id ?? '';
  const columnName = currentColumn?.title ?? '';
  const detailOpen = state.mode === 'detail' && Boolean(selectedTask);
  const fullscreenDetail = detailOpen && layoutMode === 'narrow';

  // Narrow detail replaces the list entirely (design §4.2).
  if (fullscreenDetail && selectedTask) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <DetailView
          task={selectedTask}
          columnLabel={columnLabel}
          width={termWidth}
          height={termHeight - FOOTER_ROWS}
          selectedSubtaskIndex={state.selectedSubtaskIndex}
          parent={parentTask}
        />
        <Box flexGrow={1} />
        <Box height={1}>
          <StatusMessageDisplay message={state.statusMessage} />
        </Box>
        <FooterBar width={termWidth} actions={detailActions(selectedTask)} stateChip={columnLabel} />
      </Box>
    );
  }

  const detailPaneWidth = Math.floor(termWidth * LAYOUT.DETAIL_PANE_FRACTION);
  const listWidth = detailOpen ? termWidth - detailPaneWidth : termWidth;

  const footerActions = detailOpen
    ? detailActions(selectedTask)
    : browseActions(selectedTask);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <HeaderBar
        title={boardTitle}
        columns={filteredColumns}
        activeColumnIndex={activeColumnIndex}
        width={termWidth}
        filterQuery={state.filterQuery}
        filterActive={state.mode === 'filter' || hasFilter}
        matchCount={matchCount}
        totalCount={totalCount}
        panelLabel={
          state.activePanel === 'rules' ? 'rules' : state.activePanel === 'logs' ? 'logs' : undefined
        }
      />

      <Box flexGrow={1} flexDirection="column">
        {state.activePanel === 'board' ? (
          <BoardContent
            state={state}
            rows={rows}
            selectedIndex={selectedIndex}
            viewportHeight={viewportHeight}
            listWidth={listWidth}
            detailPaneWidth={detailPaneWidth}
            detailOpen={detailOpen}
            selectedTask={selectedTask}
            parentTask={parentTask}
            columnLabel={columnLabel}
            columnName={columnName}
            columns={orderedColumns as BoardColumn[]}
            termWidth={termWidth}
            hasFilter={hasFilter}
          />
        ) : null}

        {state.activePanel === 'rules' ? (
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
        ) : null}

        {state.activePanel === 'logs' ? (
          <LogsPanel
            logs={state.logs}
            selectedIndex={state.selectedLogIndex}
            viewportHeight={viewportHeight}
            termWidth={termWidth}
            expandedIds={state.expandedLogIds}
            mode={state.mode}
            columns={orderedColumns as BoardColumn[]}
            restoreColumnIndex={state.logRestoreColumnIndex}
            layoutMode={layoutMode}
          />
        ) : null}
      </Box>

      <Box height={1}>
        <StatusMessageDisplay message={state.statusMessage} />
      </Box>

      <FooterBar
        width={termWidth}
        itemCount={state.activePanel === 'board' && !detailOpen ? rows.length : undefined}
        actions={
          state.activePanel === 'board'
            ? footerActions
            : ['j/k move', 'a add', 'e edit', 'd delete', '1 board', 'q quit']
        }
        stateChip={state.activePanel === 'board' ? columnLabel : state.activePanel}
      />
    </Box>
  );
}

function BoardContent({
  state,
  rows,
  selectedIndex,
  viewportHeight,
  listWidth,
  detailPaneWidth,
  detailOpen,
  selectedTask,
  parentTask,
  columnLabel,
  columnName,
  columns,
  termWidth,
  hasFilter,
}: {
  state: AppState;
  rows: ReturnType<typeof buildRows>;
  selectedIndex: number;
  viewportHeight: number;
  listWidth: number;
  detailPaneWidth: number;
  detailOpen: boolean;
  selectedTask: Task | undefined;
  parentTask: Task | undefined;
  columnLabel: string;
  columnName: string;
  columns: BoardColumn[];
  termWidth: number;
  hasFilter: boolean;
}) {
  if (state.mode === 'move' && selectedTask) {
    return (
      <MoveOverlay
        columns={columns}
        selectedIndex={state.moveTargetIndex}
        taskId={selectedTask.id}
        taskTitle={selectedTask.title}
        width={termWidth}
      />
    );
  }

  if (state.mode === 'delete-confirm' && selectedTask) {
    return (
      <DeleteConfirmOverlay
        taskId={selectedTask.id}
        taskTitle={selectedTask.title}
        width={termWidth}
      />
    );
  }

  if (state.mode === 'complete-confirm' && state.completeConfirm) {
    return <CompleteConfirmOverlay target={state.completeConfirm} width={termWidth} />;
  }

  if (state.mode === 'add') {
    return <AddOverlay title={state.newTaskTitle} columnName={columnName} />;
  }

  const list = (
    <DocumentList
      rows={rows}
      selectedIndex={selectedIndex}
      viewportHeight={viewportHeight}
      width={listWidth}
      emptyMessage={hasFilter ? 'No matches · esc to clear' : 'No documents in this column'}
    />
  );

  if (!detailOpen || !selectedTask) return list;

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box width={listWidth} flexDirection="column">
        {list}
      </Box>
      <Box width={detailPaneWidth} flexDirection="column">
        <DetailView
          task={selectedTask}
          columnLabel={columnLabel}
          width={detailPaneWidth}
          height={viewportHeight}
          selectedSubtaskIndex={state.selectedSubtaskIndex}
          parent={parentTask}
        />
      </Box>
    </Box>
  );
}
