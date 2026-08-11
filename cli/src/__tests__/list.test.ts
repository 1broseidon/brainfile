import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listCommand } from '../commands/list';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

function createV2Workspace(tempDir: string): { brainfilePath: string; boardDir: string; logsDir: string } {
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const brainfilePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(brainfilePath, `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
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

function writeTask(boardDir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(boardDir, name), content, 'utf-8');
}

describe('list command', () => {
  let tempDir: string;
  let brainfilePath: string;
  let boardDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-list-v2-'));
    const workspace = createV2Workspace(tempDir);
    brainfilePath = workspace.brainfilePath;
    boardDir = workspace.boardDir;

    writeTask(boardDir, 'task-1.md', `---
id: task-1
title: First task
column: todo
position: 0
priority: high
contract:
  status: ready
tags:
  - test
  - urgent
---
`);
    writeTask(boardDir, 'task-2.md', `---
id: task-2
title: Second task
column: in-progress
position: 0
priority: medium
contract:
  status: in_progress
tags:
  - test
subtasks:
  - id: task-2-1
    title: Subtask one
    completed: false
  - id: task-2-2
    title: Subtask two
    completed: true
---
`);
    writeTask(boardDir, 'task-3.md', `---
id: task-3
title: Completed task
column: done
position: 0
priority: low
contract:
  status: done
---
`);

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists all tasks when no filters are provided', () => {
    const result = listCommand({ file: brainfilePath }, logger);

    expect(result.success).toBe(true);
    expect(result.totalTasks).toBe(3);

    const output = logger.getOutput();
    expect(output).toContain('Test Board');
    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).toContain('task-2');
    expect(output).toContain('Second task');
    expect(output).toContain('task-3');
    expect(output).toContain('Completed task');
  });

  it('filters tasks by column', () => {
    const result = listCommand({ file: brainfilePath, column: 'todo' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('filters tasks by tag', () => {
    const result = listCommand({ file: brainfilePath, tag: 'urgent' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('filters tasks by contract status', () => {
    const result = listCommand({ file: brainfilePath, contract: 'ready' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('throws CLIError for non-existent file', () => {
    expect(() => {
      listCommand({ file: path.join(tempDir, 'non-existent.md') }, logger);
    }).toThrow(CLIError);

    try {
      listCommand({ file: path.join(tempDir, 'non-existent.md') }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('File not found');
    }
  });

  it('handles non-existent column gracefully', () => {
    const result = listCommand({ file: brainfilePath, column: 'non-existent' }, logger);

    expect(result.success).toBe(true);
    expect(result.columnsDisplayed).toBe(0);

    const output = logger.getOutput();
    expect(output).toContain('No columns found matching');
  });

  it('shows subtask progress', () => {
    const result = listCommand({ file: brainfilePath, column: 'in-progress' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('Subtasks:');
    expect(output).toContain('1/2');
  });

  it('rejects v1 brainfiles and points to migrate', () => {
    const legacyPath = path.join(tempDir, 'legacy.md');
    fs.writeFileSync(legacyPath, `---\ntitle: Legacy\ncolumns: []\n---\n`, 'utf-8');

    expect(() => listCommand({ file: legacyPath }, logger)).toThrow(CLIError);

    try {
      listCommand({ file: legacyPath }, logger);
    } catch (e) {
      expect((e as CLIError).message).toContain('Brainfile v1 is no longer supported');
      expect((e as CLIError).details).toContain('brainfile migrate');
    }
  });
});

describe('list command (v2 parent filter)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let boardDir: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-list-parent-'));
    const workspace = createV2Workspace(tempDir);
    brainfilePath = workspace.brainfilePath;
    boardDir = workspace.boardDir;

    writeTask(boardDir, 'epic-1.md', `---
id: epic-1
title: Parent epic
type: epic
column: todo
position: 0
---
`);
    writeTask(boardDir, 'task-1.md', `---
id: task-1
title: Child task
column: todo
position: 1
parentId: epic-1
---
`);
    writeTask(boardDir, 'task-2.md', `---
id: task-2
title: Other task
column: todo
position: 2
---
`);

    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('filters tasks by --parent', () => {
    const result = listCommand({ file: brainfilePath, parent: 'epic-1' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).toContain('Parent: epic-1');
  });
});
