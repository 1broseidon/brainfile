import { useInput, useApp } from 'ink';
import type { AppState, StatusMessage, BoardColumn } from '../types.js';
import type { Task } from '@brainfile/core';
import {
  editTaskInEditor,
  moveTaskAction,
  deleteTaskAction,
  archiveTaskAction,
  cyclePriorityAction,
  toggleSubtaskAction,
  copyToClipboard,
  addTaskAction,
  newTaskInEditor,
} from '../actions.js';

interface UseKeyboardNavigationProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  currentTasks: Task[];
  maxTaskIndex: number;
  filteredColumnsLength: number;
  viewportHeight: number;
  loadBrainfile: (forceRefresh?: boolean) => void;
  filePath: string;
  allColumns: BoardColumn[];
}

// Helper to show status message
function showStatus(
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  text: string,
  type: StatusMessage['type']
) {
  const timestamp = Date.now();
  setState(prev => ({
    ...prev,
    statusMessage: { text, type, timestamp },
  }));
  // Clear message after 3 seconds
  setTimeout(() => {
    setState(prev => {
      // Only clear if it's the same message
      if (prev.statusMessage?.timestamp === timestamp) {
        return { ...prev, statusMessage: null };
      }
      return prev;
    });
  }, 3000);
}

export function useKeyboardNavigation({
  state,
  setState,
  currentTasks,
  maxTaskIndex,
  filteredColumnsLength,
  viewportHeight,
  loadBrainfile,
  filePath,
  allColumns,
}: UseKeyboardNavigationProps) {
  const { exit } = useApp();

  // Get current task
  const currentTask = currentTasks[state.selectedTaskIndex];

  useInput((input, key) => {
    // Help mode - any key closes
    if (state.mode === 'help') {
      setState(prev => ({ ...prev, mode: 'browse' }));
      return;
    }

    // Delete confirmation mode
    if (state.mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        if (currentTask) {
          const result = deleteTaskAction(filePath, currentTask.id);
          if (result.success) {
            showStatus(setState, `Deleted ${currentTask.id}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(setState, result.error || 'Failed to delete', 'error');
          }
        }
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        showStatus(setState, 'Delete cancelled', 'info');
        return;
      }
      return;
    }

    // Move mode - column picker
    if (state.mode === 'move') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (key.leftArrow || input === 'h') {
        setState(prev => ({
          ...prev,
          moveTargetIndex: Math.max(0, prev.moveTargetIndex - 1),
        }));
        return;
      }
      if (key.rightArrow || input === 'l') {
        setState(prev => ({
          ...prev,
          moveTargetIndex: Math.min(allColumns.length - 1, prev.moveTargetIndex + 1),
        }));
        return;
      }
      if (key.return) {
        if (currentTask) {
          const targetColumn = allColumns[state.moveTargetIndex];
          if (targetColumn) {
            const result = moveTaskAction(filePath, currentTask.id, targetColumn.id);
            if (result.success) {
              showStatus(setState, result.message || `Moved to ${targetColumn.title}`, 'success');
              loadBrainfile(true);
            } else {
              showStatus(setState, result.error || 'Failed to move', 'error');
            }
          }
        }
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      // Number keys 1-9 to jump to column
      const num = parseInt(input, 10);
      if (num >= 1 && num <= allColumns.length) {
        setState(prev => ({ ...prev, moveTargetIndex: num - 1 }));
        return;
      }
      return;
    }

    // Subtask mode - toggle subtasks
    if (state.mode === 'subtask') {
      const subtasks = currentTask?.subtasks || [];
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState(prev => ({
          ...prev,
          selectedSubtaskIndex: Math.max(0, prev.selectedSubtaskIndex - 1),
        }));
        return;
      }
      if (key.downArrow || input === 'j') {
        setState(prev => ({
          ...prev,
          selectedSubtaskIndex: Math.min(subtasks.length - 1, prev.selectedSubtaskIndex + 1),
        }));
        return;
      }
      if (key.return || input === ' ') {
        const subtask = subtasks[state.selectedSubtaskIndex];
        if (currentTask && subtask) {
          const result = toggleSubtaskAction(filePath, currentTask.id, subtask.id);
          if (result.success) {
            showStatus(setState, `Toggled ${subtask.id}`, 'success');
            loadBrainfile(true);
          } else {
            showStatus(setState, result.error || 'Failed to toggle', 'error');
          }
        }
        return;
      }
      return;
    }

    // New task mode - inline title input
    if (state.mode === 'new-task') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse', newTaskTitle: '' }));
        return;
      }
      if (key.return) {
        const title = state.newTaskTitle.trim();
        if (title) {
          const currentCol = allColumns[state.activeColumnIndex];
          if (currentCol) {
            const result = addTaskAction(filePath, currentCol.id, { title });
            if (result.success) {
              showStatus(setState, result.message || 'Task added', 'success');
              loadBrainfile(true);
            } else {
              showStatus(setState, result.error || 'Failed to add task', 'error');
            }
          }
        } else {
          showStatus(setState, 'Title required', 'error');
        }
        setState(prev => ({ ...prev, mode: 'browse', newTaskTitle: '' }));
        return;
      }
      if (key.backspace || key.delete) {
        setState(prev => ({ ...prev, newTaskTitle: prev.newTaskTitle.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState(prev => ({ ...prev, newTaskTitle: prev.newTaskTitle + input }));
        return;
      }
      return;
    }

    // Search mode handling
    if (state.mode === 'search') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse', searchQuery: '' }));
        return;
      }
      if (key.return) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (key.backspace || key.delete) {
        setState(prev => ({ ...prev, searchQuery: prev.searchQuery.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState(prev => ({ ...prev, searchQuery: prev.searchQuery + input }));
        return;
      }
      return;
    }

    // Browse mode
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (input === '?') {
      setState(prev => ({ ...prev, mode: 'help' }));
      return;
    }

    if (input === '/') {
      setState(prev => ({ ...prev, mode: 'search', searchQuery: '' }));
      return;
    }

    // Refresh (force refresh bypasses hash check)
    if (input === 'r') {
      loadBrainfile(true);
      showStatus(setState, 'Refreshed', 'info');
      return;
    }

    // === Task Management Keys ===

    // 'e' - Edit task in $EDITOR (blocks until editor closes)
    if (input === 'e') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      // spawnSync blocks the entire process, giving terminal to editor
      const result = editTaskInEditor(filePath, currentTask.id);
      if (result.success) {
        showStatus(setState, result.message || 'Task updated', 'success');
        loadBrainfile(true);
      } else {
        showStatus(setState, result.error || 'Edit failed', 'error');
      }
      return;
    }

    // 'm' - Move task (open column picker)
    if (input === 'm') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      setState(prev => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
      return;
    }

    // 'd' - Delete task (with confirmation)
    if (input === 'd') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      setState(prev => ({ ...prev, mode: 'delete-confirm' }));
      return;
    }

    // 'a' - Archive task
    if (input === 'a') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      const result = archiveTaskAction(filePath, currentTask.id);
      if (result.success) {
        showStatus(setState, result.message || 'Task archived', 'success');
        loadBrainfile(true);
      } else {
        showStatus(setState, result.error || 'Archive failed', 'error');
      }
      return;
    }

    // 'p' - Cycle priority
    if (input === 'p') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      const result = cyclePriorityAction(filePath, currentTask.id);
      if (result.success) {
        showStatus(setState, result.message || 'Priority updated', 'success');
        loadBrainfile(true);
      } else {
        showStatus(setState, result.error || 'Failed to update priority', 'error');
      }
      return;
    }

    // 't' - Toggle subtask (open subtask picker if has subtasks)
    if (input === 't') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      if (!currentTask.subtasks || currentTask.subtasks.length === 0) {
        showStatus(setState, 'No subtasks', 'info');
        return;
      }
      setState(prev => ({ ...prev, mode: 'subtask', selectedSubtaskIndex: 0 }));
      return;
    }

    // 'y' - Yank/copy task ID to clipboard
    if (input === 'y') {
      if (!currentTask) {
        showStatus(setState, 'No task selected', 'error');
        return;
      }
      const result = copyToClipboard(currentTask.id);
      if (result.success) {
        showStatus(setState, `Copied ${currentTask.id}`, 'success');
      } else {
        showStatus(setState, result.error || 'Copy failed', 'error');
      }
      return;
    }

    // 'n' - New task (quick add - title only)
    if (input === 'n') {
      setState(prev => ({ ...prev, mode: 'new-task', newTaskTitle: '' }));
      return;
    }

    // 'N' - New task (full editor)
    if (input === 'N') {
      const currentCol = allColumns[state.activeColumnIndex];
      if (currentCol) {
        const result = newTaskInEditor(filePath, currentCol.id);
        if (result.success) {
          showStatus(setState, result.message || 'Task created', 'success');
          loadBrainfile(true);
        } else {
          showStatus(setState, result.error || 'Failed to create task', 'error');
        }
      }
      return;
    }

    // Navigation: up/down through tasks
    if (key.downArrow || input === 'j') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.min(prev.selectedTaskIndex + 1, maxTaskIndex),
      }));
      return;
    }

    if (key.upArrow || input === 'k') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.max(prev.selectedTaskIndex - 1, 0),
      }));
      return;
    }

    // Page scrolling
    if (key.ctrl && input === 'd') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.min(prev.selectedTaskIndex + Math.floor(viewportHeight / 2), maxTaskIndex),
      }));
      return;
    }

    if (key.ctrl && input === 'u') {
      setState(prev => ({
        ...prev,
        selectedTaskIndex: Math.max(prev.selectedTaskIndex - Math.floor(viewportHeight / 2), 0),
      }));
      return;
    }

    // Column switching: TAB / left/right
    if (key.tab || key.rightArrow || input === 'l') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: (prev.activeColumnIndex + 1) % filteredColumnsLength,
        selectedTaskIndex: 0,
      }));
      return;
    }

    if ((key.shift && key.tab) || key.leftArrow || input === 'h') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: prev.activeColumnIndex === 0
          ? filteredColumnsLength - 1
          : prev.activeColumnIndex - 1,
        selectedTaskIndex: 0,
      }));
      return;
    }

    // Jump to column headers with { and }
    if (input === '{') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: Math.max(0, prev.activeColumnIndex - 1),
        selectedTaskIndex: 0,
      }));
      return;
    }

    if (input === '}') {
      setState(prev => ({
        ...prev,
        activeColumnIndex: Math.min(filteredColumnsLength - 1, prev.activeColumnIndex + 1),
        selectedTaskIndex: 0,
      }));
      return;
    }

    // Home/End
    if (input === 'g') {
      setState(prev => ({ ...prev, selectedTaskIndex: 0 }));
      return;
    }
    if (input === 'G') {
      setState(prev => ({ ...prev, selectedTaskIndex: maxTaskIndex }));
      return;
    }

    // Expand/collapse task
    if (key.return) {
      const task = currentTasks[state.selectedTaskIndex];
      if (task) {
        setState(prev => {
          const newExpanded = new Set(prev.expandedTaskIds);
          if (newExpanded.has(task.id)) {
            newExpanded.delete(task.id);
          } else {
            newExpanded.add(task.id);
          }
          return { ...prev, expandedTaskIds: newExpanded };
        });
      }
      return;
    }

    // Escape: collapse all or clear search
    if (key.escape) {
      setState(prev => ({
        ...prev,
        expandedTaskIds: new Set(),
        searchQuery: '',
      }));
      return;
    }
  });
}
