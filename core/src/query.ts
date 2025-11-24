/**
 * Query and finder functions for boards
 * These are pure read-only functions that don't modify the board
 */

import type { Board, Column, Task } from './types';

/**
 * Find a column by ID
 * @param board - Board to search
 * @param columnId - Column ID to find
 * @returns Column or undefined
 */
export function findColumnById(board: Board, columnId: string): Column | undefined {
  return board.columns.find((col) => col.id === columnId);
}

/**
 * Find a column by title (case-insensitive)
 * @param board - Board to search
 * @param title - Column title to find
 * @returns Column or undefined
 */
export function findColumnByName(board: Board, title: string): Column | undefined {
  const normalizedTitle = title.toLowerCase();
  return board.columns.find((col) => col.title.toLowerCase() === normalizedTitle);
}

/**
 * Find a task by ID across all columns
 * @param board - Board to search
 * @param taskId - Task ID to find
 * @returns Task and column info, or undefined if not found
 */
export function findTaskById(
  board: Board,
  taskId: string
): { task: Task; column: Column; index: number } | undefined {
  for (const column of board.columns) {
    const index = column.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      return { task: column.tasks[index], column, index };
    }
  }
  return undefined;
}

/**
 * Check if a task ID already exists in a board
 * @param board - Board to check
 * @param taskId - Task ID to look for
 * @returns True if task ID exists
 */
export function taskIdExists(board: Board, taskId: string): boolean {
  return board.columns.some((col) => col.tasks.some((t) => t.id === taskId));
}

/**
 * Get all tasks from a board (across all columns)
 * @param board - Board to query
 * @returns Array of all tasks
 */
export function getAllTasks(board: Board): Task[] {
  return board.columns.flatMap((col) => col.tasks);
}

/**
 * Get tasks by tag
 * @param board - Board to query
 * @param tag - Tag to filter by
 * @returns Array of tasks with the specified tag
 */
export function getTasksByTag(board: Board, tag: string): Task[] {
  return getAllTasks(board).filter((task) => task.tags?.includes(tag));
}

/**
 * Get tasks by priority
 * @param board - Board to query
 * @param priority - Priority level to filter by
 * @returns Array of tasks with the specified priority
 */
export function getTasksByPriority(
  board: Board,
  priority: 'low' | 'medium' | 'high' | 'critical'
): Task[] {
  return getAllTasks(board).filter((task) => task.priority === priority);
}

/**
 * Get tasks by assignee
 * @param board - Board to query
 * @param assignee - Assignee name to filter by
 * @returns Array of tasks assigned to the specified person
 */
export function getTasksByAssignee(board: Board, assignee: string): Task[] {
  return getAllTasks(board).filter((task) => task.assignee === assignee);
}

/**
 * Search tasks by title or description (case-insensitive)
 * @param board - Board to search
 * @param query - Search query string
 * @returns Array of tasks matching the query
 */
export function searchTasks(board: Board, query: string): Task[] {
  const normalizedQuery = query.toLowerCase();
  return getAllTasks(board).filter(
    (task) =>
      task.title.toLowerCase().includes(normalizedQuery) ||
      task.description?.toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Get task count for a column
 * @param board - Board to query
 * @param columnId - Column ID
 * @returns Number of tasks in the column, or 0 if column not found
 */
export function getColumnTaskCount(board: Board, columnId: string): number {
  const column = findColumnById(board, columnId);
  return column ? column.tasks.length : 0;
}

/**
 * Get total task count across all columns
 * @param board - Board to query
 * @returns Total number of tasks
 */
export function getTotalTaskCount(board: Board): number {
  return board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
}

/**
 * Check if a column exists
 * @param board - Board to check
 * @param columnId - Column ID to look for
 * @returns True if column exists
 */
export function columnExists(board: Board, columnId: string): boolean {
  return board.columns.some((col) => col.id === columnId);
}

/**
 * Find tasks with incomplete subtasks
 * @param board - Board to query
 * @returns Array of tasks that have at least one incomplete subtask
 */
export function getTasksWithIncompleteSubtasks(board: Board): Task[] {
  return getAllTasks(board).filter(
    (task) => task.subtasks && task.subtasks.some((st) => !st.completed)
  );
}

/**
 * Find overdue tasks
 * @param board - Board to query
 * @param currentDate - Current date to compare against (defaults to now)
 * @returns Array of tasks past their due date
 */
export function getOverdueTasks(board: Board, currentDate: Date = new Date()): Task[] {
  return getAllTasks(board).filter((task) => {
    if (!task.dueDate) return false;
    const dueDate = new Date(task.dueDate);
    return dueDate < currentDate;
  });
}
