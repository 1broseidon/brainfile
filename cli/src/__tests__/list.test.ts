import * as path from 'path';
import { listCommand } from '../commands/list';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('list command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const testBoardPath = path.join(fixturesDir, 'test-board.md');
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
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
});
