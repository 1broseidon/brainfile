/**
 * ID generation utilities for tasks and other entities
 */

import type { Board } from './types';

/**
 * Extract numeric ID from task ID string
 * @param taskId - Task ID like "task-123"
 * @returns Numeric portion or 0 if not parseable
 */
export function extractTaskIdNumber(taskId: string): number {
  const match = taskId.match(/task-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Get the highest task ID number from a board
 * @param board - Board to scan
 * @returns Highest task ID number found, or 0 if no tasks
 */
export function getMaxTaskIdNumber(board: Board): number {
  const allTaskIds = board.columns.flatMap((col) =>
    col.tasks.map((t) => extractTaskIdNumber(t.id))
  );
  return Math.max(0, ...allTaskIds);
}

/**
 * Generate the next task ID for a board
 * @param board - Board to generate ID for
 * @returns Next task ID like "task-42"
 */
export function generateNextTaskId(board: Board): string {
  const maxId = getMaxTaskIdNumber(board);
  return `task-${maxId + 1}`;
}

/**
 * Generate a subtask ID based on a task ID and index
 * @param taskId - Parent task ID
 * @param index - Subtask index
 * @returns Subtask ID like "task-42-1"
 */
export function generateSubtaskId(taskId: string, index: number): string {
  return `${taskId}-${index}`;
}

/**
 * Generate the next subtask ID for a task
 * @param taskId - Parent task ID
 * @param existingSubtaskIds - Array of existing subtask IDs
 * @returns Next subtask ID
 */
export function generateNextSubtaskId(taskId: string, existingSubtaskIds: string[]): string {
  const indices = existingSubtaskIds
    .map((id) => {
      const match = id.match(new RegExp(`${taskId}-(\\d+)`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => n > 0);

  const maxIndex = indices.length > 0 ? Math.max(...indices) : 0;
  return generateSubtaskId(taskId, maxIndex + 1);
}

/**
 * Validate task ID format
 * @param taskId - Task ID to validate
 * @returns True if valid format (task-N)
 */
export function isValidTaskId(taskId: string): boolean {
  return /^task-\d+$/.test(taskId);
}

/**
 * Validate subtask ID format
 * @param subtaskId - Subtask ID to validate
 * @returns True if valid format (task-N-M)
 */
export function isValidSubtaskId(subtaskId: string): boolean {
  return /^task-\d+-\d+$/.test(subtaskId);
}

/**
 * Extract parent task ID from subtask ID
 * @param subtaskId - Subtask ID like "task-42-1"
 * @returns Parent task ID like "task-42", or undefined if invalid
 */
export function getParentTaskId(subtaskId: string): string | undefined {
  const match = subtaskId.match(/^(task-\d+)-\d+$/);
  return match ? match[1] : undefined;
}
