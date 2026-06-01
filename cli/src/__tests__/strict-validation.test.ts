import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { addCommand } from '../commands/add';
import { moveCommand } from '../commands/move';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

function setupV2Board(tempDir: string, strict: boolean, types: string[] = []): { brainfilePath: string; boardDir: string } {
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const brainfilePath = path.join(dotDir, 'brainfile.md');
  const typesSection = types.length > 0
    ? `types:\n${types.map(typeName => `  ${typeName}:\n    idPrefix: ${typeName}\n`).join('')}`
    : '';

  const boardContent = `---
title: Strict Validation Board
schema: https://brainfile.md/v2/board.json
strict: ${strict}
${typesSection}columns:
  - id: todo
    title: To Do
    order: 1
  - id: done
    title: Done
    order: 2
---
`;

  fs.writeFileSync(brainfilePath, boardContent, 'utf-8');
  return { brainfilePath, boardDir };
}

function writeSeedTask(boardDir: string, task: Task): void {
  const taskPath = path.join(boardDir, taskFileName(task.id));
  writeTaskFile(taskPath, task, '');
}

describe('strict validation (v2)', () => {
  let tempDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-strict-validation-'));
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('add with strict board rejects unknown type', () => {
    const { brainfilePath } = setupV2Board(tempDir, true, ['epic']);

    expect(() => {
      addCommand({
        file: brainfilePath,
        column: 'todo',
        title: 'Unknown type task',
        type: 'spike',
      }, logger);
    }).toThrow(CLIError);

    try {
      addCommand({
        file: brainfilePath,
        column: 'todo',
        title: 'Unknown type task',
        type: 'spike',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain("Type 'spike' is not defined");
      expect((error as CLIError).message).toContain('Available types: task, epic');
    }
  });

  it('add with strict board accepts defined type', () => {
    const { brainfilePath, boardDir } = setupV2Board(tempDir, true, ['epic']);

    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Valid epic',
      type: 'epic',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('epic-1');

    const doc = readTaskFile(path.join(boardDir, 'epic-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.type).toBe('epic');
  });

  it('add with non-strict board accepts any type', () => {
    const { brainfilePath, boardDir } = setupV2Board(tempDir, false);

    const result = addCommand({
      file: brainfilePath,
      column: 'todo',
      title: 'Flexible type',
      type: 'spike',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('spike-1');

    const doc = readTaskFile(path.join(boardDir, 'spike-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.type).toBe('spike');
  });

  it('move with strict board rejects unknown column', () => {
    const { brainfilePath, boardDir } = setupV2Board(tempDir, true);
    writeSeedTask(boardDir, {
      id: 'task-1',
      title: 'Seed task',
      column: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
    });

    expect(() => {
      moveCommand({
        file: brainfilePath,
        task: 'task-1',
        column: 'backlog',
      }, logger);
    }).toThrow(CLIError);

    try {
      moveCommand({
        file: brainfilePath,
        task: 'task-1',
        column: 'backlog',
      }, logger);
    } catch (error) {
      expect((error as CLIError).message).toContain("Column 'backlog' is not defined");
      expect((error as CLIError).message).toContain('Available columns: todo, done');
    }
  });

  it('move with strict board accepts defined column', () => {
    const { brainfilePath, boardDir } = setupV2Board(tempDir, true);
    writeSeedTask(boardDir, {
      id: 'task-1',
      title: 'Seed task',
      column: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
    });

    const result = moveCommand({
      file: brainfilePath,
      task: 'task-1',
      column: 'done',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.targetColumn.id).toBe('done');

    const doc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.column).toBe('done');
  });

  it('move with non-strict board accepts any column', () => {
    const { brainfilePath, boardDir } = setupV2Board(tempDir, false);
    writeSeedTask(boardDir, {
      id: 'task-1',
      title: 'Seed task',
      column: 'todo',
      position: 0,
      createdAt: new Date().toISOString(),
    });

    const result = moveCommand({
      file: brainfilePath,
      task: 'task-1',
      column: 'backlog',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.targetColumn.id).toBe('backlog');

    const doc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(doc).not.toBeNull();
    expect(doc!.task.column).toBe('backlog');
  });
});
