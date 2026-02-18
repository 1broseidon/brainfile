import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchCommand } from '../commands/search';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';

describe('search command (v2)', () => {
  let tempDir: string;
  let dotDir: string;
  let tasksDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-search-test-'));
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
---
`, 'utf-8');

    // Create active tasks
    const task1: Task = {
      id: 'task-1',
      title: 'Fix auth bug',
      column: 'todo',
      position: 0,
      tags: ['bug', 'auth'],
    };
    writeTaskFile(path.join(tasksDir, 'task-1.md'), task1, composeBody('Authentication fails on mobile'));

    const task2: Task = {
      id: 'task-2',
      title: 'Add rate limiter',
      column: 'in-progress',
      position: 0,
      tags: ['feature'],
    };
    writeTaskFile(path.join(tasksDir, 'task-2.md'), task2, composeBody('Implement token bucket rate limiting'));

    // Create a completed log
    const log1: Task = {
      id: 'task-3',
      title: 'Auth refactor',
      completedAt: '2026-02-17T10:00:00Z',
    };
    writeTaskFile(
      path.join(logsDir, 'task-3.md'),
      log1,
      composeBody('Refactored authentication module', '- 2026-02-17T10:00:00Z: Completed auth refactor')
    );

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should search across active tasks and logs', () => {
    const result = searchCommand({ file: brainfilePath, query: 'auth' }, logger);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2); // task-1 (title+tag), task-3 (title+description+log)
    const ids = result.results.map(r => r.id);
    expect(ids).toContain('task-1');
    expect(ids).toContain('task-3');
  });

  it('should filter by column', () => {
    const result = searchCommand({ file: brainfilePath, query: 'auth', column: 'todo' }, logger);

    expect(result.success).toBe(true);
    // Only task-1 is in todo column
    expect(result.results.length).toBe(1);
    expect(result.results[0].id).toBe('task-1');
  });

  it('should search by tag content', () => {
    const result = searchCommand({ file: brainfilePath, query: 'bug' }, logger);

    expect(result.success).toBe(true);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results[0].id).toBe('task-1');
  });

  it('should search descriptions', () => {
    const result = searchCommand({ file: brainfilePath, query: 'token bucket' }, logger);

    expect(result.success).toBe(true);
    expect(result.results.length).toBe(1);
    expect(result.results[0].id).toBe('task-2');
  });

  it('should throw CLIError when query is missing', () => {
    expect(() => {
      searchCommand({ file: brainfilePath }, logger);
    }).toThrow(CLIError);
  });

  it('should return empty results for no matches', () => {
    const result = searchCommand({ file: brainfilePath, query: 'zzz-nonexistent-zzz' }, logger);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it('should sort by relevance score', () => {
    const result = searchCommand({ file: brainfilePath, query: 'task-1' }, logger);

    expect(result.success).toBe(true);
    // Exact ID match should be first
    if (result.results.length > 0) {
      expect(result.results[0].id).toBe('task-1');
    }
  });
});
