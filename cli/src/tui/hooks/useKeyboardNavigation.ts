/**
 * v3 keyboard model.
 *
 * The required set (design §5) is: j/k move · h/l and tab column cycle ·
 * ↵ detail · esc back/clear · / filter · m move · c complete · a add ·
 * space toggle subtask (in detail) · ? help · q quit. Existing binds that
 * predate v3 (g/G, ctrl-d/ctrl-u, arrows, e, p, d, y, r, n, A) are preserved,
 * per §5's "preserve existing keybinds where they exist".
 *
 * adr-2 retired three groups: `[`/`]` (h/l and tab are the column cycle, and a
 * key that silently duplicates another is muscle-memory noise — rubric P2);
 * `1`/`2`/`3` (there are no panels left to switch between); and every
 * rules/logs modal mode. Completed work is the `done` stop on `t`.
 */
import { spawnSync } from 'child_process';
import { useCallback, useEffect, useRef } from 'react';
import { useInput, useApp, useStdin } from 'ink';
import type { AppState, StatusMessage, BoardColumn, ViewMode } from '../types.js';
import type { Task } from '@brainfile/core';
import type { DocRow } from '../rows.js';
import { isCompletable } from '../utils.js';
import { buildDetailStops, clampDetailCursor } from '../detailStops.js';
import { computeDetailLayout } from '../components/DetailView.js';
import { patchTuiState } from '../tuiState.js';
import {
  moveTaskAction,
  deleteTaskAction,
  archiveTaskAction,
  archiveTaskActionAsync,
  cyclePriorityAction,
  toggleSubtaskAction,
  copyToClipboard,
  addTaskAction,
  resolveTaskFilePath,
  type ActivityEntry,
} from '../actions.js';

interface UseKeyboardNavigationProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  rows: DocRow[];
  filteredColumnsLength: number;
  viewportHeight: number;
  loadBrainfile: (forceRefresh?: boolean) => void;
  filePath: string;
  allColumns: BoardColumn[];
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
  /** List is the `done` stop — archived docs are read-mostly (§B2). */
  doneView: boolean;
  /** The drilled-into doc is archived — same gating, resolved per-doc. */
  detailArchived: boolean;
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
  typeCycleOptions,
  detailTask,
  detailChildren,
  detailParent,
  detailActivity,
  detailWidth,
  detailHeight,
  doneView,
  detailArchived,
}: UseKeyboardNavigationProps) {
  const { exit, suspendTerminal } = useApp();
  // DEVIATION from the bind's `!process.stdout.isTTY || !process.stdin.isTTY`.
  // `isRawModeSupported` is ink's own `stdin.isTTY` (ink App.js:121), i.e. the
  // stdin ink was actually rendered against, which under non-default
  // `render()` options need not be `process.stdin`. It is also precisely the
  // "can this terminal be suspended?" question `suspendTerminal` asks.
  //
  // The bind's stdout half is deliberately not mirrored: it is vacuous here.
  // Ink only renders interactively when `stdout.isTTY` (ink.js:707), so a user
  // who can see a board to press `e` on already has an interactive stdout —
  // and asserting it against the process global would be wrong under injected
  // streams and unsatisfiable in-process, where `process.stdout.isTTY` is
  // undefined under any piped or test runner.
  const { isRawModeSupported } = useStdin();

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

  /**
   * `$EDITOR` handoff (§C1): hand the terminal to the editor on the document's
   * REAL `.md` file, then reload.
   *
   * The callback form of ink's `suspendTerminal` is deliberate — ink restores
   * raw mode and forces a full redraw even if the callback throws, so a
   * crashing editor cannot leave the TUI wedged with the terminal in raw mode.
   *
   * `$EDITOR` → `$VISUAL` → `vi`, so "no editor configured" is never fatal;
   * the only hard failure is having no TTY to hand over, which is checked
   * before suspending rather than discovered as a crash inside it.
   */
  const openInEditor = useCallback(
    (taskId: string) => {
      const located = resolveTaskFilePath(filePath, taskId);
      if (!located.success) {
        showStatus(located.error, 'error');
        return;
      }

      if (!isRawModeSupported) {
        showStatus('$EDITOR requires an interactive terminal', 'error');
        return;
      }

      const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

      void suspendTerminal(async () => {
        spawnSync(editor, [located.path], { stdio: 'inherit', shell: true });
      })
        .then(() => {
          // Reload from disk. Selection is restored by id, so the row the user
          // was on is still the row they come back to (§C4).
          loadBrainfile(true);
        })
        .catch((err: unknown) => {
          showStatus(`Editor failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        });
    },
    [filePath, showStatus, suspendTerminal, loadBrainfile, isRawModeSupported],
  );

  /** Persist the resume column by ID (§C3). Best-effort: never blocks a keypress. */
  const rememberColumn = useCallback(
    (columnIndex: number) => {
      const id = allColumns[columnIndex]?.id;
      if (id) patchTuiState(filePath, { lastColumn: id });
    },
    [allColumns, filePath],
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
            closeOverlay({ docRemoved: true });
          } else {
            showStatus(result.error || 'Failed to complete', 'error');
            closeOverlay();
          }
        } else {
          closeOverlay();
        }
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
            closeOverlay({ docRemoved: true });
          } else {
            showStatus(result.error || 'Failed to delete', 'error');
            closeOverlay();
          }
        } else {
          closeOverlay();
        }
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
        setMode('browse', { newTaskTitle: '', addThenEdit: false });
        return;
      }
      if (key.return) {
        const title = state.newTaskTitle.trim();
        if (!title) {
          showStatus('Title required', 'error');
          return; // stay in the overlay rather than discarding what was typed
        }

        const column = allColumns[state.activeColumnIndex];
        if (column) {
          const result = addTaskAction(filePath, column.id, { title });
          if (result.success) {
            showStatus(result.message || 'Task added', 'success');
            loadBrainfile(true);
            // `N` continues into $EDITOR on the document just created.
            // `addTaskAction` reports `Added <id>`; that id is what to open.
            if (state.addThenEdit) {
              const newId = result.message?.replace(/^Added\s+/, '').trim();
              if (newId) openInEditor(newId);
            }
          } else {
            showStatus(result.error || 'Failed to add task', 'error');
          }
        }
        setMode('browse', { newTaskTitle: '', addThenEdit: false });
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
        if (detailArchived) {
          // The underlying action only resolves board files, so without this
          // an archived doc answers "not found" — technically true, and
          // useless. Say the real reason instead (§B2).
          showStatus('Completed documents are read-only here', 'info');
          return;
        }
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

      // Board mutations are suppressed on an archived doc (§B2); `e` is not a
      // board mutation, so it stays available everywhere.
      if (input === 'm' && detailTask && !detailArchived) {
        setState((prev) => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
        return;
      }
      if (input === 'c' && detailTask && !detailArchived && isCompletable(detailTask)) {
        completeTask(detailTask, false);
        return;
      }
      if (input === 'e' && detailTask) {
        openInEditor(detailTask.id);
        return;
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
    if (input === '/') {
      setMode('filter', { filterQuery: '', selectedTaskIndex: 0 });
      return;
    }
    // Done toggle (`L`): flips between board columns and completed history,
    // preserving the column/type/selection view you left. Orthogonal to `t`.
    if (input === 'L') {
      setState((prev) => ({ ...prev, doneView: !prev.doneView, selectedTaskIndex: 0 }));
      return;
    }
    // Type-cycle (§A2): all → task → epic → spec → plan → adr → all,
    // restricted to types the board actually declares.
    if (input === 't') {
      if (typeCycleOptions.length > 1) {
        const idx = typeCycleOptions.indexOf(state.activeTypeFilter);
        const next = typeCycleOptions[(idx < 0 ? 0 : idx + 1) % typeCycleOptions.length];
        patchTuiState(filePath, { lastTypeFilter: next }); // resume view (§C3)
        setState((prev) => ({ ...prev, activeTypeFilter: next, selectedTaskIndex: 0 }));
      }
      return;
    }
    // Collapse/expand (§A1): only a no-op-free toggle when the row has
    // children currently rendered under it.
    if (input === ' ') {
      if (doneView) return; // flat list, nothing to collapse
      const row = rows[state.selectedTaskIndex];
      if (row && (row.childCount ?? 0) > 0) {
        const id = row.task.id;
        setState((prev) => {
          const next = new Set(prev.collapsedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          patchTuiState(filePath, { collapsed: Array.from(next) });
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
    // ── Board mutations ───────────────────────────────────────────────────
    // The `done` stop is read-mostly (§B2): every mutating key answers with a
    // status line instead of silently doing nothing (rubric P6 — a keystroke
    // that produces no feedback is indistinguishable from a dropped one).
    if (input === 'a' || input === 'n') {
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
      setMode('add', { newTaskTitle: '', addThenEdit: false });
      return;
    }
    if (input === 'm') {
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
      if (!currentTask) {
        showStatus('No document selected', 'error');
        return;
      }
      setState((prev) => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
      return;
    }
    if (input === 'c') {
      if (doneView) {
        showStatus('Already completed', 'info');
        return;
      }
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
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
      if (!currentTask) {
        showStatus('No document selected', 'error');
        return;
      }
      setMode('delete-confirm');
      return;
    }
    // `e` works on archived docs too — it edits the document's own file and
    // mutates no board state (§B2).
    if (input === 'e') {
      if (!currentTask) {
        showStatus('No document selected', 'error');
        return;
      }
      openInEditor(currentTask.id);
      return;
    }
    if (input === 'p') {
      if (!currentTask) return;
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
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
    // `N` = new document, then straight into $EDITOR on its real file.
    //
    // The old flow wrote a synthetic YAML template to a temp file and diffed
    // the result back into a patch. Now the title is collected by the ordinary
    // add overlay first, the document is created for real, and the editor opens
    // on THAT file — so there is no second format to keep in sync, and
    // abandoning the editor cannot leave an untitled stray behind (the title
    // was already required to get this far).
    if (input === 'N') {
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
      setMode('add', { newTaskTitle: '', addThenEdit: true });
      return;
    }
    if (input === 'A') {
      if (!currentTask) return;
      if (doneView) {
        showStatus('Completed documents are read-only here', 'info');
        return;
      }
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
    // `[`/`]` are retired (§C6): h/l, tab and the arrows are the column
    // cycle. Under `done` there is one flat archive list and no columns, so
    // cycling is a deliberate no-op rather than a silent index change.
    if (key.tab || key.rightArrow || input === 'l') {
      if (!doneView && filteredColumnsLength > 0) {
        setState((prev) => {
          const nextIndex = (prev.activeColumnIndex + 1) % filteredColumnsLength;
          rememberColumn(nextIndex);
          return { ...prev, activeColumnIndex: nextIndex, selectedTaskIndex: 0 };
        });
      }
      return;
    }
    if ((key.shift && key.tab) || key.leftArrow || input === 'h') {
      if (!doneView && filteredColumnsLength > 0) {
        setState((prev) => {
          const nextIndex =
            prev.activeColumnIndex === 0 ? filteredColumnsLength - 1 : prev.activeColumnIndex - 1;
          rememberColumn(nextIndex);
          return { ...prev, activeColumnIndex: nextIndex, selectedTaskIndex: 0 };
        });
      }
      return;
    }

    if (key.escape) {
      setState((prev) => ({ ...prev, filterQuery: '', selectedTaskIndex: 0 }));
    }
    return;
  });
}
