import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseTaskContent,
  serializeTaskContent,
  readTaskFile,
  writeTaskFile,
  readTasksDir,
  taskFileName,
} from '../taskFile';
import type { Task } from '../types';

describe('taskFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-taskfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const writeFile = (relativePath: string, content: string) => {
    const fullPath = path.join(testDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  };

  describe('taskFileName', () => {
    it('generates filename from task ID', () => {
      expect(taskFileName('task-42')).toBe('task-42.md');
    });
  });

  describe('parseTaskContent', () => {
    it('parses YAML frontmatter and markdown body', () => {
      const content = [
        '---',
        'id: task-1',
        'title: Fix the bug',
        'column: todo',
        'priority: high',
        '---',
        '',
        '## Description',
        'This is the body.',
        '',
      ].join('\n');

      const result = parseTaskContent(content);

      expect(result).not.toBeNull();
      expect(result!.task.id).toBe('task-1');
      expect(result!.task.title).toBe('Fix the bug');
      expect(result!.task.column).toBe('todo');
      expect(result!.task.priority).toBe('high');
      expect(result!.body).toContain('## Description');
      expect(result!.body).toContain('This is the body.');
    });

    it('returns null for content without frontmatter', () => {
      expect(parseTaskContent('Just plain text')).toBeNull();
    });

    it('returns null for content without closing frontmatter delimiter', () => {
      const content = '---\nid: task-1\ntitle: No close\n';
      expect(parseTaskContent(content)).toBeNull();
    });

    it('returns null when id is missing', () => {
      const content = '---\ntitle: No ID\n---\n';
      expect(parseTaskContent(content)).toBeNull();
    });

    it('returns null when title is missing', () => {
      const content = '---\nid: task-1\n---\n';
      expect(parseTaskContent(content)).toBeNull();
    });

    it('handles empty body', () => {
      const content = '---\nid: task-1\ntitle: Task\n---\n';
      const result = parseTaskContent(content);
      expect(result).not.toBeNull();
      expect(result!.body).toBe('');
    });

    it('preserves subtasks in frontmatter', () => {
      const content = [
        '---',
        'id: task-1',
        'title: Task with subtasks',
        'subtasks:',
        '  - id: task-1-1',
        '    title: Subtask one',
        '    completed: false',
        '  - id: task-1-2',
        '    title: Subtask two',
        '    completed: true',
        '---',
        '',
      ].join('\n');

      const result = parseTaskContent(content);
      expect(result).not.toBeNull();
      expect(result!.task.subtasks).toHaveLength(2);
      expect(result!.task.subtasks![0].id).toBe('task-1-1');
      expect(result!.task.subtasks![1].completed).toBe(true);
    });

    it('preserves contract in frontmatter', () => {
      const content = [
        '---',
        'id: task-1',
        'title: Task with contract',
        'contract:',
        '  status: ready',
        '  deliverables:',
        '    - type: file',
        '      path: src/foo.ts',
        '---',
        '',
      ].join('\n');

      const result = parseTaskContent(content);
      expect(result).not.toBeNull();
      expect(result!.task.contract?.status).toBe('ready');
      expect(result!.task.contract?.deliverables).toHaveLength(1);
    });

    it('preserves tags as array', () => {
      const content = [
        '---',
        'id: task-1',
        'title: Tagged task',
        'tags:',
        '  - bug',
        '  - urgent',
        '---',
        '',
      ].join('\n');

      const result = parseTaskContent(content);
      expect(result).not.toBeNull();
      expect(result!.task.tags).toEqual(['bug', 'urgent']);
    });

    it('preserves completedAt field', () => {
      const content = [
        '---',
        'id: task-1',
        'title: Done task',
        'completedAt: "2025-12-17T12:00:00.000Z"',
        '---',
        '',
      ].join('\n');

      const result = parseTaskContent(content);
      expect(result).not.toBeNull();
      expect(result!.task.completedAt).toBe('2025-12-17T12:00:00.000Z');
    });
  });

  describe('serializeTaskContent', () => {
    it('serializes task with body', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
        column: 'todo',
      };

      const result = serializeTaskContent(task, '## Notes\nSome notes\n');

      expect(result).toMatch(/^---\n/);
      expect(result).toContain('id: task-1');
      expect(result).toContain('title: Test task');
      expect(result).toContain('column: todo');
      expect(result).toContain('---\n\n## Notes');
      expect(result).toContain('Some notes');
    });

    it('serializes task with empty body', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test task',
      };

      const result = serializeTaskContent(task, '');

      expect(result).toMatch(/^---\n/);
      expect(result).toContain('id: task-1');
      expect(result).toMatch(/---\n$/);
    });

    it('serializes task with no body argument', () => {
      const task: Task = { id: 'task-1', title: 'Test' };
      const result = serializeTaskContent(task);
      expect(result).toMatch(/---\n$/);
    });

    it('ensures trailing newline on body', () => {
      const task: Task = { id: 'task-1', title: 'Test' };
      const result = serializeTaskContent(task, 'No trailing newline');
      expect(result).toMatch(/No trailing newline\n$/);
    });
  });

  describe('readTaskFile / writeTaskFile roundtrip', () => {
    it('roundtrips task metadata and body', () => {
      const task: Task = {
        id: 'task-42',
        title: 'Roundtrip test',
        column: 'in-progress',
        priority: 'high',
        tags: ['test', 'v2'],
        subtasks: [
          { id: 'task-42-1', title: 'Sub 1', completed: false },
        ],
      };
      const body = '## Description\nDetailed description.\n\n## Log\n- 2025-01-01: Started\n';

      const filePath = path.join(testDir, 'task-42.md');
      writeTaskFile(filePath, task, body);

      const doc = readTaskFile(filePath);

      expect(doc).not.toBeNull();
      expect(doc!.task.id).toBe('task-42');
      expect(doc!.task.title).toBe('Roundtrip test');
      expect(doc!.task.column).toBe('in-progress');
      expect(doc!.task.priority).toBe('high');
      expect(doc!.task.tags).toEqual(['test', 'v2']);
      expect(doc!.task.subtasks).toHaveLength(1);
      expect(doc!.body).toContain('## Description');
      expect(doc!.body).toContain('Detailed description.');
      expect(doc!.body).toContain('## Log');
      expect(doc!.filePath).toBe(path.resolve(filePath));
    });

    it('creates parent directories automatically', () => {
      const task: Task = { id: 'task-1', title: 'Nested' };
      const filePath = path.join(testDir, 'nested', 'deep', 'task-1.md');

      writeTaskFile(filePath, task, '');

      expect(fs.existsSync(filePath)).toBe(true);
      const doc = readTaskFile(filePath);
      expect(doc!.task.id).toBe('task-1');
    });
  });

  describe('readTaskFile', () => {
    it('returns null for non-existent file', () => {
      expect(readTaskFile(path.join(testDir, 'nope.md'))).toBeNull();
    });

    it('returns null for invalid content', () => {
      writeFile('bad.md', 'no frontmatter here');
      expect(readTaskFile(path.join(testDir, 'bad.md'))).toBeNull();
    });
  });

  describe('readTasksDir', () => {
    it('reads all task files in a directory', () => {
      writeFile('tasks/task-1.md', '---\nid: task-1\ntitle: First\ncolumn: todo\n---\n');
      writeFile('tasks/task-2.md', '---\nid: task-2\ntitle: Second\ncolumn: todo\n---\n');
      writeFile('tasks/task-3.md', '---\nid: task-3\ntitle: Third\ncolumn: done\n---\n');

      const docs = readTasksDir(path.join(testDir, 'tasks'));

      expect(docs).toHaveLength(3);
      const ids = docs.map((d) => d.task.id).sort();
      expect(ids).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('skips non-md files', () => {
      writeFile('tasks/task-1.md', '---\nid: task-1\ntitle: Valid\n---\n');
      writeFile('tasks/readme.txt', 'not a task');

      const docs = readTasksDir(path.join(testDir, 'tasks'));
      expect(docs).toHaveLength(1);
    });

    it('skips invalid task files gracefully', () => {
      writeFile('tasks/task-1.md', '---\nid: task-1\ntitle: Valid\n---\n');
      writeFile('tasks/bad.md', 'no frontmatter');

      const docs = readTasksDir(path.join(testDir, 'tasks'));
      expect(docs).toHaveLength(1);
      expect(docs[0].task.id).toBe('task-1');
    });

    it('returns empty array for non-existent directory', () => {
      const docs = readTasksDir(path.join(testDir, 'nonexistent'));
      expect(docs).toEqual([]);
    });

    it('returns empty array for empty directory', () => {
      fs.mkdirSync(path.join(testDir, 'empty'));
      const docs = readTasksDir(path.join(testDir, 'empty'));
      expect(docs).toEqual([]);
    });
  });
});
