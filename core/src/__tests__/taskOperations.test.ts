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
  moveTaskFileToColumn,
  patchTaskFile,
  addSubtasksToFile,
  deleteSubtasksFromFile,
  toggleSubtasksInFile,
  updateSubtasksInFile,
  attachTaskContract,
  activateTaskContract,
  activateTaskContractsByParent,
  pickupTaskContract,
  deliverTaskContract,
  completeTaskContract,
  failTaskContract,
  getEffectiveState,
  DEFAULT_CONTRACT_COLUMN_MAP,
} from '../taskOperations';
import { writeTaskFile, readTaskFile } from '../taskFile';
import type { BoardConfig, Task } from '../types';
import type { Contract } from '../types/contract';

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

    it('generates IDs with custom type prefix', () => {
      expect(generateNextFileTaskId(tasksDir, undefined, 'epic')).toBe('epic-1');
    });

    it('increments custom prefix IDs based on existing matching tasks', () => {
      seedTask('epic-1', 'todo');
      seedTask('epic-3', 'todo');
      seedTask('task-10', 'todo'); // should be ignored for epic prefix
      expect(generateNextFileTaskId(tasksDir, undefined, 'epic')).toBe('epic-4');
    });

    it('ignores non-matching prefixes when scanning', () => {
      seedTask('task-5', 'todo');
      seedTask('adr-2', 'todo');
      seedTask('epic-3', 'todo');
      // Only scans for adr-* IDs
      expect(generateNextFileTaskId(tasksDir, undefined, 'adr')).toBe('adr-3');
    });

    it('scans logs dir for custom prefix too', () => {
      seedTask('epic-2', 'todo');
      seedLogTask('epic-5');
      expect(generateNextFileTaskId(tasksDir, logsDir, 'epic')).toBe('epic-6');
    });

    it('scans ledger.jsonl so cleared boards do not restart at 1', () => {
      // Simulate: board is empty, logs/ has no .md files, but ledger has completed tasks
      const ledgerPath = path.join(logsDir, 'ledger.jsonl');
      fs.writeFileSync(ledgerPath, [
        JSON.stringify({ id: 'task-7', type: 'task', title: 'Old task', filesChanged: [], createdAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-02T00:00:00Z', cycleTimeHours: 24, summary: 'Done' }),
        JSON.stringify({ id: 'task-12', type: 'task', title: 'Another old task', filesChanged: [], createdAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-03T00:00:00Z', cycleTimeHours: 48, summary: 'Done' }),
      ].join('\n') + '\n', 'utf-8');
      expect(generateNextFileTaskId(tasksDir, logsDir)).toBe('task-13');
    });

    it('picks highest ID across board, log .md files, and ledger', () => {
      seedTask('task-3', 'todo');
      seedLogTask('task-5');
      const ledgerPath = path.join(logsDir, 'ledger.jsonl');
      fs.writeFileSync(ledgerPath, JSON.stringify({ id: 'task-20', type: 'task', title: 'Ledger task', filesChanged: [], createdAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-02T00:00:00Z', cycleTimeHours: 24, summary: 'Done' }) + '\n', 'utf-8');
      expect(generateNextFileTaskId(tasksDir, logsDir)).toBe('task-21');
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

    it('fails when explicit ID already exists (no silent overwrite)', () => {
      seedTask('task-99', 'todo', { title: 'Original title' });

      const result = addTaskFile(tasksDir, {
        id: 'task-99',
        title: 'Should not overwrite',
        column: 'todo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');

      const existing = readTaskFile(path.join(tasksDir, 'task-99.md'));
      expect(existing).not.toBeNull();
      expect(existing!.task.title).toBe('Original title');
    });

    it('fails for unsafe task ID values', () => {
      const result = addTaskFile(tasksDir, {
        id: '../escape',
        title: 'Unsafe',
        column: 'todo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid task ID');
      expect(fs.existsSync(path.join(testDir, 'escape.md'))).toBe(false);
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

    it('sets parentId when provided', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Child task',
        column: 'todo',
        parentId: 'epic-1',
      });

      expect(result.success).toBe(true);
      expect(result.task!.parentId).toBe('epic-1');

      const doc = readTaskFile(result.filePath!);
      expect(doc).not.toBeNull();
      expect(doc!.task.parentId).toBe('epic-1');
    });

    it('sets dependsOn when provided', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Dependent task',
        column: 'todo',
        dependsOn: ['task-1', 'task-2', 'task-1'],
      });

      expect(result.success).toBe(true);
      expect(result.task!.dependsOn).toEqual(['task-1', 'task-2']);

      const doc = readTaskFile(result.filePath!);
      expect(doc).not.toBeNull();
      expect(doc!.task.dependsOn).toEqual(['task-1', 'task-2']);
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

    it('creates task with type field and type-prefixed ID', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Project roadmap',
        column: 'todo',
        type: 'epic',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('epic-1');
      expect(result.task!.type).toBe('epic');
      expect(result.filePath).toContain('epic-1.md');
    });

    it('creates adr-prefixed task', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Use token bucket for rate limiting',
        column: 'todo',
        type: 'adr',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('adr-1');
      expect(result.task!.type).toBe('adr');
    });

    it('increments typed IDs independently from task IDs', () => {
      // Create some regular tasks
      seedTask('task-5', 'todo');
      seedTask('task-10', 'todo');

      // Create an epic - should be epic-1, not affected by task-* IDs
      const result = addTaskFile(tasksDir, {
        title: 'First epic',
        column: 'todo',
        type: 'epic',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('epic-1');
    });

    it('increments typed IDs based on existing same-type tasks', () => {
      seedTask('epic-1', 'todo');
      seedTask('epic-3', 'todo');

      const result = addTaskFile(tasksDir, {
        title: 'Next epic',
        column: 'todo',
        type: 'epic',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('epic-4');
    });

    it('mixes multiple types in the same directory', () => {
      seedTask('task-1', 'todo');
      seedTask('epic-2', 'todo');
      seedTask('adr-1', 'todo');

      const epicResult = addTaskFile(tasksDir, {
        title: 'New epic',
        column: 'todo',
        type: 'epic',
      });

      const adrResult = addTaskFile(tasksDir, {
        title: 'New ADR',
        column: 'todo',
        type: 'adr',
      });

      const taskResult = addTaskFile(tasksDir, {
        title: 'New task',
        column: 'todo',
      });

      expect(epicResult.task!.id).toBe('epic-3');
      expect(adrResult.task!.id).toBe('adr-2');
      expect(taskResult.task!.id).toBe('task-2');
    });

    it('does not set type field when type is omitted', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Plain task',
        column: 'todo',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('task-1');
      expect(result.task!.type).toBeUndefined();
    });

    it('type field roundtrips through file read/write', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Typed task',
        column: 'todo',
        type: 'epic',
      });

      expect(result.success).toBe(true);

      // Read the file back and verify type is preserved
      const doc = readTaskFile(result.filePath!);
      expect(doc).not.toBeNull();
      expect(doc!.task.type).toBe('epic');
      expect(doc!.task.id).toBe('epic-1');
    });

    it('creates subtasks with type-prefixed parent ID', () => {
      const result = addTaskFile(tasksDir, {
        title: 'Epic with subtasks',
        column: 'todo',
        type: 'epic',
        subtasks: ['Sub A', 'Sub B'],
      });

      expect(result.success).toBe(true);
      expect(result.task!.subtasks).toHaveLength(2);
      expect(result.task!.subtasks![0].id).toBe('epic-1-1');
      expect(result.task!.subtasks![1].id).toBe('epic-1-2');
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
    it('appends to ledger and removes active task file by default', () => {
      const filePath = seedTask(
        'task-1',
        'done',
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          relatedFiles: ['src/app.ts'],
        },
        '## Summary\nImplemented the final piece.\n',
      );

      const result = completeTaskFile(filePath, logsDir);

      expect(result.success).toBe(true);
      expect(result.task!.completedAt).toBeDefined();
      expect(result.task!.column).toBeUndefined();
      expect(result.task!.position).toBeUndefined();
      expect(fs.existsSync(filePath)).toBe(false);

      const ledgerPath = path.join(logsDir, 'ledger.jsonl');
      expect(result.filePath).toBe(ledgerPath);
      expect(fs.existsSync(ledgerPath)).toBe(true);

      const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]);
      expect(record.id).toBe('task-1');
      expect(record.filesChanged).toContain('src/app.ts');
      expect(record.summary).toBe('Implemented the final piece.');
    });

    it('creates logs directory if missing (ledger mode)', () => {
      const newLogsDir = path.join(testDir, 'new-logs');
      const filePath = seedTask('task-1', 'done');

      const result = completeTaskFile(filePath, newLogsDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(newLogsDir, 'ledger.jsonl'))).toBe(true);
    });

    it('supports legacy mode by moving markdown file to logs/', () => {
      const filePath = seedTask('task-1', 'done', {}, '## Log\n- Started work\n');

      completeTaskFile(filePath, logsDir, { legacyMode: true });

      const doc = readTaskFile(path.join(logsDir, 'task-1.md'));
      expect(doc).not.toBeNull();
      expect(doc!.body).toContain('## Log');
      expect(doc!.body).toContain('Started work');
    });

    it('fails in legacy mode when destination log file already exists', () => {
      const filePath = seedTask('task-1', 'done', { title: 'Active task' });
      seedLogTask('task-1', { title: 'Existing log entry' });

      const result = completeTaskFile(filePath, logsDir, { legacyMode: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists in logs');

      const activeDoc = readTaskFile(filePath);
      expect(activeDoc).not.toBeNull();
      expect(activeDoc!.task.title).toBe('Active task');

      const logDoc = readTaskFile(path.join(logsDir, 'task-1.md'));
      expect(logDoc).not.toBeNull();
      expect(logDoc!.task.title).toBe('Existing log entry');
    });

    it('keeps legacy epic child summary behavior behind legacy mode', () => {
      seedTask('task-10', 'todo', { title: 'Linked child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', {
        type: 'epic',
        subtasks: [{ id: 'task-999', title: 'stale ref', completed: false }],
      });

      // task-10 is an active parentId-linked child, so the epic gate requires force.
      const result = completeTaskFile(epicPath, logsDir, { legacyMode: true, force: true });
      expect(result.success).toBe(true);

      const doc = readTaskFile(path.join(logsDir, 'epic-1.md'));
      expect(doc).not.toBeNull();
      expect(doc!.body).toContain('## Child Tasks');
      expect(doc!.body).toContain('- task-10: Linked child');
      expect(doc!.body).not.toContain('stale ref');
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

    it('filters by parentId', () => {
      seedTask('task-1', 'todo', { parentId: 'epic-1' });
      seedTask('task-2', 'todo', { parentId: 'epic-2' });
      seedTask('task-3', 'todo');

      const docs = listTasks(tasksDir, { parentId: 'epic-1' });

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

  // ==========================================================================
  // Compound contract + column operations
  // ==========================================================================

  const makeContract = (overrides?: Partial<Contract>): Contract => ({
    status: 'ready',
    deliverables: [{ type: 'file', path: 'src/feature.ts' }],
    ...overrides,
  });

  const seedContractTask = (
    id: string,
    column: string,
    contractOverrides?: Partial<Contract>,
    taskOverrides?: Partial<Task>,
  ) => {
    return seedTask(id, column, {
      contract: makeContract(contractOverrides),
      ...taskOverrides,
    });
  };

  describe('pickupTaskContract', () => {
    it('sets contract status to in_progress and moves column to in-progress', () => {
      const filePath = seedContractTask('task-1', 'todo');

      const result = pickupTaskContract(filePath);

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('in_progress');
      expect(result.task!.column).toBe('in-progress');
      expect(result.task!.contract!.metrics?.pickedUpAt).toBeDefined();
      expect(result.task!.contract!.metrics?.reworkCount).toBe(0);
    });

    it('writes changes to disk', () => {
      const filePath = seedContractTask('task-1', 'todo');

      pickupTaskContract(filePath);

      const doc = readTaskFile(filePath);
      expect(doc!.task.contract!.status).toBe('in_progress');
      expect(doc!.task.column).toBe('in-progress');
    });

    it('respects custom column override', () => {
      const filePath = seedContractTask('task-1', 'todo');

      const result = pickupTaskContract(filePath, { column: 'active' });

      expect(result.task!.column).toBe('active');
    });

    it('skips column sync when column=false', () => {
      const filePath = seedContractTask('task-1', 'backlog');

      const result = pickupTaskContract(filePath, { column: false });

      expect(result.task!.column).toBe('backlog');
      expect(result.task!.contract!.status).toBe('in_progress');
    });

    it('fails when task has no contract', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = pickupTaskContract(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no contract');
    });

    it('increments reworkCount on subsequent pickups', () => {
      const filePath = seedContractTask('task-1', 'todo', {
        metrics: { reworkCount: 2, pickedUpAt: '2025-01-01T00:00:00Z' },
      });

      const result = pickupTaskContract(filePath);

      expect(result.task!.contract!.metrics?.reworkCount).toBe(3);
    });
  });

  describe('deliverTaskContract', () => {
    it('sets contract status to delivered and moves column to review', () => {
      const filePath = seedContractTask('task-1', 'in-progress', {
        status: 'in_progress',
        metrics: { pickedUpAt: '2025-01-01T00:00:00.000Z' },
      });

      const result = deliverTaskContract(filePath);

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('delivered');
      expect(result.task!.column).toBe('review');
      expect(result.task!.contract!.metrics?.deliveredAt).toBeDefined();
      expect(result.task!.contract!.metrics?.duration).toBeGreaterThanOrEqual(0);
    });

    it('respects custom column override', () => {
      const filePath = seedContractTask('task-1', 'in-progress', { status: 'in_progress' });

      const result = deliverTaskContract(filePath, { column: 'delivered' });

      expect(result.task!.column).toBe('delivered');
    });

    it('skips column sync when column=false', () => {
      const filePath = seedContractTask('task-1', 'in-progress', { status: 'in_progress' });

      const result = deliverTaskContract(filePath, { column: false });

      expect(result.task!.column).toBe('in-progress');
      expect(result.task!.contract!.status).toBe('delivered');
    });

    it('fails when task has no contract', () => {
      const filePath = seedTask('task-1', 'in-progress');

      const result = deliverTaskContract(filePath);

      expect(result.success).toBe(false);
    });
  });

  describe('completeTaskContract', () => {
    it('sets contract to done and archives task to logs', () => {
      const filePath = seedContractTask('task-1', 'review', {
        status: 'delivered',
        metrics: { pickedUpAt: '2025-01-01T00:00:00.000Z', deliveredAt: '2025-01-01T01:00:00.000Z' },
      });

      const result = completeTaskContract(filePath, logsDir);

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('done');
      expect(result.task!.completedAt).toBeDefined();
      // Task file should be removed from board
      expect(fs.existsSync(filePath)).toBe(false);
      // Ledger should have an entry
      const ledgerPath = path.join(logsDir, 'ledger.jsonl');
      expect(fs.existsSync(ledgerPath)).toBe(true);
    });

    it('fails when task has no contract', () => {
      const filePath = seedTask('task-1', 'review');

      const result = completeTaskContract(filePath, logsDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no contract');
    });

    it('computes duration from metrics', () => {
      const filePath = seedContractTask('task-1', 'review', {
        status: 'delivered',
        metrics: { pickedUpAt: '2025-01-01T00:00:00.000Z', deliveredAt: '2025-01-01T01:00:00.000Z' },
      });

      const result = completeTaskContract(filePath, logsDir);

      expect(result.task!.contract!.metrics?.duration).toBe(3600);
    });
  });

  describe('failTaskContract', () => {
    it('sets contract status to failed with feedback', () => {
      const filePath = seedContractTask('task-1', 'in-progress', { status: 'in_progress' });

      const result = failTaskContract(filePath, 'Tests failing in auth.test.ts');

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('failed');
      expect(result.task!.contract!.feedback).toBe('Tests failing in auth.test.ts');
    });

    it('does not move column by default (no mapping for failed)', () => {
      const filePath = seedContractTask('task-1', 'in-progress', { status: 'in_progress' });

      const result = failTaskContract(filePath, 'Oops');

      // 'failed' is not in DEFAULT_CONTRACT_COLUMN_MAP, so column stays
      expect(result.task!.column).toBe('in-progress');
    });

    it('moves column when explicitly specified', () => {
      const filePath = seedContractTask('task-1', 'in-progress', { status: 'in_progress' });

      const result = failTaskContract(filePath, 'Oops', { column: 'blocked' });

      expect(result.task!.column).toBe('blocked');
    });

    it('fails when task has no contract', () => {
      const filePath = seedTask('task-1', 'in-progress');

      const result = failTaskContract(filePath, 'Oops');

      expect(result.success).toBe(false);
    });
  });

  describe('getEffectiveState', () => {
    it('returns contract status when contract exists', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        column: 'todo',
        contract: { status: 'in_progress' },
      };

      expect(getEffectiveState(task)).toBe('in_progress');
    });

    it('returns completed when task has completedAt but no contract', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        completedAt: '2025-01-01T00:00:00Z',
      };

      expect(getEffectiveState(task)).toBe('completed');
    });

    it('returns column when no contract and not completed', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test',
        column: 'in-progress',
      };

      expect(getEffectiveState(task)).toBe('in-progress');
    });

    it('returns unknown when no column, no contract, not completed', () => {
      const task: Task = { id: 'task-1', title: 'Test' };

      expect(getEffectiveState(task)).toBe('unknown');
    });
  });

  // ==========================================================================
  // moveTaskFileToColumn
  // ==========================================================================

  describe('moveTaskFileToColumn', () => {
    const dirs = () => ({
      dotDir: testDir,
      boardDir: tasksDir,
      logsDir,
      brainfilePath: path.join(testDir, 'brainfile.md'),
    });

    const board = (overrides?: Partial<BoardConfig>): BoardConfig => ({
      title: 'Test Board',
      columns: [
        { id: 'todo', title: 'To Do' },
        { id: 'in-progress', title: 'In Progress' },
        { id: 'done', title: 'Done', completionColumn: true },
      ],
      ...overrides,
    }) as BoardConfig;

    it('resolves the target column by id', () => {
      seedTask('task-1', 'todo');
      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'in-progress');

      expect(result.success).toBe(true);
      expect(result.column!.id).toBe('in-progress');
      expect(result.task!.column).toBe('in-progress');
    });

    it('resolves the target column by title, case-insensitively', () => {
      seedTask('task-1', 'todo');
      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'in progress');

      expect(result.success).toBe(true);
      expect(result.column!.id).toBe('in-progress');
    });

    it('rejects an unknown column on a strict board', () => {
      seedTask('task-1', 'todo');
      const result = moveTaskFileToColumn(dirs(), board({ strict: true }), 'task-1', 'nope');

      expect(result.success).toBe(false);
      expect(result.error).toContain("Column 'nope' is not defined");
    });

    it('falls back to the raw column id on a non-strict board', () => {
      seedTask('task-1', 'todo');
      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'staging');

      expect(result.success).toBe(true);
      expect(result.column).toEqual({ id: 'staging', title: 'staging' });
      expect(readTaskFile(path.join(tasksDir, 'task-1.md'))!.task.column).toBe('staging');
    });

    it('reports a no-op without writing when already in the target column', () => {
      const filePath = seedTask('task-1', 'todo');
      const before = fs.readFileSync(filePath, 'utf-8');

      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'todo');

      expect(result.success).toBe(true);
      expect(result.noop).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(before);
    });

    it('fails when the task does not exist', () => {
      const result = moveTaskFileToColumn(dirs(), board(), 'task-99', 'in-progress');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found: task-99');
    });

    it('defaults position to the end of the target column', () => {
      seedTask('task-1', 'in-progress', { position: 0 });
      seedTask('task-2', 'in-progress', { position: 1 });
      seedTask('task-3', 'todo');

      const result = moveTaskFileToColumn(dirs(), board(), 'task-3', 'in-progress');

      expect(result.task!.position).toBe(2);
    });

    it('respects an explicit position override', () => {
      seedTask('task-1', 'in-progress', { position: 0 });
      seedTask('task-2', 'todo');

      const result = moveTaskFileToColumn(dirs(), board(), 'task-2', 'in-progress', { position: 7 });

      expect(result.task!.position).toBe(7);
    });

    it('auto-completes a completable task moved to a completion column', () => {
      seedTask('task-1', 'todo');

      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'done');

      expect(result.success).toBe(true);
      expect(result.autoCompleted).toBe(true);
      expect(result.task!.completedAt).toBeDefined();
      expect(fs.existsSync(path.join(tasksDir, 'task-1.md'))).toBe(false);
    });

    it('writes an auto-completed task into logs/ as markdown, not just the ledger', () => {
      seedTask('task-1', 'todo', {}, '## Description\nFindable later\n');

      moveTaskFileToColumn(dirs(), board(), 'task-1', 'done');

      const logDoc = readTaskFile(path.join(logsDir, 'task-1.md'));
      expect(logDoc).not.toBeNull();
      expect(logDoc!.task.completedAt).toBeDefined();
      expect(logDoc!.body).toContain('Findable later');
    });

    it('skips auto-complete for a non-completable type', () => {
      seedTask('adr-1', 'todo', { type: 'adr' });
      const cfg = board({ types: { adr: { idPrefix: 'adr', completable: false } } });

      const result = moveTaskFileToColumn(dirs(), cfg, 'adr-1', 'done');

      expect(result.success).toBe(true);
      expect(result.autoCompleted).toBeUndefined();
      expect(fs.existsSync(path.join(tasksDir, 'adr-1.md'))).toBe(true);
    });

    it('skips auto-complete when skipAutoComplete is set', () => {
      seedTask('task-1', 'todo');

      const result = moveTaskFileToColumn(dirs(), board(), 'task-1', 'done', { skipAutoComplete: true });

      expect(result.success).toBe(true);
      expect(result.autoCompleted).toBeUndefined();
      expect(fs.existsSync(path.join(tasksDir, 'task-1.md'))).toBe(true);
    });
  });

  // ==========================================================================
  // patchTaskFile
  // ==========================================================================

  describe('patchTaskFile', () => {
    it('assigns a new title', () => {
      const filePath = seedTask('task-1', 'todo');
      const result = patchTaskFile(filePath, { title: 'Renamed' });

      expect(result.success).toBe(true);
      expect(readTaskFile(filePath)!.task.title).toBe('Renamed');
    });

    it.each([
      ['description', 'A description'],
      ['assignee', 'alice'],
      ['dueDate', '2026-01-01'],
      ['parentId', 'epic-1'],
      ['status', 'active'],
    ] as const)('sets and clears %s', (field, value) => {
      const filePath = seedTask('task-1', 'todo');

      patchTaskFile(filePath, { [field]: value } as any);
      expect(readTaskFile(filePath)!.task[field]).toBe(value);

      patchTaskFile(filePath, { [field]: null } as any);
      expect(readTaskFile(filePath)!.task[field]).toBeUndefined();
    });

    it('sets and clears priority', () => {
      const filePath = seedTask('task-1', 'todo');

      patchTaskFile(filePath, { priority: 'high' });
      expect(readTaskFile(filePath)!.task.priority).toBe('high');

      patchTaskFile(filePath, { priority: null });
      expect(readTaskFile(filePath)!.task.priority).toBeUndefined();
    });

    it('sets and clears tags', () => {
      const filePath = seedTask('task-1', 'todo');

      patchTaskFile(filePath, { tags: ['a', 'b'] });
      expect(readTaskFile(filePath)!.task.tags).toEqual(['a', 'b']);

      patchTaskFile(filePath, { tags: null });
      expect(readTaskFile(filePath)!.task.tags).toBeUndefined();
    });

    it('sets and clears relatedFiles', () => {
      const filePath = seedTask('task-1', 'todo');

      patchTaskFile(filePath, { relatedFiles: ['src/a.ts'] });
      expect(readTaskFile(filePath)!.task.relatedFiles).toEqual(['src/a.ts']);

      patchTaskFile(filePath, { relatedFiles: null });
      expect(readTaskFile(filePath)!.task.relatedFiles).toBeUndefined();
    });

    it('leaves absent fields untouched and stamps updatedAt', () => {
      const filePath = seedTask('task-1', 'todo', { assignee: 'bob', priority: 'low' });

      patchTaskFile(filePath, { priority: 'high' });

      const task = readTaskFile(filePath)!.task;
      expect(task.assignee).toBe('bob');
      expect(task.updatedAt).toBeDefined();
    });

    it('fails for a non-existent file', () => {
      const result = patchTaskFile(path.join(tasksDir, 'nope.md'), { title: 'x' });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Subtask file mutators
  // ==========================================================================

  describe('subtask file mutators', () => {
    const seedWithSubtasks = (subtasks: Array<{ id: string; title: string; completed?: boolean }>) =>
      seedTask('task-1', 'todo', {
        subtasks: subtasks.map((st) => ({ completed: false, ...st })),
      });

    it('addSubtasksToFile allocates canonical sequential IDs', () => {
      const filePath = seedWithSubtasks([
        { id: 'task-1-1', title: 'First' },
        { id: 'task-1-3', title: 'Third' },
      ]);

      const result = addSubtasksToFile(filePath, ['Fourth', 'Fifth']);

      expect(result.success).toBe(true);
      expect(result.affected!.map((st) => st.id)).toEqual(['task-1-4', 'task-1-5']);
      expect(result.subtasks).toHaveLength(4);
    });

    it('addSubtasksToFile initializes the array when absent', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = addSubtasksToFile(filePath, ['Only one']);

      expect(result.success).toBe(true);
      expect(result.affected![0].id).toBe('task-1-1');
    });

    it('addSubtasksToFile rejects an empty title list', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = addSubtasksToFile(filePath, ['   ', '']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No subtask titles provided');
    });

    it('deleteSubtasksFromFile removes every subtask when passed all', () => {
      const filePath = seedWithSubtasks([
        { id: 'task-1-1', title: 'A' },
        { id: 'task-1-2', title: 'B' },
      ]);

      const result = deleteSubtasksFromFile(filePath, 'all');

      expect(result.success).toBe(true);
      expect(result.subtasks).toEqual([]);
      expect(result.affected).toHaveLength(2);
    });

    it('deleteSubtasksFromFile tolerates partial batches and reports missing', () => {
      const filePath = seedWithSubtasks([{ id: 'task-1-1', title: 'A' }]);

      const result = deleteSubtasksFromFile(filePath, ['task-1-1', 'task-1-9']);

      expect(result.success).toBe(true);
      expect(result.affected!.map((st) => st.id)).toEqual(['task-1-1']);
      expect(result.missing).toEqual(['task-1-9']);
    });

    it('deleteSubtasksFromFile fails when nothing matched', () => {
      const filePath = seedWithSubtasks([{ id: 'task-1-1', title: 'A' }]);

      const result = deleteSubtasksFromFile(filePath, ['task-1-9']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subtask not found: task-1-9');
    });

    it('toggleSubtasksInFile forces an explicit completed value', () => {
      const filePath = seedWithSubtasks([
        { id: 'task-1-1', title: 'A', completed: true },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);

      const result = toggleSubtasksInFile(filePath, 'all', true);

      expect(result.subtasks!.every((st) => st.completed)).toBe(true);
    });

    it('toggleSubtasksInFile flips each target independently when completed is omitted', () => {
      const filePath = seedWithSubtasks([
        { id: 'task-1-1', title: 'A', completed: true },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);

      const result = toggleSubtasksInFile(filePath, 'all');

      expect(result.subtasks!.map((st) => st.completed)).toEqual([false, true]);
    });

    it('updateSubtasksInFile renames a batch', () => {
      const filePath = seedWithSubtasks([
        { id: 'task-1-1', title: 'A' },
        { id: 'task-1-2', title: 'B' },
      ]);

      const result = updateSubtasksInFile(filePath, [
        { id: 'task-1-1', title: 'A2' },
        { id: 'task-1-2', title: 'B2' },
      ]);

      expect(result.success).toBe(true);
      expect(result.subtasks!.map((st) => st.title)).toEqual(['A2', 'B2']);
    });

    it('updateSubtasksInFile applies partial matches and reports missing', () => {
      const filePath = seedWithSubtasks([{ id: 'task-1-1', title: 'A' }]);

      const result = updateSubtasksInFile(filePath, [
        { id: 'task-1-1', title: 'A2' },
        { id: 'task-1-9', title: 'ghost' },
      ]);

      expect(result.success).toBe(true);
      expect(result.missing).toEqual(['task-1-9']);
    });

    it('rejects delete/toggle/update on a task with no subtasks', () => {
      const filePath = seedTask('task-1', 'todo');

      expect(deleteSubtasksFromFile(filePath, 'all').success).toBe(false);
      expect(toggleSubtasksInFile(filePath, 'all').success).toBe(false);
      expect(updateSubtasksInFile(filePath, [{ id: 'task-1-1', title: 'x' }]).success).toBe(false);
    });
  });

  // ==========================================================================
  // completeTaskFile epic gate
  // ==========================================================================

  describe('completeTaskFile epic gate', () => {
    it('blocks on an active parentId-linked child', () => {
      seedTask('task-10', 'todo', { title: 'Linked child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', { type: 'epic' });

      const result = completeTaskFile(epicPath, logsDir, { legacyMode: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('1 incomplete child task(s)');
      expect(result.incompleteChildren).toEqual([{ id: 'task-10', title: 'Linked child' }]);
      expect(fs.existsSync(epicPath)).toBe(true);
    });

    it('blocks on an active subtasks-array-referenced child', () => {
      seedTask('task-10', 'todo', { title: 'Referenced child' });
      const epicPath = seedTask('epic-1', 'done', {
        type: 'epic',
        subtasks: [{ id: 'task-10', title: 'ref', completed: false }],
      });

      const result = completeTaskFile(epicPath, logsDir, { legacyMode: true });

      expect(result.success).toBe(false);
      expect(result.incompleteChildren!.map((c) => c.id)).toEqual(['task-10']);
    });

    it('completes with force and reports incompleteChildren on success', () => {
      seedTask('task-10', 'todo', { title: 'Linked child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', { type: 'epic' });

      const result = completeTaskFile(epicPath, logsDir, { legacyMode: true, force: true });

      expect(result.success).toBe(true);
      expect(result.incompleteChildren!.map((c) => c.id)).toEqual(['task-10']);
      expect(fs.existsSync(epicPath)).toBe(false);
    });

    it('never blocks on completed or missing children', () => {
      seedLogTask('task-10', { title: 'Done child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', { type: 'epic' });

      const result = completeTaskFile(epicPath, logsDir, { legacyMode: true });

      expect(result.success).toBe(true);
      expect(result.incompleteChildren).toBeUndefined();
    });

    it('skips the gate entirely for non-epic types', () => {
      seedTask('task-10', 'todo', { title: 'Child', parentId: 'task-1' });
      const parentPath = seedTask('task-1', 'done');

      const result = completeTaskFile(parentPath, logsDir, { legacyMode: true });

      expect(result.success).toBe(true);
    });

    it('records child status labels in the legacy child summary', () => {
      seedTask('task-10', 'todo', { title: 'Active child', parentId: 'epic-1' });
      seedLogTask('task-11', { title: 'Done child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', { type: 'epic' });

      completeTaskFile(epicPath, logsDir, { legacyMode: true, force: true });

      const body = readTaskFile(path.join(logsDir, 'epic-1.md'))!.body;
      expect(body).toContain('Summary: 1/2 children completed.');
      expect(body).toContain('- task-10: Active child (incomplete)');
      expect(body).toContain('- task-11: Done child (completed)');
    });

    it('force still writes the completed markdown in legacy mode', () => {
      seedTask('task-10', 'todo', { title: 'Active child', parentId: 'epic-1' });
      const epicPath = seedTask('epic-1', 'done', { type: 'epic' });

      completeTaskFile(epicPath, logsDir, { legacyMode: true, force: true });

      expect(readTaskFile(path.join(logsDir, 'epic-1.md'))).not.toBeNull();
    });
  });

  // ==========================================================================
  // addTaskFile additions
  // ==========================================================================

  describe('addTaskFile additive fields', () => {
    it('auto-computes position to the end of the column when omitted', () => {
      seedTask('task-1', 'todo', { position: 0 });
      seedTask('task-2', 'todo', { position: 1 });

      const result = addTaskFile(tasksDir, { title: 'Third', column: 'todo' });

      expect(result.success).toBe(true);
      expect(result.task!.position).toBe(2);
    });

    it('persists a contract passed at creation time', () => {
      const contract: Contract = { status: 'draft', constraints: ['Be careful'] };

      const result = addTaskFile(tasksDir, { title: 'With contract', column: 'todo', contract });

      expect(result.success).toBe(true);
      expect(readTaskFile(result.filePath!)!.task.contract).toEqual(contract);
    });

    it('persists a free-form status field', () => {
      const result = addTaskFile(tasksDir, {
        title: 'A plan',
        column: 'todo',
        type: 'plan',
        status: 'draft',
      });

      expect(result.success).toBe(true);
      expect(result.task!.id).toBe('plan-1');
      expect(readTaskFile(result.filePath!)!.task.status).toBe('draft');
    });
  });

  // ==========================================================================
  // TaskFilters.type
  // ==========================================================================

  describe('listTasks type filter', () => {
    it('returns only documents of the requested type', () => {
      seedTask('task-1', 'todo');
      seedTask('plan-1', 'todo', { type: 'plan' });
      seedTask('epic-1', 'todo', { type: 'epic' });

      const plans = listTasks(tasksDir, { type: 'plan' });

      expect(plans.map((d) => d.task.id)).toEqual(['plan-1']);
    });

    it('treats untyped documents as type "task"', () => {
      seedTask('task-1', 'todo');
      seedTask('plan-1', 'todo', { type: 'plan' });

      const tasks = listTasks(tasksDir, { type: 'task' });

      expect(tasks.map((d) => d.task.id)).toEqual(['task-1']);
    });
  });

  // ==========================================================================
  // Contract attach / activate
  // ==========================================================================

  describe('attachTaskContract', () => {
    it('builds a draft contract by default', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = attachTaskContract(filePath, { deliverableSpecs: 'file:src/a.ts:Impl' });

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('draft');
      expect(result.task!.contract!.deliverables).toEqual([
        { type: 'file', path: 'src/a.ts', description: 'Impl' },
      ]);
    });

    it('builds a ready contract when ready is set', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = attachTaskContract(filePath, { ready: true });

      expect(result.task!.contract!.status).toBe('ready');
      expect(result.task!.contract!.metrics!.readyAt).toBeDefined();
    });

    it('propagates an invalid deliverable spec as a thrown error', () => {
      const filePath = seedTask('task-1', 'todo');

      expect(() => attachTaskContract(filePath, { deliverableSpecs: 'bogus' })).toThrow(
        /Invalid deliverable format/
      );
    });
  });

  describe('activateTaskContract', () => {
    it('rejects a task with no contract', () => {
      const filePath = seedTask('task-1', 'todo');

      const result = activateTaskContract(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task task-1 has no contract');
    });

    it('rejects a contract that is not in draft', () => {
      const filePath = seedTask('task-1', 'todo', { contract: { status: 'ready' } });

      const result = activateTaskContract(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in draft status (current: ready)');
    });

    it('flips draft to ready and stamps metrics.readyAt', () => {
      const filePath = seedTask('task-1', 'todo', { contract: { status: 'draft' } });

      const result = activateTaskContract(filePath);

      expect(result.success).toBe(true);
      expect(result.task!.contract!.status).toBe('ready');
      expect(result.task!.contract!.metrics!.readyAt).toBeDefined();
      expect(readTaskFile(filePath)!.task.contract!.status).toBe('ready');
    });
  });

  describe('activateTaskContractsByParent', () => {
    it('activates only draft children and leaves other statuses untouched', () => {
      seedTask('task-1', 'todo', { parentId: 'epic-1', contract: { status: 'draft' } });
      seedTask('task-2', 'todo', { parentId: 'epic-1', contract: { status: 'in_progress' } });
      seedTask('task-3', 'todo', { parentId: 'epic-2', contract: { status: 'draft' } });

      const result = activateTaskContractsByParent(tasksDir, 'epic-1');

      expect(result.activated).toEqual(['task-1']);
      expect(readTaskFile(path.join(tasksDir, 'task-2.md'))!.task.contract!.status).toBe('in_progress');
      expect(readTaskFile(path.join(tasksDir, 'task-3.md'))!.task.contract!.status).toBe('draft');
    });

    it('returns an empty array rather than failing when nothing matches', () => {
      const result = activateTaskContractsByParent(tasksDir, 'epic-nope');
      expect(result.activated).toEqual([]);
    });
  });

  describe('DEFAULT_CONTRACT_COLUMN_MAP', () => {
    it('maps in_progress to in-progress', () => {
      expect(DEFAULT_CONTRACT_COLUMN_MAP['in_progress']).toBe('in-progress');
    });

    it('maps delivered to review', () => {
      expect(DEFAULT_CONTRACT_COLUMN_MAP['delivered']).toBe('review');
    });

    it('maps blocked to blocked', () => {
      expect(DEFAULT_CONTRACT_COLUMN_MAP['blocked']).toBe('blocked');
    });

    it('does not map failed (intentional — no default column for failures)', () => {
      expect(DEFAULT_CONTRACT_COLUMN_MAP['failed']).toBeUndefined();
    });
  });
});
