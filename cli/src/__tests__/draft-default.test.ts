/**
 * Tests for draft-by-default contract behavior and `activate` command.
 *
 * Contract: Contracts created via `add --with-contract` or `contract attach`
 * default to status=draft. Use --ready (CLI) or ready:true (MCP) to make them
 * immediately dispatchable. Use `contract activate` to flip draft → ready.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readTaskFile, taskFileName, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { addCommand } from '../commands/add';
import {
  contractAttachCommand,
  contractActivateCommand,
} from '../commands/contract';
import {
  createV2TestWorkspace,
  writeV2Task,
  readV2Task,
  type V2TestWorkspace,
} from './helpers/v2';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const workspaces: V2TestWorkspace[] = [];

function makeWorkspace(withExistingTask = false): V2TestWorkspace {
  const workspace = createV2TestWorkspace('bf-draft-test-');
  if (withExistingTask) {
    writeV2Task(workspace, {
      id: 'task-1',
      title: 'Existing Task',
      column: 'todo',
      position: 0,
    } as Task);
  }
  workspaces.push(workspace);
  return workspace;
}

function makeTempV2Dir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-draft-v2-'));
  // Create brainfile.md for v2 detection
  fs.writeFileSync(
    path.join(dir, 'brainfile.md'),
    `---
title: V2 Board
columns:
  - id: todo
    title: To Do
---
`,
    'utf-8'
  );
  const boardDir = path.join(dir, 'board');
  const logsDir = path.join(dir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI add command: draft-by-default
// ─────────────────────────────────────────────────────────────────────────────

describe('draft default and activate behavior', () => {
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
  });

  afterAll(() => {
    for (const workspace of workspaces) {
      fs.rmSync(workspace.tempDir, { recursive: true, force: true });
    }
  });

  describe('addCommand: --with-contract defaults to draft', () => {
    it('creates contract with status=draft when --with-contract used without --ready', () => {
      const workspace = makeWorkspace();

      const result = addCommand(
        {
          file: workspace.brainfilePath,
          column: 'todo',
          title: 'Draft contract task',
          withContract: true,
          deliverable: ['file:src/foo.ts:Implementation'],
          validation: ['npm test'],
        },
        logger
      );

      expect(result.success).toBe(true);

      const task = readV2Task(workspace, result.taskId!)?.task;
      expect(task?.title).toBe('Draft contract task');
      expect(task?.contract).toBeDefined();
      expect(task?.contract?.status).toBe('draft');
    });

    it('creates contract with status=ready when --with-contract and --ready are both set', () => {
      const workspace = makeWorkspace();

      const result = addCommand(
        {
          file: workspace.brainfilePath,
          column: 'todo',
          title: 'Ready contract task',
          withContract: true,
          ready: true,
          deliverable: ['file:src/foo.ts:Implementation'],
        },
        logger
      );

      expect(result.success).toBe(true);

      const task = readV2Task(workspace, result.taskId!)?.task;
      expect(task?.title).toBe('Ready contract task');
      expect(task?.contract).toBeDefined();
      expect(task?.contract?.status).toBe('ready');
    });

    it('defaults to draft even when only deliverables are provided (no --with-contract flag)', () => {
      const workspace = makeWorkspace();

      const result = addCommand(
        {
          file: workspace.brainfilePath,
          column: 'todo',
          title: 'Implicit contract task',
          deliverable: ['file:src/bar.ts:Implementation'],
        },
        logger
      );

      expect(result.success).toBe(true);

      const task = readV2Task(workspace, result.taskId!)?.task;
      expect(task?.title).toBe('Implicit contract task');
      expect(task?.contract).toBeDefined();
      expect(task?.contract?.status).toBe('draft');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // contractAttachCommand: draft-by-default
  // ─────────────────────────────────────────────────────────────────────────

  describe('contractAttachCommand: defaults to draft', () => {
    it('creates draft contract when ready option is not passed', () => {
      const workspace = makeWorkspace(true);

      const result = contractAttachCommand(
        {
          file: workspace.brainfilePath,
          task: 'task-1',
          deliverable: ['file:src/a.ts:Implementation'],
          validation: ['npm test'],
          constraint: ['Follow existing patterns'],
        },
        logger
      );

      expect(result.success).toBe(true);

      const task = readV2Task(workspace, 'task-1')?.task;
      expect(task?.contract).toBeDefined();
      expect(task?.contract?.status).toBe('draft');
    });

    it('creates ready contract when ready:true is explicitly passed', () => {
      const workspace = makeWorkspace(true);

      const result = contractAttachCommand(
        {
          file: workspace.brainfilePath,
          task: 'task-1',
          deliverable: ['file:src/a.ts:Implementation'],
          ready: true,
        },
        logger
      );

      expect(result.success).toBe(true);

      const task = readV2Task(workspace, 'task-1')?.task;
      expect(task?.contract).toBeDefined();
      expect(task?.contract?.status).toBe('ready');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // contractActivateCommand: single task
  // ─────────────────────────────────────────────────────────────────────────

  describe('contractActivateCommand: single task', () => {
    it('activates a single draft contract to ready', () => {
      const workspace = makeWorkspace();
      writeV2Task(workspace, {
        id: 'task-1',
        title: 'Draft Task',
        column: 'todo',
        position: 0,
        contract: {
          status: 'draft',
          deliverables: [{ type: 'file', path: 'src/foo.ts' }],
        },
      } as Task);

      const result = contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);

      expect(result.success).toBe(true);
      expect(result.activated).toContain('task-1');

      const task = readV2Task(workspace, 'task-1')?.task;
      expect(task?.contract?.status).toBe('ready');
    });

    it('throws when task has no contract', () => {
      const workspace = makeWorkspace(true);

      expect(() =>
        contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger)
      ).toThrow();
    });

    it('throws when contract is not in draft status', () => {
      const workspace = makeWorkspace();
      writeV2Task(workspace, {
        id: 'task-1',
        title: 'Already Ready Task',
        column: 'todo',
        position: 0,
        contract: { status: 'ready' },
      } as Task);

      expect(() =>
        contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger)
      ).toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // contractActivateCommand: bulk by parent
  // ─────────────────────────────────────────────────────────────────────────

  describe('contractActivateCommand: bulk by parent', () => {
    function makeParentChildrenWorkspace(): V2TestWorkspace {
      const workspace = makeWorkspace();
      writeV2Task(workspace, {
        id: 'epic-1',
        title: 'Epic Task',
        column: 'todo',
        position: 0,
        type: 'epic',
      } as Task);
      writeV2Task(workspace, {
        id: 'task-2',
        title: 'Child Task A',
        column: 'todo',
        position: 1,
        parentId: 'epic-1',
        contract: { status: 'draft' },
      } as Task);
      writeV2Task(workspace, {
        id: 'task-3',
        title: 'Child Task B',
        column: 'todo',
        position: 2,
        parentId: 'epic-1',
        contract: { status: 'draft' },
      } as Task);
      writeV2Task(workspace, {
        id: 'task-4',
        title: 'Child Task C (ready, skip)',
        column: 'todo',
        position: 3,
        parentId: 'epic-1',
        contract: { status: 'ready' },
      } as Task);
      writeV2Task(workspace, {
        id: 'task-5',
        title: 'Unrelated Task',
        column: 'todo',
        position: 4,
        contract: { status: 'draft' },
      } as Task);
      return workspace;
    }

    it('activates all draft contracts for children of a parent', () => {
      const workspace = makeParentChildrenWorkspace();

      const result = contractActivateCommand({ file: workspace.brainfilePath, parent: 'epic-1' }, logger);

      expect(result.success).toBe(true);
      expect(result.activated).toContain('task-2');
      expect(result.activated).toContain('task-3');
      // task-4 is already ready — should NOT be re-activated
      expect(result.activated).not.toContain('task-4');
      // task-5 is unrelated — should NOT be activated
      expect(result.activated).not.toContain('task-5');
      expect(result.activated.length).toBe(2);

      const task2 = readV2Task(workspace, 'task-2')?.task;
      const task3 = readV2Task(workspace, 'task-3')?.task;
      const task5 = readV2Task(workspace, 'task-5')?.task;

      expect(task2?.contract?.status).toBe('ready');
      expect(task3?.contract?.status).toBe('ready');
      expect(task5?.contract?.status).toBe('draft');
    });

    it('returns empty activated list and logs message when no draft children found', () => {
      const workspace = makeParentChildrenWorkspace();

      const result = contractActivateCommand({ file: workspace.brainfilePath, parent: 'nonexistent-parent' }, logger);

      expect(result.success).toBe(true);
      expect(result.activated).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // buildContract utility: status defaults
  // ─────────────────────────────────────────────────────────────────────────

  describe('buildContract status defaults', () => {
    // Test via addCommand (indirect) to avoid importing internal util directly
    it('contract status is draft by default (no --ready flag)', () => {
      const workspace = makeWorkspace();

      const result = addCommand(
        {
          file: workspace.brainfilePath,
          column: 'todo',
          title: 'Default draft',
          withContract: true,
        },
        logger
      );

      const task = readV2Task(workspace, result.taskId!)?.task;
      expect(task?.title).toBe('Default draft');
      expect(task?.contract?.status).toBe('draft');
    });

    it('contract status is ready when --ready is passed', () => {
      const workspace = makeWorkspace();

      const result = addCommand(
        {
          file: workspace.brainfilePath,
          column: 'todo',
          title: 'Explicit ready',
          withContract: true,
          ready: true,
        },
        logger
      );

      const task = readV2Task(workspace, result.taskId!)?.task;
      expect(task?.title).toBe('Explicit ready');
      expect(task?.contract?.status).toBe('ready');
      expect((task?.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // contractActivateCommand: V2 per-task files
  // ─────────────────────────────────────────────────────────────────────────

  describe('contractActivateCommand: V2 per-task files', () => {
    function writeBareV2Task(
      boardDir: string,
      task: Record<string, unknown>
    ): void {
      const { writeTaskFile } = require('@brainfile/core');
      const id = task.id as string;
      const filePath = path.join(boardDir, `${id}.md`);
      writeTaskFile(filePath, task, '');
    }

    it('activates a single V2 draft contract to ready', () => {
      const dir = makeTempV2Dir();
      const boardDir = path.join(dir, 'board');

      writeBareV2Task(boardDir, {
        id: 'task-1',
        title: 'V2 Draft Task',
        column: 'todo',
        position: 0,
        contract: { status: 'draft', deliverables: [] },
        createdAt: new Date().toISOString(),
      });

      const result = contractActivateCommand(
        { file: path.join(dir, 'brainfile.md'), task: 'task-1' },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.activated).toContain('task-1');

      const doc = readTaskFile(path.join(boardDir, taskFileName('task-1')));
      expect(doc?.task.contract?.status).toBe('ready');
      expect((doc?.task.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
    });

    it('activates all V2 draft contracts by parentId', () => {
      const dir = makeTempV2Dir();
      const boardDir = path.join(dir, 'board');

      writeBareV2Task(boardDir, {
        id: 'epic-1',
        title: 'Epic',
        column: 'todo',
        position: 0,
        type: 'epic',
        createdAt: new Date().toISOString(),
      });

      writeBareV2Task(boardDir, {
        id: 'task-2',
        title: 'Child A',
        column: 'todo',
        position: 1,
        parentId: 'epic-1',
        contract: { status: 'draft' },
        createdAt: new Date().toISOString(),
      });

      writeBareV2Task(boardDir, {
        id: 'task-3',
        title: 'Child B',
        column: 'todo',
        position: 2,
        parentId: 'epic-1',
        contract: { status: 'draft' },
        createdAt: new Date().toISOString(),
      });

      writeBareV2Task(boardDir, {
        id: 'task-4',
        title: 'Unrelated',
        column: 'todo',
        position: 3,
        contract: { status: 'draft' },
        createdAt: new Date().toISOString(),
      });

      const result = contractActivateCommand(
        { file: path.join(dir, 'brainfile.md'), parent: 'epic-1' },
        logger
      );

      expect(result.success).toBe(true);
      expect(result.activated).toContain('task-2');
      expect(result.activated).toContain('task-3');
      expect(result.activated).not.toContain('task-4');
      expect(result.activated.length).toBe(2);

      const doc2 = readTaskFile(path.join(boardDir, taskFileName('task-2')));
      const doc3 = readTaskFile(path.join(boardDir, taskFileName('task-3')));
      const doc4 = readTaskFile(path.join(boardDir, taskFileName('task-4')));

      expect(doc2?.task.contract?.status).toBe('ready');
      expect(doc3?.task.contract?.status).toBe('ready');
      expect(doc4?.task.contract?.status).toBe('draft');
      expect((doc2?.task.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
      expect((doc3?.task.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
    });
  });
});
