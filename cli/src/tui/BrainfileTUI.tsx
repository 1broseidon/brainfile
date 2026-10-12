/**
 * TUI v3 root.
 *
 * The shell is three fixed pieces — a one-row header + rule, a flexible content
 * region, and a rule + status line + one-row footer — with no borders anywhere
 * (design §1). The content region is either the board list, the board list
 * beside a detail pane (wide), a fullscreen detail (narrow), or an overlay.
 *
 * adr-2 collapsed the old 1/2/3 panel system: there is ONE list. Completed work
 * is the `L` done view, sourced from `logs/` and rendered dim by the same
 * DocumentList and DetailView as everything else (§B2).
 *
 * Filtering runs through core `searchTasksRanked`, so the TUI ranks results the
 * same way `brainfile search` and the MCP `search` tool do, and inherits the
 * full token vocabulary (`p:`, `#`, `@`, `type:`, `contract:`, `due:`).
 *
 * Decisions (task-19) are not work and have no column: the loader lifts them
 * out of the columns and the archive, and they get the decisions view, the
 * type cycle's decision stop (also `D`). The board's graph (core
 * `buildDocGraph`) joins the two: work's detail lists the decisions it rests
 * on, a decision's detail its chain and the open work resting on it, and a
 * row resting on a retired decision says `decision changed`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Task } from '@brainfile/core';
import { buildDocGraph, canonicalTypeName, isTypeAlias, searchTasksRanked, typesMatch } from '@brainfile/core';

import { PALETTE } from './theme.js';
import { CHROME, EMPTY } from './copy.js';
import type { AppState, TUIProps, LayoutMode, BoardColumn } from './types.js';
import { HEADER_ROWS, FOOTER_ROWS, LAYOUT } from './types.js';
import { buildRows, buildFlatRows, markDecisionChanges, type DocRow } from './rows.js';
import {
  NO_RELATIONS,
  boardTypes,
  buildDecisionView,
  filterDecisions,
  isDecisionStop,
  relationsFor,
  workOnRetiredDecisions,
  type DecisionLine,
  type DetailRelations,
} from './decisions.js';
import { useBrainfileLoader } from './hooks/useBrainfileLoader.js';
import { useSyncStatus } from './hooks/useSyncStatus.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { getTaskActivity } from './actions.js';
import { readTuiState } from './tuiState.js';
import { getTypeCycleOptions } from './typeCycle.js';
import {
  HeaderBar,
  FooterBar,
  browseActions,
  detailActions,
  decisionsActions,
  DocumentList,
  DecisionList,
  DetailView,
  computeDetailLayout,
  HelpOverlay,
  StatusMessageDisplay,
  MoveOverlay,
  DeleteConfirmOverlay,
  CompleteConfirmOverlay,
  AddOverlay,
} from './components/index.js';

const baseInitialState: Omit<AppState, 'collapsedIds'> = {
  board: null,
  error: null,
  lastUpdated: new Date(),
  activeColumnIndex: 0,
  selectedTaskIndex: 0,
  mode: 'browse',
  helpReturn: null,
  filterQuery: '',
  activeTypeFilter: 'all',
  doneView: false,
  detailPath: [],
  detailCursor: 0,
  detailScroll: 0,
  moveTargetIndex: 0,
  newTaskTitle: '',
  addThenEdit: false,
  completeConfirm: null,
  statusMessage: null,
  lastContentHash: null,
  reloadFlash: false,
  logs: [],
  decisions: [],
  decisionHistory: false,
  decisionsReturn: null,
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

  // Lazy initializer: view state is read from `.brainfile/state/tui.json` once,
  // at mount, keyed on the (stable-per-session) filePath prop — collapsed rows
  // (§A1) plus the resume view (§C3).
  //
  // The column resumes by ID, resolved after the board loads (the board is null
  // here); only the type filter can be applied immediately, since it needs no
  // board lookup and `activeTypeFilter` already falls back to `all` whenever
  // the stored value is not in the current cycle.
  //
  // Read ONCE, in the state initializer, and stash the column half in a ref
  // from there. `useRef(readTuiState(...).lastColumn)` would re-read the file
  // on every single render — useRef evaluates its argument each time and
  // discards all but the first.
  /** Resume column, applied once on the first board load (§C3). */
  const resumeColumn = useRef<string | undefined>(undefined);

  const [state, setState] = useState<AppState>(() => {
    const persisted = readTuiState(filePath);
    resumeColumn.current = persisted.lastColumn;
    const lastType = persisted.lastTypeFilter;
    return {
      ...baseInitialState,
      collapsedIds: new Set(persisted.collapsed),
      // 'done' was a pseudo-type before the L toggle; never resume into it.
      // An alias resumes as its canonical stop (`adr` → the decision stop).
      activeTypeFilter:
        lastType && lastType !== 'done'
          ? (isTypeAlias(lastType) ? canonicalTypeName(lastType) : lastType)
          : baseInitialState.activeTypeFilter,
    };
  });

  const viewportHeight = Math.max(termHeight - HEADER_ROWS - FOOTER_ROWS, 3);

  const { loadBrainfile } = useBrainfileLoader(filePath, state, setState);
  const syncStatus = useSyncStatus(filePath, state.lastUpdated);

  const orderedColumns = useMemo(() => {
    if (!state.board) return [];
    return [...state.board.columns].sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [state.board]);

  const types = boardTypes(state.board);
  const typeCycleOptions = useMemo(
    () => getTypeCycleOptions(state.board, state.decisions),
    [state.board, state.decisions],
  );
  // The decision stop is always reachable (`D`), even on a board whose cycle
  // has no stop for it yet: it then shows the empty decisions view.
  const activeTypeFilter =
    typeCycleOptions.includes(state.activeTypeFilter) || isDecisionStop(state.activeTypeFilter, types)
      ? state.activeTypeFilter
      : 'all';
  /**
   * Decisions view (task-19): the type cycle's decision stop, or `D`. Not a
   * filter over the columns (decisions have none): the list becomes the
   * board's decisions, grouped by claim-key family, history folded below.
   */
  const decisionsView = isDecisionStop(activeTypeFilter, types);
  const typeFilterActive = activeTypeFilter !== 'all' && !decisionsView;
  /**
   * Done view (`L` toggle): rows come from `logs/`, not from board columns, so
   * the column pipeline (tabs, `h`/`l`, per-column counts) is bypassed.
   * Orthogonal to the type cycle — both compose. Archived docs are
   * read-mostly — no move, no complete. The decisions view has its own
   * history, so there `L` folds that instead and done waits underneath.
   */
  const doneView = state.doneView && !decisionsView;

  /** Type-cycle filter (§A2), applied before search so both compose (AND). */
  const typeFilteredColumns = useMemo<BoardColumn[]>(() => {
    if (!typeFilterActive) return orderedColumns as BoardColumn[];
    return orderedColumns.map((column) => ({
      ...column,
      tasks: (column.tasks ?? []).filter((task) => typesMatch(task.type, activeTypeFilter)),
    })) as BoardColumn[];
  }, [orderedColumns, typeFilterActive, doneView, activeTypeFilter]);

  // Column tab counts reflect the type filter, but not the search filter or
  // collapse (§A1/§A2) — this is the denominator for "x/y match" too. Under
  // `done` the denominator is the archive, which has no columns.
  // In the decisions view, every decision, history included.
  const totalCount = useMemo(() => {
    if (decisionsView) return state.decisions.length;
    if (doneView) {
      return typeFilterActive
        ? state.logs.filter((task) => typesMatch(task.type, activeTypeFilter)).length
        : state.logs.length;
    }
    return typeFilteredColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0);
  }, [typeFilteredColumns, doneView, decisionsView, state.logs, state.decisions]);

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

  /** Archived docs — type-filtered then search-filtered, same as columns. */
  const filteredLogs = useMemo<Task[]>(() => {
    if (!doneView) return [];
    const typed = typeFilterActive
      ? state.logs.filter((task) => typesMatch(task.type, activeTypeFilter))
      : state.logs;
    if (!hasFilter) return typed;
    const docs = typed.map((task) => ({ task, body: task.description ?? '' }));
    return searchTasksRanked(docs, filterQuery).map((match) => match.doc.task);
  }, [doneView, state.logs, typeFilterActive, activeTypeFilter, hasFilter, filterQuery]);

  /** The decisions view's rows: filtered by `/`, then grouped by family. */
  const filteredDecisions = useMemo(
    () => (decisionsView ? filterDecisions(state.decisions, filterQuery) : []),
    [decisionsView, state.decisions, filterQuery],
  );
  const decisionModel = useMemo(
    () => buildDecisionView(filteredDecisions, { historyOpen: state.decisionHistory, types }),
    [filteredDecisions, state.decisionHistory, types],
  );

  const matchCount = useMemo(() => {
    if (decisionsView) return filteredDecisions.length;
    if (doneView) return filteredLogs.length;
    return filteredColumns.reduce((sum, column) => sum + (column.tasks?.length ?? 0), 0);
  }, [filteredColumns, doneView, filteredLogs, decisionsView, filteredDecisions]);

  const allBoardTasks = useMemo(
    () => orderedColumns.flatMap((column) => column.tasks ?? []),
    [orderedColumns],
  );

  /**
   * The board as a graph: open work, every decision, then the archive (core
   * keeps the first copy of an ID). It resolves `decisions:` and computes the
   * reverse, what rests on a decision, which is never written on it.
   */
  const graph = useMemo(
    () => buildDocGraph([...allBoardTasks, ...state.decisions, ...state.logs], { types }),
    [allBoardTasks, state.decisions, state.logs, types],
  );
  /** Open work resting on a superseded, rejected or stale decision: `decision changed`. */
  const decisionChanged = useMemo(() => workOnRetiredDecisions(graph), [graph]);

  const activeColumnIndex = Math.min(
    state.activeColumnIndex,
    Math.max(0, filteredColumns.length - 1),
  );
  const currentColumn = filteredColumns[activeColumnIndex];
  // The decisions view's rows are its decisions only (headings are lines,
  // not stops), so the keyboard hook walks exactly those. `done` is one flat
  // list off `logs/`. Otherwise: under a type filter render flat (§A2) — no
  // pull-up-under-parent, no collapse (there is rarely a visible parent to
  // collapse into) — else the normal hierarchy + collapse list (§A1). Rows
  // resting on a retired decision are flagged for `decision changed`.
  const rows = useMemo<DocRow[]>(() => {
    if (decisionsView) return decisionModel.selectable.map((task) => ({ task, depth: 0 }));
    if (doneView) return buildFlatRows(filteredLogs);
    const tasks = currentColumn?.tasks ?? [];
    return markDecisionChanges(
      typeFilterActive ? buildFlatRows(tasks) : buildRows(tasks, state.collapsedIds),
      decisionChanged,
    );
  }, [currentColumn, doneView, filteredLogs, typeFilterActive, state.collapsedIds, decisionsView, decisionModel, decisionChanged]);
  const maxRowIndex = Math.max(0, rows.length - 1);
  const selectedIndex = Math.min(state.selectedTaskIndex, maxRowIndex);
  const selectedTask: Task | undefined = rows[selectedIndex]?.task;

  /**
   * Every doc detail can resolve, board and archive alike. Drilling into a
   * `done` row must find a doc that lives in no column, so the archive is
   * appended rather than substituted — a breadcrumb can legitimately span both
   * (an archived epic whose children are still active). Decisions live in no
   * column either, and a breadcrumb crosses between them and work.
   */
  const allDocs = useMemo(
    () => [...allBoardTasks, ...state.decisions, ...state.logs],
    [allBoardTasks, state.decisions, state.logs],
  );
  const archivedIds = useMemo(() => new Set(state.logs.map((t) => t.id)), [state.logs]);

  // ── Detail v2 (§B1/§B2): resolve the current drill-down document ─────────
  // Resolved off `detailPath`, not `state.mode === 'detail'`: an overlay
  // (move/delete/complete-confirm) opened *from* the detail view leaves
  // `mode` pointing at the overlay while `detailPath` still names the doc the
  // overlay should act on, which may differ from the list's own selection
  // after a drill-down (§B2 `enter`) or a `p` parent jump.
  const detailTaskId = state.detailPath[state.detailPath.length - 1];
  const detailTask: Task | undefined =
    state.detailPath.length > 0 ? allDocs.find((t) => t.id === detailTaskId) : undefined;
  const detailChildren = useMemo(
    () => (detailTask ? allDocs.filter((t) => t.parentId === detailTask.id) : []),
    [allDocs, detailTask],
  );
  const detailParent = detailTask?.parentId
    ? allDocs.find((t) => t.id === detailTask.parentId)
    : undefined;
  /** A decision's fields, chain and resting work; or the decisions work rests on. */
  const detailRelations = useMemo(
    () => (detailTask ? relationsFor(detailTask, graph) : NO_RELATIONS),
    [detailTask, graph],
  );
  const detailIsDecision = Boolean(detailRelations.decision);
  /**
   * The state line's left half. A board doc names its column; an archived doc
   * has none, so it carries the completion date instead (`· completed 08-12`),
   * sliced MM-DD the same way DetailView slices `createdAt` (§B2).
   */
  const detailColumnLabel = useMemo(() => {
    if (!detailTask) return '';
    // A decision has no column: it says where it stands (current, superseded…).
    if (detailRelations.decision) return detailRelations.decision.status;
    if (archivedIds.has(detailTask.id)) {
      const at = detailTask.completedAt;
      return at ? `completed ${at.slice(5, 10)}` : 'completed';
    }
    return orderedColumns.find((c) => c.tasks?.some((t) => t.id === detailTask.id))?.id ?? '';
  }, [orderedColumns, detailTask, archivedIds, detailRelations]);
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
    ? computeDetailLayout(
        detailTask,
        detailViewWidth,
        detailViewHeight,
        detailChildren,
        detailActivity,
        detailRelations,
      )
    : null;

  // Resume the last session's column, by ID, the first time a board is
  // available. Runs once and then disarms, so it can never fight the user's
  // own column cycling later in the session.
  useEffect(() => {
    const wanted = resumeColumn.current;
    if (!wanted || orderedColumns.length === 0) return;
    resumeColumn.current = undefined;
    const idx = orderedColumns.findIndex((c) => c.id === wanted);
    if (idx > 0) setState((prev) => ({ ...prev, activeColumnIndex: idx }));
  }, [orderedColumns]);

  // Keep the selection in bounds when the board or the filter changes.
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      activeColumnIndex: Math.min(prev.activeColumnIndex, Math.max(0, filteredColumns.length - 1)),
      selectedTaskIndex: Math.min(prev.selectedTaskIndex, maxRowIndex),
    }));
  }, [filteredColumns.length, maxRowIndex]);

  useKeyboardNavigation({
    state: { ...state, activeColumnIndex, selectedTaskIndex: selectedIndex },
    setState,
    rows,
    filteredColumnsLength: filteredColumns.length,
    viewportHeight,
    loadBrainfile,
    filePath,
    allColumns: orderedColumns as BoardColumn[],
    typeCycleOptions,
    detailTask,
    detailChildren,
    detailParent,
    detailActivity,
    detailWidth: detailViewWidth,
    detailHeight: detailViewHeight,
    doneView,
    detailArchived: Boolean(detailTask && archivedIds.has(detailTask.id)),
    decisionsView,
    decisionHistoryCount: decisionModel.historyCount,
    detailRelations,
    detailIsDecision,
  });

  if (isTooSmall) {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingLeft={1}>
        <Text color={PALETTE.error}>{CHROME.tooSmall}</Text>
        <Text color={PALETTE.textMuted}>
          Minimum {LAYOUT.MIN_WIDTH}×{LAYOUT.MIN_HEIGHT} · current {termWidth}×{termHeight}
        </Text>
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text color={PALETTE.error}>{CHROME.errorTitle}</Text>
        <Text color={PALETTE.textSecondary}>{state.error}</Text>
        <Text color={PALETTE.textMuted}>{CHROME.errorHint}</Text>
      </Box>
    );
  }

  if (!state.board) {
    return (
      <Box paddingLeft={1}>
        <Text color={PALETTE.textMuted}>{CHROME.loading}</Text>
      </Box>
    );
  }

  if (state.mode === 'help') {
    return <HelpOverlay termWidth={termWidth} termHeight={termHeight} />;
  }

  const boardTitle = state.board.title || 'brainfile';
  // The state chip and detail state line use the column *id* (`todo`), not its
  // display title — the header tabs already carry the titles (design §4.1/§4.2).
  // Under `done` there is no column, so the chip names the stop itself.
  const columnLabel = decisionsView ? 'decisions' : doneView ? 'done' : (currentColumn?.id ?? '');
  const columnName = currentColumn?.title ?? '';
  const fullscreenDetail = detailOpen && layoutMode === 'narrow';

  // Read-mostly gating (§B2): board mutations are suppressed on archived docs.
  // In the list that means the whole `done` stop; in detail it is per-doc,
  // since a breadcrumb can cross from an archived parent to a live child.
  const detailArchived = Boolean(detailTask && archivedIds.has(detailTask.id));

  const detailFooterCtx = {
    task: detailTask,
    hasParent: Boolean(detailParent),
    hasChildren: detailChildren.length > 0,
    hasSubtasks: (detailTask?.subtasks?.length ?? 0) > 0,
    bodyOverflows: detailLayout?.bodyOverflows ?? false,
    archived: detailArchived,
    decision: detailIsDecision,
    hasLinks: detailRelations.refs.length + detailRelations.resting.length > 0,
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
          relations={detailRelations}
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

  const footerActions = detailOpen
    ? detailActions(detailFooterCtx)
    : decisionsView
      ? decisionsActions({ historyCount: decisionModel.historyCount, historyOpen: state.decisionHistory })
      : browseActions(selectedTask, doneView, state.decisions.length > 0);

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
        // `done` replaces the column tabs (there are none) rather than
        // appending a `· done` suffix to them — one indicator, not two (P9).
        // So does `decisions`: decisions have no columns either.
        panelLabel={decisionsView ? 'decisions' : doneView ? 'done' : undefined}
        activeType={typeFilterActive ? activeTypeFilter : 'all'}
        statusLabel={syncStatus}
      />

      <Box flexGrow={1} flexShrink={0} flexDirection="column">
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
          archived={doneView}
          typeFilter={typeFilterActive ? activeTypeFilter : undefined}
          thenEdit={state.addThenEdit}
          decisionLines={decisionsView ? decisionModel.lines : undefined}
          detailRelations={detailRelations}
        />
      </Box>

      <Box height={1} flexShrink={0}>
        <StatusMessageDisplay message={state.statusMessage} />
      </Box>

      <FooterBar
        width={termWidth}
        itemCount={detailOpen ? undefined : rows.length}
        actions={footerActions}
        stateChip={columnLabel}
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
  archived,
  typeFilter,
  thenEdit,
  decisionLines,
  detailRelations,
}: {
  state: AppState;
  rows: DocRow[];
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
  /** Whole list is archived (`done` view) — rows render dim (§B2). */
  archived: boolean;
  /** Active type-cycle filter, when not `all`. */
  typeFilter?: string;
  thenEdit: boolean;
  /** Set in the decisions view: its lines replace the document list. */
  decisionLines?: DecisionLine[];
  detailRelations: DetailRelations;
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
    return <AddOverlay title={state.newTaskTitle} columnName={columnName} thenEdit={thenEdit} />;
  }

  const list = decisionLines ? (
    <DecisionList
      lines={decisionLines}
      selectedIndex={selectedIndex}
      viewportHeight={viewportHeight}
      width={listWidth}
      emptyMessage={hasFilter ? EMPTY.noMatches : EMPTY.noDecisions}
    />
  ) : (
    <DocumentList
      rows={rows}
      selectedIndex={selectedIndex}
      viewportHeight={viewportHeight}
      width={listWidth}
      archived={archived}
      emptyMessage={
        hasFilter
          ? EMPTY.noMatches
          : archived
            ? EMPTY.nothingCompleted
            : typeFilter
              ? EMPTY.noType(typeFilter)
              : EMPTY.emptyColumn
      }
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
          relations={detailRelations}
        />
      </Box>
    </Box>
  );
}
