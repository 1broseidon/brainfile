import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Brainfile, writeTaskFile, type Task } from '@brainfile/core';
import { adrPromoteCommand } from '../commands/adr';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { composeBody } from '../utils/v2-detect';

describe('adr promote command', () => {
  let tempDir: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-adr-test-'));
    dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(brainfilePath, `---
title: Test Board
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
---
`, 'utf-8');

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('marks an ADR accepted and moves its task file to logs/', () => {
    const adrTask: Task = {
      id: 'adr-1',
      title: 'ADR-123: Board stays lean: only in-flight work',
      type: 'adr',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(
      path.join(boardDir, 'adr-1.md'),
      adrTask,
      composeBody('Decision details', 'Initial rationale')
    );

    const result = adrPromoteCommand({ file: brainfilePath, task: 'adr-1' }, logger);

    expect(result.success).toBe(true);
    expect(result.taskId).toBe('adr-1');
    expect(result.title).toBe('ADR-123: Board stays lean: only in-flight work');
    expect(result.completedAt).toBeDefined();

    // adr-2: promotion no longer writes anything into board config.
    const configBefore = fs.readFileSync(brainfilePath, 'utf-8');
    expect(configBefore).not.toContain('rules:');
    const board = Brainfile.parse(configBefore) as any;
    expect(board.rules).toBeUndefined();

    expect(fs.existsSync(path.join(boardDir, 'adr-1.md'))).toBe(false);
    expect(fs.existsSync(path.join(logsDir, 'adr-1.md'))).toBe(true);

    const logContent = fs.readFileSync(path.join(logsDir, 'adr-1.md'), 'utf-8');
    expect(logContent).toContain('status: promoted');
    expect(logContent).toContain('completedAt:');
    expect(logContent).not.toMatch(/^column:/m);
    expect(logContent).not.toMatch(/^position:/m);

    const output = logger.getOutput();
    expect(output).toContain('ADR promoted!');
    expect(output).toContain('adr-1');
  });

  it('throws CLIError for invalid ADR id', () => {
    expect(() => {
      adrPromoteCommand({ file: brainfilePath, task: 'adr-999' }, logger);
    }).toThrow(CLIError);
  });

  it('throws CLIError when --task is missing', () => {
    expect(() => {
      adrPromoteCommand({ file: brainfilePath }, logger);
    }).toThrow(CLIError);
  });

  it('throws CLIError for non-ADR task types', () => {
    const nonAdrTask: Task = {
      id: 'task-1',
      title: 'Normal task',
      type: 'task',
      column: 'todo',
      position: 0,
    };
    writeTaskFile(path.join(boardDir, 'task-1.md'), nonAdrTask, '');

    expect(() => {
      adrPromoteCommand({ file: brainfilePath, task: 'task-1' }, logger);
    }).toThrow(CLIError);
  });
});
