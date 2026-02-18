import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { moveCommand } from '../commands/move';
import { Brainfile, readTaskFile, taskFileName, writeTaskFile, type Column, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('move command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board-move.md');
  let logger: MemoryLogger;

  beforeEach(() => {
    fs.copyFileSync(testBoardPath, tempBoardPath);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (fs.existsSync(tempBoardPath)) {
      fs.unlinkSync(tempBoardPath);
    }
  });

  it('should move task between columns', () => {
    const result = moveCommand({
      file: tempBoardPath,
      task: 'task-1',
      column: 'in-progress',
    }, logger);

    expect(result.success).toBe(true);

    const output = logger.getOutput();
    expect(output).toContain('Task moved successfully');

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
    const inProgressColumn = board?.columns.find((col: Column) => col.id === 'in-progress');

    expect(todoColumn?.tasks).toHaveLength(0);
    expect(inProgressColumn?.tasks).toHaveLength(2);

    const movedTask = inProgressColumn?.tasks.find((t: Task) => t.id === 'task-1');
    expect(movedTask).toBeDefined();
    expect(movedTask?.title).toBe('First task');
  });

  it('should handle moving to same column', () => {
    const result = moveCommand({
      file: tempBoardPath,
      task: 'task-1',
      column: 'todo',
    }, logger);

    expect(result.success).toBe(true);
    // Should warn but not fail
    expect(logger.getOutput()).toContain('already in column');
  });

  it('should require task ID', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: '',
        column: 'done',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: tempBoardPath,
        task: '',
        column: 'done',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('--task is required');
    }
  });

  it('should require column', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: '',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: '',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('--column is required');
    }
  });

  it('should handle non-existent task', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-999',
        column: 'done',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: tempBoardPath,
        task: 'task-999',
        column: 'done',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('Task not found');
    }
  });

  it('should handle non-existent column', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: 'invalid-column',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: 'invalid-column',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('Column not found');
    }
  });

  it('should preserve task metadata when moving', () => {
    const result = moveCommand({
      file: tempBoardPath,
      task: 'task-2',
      column: 'done',
    }, logger);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const doneColumn = board?.columns.find((col: Column) => col.id === 'done');
    const movedTask = doneColumn?.tasks.find((t: Task) => t.id === 'task-2');

    expect(movedTask?.title).toBe('Second task');
    expect(movedTask?.priority).toBe('medium');
    expect(movedTask?.tags).toEqual(['test']);
    expect(movedTask?.subtasks).toHaveLength(2);
  });
});

describe('move command (v2 completionColumn auto-complete)', () => {
  let tempDir: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-move-v2-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(brainfilePath, `---
title: Move V2 Test Board
schema: https://brainfile.md/v2/board.json
types:
  adr:
    idPrefix: adr
    completable: false
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

  it('auto-completes a default task type when moved to completionColumn', () => {
    const task: Task = {
      id: 'task-1',
      title: 'Default task type',
      column: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
    };
    writeTaskFile(path.join(boardDir, taskFileName(task.id)), task, '## Description\nMove me\n');

    const result = moveCommand({
      file: brainfilePath,
      task: task.id,
      column: 'done',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.movedTask.completedAt).toBeDefined();
    expect(result.movedTask.column).toBeUndefined();
    expect(fs.existsSync(path.join(boardDir, taskFileName(task.id)))).toBe(false);
    expect(fs.existsSync(path.join(logsDir, taskFileName(task.id)))).toBe(true);

    const completedDoc = readTaskFile(path.join(logsDir, taskFileName(task.id)));
    expect(completedDoc).not.toBeNull();
    expect(completedDoc!.task.completedAt).toBeDefined();
    expect(completedDoc!.task.column).toBeUndefined();
  });

  it('does not auto-complete non-completable task types', () => {
    const task: Task = {
      id: 'adr-1',
      title: 'Architecture decision',
      type: 'adr',
      column: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
    };
    writeTaskFile(path.join(boardDir, taskFileName(task.id)), task, '');

    const result = moveCommand({
      file: brainfilePath,
      task: task.id,
      column: 'done',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.movedTask.completedAt).toBeUndefined();
    expect(result.movedTask.column).toBe('done');
    expect(fs.existsSync(path.join(boardDir, taskFileName(task.id)))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, taskFileName(task.id)))).toBe(false);

    const movedDoc = readTaskFile(path.join(boardDir, taskFileName(task.id)));
    expect(movedDoc).not.toBeNull();
    expect(movedDoc!.task.column).toBe('done');
    expect(movedDoc!.task.completedAt).toBeUndefined();
  });
});
