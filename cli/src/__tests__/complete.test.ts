import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { completeCommand } from '../commands/complete';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';

describe('complete command', () => {
  let tempDir: string;
  let dotDir: string;
  let tasksDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-complete-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    tasksDir = path.join(dotDir, 'tasks');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    // Write v2 config-only brainfile
    fs.writeFileSync(brainfilePath, `---
title: Test Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
    completionColumn: true
---
`, 'utf-8');

    // Create a test task file
    const task: Task = {
      id: 'task-1',
      title: 'Test task',
      column: 'todo',
      position: 0,
      priority: 'high',
      tags: ['test'],
    };
    writeTaskFile(path.join(tasksDir, 'task-1.md'), task, composeBody('Test description'));

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete a v2 task - move from tasks/ to logs/', () => {
    const result = completeCommand({ file: brainfilePath, task: 'task-1' }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(result.completedAt).toBeDefined();

    // Task file should be removed from tasks/
    expect(fs.existsSync(path.join(tasksDir, 'task-1.md'))).toBe(false);

    // Task file should exist in logs/
    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(true);

    // Read the log file and verify completedAt is set
    const logContent = fs.readFileSync(path.join(logsDir, 'task-1.md'), 'utf-8');
    expect(logContent).toContain('completedAt');
    // Should NOT contain column or position
    expect(logContent).not.toMatch(/^column:/m);
    expect(logContent).not.toMatch(/^position:/m);
  });

  it('should throw CLIError when task is missing', () => {
    expect(() => {
      completeCommand({ file: brainfilePath }, logger);
    }).toThrow(CLIError);
  });

  it('should throw CLIError when task does not exist', () => {
    expect(() => {
      completeCommand({ file: brainfilePath, task: 'nonexistent' }, logger);
    }).toThrow(CLIError);
  });

  it('should preserve task description in log file', () => {
    completeCommand({ file: brainfilePath, task: 'task-1' }, logger);

    const logContent = fs.readFileSync(path.join(logsDir, 'task-1.md'), 'utf-8');
    expect(logContent).toContain('Test description');
  });
});
