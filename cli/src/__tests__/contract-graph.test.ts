import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Brainfile, type Task } from '@brainfile/core';
import { contractGraphCommand } from '../commands/contract';
import { executeContractGraphMcpAction } from '../mcp/tools/contract';
import { MemoryLogger } from '../utils/logger';

describe('contract graph', () => {
  let fixturesDir: string;
  let tempBoardPath: string;

  beforeEach(() => {
    fixturesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-contract-graph-test-'));
    tempBoardPath = path.join(fixturesDir, 'temp-board-contract-graph.md');
  });

  afterEach(() => {
    if (fixturesDir && fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  function writeBoard(markdown: string): void {
    fs.writeFileSync(tempBoardPath, markdown, 'utf-8');
  }

  it('attaches graph contracts and persists dependsOn edges', () => {
    writeBoard(`---
title: Contract Graph Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: research-1
        title: Research
      - id: impl-1
        title: Implement
      - id: test-1
        title: Test
---
`);

    const logger = new MemoryLogger();
    const result = contractGraphCommand({
      file: tempBoardPath,
      tasks: [
        {
          task: 'research-1',
          deliverable: ['file:docs/findings.md:Findings'],
        },
        {
          task: 'impl-1',
          deliverable: ['file:src/bridge.ts:Implementation'],
          dependsOn: ['research-1'],
        },
        {
          task: 'test-1',
          deliverable: ['test:src/tests/bridge.test.ts:Tests'],
          dependsOn: ['impl-1'],
        },
      ],
    }, logger);

    expect(result.attached).toEqual(['research-1', 'impl-1', 'test-1']);
    expect(result.order).toEqual(['research-1', 'impl-1', 'test-1']);
    expect(logger.getOutput()).toContain('Contract graph attached (draft): research-1, impl-1, test-1');

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const tasks = (updated?.columns[0].tasks ?? []) as Task[];
    expect(tasks.find((task) => task.id === 'research-1')?.contract?.status).toBe('draft');
    expect(tasks.find((task) => task.id === 'impl-1')?.dependsOn).toEqual(['research-1']);
    expect(tasks.find((task) => task.id === 'test-1')?.dependsOn).toEqual(['impl-1']);
  });

  it('rejects cycle input without partially writing contracts', () => {
    writeBoard(`---
title: Contract Graph Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-a
        title: Task A
      - id: task-b
        title: Task B
---
`);

    expect(() => contractGraphCommand({
      file: tempBoardPath,
      tasks: [
        {
          task: 'task-a',
          deliverable: ['file:src/a.ts:A'],
          dependsOn: ['task-b'],
        },
        {
          task: 'task-b',
          deliverable: ['file:src/b.ts:B'],
          dependsOn: ['task-a'],
        },
      ],
    }, new MemoryLogger())).toThrow('Dependency cycle detected: task-a -> task-b -> task-a');

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const tasks = (updated?.columns[0].tasks ?? []) as Task[];
    expect(tasks.every((task) => task.contract === undefined)).toBe(true);
    expect(tasks.every((task) => task.dependsOn === undefined)).toBe(true);
  });

  it('supports graph attachment through the MCP adapter with tasks array input', () => {
    writeBoard(`---
title: Contract Graph Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: research-1
        title: Research
      - id: impl-1
        title: Implement
---
`);

    const result = executeContractGraphMcpAction({
      file: tempBoardPath,
      activate: true,
      tasks: [
        {
          task: 'research-1',
          deliverables: [{ type: 'file', path: 'docs/findings.md', description: 'Findings' }],
        },
        {
          task: 'impl-1',
          deliverables: [{ type: 'file', path: 'src/bridge.ts', description: 'Implementation' }],
          dependsOn: ['research-1'],
          validation_commands: ['npm test'],
          constraints: ['Keep changes focused'],
        },
      ],
    });

    expect(result.count).toBe(2);
    expect(result.order).toEqual(['research-1', 'impl-1']);

    const updated = Brainfile.parse(fs.readFileSync(tempBoardPath, 'utf-8'));
    const tasks = (updated?.columns[0].tasks ?? []) as Task[];
    expect(tasks.find((task) => task.id === 'research-1')?.contract?.status).toBe('ready');
    expect((tasks.find((task) => task.id === 'research-1')?.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
    expect(tasks.find((task) => task.id === 'impl-1')?.dependsOn).toEqual(['research-1']);
    expect(tasks.find((task) => task.id === 'impl-1')?.contract?.validation?.commands).toEqual(['npm test']);
  });
});
