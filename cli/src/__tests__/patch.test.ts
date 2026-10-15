import * as fs from 'fs';
import { patchCommand } from '../commands/patch';
import { registerTaskPatchTool } from '../mcp/tools/task_patch_tool';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { createV2TestWorkspace, readV2Task, writeV2Task, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpText } from './helpers/mcp';

describe('patch command', () => {
  let ws: V2TestWorkspace;
  let logger: MemoryLogger;

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-patch-');
    logger = new MemoryLogger();
    writeV2Task(ws, { id: 'epic-1', title: 'Epic', type: 'epic', column: 'todo' });
    writeV2Task(ws, { id: 'task-1', title: 'One', column: 'todo' });
    writeV2Task(ws, { id: 'task-2', title: 'Two', column: 'todo' });
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('updates plain fields and reports the changes', () => {
    const result = patchCommand({ file: ws.brainfilePath, task: 'task-1', priority: 'high', tags: 'a, b' }, logger);
    expect(result.changes).toEqual(['priority → high', 'tags → [a, b]']);
    expect(readV2Task(ws, 'task-1')!.task.priority).toBe('high');
    expect(readV2Task(ws, 'task-1')!.task.tags).toEqual(['a', 'b']);
  });

  it('sets and clears the parent', () => {
    patchCommand({ file: ws.brainfilePath, task: 'task-1', parent: 'epic-1' }, logger);
    expect(readV2Task(ws, 'task-1')!.task.parentId).toBe('epic-1');

    patchCommand({ file: ws.brainfilePath, task: 'task-1', clearParent: true }, logger);
    expect(readV2Task(ws, 'task-1')!.task.parentId).toBeUndefined();
  });

  it('refuses a task as its own parent', () => {
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-1', parent: 'task-1' }, logger)).toThrow(/its own parent/);
  });

  it('warns but sets a parent that is not on the board', () => {
    patchCommand({ file: ws.brainfilePath, task: 'task-1', parent: 'epic-9' }, logger);
    expect(logger.getOutput()).toContain('parent epic-9 is not on this board');
    expect(readV2Task(ws, 'task-1')!.task.parentId).toBe('epic-9');
  });

  it('sets, replaces and clears dependsOn', () => {
    patchCommand({ file: ws.brainfilePath, task: 'task-1', dependsOn: 'task-2, epic-1' }, logger);
    expect(readV2Task(ws, 'task-1')!.task.dependsOn).toEqual(['task-2', 'epic-1']);

    patchCommand({ file: ws.brainfilePath, task: 'task-1', dependsOn: 'mobile:task-4' }, logger);
    expect(readV2Task(ws, 'task-1')!.task.dependsOn).toEqual(['mobile:task-4']);
    expect(logger.getOutput()).not.toContain('is not on this board');

    patchCommand({ file: ws.brainfilePath, task: 'task-1', clearDependsOn: true }, logger);
    expect(readV2Task(ws, 'task-1')!.task.dependsOn).toBeUndefined();
  });

  it('refuses a self-dependency and conflicting flags', () => {
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-1', dependsOn: 'task-1' }, logger)).toThrow(/depend on itself/);
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-1', parent: 'epic-1', clearParent: true }, logger)).toThrow(CLIError);
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-1', dependsOn: 'task-2', clearDependsOn: true }, logger)).toThrow(CLIError);
  });

  it('sets and clears landsOn and epicBranch, and refuses a branch name git would not take', () => {
    const result = patchCommand({ file: ws.brainfilePath, task: 'epic-1', landsOn: 'release/0.38.0', epicBranch: true }, logger);
    expect(result.changes).toEqual(['landsOn → release/0.38.0', 'epicBranch → on (dispatch/epic-1)']);
    expect(readV2Task(ws, 'epic-1')!.task).toMatchObject({ landsOn: 'release/0.38.0', epicBranch: true });

    patchCommand({ file: ws.brainfilePath, task: 'epic-1', clearLandsOn: true, clearEpicBranch: true }, logger);
    expect(readV2Task(ws, 'epic-1')!.task.landsOn).toBeUndefined();
    expect(readV2Task(ws, 'epic-1')!.task.epicBranch).toBeUndefined();

    expect(() => patchCommand({ file: ws.brainfilePath, task: 'epic-1', landsOn: 'two words' }, logger)).toThrow(/not a branch name/);
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'epic-1', landsOn: 'main', clearLandsOn: true }, logger)).toThrow(CLIError);
  });

  it('requires a task and at least one field', () => {
    expect(() => patchCommand({ file: ws.brainfilePath }, logger)).toThrow(/--task/);
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-1' }, logger)).toThrow(/At least one field/);
    expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-9', title: 'x' }, logger)).toThrow(CLIError);
  });
});

describe('MCP task_patch parentId and dependsOn', () => {
  let ws: V2TestWorkspace;
  let server: FakeMcpServer;

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-mcp-patch-');
    writeV2Task(ws, { id: 'epic-1', title: 'Epic', type: 'epic', column: 'todo' });
    writeV2Task(ws, { id: 'task-1', title: 'One', column: 'todo' });
    server = new FakeMcpServer();
    registerTaskPatchTool(server as any, ws.brainfilePath);
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('sets and clears both links', async () => {
    const set = await server.handler('task_patch')({ task: 'task-1', parentId: 'epic-1', dependsOn: ['epic-1'] });
    expect(set.isError).toBeFalsy();
    expect(readV2Task(ws, 'task-1')!.task.parentId).toBe('epic-1');
    expect(readV2Task(ws, 'task-1')!.task.dependsOn).toEqual(['epic-1']);

    await server.handler('task_patch')({ task: 'task-1', parentId: null, dependsOn: null });
    expect(readV2Task(ws, 'task-1')!.task.parentId).toBeUndefined();
    expect(readV2Task(ws, 'task-1')!.task.dependsOn).toBeUndefined();
  });

  it('sets and clears landsOn and epicBranch', async () => {
    const set = await server.handler('task_patch')({ task: 'epic-1', landsOn: 'release/0.38.0', epicBranch: true });
    expect(set.isError).toBeFalsy();
    expect(readV2Task(ws, 'epic-1')!.task).toMatchObject({ landsOn: 'release/0.38.0', epicBranch: true });

    await server.handler('task_patch')({ task: 'epic-1', landsOn: null, epicBranch: false });
    expect(readV2Task(ws, 'epic-1')!.task.landsOn).toBeUndefined();
    expect(readV2Task(ws, 'epic-1')!.task.epicBranch).toBeUndefined();

    const bad = await server.handler('task_patch')({ task: 'epic-1', landsOn: 'a..b' });
    expect(bad.isError).toBe(true);
    expect(mcpText(bad)).toContain('not a branch name');
  });

  it('refuses self links', async () => {
    const self = await server.handler('task_patch')({ task: 'task-1', parentId: 'task-1' });
    expect(self.isError).toBe(true);
    expect(mcpText(self)).toContain('its own parent');

    const dep = await server.handler('task_patch')({ task: 'task-1', dependsOn: ['task-1'] });
    expect(dep.isError).toBe(true);
    expect(mcpText(dep)).toContain('depend on itself');
  });
});
