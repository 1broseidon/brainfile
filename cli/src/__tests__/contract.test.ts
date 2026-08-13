import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { contractPickupCommand, contractDeliverCommand, contractValidateCommand, contractAttachCommand, contractActivateCommand } from '../commands/contract';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';

describe('contract command', () => {
  let workspace: V2TestWorkspace;
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
    workspace = createV2TestWorkspace('brainfile-contract-test-', `---
title: Contract Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: review
    title: Review
  - id: blocked
    title: Blocked
---
`);
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  function writeTask(task: Task, body = ''): void {
    writeTaskFile(path.join(workspace.boardDir, taskFileName(task.id)), task, body);
  }

  function readTask(taskId = 'task-1') {
    return readTaskFile(path.join(workspace.boardDir, taskFileName(taskId)));
  }

  it('pickup should set status to in_progress and output markdown context', () => {
    fs.writeFileSync(path.join(workspace.dotDir, 'exists.txt'), 'ok', 'utf-8');
    writeTask({
      id: 'task-1',
      title: 'Task With Contract',
      column: 'todo',
      position: 0,
      relatedFiles: ['src/a.ts'],
      contract: {
        status: 'ready',
        deliverables: [{ type: 'file', path: 'exists.txt', description: 'must exist' } as any],
        constraints: ['Be explicit'],
        context: { relevantFiles: ['src/b.ts'] } as any,
      },
    } as Task, '## Description\nWork the contract\n');

    const result = contractPickupCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);
    expect(logger.getOutput()).toContain('# Contract pickup: task-1');
    expect(logger.getOutput()).toContain('## Deliverables');
    expect(logger.getOutput()).toContain('## Constraints');
    expect(logger.getOutput()).toContain('src/a.ts');
    expect(logger.getOutput()).toContain('src/b.ts');

    const contract = readTask()?.task.contract as any;
    expect(contract?.status).toBe('in_progress');
    expect(contract?.metrics?.pickedUpAt).toBeDefined();
    expect(contract?.metrics?.reworkCount).toBe(0);
    expect(readTask()?.task.column).toBe('in-progress');
  });

  it('deliver should set status to delivered and write delivery metrics', () => {
    writeTask({
      id: 'task-1',
      title: 'Task With Contract',
      column: 'in-progress',
      position: 0,
      contract: {
        status: 'in_progress',
        metrics: { pickedUpAt: '2026-01-01T00:00:00.000Z' },
      },
    } as Task);

    const result = contractDeliverCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);

    const contract = readTask()?.task.contract as any;
    expect(contract?.status).toBe('delivered');
    expect(contract?.metrics?.deliveredAt).toBeDefined();
    expect(typeof contract?.metrics?.duration).toBe('number');
    expect(readTask()?.task.column).toBe('review');
  });

  it('validate should set status to done when deliverables exist and commands pass', () => {
    // Deliverable paths resolve against the workspace root (parent of .brainfile)
    fs.writeFileSync(path.join(workspace.tempDir, 'exists.txt'), 'ok', 'utf-8');
    writeTask({
      id: 'task-1',
      title: 'Task With Contract',
      column: 'review',
      position: 0,
      contract: {
        status: 'delivered',
        deliverables: [{ type: 'file', path: 'exists.txt' } as any],
        validation: { commands: ['node -e "process.exit(0)"'] },
      },
    } as Task);

    const result = contractValidateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(workspace.boardDir, 'task-1.md'))).toBe(false);

    const ledgerPath = path.join(workspace.logsDir, 'ledger.jsonl');
    expect(fs.existsSync(path.join(workspace.logsDir, 'ledger.jsonl'))).toBe(true);
    expect(fs.readFileSync(ledgerPath, 'utf-8')).toContain('"contractStatus":"done"');
    expect(fs.existsSync(path.join(workspace.logsDir, 'task-1.md'))).toBe(true);
  });

  it('validate should stop on first failing command and set status to failed', () => {
    fs.writeFileSync(path.join(workspace.tempDir, 'exists.txt'), 'ok', 'utf-8');
    writeTask({
      id: 'task-1',
      title: 'Task With Contract',
      column: 'review',
      position: 0,
      contract: {
        status: 'delivered',
        deliverables: [{ type: 'file', path: 'exists.txt' } as any],
        validation: {
          commands: [
            'node -e "require(\'fs\').writeFileSync(\'ran1\',\'\'); process.exit(1)"',
            'node -e "require(\'fs\').writeFileSync(\'ran2\',\'\'); process.exit(0)"',
          ],
        },
      },
    } as Task);

    const result = contractValidateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);
    expect(result.success).toBe(false);

    const taskDoc = readTask();
    expect(taskDoc?.task.contract?.status).toBe('failed');
    // Validation commands run with cwd at the workspace root (parent of .brainfile)
    expect(fs.existsSync(path.join(workspace.tempDir, 'ran1'))).toBe(true);
    expect(fs.existsSync(path.join(workspace.tempDir, 'ran2'))).toBe(false);
    expect(fs.existsSync(path.join(workspace.logsDir, 'ledger.jsonl'))).toBe(false);
  });

  it('validate should set status to failed and preserve task on validation failure', () => {
    fs.writeFileSync(path.join(workspace.tempDir, 'exists.txt'), 'ok', 'utf-8');
    writeTask({
      id: 'task-1',
      title: 'Task With Contract',
      column: 'review',
      position: 0,
      contract: {
        status: 'delivered',
        deliverables: [{ type: 'file', path: 'exists.txt' } as any],
        validation: { commands: ['node -e "process.stderr.write(\'bad\'); process.exit(1)"'] },
      },
    } as Task, 'Task body');

    const validateResult = contractValidateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);
    expect(validateResult.success).toBe(false);
    expect(fs.existsSync(path.join(workspace.boardDir, 'task-1.md'))).toBe(true);

    const taskDoc = readTask();
    expect(taskDoc?.task.contract?.status).toBe('failed');
    expect(taskDoc?.task.contract?.feedback).toContain('bad');
    expect(taskDoc?.task.column).toBe('review');
    expect(fs.existsSync(path.join(workspace.logsDir, 'ledger.jsonl'))).toBe(false);
  });

  it('activate stamps metrics.readyAt on a draft contract', () => {
    writeTask({
      id: 'task-1',
      title: 'Draft contract task',
      column: 'todo',
      position: 0,
      contract: { status: 'draft' },
    } as Task);

    const result = contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger);

    expect(result.success).toBe(true);
    expect(result.activated).toEqual(['task-1']);

    const contract = readTask()?.task.contract;
    expect(contract?.status).toBe('ready');
    expect(contract?.metrics?.readyAt).toBeDefined();
    expect(logger.getOutput()).toContain('Contract activated: task-1');
  });

  it('activate rejects a task with no contract', () => {
    writeTask({ id: 'task-1', title: 'No contract', column: 'todo', position: 0 } as Task);

    expect(() =>
      contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger),
    ).toThrow(/has no contract/);
  });

  it('activate rejects a contract that is not in draft', () => {
    writeTask({
      id: 'task-1',
      title: 'Already ready',
      column: 'todo',
      position: 0,
      contract: { status: 'ready' },
    } as Task);

    expect(() =>
      contractActivateCommand({ file: workspace.brainfilePath, task: 'task-1' }, logger),
    ).toThrow(/not in draft status \(current: ready\)/);
  });

  it('attach rejects an invalid deliverable spec before touching the task', () => {
    writeTask({ id: 'task-1', title: 'Target', column: 'todo', position: 0 } as Task);

    expect(() =>
      contractAttachCommand({ file: workspace.brainfilePath, task: 'task-1', deliverable: ['bogus'] }, logger),
    ).toThrow(/Invalid deliverable format/);

    expect(readTask()?.task.contract).toBeUndefined();
  });

  it('attach should create a ready contract on an existing task', () => {
    writeTask({
      id: 'task-1',
      title: 'Task Without Contract',
      column: 'todo',
      position: 0,
    } as Task);

    const result = contractAttachCommand({
      file: workspace.brainfilePath,
      task: 'task-1',
      deliverable: [
        'file:src/a.ts:Implementation',
        'test:src/a.test.ts:Tests',
      ],
      validation: ['npm test'],
      constraint: ['Follow existing patterns'],
      ready: true,
    }, logger);

    expect(result.success).toBe(true);

    const task = readTask()?.task;
    expect(task?.contract?.status).toBe('ready');
    expect(task?.contract?.deliverables?.length).toBe(2);
    expect(task?.contract?.validation?.commands).toEqual(['npm test']);
    expect(task?.contract?.constraints).toEqual(['Follow existing patterns']);
  });
});
