import * as fs from 'fs';
import * as path from 'path';
import { Brainfile } from '@brainfile/core';
import { MemoryLogger } from '../utils/logger';
import { contractPickupCommand, contractDeliverCommand, contractValidateCommand, contractAttachCommand } from '../commands/contract';

describe('contract command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tempBoardPath = path.join(fixturesDir, 'temp-board-contract.md');
  let logger: MemoryLogger;

  beforeEach(() => {
    logger = new MemoryLogger();
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
  });

  afterEach(() => {
    for (const name of ['temp-board-contract.md', 'exists.txt', 'ran1', 'ran2']) {
      const p = path.join(fixturesDir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
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
    expect(updated?.columns[0].tasks[0].contract?.status).toBe('in_progress');
  });

  it('deliver should set status to delivered', () => {
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
---\n`;

    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');

    const result = contractDeliverCommand({ file: tempBoardPath, task: 'task-1' }, logger);
    expect(result.success).toBe(true);

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    expect(updated?.columns[0].tasks[0].contract?.status).toBe('delivered');
  });

  it('validate should set status to done when deliverables exist and commands pass', () => {
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

