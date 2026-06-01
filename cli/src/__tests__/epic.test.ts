import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { completeCommand } from '../commands/complete';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';

describe('epic completion', () => {
  let tempDir: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-epic-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(brainfilePath, `---
title: Test Board
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
    completionColumn: true
---
`, 'utf-8');

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('aborts completion when epic has incomplete child tasks unless --force is used', () => {
    const activeChild: Task = {
      id: 'task-1',
      title: 'Active child task',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'task-1.md'), activeChild, composeBody('Active task body'));

    const epic = {
      id: 'epic-1',
      title: 'Main epic',
      type: 'epic',
      column: 'todo',
      position: 1,
      subtasks: ['task-1'],
    } as unknown as Task;
    writeTaskFile(path.join(boardDir, 'epic-1.md'), epic, composeBody('Epic description'));

    expect(() => completeCommand({ file: brainfilePath, task: 'epic-1' }, logger)).toThrow(CLIError);

    expect(fs.existsSync(path.join(boardDir, 'epic-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'epic-1.md'))).toBe(false);

    const output = logger.getOutput();
    expect(output).toContain('incomplete child tasks');
    expect(output).toContain('--force');
  });

  it('completes with --force and writes child completion summary to log body', () => {
    const activeChild: Task = {
      id: 'task-1',
      title: 'Active child task',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'task-1.md'), activeChild, composeBody('Active task body'));

    const completedChild: Task = {
      id: 'task-2',
      title: 'Completed child task',
      completedAt: '2026-02-18T00:00:00.000Z',
    };
    writeTaskFile(path.join(logsDir, 'task-2.md'), completedChild, composeBody('Completed task body'));

    const epic = {
      id: 'epic-1',
      title: 'Main epic',
      type: 'epic',
      column: 'todo',
      position: 1,
      subtasks: ['task-1', 'task-2'],
    } as unknown as Task;
    writeTaskFile(path.join(boardDir, 'epic-1.md'), epic, composeBody('Epic description'));

    completeCommand({ file: brainfilePath, task: 'epic-1', force: true }, logger);

    const completedEpicContent = fs.readFileSync(path.join(logsDir, 'epic-1.md'), 'utf-8');
    expect(completedEpicContent).toContain('## Child Tasks');
    expect(completedEpicContent).toContain('Summary: 1/2 children completed.');
    expect(completedEpicContent).toContain('- task-1: Active child task (incomplete)');
    expect(completedEpicContent).toContain('- task-2: Completed child task (completed)');
  });

  it('prefers parentId-linked children over subtask ID references', () => {
    const linkedChild = {
      id: 'task-10',
      title: 'Linked child task',
      column: 'todo',
      position: 0,
      parentId: 'epic-3',
    } as Task;
    writeTaskFile(path.join(boardDir, 'task-10.md'), linkedChild, composeBody('Linked child body'));

    const epic = {
      id: 'epic-3',
      title: 'Parent-linked epic',
      type: 'epic',
      column: 'todo',
      position: 1,
      subtasks: ['task-999'], // stale reference should be ignored when parent-linked children exist
    } as unknown as Task;
    writeTaskFile(path.join(boardDir, 'epic-3.md'), epic, composeBody('Epic description'));

    completeCommand({ file: brainfilePath, task: 'epic-3', force: true }, logger);

    const completedEpicContent = fs.readFileSync(path.join(logsDir, 'epic-3.md'), 'utf-8');
    expect(completedEpicContent).toContain('## Child Tasks');
    expect(completedEpicContent).toContain('- task-10: Linked child task (incomplete)');
    expect(completedEpicContent).not.toContain('- task-999:');
  });

  it('records a fallback message when epic has no child task references', () => {
    const epic: Task = {
      id: 'epic-2',
      title: 'Standalone epic',
      type: 'epic',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'epic-2.md'), epic, composeBody('Standalone description'));

    completeCommand({ file: brainfilePath, task: 'epic-2' }, logger);

    const completedEpicContent = fs.readFileSync(path.join(logsDir, 'epic-2.md'), 'utf-8');
    expect(completedEpicContent).toContain('## Child Tasks');
    expect(completedEpicContent).toContain('No child tasks recorded.');
  });
});
