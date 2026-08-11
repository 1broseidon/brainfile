import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { moveCommand } from '../commands/move';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

function createV2Workspace(tempDir: string, extraConfig = ''): { brainfilePath: string; boardDir: string; logsDir: string } {
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  const brainfilePath = path.join(dotDir, 'brainfile.md');

  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(brainfilePath, `---
title: Move V2 Test Board
schema: https://brainfile.md/v2/board.json
${extraConfig}columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
---
`, 'utf-8');

  return { brainfilePath, boardDir, logsDir };
}

describe('move command (v1 rejection)', () => {
  let tempDir: string;
  let legacyPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-move-v1-reject-'));
    legacyPath = path.join(tempDir, 'brainfile.md');
    fs.writeFileSync(legacyPath, `---
title: Legacy Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First task
---
`, 'utf-8');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects v1 brainfiles and points to migrate', () => {
    expect(() => moveCommand({ file: legacyPath, task: 'task-1', column: 'done' }, logger)).toThrow(CLIError);

    try {
      moveCommand({ file: legacyPath, task: 'task-1', column: 'done' }, logger);
    } catch (e) {
      expect((e as CLIError).message).toContain('Brainfile v1 is no longer supported');
      expect((e as CLIError).details).toContain('brainfile migrate');
    }
  });
});

describe('move command (v2)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let boardDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-move-v2-'));
    const workspace = createV2Workspace(tempDir);
    brainfilePath = workspace.brainfilePath;
    boardDir = workspace.boardDir;

    writeTaskFile(path.join(boardDir, 'task-1.md'), {
      id: 'task-1',
      title: 'First task',
      column: 'todo',
      position: 0,
      priority: 'high',
      tags: ['urgent'],
    } as Task, '');
    writeTaskFile(path.join(boardDir, 'task-2.md'), {
      id: 'task-2',
      title: 'Second task',
      column: 'in-progress',
      position: 0,
      priority: 'medium',
      tags: ['test'],
      subtasks: [
        { id: 'task-2-1', title: 'Subtask one', completed: false },
        { id: 'task-2-2', title: 'Subtask two', completed: true },
      ],
    } as Task, '');

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('moves task between columns', () => {
    const result = moveCommand({
      file: brainfilePath,
      task: 'task-1',
      column: 'in-progress',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.movedTask.column).toBe('in-progress');
    expect(logger.getOutput()).toContain('Task moved successfully');

    const movedDoc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(movedDoc).not.toBeNull();
    expect(movedDoc!.task.column).toBe('in-progress');
    expect(movedDoc!.task.title).toBe('First task');
  });

  it('handles moving to same column', () => {
    const result = moveCommand({
      file: brainfilePath,
      task: 'task-1',
      column: 'todo',
    }, logger);

    expect(result.success).toBe(true);
    expect(logger.getOutput()).toContain('already in column');
  });

  it('requires task ID', () => {
    expect(() => {
      moveCommand({
        file: brainfilePath,
        task: '',
        column: 'done',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: brainfilePath,
        task: '',
        column: 'done',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('--task is required');
    }
  });

  it('requires column', () => {
    expect(() => {
      moveCommand({
        file: brainfilePath,
        task: 'task-1',
        column: '',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: brainfilePath,
        task: 'task-1',
        column: '',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('--column is required');
    }
  });

  it('handles non-existent task', () => {
    expect(() => {
      moveCommand({
        file: brainfilePath,
        task: 'task-999',
        column: 'done',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: brainfilePath,
        task: 'task-999',
        column: 'done',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain('Task not found');
    }
  });

  it('preserves task metadata when moving', () => {
    const result = moveCommand({
      file: brainfilePath,
      task: 'task-2',
      column: 'done',
    }, logger);

    expect(result.success).toBe(true);

    const movedDoc = readTaskFile(path.join(boardDir, 'task-2.md'));
    expect(movedDoc).not.toBeNull();
    expect(movedDoc!.task.title).toBe('Second task');
    expect(movedDoc!.task.priority).toBe('medium');
    expect(movedDoc!.task.tags).toEqual(['test']);
    expect(movedDoc!.task.subtasks).toHaveLength(2);
    expect(movedDoc!.task.column).toBe('done');
  });
});

describe('move command (v2 completionColumn auto-complete)', () => {
  let tempDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-move-v2-test-'));
    const dotDir = path.join(tempDir, '.brainfile');
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

    const ledgerPath = path.join(logsDir, 'ledger.jsonl');
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8').trim();
    const record = JSON.parse(ledgerContent);
    expect(record.id).toBe(task.id);
    expect(record.completedAt).toBeDefined();
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
