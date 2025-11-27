import {
  isDoneColumn,
  checkIncompleteSubtasks,
  mcpCheckIncompleteSubtasks,
  mcpError,
  ExitCode,
} from '../utils/errorHandler';
import type { Task } from '@brainfile/core';

describe('errorHandler', () => {
  describe('isDoneColumn', () => {
    it('should detect "done" column by id', () => {
      expect(isDoneColumn({ id: 'done', title: 'Some Title' })).toBe(true);
    });

    it('should detect "done" column by title (case-insensitive)', () => {
      expect(isDoneColumn({ id: 'some-id', title: 'Done' })).toBe(true);
      expect(isDoneColumn({ id: 'some-id', title: 'DONE' })).toBe(true);
      expect(isDoneColumn({ id: 'some-id', title: 'done' })).toBe(true);
    });

    it('should detect "completed" column', () => {
      expect(isDoneColumn({ id: 'completed', title: 'Some' })).toBe(true);
      expect(isDoneColumn({ id: 'some', title: 'Completed' })).toBe(true);
    });

    it('should detect "complete" column', () => {
      expect(isDoneColumn({ id: 'complete', title: 'Some' })).toBe(true);
      expect(isDoneColumn({ id: 'some', title: 'Complete' })).toBe(true);
    });

    it('should detect "finished" column', () => {
      expect(isDoneColumn({ id: 'finished', title: 'Some' })).toBe(true);
      expect(isDoneColumn({ id: 'some', title: 'Finished' })).toBe(true);
    });

    it('should detect "closed" column', () => {
      expect(isDoneColumn({ id: 'closed', title: 'Some' })).toBe(true);
      expect(isDoneColumn({ id: 'some', title: 'Closed' })).toBe(true);
    });

    it('should not detect non-done columns', () => {
      expect(isDoneColumn({ id: 'todo', title: 'To Do' })).toBe(false);
      expect(isDoneColumn({ id: 'in-progress', title: 'In Progress' })).toBe(false);
      expect(isDoneColumn({ id: 'backlog', title: 'Backlog' })).toBe(false);
      expect(isDoneColumn({ id: 'review', title: 'Review' })).toBe(false);
    });

    it('should not match partial strings', () => {
      expect(isDoneColumn({ id: 'done-review', title: 'Done Review' })).toBe(false);
      expect(isDoneColumn({ id: 'undone', title: 'Undone' })).toBe(false);
    });
  });

  describe('checkIncompleteSubtasks', () => {
    it('should return hasIncomplete false when no subtasks', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
      };

      const result = checkIncompleteSubtasks(task);
      expect(result.hasIncomplete).toBe(false);
      expect(result.total).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.incomplete).toEqual([]);
    });

    it('should return hasIncomplete false when all subtasks complete', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        subtasks: [
          { id: 'task-1-1', title: 'Subtask 1', completed: true },
          { id: 'task-1-2', title: 'Subtask 2', completed: true },
        ],
      };

      const result = checkIncompleteSubtasks(task);
      expect(result.hasIncomplete).toBe(false);
      expect(result.total).toBe(2);
      expect(result.completed).toBe(2);
      expect(result.incomplete).toEqual([]);
    });

    it('should return hasIncomplete true when some subtasks incomplete', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        subtasks: [
          { id: 'task-1-1', title: 'Subtask 1', completed: true },
          { id: 'task-1-2', title: 'Subtask 2', completed: false },
          { id: 'task-1-3', title: 'Subtask 3', completed: false },
        ],
      };

      const result = checkIncompleteSubtasks(task);
      expect(result.hasIncomplete).toBe(true);
      expect(result.total).toBe(3);
      expect(result.completed).toBe(1);
      expect(result.incomplete).toEqual([
        { id: 'task-1-2', title: 'Subtask 2' },
        { id: 'task-1-3', title: 'Subtask 3' },
      ]);
    });

    it('should return hasIncomplete true when all subtasks incomplete', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        subtasks: [
          { id: 'task-1-1', title: 'Subtask 1', completed: false },
        ],
      };

      const result = checkIncompleteSubtasks(task);
      expect(result.hasIncomplete).toBe(true);
      expect(result.total).toBe(1);
      expect(result.completed).toBe(0);
      expect(result.incomplete).toEqual([
        { id: 'task-1-1', title: 'Subtask 1' },
      ]);
    });
  });

  describe('mcpCheckIncompleteSubtasks', () => {
    const taskWithIncomplete: Task = {
      id: 'task-1',
      title: 'Test task',
      subtasks: [
        { id: 'task-1-1', title: 'Subtask 1', completed: true },
        { id: 'task-1-2', title: 'Subtask 2', completed: false },
      ],
    };

    const taskAllComplete: Task = {
      id: 'task-2',
      title: 'Test task 2',
      subtasks: [
        { id: 'task-2-1', title: 'Subtask 1', completed: true },
      ],
    };

    it('should return undefined when target is not a done column', () => {
      const result = mcpCheckIncompleteSubtasks(taskWithIncomplete, { id: 'in-progress', title: 'In Progress' });
      expect(result).toBeUndefined();
    });

    it('should return undefined when no incomplete subtasks', () => {
      const result = mcpCheckIncompleteSubtasks(taskAllComplete, { id: 'done', title: 'Done' });
      expect(result).toBeUndefined();
    });

    it('should return warning when moving to done column with incomplete subtasks', () => {
      const result = mcpCheckIncompleteSubtasks(taskWithIncomplete, { id: 'done', title: 'Done' });
      expect(result).toBeDefined();
      expect(result!.warning).toContain('1/2 incomplete subtasks');
      expect(result!.warning).toContain('task-1-2');
      expect(result!.incompleteSubtasks).toBeDefined();
      expect(result!.incompleteSubtasks!.incomplete.length).toBe(1);
    });
  });

  describe('mcpError', () => {
    it('should create proper error structure', () => {
      const error = mcpError('Something went wrong');
      expect(error.isError).toBe(true);
      expect(error.content).toHaveLength(1);
      expect(error.content[0].type).toBe('text');
      expect(error.content[0].text).toBe('Error: Something went wrong');
    });
  });

  describe('ExitCode', () => {
    it('should have correct exit code values', () => {
      expect(ExitCode.SUCCESS).toBe(0);
      expect(ExitCode.USER_ERROR).toBe(1);
      expect(ExitCode.WARNING).toBe(0);
    });
  });
});
