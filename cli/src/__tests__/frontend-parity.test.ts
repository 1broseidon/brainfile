/**
 * Frontend-parity tests.
 *
 * The CLI, MCP tools, and TUI must produce identical on-disk outcomes for the
 * same logical operation. These tests pin the two divergences the thin-frontend
 * refactor fixed:
 *   1. The TUI's move action skipped auto-complete entirely (live bug).
 *   2. The MCP subtask tool generated subtask IDs with its own bespoke rule.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpText } from './helpers/mcp';
import { moveCommand } from '../commands/move';
import { subtaskCommand } from '../commands/subtask';
import { moveTaskAction } from '../tui/actions';
import { registerTaskMoveTool } from '../mcp/tools/task_move_tool';
import { registerSubtaskTool } from '../mcp/tools/subtask_tool';

const BOARD_WITH_DONE = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
    completionColumn: true
---
`;

/** Frontmatter fields that legitimately differ run-to-run. */
function stableFrontmatter(task: Task): Record<string, unknown> {
  const { completedAt, updatedAt, createdAt, ...rest } = task;
  return rest;
}

describe('frontend parity', () => {
  const workspaces: V2TestWorkspace[] = [];

  function freshWorkspace(): V2TestWorkspace {
    const ws = createV2TestWorkspace('brainfile-parity-test-', BOARD_WITH_DONE);
    workspaces.push(ws);

    const task: Task = {
      id: 'task-1',
      title: 'Move me to done',
      column: 'todo',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    writeTaskFile(path.join(ws.boardDir, taskFileName(task.id)), task, '## Description\nParity fixture\n');

    return ws;
  }

  afterEach(() => {
    while (workspaces.length > 0) {
      const ws = workspaces.pop()!;
      fs.rmSync(ws.tempDir, { recursive: true, force: true });
    }
  });

  describe('move-to-completion-column', () => {
    it('produces identical results across CLI, MCP, and TUI', async () => {
      const cliWs = freshWorkspace();
      const mcpWs = freshWorkspace();
      const tuiWs = freshWorkspace();

      // CLI
      moveCommand(
        { file: cliWs.brainfilePath, task: 'task-1', column: 'done' },
        { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
      );

      // MCP
      const server = new FakeMcpServer();
      registerTaskMoveTool(server as any, mcpWs.brainfilePath);
      const mcpResult = await server.handler('task_move')({
        file: mcpWs.brainfilePath,
        taskId: 'task-1',
        column: 'done',
      });
      expect(mcpResult.isError).toBeFalsy();
      expect(mcpText(mcpResult)).toContain('auto-completed');

      // TUI
      const tuiResult = moveTaskAction(tuiWs.brainfilePath, 'task-1', 'done');
      expect(tuiResult.success).toBe(true);

      for (const ws of [cliWs, mcpWs, tuiWs]) {
        // Removed from board/
        expect(fs.existsSync(path.join(ws.boardDir, 'task-1.md'))).toBe(false);
        // Present in logs/ as a real markdown file, not only a ledger line
        expect(fs.existsSync(path.join(ws.logsDir, 'task-1.md'))).toBe(true);
      }

      const docs = [cliWs, mcpWs, tuiWs].map((ws) => readTaskFile(path.join(ws.logsDir, 'task-1.md'))!);

      for (const doc of docs) {
        expect(doc.task.completedAt).toBeDefined();
        expect(doc.task.column).toBeUndefined();
        expect(doc.body).toContain('Parity fixture');
      }

      // Identical frontmatter modulo timestamps
      expect(stableFrontmatter(docs[1].task)).toEqual(stableFrontmatter(docs[0].task));
      expect(stableFrontmatter(docs[2].task)).toEqual(stableFrontmatter(docs[0].task));
    });

    it('TUI move to a completion column archives instead of leaving the task on the board', () => {
      const ws = freshWorkspace();

      moveTaskAction(ws.brainfilePath, 'task-1', 'done');

      // Regression guard: pre-refactor this left task-1 sitting in board/ with column=done.
      expect(fs.existsSync(path.join(ws.boardDir, 'task-1.md'))).toBe(false);
      expect(fs.existsSync(path.join(ws.logsDir, 'task-1.md'))).toBe(true);
    });
  });

  describe('subtask ID generation', () => {
    const GAPPED_SUBTASKS = [
      { id: 'task-1-1', title: 'First', completed: false },
      { id: 'task-1-3', title: 'Third', completed: false },
    ];

    function workspaceWithGappedSubtasks(): V2TestWorkspace {
      const ws = createV2TestWorkspace('brainfile-parity-subtask-', BOARD_WITH_DONE);
      workspaces.push(ws);

      const task: Task = {
        id: 'task-1',
        title: 'Has gapped subtasks',
        column: 'todo',
        position: 0,
        subtasks: GAPPED_SUBTASKS,
      };
      writeTaskFile(path.join(ws.boardDir, taskFileName(task.id)), task, '');

      return ws;
    }

    it('CLI and MCP both allocate task-1-4 over a gapped sequence', async () => {
      const cliWs = workspaceWithGappedSubtasks();
      const mcpWs = workspaceWithGappedSubtasks();

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        subtaskCommand({ file: cliWs.brainfilePath, task: 'task-1', add: 'Fourth' });
      } finally {
        logSpy.mockRestore();
      }

      const server = new FakeMcpServer();
      registerSubtaskTool(server as any, mcpWs.brainfilePath);
      await server.handler('subtask')({
        action: 'add',
        file: mcpWs.brainfilePath,
        task: 'task-1',
        subtask: 'Fourth',
      });

      const cliSubtasks = readTaskFile(path.join(cliWs.boardDir, 'task-1.md'))!.task.subtasks!;
      const mcpSubtasks = readTaskFile(path.join(mcpWs.boardDir, 'task-1.md'))!.task.subtasks!;

      expect(cliSubtasks.map((st) => st.id)).toEqual(['task-1-1', 'task-1-3', 'task-1-4']);
      expect(mcpSubtasks.map((st) => st.id)).toEqual(cliSubtasks.map((st) => st.id));
    });

    it('CLI-added and MCP-added subtasks do not collide when interleaved', async () => {
      const ws = workspaceWithGappedSubtasks();

      const server = new FakeMcpServer();
      registerSubtaskTool(server as any, ws.brainfilePath);

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        subtaskCommand({ file: ws.brainfilePath, task: 'task-1', add: 'From CLI' });
        await server.handler('subtask')({
          action: 'add',
          file: ws.brainfilePath,
          task: 'task-1',
          subtask: 'From MCP',
        });
        subtaskCommand({ file: ws.brainfilePath, task: 'task-1', add: 'From CLI again' });
      } finally {
        logSpy.mockRestore();
      }

      const ids = readTaskFile(path.join(ws.boardDir, 'task-1.md'))!.task.subtasks!.map((st) => st.id);

      expect(ids).toEqual(['task-1-1', 'task-1-3', 'task-1-4', 'task-1-5', 'task-1-6']);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
