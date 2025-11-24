import {
  extractTaskIdNumber,
  getMaxTaskIdNumber,
  generateNextTaskId,
  generateSubtaskId,
  generateNextSubtaskId,
  isValidTaskId,
  isValidSubtaskId,
  getParentTaskId
} from '../idGen';
import type { Board } from '../types';

describe('ID Generation Utilities', () => {
  let mockBoard: Board;

  beforeEach(() => {
    mockBoard = {
      title: 'Test Board',
      type: 'board',
      columns: [
        {
          id: 'col1',
          title: 'To Do',
          tasks: [
            { id: 'task-1', title: 'Task 1', description: '' },
            { id: 'task-5', title: 'Task 5', description: '' },
            { id: 'task-10', title: 'Task 10', description: '' }
          ]
        },
        {
          id: 'col2',
          title: 'Done',
          tasks: [
            { id: 'task-3', title: 'Task 3', description: '' }
          ]
        }
      ]
    };
  });

  describe('extractTaskIdNumber', () => {
    it('should extract number from task ID', () => {
      expect(extractTaskIdNumber('task-1')).toBe(1);
      expect(extractTaskIdNumber('task-42')).toBe(42);
      expect(extractTaskIdNumber('task-999')).toBe(999);
    });

    it('should return 0 for invalid task ID', () => {
      expect(extractTaskIdNumber('invalid')).toBe(0);
      expect(extractTaskIdNumber('task-')).toBe(0);
      expect(extractTaskIdNumber('task-abc')).toBe(0);
    });

    it('should handle subtask IDs', () => {
      expect(extractTaskIdNumber('task-42-1')).toBe(42);
      expect(extractTaskIdNumber('task-5-10')).toBe(5);
    });
  });

  describe('getMaxTaskIdNumber', () => {
    it('should return highest task ID number', () => {
      expect(getMaxTaskIdNumber(mockBoard)).toBe(10);
    });

    it('should return 0 for empty board', () => {
      const emptyBoard: Board = {
        title: 'Empty',
        type: 'board',
        columns: [{ id: 'col1', title: 'Empty', tasks: [] }]
      };
      expect(getMaxTaskIdNumber(emptyBoard)).toBe(0);
    });

    it('should handle non-sequential IDs', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          {
            id: 'col1',
            title: 'Col',
            tasks: [
              { id: 'task-100', title: 'Task', description: '' },
              { id: 'task-5', title: 'Task', description: '' }
            ]
          }
        ]
      };
      expect(getMaxTaskIdNumber(board)).toBe(100);
    });
  });

  describe('generateNextTaskId', () => {
    it('should generate next sequential task ID', () => {
      expect(generateNextTaskId(mockBoard)).toBe('task-11');
    });

    it('should start at task-1 for empty board', () => {
      const emptyBoard: Board = {
        title: 'Empty',
        type: 'board',
        columns: [{ id: 'col1', title: 'Empty', tasks: [] }]
      };
      expect(generateNextTaskId(emptyBoard)).toBe('task-1');
    });

    it('should handle gaps in task IDs', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          {
            id: 'col1',
            title: 'Col',
            tasks: [
              { id: 'task-1', title: 'Task', description: '' },
              { id: 'task-10', title: 'Task', description: '' }
            ]
          }
        ]
      };
      expect(generateNextTaskId(board)).toBe('task-11');
    });
  });

  describe('generateSubtaskId', () => {
    it('should generate subtask ID from task ID and index', () => {
      expect(generateSubtaskId('task-1', 0)).toBe('task-1-0');
      expect(generateSubtaskId('task-42', 5)).toBe('task-42-5');
    });

    it('should handle large indices', () => {
      expect(generateSubtaskId('task-1', 100)).toBe('task-1-100');
    });
  });

  describe('generateNextSubtaskId', () => {
    it('should generate next subtask ID', () => {
      const existing = ['task-1-1', 'task-1-2'];
      expect(generateNextSubtaskId('task-1', existing)).toBe('task-1-3');
    });

    it('should handle empty subtask list', () => {
      expect(generateNextSubtaskId('task-1', [])).toBe('task-1-1');
    });

    it('should handle non-sequential subtask IDs', () => {
      const existing = ['task-1-1', 'task-1-5', 'task-1-3'];
      expect(generateNextSubtaskId('task-1', existing)).toBe('task-1-6');
    });

    it('should ignore subtasks from other tasks', () => {
      const existing = ['task-1-1', 'task-2-10', 'task-1-2'];
      expect(generateNextSubtaskId('task-1', existing)).toBe('task-1-3');
    });

    it('should handle invalid subtask IDs', () => {
      const existing = ['task-1-1', 'invalid', 'task-1-2'];
      expect(generateNextSubtaskId('task-1', existing)).toBe('task-1-3');
    });
  });

  describe('isValidTaskId', () => {
    it('should validate correct task IDs', () => {
      expect(isValidTaskId('task-1')).toBe(true);
      expect(isValidTaskId('task-42')).toBe(true);
      expect(isValidTaskId('task-999')).toBe(true);
    });

    it('should reject invalid task IDs', () => {
      expect(isValidTaskId('task-')).toBe(false);
      expect(isValidTaskId('task-abc')).toBe(false);
      expect(isValidTaskId('invalid')).toBe(false);
      expect(isValidTaskId('1-task')).toBe(false);
      expect(isValidTaskId('task-1-1')).toBe(false); // subtask format
    });

    it('should reject empty or whitespace', () => {
      expect(isValidTaskId('')).toBe(false);
      expect(isValidTaskId(' ')).toBe(false);
    });
  });

  describe('isValidSubtaskId', () => {
    it('should validate correct subtask IDs', () => {
      expect(isValidSubtaskId('task-1-1')).toBe(true);
      expect(isValidSubtaskId('task-42-5')).toBe(true);
      expect(isValidSubtaskId('task-999-100')).toBe(true);
    });

    it('should reject invalid subtask IDs', () => {
      expect(isValidSubtaskId('task-1')).toBe(false);
      expect(isValidSubtaskId('task-1-')).toBe(false);
      expect(isValidSubtaskId('task-1-abc')).toBe(false);
      expect(isValidSubtaskId('invalid')).toBe(false);
      expect(isValidSubtaskId('task-1-1-1')).toBe(false); // too many levels
    });

    it('should reject empty or whitespace', () => {
      expect(isValidSubtaskId('')).toBe(false);
      expect(isValidSubtaskId(' ')).toBe(false);
    });
  });

  describe('getParentTaskId', () => {
    it('should extract parent task ID from subtask ID', () => {
      expect(getParentTaskId('task-1-1')).toBe('task-1');
      expect(getParentTaskId('task-42-5')).toBe('task-42');
      expect(getParentTaskId('task-999-100')).toBe('task-999');
    });

    it('should return undefined for invalid subtask IDs', () => {
      expect(getParentTaskId('task-1')).toBeUndefined();
      expect(getParentTaskId('invalid')).toBeUndefined();
      expect(getParentTaskId('task-1-')).toBeUndefined();
      expect(getParentTaskId('task-1-abc')).toBeUndefined();
    });

    it('should return undefined for task IDs (not subtask IDs)', () => {
      expect(getParentTaskId('task-42')).toBeUndefined();
    });
  });
});
