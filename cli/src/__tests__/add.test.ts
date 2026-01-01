import * as fs from 'fs';
import * as path from 'path';
import { addCommand } from '../commands/add';
import { Brainfile, type Board, type Column, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('add command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board-add.md');
  let logger: MemoryLogger;

  beforeEach(() => {
    // Copy test board to temp location
    fs.copyFileSync(testBoardPath, tempBoardPath);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    // Clean up temp file
    if (fs.existsSync(tempBoardPath)) {
      fs.unlinkSync(tempBoardPath);
    }
  });

  it('should add a task with only title', () => {
    const result = addCommand({
      file: tempBoardPath,
      column: 'todo',
      title: 'New task',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();

    const output = logger.getOutput();
    expect(output).toContain('Task added successfully');

    // Verify task was added to file
    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
    expect(todoColumn?.tasks).toHaveLength(2); // Original task + new task

    const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'New task');
    expect(newTask).toBeDefined();
    expect(newTask?.id).toBeDefined();
  });

  it('should add a task with all metadata', () => {
    const result = addCommand({
      file: tempBoardPath,
      column: 'todo',
      title: 'Feature task',
      description: 'Test description',
      priority: 'high',
      tags: 'feature,new',
    }, logger);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
    const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'Feature task');

    expect(newTask?.description).toBe('Test description');
    expect(newTask?.priority).toBe('high');
    expect(newTask?.tags).toEqual(['feature', 'new']);
  });

  it('should add task to different columns', () => {
    const result = addCommand({
      file: tempBoardPath,
      column: 'in-progress',
      title: 'Active task',
    }, logger);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);

    const inProgressColumn = board?.columns.find((col: Column) => col.id === 'in-progress');
    const newTask = inProgressColumn?.tasks.find((t: Task) => t.title === 'Active task');

    expect(newTask).toBeDefined();
  });

  it('should add a task with a contract when --with-contract options are provided', () => {
    const result = addCommand({
      file: tempBoardPath,
      column: 'todo',
      title: 'Contracted task',
      withContract: true,
      deliverable: [
        'file:src/feature.ts:Main implementation',
        'test:src/feature.test.ts:Unit tests',
      ],
      validation: ['npm test'],
      constraint: ['Follow existing patterns'],
    }, logger);

    expect(result.success).toBe(true);

    const content = fs.readFileSync(tempBoardPath, 'utf-8');
    const board = Brainfile.parse(content);
    const todoColumn = board?.columns.find((col: Column) => col.id === 'todo');
    const newTask = todoColumn?.tasks.find((t: Task) => t.title === 'Contracted task');

    expect(newTask?.contract).toBeDefined();
    expect(newTask?.contract?.status).toBe('ready');
    expect(newTask?.contract?.deliverables?.map((d: any) => d.type)).toEqual(['file', 'test']);
    expect(newTask?.contract?.deliverables?.[0].path).toBe('src/feature.ts');
    expect(newTask?.contract?.validation?.commands).toEqual(['npm test']);
    expect(newTask?.contract?.constraints).toEqual(['Follow existing patterns']);
  });

  it('should throw CLIError when title is missing', () => {
    expect(() => {
      addCommand({
        file: tempBoardPath,
        column: 'todo',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: tempBoardPath,
        column: 'todo',
      }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('--title is required');
    }
  });

  it('should throw CLIError for invalid column', () => {
    expect(() => {
      addCommand({
        file: tempBoardPath,
        column: 'invalid-column',
        title: 'Test task',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: tempBoardPath,
        column: 'invalid-column',
        title: 'Test task',
      }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('Column not found');
    }
  });

  it('should throw CLIError for non-existent file', () => {
    expect(() => {
      addCommand({
        file: 'non-existent.md',
        column: 'todo',
        title: 'Test task',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: 'non-existent.md',
        column: 'todo',
        title: 'Test task',
      }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('File not found');
    }
  });
});
