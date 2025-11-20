import * as fs from 'fs';
import * as path from 'path';
import { addCommand } from '../commands/add';
import { Brainfile } from '@brainfile/core';

describe('add command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board.md');

  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Copy test board to temp location
    fs.copyFileSync(testBoardPath, tempBoardPath);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    // Clean up temp file
    if (fs.existsSync(tempBoardPath)) {
      fs.unlinkSync(tempBoardPath);
    }

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should add a task with only title', () => {
    addCommand({
      file: tempBoardPath,
      column: 'todo',
      title: 'New task',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Task added successfully')
    );

    // Verify task was added to file
    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find(col => col.id === 'todo');
    expect(todoColumn?.tasks).toHaveLength(2); // Original task + new task

    const newTask = todoColumn?.tasks.find(t => t.title === 'New task');
    expect(newTask).toBeDefined();
    expect(newTask?.id).toBeDefined();
  });

  it('should add a task with all metadata', () => {
    addCommand({
      file: tempBoardPath,
      column: 'todo',
      title: 'Feature task',
      description: 'Test description',
      priority: 'high',
      tags: 'feature,new',
    });

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find(col => col.id === 'todo');
    const newTask = todoColumn?.tasks.find(t => t.title === 'Feature task');

    expect(newTask?.description).toBe('Test description');
    expect(newTask?.priority).toBe('high');
    expect(newTask?.tags).toEqual(['feature', 'new']);
  });

  it('should add task to different columns', () => {
    addCommand({
      file: tempBoardPath,
      column: 'in-progress',
      title: 'Active task',
    });

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const inProgressColumn = board?.columns.find(col => col.id === 'in-progress');
    const newTask = inProgressColumn?.tasks.find(t => t.title === 'Active task');

    expect(newTask).toBeDefined();
  });

  it('should require title', () => {
    expect(() => {
      addCommand({
        file: tempBoardPath,
        column: 'todo',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--title is required')
    );
  });

  it('should handle invalid column', () => {
    expect(() => {
      addCommand({
        file: tempBoardPath,
        column: 'invalid-column',
        title: 'Test task',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Column not found')
    );
  });

  it('should handle non-existent file', () => {
    expect(() => {
      addCommand({
        file: 'non-existent.md',
        column: 'todo',
        title: 'Test task',
      });
    }).toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File not found')
    );
  });
});
