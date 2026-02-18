import {
  findColumnById,
  findColumnByName,
  findTaskById,
  taskIdExists,
  getAllTasks,
  getTasksByTag,
  getTasksByPriority,
  getTasksByAssignee,
  searchTasks,
  getColumnTaskCount,
  getTotalTaskCount,
  columnExists,
  findCompletionColumn,
  isCompletionColumn,
  getTasksWithIncompleteSubtasks,
  getOverdueTasks
} from '../query';
import type { Board } from '../types';

describe('Query Functions', () => {
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
            {
              id: 'task-1',
              title: 'Task 1',
              description: 'Description 1',
              tags: ['bug', 'urgent'],
              priority: 'high',
              assignee: 'Alice',
              dueDate: '2024-01-01T00:00:00Z',
              subtasks: [
                { id: 'task-1-1', title: 'Subtask 1', completed: false },
                { id: 'task-1-2', title: 'Subtask 2', completed: true }
              ]
            },
            {
              id: 'task-2',
              title: 'Task 2',
              description: 'Another task',
              tags: ['feature'],
              priority: 'medium',
              assignee: 'Bob'
            }
          ]
        },
        {
          id: 'col2',
          title: 'In Progress',
          tasks: [
            {
              id: 'task-3',
              title: 'Task 3',
              description: 'In progress task',
              tags: ['bug'],
              priority: 'high',
              assignee: 'Alice',
              dueDate: '2025-12-31T00:00:00Z'
            }
          ]
        },
        {
          id: 'col3',
          title: 'Done',
          tasks: []
        }
      ]
    };
  });

  describe('findColumnById', () => {
    it('should find column by ID', () => {
      const column = findColumnById(mockBoard, 'col1');
      expect(column).toBeDefined();
      expect(column!.id).toBe('col1');
      expect(column!.title).toBe('To Do');
    });

    it('should return undefined for non-existent column', () => {
      const column = findColumnById(mockBoard, 'col99');
      expect(column).toBeUndefined();
    });
  });

  describe('findColumnByName', () => {
    it('should find column by exact name', () => {
      const column = findColumnByName(mockBoard, 'To Do');
      expect(column).toBeDefined();
      expect(column!.id).toBe('col1');
    });

    it('should find column by name case-insensitively', () => {
      const column = findColumnByName(mockBoard, 'to do');
      expect(column).toBeDefined();
      expect(column!.id).toBe('col1');
    });

    it('should return undefined for non-existent column name', () => {
      const column = findColumnByName(mockBoard, 'NonExistent');
      expect(column).toBeUndefined();
    });
  });

  describe('findTaskById', () => {
    it('should find task by ID', () => {
      const result = findTaskById(mockBoard, 'task-1');
      expect(result).toBeDefined();
      expect(result!.task.id).toBe('task-1');
      expect(result!.column.id).toBe('col1');
      expect(result!.index).toBe(0);
    });

    it('should find task in different column', () => {
      const result = findTaskById(mockBoard, 'task-3');
      expect(result).toBeDefined();
      expect(result!.task.id).toBe('task-3');
      expect(result!.column.id).toBe('col2');
      expect(result!.index).toBe(0);
    });

    it('should return undefined for non-existent task', () => {
      const result = findTaskById(mockBoard, 'task-99');
      expect(result).toBeUndefined();
    });
  });

  describe('taskIdExists', () => {
    it('should return true for existing task', () => {
      expect(taskIdExists(mockBoard, 'task-1')).toBe(true);
      expect(taskIdExists(mockBoard, 'task-3')).toBe(true);
    });

    it('should return false for non-existent task', () => {
      expect(taskIdExists(mockBoard, 'task-99')).toBe(false);
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks from all columns', () => {
      const tasks = getAllTasks(mockBoard);
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.id)).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('should return empty array for board with no tasks', () => {
      const emptyBoard: Board = {
        title: 'Empty',
        type: 'board',
        columns: [{ id: 'col1', title: 'Empty', tasks: [] }]
      };
      const tasks = getAllTasks(emptyBoard);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('getTasksByTag', () => {
    it('should return tasks with specified tag', () => {
      const tasks = getTasksByTag(mockBoard, 'bug');
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
    });

    it('should return empty array for non-existent tag', () => {
      const tasks = getTasksByTag(mockBoard, 'nonexistent');
      expect(tasks).toHaveLength(0);
    });

    it('should return only tasks with exact tag match', () => {
      const tasks = getTasksByTag(mockBoard, 'feature');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-2');
    });
  });

  describe('getTasksByPriority', () => {
    it('should return tasks with specified priority', () => {
      const tasks = getTasksByPriority(mockBoard, 'high');
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
    });

    it('should return medium priority tasks', () => {
      const tasks = getTasksByPriority(mockBoard, 'medium');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-2');
    });

    it('should return empty array for priority with no tasks', () => {
      const tasks = getTasksByPriority(mockBoard, 'low');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('getTasksByAssignee', () => {
    it('should return tasks assigned to specified person', () => {
      const tasks = getTasksByAssignee(mockBoard, 'Alice');
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.id)).toEqual(['task-1', 'task-3']);
    });

    it('should return tasks for different assignee', () => {
      const tasks = getTasksByAssignee(mockBoard, 'Bob');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-2');
    });

    it('should return empty array for non-existent assignee', () => {
      const tasks = getTasksByAssignee(mockBoard, 'Charlie');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('searchTasks', () => {
    it('should find tasks by title', () => {
      const tasks = searchTasks(mockBoard, 'Task 1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('should find tasks by description', () => {
      const tasks = searchTasks(mockBoard, 'progress');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-3');
    });

    it('should search case-insensitively', () => {
      const tasks = searchTasks(mockBoard, 'TASK');
      expect(tasks).toHaveLength(3);
    });

    it('should search partial matches', () => {
      const tasks = searchTasks(mockBoard, 'ano');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-2');
    });

    it('should return empty array for no matches', () => {
      const tasks = searchTasks(mockBoard, 'nonexistent');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('getColumnTaskCount', () => {
    it('should return correct task count for column', () => {
      expect(getColumnTaskCount(mockBoard, 'col1')).toBe(2);
      expect(getColumnTaskCount(mockBoard, 'col2')).toBe(1);
      expect(getColumnTaskCount(mockBoard, 'col3')).toBe(0);
    });

    it('should return 0 for non-existent column', () => {
      expect(getColumnTaskCount(mockBoard, 'col99')).toBe(0);
    });
  });

  describe('getTotalTaskCount', () => {
    it('should return total task count across all columns', () => {
      expect(getTotalTaskCount(mockBoard)).toBe(3);
    });

    it('should return 0 for empty board', () => {
      const emptyBoard: Board = {
        title: 'Empty',
        type: 'board',
        columns: [{ id: 'col1', title: 'Empty', tasks: [] }]
      };
      expect(getTotalTaskCount(emptyBoard)).toBe(0);
    });
  });

  describe('columnExists', () => {
    it('should return true for existing column', () => {
      expect(columnExists(mockBoard, 'col1')).toBe(true);
      expect(columnExists(mockBoard, 'col3')).toBe(true);
    });

    it('should return false for non-existent column', () => {
      expect(columnExists(mockBoard, 'col99')).toBe(false);
    });
  });

  describe('findCompletionColumn', () => {
    it('should find column with explicit completionColumn property', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'Done', completionColumn: true, tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('done');
    });

    it('should prefer explicit completionColumn over name-based detection', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'done', title: 'Done', tasks: [] },
          { id: 'deployed', title: 'Deployed', completionColumn: true, tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('deployed');
    });

    it('should fall back to name-based detection for "done"', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'Done', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('done');
    });

    it('should fall back to name-based detection for "complete"', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'completed', title: 'Completed', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('completed');
    });

    it('should fall back to name-based detection for "finished"', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'finished', title: 'Finished', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('finished');
    });

    it('should fall back to name-based detection for "closed"', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'open', title: 'Open', tasks: [] },
          { id: 'closed', title: 'Closed', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('closed');
    });

    it('should be case-insensitive for name-based detection', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'DONE', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('done');
    });

    it('should match pattern in column ID when not in title', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'Finished Tasks', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('done');
    });

    it('should fall back to last column when no explicit or pattern match', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'inbox', title: 'Inbox', tasks: [] },
          { id: 'waiting', title: 'Waiting', tasks: [] },
          { id: 'archived', title: 'Archived', tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('archived');
    });

    it('should work with non-English column names when explicit', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'À faire', tasks: [] },
          { id: 'termine', title: 'Terminé', completionColumn: true, tasks: [] }
        ]
      };
      const column = findCompletionColumn(board);
      expect(column).toBeDefined();
      expect(column!.id).toBe('termine');
    });

    it('should return undefined for empty board', () => {
      const board: Board = {
        title: 'Empty',
        type: 'board',
        columns: []
      };
      const column = findCompletionColumn(board);
      expect(column).toBeUndefined();
    });
  });

  describe('isCompletionColumn', () => {
    it('should return true for explicit completion column', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'Done', completionColumn: true, tasks: [] }
        ]
      };
      expect(isCompletionColumn(board, 'done')).toBe(true);
      expect(isCompletionColumn(board, 'todo')).toBe(false);
    });

    it('should return true for name-based detected column', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'todo', title: 'To Do', tasks: [] },
          { id: 'done', title: 'Done', tasks: [] }
        ]
      };
      expect(isCompletionColumn(board, 'done')).toBe(true);
    });

    it('should return true for last column fallback', () => {
      const board: Board = {
        title: 'Test',
        type: 'board',
        columns: [
          { id: 'inbox', title: 'Inbox', tasks: [] },
          { id: 'archived', title: 'Archived', tasks: [] }
        ]
      };
      expect(isCompletionColumn(board, 'archived')).toBe(true);
      expect(isCompletionColumn(board, 'inbox')).toBe(false);
    });

    it('should return false for non-existent column', () => {
      expect(isCompletionColumn(mockBoard, 'nonexistent')).toBe(false);
    });
  });

  describe('getTasksWithIncompleteSubtasks', () => {
    it('should return tasks with incomplete subtasks', () => {
      const tasks = getTasksWithIncompleteSubtasks(mockBoard);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('should return empty array when no tasks have incomplete subtasks', () => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: true },
        { id: 'task-1-2', title: 'Subtask 2', completed: true }
      ];
      const tasks = getTasksWithIncompleteSubtasks(mockBoard);
      expect(tasks).toHaveLength(0);
    });

    it('should not include tasks without subtasks', () => {
      const tasks = getTasksWithIncompleteSubtasks(mockBoard);
      expect(tasks.some(t => t.id === 'task-2')).toBe(false);
    });
  });

  describe('getOverdueTasks', () => {
    it('should return overdue tasks', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      const tasks = getOverdueTasks(mockBoard, now);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('should not include future tasks', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      const tasks = getOverdueTasks(mockBoard, now);
      expect(tasks.some(t => t.id === 'task-3')).toBe(false);
    });

    it('should not include tasks without due dates', () => {
      const now = new Date('2024-06-01T00:00:00Z');
      const tasks = getOverdueTasks(mockBoard, now);
      expect(tasks.some(t => t.id === 'task-2')).toBe(false);
    });

    it('should use current date by default', () => {
      // task-1 is overdue (2024-01-01), task-3 is future (2025-12-31)
      const tasks = getOverdueTasks(mockBoard);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });
  });
});
