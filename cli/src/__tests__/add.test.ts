import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addCommand } from '../commands/add';
import { Brainfile, readTaskFile, type Board, type Column, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('add command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  let tempDir: string;
  let tempBoardPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-add-test-'));
    tempBoardPath = path.join(tempDir, 'temp-board-add.md');
    fs.copyFileSync(testBoardPath, tempBoardPath);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
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
    expect(newTask?.contract?.status).toBe('draft');
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

describe('add command (v2 --type flag)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let boardDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-add-type-'));
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(dotDir, { recursive: true });
    boardDir = path.join(dotDir, 'board');
    fs.mkdirSync(boardDir);
    fs.mkdirSync(path.join(dotDir, 'logs'));

    brainfilePath = path.join(dotDir, 'brainfile.md');
    const boardContent = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
    order: 1
  - id: in-progress
    title: In Progress
    order: 2
  - id: done
    title: Done
    order: 3
---
`;
    fs.writeFileSync(brainfilePath, boardContent, 'utf-8');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate type-prefixed ID when --type is provided', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'My Epic',
      type: 'epic',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('epic-1');

    const output = logger.getOutput();
    expect(output).toContain('Task added successfully');
    expect(output).toContain('Type:');
    expect(output).toContain('epic');

    // Verify the task file was written with the correct type and ID
    const taskPath = path.join(boardDir, 'epic-1.md');
    const doc = readTaskFile(taskPath);
    expect(doc).not.toBeNull();
    expect(doc!.task.id).toBe('epic-1');
    expect(doc!.task.type).toBe('epic');
    expect(doc!.task.title).toBe('My Epic');
  });

  it('should generate default task-prefixed ID when --type is omitted', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Regular task',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');

    // Verify no type field is set on the task
    const taskPath = path.join(boardDir, 'task-1.md');
    const doc = readTaskFile(taskPath);
    expect(doc).not.toBeNull();
    expect(doc!.task.id).toBe('task-1');
    expect(doc!.task.type).toBeUndefined();
  });

  it('should not set type field when --type is "task"', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Explicit task type',
      type: 'task',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');

    const taskPath = path.join(boardDir, 'task-1.md');
    const doc = readTaskFile(taskPath);
    expect(doc).not.toBeNull();
    expect(doc!.task.type).toBeUndefined();
  });

  it('should increment type-specific IDs independently', () => {
    // Add a regular task
    addCommand({ file: brainfilePath, column: 'todo', title: 'Task one' }, logger);
    // Add an epic
    const epicResult = addCommand({ file: brainfilePath, column: 'todo', title: 'Epic one', type: 'epic' }, logger);
    // Add another epic
    const epicResult2 = addCommand({ file: brainfilePath, column: 'todo', title: 'Epic two', type: 'epic' }, logger);
    // Add an ADR
    const adrResult = addCommand({ file: brainfilePath, column: 'todo', title: 'ADR one', type: 'adr' }, logger);

    expect(epicResult.taskId).toBe('epic-1');
    expect(epicResult2.taskId).toBe('epic-2');
    expect(adrResult.taskId).toBe('adr-1');
  });

  it('should not show Type in output when type is default task', () => {
    addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Regular task',
    }, logger);

    const output = logger.getOutput();
    expect(output).not.toContain('Type:');
  });

  it('should set parentId when --parent is provided', () => {
    const parent = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Parent task',
      type: 'epic',
    }, logger);

    const child = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Child task',
      parent: parent.taskId,
    }, logger);

    const childPath = path.join(boardDir, `${child.taskId}.md`);
    const childDoc = readTaskFile(childPath);
    expect(childDoc).not.toBeNull();
    expect((childDoc!.task as any).parentId).toBe(parent.taskId);
  });

  it('should create one child task per --child entry linked to the created parent', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Auth epic',
      type: 'epic',
      child: ['OAuth flow', 'Session hardening'],
    }, logger);

    const parentPath = path.join(boardDir, `${result.taskId}.md`);
    const parentDoc = readTaskFile(parentPath);
    expect(parentDoc).not.toBeNull();

    const childDocs = fs
      .readdirSync(boardDir)
      .map((file) => readTaskFile(path.join(boardDir, file)))
      .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
      .filter((doc) => (doc.task as any).parentId === result.taskId);

    expect(childDocs).toHaveLength(2);
    expect(childDocs.map((doc) => doc.task.title).sort()).toEqual(['OAuth flow', 'Session hardening']);
    expect(childDocs.every((doc) => !doc.task.type || doc.task.type === 'task')).toBe(true);
  });
});
