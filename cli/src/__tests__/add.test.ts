import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { addCommand } from '../commands/add';
import { readTaskFile } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('add command (v1 rejection)', () => {
  let tempDir: string;
  let legacyPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-add-v1-reject-'));
    legacyPath = path.join(tempDir, 'brainfile.md');
    fs.writeFileSync(legacyPath, `---
title: Legacy Board
columns:
  - id: todo
    title: To Do
    tasks: []
---
`, 'utf-8');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects v1 brainfiles and points to migrate', () => {
    expect(() => addCommand({ file: legacyPath, column: 'todo', title: 'New task' }, logger)).toThrow(CLIError);

    try {
      addCommand({ file: legacyPath, column: 'todo', title: 'New task' }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('Brainfile v1 is no longer supported');
      expect((e as CLIError).details).toContain('brainfile migrate');
    }
  });

  it('validates required title before workspace format', () => {
    expect(() => addCommand({ file: legacyPath, column: 'todo' }, logger)).toThrow(CLIError);

    try {
      addCommand({ file: legacyPath, column: 'todo' }, logger);
    } catch (e) {
      expect((e as CLIError).message).toContain('--title is required');
    }
  });
});

describe('add command (v2)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let boardDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-add-v2-'));
    const dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });

    brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, `---
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
`, 'utf-8');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a task with metadata as a task file', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Feature task',
      description: 'Test description',
      priority: 'high',
      tags: 'feature,new',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(logger.getOutput()).toContain('Task added successfully');

    const doc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.title).toBe('Feature task');
    expect(doc!.task.column).toBe('todo');
    expect(doc!.task.priority).toBe('high');
    expect(doc!.task.tags).toEqual(['feature', 'new']);
    expect(doc!.body).toContain('Test description');
  });

  it('adds a task with a draft contract', () => {
    const result = addCommand({
      file: brainfilePath,
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

    const doc = readTaskFile(path.join(boardDir, `${result.taskId}.md`));
    expect(doc).not.toBeNull();
    expect(doc!.task.contract?.status).toBe('draft');
    expect(doc!.task.contract?.deliverables?.map((d: any) => d.type)).toEqual(['file', 'test']);
    expect(doc!.task.contract?.deliverables?.[0].path).toBe('src/feature.ts');
    expect(doc!.task.contract?.validation?.commands).toEqual(['npm test']);
    expect(doc!.task.contract?.constraints).toEqual(['Follow existing patterns']);
  });

  it('throws CLIError for invalid column', () => {
    expect(() => {
      addCommand({
        file: brainfilePath,
        column: 'invalid-column',
        title: 'Test task',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: brainfilePath,
        column: 'invalid-column',
        title: 'Test task',
      }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('Column not found');
    }
  });

  it('throws CLIError for non-existent file', () => {
    expect(() => {
      addCommand({
        file: path.join(tempDir, 'missing.md'),
        column: 'todo',
        title: 'Test task',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: path.join(tempDir, 'missing.md'),
        column: 'todo',
        title: 'Test task',
      }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('File not found');
    }
  });

  it('generates type-prefixed ID when --type is provided', () => {
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

    const doc = readTaskFile(path.join(boardDir, 'epic-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.id).toBe('epic-1');
    expect(doc!.task.type).toBe('epic');
    expect(doc!.task.title).toBe('My Epic');
  });

  it('generates default task-prefixed ID when --type is omitted', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Regular task',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');

    const doc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.id).toBe('task-1');
    expect(doc!.task.type).toBeUndefined();
  });

  it('does not set type field when --type is "task"', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Explicit task type',
      type: 'task',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');

    const doc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.type).toBeUndefined();
  });

  it('increments type-specific IDs independently', () => {
    addCommand({ file: brainfilePath, column: 'todo', title: 'Task one' }, logger);
    const epicResult = addCommand({ file: brainfilePath, column: 'todo', title: 'Epic one', type: 'epic' }, logger);
    const epicResult2 = addCommand({ file: brainfilePath, column: 'todo', title: 'Epic two', type: 'epic' }, logger);
    const adrResult = addCommand({ file: brainfilePath, column: 'todo', title: 'ADR one', type: 'adr' }, logger);

    expect(epicResult.taskId).toBe('epic-1');
    expect(epicResult2.taskId).toBe('epic-2');
    expect(adrResult.taskId).toBe('adr-1');
  });

  it('does not show Type in output when type is default task', () => {
    addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Regular task',
    }, logger);

    const output = logger.getOutput();
    expect(output).not.toContain('Type:');
  });

  it('sets parentId when --parent is provided', () => {
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

    const childDoc = readTaskFile(path.join(boardDir, `${child.taskId}.md`));
    expect(childDoc).not.toBeNull();
    expect((childDoc!.task as any).parentId).toBe(parent.taskId);
  });

  it('creates one child task per --child entry linked to the created parent', () => {
    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Auth epic',
      type: 'epic',
      child: ['OAuth flow', 'Session hardening'],
    }, logger);

    const parentDoc = readTaskFile(path.join(boardDir, `${result.taskId}.md`));
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
