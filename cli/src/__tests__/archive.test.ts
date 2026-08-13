import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { archiveCommand } from '../commands/archive';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';

describe('archive command (v2 local)', () => {
  let tempDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;
  let log: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-archive-test-'));
    const dotDir = path.join(tempDir, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    brainfilePath = path.join(dotDir, 'brainfile.md');

    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      brainfilePath,
      `---
title: Test Board
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
    completionColumn: true
---
`,
      'utf-8',
    );

    writeTaskFile(
      path.join(boardDir, 'task-1.md'),
      { id: 'task-1', title: 'Archive me', column: 'todo', position: 0 } as Task,
      composeBody('Body'),
    );
  });

  afterEach(() => {
    log.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('completes an active task locally (ledger + logs/*.md)', async () => {
    await archiveCommand({ file: brainfilePath, task: 'task-1' });

    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(false);
    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'ledger.jsonl'))).toBe(true);
    expect(fs.readFileSync(path.join(logsDir, 'ledger.jsonl'), 'utf-8')).toContain('"id":"task-1"');
  });

  it('tells you a logs/ task is already completed instead of dead-ending', async () => {
    await archiveCommand({ file: brainfilePath, task: 'task-1' });
    log.mockClear();
    await archiveCommand({ file: brainfilePath, task: 'task-1' });
    const printed = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('Already completed');
    expect(printed).toContain('--to github');
  });

  it('treats --all with local destination as a no-op note', async () => {
    await archiveCommand({ file: brainfilePath, all: true });
    const printed = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('--all');
    expect(printed).toContain('no effect');
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(true);
  });
});
