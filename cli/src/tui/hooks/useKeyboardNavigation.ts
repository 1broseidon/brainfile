import { useInput, useApp } from 'ink';
import type { AppState, StatusMessage, BoardColumn, RuleType, MainPanel } from '../types.js';
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
  addRuleAction,
  updateRuleAction,
  deleteRuleAction,
  restoreTaskAction,
  deleteArchivedTaskAction,
  loadArchive,
} from '../actions.js';

const RULE_TYPES: RuleType[] = ['always', 'never', 'prefer', 'context'];

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

    // Search mode handling (Tasks panel)
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

    // Rule add/edit mode
    if (state.mode === 'rule-add' || state.mode === 'rule-edit') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse', ruleEditText: '', ruleEditId: null }));
        return;
      }
      if (key.return) {
        const text = state.ruleEditText.trim();
        if (!text) {
          showStatus(setState, 'Rule text required', 'error');
          return;
        }
        if (state.mode === 'rule-add') {
          const result = addRuleAction(filePath, state.activeRuleType, text);
          if (result.success) {
            showStatus(setState, result.message || 'Rule added', 'success');
            loadBrainfile(true);
          } else {
            showStatus(setState, result.error || 'Failed to add rule', 'error');
          }
        } else if (state.ruleEditId !== null) {
          const result = updateRuleAction(filePath, state.activeRuleType, state.ruleEditId, text);
          if (result.success) {
            showStatus(setState, result.message || 'Rule updated', 'success');
            loadBrainfile(true);
          } else {
            showStatus(setState, result.error || 'Failed to update rule', 'error');
          }
        }
        setState(prev => ({ ...prev, mode: 'browse', ruleEditText: '', ruleEditId: null }));
        return;
      }
      if (key.backspace || key.delete) {
        setState(prev => ({ ...prev, ruleEditText: prev.ruleEditText.slice(0, -1) }));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setState(prev => ({ ...prev, ruleEditText: prev.ruleEditText + input }));
        return;
      }
      return;
    }

    // Rule delete confirmation
    if (state.mode === 'rule-delete-confirm') {
      const rules = state.board?.rules?.[state.activeRuleType] || [];
      const rule = rules[state.selectedRuleIndex];
      if (input === 'y' || input === 'Y') {
        if (rule) {
          const result = deleteRuleAction(filePath, state.activeRuleType, rule.id);
          if (result.success) {
            showStatus(setState, result.message || 'Rule deleted', 'success');
            loadBrainfile(true);
            // Adjust selection if needed
            setState(prev => ({
              ...prev,
              mode: 'browse',
              selectedRuleIndex: Math.max(0, prev.selectedRuleIndex - 1),
            }));
          } else {
            showStatus(setState, result.error || 'Failed to delete rule', 'error');
            setState(prev => ({ ...prev, mode: 'browse' }));
          }
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        showStatus(setState, 'Delete cancelled', 'info');
        return;
      }
      return;
    }

    // Archive restore mode - column picker
    if (state.mode === 'archive-restore') {
      if (key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        return;
      }
      if (key.downArrow || input === 'j') {
        setState(prev => ({
          ...prev,
          archiveRestoreColumnIndex: Math.min(prev.archiveRestoreColumnIndex + 1, allColumns.length - 1),
        }));
        return;
      }
      if (key.upArrow || input === 'k') {
        setState(prev => ({
          ...prev,
          archiveRestoreColumnIndex: Math.max(prev.archiveRestoreColumnIndex - 1, 0),
        }));
        return;
      }
      if (key.return) {
        const task = state.archive[state.selectedArchiveIndex];
        const column = allColumns[state.archiveRestoreColumnIndex];
        if (task && column) {
          const result = restoreTaskAction(filePath, task.id, column.id);
          if (result.success) {
            showStatus(setState, result.message || 'Task restored', 'success');
            loadBrainfile(true);
            // Reload archive
            const archiveResult = loadArchive(filePath);
            setState(prev => ({
              ...prev,
              mode: 'browse',
              archive: archiveResult.archive,
              selectedArchiveIndex: Math.max(0, prev.selectedArchiveIndex - 1),
            }));
          } else {
            showStatus(setState, result.error || 'Failed to restore task', 'error');
            setState(prev => ({ ...prev, mode: 'browse' }));
          }
        }
        return;
      }
      return;
    }

    // Archive delete confirmation
    if (state.mode === 'archive-delete-confirm') {
      const task = state.archive[state.selectedArchiveIndex];
      if (input === 'y' || input === 'Y') {
        if (task) {
          const result = deleteArchivedTaskAction(filePath, task.id);
          if (result.success) {
            showStatus(setState, result.message || 'Task permanently deleted', 'success');
            // Reload archive
            const archiveResult = loadArchive(filePath);
            setState(prev => ({
              ...prev,
              mode: 'browse',
              archive: archiveResult.archive,
              selectedArchiveIndex: Math.max(0, prev.selectedArchiveIndex - 1),
            }));
          } else {
            showStatus(setState, result.error || 'Failed to delete task', 'error');
            setState(prev => ({ ...prev, mode: 'browse' }));
          }
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setState(prev => ({ ...prev, mode: 'browse' }));
        showStatus(setState, 'Delete cancelled', 'info');
        return;
      }
      return;
    }

    // ============================================================
    // GLOBAL KEYS (work in browse mode across all panels)
    // ============================================================

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (input === '?') {
      setState(prev => ({ ...prev, mode: 'help' }));
      return;
    }

    // Panel switching: 1/2/3
    if (input === '1') {
      setState(prev => ({ ...prev, activePanel: 'tasks', mode: 'browse' }));
      return;
    }
    if (input === '2') {
      setState(prev => ({ ...prev, activePanel: 'rules', mode: 'browse' }));
      return;
    }
    if (input === '3') {
      setState(prev => ({ ...prev, activePanel: 'archive', mode: 'browse' }));
      // Archive is loaded via useEffect in BrainfileTUI
      return;
    }

    // Refresh (force refresh bypasses hash check)
    if (input === 'r' && state.activePanel !== 'archive') {
      loadBrainfile(true);
      showStatus(setState, 'Refreshed', 'info');
      return;
    }

    // ============================================================
    // TASKS PANEL - Browse mode
    // ============================================================
    if (state.activePanel === 'tasks') {
      if (input === '/') {
        setState(prev => ({ ...prev, mode: 'search', searchQuery: '' }));
        return;
      }

      // 'e' - Edit task in $EDITOR
      if (input === 'e') {
        if (!currentTask) {
          showStatus(setState, 'No task selected', 'error');
          return;
        }
        const result = editTaskInEditor(filePath, currentTask.id);
        if (result.success) {
          showStatus(setState, result.message || 'Task updated', 'success');
          loadBrainfile(true);
        } else {
          showStatus(setState, result.error || 'Edit failed', 'error');
        }
        return;
      }

      // 'm' - Move task
      if (input === 'm') {
        if (!currentTask) {
          showStatus(setState, 'No task selected', 'error');
          return;
        }
        setState(prev => ({ ...prev, mode: 'move', moveTargetIndex: prev.activeColumnIndex }));
        return;
      }

      // 'd' - Delete task
      if (input === 'd') {
        if (!currentTask) {
          showStatus(setState, 'No task selected', 'error');
          return;
        }
        setState(prev => ({ ...prev, mode: 'delete-confirm' }));
        return;
      }

      // 'A' - Archive task
      if (input === 'A') {
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

      // 't' - Toggle subtask
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

      // 'y' - Copy task ID
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

      // 'n' - New task (quick)
      if (input === 'n') {
        setState(prev => ({ ...prev, mode: 'new-task', newTaskTitle: '' }));
        return;
      }

      // 'N' - New task (editor)
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

      // Navigation: up/down
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

      // Column switching
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
    }

    // ============================================================
    // RULES PANEL - Browse mode
    // ============================================================
    if (state.activePanel === 'rules') {
      const rules = state.board?.rules?.[state.activeRuleType] || [];
      const maxRuleIndex = Math.max(0, rules.length - 1);

      // h/l or left/right or Shift+TAB to switch rule type left
      if (key.leftArrow || input === 'h' || (key.shift && key.tab)) {
        const currentIdx = RULE_TYPES.indexOf(state.activeRuleType);
        const newIdx = currentIdx === 0 ? RULE_TYPES.length - 1 : currentIdx - 1;
        setState(prev => ({ ...prev, activeRuleType: RULE_TYPES[newIdx], selectedRuleIndex: 0 }));
        return;
      }

      // TAB or l or right to switch rule type right
      if (key.tab || key.rightArrow || input === 'l') {
        const currentIdx = RULE_TYPES.indexOf(state.activeRuleType);
        const newIdx = (currentIdx + 1) % RULE_TYPES.length;
        setState(prev => ({ ...prev, activeRuleType: RULE_TYPES[newIdx], selectedRuleIndex: 0 }));
        return;
      }

      // j/k to navigate rules
      if (key.downArrow || input === 'j') {
        setState(prev => ({
          ...prev,
          selectedRuleIndex: Math.min(prev.selectedRuleIndex + 1, maxRuleIndex),
        }));
        return;
      }

      if (key.upArrow || input === 'k') {
        setState(prev => ({
          ...prev,
          selectedRuleIndex: Math.max(prev.selectedRuleIndex - 1, 0),
        }));
        return;
      }

      // n - New rule
      if (input === 'n') {
        setState(prev => ({ ...prev, mode: 'rule-add', ruleEditText: '', ruleEditId: null }));
        return;
      }

      // e - Edit rule
      if (input === 'e') {
        const rule = rules[state.selectedRuleIndex];
        if (rule) {
          setState(prev => ({
            ...prev,
            mode: 'rule-edit',
            ruleEditText: rule.rule,
            ruleEditId: rule.id,
          }));
        } else {
          showStatus(setState, 'No rule selected', 'error');
        }
        return;
      }

      // d - Delete rule
      if (input === 'd') {
        const rule = rules[state.selectedRuleIndex];
        if (rule) {
          setState(prev => ({ ...prev, mode: 'rule-delete-confirm' }));
        } else {
          showStatus(setState, 'No rule selected', 'error');
        }
        return;
      }

      // Home/End
      if (input === 'g') {
        setState(prev => ({ ...prev, selectedRuleIndex: 0 }));
        return;
      }
      if (input === 'G') {
        setState(prev => ({ ...prev, selectedRuleIndex: maxRuleIndex }));
        return;
      }

      // Escape
      if (key.escape) {
        setState(prev => ({ ...prev, selectedRuleIndex: 0 }));
        return;
      }
    }

    // ============================================================
    // ARCHIVE PANEL - Browse mode
    // ============================================================
    if (state.activePanel === 'archive') {
      const maxArchiveIndex = Math.max(0, state.archive.length - 1);

      // r - Refresh archive
      if (input === 'r') {
        const result = loadArchive(filePath);
        setState(prev => ({ ...prev, archive: result.archive }));
        showStatus(setState, 'Archive refreshed', 'info');
        return;
      }

      // j/k navigation
      if (key.downArrow || input === 'j') {
        setState(prev => ({
          ...prev,
          selectedArchiveIndex: Math.min(prev.selectedArchiveIndex + 1, maxArchiveIndex),
        }));
        return;
      }

      if (key.upArrow || input === 'k') {
        setState(prev => ({
          ...prev,
          selectedArchiveIndex: Math.max(prev.selectedArchiveIndex - 1, 0),
        }));
        return;
      }

      // Enter - Expand/collapse
      if (key.return) {
        const task = state.archive[state.selectedArchiveIndex];
        if (task) {
          setState(prev => {
            const newExpanded = new Set(prev.expandedArchiveIds);
            if (newExpanded.has(task.id)) {
              newExpanded.delete(task.id);
            } else {
              newExpanded.add(task.id);
            }
            return { ...prev, expandedArchiveIds: newExpanded };
          });
        }
        return;
      }

      // r key for restore (use 'R' to avoid conflict with refresh)
      if (input === 'R') {
        if (state.archive.length === 0) {
          showStatus(setState, 'No archived tasks', 'error');
          return;
        }
        setState(prev => ({ ...prev, mode: 'archive-restore', archiveRestoreColumnIndex: 0 }));
        return;
      }

      // d - Delete permanently
      if (input === 'd') {
        if (state.archive.length === 0) {
          showStatus(setState, 'No archived tasks', 'error');
          return;
        }
        setState(prev => ({ ...prev, mode: 'archive-delete-confirm' }));
        return;
      }

      // Home/End
      if (input === 'g') {
        setState(prev => ({ ...prev, selectedArchiveIndex: 0 }));
        return;
      }
      if (input === 'G') {
        setState(prev => ({ ...prev, selectedArchiveIndex: maxArchiveIndex }));
        return;
      }

      // Escape - collapse all expanded
      if (key.escape) {
        setState(prev => ({
          ...prev,
          expandedArchiveIds: new Set(),
        }));
        return;
      }
    }
  });
}
