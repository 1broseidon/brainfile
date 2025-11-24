/**
 * Pure board mutation operations
 * These functions return new board objects without side effects
 */

import type { Board, Task } from './types';
import { findColumnById, findTaskById } from './query';
import { generateNextTaskId } from './idGen';

/**
 * Result of a board operation
 */
export interface BoardOperationResult {
  success: boolean;
  board?: Board;
  error?: string;
}

/**
 * Move a task from one column to another at a specific index
 */
export function moveTask(
  board: Board,
  taskId: string,
  fromColumnId: string,
  toColumnId: string,
  toIndex: number
): BoardOperationResult {
  const fromColumn = findColumnById(board, fromColumnId);
  if (!fromColumn) {
    return { success: false, error: `Source column ${fromColumnId} not found` };
  }

  const toColumn = findColumnById(board, toColumnId);
  if (!toColumn) {
    return { success: false, error: `Target column ${toColumnId} not found` };
  }

  const taskIndex = fromColumn.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: `Task ${taskId} not found in column ${fromColumnId}` };
  }

  const task = fromColumn.tasks[taskIndex];

  // Create new columns with task moved
  const newColumns = board.columns.map((col) => {
    if (col.id === fromColumnId && col.id === toColumnId) {
      // Same column - reorder
      const tasks = [...col.tasks];
      tasks.splice(taskIndex, 1);
      tasks.splice(toIndex, 0, task);
      return { ...col, tasks };
    } else if (col.id === fromColumnId) {
      // Remove from source
      return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
    } else if (col.id === toColumnId) {
      // Add to target
      const tasks = [...col.tasks];
      tasks.splice(toIndex, 0, task);
      return { ...col, tasks };
    }
    return col;
  });

  return { success: true, board: { ...board, columns: newColumns } };
}

/**
 * Add a new task to a column
 */
export function addTask(
  board: Board,
  columnId: string,
  title: string,
  description: string = ''
): BoardOperationResult {
  const column = findColumnById(board, columnId);
  if (!column) {
    return { success: false, error: `Column ${columnId} not found` };
  }

  const newTaskId = generateNextTaskId(board);
  const newTask: Task = {
    id: newTaskId,
    title: title.trim(),
    description: description.trim(),
  };

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      return { ...col, tasks: [...col.tasks, newTask] };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Update a task's title and description
 */
export function updateTask(
  board: Board,
  columnId: string,
  taskId: string,
  newTitle: string,
  newDescription: string
): BoardOperationResult {
  const column = findColumnById(board, columnId);
  if (!column) {
    return { success: false, error: `Column ${columnId} not found` };
  }

  const taskIndex = column.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: `Task ${taskId} not found in column ${columnId}` };
  }

  // Create new board with updated task
  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((task) => {
          if (task.id !== taskId) return task;
          return { ...task, title: newTitle, description: newDescription };
        }),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Delete a task from a column
 */
export function deleteTask(
  board: Board,
  columnId: string,
  taskId: string
): BoardOperationResult {
  const column = findColumnById(board, columnId);
  if (!column) {
    return { success: false, error: `Column ${columnId} not found` };
  }

  const taskExists = column.tasks.some((t) => t.id === taskId);
  if (!taskExists) {
    return { success: false, error: `Task ${taskId} not found in column ${columnId}` };
  }

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.filter((t) => t.id !== taskId),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Toggle a subtask's completed status
 */
export function toggleSubtask(
  board: Board,
  taskId: string,
  subtaskId: string
): BoardOperationResult {
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const { task, column } = taskInfo;
  if (!task.subtasks || task.subtasks.length === 0) {
    return { success: false, error: `Task ${taskId} has no subtasks` };
  }

  const subtaskIndex = task.subtasks.findIndex((st) => st.id === subtaskId);
  if (subtaskIndex === -1) {
    return { success: false, error: `Subtask ${subtaskId} not found` };
  }

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== column.id) return col;
      return {
        ...col,
        tasks: col.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            subtasks: t.subtasks!.map((st) => {
              if (st.id !== subtaskId) return st;
              return { ...st, completed: !st.completed };
            }),
          };
        }),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Update board title
 */
export function updateBoardTitle(board: Board, newTitle: string): BoardOperationResult {
  return {
    success: true,
    board: { ...board, title: newTitle },
  };
}

/**
 * Update stats configuration
 */
export function updateStatsConfig(
  board: Board,
  columns: string[]
): BoardOperationResult {
  return {
    success: true,
    board: {
      ...board,
      statsConfig: { columns },
    },
  };
}

/**
 * Archive a task (move from column to archive)
 */
export function archiveTask(
  board: Board,
  columnId: string,
  taskId: string
): BoardOperationResult {
  const column = findColumnById(board, columnId);
  if (!column) {
    return { success: false, error: `Column ${columnId} not found` };
  }

  const task = column.tasks.find((t) => t.id === taskId);
  if (!task) {
    return { success: false, error: `Task ${taskId} not found in column ${columnId}` };
  }

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        tasks: col.tasks.filter((t) => t.id !== taskId),
      };
    }),
    archive: [...(board.archive || []), task],
  };

  return { success: true, board: newBoard };
}

/**
 * Restore a task from archive to a column
 */
export function restoreTask(
  board: Board,
  taskId: string,
  toColumnId: string
): BoardOperationResult {
  if (!board.archive || board.archive.length === 0) {
    return { success: false, error: 'Archive is empty' };
  }

  const task = board.archive.find((t) => t.id === taskId);
  if (!task) {
    return { success: false, error: `Task ${taskId} not found in archive` };
  }

  const toColumn = findColumnById(board, toColumnId);
  if (!toColumn) {
    return { success: false, error: `Target column ${toColumnId} not found` };
  }

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== toColumnId) return col;
      return {
        ...col,
        tasks: [...col.tasks, task],
      };
    }),
    archive: board.archive.filter((t) => t.id !== taskId),
  };

  return { success: true, board: newBoard };
}
