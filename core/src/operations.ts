/**
 * Pure board mutation operations
 * These functions return new board objects without side effects
 */

import type { Board, Task, Subtask } from './types';
import { findColumnById, findTaskById } from './query';
import { generateNextTaskId, generateNextSubtaskId } from './idGen';

/**
 * Input for creating a new task
 * Only title is required - all other fields are optional
 */
export interface TaskInput {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  assignee?: string;
  dueDate?: string;
  relatedFiles?: string[];
  template?: 'bug' | 'feature' | 'refactor';
  subtasks?: string[]; // Just titles - IDs are auto-generated
}

/**
 * Input for patching an existing task
 * All fields are optional - only provided fields are updated
 */
export interface TaskPatch {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null; // null to remove
  tags?: string[] | null;
  assignee?: string | null;
  dueDate?: string | null;
  relatedFiles?: string[] | null;
  template?: 'bug' | 'feature' | 'refactor' | null;
}

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
 * @param board - Board to modify
 * @param columnId - Target column ID
 * @param input - Task input (title required, all other fields optional)
 */
export function addTask(
  board: Board,
  columnId: string,
  input: TaskInput
): BoardOperationResult {
  const column = findColumnById(board, columnId);
  if (!column) {
    return { success: false, error: `Column ${columnId} not found` };
  }

  if (!input.title || input.title.trim() === '') {
    return { success: false, error: 'Task title is required' };
  }

  const newTaskId = generateNextTaskId(board);

  // Generate subtasks with auto-generated IDs
  const subtasks: Subtask[] | undefined = input.subtasks?.map((title, index) => ({
    id: `${newTaskId}-${index + 1}`,
    title: title.trim(),
    completed: false,
  }));

  const newTask: Task = {
    id: newTaskId,
    title: input.title.trim(),
    ...(input.description && { description: input.description.trim() }),
    ...(input.priority && { priority: input.priority }),
    ...(input.tags && input.tags.length > 0 && { tags: input.tags }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.dueDate && { dueDate: input.dueDate }),
    ...(input.relatedFiles && input.relatedFiles.length > 0 && { relatedFiles: input.relatedFiles }),
    ...(input.template && { template: input.template }),
    ...(subtasks && subtasks.length > 0 && { subtasks }),
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

/**
 * Patch a task with partial updates
 * Only provided fields are updated - undefined fields are unchanged
 * Fields set to null are removed from the task
 * @param board - Board to modify
 * @param taskId - Task ID to patch (searches all columns)
 * @param patch - Partial task updates
 */
export function patchTask(
  board: Board,
  taskId: string,
  patch: TaskPatch
): BoardOperationResult {
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const { task, column } = taskInfo;

  // Build updated task, handling null values as deletions
  const updatedTask: Task = { ...task };

  if (patch.title !== undefined) {
    updatedTask.title = patch.title.trim();
  }
  if (patch.description !== undefined) {
    if (patch.description === null) {
      delete updatedTask.description;
    } else {
      updatedTask.description = patch.description.trim();
    }
  }
  if (patch.priority !== undefined) {
    if (patch.priority === null) {
      delete updatedTask.priority;
    } else {
      updatedTask.priority = patch.priority;
    }
  }
  if (patch.tags !== undefined) {
    if (patch.tags === null || patch.tags.length === 0) {
      delete updatedTask.tags;
    } else {
      updatedTask.tags = patch.tags;
    }
  }
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) {
      delete updatedTask.assignee;
    } else {
      updatedTask.assignee = patch.assignee;
    }
  }
  if (patch.dueDate !== undefined) {
    if (patch.dueDate === null) {
      delete updatedTask.dueDate;
    } else {
      updatedTask.dueDate = patch.dueDate;
    }
  }
  if (patch.relatedFiles !== undefined) {
    if (patch.relatedFiles === null || patch.relatedFiles.length === 0) {
      delete updatedTask.relatedFiles;
    } else {
      updatedTask.relatedFiles = patch.relatedFiles;
    }
  }
  if (patch.template !== undefined) {
    if (patch.template === null) {
      delete updatedTask.template;
    } else {
      updatedTask.template = patch.template;
    }
  }

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== column.id) return col;
      return {
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Add a subtask to a task
 * @param board - Board to modify
 * @param taskId - Parent task ID
 * @param title - Subtask title
 */
export function addSubtask(
  board: Board,
  taskId: string,
  title: string
): BoardOperationResult {
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  if (!title || title.trim() === '') {
    return { success: false, error: 'Subtask title is required' };
  }

  const { task, column } = taskInfo;
  const existingIds = task.subtasks?.map((st) => st.id) || [];
  const newSubtaskId = generateNextSubtaskId(taskId, existingIds);

  const newSubtask: Subtask = {
    id: newSubtaskId,
    title: title.trim(),
    completed: false,
  };

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
            subtasks: [...(t.subtasks || []), newSubtask],
          };
        }),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Delete a subtask from a task
 * @param board - Board to modify
 * @param taskId - Parent task ID
 * @param subtaskId - Subtask ID to delete
 */
export function deleteSubtask(
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

  const subtaskExists = task.subtasks.some((st) => st.id === subtaskId);
  if (!subtaskExists) {
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
          const remainingSubtasks = t.subtasks!.filter((st) => st.id !== subtaskId);
          if (remainingSubtasks.length === 0) {
            const { subtasks, ...taskWithoutSubtasks } = t;
            return taskWithoutSubtasks;
          }
          return { ...t, subtasks: remainingSubtasks };
        }),
      };
    }),
  };

  return { success: true, board: newBoard };
}

/**
 * Update a subtask's title
 * @param board - Board to modify
 * @param taskId - Parent task ID
 * @param subtaskId - Subtask ID to update
 * @param title - New subtask title
 */
export function updateSubtask(
  board: Board,
  taskId: string,
  subtaskId: string,
  title: string
): BoardOperationResult {
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  if (!title || title.trim() === '') {
    return { success: false, error: 'Subtask title is required' };
  }

  const { task, column } = taskInfo;
  if (!task.subtasks || task.subtasks.length === 0) {
    return { success: false, error: `Task ${taskId} has no subtasks` };
  }

  const subtaskExists = task.subtasks.some((st) => st.id === subtaskId);
  if (!subtaskExists) {
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
              return { ...st, title: title.trim() };
            }),
          };
        }),
      };
    }),
  };

  return { success: true, board: newBoard };
}
