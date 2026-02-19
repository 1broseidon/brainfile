import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listCommand } from '../commands/list';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { __resetV2MigrationHintState } from '../utils/v2-detect';

describe('list command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  const fixtureStatePath = path.join(fixturesDir, 'state.json');
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
    __resetV2MigrationHintState();
    // Clean up state.json that may be created by v2 migration hint
    if (fs.existsSync(fixtureStatePath)) fs.unlinkSync(fixtureStatePath);
  });

  afterAll(() => {
    if (fs.existsSync(fixtureStatePath)) fs.unlinkSync(fixtureStatePath);
  });

  it('should list all tasks when no filters are provided', () => {
    const result = listCommand({ file: testBoardPath }, logger);

    expect(result.success).toBe(true);
    expect(result.totalTasks).toBeGreaterThan(0);

    const output = logger.getOutput();
    expect(output).toContain('Test Board');
    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).toContain('task-2');
    expect(output).toContain('Second task');
    expect(output).toContain('task-3');
    expect(output).toContain('Completed task');
  });

  it('should filter tasks by column', () => {
    const result = listCommand({ file: testBoardPath, column: 'todo' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).toContain('First task');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('should filter tasks by tag', () => {
    const result = listCommand({ file: testBoardPath, tag: 'urgent' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('should filter tasks by contract status', () => {
    const result = listCommand({ file: testBoardPath, contract: 'ready' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('task-1');
    expect(output).not.toContain('task-2');
    expect(output).not.toContain('task-3');
  });

  it('should throw CLIError for non-existent file', () => {
    expect(() => {
      listCommand({ file: 'non-existent.md' }, logger);
    }).toThrow(CLIError);

    try {
      listCommand({ file: 'non-existent.md' }, logger);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
      expect((e as CLIError).message).toContain('File not found');
    }
  });

  it('should handle non-existent column gracefully', () => {
    const result = listCommand({ file: testBoardPath, column: 'non-existent' }, logger);

    expect(result.success).toBe(true);
    expect(result.columnsDisplayed).toBe(0);

    const output = logger.getOutput();
    expect(output).toContain('No columns found matching');
  });

  it('should show subtask progress', () => {
    const result = listCommand({ file: testBoardPath, column: 'in-progress' }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();

    expect(output).toContain('Subtasks:');
    expect(output).toContain('1/2'); // 1 of 2 subtasks completed
  });

  it('should show migration hint for legacy layouts', () => {
    const result = listCommand({ file: testBoardPath }, logger);

    expect(result.success).toBe(true);
    const output = logger.getOutput();
    expect(output).toContain('brainfile migrate');
  });

  it('should not show migration hint after it has been shown once', () => {
    // First run shows the hint
    listCommand({ file: testBoardPath }, logger);
    const firstOutput = logger.getOutput();
    expect(firstOutput).toContain('brainfile migrate');

    // Second run should not show the hint
    logger.clear();
    listCommand({ file: testBoardPath }, logger);
    const secondOutput = logger.getOutput();
    expect(secondOutput).not.toContain('brainfile migrate');
  });
});

describe('list command (v2 parent filter)', () => {
  let tempDir: string;
  let brainfilePath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-list-parent-'));
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

    const parent = `---
id: epic-1
title: Parent epic
type: epic
column: todo
position: 0
---
`;
    const child = `---
id: task-1
title: Child task
column: todo
position: 1
parentId: epic-1
---
`;
    const other = `---
id: task-2
title: Other task
column: todo
position: 2
---
`;

    fs.writeFileSync(path.join(boardDir, 'epic-1.md'), parent, 'utf-8');
    fs.writeFileSync(path.join(boardDir, 'task-1.md'), child, 'utf-8');
    fs.writeFileSync(path.join(boardDir, 'task-2.md'), other, 'utf-8');

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
