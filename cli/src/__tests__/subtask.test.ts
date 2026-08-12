/**
 * Subtask surface coverage for the CLI command and the MCP tool, both of which
 * now delegate to core's subtask file mutators.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpJson, mcpText } from './helpers/mcp';
import { subtaskCommand } from '../commands/subtask';
import { registerSubtaskTool } from '../mcp/tools/subtask_tool';

describe('subtask surfaces', () => {
  let ws: V2TestWorkspace;
  let server: FakeMcpServer;
  let logSpy: jest.SpyInstance;

  const seed = (subtasks?: Task['subtasks']) => {
    writeTaskFile(
      path.join(ws.boardDir, taskFileName('task-1')),
      { id: 'task-1', title: 'Parent', column: 'todo', ...(subtasks && { subtasks }) } as Task,
      '',
    );
  };

  const subtasksOf = () => readTaskFile(path.join(ws.boardDir, 'task-1.md'))!.task.subtasks ?? [];

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-subtask-test-');
    server = new FakeMcpServer();
    registerSubtaskTool(server as any, ws.brainfilePath);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  describe('CLI', () => {
    it('adds a subtask with a canonical ID', () => {
      seed();
      subtaskCommand({ file: ws.brainfilePath, task: 'task-1', add: 'First' });

      expect(subtasksOf()).toEqual([{ id: 'task-1-1', title: 'First', completed: false }]);
    });

    it('toggles a subtask', () => {
      seed([{ id: 'task-1-1', title: 'A', completed: false }]);
      subtaskCommand({ file: ws.brainfilePath, task: 'task-1', toggle: 'task-1-1' });

      expect(subtasksOf()[0].completed).toBe(true);
    });

    it('updates a subtask title', () => {
      seed([{ id: 'task-1-1', title: 'Old', completed: false }]);
      subtaskCommand({ file: ws.brainfilePath, task: 'task-1', update: 'task-1-1', title: 'New' });

      expect(subtasksOf()[0].title).toBe('New');
    });

    it('deletes a subtask', () => {
      seed([
        { id: 'task-1-1', title: 'A', completed: false },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);
      subtaskCommand({ file: ws.brainfilePath, task: 'task-1', delete: 'task-1-1' });

      expect(subtasksOf().map((st) => st.id)).toEqual(['task-1-2']);
    });
  });

  describe('MCP', () => {
    it('adds a batch with sequential canonical IDs', async () => {
      seed([{ id: 'task-1-1', title: 'A', completed: false }]);

      const result = await server.handler('subtask')({
        action: 'add',
        file: ws.brainfilePath,
        task: 'task-1',
        subtasks: ['B', 'C'],
      });

      expect(mcpJson(result).added.map((a: any) => a.id)).toEqual(['task-1-2', 'task-1-3']);
    });

    it('toggles all subtasks to an explicit state', async () => {
      seed([
        { id: 'task-1-1', title: 'A', completed: false },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);

      await server.handler('subtask')({
        action: 'toggle',
        file: ws.brainfilePath,
        task: 'task-1',
        all: true,
        completed: true,
      });

      expect(subtasksOf().every((st) => st.completed)).toBe(true);
    });

    it('deletes all subtasks', async () => {
      seed([
        { id: 'task-1-1', title: 'A', completed: false },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);

      await server.handler('subtask')({
        action: 'delete',
        file: ws.brainfilePath,
        task: 'task-1',
        all: true,
      });

      expect(subtasksOf()).toEqual([]);
    });

    it('reports missing IDs on a partial batch delete', async () => {
      seed([{ id: 'task-1-1', title: 'A', completed: false }]);

      const result = await server.handler('subtask')({
        action: 'delete',
        file: ws.brainfilePath,
        task: 'task-1',
        subtasks: ['task-1-1', 'task-1-9'],
      });

      const payload = mcpJson(result);
      expect(payload.deleted).toEqual(['task-1-1']);
      expect(payload.missing).toEqual(['task-1-9']);
    });

    it('errors when no requested subtask exists', async () => {
      seed([{ id: 'task-1-1', title: 'A', completed: false }]);

      const result = await server.handler('subtask')({
        action: 'toggle',
        file: ws.brainfilePath,
        task: 'task-1',
        subtask: 'task-1-9',
      });

      expect(result.isError).toBe(true);
      expect(mcpText(result)).toContain('Subtask not found: task-1-9');
    });

    it('errors on a task with no subtasks', async () => {
      seed();

      const result = await server.handler('subtask')({
        action: 'toggle',
        file: ws.brainfilePath,
        task: 'task-1',
        all: true,
      });

      expect(result.isError).toBe(true);
      expect(mcpText(result)).toContain('no subtasks');
    });

    it('updates a batch of titles', async () => {
      seed([
        { id: 'task-1-1', title: 'A', completed: false },
        { id: 'task-1-2', title: 'B', completed: false },
      ]);

      await server.handler('subtask')({
        action: 'update',
        file: ws.brainfilePath,
        task: 'task-1',
        subtasks: ['task-1-1', 'task-1-2'],
        titles: ['A2', 'B2'],
      });

      expect(subtasksOf().map((st) => st.title)).toEqual(['A2', 'B2']);
    });
  });
});
