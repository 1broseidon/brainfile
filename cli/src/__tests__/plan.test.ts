import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import {
  planAddCommand,
  planListCommand,
  planShowCommand,
  planLinkCommand,
} from '../commands/plan';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

const STRICT_BOARD_WITH_PLAN = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
strict: true
types:
  task:
    idPrefix: task
    completable: true
  plan:
    idPrefix: plan
    completable: false
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---
`;

const STRICT_BOARD_WITHOUT_PLAN = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
strict: true
types:
  task:
    idPrefix: task
    completable: true
columns:
  - id: todo
    title: To Do
---
`;

describe('plan commands', () => {
  let ws: V2TestWorkspace;
  let logger: MemoryLogger;

  const setup = (config?: string) => {
    ws = createV2TestWorkspace('brainfile-plan-test-', config ?? STRICT_BOARD_WITH_PLAN);
    logger = new MemoryLogger();
  };

  afterEach(() => {
    if (ws) fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  describe('planAddCommand', () => {
    beforeEach(() => setup());

    it('creates a plan-N document with type: plan', () => {
      const result = planAddCommand({ file: ws.brainfilePath, title: 'Thin frontend' }, logger);

      expect(result.taskId).toBe('plan-1');
      expect(result.columnId).toBe('todo');

      const doc = readTaskFile(path.join(ws.boardDir, 'plan-1.md'))!;
      expect(doc.task.type).toBe('plan');
      expect(doc.task.title).toBe('Thin frontend');
      expect(doc.task.column).toBe('todo');
    });

    it('persists the free-form status, tags, parent, and description body', () => {
      planAddCommand(
        {
          file: ws.brainfilePath,
          title: 'Planned work',
          status: 'active',
          tags: 'refactor, core',
          parent: 'plan-9',
          description: 'The long form rationale',
        },
        logger,
      );

      const doc = readTaskFile(path.join(ws.boardDir, 'plan-1.md'))!;
      expect(doc.task.status).toBe('active');
      expect(doc.task.tags).toEqual(['refactor', 'core']);
      expect(doc.task.parentId).toBe('plan-9');
      expect(doc.body).toContain('The long form rationale');
    });

    it('honors an explicit column', () => {
      const result = planAddCommand(
        { file: ws.brainfilePath, title: 'In flight', column: 'in-progress' },
        logger,
      );

      expect(result.columnId).toBe('in-progress');
    });

    it('numbers plan IDs independently of tasks', () => {
      writeTaskFile(path.join(ws.boardDir, taskFileName('task-7')), {
        id: 'task-7',
        title: 'A task',
        column: 'todo',
      } as Task, '');

      const result = planAddCommand({ file: ws.brainfilePath, title: 'First plan' }, logger);

      expect(result.taskId).toBe('plan-1');
    });

    it('requires a title', () => {
      expect(() => planAddCommand({ file: ws.brainfilePath }, logger)).toThrow(CLIError);
    });

    it('rejects an unknown column', () => {
      expect(() =>
        planAddCommand({ file: ws.brainfilePath, title: 'x', column: 'nope' }, logger),
      ).toThrow(CLIError);
    });
  });

  describe('strict board without a plan type', () => {
    beforeEach(() => setup(STRICT_BOARD_WITHOUT_PLAN));

    it('fails validateType with an actionable message', () => {
      expect(() => planAddCommand({ file: ws.brainfilePath, title: 'x' }, logger)).toThrow(
        /Type 'plan' is not defined/,
      );
      expect(fs.existsSync(path.join(ws.boardDir, 'plan-1.md'))).toBe(false);
    });
  });

  describe('planListCommand', () => {
    beforeEach(() => setup());

    it('lists only plan documents, isolated from other types', () => {
      writeTaskFile(path.join(ws.boardDir, taskFileName('task-1')), {
        id: 'task-1',
        title: 'A task',
        column: 'todo',
      } as Task, '');
      planAddCommand({ file: ws.brainfilePath, title: 'Plan A' }, logger);
      planAddCommand({ file: ws.brainfilePath, title: 'Plan B' }, logger);

      const result = planListCommand({ file: ws.brainfilePath }, logger);

      expect(result.totalPlans).toBe(2);
      expect(logger.getOutput()).not.toContain('task-1');
    });

    it('filters by free-form status', () => {
      planAddCommand({ file: ws.brainfilePath, title: 'Draft plan', status: 'draft' }, logger);
      planAddCommand({ file: ws.brainfilePath, title: 'Active plan', status: 'active' }, logger);

      const result = planListCommand({ file: ws.brainfilePath, status: 'active' }, logger);

      expect(result.totalPlans).toBe(1);
      expect(logger.getOutput()).toContain('Active plan');
    });

    it('reports zero plans on an empty board', () => {
      expect(planListCommand({ file: ws.brainfilePath }, logger).totalPlans).toBe(0);
    });
  });

  describe('planShowCommand', () => {
    beforeEach(() => setup());

    it('renders a plan with its metadata', () => {
      planAddCommand(
        { file: ws.brainfilePath, title: 'Shown plan', status: 'active', description: 'Body text' },
        logger,
      );
      logger.clear?.();

      planShowCommand({ file: ws.brainfilePath, plan: 'plan-1' }, logger);

      const output = logger.getOutput();
      expect(output).toContain('plan-1');
      expect(output).toContain('Shown plan');
      expect(output).toContain('active');
      expect(output).toContain('Body text');
    });

    it('emits JSON on request, including implementing tasks', () => {
      planAddCommand({ file: ws.brainfilePath, title: 'Shown plan' }, logger);
      writeTaskFile(path.join(ws.boardDir, taskFileName('task-1')), {
        id: 'task-1',
        title: 'Implements it',
        column: 'todo',
        parentId: 'plan-1',
      } as Task, '');

      const jsonLogger = new MemoryLogger();
      planShowCommand({ file: ws.brainfilePath, plan: 'plan-1', json: true }, jsonLogger);

      const parsed = JSON.parse(jsonLogger.getOutput().trim());
      expect(parsed.id).toBe('plan-1');
      expect(parsed.type).toBe('plan');
      expect(parsed.implementedBy).toEqual(['task-1']);
    });

    it('throws for an unknown plan', () => {
      expect(() => planShowCommand({ file: ws.brainfilePath, plan: 'plan-99' }, logger)).toThrow(CLIError);
    });
  });

  describe('planLinkCommand', () => {
    beforeEach(() => setup());

    it('points a task parentId at the plan', () => {
      planAddCommand({ file: ws.brainfilePath, title: 'Target plan' }, logger);
      writeTaskFile(path.join(ws.boardDir, taskFileName('task-1')), {
        id: 'task-1',
        title: 'Work item',
        column: 'todo',
      } as Task, '');

      const result = planLinkCommand({ file: ws.brainfilePath, plan: 'plan-1', task: 'task-1' }, logger);

      expect(result.success).toBe(true);
      expect(readTaskFile(path.join(ws.boardDir, 'task-1.md'))!.task.parentId).toBe('plan-1');
    });

    it('round-trips: linked tasks are discoverable from the plan', () => {
      planAddCommand({ file: ws.brainfilePath, title: 'Target plan' }, logger);
      for (const id of ['task-1', 'task-2']) {
        writeTaskFile(path.join(ws.boardDir, taskFileName(id)), {
          id,
          title: `Work ${id}`,
          column: 'todo',
        } as Task, '');
        planLinkCommand({ file: ws.brainfilePath, plan: 'plan-1', task: id }, logger);
      }

      const jsonLogger = new MemoryLogger();
      planShowCommand({ file: ws.brainfilePath, plan: 'plan-1', json: true }, jsonLogger);

      expect(JSON.parse(jsonLogger.getOutput().trim()).implementedBy).toEqual(['task-1', 'task-2']);
    });

    it('throws when the plan does not exist', () => {
      writeTaskFile(path.join(ws.boardDir, taskFileName('task-1')), {
        id: 'task-1',
        title: 'Work item',
        column: 'todo',
      } as Task, '');

      expect(() =>
        planLinkCommand({ file: ws.brainfilePath, plan: 'plan-99', task: 'task-1' }, logger),
      ).toThrow(CLIError);
    });

    it('throws when the task does not exist', () => {
      planAddCommand({ file: ws.brainfilePath, title: 'Target plan' }, logger);

      expect(() =>
        planLinkCommand({ file: ws.brainfilePath, plan: 'plan-1', task: 'task-99' }, logger),
      ).toThrow(CLIError);
    });

    it('requires both a plan and a task', () => {
      expect(() => planLinkCommand({ file: ws.brainfilePath, task: 'task-1' }, logger)).toThrow(CLIError);
      expect(() => planLinkCommand({ file: ws.brainfilePath, plan: 'plan-1' }, logger)).toThrow(CLIError);
    });
  });
});
