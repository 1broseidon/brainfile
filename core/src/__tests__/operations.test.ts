import {
  moveTask,
  addTask,
  updateTask,
  deleteTask,
  toggleSubtask,
  updateBoardTitle,
  updateStatsConfig,
  archiveTask,
  restoreTask,
  type BoardOperationResult
} from '../operations';
import type { Board, Column, Task } from '../types';

describe('Board Operations', () => {
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
            { id: 'task-1', title: 'Task 1', description: 'Description 1' },
            { id: 'task-2', title: 'Task 2', description: 'Description 2' }
          ]
        },
        {
          id: 'col2',
          title: 'In Progress',
          tasks: [
            { id: 'task-3', title: 'Task 3', description: 'Description 3' }
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

  describe('addTask', () => {
    it('should add a new task to a column', () => {
      const result = addTask(mockBoard, 'col1', 'New Task', 'New Description');

      expect(result.success).toBe(true);
      expect(result.board).toBeDefined();
      expect(result.board!.columns[0].tasks).toHaveLength(3);
      expect(result.board!.columns[0].tasks[2].title).toBe('New Task');
      expect(result.board!.columns[0].tasks[2].description).toBe('New Description');
      expect(result.board!.columns[0].tasks[2].id).toBe('task-4');
    });

    it('should generate sequential task IDs', () => {
      let result = addTask(mockBoard, 'col1', 'Task A');
      expect(result.board!.columns[0].tasks[2].id).toBe('task-4');

      result = addTask(result.board!, 'col1', 'Task B');
      expect(result.board!.columns[0].tasks[3].id).toBe('task-5');
    });

    it('should return error for non-existent column', () => {
      const result = addTask(mockBoard, 'col99', 'New Task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Column col99 not found');
      expect(result.board).toBeUndefined();
    });

    it('should not mutate original board', () => {
      const originalTaskCount = mockBoard.columns[0].tasks.length;
      addTask(mockBoard, 'col1', 'New Task');

      expect(mockBoard.columns[0].tasks.length).toBe(originalTaskCount);
    });
  });

  describe('updateTask', () => {
    it('should update task title and description', () => {
      const result = updateTask(mockBoard, 'col1', 'task-1', 'Updated Title', 'Updated Description');

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].title).toBe('Updated Title');
      expect(result.board!.columns[0].tasks[0].description).toBe('Updated Description');
    });

    it('should return error for non-existent column', () => {
      const result = updateTask(mockBoard, 'col99', 'task-1', 'New Title', 'New Desc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Column col99 not found');
    });

    it('should return error for non-existent task', () => {
      const result = updateTask(mockBoard, 'col1', 'task-99', 'New Title', 'New Desc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found in column col1');
    });

    it('should not mutate original board', () => {
      const originalTitle = mockBoard.columns[0].tasks[0].title;
      updateTask(mockBoard, 'col1', 'task-1', 'New Title', 'New Description');

      expect(mockBoard.columns[0].tasks[0].title).toBe(originalTitle);
    });
  });

  describe('deleteTask', () => {
    it('should delete a task from a column', () => {
      const result = deleteTask(mockBoard, 'col1', 'task-1');

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(1);
      expect(result.board!.columns[0].tasks[0].id).toBe('task-2');
    });

    it('should return error for non-existent column', () => {
      const result = deleteTask(mockBoard, 'col99', 'task-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Column col99 not found');
    });

    it('should return error for non-existent task', () => {
      const result = deleteTask(mockBoard, 'col1', 'task-99');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found in column col1');
    });

    it('should not mutate original board', () => {
      const originalTaskCount = mockBoard.columns[0].tasks.length;
      deleteTask(mockBoard, 'col1', 'task-1');

      expect(mockBoard.columns[0].tasks.length).toBe(originalTaskCount);
    });
  });

  describe('moveTask', () => {
    it('should move task between different columns', () => {
      const result = moveTask(mockBoard, 'task-1', 'col1', 'col2', 0);

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(1);
      expect(result.board!.columns[1].tasks).toHaveLength(2);
      expect(result.board!.columns[1].tasks[0].id).toBe('task-1');
    });

    it('should reorder task within same column', () => {
      const result = moveTask(mockBoard, 'task-1', 'col1', 'col1', 1);

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].id).toBe('task-2');
      expect(result.board!.columns[0].tasks[1].id).toBe('task-1');
    });

    it('should move task to end of target column', () => {
      const result = moveTask(mockBoard, 'task-1', 'col1', 'col2', 1);

      expect(result.success).toBe(true);
      expect(result.board!.columns[1].tasks[1].id).toBe('task-1');
    });

    it('should return error for non-existent source column', () => {
      const result = moveTask(mockBoard, 'task-1', 'col99', 'col2', 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source column col99 not found');
    });

    it('should return error for non-existent target column', () => {
      const result = moveTask(mockBoard, 'task-1', 'col1', 'col99', 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Target column col99 not found');
    });

    it('should return error for non-existent task', () => {
      const result = moveTask(mockBoard, 'task-99', 'col1', 'col2', 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found in column col1');
    });

    it('should not mutate original board', () => {
      const originalCol1Count = mockBoard.columns[0].tasks.length;
      const originalCol2Count = mockBoard.columns[1].tasks.length;
      moveTask(mockBoard, 'task-1', 'col1', 'col2', 0);

      expect(mockBoard.columns[0].tasks.length).toBe(originalCol1Count);
      expect(mockBoard.columns[1].tasks.length).toBe(originalCol2Count);
    });
  });

  describe('toggleSubtask', () => {
    beforeEach(() => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: false },
        { id: 'task-1-2', title: 'Subtask 2', completed: true }
      ];
    });

    it('should toggle subtask completion status', () => {
      const result = toggleSubtask(mockBoard, 'task-1', 'task-1-1');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks![0].completed).toBe(true);
    });

    it('should toggle from completed to incomplete', () => {
      const result = toggleSubtask(mockBoard, 'task-1', 'task-1-2');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks![1].completed).toBe(false);
    });

    it('should return error for non-existent task', () => {
      const result = toggleSubtask(mockBoard, 'task-99', 'task-1-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should return error for task without subtasks', () => {
      const result = toggleSubtask(mockBoard, 'task-2', 'task-2-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-2 has no subtasks');
    });

    it('should return error for non-existent subtask', () => {
      const result = toggleSubtask(mockBoard, 'task-1', 'task-1-99');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subtask task-1-99 not found');
    });

    it('should not mutate original board', () => {
      const originalStatus = mockBoard.columns[0].tasks[0].subtasks![0].completed;
      toggleSubtask(mockBoard, 'task-1', 'task-1-1');

      expect(mockBoard.columns[0].tasks[0].subtasks![0].completed).toBe(originalStatus);
    });
  });

  describe('updateBoardTitle', () => {
    it('should update board title', () => {
      const result = updateBoardTitle(mockBoard, 'New Board Title');

      expect(result.success).toBe(true);
      expect(result.board!.title).toBe('New Board Title');
    });

    it('should not mutate original board', () => {
      const originalTitle = mockBoard.title;
      updateBoardTitle(mockBoard, 'New Title');

      expect(mockBoard.title).toBe(originalTitle);
    });
  });

  describe('updateStatsConfig', () => {
    it('should update stats config', () => {
      const result = updateStatsConfig(mockBoard, ['col1', 'col2']);

      expect(result.success).toBe(true);
      expect(result.board!.statsConfig).toEqual({ columns: ['col1', 'col2'] });
    });

    it('should not mutate original board', () => {
      updateStatsConfig(mockBoard, ['col1', 'col2']);

      expect(mockBoard.statsConfig).toBeUndefined();
    });
  });

  describe('archiveTask', () => {
    it('should move task from column to archive', () => {
      const result = archiveTask(mockBoard, 'col1', 'task-1');

      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks).toHaveLength(1);
      expect(result.board!.archive).toHaveLength(1);
      expect(result.board!.archive![0].id).toBe('task-1');
    });

    it('should append to existing archive', () => {
      mockBoard.archive = [{ id: 'task-99', title: 'Archived', description: '' }];
      const result = archiveTask(mockBoard, 'col1', 'task-1');

      expect(result.success).toBe(true);
      expect(result.board!.archive).toHaveLength(2);
    });

    it('should return error for non-existent column', () => {
      const result = archiveTask(mockBoard, 'col99', 'task-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Column col99 not found');
    });

    it('should return error for non-existent task', () => {
      const result = archiveTask(mockBoard, 'col1', 'task-99');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found in column col1');
    });

    it('should not mutate original board', () => {
      const originalTaskCount = mockBoard.columns[0].tasks.length;
      archiveTask(mockBoard, 'col1', 'task-1');

      expect(mockBoard.columns[0].tasks.length).toBe(originalTaskCount);
      expect(mockBoard.archive).toBeUndefined();
    });
  });

  describe('restoreTask', () => {
    beforeEach(() => {
      mockBoard.archive = [
        { id: 'task-99', title: 'Archived Task', description: 'Archived' }
      ];
    });

    it('should restore task from archive to column', () => {
      const result = restoreTask(mockBoard, 'task-99', 'col1');

      expect(result.success).toBe(true);
      expect(result.board!.archive).toHaveLength(0);
      expect(result.board!.columns[0].tasks).toHaveLength(3);
      expect(result.board!.columns[0].tasks[2].id).toBe('task-99');
    });

    it('should return error for empty archive', () => {
      mockBoard.archive = [];
      const result = restoreTask(mockBoard, 'task-99', 'col1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Archive is empty');
    });

    it('should return error for undefined archive', () => {
      mockBoard.archive = undefined;
      const result = restoreTask(mockBoard, 'task-99', 'col1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Archive is empty');
    });

    it('should return error for non-existent task in archive', () => {
      const result = restoreTask(mockBoard, 'task-1', 'col1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-1 not found in archive');
    });

    it('should return error for non-existent target column', () => {
      const result = restoreTask(mockBoard, 'task-99', 'col99');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Target column col99 not found');
    });

    it('should not mutate original board', () => {
      const originalArchiveCount = mockBoard.archive!.length;
      const originalCol1Count = mockBoard.columns[0].tasks.length;
      restoreTask(mockBoard, 'task-99', 'col1');

      expect(mockBoard.archive!.length).toBe(originalArchiveCount);
      expect(mockBoard.columns[0].tasks.length).toBe(originalCol1Count);
    });
  });
});
