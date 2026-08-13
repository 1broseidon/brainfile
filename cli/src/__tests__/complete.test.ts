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
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-complete-test-'));
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
    writeTaskFile(path.join(boardDir, 'task-1.md'), task, composeBody('Test description'));

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete a v2 task - move from board/ to logs/', () => {
    const result = completeCommand({ file: brainfilePath, task: 'task-1' }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(result.completedAt).toBeDefined();

    // Task file should be removed from board/
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(false);

    // Task file should exist in logs/
    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(true);

    // Read the log file and verify completedAt is set
    const logContent = fs.readFileSync(path.join(logsDir, 'task-1.md'), 'utf-8');
    expect(logContent).toContain('completedAt');
    // Should NOT contain column or position
    expect(logContent).not.toMatch(/^column:/m);
    expect(logContent).not.toMatch(/^position:/m);

    const ledgerPath = path.join(logsDir, 'ledger.jsonl');
    expect(fs.existsSync(ledgerPath)).toBe(true);
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toContain('"id":"task-1"');
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

  describe('epic incomplete-children gate (now enforced in core)', () => {
    const writeEpicWithActiveChild = () => {
      writeTaskFile(
        path.join(boardDir, 'task-50.md'),
        { id: 'task-50', title: 'Active child', column: 'todo', parentId: 'epic-1' } as Task,
        '',
      );
      writeTaskFile(
        path.join(boardDir, 'epic-1.md'),
        { id: 'epic-1', title: 'The epic', type: 'epic', column: 'todo' } as Task,
        '',
      );
    };

    it('aborts with the same message text as before the refactor', () => {
      writeEpicWithActiveChild();

      expect(() => completeCommand({ file: brainfilePath, task: 'epic-1' }, logger)).toThrow(CLIError);

      const output = logger.getOutput();
      expect(output).toContain('Epic epic-1 has incomplete child tasks:');
      expect(output).toContain('- task-50: Active child');
      expect(output).toContain('Aborting completion. Re-run with --force to override.');

      expect(fs.existsSync(path.join(boardDir, 'epic-1.md'))).toBe(true);
      expect(fs.existsSync(path.join(logsDir, 'epic-1.md'))).toBe(false);
    });

    it('completes with --force and warns about the override', () => {
      writeEpicWithActiveChild();

      const result = completeCommand({ file: brainfilePath, task: 'epic-1', force: true }, logger);

      expect(result.success).toBe(true);
      expect(logger.getOutput()).toContain('with --force despite 1 incomplete child task(s)');
      expect(fs.existsSync(path.join(logsDir, 'epic-1.md'))).toBe(true);
    });

    it('does not gate non-epic tasks that have children', () => {
      writeTaskFile(
        path.join(boardDir, 'task-60.md'),
        { id: 'task-60', title: 'Child', column: 'todo', parentId: 'task-61' } as Task,
        '',
      );
      writeTaskFile(
        path.join(boardDir, 'task-61.md'),
        { id: 'task-61', title: 'Plain parent', column: 'todo' } as Task,
        '',
      );

      expect(completeCommand({ file: brainfilePath, task: 'task-61' }, logger).success).toBe(true);
    });
  });
});
