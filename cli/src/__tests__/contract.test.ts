import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Brainfile, readTaskFile } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { contractPickupCommand, contractDeliverCommand, contractValidateCommand, contractAttachCommand } from '../commands/contract';

describe('contract command', () => {
  let fixturesDir: string;
  let tempBoardPath: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
    fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-contract-test-'));
    tempBoardPath = path.join(fixturesDir, 'temp-board-contract.md');
  });

  afterEach(() => {
    if (fixturesDir && fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('pickup should set status to in_progress and output markdown context', () => {
    fs.writeFileSync(path.join(fixturesDir, 'exists.txt'), 'ok', 'utf-8');

    const markdown = `---
title: Contract Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task With Contract
        description: Work the contract
        relatedFiles:
          - src/a.ts
        contract:
          status: ready
          deliverables:
            - type: file
              path: exists.txt
              description: must exist
          constraints:
            - Be explicit
          context:
            relevantFiles:
              - src/b.ts
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractPickupCommand({ file: tempBoardPath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);
    expect(logger.getOutput()).toContain('# Contract pickup: task-1');
    expect(logger.getOutput()).toContain('## Deliverables');
    expect(logger.getOutput()).toContain('## Constraints');
    expect(logger.getOutput()).toContain('src/a.ts');
    expect(logger.getOutput()).toContain('src/b.ts');

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const contract = updated?.columns[0].tasks[0].contract as any;
    expect(contract?.status).toBe('in_progress');
    expect(contract?.metrics?.pickedUpAt).toBeDefined();
    expect(contract?.metrics?.reworkCount).toBe(0);
  });

  it('deliver should set status to delivered and write delivery metrics', () => {
    const markdown = `---
title: Contract Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task With Contract
        contract:
          status: in_progress
          metrics:
            pickedUpAt: "2026-01-01T00:00:00.000Z"
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractDeliverCommand({ file: tempBoardPath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const contract = updated?.columns[0].tasks[0].contract as any;
    expect(contract?.status).toBe('delivered');
    expect(contract?.metrics?.deliveredAt).toBeDefined();
    expect(typeof contract?.metrics?.duration).toBe('number');
  });

  it('validate should set status to done when deliverables exist and commands pass (v1 unchanged)', () => {
    fs.writeFileSync(path.join(fixturesDir, 'exists.txt'), 'ok', 'utf-8');

    const markdown = `---
title: Contract Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task With Contract
        contract:
          status: delivered
          deliverables:
            - type: file
              path: exists.txt
          validation:
            commands:
              - "node -e \\"process.exit(0)\\""
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractValidateCommand({ file: tempBoardPath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    expect(updated?.columns[0].tasks[0].contract?.status).toBe('done');
  });

  it('validate should stop on first failing command and set status to failed', () => {
    fs.writeFileSync(path.join(fixturesDir, 'exists.txt'), 'ok', 'utf-8');

    const markdown = `---
title: Contract Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task With Contract
        contract:
          status: delivered
          deliverables:
            - type: file
              path: exists.txt
          validation:
            commands:
              - "node -e \\"require('fs').writeFileSync('ran1',''); process.exit(1)\\""
              - "node -e \\"require('fs').writeFileSync('ran2',''); process.exit(0)\\""
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractValidateCommand({ file: tempBoardPath, task: 'task-1' }, logger);
    expect(result.success).toBe(false);

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    expect(updated?.columns[0].tasks[0].contract?.status).toBe('failed');

    // ran1 should exist, ran2 should NOT (stop on first failure)
    expect(fs.existsSync(path.join(fixturesDir, 'ran1'))).toBe(true);
    expect(fs.existsSync(path.join(fixturesDir, 'ran2'))).toBe(false);
  });

  it('v2 pickup/deliver/validate should sync columns and archive on success', () => {
    const brainfileDir = path.join(fixturesDir, '.brainfile');
    const boardDir = path.join(brainfileDir, 'board');
    const logsDir = path.join(brainfileDir, 'logs');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const v2BoardPath = path.join(brainfileDir, 'brainfile.md');
    fs.writeFileSync(v2BoardPath, `---
title: Contract Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: review
    title: Review
  - id: blocked
    title: Blocked
---\n`, 'utf-8');

    fs.writeFileSync(path.join(fixturesDir, 'exists.txt'), 'ok', 'utf-8');
    fs.writeFileSync(path.join(boardDir, 'task-1.md'), `---
id: task-1
title: Task With Contract
column: todo
position: 0
contract:
  status: ready
  deliverables:
    - type: file
      path: exists.txt
  validation:
    commands:
      - "node -e \\"process.exit(0)\\""
---
Task body
`, 'utf-8');

    const pickupResult = contractPickupCommand({ file: v2BoardPath, task: 'task-1' }, logger);
    expect(pickupResult.success).toBe(true);
    let taskDoc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(taskDoc?.task.contract?.status).toBe('in_progress');
    expect(taskDoc?.task.column).toBe('in-progress');

    const deliverResult = contractDeliverCommand({ file: v2BoardPath, task: 'task-1' }, logger);
    expect(deliverResult.success).toBe(true);
    taskDoc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(taskDoc?.task.contract?.status).toBe('delivered');
    expect(taskDoc?.task.column).toBe('review');

    const validateResult = contractValidateCommand({ file: v2BoardPath, task: 'task-1' }, logger);
    expect(validateResult.success).toBe(true);
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(false);
    const ledgerPath = path.join(logsDir, 'ledger.jsonl');
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const ledger = fs.readFileSync(ledgerPath, 'utf-8');
    expect(ledger).toContain('"id":"task-1"');
    expect(ledger).toContain('"contractStatus":"done"');
  });

  it('v2 validate should set status to failed and preserve task on validation failure', () => {
    const brainfileDir = path.join(fixturesDir, '.brainfile');
    const boardDir = path.join(brainfileDir, 'board');
    const logsDir = path.join(brainfileDir, 'logs');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    const v2BoardPath = path.join(brainfileDir, 'brainfile.md');
    fs.writeFileSync(v2BoardPath, `---
title: Contract Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: review
    title: Review
  - id: blocked
    title: Blocked
---\n`, 'utf-8');

    fs.writeFileSync(path.join(fixturesDir, 'exists.txt'), 'ok', 'utf-8');
    fs.writeFileSync(path.join(boardDir, 'task-1.md'), `---
id: task-1
title: Task With Contract
column: review
position: 0
contract:
  status: delivered
  deliverables:
    - type: file
      path: exists.txt
  validation:
    commands:
      - "node -e \\"process.stderr.write('bad'); process.exit(1)\\""
---
Task body
`, 'utf-8');

    const validateResult = contractValidateCommand({ file: v2BoardPath, task: 'task-1' }, logger);
    expect(validateResult.success).toBe(false);
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(true);

    const taskDoc = readTaskFile(path.join(boardDir, 'task-1.md'));
    expect(taskDoc?.task.contract?.status).toBe('failed');
    expect(taskDoc?.task.contract?.feedback).toContain('bad');
    expect(taskDoc?.task.column).toBe('review');
    expect(fs.existsSync(path.join(logsDir, 'ledger.jsonl'))).toBe(false);
  });

  it('attach should create a ready contract on an existing task', () => {
    const markdown = `---
title: Contract Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task Without Contract
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractAttachCommand({
      file: tempBoardPath,
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

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const task = updated?.columns[0].tasks[0];
    expect(task?.contract?.status).toBe('ready');
    expect(task?.contract?.deliverables?.length).toBe(2);
    expect(task?.contract?.validation?.commands).toEqual(['npm test']);
    expect(task?.contract?.constraints).toEqual(['Follow existing patterns']);
  });
});
