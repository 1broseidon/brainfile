import * as fs from 'fs';
import * as path from 'path';
import { listCommand } from '../commands/list';

describe('list command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');

  // Mock console.log and console.error
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should list all tasks when no filters are provided', () => {
    listCommand({ file: testBoardPath });

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

    expect(output).toContain('Test Board');
    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).toContain('task-2');
    expect(output).toContain('Second task');
    expect(output).toContain('task-3');
    expect(output).toContain('Completed task');
  });

  it('should filter tasks by column', () => {
    listCommand({ file: testBoardPath, column: 'todo' });

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('should filter tasks by tag', () => {
    listCommand({ file: testBoardPath, tag: 'urgent' });

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('should handle non-existent file', () => {
    expect(() => {
      listCommand({ file: 'non-existent.md' });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found')
    );
  });

  it('should handle non-existent column gracefully', () => {
    listCommand({ file: testBoardPath, column: 'non-existent' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No columns found matching')
    );
  });

  it('should show subtask progress', () => {
    listCommand({ file: testBoardPath, column: 'in-progress' });

    expect(consoleLogSpy).toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map(call => call.join(' ')).join('\n');

    expect(output).toContain('Subtasks:');
    expect(output).toContain('1/2'); // 1 of 2 subtasks completed
  });
});
