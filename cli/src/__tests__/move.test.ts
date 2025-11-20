import * as fs from 'fs';
import * as path from 'path';
import { moveCommand } from '../commands/move';
import { Brainfile } from '@brainfile/core';

describe('move command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board.md');

  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    fs.copyFileSync(testBoardPath, tempBoardPath);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempBoardPath)) {
      fs.unlinkSync(tempBoardPath);
    }

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should move task between columns', () => {
    moveCommand({
      file: tempBoardPath,
      task: 'task-1',
      column: 'in-progress',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Task moved successfully')
    );

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find(col => col.id === 'todo');
    const inProgressColumn = board?.columns.find(col => col.id === 'in-progress');

    expect(todoColumn?.tasks).toHaveLength(0);
    expect(inProgressColumn?.tasks).toHaveLength(2);

    const movedTask = inProgressColumn?.tasks.find(t => t.id === 'task-1');
    expect(movedTask).toBeDefined();
    expect(movedTask?.title).toBe('First task');
  });

  it('should handle moving to same column', () => {
    moveCommand({
      file: tempBoardPath,
      task: 'task-1',
      column: 'todo',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('already in column')
    );
  });

  it('should require task ID', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: '',
        column: 'done',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--task is required')
    );
  });

  it('should require column', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: '',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--column is required')
    );
  });

  it('should handle non-existent task', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-999',
        column: 'done',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Task not found')
    );
  });

  it('should handle non-existent column', () => {
    expect(() => {
      moveCommand({
        file: tempBoardPath,
        task: 'task-1',
        column: 'invalid-column',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Column not found')
    );
  });

  it('should preserve task metadata when moving', () => {
    moveCommand({
      file: tempBoardPath,
      task: 'task-2',
      column: 'done',
    });

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const doneColumn = board?.columns.find(col => col.id === 'done');
    const movedTask = doneColumn?.tasks.find(t => t.id === 'task-2');

    expect(movedTask?.title).toBe('Second task');
    expect(movedTask?.priority).toBe('medium');
    expect(movedTask?.tags).toEqual(['test']);
    expect(movedTask?.subtasks).toHaveLength(2);
  });
});
