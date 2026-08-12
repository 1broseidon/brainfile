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
import { buildRows, buildFlatRows } from './rows.js';
import { getDocType } from './utils.js';
import { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { loadLogs, getTaskActivity } from './actions.js';
import { readTuiState } from './tuiState.js';
import { getTypeCycleOptions } from './typeCycle.js';
import {
  HeaderBar,
  FooterBar,
  browseActions,
  detailActions,
  DocumentList,
  DetailView,
  computeDetailLayout,
  HelpOverlay,
  StatusMessageDisplay,
  MoveOverlay,
  DeleteConfirmOverlay,
  CompleteConfirmOverlay,
  AddOverlay,
  RulesPanel,
  LogsPanel,
} from './components/index.js';

const baseInitialState: Omit<AppState, 'collapsedIds'> = {
  board: null,
  error: null,
  lastUpdated: new Date(),
  activePanel: 'board',
  activeColumnIndex: 0,
  selectedTaskIndex: 0,
  mode: 'browse',
  filterQuery: '',
  activeTypeFilter: 'all',
  detailPath: [],
  detailCursor: 0,
  detailScroll: 0,
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

  // Lazy initializer: collapsed-row state is read from `.brainfile/state/tui.json`
  // once, at mount, keyed on the (stable-per-session) filePath prop (§A1).
  const [state, setState] = useState<AppState>(() => ({
    ...baseInitialState,
    collapsedIds: new Set(readTuiState(filePath).collapsed),
  }));

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

  const typeCycleOptions = useMemo(() => getTypeCycleOptions(state.board), [state.board]);
  const activeTypeFilter = typeCycleOptions.includes(state.activeTypeFilter)
    ? state.activeTypeFilter
    : 'all';
  const typeFilterActive = activeTypeFilter !== 'all';

  /** Type-cycle filter (§A2), applied before search so both compose (AND). */
  const typeFilteredColumns = useMemo<BoardColumn[]>(() => {
    if (!typeFilterActive) return orderedColumns as BoardColumn[];
    return orderedColumns.map((column) => ({
      ...column,
      tasks: (column.tasks ?? []).filter((task) => getDocType(task) === activeTypeFilter),
    })) as BoardColumn[];
  }, [orderedColumns, typeFilterActive, activeTypeFilter]);

  // Column tab counts reflect the type filter, but not the search filter or
  // collapse (§A1/§A2) — this is the denominator for "x/y match" too.
  const totalCount = useMemo(
    () => typeFilteredColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0),
    [typeFilteredColumns],
  );

  const filterQuery = state.filterQuery.trim();
  const hasFilter = filterQuery.length > 0;

  /**
   * Ranked filter. `searchTasksRanked` wants documents, not board tasks, so the
   * board's in-memory tasks are wrapped; the returned order is the ranking, and
   * we keep it per column.
   */
  const filteredColumns = useMemo<BoardColumn[]>(() => {
    if (!hasFilter) return typeFilteredColumns;
    return typeFilteredColumns.map((column) => {
      const docs = (column.tasks ?? []).map((task) => ({ task, body: task.description ?? '' }));
      const matches = searchTasksRanked(docs, filterQuery);
      return { ...column, tasks: matches.map((match) => match.doc.task) };
    }) as BoardColumn[];
  }, [typeFilteredColumns, hasFilter, filterQuery]);

  const matchCount = useMemo(
    () => filteredColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0),
    [filteredColumns],
  );

  const activeColumnIndex = Math.min(
    state.activeColumnIndex,
    Math.max(0, filteredColumns.length - 1),
  );
  const currentColumn = filteredColumns[activeColumnIndex];
  // Under a type filter, render flat (§A2) — no pull-up-under-parent, no
  // collapse (there is rarely a visible parent to collapse into). Otherwise,
  // the normal hierarchy + collapse-state list (§A1).
  const rows = useMemo(
    () =>
      typeFilterActive
        ? buildFlatRows(currentColumn?.tasks ?? [])
        : buildRows(currentColumn?.tasks ?? [], state.collapsedIds),
    [currentColumn, typeFilterActive, state.collapsedIds],
  );
  const maxRowIndex = Math.max(0, rows.length - 1);
  const selectedIndex = Math.min(state.selectedTaskIndex, maxRowIndex);
  const selectedTask: Task | undefined = rows[selectedIndex]?.task;

  const allBoardTasks = useMemo(
    () => orderedColumns.flatMap((column) => column.tasks ?? []),
    [orderedColumns],
  );

  // ── Detail v2 (§B1/§B2): resolve the current drill-down document ─────────
  // Resolved off `detailPath`, not `state.mode === 'detail'`: an overlay
  // (move/delete/complete-confirm) opened *from* the detail view leaves
  // `mode` pointing at the overlay while `detailPath` still names the doc the
  // overlay should act on, which may differ from the list's own selection
  // after a drill-down (§B2 `enter`) or a `p` parent jump.
  const detailTaskId = state.detailPath[state.detailPath.length - 1];
  const detailTask: Task | undefined =
    state.detailPath.length > 0 ? allBoardTasks.find((t) => t.id === detailTaskId) : undefined;
  const detailChildren = useMemo(
    () => (detailTask ? allBoardTasks.filter((t) => t.parentId === detailTask.id) : []),
    [allBoardTasks, detailTask],
  );
  const detailParent = detailTask?.parentId
    ? allBoardTasks.find((t) => t.id === detailTask.parentId)
    : undefined;
  const detailColumnLabel = useMemo(() => {
    if (!detailTask) return '';
    return orderedColumns.find((c) => c.tasks?.some((t) => t.id === detailTask.id))?.id ?? '';
  }, [orderedColumns, detailTask]);
  // Reads the task file + ledger fresh whenever the doc or the board reloads;
  // best-effort and read-only (getTaskActivity degrades to [] on any failure).
  const detailActivity = useMemo(
    () => (detailTask ? getTaskActivity(filePath, detailTask.id) : []),
    [detailTask, filePath, state.lastUpdated],
  );

  const detailOpen = state.mode === 'detail' && Boolean(detailTask);
  const fullscreenDetailMode = detailOpen && layoutMode === 'narrow';
  const detailPaneWidth = Math.floor(termWidth * LAYOUT.DETAIL_PANE_FRACTION);
  const detailViewWidth = fullscreenDetailMode ? termWidth : detailPaneWidth;
  const detailViewHeight = fullscreenDetailMode ? termHeight - FOOTER_ROWS : viewportHeight;
  const detailLayout = detailTask
    ? computeDetailLayout(detailTask, detailViewWidth, detailViewHeight, detailChildren, detailActivity)
    : null;

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
    allBoardTasks,
    typeCycleOptions,
    detailTask,
    detailChildren,
    detailParent,
    detailActivity,
    detailWidth: detailViewWidth,
    detailHeight: detailViewHeight,
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
  const fullscreenDetail = detailOpen && layoutMode === 'narrow';

  const detailFooterCtx = {
    task: detailTask,
    hasParent: Boolean(detailParent),
    hasChildren: detailChildren.length > 0,
    hasSubtasks: (detailTask?.subtasks?.length ?? 0) > 0,
    bodyOverflows: detailLayout?.bodyOverflows ?? false,
  };

  // Narrow detail replaces the list entirely (design §4.2).
  if (fullscreenDetail && detailTask) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight}>
        <DetailView
          task={detailTask}
          columnLabel={detailColumnLabel}
          width={termWidth}
          height={termHeight - FOOTER_ROWS}
          breadcrumb={state.detailPath}
          parent={detailParent}
          children={detailChildren}
          activity={detailActivity}
          cursor={state.detailCursor}
          scrollOffset={state.detailScroll}
        />
        <Box flexGrow={1} />
        <Box height={1} flexShrink={0}>
          <StatusMessageDisplay message={state.statusMessage} />
        </Box>
        <FooterBar
          width={termWidth}
          actions={detailActions(detailFooterCtx)}
          stateChip={detailColumnLabel}
        />
      </Box>
    );
  }

  const listWidth = detailOpen ? termWidth - detailPaneWidth : termWidth;

  const footerActions = detailOpen ? detailActions(detailFooterCtx) : browseActions(selectedTask);

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
        activeType={activeTypeFilter}
      />

      <Box flexGrow={1} flexShrink={0} flexDirection="column">
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
            detailTask={detailTask}
            detailParent={detailParent}
            detailChildren={detailChildren}
            detailActivity={detailActivity}
            detailColumnLabel={detailColumnLabel}
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

      <Box height={1} flexShrink={0}>
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
  detailTask,
  detailParent,
  detailChildren,
  detailActivity,
  detailColumnLabel,
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
  detailTask: Task | undefined;
  detailParent: Task | undefined;
  detailChildren: Task[];
  detailActivity: ReturnType<typeof getTaskActivity>;
  detailColumnLabel: string;
  columnName: string;
  columns: BoardColumn[];
  termWidth: number;
  hasFilter: boolean;
}) {
  // A move/delete confirm can be opened either from the list (target =
  // list selection) or from the detail view (target = the doc currently
  // drilled into, which may not be the list's selection — §B2 drill-down).
  const overlayTarget = state.detailPath.length > 0 ? detailTask : selectedTask;

  if (state.mode === 'move' && overlayTarget) {
    return (
      <MoveOverlay
        columns={columns}
        selectedIndex={state.moveTargetIndex}
        taskId={overlayTarget.id}
        taskTitle={overlayTarget.title}
        width={termWidth}
      />
    );
  }

  if (state.mode === 'delete-confirm' && overlayTarget) {
    return (
      <DeleteConfirmOverlay
        taskId={overlayTarget.id}
        taskTitle={overlayTarget.title}
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

  if (!detailOpen || !detailTask) return list;

  return (
    // flexShrink={0} down this whole chain: detail v2 can render more lines
    // than the nominal viewport (a doc with children + subtasks + a full
    // contract + activity easily does, in a modest terminal). Letting yoga
    // shrink to fit corrupts the layout — rows silently lose height and their
    // text vanishes — rather than the frame simply growing taller, which ink
    // and real terminals handle fine.
    <Box flexDirection="row" flexGrow={1} flexShrink={0}>
      <Box width={listWidth} flexDirection="column" flexShrink={0}>
        {list}
      </Box>
      <Box width={detailPaneWidth} flexDirection="column" flexShrink={0}>
        <DetailView
          task={detailTask}
          columnLabel={detailColumnLabel}
          width={detailPaneWidth}
          height={viewportHeight}
          breadcrumb={state.detailPath}
          parent={detailParent}
          children={detailChildren}
          activity={detailActivity}
          cursor={state.detailCursor}
          scrollOffset={state.detailScroll}
        />
      </Box>
    </Box>
  );
}
