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
  patchTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  setSubtasksCompleted,
  setAllSubtasksCompleted,
  type BoardOperationResult,
  type TaskInput
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
      const result = addTask(mockBoard, 'col1', { title: 'New Task', description: 'New Description' });

      expect(result.success).toBe(true);
      expect(result.board).toBeDefined();
      expect(result.board!.columns[0].tasks).toHaveLength(3);
      expect(result.board!.columns[0].tasks[2].title).toBe('New Task');
      expect(result.board!.columns[0].tasks[2].description).toBe('New Description');
      expect(result.board!.columns[0].tasks[2].id).toBe('task-4');
    });

    it('should add task with all optional fields', () => {
      const input: TaskInput = {
        title: 'Full Task',
        description: 'Full description',
        priority: 'high',
        tags: ['urgent', 'feature'],
        assignee: 'john',
        dueDate: '2025-01-15',
        relatedFiles: ['src/index.ts'],
        template: 'feature',
        subtasks: ['Subtask 1', 'Subtask 2']
      };
      const result = addTask(mockBoard, 'col1', input);

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[2];
      expect(task.title).toBe('Full Task');
      expect(task.priority).toBe('high');
      expect(task.tags).toEqual(['urgent', 'feature']);
      expect(task.assignee).toBe('john');
      expect(task.dueDate).toBe('2025-01-15');
      expect(task.relatedFiles).toEqual(['src/index.ts']);
      expect(task.template).toBe('feature');
      expect(task.subtasks).toHaveLength(2);
      expect(task.subtasks![0].title).toBe('Subtask 1');
      expect(task.subtasks![0].id).toBe('task-4-1');
      expect(task.subtasks![1].id).toBe('task-4-2');
    });

    it('should generate sequential task IDs', () => {
      let result = addTask(mockBoard, 'col1', { title: 'Task A' });
      expect(result.board!.columns[0].tasks[2].id).toBe('task-4');

      result = addTask(result.board!, 'col1', { title: 'Task B' });
      expect(result.board!.columns[0].tasks[3].id).toBe('task-5');
    });

    it('should return error for non-existent column', () => {
      const result = addTask(mockBoard, 'col99', { title: 'New Task' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Column col99 not found');
      expect(result.board).toBeUndefined();
    });

    it('should not mutate original board', () => {
      const originalTaskCount = mockBoard.columns[0].tasks.length;
      addTask(mockBoard, 'col1', { title: 'New Task' });

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

  describe('patchTask', () => {
    it('should update only specified fields', () => {
      const result = patchTask(mockBoard, 'task-1', { priority: 'high', tags: ['urgent'] });

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.title).toBe('Task 1'); // unchanged
      expect(task.description).toBe('Description 1'); // unchanged
      expect(task.priority).toBe('high');
      expect(task.tags).toEqual(['urgent']);
    });

    it('should remove fields when set to null', () => {
      // First add some fields
      let result = patchTask(mockBoard, 'task-1', { priority: 'high', assignee: 'john' });
      expect(result.board!.columns[0].tasks[0].priority).toBe('high');
      expect(result.board!.columns[0].tasks[0].assignee).toBe('john');

      // Now remove them with null
      result = patchTask(result.board!, 'task-1', { priority: null, assignee: null });
      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].priority).toBeUndefined();
      expect(result.board!.columns[0].tasks[0].assignee).toBeUndefined();
    });

    it('should return error for non-existent task', () => {
      const result = patchTask(mockBoard, 'task-99', { priority: 'high' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should not mutate original board', () => {
      const originalPriority = mockBoard.columns[0].tasks[0].priority;
      patchTask(mockBoard, 'task-1', { priority: 'critical' });

      expect(mockBoard.columns[0].tasks[0].priority).toBe(originalPriority);
    });

    it('should add and remove relatedFiles', () => {
      // Add relatedFiles
      let result = patchTask(mockBoard, 'task-1', { relatedFiles: ['src/auth.ts', 'src/login.tsx'] });
      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].relatedFiles).toEqual(['src/auth.ts', 'src/login.tsx']);

      // Remove relatedFiles with null
      result = patchTask(result.board!, 'task-1', { relatedFiles: null });
      expect(result.success).toBe(true);
      expect(result.board!.columns[0].tasks[0].relatedFiles).toBeUndefined();
    });
  });

  describe('addSubtask', () => {
    it('should add subtask to task without existing subtasks', () => {
      const result = addSubtask(mockBoard, 'task-1', 'New Subtask');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks![0].title).toBe('New Subtask');
      expect(task.subtasks![0].id).toBe('task-1-1');
      expect(task.subtasks![0].completed).toBe(false);
    });

    it('should append subtask to task with existing subtasks', () => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Existing Subtask', completed: false }
      ];
      const result = addSubtask(mockBoard, 'task-1', 'New Subtask');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks).toHaveLength(2);
      expect(task.subtasks![1].title).toBe('New Subtask');
      expect(task.subtasks![1].id).toBe('task-1-2');
    });

    it('should return error for non-existent task', () => {
      const result = addSubtask(mockBoard, 'task-99', 'New Subtask');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should not mutate original board', () => {
      addSubtask(mockBoard, 'task-1', 'New Subtask');

      expect(mockBoard.columns[0].tasks[0].subtasks).toBeUndefined();
    });
  });

  describe('deleteSubtask', () => {
    beforeEach(() => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: false },
        { id: 'task-1-2', title: 'Subtask 2', completed: true }
      ];
    });

    it('should delete a subtask', () => {
      const result = deleteSubtask(mockBoard, 'task-1', 'task-1-1');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks).toHaveLength(1);
      expect(task.subtasks![0].id).toBe('task-1-2');
    });

    it('should return error for non-existent task', () => {
      const result = deleteSubtask(mockBoard, 'task-99', 'task-1-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should return error for task without subtasks', () => {
      mockBoard.columns[0].tasks[0].subtasks = undefined;
      const result = deleteSubtask(mockBoard, 'task-1', 'task-1-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-1 has no subtasks');
    });

    it('should return error for non-existent subtask', () => {
      const result = deleteSubtask(mockBoard, 'task-1', 'task-1-99');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subtask task-1-99 not found');
    });

    it('should not mutate original board', () => {
      const originalCount = mockBoard.columns[0].tasks[0].subtasks!.length;
      deleteSubtask(mockBoard, 'task-1', 'task-1-1');

      expect(mockBoard.columns[0].tasks[0].subtasks!.length).toBe(originalCount);
    });
  });

  describe('updateSubtask', () => {
    beforeEach(() => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: false },
        { id: 'task-1-2', title: 'Subtask 2', completed: true }
      ];
    });

    it('should update subtask title', () => {
      const result = updateSubtask(mockBoard, 'task-1', 'task-1-1', 'Updated Subtask');

      expect(result.success).toBe(true);
      const task = result.board!.columns[0].tasks[0];
      expect(task.subtasks![0].title).toBe('Updated Subtask');
      expect(task.subtasks![0].completed).toBe(false); // unchanged
    });

    it('should return error for non-existent task', () => {
      const result = updateSubtask(mockBoard, 'task-99', 'task-1-1', 'New Title');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should return error for task without subtasks', () => {
      mockBoard.columns[0].tasks[0].subtasks = undefined;
      const result = updateSubtask(mockBoard, 'task-1', 'task-1-1', 'New Title');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-1 has no subtasks');
    });

    it('should return error for non-existent subtask', () => {
      const result = updateSubtask(mockBoard, 'task-1', 'task-1-99', 'New Title');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subtask task-1-99 not found');
    });

    it('should not mutate original board', () => {
      const originalTitle = mockBoard.columns[0].tasks[0].subtasks![0].title;
      updateSubtask(mockBoard, 'task-1', 'task-1-1', 'New Title');

      expect(mockBoard.columns[0].tasks[0].subtasks![0].title).toBe(originalTitle);
    });
  });

  describe('setSubtasksCompleted', () => {
    beforeEach(() => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: false },
        { id: 'task-1-2', title: 'Subtask 2', completed: false },
        { id: 'task-1-3', title: 'Subtask 3', completed: true }
      ];
    });

    it('should mark multiple subtasks as completed', () => {
      const result = setSubtasksCompleted(mockBoard, 'task-1', ['task-1-1', 'task-1-2'], true);

      expect(result.success).toBe(true);
      const subtasks = result.board!.columns[0].tasks[0].subtasks!;
      expect(subtasks[0].completed).toBe(true);
      expect(subtasks[1].completed).toBe(true);
      expect(subtasks[2].completed).toBe(true); // unchanged
    });

    it('should mark multiple subtasks as incomplete', () => {
      const result = setSubtasksCompleted(mockBoard, 'task-1', ['task-1-3'], false);

      expect(result.success).toBe(true);
      const subtasks = result.board!.columns[0].tasks[0].subtasks!;
      expect(subtasks[0].completed).toBe(false); // unchanged
      expect(subtasks[1].completed).toBe(false); // unchanged
      expect(subtasks[2].completed).toBe(false);
    });

    it('should fail atomically if any subtask not found', () => {
      const result = setSubtasksCompleted(mockBoard, 'task-1', ['task-1-1', 'task-1-99'], true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subtask task-1-99 not found');
      // Original board unchanged
      expect(mockBoard.columns[0].tasks[0].subtasks![0].completed).toBe(false);
    });

    it('should return error for non-existent task', () => {
      const result = setSubtasksCompleted(mockBoard, 'task-99', ['task-1-1'], true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should return error for task without subtasks', () => {
      const result = setSubtasksCompleted(mockBoard, 'task-2', ['task-2-1'], true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-2 has no subtasks');
    });

    it('should not mutate original board', () => {
      const originalStatus = mockBoard.columns[0].tasks[0].subtasks![0].completed;
      setSubtasksCompleted(mockBoard, 'task-1', ['task-1-1'], true);

      expect(mockBoard.columns[0].tasks[0].subtasks![0].completed).toBe(originalStatus);
    });
  });

  describe('setAllSubtasksCompleted', () => {
    beforeEach(() => {
      mockBoard.columns[0].tasks[0].subtasks = [
        { id: 'task-1-1', title: 'Subtask 1', completed: false },
        { id: 'task-1-2', title: 'Subtask 2', completed: false },
        { id: 'task-1-3', title: 'Subtask 3', completed: true }
      ];
    });

    it('should mark all subtasks as completed', () => {
      const result = setAllSubtasksCompleted(mockBoard, 'task-1', true);

      expect(result.success).toBe(true);
      const subtasks = result.board!.columns[0].tasks[0].subtasks!;
      expect(subtasks.every(st => st.completed)).toBe(true);
    });

    it('should mark all subtasks as incomplete', () => {
      const result = setAllSubtasksCompleted(mockBoard, 'task-1', false);

      expect(result.success).toBe(true);
      const subtasks = result.board!.columns[0].tasks[0].subtasks!;
      expect(subtasks.every(st => !st.completed)).toBe(true);
    });

    it('should return error for non-existent task', () => {
      const result = setAllSubtasksCompleted(mockBoard, 'task-99', true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-99 not found');
    });

    it('should return error for task without subtasks', () => {
      const result = setAllSubtasksCompleted(mockBoard, 'task-2', true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-2 has no subtasks');
    });

    it('should not mutate original board', () => {
      const originalStatuses = mockBoard.columns[0].tasks[0].subtasks!.map(st => st.completed);
      setAllSubtasksCompleted(mockBoard, 'task-1', true);

      const currentStatuses = mockBoard.columns[0].tasks[0].subtasks!.map(st => st.completed);
      expect(currentStatuses).toEqual(originalStatuses);
    });
  });
});
