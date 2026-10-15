import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addTaskFile } from '../taskOperations';
import { readTasksDir } from '../taskFile';
import { issueTask, labelTag, linkedTask, sourceKey, sourcesOf, type Issue } from '../issues';

/**
 * An issue on the board (task-26, decision-4): the task it becomes, and the
 * task an issue already became, found by the `source:` it carries.
 */

const issue: Issue = {
  number: 12,
  title: '  Crash on empty board ',
  body: 'Steps:\r\n1. Open\r\n',
  labels: ['bug', 'Good First Issue', 'area/desktop', 'bug'],
  url: 'https://github.com/o/r/issues/12',
  comments: 0,
  createdAt: '',
  updatedAt: '',
};

describe('issues', () => {
  it('an issue becomes a task with its title, body, labels as tags and a link back', () => {
    expect(issueTask(issue, 'todo')).toEqual({
      title: 'Crash on empty board',
      column: 'todo',
      description: 'Steps:\n1. Open',
      tags: ['bug', 'good-first-issue', 'area-desktop'],
      source: 'https://github.com/o/r/issues/12',
    });
    expect(issueTask({ ...issue, title: '', body: '  ', labels: [] }, 'todo')).toEqual({
      title: 'Issue #12',
      column: 'todo',
      source: 'https://github.com/o/r/issues/12',
    });
  });

  it('labels read as tags', () => {
    expect(labelTag('Good First Issue')).toBe('good-first-issue');
    expect(labelTag('type: bug')).toBe('type-bug');
    expect(labelTag(' 🐛 bug ')).toBe('bug');
    expect(labelTag('v1.2')).toBe('v1.2');
  });

  it('every source on the board maps to the first task that carries it, trailing slash ignored', () => {
    const sources = sourcesOf([
      { task: { id: 'task-1', source: 'https://github.com/o/r/issues/12/' } },
      { task: { id: 'task-2', source: 'https://github.com/o/r/issues/12' } },
      { task: { id: 'task-3', source: 42 } },
      { task: { id: 'task-4' } },
    ]);
    expect(sources).toEqual({ 'https://github.com/o/r/issues/12': 'task-1' });
    expect(sourceKey(' https://x/1// ')).toBe('https://x/1');
  });

  it('an issue already on the board is found by its URL, with or without a trailing slash', () => {
    expect(linkedTask(issue, { 'https://github.com/o/r/issues/12': 'task-4' })).toBe('task-4');
    expect(linkedTask({ url: issue.url + '/' }, { 'https://github.com/o/r/issues/12': 'task-4' })).toBe('task-4');
    expect(linkedTask(issue, { 'https://github.com/o/r/issues/13': 'task-5' })).toBeUndefined();
  });

  it('source is a field addTaskFile writes, and the board reads it back', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-issues-'));
    try {
      const boardDir = path.join(dir, 'board');
      const logsDir = path.join(dir, 'logs');
      fs.mkdirSync(boardDir);
      fs.mkdirSync(logsDir);
      const made = addTaskFile(boardDir, issueTask(issue, 'todo'), '', logsDir);
      expect(made.success).toBe(true);
      expect(made.task?.source).toBe('https://github.com/o/r/issues/12');
      expect(fs.readFileSync(path.join(boardDir, `${made.task!.id}.md`), 'utf-8')).toMatch(/^source: https:\/\/github\.com\/o\/r\/issues\/12$/m);
      expect(sourcesOf(readTasksDir(boardDir))).toEqual({ 'https://github.com/o/r/issues/12': made.task!.id });
      expect(addTaskFile(boardDir, { title: 'Plain', column: 'todo', source: '  ' }, '', logsDir).task).not.toHaveProperty('source');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
