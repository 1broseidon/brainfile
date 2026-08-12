/**
 * v3 keyboard model.
 *
 * The required set (design §5) is: j/k move · tab and [ ] column cycle ·
 * ↵ detail · esc back/clear · / filter · m move · c complete · a add ·
 * space toggle subtask (in detail) · ? help · q quit. Existing binds that
 * predate v3 (g/G, ctrl-d/ctrl-u, arrows, h/l, e, p, d, y, r, n, A, 1/2/3) are
 * preserved, per §5's "preserve existing keybinds where they exist".
 *
 * The mode set shrank: `subtask` is gone (space toggles inline in detail) and
 * `search` became `filter`; `detail` and `complete-confirm` are new.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useInput, useApp } from 'ink';
import type { AppState, StatusMessage, BoardColumn, RuleType, ViewMode } from '../types.js';
import type { Task } from '@brainfile/core';
import type { DocRow } from '../rows.js';
import { isCompletable } from '../utils.js';
import { buildDetailStops, clampDetailCursor } from '../detailStops.js';
import { computeDetailLayout } from '../components/DetailView.js';
import { writeTuiState } from '../tuiState.js';
import {
  editTaskInEditor,
  moveTaskAction,
  deleteTaskAction,
  archiveTaskAction,
  archiveTaskActionAsync,
  cyclePriorityAction,
  toggleSubtaskAction,
  copyToClipboard,
  addTaskAction,
  newTaskInEditor,
  addRuleAction,
  updateRuleAction,
  deleteRuleAction,
  restoreTaskAction,
  deleteArchivedTaskAction,
  loadLogs,
  type ActivityEntry,
} from '../actions.js';

const RULE_TYPES: RuleType[] = ['always', 'never', 'prefer', 'context'];

interface UseKeyboardNavigationProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  rows: DocRow[];
  filteredColumnsLength: number;
  viewportHeight: number;
  loadBrainfile: (forceRefresh?: boolean) => void;
  filePath: string;
  allColumns: BoardColumn[];
  /** Every task on the board, unfiltered — for parent/child lookups (§B1/§B2). */
  allBoardTasks: Task[];
  /** `t`-cycle options for the current board (§A2), `'all'` first. */
  typeCycleOptions: string[];
  /** The document currently drilled into in the detail view, if any (§B2). */
  detailTask: Task | undefined;
  detailChildren: Task[];
  detailParent: Task | undefined;
  detailActivity: ActivityEntry[];
  /** Same width/height `DetailView` renders with, so scroll math agrees (§B2). */
  detailWidth: number;
  detailHeight: number;
}

/** How long a status toast stays on screen. */
const STATUS_MESSAGE_MS = 3000;

export function useKeyboardNavigation({
  state,
  setState,
  rows,
  filteredColumnsLength,
  viewportHeight,
  loadBrainfile,
  filePath,
  allColumns,
  allBoardTasks,
  typeCycleOptions,
  detailTask,
  detailChildren,
  detailParent,
  detailActivity,
  detailWidth,
  detailHeight,
}: UseKeyboardNavigationProps) {
  const { exit } = useApp();

  /**
   * Status toasts expire on a timer. Track them so unmounting cancels the
   * pending expiry instead of leaving a timer that wakes up to set state on a
   * component that no longer exists (and keeps the process alive under Jest).
   */
  const statusTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(
    () => () => {
      for (const timer of statusTimers.current) clearTimeout(timer);
      statusTimers.current.clear();
    },
    [],
  );

  const showStatus = useCallback(
    (text: string, type: StatusMessage['type']) => {
      const timestamp = Date.now();
      setState((prev) => ({ ...prev, statusMessage: { text, type, timestamp } }));
      const timer = setTimeout(() => {
        statusTimers.current.delete(timer);
        setState((prev) =>
          prev.statusMessage?.timestamp === timestamp ? { ...prev, statusMessage: null } : prev,
        );
      }, STATUS_MESSAGE_MS);
      statusTimers.current.add(timer);
    },
    [setState],
  );

  const currentTask: Task | undefined = rows[state.selectedTaskIndex]?.task;
  const maxRowIndex = Math.max(0, rows.length - 1);

  // An overlay (move / delete / complete-confirm) opened from the detail view
  // targets the drilled-into doc, not the list's own selection — they can
  // differ after `enter` on a child stop or a `p` parent jump (§B2).
  const overlayTarget: Task | undefined = state.detailPath.length > 0 ? detailTask : currentTask;

  const setMode = (mode: ViewMode, extra: Partial<AppState> = {}) =>
    setState((prev) => ({ ...prev, mode, ...extra }));

  /**
   * Return from a move/delete/complete-confirm overlay: resume the detail
   * view it was opened from, unless the action removed the doc that detail
   * was showing (delete, or a completion that went through) — in that case
   * there is nothing left to resume, so fall back to the list.
   */
  const closeOverlay = (opts: { docRemoved?: boolean } = {}) => {
    const clearDetail = opts.docRemoved || state.detailPath.length === 0;
    setState((prev) => ({
      ...prev,
      mode: clearDetail ? 'browse' : 'detail',
      detailPath: clearDetail ? [] : prev.detailPath,
      completeConfirm: null,
    }));
  };

  /**
   * `c complete`. Core refuses to complete an epic with active children unless
   * forced; that refusal comes back with the blocking children attached, which
   * becomes the confirmation prompt.
   */
  const completeTask = (task: Task, force: boolean) => {
    const result = archiveTaskAction(filePath, task.id, { force });
    if (result.success) {
      showStatus(result.message || `Completed ${task.id}`, 'success');
      closeOverlay({ docRemoved: true });
      loadBrainfile(true);
      return;
    }
    if (!force && result.incompleteChildren?.length) {
      setMode('complete-confirm', {
        completeConfirm: {
          id: task.id,
          title: task.title,
          incompleteChildren: result.incompleteChildren,
        },
      });
      return;
    }
    showStatus(result.error || 'Failed to complete', 'error');
    closeOverlay();
  };

  useInput((input, key) => {
    // ── Help: any key dismisses (and is consumed) ─────────────────────────
    if (state.mode === 'help') {
      setMode('browse');
      return;
    }

    // ── Complete confirmation ─────────────────────────────────────────────
    if (state.mode === 'complete-confirm') {
      if (input === 'y' || input === 'Y') {
        const target = state.completeConfirm;
        if (target) {
          const result = archiveTaskAction(filePath, target.id, { force: true });
          if (result.success) {
            showStatus(result.message || `Completed ${target.id}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(result.error || 'Failed to complete', 'error');
          }
        }
        closeOverlay({ docRemoved: true });
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        closeOverlay();
        showStatus('Complete cancelled', 'info');
      }
      return;
    }

    // ── Delete confirmation ───────────────────────────────────────────────
    if (state.mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        if (overlayTarget) {
          const result = deleteTaskAction(filePath, overlayTarget.id);
          if (result.success) {
            showStatus(`Deleted ${overlayTarget.id}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(result.error || 'Failed to delete', 'error');
          }
        }
        closeOverlay({ docRemoved: true });
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        closeOverlay();
        showStatus('Delete cancelled', 'info');
      }
      return;
    }

    // ── Move (column picker) ──────────────────────────────────────────────
    if (state.mode === 'move') {
      if (key.escape) {
        closeOverlay();
        return;
      }
      if (key.upArrow || key.leftArrow || input === 'k' || input === 'h') {
        setState((prev) => ({ ...prev, moveTargetIndex: Math.max(0, prev.moveTargetIndex - 1) }));
        return;
      }
      if (key.downArrow || key.rightArrow || input === 'j' || input === 'l') {
        setState((prev) => ({
          ...prev,
          moveTargetIndex: Math.min(allColumns.length - 1, prev.moveTargetIndex + 1),
        }));
        return;
      }
      if (key.return) {
        const targetColumn = allColumns[state.moveTargetIndex];
        if (overlayTarget && targetColumn) {
          const result = moveTaskAction(filePath, overlayTarget.id, targetColumn.id);
          if (result.success) {
            showStatus(result.message || `Moved to ${targetColumn.title}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(result.error || 'Failed to move', 'error');
          }
        }
        closeOverlay();
        return;
      }
      const num = Number.parseInt(input, 10);
      if (num >= 1 && num <= allColumns.length) {
        setState((prev) => ({ ...prev, moveTargetIndex: num - 1 }));
      }
      return;
    }

    // ── Quick add (title only) ────────────────────────────────────────────
    if (state.mode === 'add') {
      if (key.escape) {
        setMode('browse', { newTaskTitle: '' });
        return;
      }
      if (key.return) {
        const title = state.newTaskTitle.trim();
        if (title) {
          const column = allColumns[state.activeColumnIndex];
          if (column) {
            const result = addTaskAction(filePath, column.id, { title });
            if (result.success) {
              showStatus(result.message || 'Task added', 'success');
              loadBrainfile(true);
            } else {
              showStatus(result.error || 'Failed to add task', 'error');
            }
          }
        } else {
          showStatus('Title required', 'error');
        }
        setMode('browse', { newTaskTitle: '' });
        return;
      }
      if (key.backspace || key.delete) {
        setState((prev) => ({ ...prev, newTaskTitle: prev.newTaskTitle.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState((prev) => ({ ...prev, newTaskTitle: prev.newTaskTitle + input }));
      }
      return;
    }

    // ── Incremental filter ────────────────────────────────────────────────
    if (state.mode === 'filter') {
      if (key.escape) {
        setMode('browse', { filterQuery: '', selectedTaskIndex: 0 });
        return;
      }
      if (key.return) {
        setMode('browse');
        return;
      }
      if (key.backspace || key.delete) {
        setState((prev) => ({
          ...prev,
          filterQuery: prev.filterQuery.slice(0, -1),
          selectedTaskIndex: 0,
        }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState((prev) => ({
          ...prev,
          filterQuery: prev.filterQuery + input,
          selectedTaskIndex: 0,
        }));
      }
      return;
    }

    // ── Detail v2 (§B2 — the flat-cursor, locked decision) ────────────────
    if (state.mode === 'detail') {
      // `detailStops.ts` is the single source of truth for what the cursor is
      // on — children first, then subtasks — shared with `DetailView`'s render
      // so the two can never disagree about what `enter`/`space` act on.
      const stops = detailTask ? buildDetailStops(detailTask, detailChildren) : [];
      const cursor = clampDetailCursor(state.detailCursor, stops.length);
      const stop = stops[cursor];
      const layout = detailTask
        ? computeDetailLayout(detailTask, detailWidth, detailHeight, detailChildren, detailActivity)
        : null;

      if (input === 'q') {
        exit();
        return;
      }
      // `esc` pops one breadcrumb level; from the root, it returns to the list.
      if (key.escape) {
        if (state.detailPath.length > 1) {
          setState((prev) => ({
            ...prev,
            detailPath: prev.detailPath.slice(0, -1),
            detailCursor: 0,
            detailScroll: 0,
          }));
        } else {
          setMode('browse', { detailPath: [] });
        }
        return;
      }
      if (input === '?') {
        setMode('help');
        return;
      }

      // Body scroll is cursor-independent: half the visible height, never
      // triggered by j/k (predictability over cleverness — §B2).
      if (input === 'd') {
        if (layout) {
          const maxScroll = Math.max(0, layout.bodyLines.length - layout.bodyBudget);
          const step = Math.max(1, Math.floor(layout.bodyBudget / 2));
          setState((prev) => ({
            ...prev,
            detailScroll: Math.min(maxScroll, prev.detailScroll + step),
          }));
        }
        return;
      }
      if (input === 'u') {
        if (layout) {
          const step = Math.max(1, Math.floor(layout.bodyBudget / 2));
          setState((prev) => ({ ...prev, detailScroll: Math.max(0, prev.detailScroll - step) }));
        }
        return;
      }

      // Flat cursor: every child row, then every subtask row.
      if (key.downArrow || input === 'j') {
        setState((prev) => ({
          ...prev,
          detailCursor: Math.min(clampDetailCursor(prev.detailCursor, stops.length) + 1, Math.max(0, stops.length - 1)),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState((prev) => ({
          ...prev,
          detailCursor: Math.max(0, clampDetailCursor(prev.detailCursor, stops.length) - 1),
        }));
        return;
      }

      // `enter` on a child stop drills in; the breadcrumb grows.
      if (key.return) {
        if (stop?.kind === 'child') {
          setState((prev) => ({
            ...prev,
            detailPath: [...prev.detailPath, stop.task.id],
            detailCursor: 0,
            detailScroll: 0,
          }));
        }
        return;
      }

      // `space` toggles the subtask under the cursor (existing action wiring).
      if (input === ' ') {
        if (stop?.kind === 'subtask' && detailTask) {
          const result = toggleSubtaskAction(filePath, detailTask.id, stop.subtask.id);
          if (result.success) {
            showStatus(`Toggled ${stop.subtask.id}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(result.error || 'Failed to toggle', 'error');
          }
        } else {
          showStatus('No subtasks', 'info');
        }
        return;
      }

      // `p` jumps to the parent's detail, when one exists.
      if (input === 'p') {
        if (!detailTask?.parentId || !detailParent) {
          showStatus('No parent', 'info');
          return;
        }
        const parentId = detailParent.id;
        setState((prev) => {
          const stack = prev.detailPath;
          const nextPath =
            stack.length > 1 && stack[stack.length - 2] === parentId
              ? stack.slice(0, -1)
              : [...stack.slice(0, -1), parentId];
          return { ...prev, detailPath: nextPath, detailCursor: 0, detailScroll: 0 };
        });
        return;
      }

      if (input === 'm' && detailTask) {
        setState((prev) => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
        return;
      }
      if (input === 'c' && detailTask && isCompletable(detailTask)) {
        completeTask(detailTask, false);
        return;
      }
      if (input === 'e' && detailTask) {
        const result = editTaskInEditor(filePath, detailTask.id);
        if (result.success) {
          showStatus(result.message || 'Task updated', 'success');
          loadBrainfile(true);
        } else {
          showStatus(result.error || 'Edit failed', 'error');
        }
        return;
      }
      return;
    }

    // ── Rules panel modal modes (carried over unchanged) ──────────────────
    if (state.mode === 'rule-add' || state.mode === 'rule-edit') {
      if (key.escape) {
        setMode('browse', { ruleEditText: '', ruleEditId: null });
        return;
      }
      if (key.return) {
        const text = state.ruleEditText.trim();
        if (!text) {
          showStatus('Rule text required', 'error');
          return;
        }
        const result =
          state.mode === 'rule-add'
            ? addRuleAction(filePath, state.activeRuleType, text)
            : state.ruleEditId !== null
              ? updateRuleAction(filePath, state.activeRuleType, state.ruleEditId, text)
              : { success: false, error: 'No rule selected' };
        if (result.success) {
          showStatus(result.message || 'Rule saved', 'success');
          loadBrainfile(true);
        } else {
          showStatus(result.error || 'Failed to save rule', 'error');
        }
        setMode('browse', { ruleEditText: '', ruleEditId: null });
        return;
      }
      if (key.backspace || key.delete) {
        setState((prev) => ({ ...prev, ruleEditText: prev.ruleEditText.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState((prev) => ({ ...prev, ruleEditText: prev.ruleEditText + input }));
      }
      return;
    }

    if (state.mode === 'rule-delete-confirm') {
      const rules = state.board?.rules?.[state.activeRuleType] || [];
      const rule = rules[state.selectedRuleIndex];
      if (input === 'y' || input === 'Y') {
        if (rule) {
          const result = deleteRuleAction(filePath, state.activeRuleType, rule.id);
          if (result.success) {
            showStatus(result.message || 'Rule deleted', 'success');
            loadBrainfile(true);
            setState((prev) => ({
              ...prev,
              mode: 'browse',
              selectedRuleIndex: Math.max(0, prev.selectedRuleIndex - 1),
            }));
            return;
          }
          showStatus(result.error || 'Failed to delete rule', 'error');
        }
        setMode('browse');
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('browse');
        showStatus('Delete cancelled', 'info');
      }
      return;
    }

    // ── Logs panel modal modes (carried over unchanged) ───────────────────
    if (state.mode === 'logs-restore') {
      if (key.escape) {
        setMode('browse');
        return;
      }
      if (key.downArrow || input === 'j') {
        setState((prev) => ({
          ...prev,
          logRestoreColumnIndex: Math.min(prev.logRestoreColumnIndex + 1, allColumns.length - 1),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState((prev) => ({
          ...prev,
          logRestoreColumnIndex: Math.max(prev.logRestoreColumnIndex - 1, 0),
        }));
        return;
      }
      if (key.return) {
        const task = state.logs[state.selectedLogIndex];
        const column = allColumns[state.logRestoreColumnIndex];
        if (task && column) {
          const result = restoreTaskAction(filePath, task.id, column.id);
          if (result.success) {
            showStatus(result.message || 'Task restored', 'success');
            loadBrainfile(true);
            const logResult = loadLogs(filePath);
            setState((prev) => ({
              ...prev,
              mode: 'browse',
              logs: logResult.logs,
              selectedLogIndex: Math.max(0, prev.selectedLogIndex - 1),
            }));
            return;
          }
          showStatus(result.error || 'Failed to restore task', 'error');
        }
        setMode('browse');
      }
      return;
    }

    if (state.mode === 'logs-delete-confirm') {
      const task = state.logs[state.selectedLogIndex];
      if (input === 'y' || input === 'Y') {
        if (task) {
          const result = deleteArchivedTaskAction(filePath, task.id);
          if (result.success) {
            showStatus(result.message || 'Task permanently deleted', 'success');
            const logResult = loadLogs(filePath);
            setState((prev) => ({
              ...prev,
              mode: 'browse',
              logs: logResult.logs,
              selectedLogIndex: Math.max(0, prev.selectedLogIndex - 1),
            }));
            return;
          }
          showStatus(result.error || 'Failed to delete task', 'error');
        }
        setMode('browse');
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('browse');
        showStatus('Delete cancelled', 'info');
      }
      return;
    }

    // ══ Browse mode ═══════════════════════════════════════════════════════

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (input === '?') {
      setMode('help');
      return;
    }
    if (input === '1') {
      setState((prev) => ({ ...prev, activePanel: 'board', mode: 'browse' }));
      return;
    }
    if (input === '2') {
      setState((prev) => ({ ...prev, activePanel: 'rules', mode: 'browse' }));
      return;
    }
    if (input === '3') {
      setState((prev) => ({ ...prev, activePanel: 'logs', mode: 'browse' }));
      return;
    }

    if (state.activePanel === 'board') {
      if (input === '/') {
        setMode('filter', { filterQuery: '', selectedTaskIndex: 0 });
        return;
      }
      // Type-cycle (§A2): all → task → epic → spec → plan → adr → all,
      // restricted to types the board actually declares.
      if (input === 't') {
        if (typeCycleOptions.length > 1) {
          const idx = typeCycleOptions.indexOf(state.activeTypeFilter);
          const next = typeCycleOptions[(idx < 0 ? 0 : idx + 1) % typeCycleOptions.length];
          setState((prev) => ({ ...prev, activeTypeFilter: next, selectedTaskIndex: 0 }));
        }
        return;
      }
      // Collapse/expand (§A1): only a no-op-free toggle when the row has
      // children currently rendered under it.
      if (input === ' ') {
        const row = rows[state.selectedTaskIndex];
        if (row && (row.childCount ?? 0) > 0) {
          const id = row.task.id;
          setState((prev) => {
            const next = new Set(prev.collapsedIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            writeTuiState(filePath, { collapsed: Array.from(next) });
            return { ...prev, collapsedIds: next };
          });
        }
        return;
      }
      if (input === 'r') {
        loadBrainfile(true);
        showStatus('Reloaded', 'info');
        return;
      }
      if (key.return) {
        if (currentTask) {
          setMode('detail', { detailPath: [currentTask.id], detailCursor: 0, detailScroll: 0 });
        } else {
          showStatus('No document selected', 'info');
        }
        return;
      }
      if (input === 'a' || input === 'n') {
        setMode('add', { newTaskTitle: '' });
        return;
      }
      if (input === 'm') {
        if (!currentTask) {
          showStatus('No document selected', 'error');
          return;
        }
        setState((prev) => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
        return;
      }
      if (input === 'c') {
        if (!currentTask) {
          showStatus('No document selected', 'error');
          return;
        }
        if (!isCompletable(currentTask)) {
          showStatus(`${currentTask.id} cannot be completed`, 'info');
          return;
        }
        completeTask(currentTask, false);
        return;
      }
      if (input === 'd') {
        if (!currentTask) {
          showStatus('No document selected', 'error');
          return;
        }
        setMode('delete-confirm');
        return;
      }
      if (input === 'e') {
        if (!currentTask) {
          showStatus('No document selected', 'error');
          return;
        }
        const result = editTaskInEditor(filePath, currentTask.id);
        if (result.success) {
          showStatus(result.message || 'Task updated', 'success');
          loadBrainfile(true);
        } else {
          showStatus(result.error || 'Edit failed', 'error');
        }
        return;
      }
      if (input === 'p') {
        if (!currentTask) return;
        const result = cyclePriorityAction(filePath, currentTask.id);
        if (result.success) {
          showStatus(result.message || 'Priority updated', 'success');
          loadBrainfile(true);
        } else {
          showStatus(result.error || 'Failed to update priority', 'error');
        }
        return;
      }
      if (input === 'y') {
        if (!currentTask) return;
        const result = copyToClipboard(currentTask.id);
        showStatus(
          result.success ? `Copied ${currentTask.id}` : result.error || 'Copy failed',
          result.success ? 'success' : 'error',
        );
        return;
      }
      if (input === 'N') {
        const column = allColumns[state.activeColumnIndex];
        if (column) {
          const result = newTaskInEditor(filePath, column.id);
          if (result.success) {
            showStatus(result.message || 'Task created', 'success');
            loadBrainfile(true);
          } else {
            showStatus(result.error || 'Failed to create task', 'error');
          }
        }
        return;
      }
      if (input === 'A') {
        if (!currentTask) return;
        showStatus('Moving to logs...', 'info');
        archiveTaskActionAsync(filePath, currentTask.id)
          .then((result) => {
            showStatus(
              result.success
                ? result.message || 'Task moved to logs'
                : result.error || 'Move to logs failed',
              result.success ? 'success' : 'error',
            );
            if (result.success) loadBrainfile(true);
          })
          .catch((err) => showStatus(`Move to logs failed: ${err}`, 'error'));
        return;
      }

      // Navigation
      if (key.downArrow || input === 'j') {
        setState((prev) => ({
          ...prev,
          selectedTaskIndex: Math.min(prev.selectedTaskIndex + 1, maxRowIndex),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState((prev) => ({
          ...prev,
          selectedTaskIndex: Math.max(prev.selectedTaskIndex - 1, 0),
        }));
        return;
      }
      if (key.ctrl && input === 'd') {
        setState((prev) => ({
          ...prev,
          selectedTaskIndex: Math.min(
            prev.selectedTaskIndex + Math.floor(viewportHeight / 2),
            maxRowIndex,
          ),
        }));
        return;
      }
      if (key.ctrl && input === 'u') {
        setState((prev) => ({
          ...prev,
          selectedTaskIndex: Math.max(prev.selectedTaskIndex - Math.floor(viewportHeight / 2), 0),
        }));
        return;
      }
      if (input === 'g') {
        setState((prev) => ({ ...prev, selectedTaskIndex: 0 }));
        return;
      }
      if (input === 'G') {
        setState((prev) => ({ ...prev, selectedTaskIndex: maxRowIndex }));
        return;
      }

      // Column cycling
      if (key.tab || key.rightArrow || input === 'l' || input === ']') {
        if (filteredColumnsLength > 0) {
          setState((prev) => ({
            ...prev,
            activeColumnIndex: (prev.activeColumnIndex + 1) % filteredColumnsLength,
            selectedTaskIndex: 0,
          }));
        }
        return;
      }
      if ((key.shift && key.tab) || key.leftArrow || input === 'h' || input === '[') {
        if (filteredColumnsLength > 0) {
          setState((prev) => ({
            ...prev,
            activeColumnIndex:
              prev.activeColumnIndex === 0 ? filteredColumnsLength - 1 : prev.activeColumnIndex - 1,
            selectedTaskIndex: 0,
          }));
        }
        return;
      }

      if (key.escape) {
        setState((prev) => ({ ...prev, filterQuery: '', selectedTaskIndex: 0 }));
      }
      return;
    }

    // ── Rules panel browse (carried over unchanged) ───────────────────────
    if (state.activePanel === 'rules') {
      const rules = state.board?.rules?.[state.activeRuleType] || [];
      const maxRuleIndex = Math.max(0, rules.length - 1);

      if (key.leftArrow || input === 'h' || (key.shift && key.tab)) {
        const idx = RULE_TYPES.indexOf(state.activeRuleType);
        setState((prev) => ({
          ...prev,
          activeRuleType: RULE_TYPES[idx === 0 ? RULE_TYPES.length - 1 : idx - 1],
          selectedRuleIndex: 0,
        }));
        return;
      }
      if (key.tab || key.rightArrow || input === 'l') {
        const idx = RULE_TYPES.indexOf(state.activeRuleType);
        setState((prev) => ({
          ...prev,
          activeRuleType: RULE_TYPES[(idx + 1) % RULE_TYPES.length],
          selectedRuleIndex: 0,
        }));
        return;
      }
      if (key.downArrow || input === 'j') {
        setState((prev) => ({
          ...prev,
          selectedRuleIndex: Math.min(prev.selectedRuleIndex + 1, maxRuleIndex),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState((prev) => ({
          ...prev,
          selectedRuleIndex: Math.max(prev.selectedRuleIndex - 1, 0),
        }));
        return;
      }
      if (input === 'a' || input === 'n') {
        setMode('rule-add', { ruleEditText: '', ruleEditId: null });
        return;
      }
      if (input === 'e') {
        const rule = rules[state.selectedRuleIndex];
        if (rule) setMode('rule-edit', { ruleEditText: rule.rule, ruleEditId: rule.id });
        else showStatus('No rule selected', 'error');
        return;
      }
      if (input === 'd') {
        if (rules[state.selectedRuleIndex]) setMode('rule-delete-confirm');
        else showStatus('No rule selected', 'error');
        return;
      }
      if (input === 'g') {
        setState((prev) => ({ ...prev, selectedRuleIndex: 0 }));
        return;
      }
      if (input === 'G') {
        setState((prev) => ({ ...prev, selectedRuleIndex: maxRuleIndex }));
      }
      return;
    }

    // ── Logs panel browse (carried over unchanged) ────────────────────────
    if (state.activePanel === 'logs') {
      const maxLogIndex = Math.max(0, state.logs.length - 1);

      if (input === 'r') {
        const result = loadLogs(filePath);
        setState((prev) => ({ ...prev, logs: result.logs }));
        showStatus('Logs refreshed', 'info');
        return;
      }
      if (key.downArrow || input === 'j') {
        setState((prev) => ({
          ...prev,
          selectedLogIndex: Math.min(prev.selectedLogIndex + 1, maxLogIndex),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState((prev) => ({
          ...prev,
          selectedLogIndex: Math.max(prev.selectedLogIndex - 1, 0),
        }));
        return;
      }
      if (key.return) {
        const task = state.logs[state.selectedLogIndex];
        if (task) {
          setState((prev) => {
            const expanded = new Set(prev.expandedLogIds);
            if (expanded.has(task.id)) expanded.delete(task.id);
            else expanded.add(task.id);
            return { ...prev, expandedLogIds: expanded };
          });
        }
        return;
      }
      if (input === 'R') {
        if (state.logs.length === 0) {
          showStatus('No logged tasks', 'error');
          return;
        }
        setMode('logs-restore', { logRestoreColumnIndex: 0 });
        return;
      }
      if (input === 'd') {
        if (state.logs.length === 0) {
          showStatus('No logged tasks', 'error');
          return;
        }
        setMode('logs-delete-confirm');
        return;
      }
      if (input === 'g') {
        setState((prev) => ({ ...prev, selectedLogIndex: 0 }));
        return;
      }
      if (input === 'G') {
        setState((prev) => ({ ...prev, selectedLogIndex: maxLogIndex }));
        return;
      }
      if (key.escape) {
        setState((prev) => ({ ...prev, expandedLogIds: new Set() }));
      }
    }
  });
}
