import * as fs from 'fs';
import { type Task } from '@brainfile/core';
import { contractGraphCommand } from '../commands/contract';
import { executeContractGraphMcpAction } from '../mcp/tools/contract';
import { MemoryLogger } from '../utils/logger';
import {
  createV2TestWorkspace,
  writeV2Task,
  readV2Task,
  type V2TestWorkspace,
} from './helpers/v2';

describe('contract graph', () => {
  let workspace: V2TestWorkspace;

  beforeEach(() => {
    workspace = createV2TestWorkspace('brainfile-contract-graph-test-');
  });

  afterEach(() => {
    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
  });

  function writeTasks(tasks: Array<{ id: string; title: string }>): void {
    tasks.forEach((task, index) => {
      writeV2Task(workspace, {
        id: task.id,
        title: task.title,
        column: 'todo',
        position: index,
      } as Task);
    });
  }

  function readTask(taskId: string): Task | undefined {
    return readV2Task(workspace, taskId)?.task;
  }

  it('attaches graph contracts and persists dependsOn edges', () => {
    writeTasks([
      { id: 'research-1', title: 'Research' },
      { id: 'impl-1', title: 'Implement' },
      { id: 'test-1', title: 'Test' },
    ]);

    const logger = new MemoryLogger();
    const result = contractGraphCommand({
      file: workspace.brainfilePath,
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

    expect(readTask('research-1')?.contract?.status).toBe('draft');
    expect(readTask('impl-1')?.dependsOn).toEqual(['research-1']);
    expect(readTask('test-1')?.dependsOn).toEqual(['impl-1']);
  });

  it('rejects cycle input without partially writing contracts', () => {
    writeTasks([
      { id: 'task-a', title: 'Task A' },
      { id: 'task-b', title: 'Task B' },
    ]);

    expect(() => contractGraphCommand({
      file: workspace.brainfilePath,
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

    const tasks = [readTask('task-a'), readTask('task-b')];
    expect(tasks.every((task) => task?.contract === undefined)).toBe(true);
    expect(tasks.every((task) => task?.dependsOn === undefined)).toBe(true);
  });

  it('supports graph attachment through the MCP adapter with tasks array input', () => {
    writeTasks([
      { id: 'research-1', title: 'Research' },
      { id: 'impl-1', title: 'Implement' },
    ]);

    const result = executeContractGraphMcpAction({
      file: workspace.brainfilePath,
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

    expect(readTask('research-1')?.contract?.status).toBe('ready');
    expect((readTask('research-1')?.contract?.metrics as { readyAt?: string } | undefined)?.readyAt).toBeDefined();
    expect(readTask('impl-1')?.dependsOn).toEqual(['research-1']);
    expect(readTask('impl-1')?.contract?.validation?.commands).toEqual(['npm test']);
  });
});
