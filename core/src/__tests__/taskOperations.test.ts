import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  deleteTaskFile,
  appendLog,
  listTasks,
  findTask,
  searchTaskFiles,
  searchLogs,
  generateNextFileTaskId,
} from '../taskOperations';
import { writeTaskFile, readTaskFile } from '../taskFile';
import type { Task } from '../types';

describe('taskOperations', () => {
  let testDir: string;
  let tasksDir: string;
  let logsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-taskops-test-'));
    tasksDir = path.join(testDir, 'tasks');
    logsDir = path.join(testDir, 'logs');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const seedTask = (id: string, column: string, opts?: Partial<Task>, body?: string) => {
    const task: Task = {
      id,
      title: `Task ${id}`,
      column,
      ...opts,
    };
    const filePath = path.join(tasksDir, `${id}.md`);
    writeTaskFile(filePath, task, body || '');
    return filePath;
  };

  const seedLogTask = (id: string, opts?: Partial<Task>, body?: string) => {
    const task: Task = {
      id,
      title: `Task ${id}`,
      completedAt: '2025-12-17T12:00:00.000Z',
      ...opts,
    };
    const filePath = path.join(logsDir, `${id}.md`);
    writeTaskFile(filePath, task, body || '');
    return filePath;
  };

  describe('generateNextFileTaskId', () => {
    it('returns task-1 for empty directory', () => {
      expect(generateNextFileTaskId(tasksDir)).toBe('task-1');
    });

    it('increments based on existing tasks', () => {
      seedTask('task-1', 'todo');
      seedTask('task-5', 'todo');
      expect(generateNextFileTaskId(tasksDir)).toBe('task-6');
    });

    it('considers logs directory when provided', () => {
      seedTask('task-3', 'todo');
      seedLogTask('task-10');
      expect(generateNextFileTaskId(tasksDir, logsDir)).toBe('task-11');
    });
  });

  describe('addTaskFile', () => {
    it('creates a new task file', () => {
      const result = addTaskFile(tasksDir, {
        title: 'New task',
        column: 'todo',
        priority: 'high',
        tags: ['feature'],
      });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task!.id).toBe('task-1');
      expect(result.task!.title).toBe('New task');
      expect(result.task!.column).toBe('todo');
      expect(result.task!.priority).toBe('high');
      expect(result.task!.createdAt).toBeDefined();
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath!)).toBe(true);
    });

    it('respects explicit ID', () => {
      const result = addTaskFile(tasksDir, {
        id: 'task-99',
        title: 'Explicit ID',
        column: 'todo',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('task-99');
    });

    it('auto-increments ID based on existing tasks', () => {
      seedTask('task-5', 'todo');
      const result = addTaskFile(tasksDir, { title: 'Auto ID', column: 'todo' });
      expect(result.task!.id).toBe('task-6');
    });

    it('creates subtasks from title array', () => {
      const result = addTaskFile(tasksDir, {
        title: 'With subtasks',
        column: 'todo',
        subtasks: ['Sub 1', 'Sub 2'],
      });

      expect(result.success).toBe(true);
      expect(result.task!.subtasks).toHaveLength(2);
      expect(result.task!.subtasks![0].id).toBe('task-1-1');
      expect(result.task!.subtasks![0].title).toBe('Sub 1');
      expect(result.task!.subtasks![1].id).toBe('task-1-2');
    });

    it('fails with empty title', () => {
      const result = addTaskFile(tasksDir, { title: '', column: 'todo' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('title is required');
    });

    it('fails with empty column', () => {
      const result = addTaskFile(tasksDir, { title: 'Task', column: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('column is required');
    });

    it('writes body content', () => {
      const result = addTaskFile(
        tasksDir,
        { title: 'With body', column: 'todo' },
        '## Notes\nDetailed notes.\n',
      );

      expect(result.success).toBe(true);
      const doc = readTaskFile(result.filePath!);
      expect(doc!.body).toContain('## Notes');
    });
  });

  describe('moveTaskFile', () => {
    it('updates column in frontmatter', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = moveTaskFile(filePath, 'in-progress');

      expect(result.success).toBe(true);
      expect(result.task!.column).toBe('in-progress');

      const doc = readTaskFile(filePath);
      expect(doc!.task.column).toBe('in-progress');
    });

    it('updates position when provided', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = moveTaskFile(filePath, 'todo', 3);

      expect(result.success).toBe(true);
      expect(result.task!.position).toBe(3);
    });

    it('sets updatedAt', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = moveTaskFile(filePath, 'done');

      expect(result.task!.updatedAt).toBeDefined();
    });

    it('preserves body content', () => {
      const filePath = seedTask('task-1', 'todo', {}, '## Notes\nImportant.\n');

      moveTaskFile(filePath, 'done');

      const doc = readTaskFile(filePath);
      expect(doc!.body).toContain('## Notes');
      expect(doc!.body).toContain('Important.');
    });

    it('fails for non-existent file', () => {
      const result = moveTaskFile(path.join(tasksDir, 'nope.md'), 'done');
      expect(result.success).toBe(false);
    });
  });

  describe('completeTaskFile', () => {
    it('moves task from tasks/ to logs/', () => {
      const filePath = seedTask('task-1', 'done');

      const result = completeTaskFile(filePath, logsDir);

      expect(result.success).toBe(true);
      expect(result.task!.completedAt).toBeDefined();
      expect(result.task!.column).toBeUndefined();
      expect(result.task!.position).toBeUndefined();

      // Original file should be removed
      expect(fs.existsSync(filePath)).toBe(false);

      // New file should exist in logs/
      const logPath = path.join(logsDir, 'task-1.md');
      expect(fs.existsSync(logPath)).toBe(true);
      expect(result.filePath).toBe(logPath);
    });

    it('preserves body when completing', () => {
      const filePath = seedTask('task-1', 'done', {}, '## Log\n- Started work\n');

      completeTaskFile(filePath, logsDir);

      const doc = readTaskFile(path.join(logsDir, 'task-1.md'));
      expect(doc!.body).toContain('## Log');
      expect(doc!.body).toContain('Started work');
    });

    it('creates logs directory if missing', () => {
      const newLogsDir = path.join(testDir, 'new-logs');
      const filePath = seedTask('task-1', 'done');

      const result = completeTaskFile(filePath, newLogsDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(newLogsDir, 'task-1.md'))).toBe(true);
    });

    it('fails for non-existent file', () => {
      const result = completeTaskFile(path.join(tasksDir, 'nope.md'), logsDir);
      expect(result.success).toBe(false);
    });
  });

  describe('deleteTaskFile', () => {
    it('removes the task file', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = deleteTaskFile(filePath);

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('task-1');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('fails for non-existent file', () => {
      const result = deleteTaskFile(path.join(tasksDir, 'nope.md'));
      expect(result.success).toBe(false);
    });
  });

  describe('appendLog', () => {
    it('creates ## Log section when missing', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = appendLog(filePath, 'Started work');

      expect(result.success).toBe(true);
      const doc = readTaskFile(filePath);
      expect(doc!.body).toContain('## Log');
      expect(doc!.body).toMatch(/- \d{4}-\d{2}-\d{2}T.*: Started work/);
    });

    it('appends to existing ## Log section', () => {
      const filePath = seedTask('task-1', 'todo', {}, '## Log\n- 2025-01-01: First entry\n');

      appendLog(filePath, 'Second entry');

      const doc = readTaskFile(filePath);
      expect(doc!.body).toContain('## Log');
      expect(doc!.body).toContain('First entry');
      expect(doc!.body).toContain('Second entry');
    });

    it('includes agent attribution when provided', () => {
      const filePath = seedTask('task-1', 'todo');

      appendLog(filePath, 'Did something', 'codex');

      const doc = readTaskFile(filePath);
      expect(doc!.body).toMatch(/\[codex\]: Did something/);
    });

    it('sets updatedAt on the task', () => {
      const filePath = seedTask('task-1', 'todo');

      appendLog(filePath, 'Entry');

      const doc = readTaskFile(filePath);
      expect(doc!.task.updatedAt).toBeDefined();
    });

    it('fails for non-existent file', () => {
      const result = appendLog(path.join(tasksDir, 'nope.md'), 'Entry');
      expect(result.success).toBe(false);
    });

    it('preserves existing body before ## Log', () => {
      const body = '## Description\nSome details.\n';
      const filePath = seedTask('task-1', 'todo', {}, body);

      appendLog(filePath, 'New entry');

      const doc = readTaskFile(filePath);
      expect(doc!.body).toContain('## Description');
      expect(doc!.body).toContain('Some details.');
      expect(doc!.body).toContain('## Log');
      expect(doc!.body).toContain('New entry');
    });
  });

  describe('listTasks', () => {
    it('lists all tasks in directory', () => {
      seedTask('task-1', 'todo');
      seedTask('task-2', 'in-progress');
      seedTask('task-3', 'done');

      const docs = listTasks(tasksDir);

      expect(docs).toHaveLength(3);
    });

    it('filters by column', () => {
      seedTask('task-1', 'todo');
      seedTask('task-2', 'todo');
      seedTask('task-3', 'done');

      const docs = listTasks(tasksDir, { column: 'todo' });

      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.task.column === 'todo')).toBe(true);
    });

    it('filters by tag', () => {
      seedTask('task-1', 'todo', { tags: ['bug'] });
      seedTask('task-2', 'todo', { tags: ['feature'] });
      seedTask('task-3', 'todo', { tags: ['bug', 'urgent'] });

      const docs = listTasks(tasksDir, { tag: 'bug' });

      expect(docs).toHaveLength(2);
    });

    it('filters by priority', () => {
      seedTask('task-1', 'todo', { priority: 'high' });
      seedTask('task-2', 'todo', { priority: 'low' });

      const docs = listTasks(tasksDir, { priority: 'high' });

      expect(docs).toHaveLength(1);
      expect(docs[0].task.id).toBe('task-1');
    });

    it('filters by assignee', () => {
      seedTask('task-1', 'todo', { assignee: 'alice' });
      seedTask('task-2', 'todo', { assignee: 'bob' });

      const docs = listTasks(tasksDir, { assignee: 'alice' });

      expect(docs).toHaveLength(1);
      expect(docs[0].task.id).toBe('task-1');
    });

    it('sorts by column then position', () => {
      seedTask('task-1', 'todo', { position: 2 });
      seedTask('task-2', 'in-progress', { position: 1 });
      seedTask('task-3', 'todo', { position: 1 });

      const docs = listTasks(tasksDir);

      // in-progress < todo alphabetically
      expect(docs[0].task.id).toBe('task-2'); // in-progress, pos 1
      expect(docs[1].task.id).toBe('task-3'); // todo, pos 1
      expect(docs[2].task.id).toBe('task-1'); // todo, pos 2
    });

    it('returns empty for non-existent directory', () => {
      expect(listTasks(path.join(testDir, 'nope'))).toEqual([]);
    });
  });

  describe('findTask', () => {
    it('finds task by ID via direct path', () => {
      seedTask('task-42', 'todo');

      const doc = findTask(tasksDir, 'task-42');

      expect(doc).not.toBeNull();
      expect(doc!.task.id).toBe('task-42');
    });

    it('finds task by ID via scan when filename differs', () => {
      // Write a task where the filename does not match the convention
      const task: Task = { id: 'task-99', title: 'Misnamed', column: 'todo' };
      const filePath = path.join(tasksDir, 'custom-name.md');
      writeTaskFile(filePath, task, '');

      const doc = findTask(tasksDir, 'task-99');

      expect(doc).not.toBeNull();
      expect(doc!.task.id).toBe('task-99');
    });

    it('returns null for non-existent task', () => {
      seedTask('task-1', 'todo');
      expect(findTask(tasksDir, 'task-999')).toBeNull();
    });
  });

  describe('searchTaskFiles', () => {
    it('searches by title', () => {
      seedTask('task-1', 'todo', { title: 'Fix authentication bug' });
      seedTask('task-2', 'todo', { title: 'Add new feature' });

      const results = searchTaskFiles(tasksDir, 'auth');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('searches by description', () => {
      seedTask('task-1', 'todo', { description: 'Handle OAuth flow' });
      seedTask('task-2', 'todo', { description: 'Unrelated task' });

      const results = searchTaskFiles(tasksDir, 'oauth');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('searches by body content', () => {
      seedTask('task-1', 'todo', {}, '## Notes\nThe rate limiter needs work.\n');
      seedTask('task-2', 'todo', {}, '## Notes\nSomething else.\n');

      const results = searchTaskFiles(tasksDir, 'rate limiter');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('searches by tags', () => {
      seedTask('task-1', 'todo', { tags: ['authentication'] });
      seedTask('task-2', 'todo', { tags: ['database'] });

      const results = searchTaskFiles(tasksDir, 'auth');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('is case-insensitive', () => {
      seedTask('task-1', 'todo', { title: 'FIX BUG' });

      const results = searchTaskFiles(tasksDir, 'fix bug');

      expect(results).toHaveLength(1);
    });

    it('returns empty for no matches', () => {
      seedTask('task-1', 'todo');
      expect(searchTaskFiles(tasksDir, 'nonexistent-query')).toEqual([]);
    });
  });

  describe('searchLogs', () => {
    it('searches completed tasks in logs directory', () => {
      seedLogTask('task-1', { title: 'Fixed auth bug' });
      seedLogTask('task-2', { title: 'Added feature X' });

      const results = searchLogs(logsDir, 'auth');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('searches log body content', () => {
      seedLogTask('task-1', {}, '## Log\n- 2025-01-01: Found root cause in auth service\n');
      seedLogTask('task-2', {}, '## Log\n- 2025-01-01: Database migration complete\n');

      const results = searchLogs(logsDir, 'root cause');

      expect(results).toHaveLength(1);
      expect(results[0].task.id).toBe('task-1');
    });

    it('returns empty for non-existent directory', () => {
      expect(searchLogs(path.join(testDir, 'nope'), 'test')).toEqual([]);
    });
  });
});
