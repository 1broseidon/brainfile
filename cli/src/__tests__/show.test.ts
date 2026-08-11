import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { showCommand } from '../commands/show';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { createV2TestWorkspace, writeV2Task, type V2TestWorkspace } from './helpers/v2';

describe('show command', () => {
  let workspace: V2TestWorkspace;
  let logger: MemoryLogger;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-show-test-');
    writeV2Task(workspace, {
      id: 'task-2',
      title: 'Second task',
      column: 'in-progress',
      position: 0,
      subtasks: [
        { id: 'task-2-1', title: 'Subtask one', completed: true },
        { id: 'task-2-2', title: 'Subtask two', completed: false },
      ],
    } as Task);
    logger = new MemoryLogger();
  });

  afterEach(() => {
    if (workspace && fs.existsSync(workspace.tempDir)) {
      fs.rmSync(workspace.tempDir, { recursive: true, force: true });
    }
  });

  it('should show details for a task in the board', () => {
    const result = showCommand({ file: workspace.brainfilePath, task: 'task-2' }, logger);
    expect(result.success).toBe(true);
    expect(result.archived).toBe(false);

    const output = logger.getOutput();
    expect(output).toContain('Task:');
    expect(output).toContain('task-2');
    expect(output).toContain('Second task');
    expect(output).toContain('Column:');
    // v2 show renders the column id from the task file, not the column title
    expect(output).toContain('in-progress');
    expect(output).toContain('Subtasks:');
    expect(output).toContain('1/2');
    expect(output).toContain('Subtask one');
    expect(output).toContain('Subtask two');
  });

  it('should show details for a completed task in logs and indicate archived', () => {
    // v2 equivalent of the old archive file: completed tasks live in .brainfile/logs/
    writeTaskFile(
      path.join(workspace.logsDir, taskFileName('task-99')),
      {
        id: 'task-99',
        title: 'Archived task',
        description: 'Archived description text',
        column: 'done',
        position: 0,
        subtasks: [
          { id: 'task-99-1', title: 'Archived subtask', completed: true },
        ],
      } as Task,
      ''
    );

    const result = showCommand({ file: workspace.brainfilePath, task: 'task-99' }, logger);
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
    expect(() => showCommand({ file: workspace.brainfilePath, task: '' }, logger)).toThrow(CLIError);
  });

  it('should throw CLIError for non-existent task id', () => {
    expect(() => showCommand({ file: workspace.brainfilePath, task: 'task-999' }, logger)).toThrow(CLIError);
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
