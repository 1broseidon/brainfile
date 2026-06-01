import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logCommand, logNoteCommand } from '../commands/log';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';

describe('log command', () => {
  let tempDir: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-log-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    // Write v2 config-only brainfile
    fs.writeFileSync(brainfilePath, `---
title: Test Board
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
---
`, 'utf-8');

    // Create completed task logs
    const log1: Task = {
      id: 'task-10',
      title: 'Auth feature',
      completedAt: '2026-02-17T10:00:00Z',
    };
    writeTaskFile(
      path.join(logsDir, 'task-10.md'),
      log1,
      composeBody('Implemented OAuth2 authentication', '- 2026-02-17T09:00:00Z: Started work\n- 2026-02-17T10:00:00Z: Completed')
    );

    const log2: Task = {
      id: 'task-11',
      title: 'Database migration',
      completedAt: '2026-02-16T15:00:00Z',
    };
    writeTaskFile(
      path.join(logsDir, 'task-11.md'),
      log2,
      composeBody('Migrated from PostgreSQL 14 to 16')
    );

    // Create an active task
    const active: Task = {
      id: 'task-20',
      title: 'Active work item',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'task-20.md'), active, composeBody('In progress work'));

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list recent completed tasks', () => {
    const result = logCommand({ file: brainfilePath }, logger);

    expect(result.success).toBe(true);
    expect(result.tasks).toBeDefined();
    expect(result.tasks!.length).toBe(2);
    // Most recent first
    expect(result.tasks![0].id).toBe('task-10');
    expect(result.tasks![1].id).toBe('task-11');
  });

  it('should view a specific task log', () => {
    const result = logCommand({ file: brainfilePath, task: 'task-10' }, logger);

    expect(result.success).toBe(true);
    expect(result.task).toBeDefined();
    expect(result.task!.id).toBe('task-10');
    expect(result.task!.log).toContain('Started work');
  });

  it('should search across logs', () => {
    const result = logCommand({ file: brainfilePath, search: 'OAuth' }, logger);

    expect(result.success).toBe(true);
    expect(result.tasks).toBeDefined();
    expect(result.tasks!.length).toBe(1);
    expect(result.tasks![0].id).toBe('task-10');
  });

  it('should search case-insensitively', () => {
    const result = logCommand({ file: brainfilePath, search: 'postgresql' }, logger);

    expect(result.success).toBe(true);
    expect(result.tasks!.length).toBe(1);
    expect(result.tasks![0].id).toBe('task-11');
  });
});

describe('log note command', () => {
  let tempDir: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-lognote-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(brainfilePath, `---
title: Test
columns:
  - id: todo
    title: To Do
---
`, 'utf-8');

    // Create an active task
    const task: Task = {
      id: 'task-5',
      title: 'Active task',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'task-5.md'), task, composeBody('Work in progress'));

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should append a log note to an active task', () => {
    const result = logNoteCommand({
      file: brainfilePath,
      task: 'task-5',
      message: 'Found the root cause',
    }, logger);

    expect(result.success).toBe(true);
    expect(result.entry).toContain('Found the root cause');

    // Verify the file was updated
    const content = fs.readFileSync(path.join(boardDir, 'task-5.md'), 'utf-8');
    expect(content).toContain('Found the root cause');
    expect(content).toContain('## Log');
  });

  it('should include agent attribution when provided', () => {
    const result = logNoteCommand({
      file: brainfilePath,
      task: 'task-5',
      message: 'Debugging complete',
      agent: 'claude',
    }, logger);

    expect(result.entry).toContain('[claude]');
    expect(result.entry).toContain('Debugging complete');
  });

  it('should throw CLIError when task ID is missing', () => {
    expect(() => {
      logNoteCommand({ file: brainfilePath, message: 'test' }, logger);
    }).toThrow(CLIError);
  });

  it('should throw CLIError when message is missing', () => {
    expect(() => {
      logNoteCommand({ file: brainfilePath, task: 'task-5' }, logger);
    }).toThrow(CLIError);
  });
});
