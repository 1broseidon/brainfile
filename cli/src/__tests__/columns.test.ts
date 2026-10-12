/**
 * `brainfile columns` (spec-13): list, add, rename, reorder, remove with
 * --move-to. The edits are core's; these check the command around them and
 * its wiring into the commander program.
 */
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { readBoardConfig } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import {
  columnsAddCommand,
  columnsListCommand,
  columnsRemoveCommand,
  columnsRenameCommand,
  columnsReorderCommand,
} from '../commands/columns';
import { createProgram } from '../program';
import { createV2TestWorkspace, readV2Task, writeV2Task, type V2TestWorkspace } from './helpers/v2';

function columnIds(workspace: V2TestWorkspace): string[] {
  return readBoardConfig(workspace.brainfilePath)!.config.columns.map((c) => c.id);
}

describe('columns command', () => {
  let workspace: V2TestWorkspace;
  let logger: MemoryLogger;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-columns-test-');
    logger = new MemoryLogger();
    writeV2Task(workspace, { id: 'task-1', title: 'One', column: 'in-progress' });
    writeV2Task(workspace, { id: 'task-2', title: 'Two', column: 'todo' });
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  it('lists the columns with task counts', () => {
    const result = columnsListCommand({ file: workspace.brainfilePath }, logger);
    expect(result.columns.map((c) => [c.id, c.taskCount])).toEqual([['todo', 1], ['in-progress', 1], ['done', 0]]);
    const lines = logger.getOutput().split('\n');
    expect(lines[0]).toMatch(/^ {2}ID\s+TITLE\s+TASKS$/);
    expect(lines[1]).toMatch(/^ {2}todo\s+To Do\s+1$/);
  });

  it('prints JSON with --json', () => {
    columnsListCommand({ file: workspace.brainfilePath, json: true }, logger);
    const payload = JSON.parse(logger.getOutput());
    expect(payload.columns[0]).toEqual({ id: 'todo', title: 'To Do', taskCount: 1 });
    expect(payload.success).toBeUndefined();
  });

  it('adds a column after another, with an ID from its title', () => {
    const result = columnsAddCommand('In Review', { file: workspace.brainfilePath, after: 'In Progress' }, logger);
    expect(result.column).toEqual({ id: 'in-review', title: 'In Review' });
    expect(columnIds(workspace)).toEqual(['todo', 'in-progress', 'in-review', 'done']);
    expect(logger.getOutput()).toContain('Added column in-review (In Review).');
  });

  it('adds a completion column with its own ID before another', () => {
    columnsAddCommand('Shipped', { file: workspace.brainfilePath, id: 'shipped', before: 'done', completion: true }, logger);
    const board = readBoardConfig(workspace.brainfilePath)!.config;
    expect(board.columns.map((c) => c.id)).toEqual(['todo', 'in-progress', 'shipped', 'done']);
    expect(board.columns[2]).toEqual({ id: 'shipped', title: 'Shipped', completionColumn: true });
  });

  it('renames a column and keeps its ID and tasks', () => {
    columnsRenameCommand('in-progress', 'Doing', { file: workspace.brainfilePath }, logger);
    const board = readBoardConfig(workspace.brainfilePath)!.config;
    expect(board.columns[1]).toEqual({ id: 'in-progress', title: 'Doing' });
    expect(readV2Task(workspace, 'task-1')?.task.column).toBe('in-progress');
  });

  it('reorders: the columns named first, the rest after', () => {
    columnsReorderCommand(['done', 'todo'], { file: workspace.brainfilePath }, logger);
    expect(columnIds(workspace)).toEqual(['done', 'todo', 'in-progress']);
  });

  it('refuses to remove a column with tasks without --move-to, and says how', () => {
    let error: unknown;
    try {
      columnsRemoveCommand('todo', { file: workspace.brainfilePath }, logger);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CLIError);
    expect((error as CLIError).message).toMatch(/column 'todo' holds 1 task \(task-2\)/);
    expect((error as CLIError).details).toBe('To move them first: brainfile columns remove todo --move-to <column>');
    expect(columnIds(workspace)).toContain('todo');
  });

  it('removes a column after moving its tasks, without completing them', () => {
    const result = columnsRemoveCommand('todo', { file: workspace.brainfilePath, moveTo: 'done' }, logger);
    expect(result.moved).toEqual(['task-2']);
    expect(columnIds(workspace)).toEqual(['in-progress', 'done']);
    expect(readV2Task(workspace, 'task-2')?.task.column).toBe('done');
    expect(fs.existsSync(`${workspace.logsDir}/task-2.md`)).toBe(false);
    expect(logger.getOutput()).toContain('Removed column todo; moved task-2 to done.');
  });

  it('removes an empty column', () => {
    columnsRemoveCommand('Done', { file: workspace.brainfilePath }, logger);
    expect(columnIds(workspace)).toEqual(['todo', 'in-progress']);
  });

  it('turns core refusals into CLI errors', () => {
    expect(() => columnsAddCommand('To Do', { file: workspace.brainfilePath }, logger)).toThrow(/already exists/);
    expect(() => columnsAddCommand(' ', { file: workspace.brainfilePath }, logger)).toThrow(/<title> is required/);
    expect(() => columnsRenameCommand('nope', 'X', { file: workspace.brainfilePath }, logger)).toThrow(/column not found: nope/);
    expect(() => columnsReorderCommand([], { file: workspace.brainfilePath }, logger)).toThrow(/is required/);
    expect(() => columnsRemoveCommand('nope', { file: workspace.brainfilePath }, logger)).toThrow(/column not found: nope/);
  });

  it('keeps the rest of the config and the body', () => {
    fs.writeFileSync(workspace.brainfilePath, `---
title: Kept
agent:
  instructions:
    - Write tests
x-custom: 1
columns:
  - id: todo
    title: To Do
---

# Kept

Body text.
`);
    columnsAddCommand('Done', { file: workspace.brainfilePath }, logger);
    const content = fs.readFileSync(workspace.brainfilePath, 'utf-8');
    const frontmatter = yaml.load(content.split('---')[1]) as Record<string, unknown>;
    expect(frontmatter).toMatchObject({ title: 'Kept', agent: { instructions: ['Write tests'] }, 'x-custom': 1 });
    expect(content).toContain('Body text.');
  });

  describe('wiring', () => {
    let logs: string[];
    let spy: jest.SpyInstance;

    beforeEach(() => {
      logs = [];
      spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logs.push(args.join(' ')); });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    const run = (...args: string[]) => createProgram().exitOverride().parseAsync(['node', 'brainfile', ...args]);

    it('runs list by default and the subcommands with their flags', async () => {
      await run('columns', '-f', workspace.brainfilePath, '--json');
      expect(JSON.parse(logs.join('\n')).columns).toHaveLength(3);

      await run('columns', 'add', 'In Review', '-f', workspace.brainfilePath, '--after', 'in-progress');
      await run('columns', 'rename', 'in-review', 'Review', '-f', workspace.brainfilePath);
      await run('columns', 'reorder', 'review', 'todo', '-f', workspace.brainfilePath);
      await run('columns', 'remove', 'in-progress', '--move-to', 'todo', '-f', workspace.brainfilePath);
      expect(readBoardConfig(workspace.brainfilePath)!.config.columns).toEqual([
        { id: 'in-review', title: 'Review' },
        { id: 'todo', title: 'To Do' },
        { id: 'done', title: 'Done' },
      ]);
      expect(readV2Task(workspace, 'task-1')?.task.column).toBe('todo');
    });
  });
});
