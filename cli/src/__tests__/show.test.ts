import * as fs from 'fs';
import * as path from 'path';
import { showCommand } from '../commands/show';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('show command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const tempBoardPath = path.join(fixturesDir, 'temp-board-show.md');
  const tempArchivePath = path.join(fixturesDir, 'temp-board-show-archive.md');

  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
  });

  afterEach(() => {
    for (const p of [tempBoardPath, tempArchivePath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('should show details for a task in the board', () => {
    const result = showCommand({ file: testBoardPath, task: 'task-2' }, logger);
    expect(result.success).toBe(true);
    expect(result.archived).toBe(false);

    const output = logger.getOutput();
    expect(output).toContain('Task:');
    expect(output).toContain('task-2');
    expect(output).toContain('Second task');
    expect(output).toContain('Column:');
    expect(output).toContain('In Progress');
    expect(output).toContain('Subtasks:');
    expect(output).toContain('1/2');
    expect(output).toContain('Subtask one');
    expect(output).toContain('Subtask two');
  });

  it('should show details for a task in the archive and indicate archived', () => {
    const board = `---
title: Temp Board
columns:
  - id: todo
    title: To Do
    tasks: []
---\n`;

    const archive = `---
title: Archive
columns: []
archive:
  - id: task-99
    title: Archived task
    description: Archived description text
    subtasks:
      - id: task-99-1
        title: Archived subtask
        completed: true
---\n`;

    fs.writeFileSync(tempBoardPath, board, 'utf-8');
    fs.writeFileSync(tempArchivePath, archive, 'utf-8');

    const result = showCommand({ file: tempBoardPath, task: 'task-99' }, logger);
    expect(result.success).toBe(true);
    expect(result.archived).toBe(true);

    const output = logger.getOutput();
    expect(output).toContain('task-99');
    expect(output).toContain('Archived task');
    expect(output).toContain('(archived)');
    expect(output).toContain('Archived:');
    expect(output).toContain('yes');
    expect(output).toContain('Description:');
    expect(output).toContain('Archived description text');
    expect(output).toContain('Archived subtask');
  });

  it('should throw CLIError for missing task id', () => {
    expect(() => showCommand({ file: testBoardPath, task: '' }, logger)).toThrow(CLIError);
  });

  it('should throw CLIError for non-existent task id', () => {
    expect(() => showCommand({ file: testBoardPath, task: 'task-999' }, logger)).toThrow(CLIError);
  });

  it('should throw CLIError for non-existent file', () => {
    expect(() => showCommand({ file: 'non-existent.md', task: 'task-1' }, logger)).toThrow(CLIError);
  });
});

