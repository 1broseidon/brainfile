import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { showCommand } from '../commands/show';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('show command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  let tempDir: string;
  let tempBoardPath: string;
  let tempArchivePath: string;

  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-show-test-'));
    tempBoardPath = path.join(tempDir, 'temp-board-show.md');
    tempArchivePath = path.join(tempDir, 'temp-board-show-archive.md');
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
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

describe('show command (v2 children)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-show-children-'));
    const dotDir = path.join(tempDir, '.brainfile');
    const boardDir = path.join(dotDir, 'board');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });

    brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, `---
title: Test Board
columns:
  - id: todo
    title: To Do
---
`, 'utf-8');

    fs.writeFileSync(path.join(boardDir, 'epic-1.md'), `---
id: epic-1
title: Parent epic
type: epic
column: todo
position: 0
---
`, 'utf-8');

    fs.writeFileSync(path.join(boardDir, 'task-1.md'), `---
id: task-1
title: Child one
column: todo
position: 1
parentId: epic-1
---
`, 'utf-8');

    fs.writeFileSync(path.join(boardDir, 'task-2.md'), `---
id: task-2
title: Child two
column: todo
position: 2
parentId: epic-1
---
`, 'utf-8');

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows child IDs for a parent task', () => {
    const result = showCommand({ file: brainfilePath, task: 'epic-1' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();
    expect(output).toContain('Children:');
    expect(output).toContain('task-1');
    expect(output).toContain('task-2');
  });
});
