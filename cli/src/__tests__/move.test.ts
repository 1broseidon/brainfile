import * as fs from 'fs';
import * as path from 'path';
import { moveCommand } from '../commands/move';
import { Brainfile, type Column, type Task } from '@brainfile/core';
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
