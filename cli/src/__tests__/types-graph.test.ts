/**
 * spec-12: default types and the graph, through the CLI commands and the MCP
 * tools. Core's own rules are tested in core; this checks the surfaces.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, type Task } from '@brainfile/core';
import { addCommand } from '../commands/add';
import { listCommand } from '../commands/list';
import { showCommand } from '../commands/show';
import { patchCommand } from '../commands/patch';
import { lintCommand } from '../commands/lint';
import { searchCommand } from '../commands/search';
import { registerTaskAddTool } from '../mcp/tools/task_add_tool';
import { registerTaskPatchTool } from '../mcp/tools/task_patch_tool';
import { registerListTasksTool } from '../mcp/tools/list_tasks_tool';
import { registerGetTaskTool } from '../mcp/tools/get_task_tool';
import { registerSearchTool } from '../mcp/tools/search_tool';
import { registerTaskCompleteTool } from '../mcp/tools/task_complete_tool';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { createV2TestWorkspace, readV2Task, writeV2Task, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpJson, mcpText } from './helpers/mcp';

const board = (strict: boolean, extra = '') => `---
title: Graph Board
schema: https://brainfile.md/v2/board.json
strict: ${strict}
${extra}columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---
`;

/** epic-1 ▸ spec-1 ▸ plan-1 ▸ task-1, a loose task-2, decisions old and new, a completed task under the epic. */
function seed(ws: V2TestWorkspace): void {
  writeV2Task(ws, { id: 'epic-1', title: 'The epic', type: 'epic', column: 'in-progress', position: 0 });
  writeV2Task(ws, { id: 'spec-1', title: 'The spec', type: 'spec', column: 'todo', position: 0, parentId: 'epic-1', decisions: ['decision-1'] });
  writeV2Task(ws, { id: 'plan-1', title: 'The plan', type: 'plan', column: 'todo', position: 1, parentId: 'spec-1' });
  writeV2Task(ws, { id: 'task-1', title: 'The task', column: 'todo', position: 2, parentId: 'plan-1', decisions: ['decision-2'] });
  writeV2Task(ws, { id: 'task-2', title: 'Loose task', column: 'todo', position: 3 });
  writeV2Task(ws, { id: 'decision-1', title: 'Use SQLite', type: 'decision', status: 'current' } as Task);
  writeV2Task(ws, { id: 'adr-1', title: 'Legacy accepted', type: 'adr', status: 'accepted', column: 'todo', position: 4 } as Task);
  fs.writeFileSync(path.join(ws.logsDir, 'decision-2.md'), `---
id: decision-2
title: Old cache
type: decision
status: superseded
supersededBy: decision-1
---
`);
  fs.writeFileSync(path.join(ws.logsDir, 'task-9.md'), `---
id: task-9
title: Done under the epic
parentId: epic-1
completedAt: "2026-10-01T00:00:00.000Z"
---
`);
}

describe('spec-12 through the CLI', () => {
  let ws: V2TestWorkspace;
  let logger: MemoryLogger;

  const useBoard = (strict: boolean, extra = '') => {
    ws = createV2TestWorkspace('brainfile-graph-cli-', board(strict, extra));
    seed(ws);
  };

  beforeEach(() => {
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  describe('add', () => {
    beforeEach(() => useBoard(false));

    it('writes aliases canonically: issue as a task, adr as a decision with no column', () => {
      const issue = addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Bug', type: 'issue' }, logger);
      // task-9 is in logs/, so the next task is task-10.
      expect(issue.taskId).toBe('task-10');
      expect(readV2Task(ws, 'task-10')!.task.type).toBeUndefined();

      const adr = addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Use Postgres', type: 'adr' }, logger);
      expect(adr.taskId).toBe('decision-3');
      const doc = readV2Task(ws, 'decision-3')!.task;
      expect(doc).toMatchObject({ type: 'decision', status: 'current' });
      expect(doc.column).toBeUndefined();
      expect(logger.getOutput()).toContain('Decision added successfully!');
    });

    it('needs no valid column for a decision', () => {
      expect(addCommand({ file: ws.brainfilePath, column: 'nowhere', title: 'D', type: 'decision' }, logger).taskId).toBe('decision-3');
      expect(() => addCommand({ file: ws.brainfilePath, column: 'nowhere', title: 'T' }, logger)).toThrow(CLIError);
    });

    it('accepts a parent that fits and warns about one that does not', () => {
      addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Spec two', type: 'spec', parent: 'epic-1' }, logger);
      expect(readV2Task(ws, 'spec-2')!.task.parentId).toBe('epic-1');
      expect(logger.getOutput()).not.toContain('Warning');

      addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Nested epic', type: 'epic', parent: 'task-2' }, logger);
      expect(logger.getOutput()).toContain('Warning: the new epic under task-2: an epic sits at the top of the tree, not under a task');
      expect(readV2Task(ws, 'epic-2')!.task.parentId).toBe('task-2');
    });

    it('writes decisions: and checks what it names', () => {
      addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Index', decisions: 'decision-1, decision-1' }, logger);
      expect(readV2Task(ws, 'task-10')!.task.decisions).toEqual(['decision-1']);

      addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Odd', decisions: 'task-2' }, logger);
      expect(logger.getOutput()).toContain('task-2 is a task, not a decision');
    });

    it('takes a custom type with like: in its model\'s place', () => {
      ws.tempDir && fs.rmSync(ws.tempDir, { recursive: true, force: true });
      useBoard(true, 'types:\n  bug:\n    like: task\n  proposal:\n    like: spec\n');
      expect(addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Crash', type: 'bug', parent: 'plan-1' }, logger).taskId).toBe('bug-1');
      expect(() => addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Proposal', type: 'proposal', parent: 'plan-1' }, logger))
        .toThrow('the new proposal under plan-1: a proposal goes under an epic, not under a plan (refused on a strict board)');
    });
  });

  describe('strict board', () => {
    beforeEach(() => useBoard(true));

    it('accepts the built-ins without a types: entry', () => {
      for (const type of ['epic', 'spec', 'plan', 'decision', 'issue', 'adr']) {
        expect(addCommand({ file: ws.brainfilePath, column: 'todo', title: type, type }, logger).success).toBe(true);
      }
      expect(() => addCommand({ file: ws.brainfilePath, column: 'todo', title: 'x', type: 'spike' }, logger))
        .toThrow("Type 'spike' is not defined. Available types: task, epic, spec, plan, decision");
    });

    it('refuses an off-pattern parent on add and patch', () => {
      expect(() => addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Spec', type: 'spec', parent: 'plan-1' }, logger))
        .toThrow('the new spec under plan-1: a spec goes under an epic, not under a plan (refused on a strict board)');
      expect(fs.existsSync(path.join(ws.boardDir, 'spec-2.md'))).toBe(false);

      expect(() => patchCommand({ file: ws.brainfilePath, task: 'epic-1', parent: 'task-2' }, logger))
        .toThrow('epic-1 under task-2: an epic sits at the top of the tree, not under a task (refused on a strict board)');
      expect(readV2Task(ws, 'epic-1')!.task.parentId).toBeUndefined();

      expect(() => addCommand({ file: ws.brainfilePath, title: 'D', type: 'decision', column: 'todo', child: ['Under a decision'] }, logger))
        .toThrow(/decisions hold nothing \(refused on a strict board\)/);
    });

    it('always refuses a loop', () => {
      expect(() => patchCommand({ file: ws.brainfilePath, task: 'spec-1', parent: 'task-1' }, logger)).toThrow('task-1 sits under spec-1; it cannot also be its parent');
    });

    it('patch sets and clears decisions', () => {
      patchCommand({ file: ws.brainfilePath, task: 'task-2', decisions: 'decision-1' }, logger);
      expect(readV2Task(ws, 'task-2')!.task.decisions).toEqual(['decision-1']);
      expect(() => patchCommand({ file: ws.brainfilePath, task: 'task-2', decisions: 'task-1' }, logger)).toThrow(/not a decision/);
      patchCommand({ file: ws.brainfilePath, task: 'task-2', clearDecisions: true }, logger);
      expect(readV2Task(ws, 'task-2')!.task.decisions).toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => useBoard(false));

    it('leaves decisions out of the columns and says how to see them', () => {
      const result = listCommand({ file: ws.brainfilePath }, logger);
      const output = logger.getOutput();
      expect(output).not.toContain('adr-1');
      expect(output).not.toContain('decision-1');
      expect(result.totalTasks).toBe(5);
      expect(output).toContain('2 decisions not shown: brainfile list --type decision');
      expect(output).toContain('⚠ Rests on a superseded decision: decision-2');
    });

    it('--type filters with aliases and lists decisions on their own', () => {
      listCommand({ file: ws.brainfilePath, type: 'spec' }, logger);
      expect(logger.getOutput()).toContain('spec-1');
      expect(logger.getOutput()).not.toContain('task-2');

      const decisions = new MemoryLogger();
      const result = listCommand({ file: ws.brainfilePath, type: 'adr' }, decisions);
      const lines = decisions.getOutput().split('\n');
      expect(result.totalTasks).toBe(3);
      const order = lines.filter((l) => /● /.test(l)).map((l) => l.trim().split(/\s+/)[1]);
      expect(order).toEqual(['adr-1', 'decision-1', 'decision-2']);
      expect(decisions.getOutput()).toMatch(/decision-2\s+Old cache\s+superseded by decision-1/);
      expect(decisions.getOutput()).toMatch(/decision-1\s+Use SQLite\s+current · 1 open resting on it/);
    });

    it('--tree prints the outline in column order, without decisions', () => {
      listCommand({ file: ws.brainfilePath, tree: true }, logger);
      const lines = logger.getOutput().split('\n').filter((l) => /(epic|spec|plan|task)-\d/.test(l));
      expect(lines.map((l) => l.replace(/\s+·\s+(To Do|In Progress).*$/, '').replace(/\s+/g, ' ').trimEnd())).toEqual([
        '· task-2 Loose task',
        '▸ epic-1 The epic',
        ' ◆ spec-1 The spec',
        ' ⎘ plan-1 The plan',
        ' · task-1 The task',
      ]);
      expect(lines[4]).toMatch(/^ {6}· task-1/);
      expect(lines[4]).toContain('⚠ rests on superseded decision-2');
      expect(logger.getOutput()).toContain('5 documents');
    });

    it('--tree --parent shows a subtree; filters keep ancestors as context', () => {
      listCommand({ file: ws.brainfilePath, tree: true, parent: 'spec-1' }, logger);
      const ids = logger.getOutput().split('\n').map((l) => l.match(/\b((?:epic|spec|plan|task)-\d+)\b/)?.[1]).filter(Boolean);
      expect(ids).toEqual(['spec-1', 'plan-1', 'task-1']);

      const filtered = new MemoryLogger();
      const result = listCommand({ file: ws.brainfilePath, tree: true, type: 'plan' }, filtered);
      expect(result.totalTasks).toBe(1);
      const filteredIds = filtered.getOutput().split('\n').map((l) => l.match(/\b((?:epic|spec|plan|task)-\d+)\b/)?.[1]).filter(Boolean);
      expect(filteredIds).toEqual(['epic-1', 'spec-1', 'plan-1']);
    });
  });

  describe('show', () => {
    beforeEach(() => useBoard(false));

    it('names parent, children and the decisions a document rests on', () => {
      showCommand({ file: ws.brainfilePath, task: 'epic-1' }, logger);
      const epic = logger.getOutput();
      expect(epic).toContain('Type: ▸ epic');
      expect(epic).toContain('Children: (1/2 done)');
      expect(epic).toMatch(/○ spec-1 The spec \(spec\)/);
      expect(epic).toMatch(/✓ task-9 Done under the epic \(task\)/);

      const task = new MemoryLogger();
      showCommand({ file: ws.brainfilePath, task: 'task-1' }, task);
      const out = task.getOutput();
      expect(out).toContain('Parent: plan-1 The plan (plan)');
      expect(out).toContain('Rests on:');
      expect(out).toMatch(/● decision-2 Old cache \(superseded by decision-1\)/);
      expect(out).toContain('⚠ Rests on a superseded decision: decision-2 (superseded by decision-1)');
    });

    it('shows a decision\'s standing and the work resting on it', () => {
      showCommand({ file: ws.brainfilePath, task: 'decision-1' }, logger);
      const out = logger.getOutput();
      expect(out).toContain('Type: ● decision');
      expect(out).toContain('Status: current');
      expect(out).not.toContain('Column:');
      expect(out).toContain('Rested on by:');
      expect(out).toMatch(/○ spec-1 The spec \(spec\)/);
    });

    it('adds graph to --json', () => {
      showCommand({ file: ws.brainfilePath, task: 'task-1', json: true }, logger);
      const json = JSON.parse(logger.getOutput());
      expect(json.graph).toMatchObject({
        type: 'task', role: 'task',
        parent: { id: 'plan-1', found: true, type: 'plan' },
        restsOnSuperseded: ['decision-2'],
      });
      expect(json.decisions).toEqual(['decision-2']);
    });
  });

  describe('lint and search', () => {
    it('warns about off-pattern links, and fails on a strict board', () => {
      useBoard(false);
      writeV2Task(ws, { id: 'epic-9', title: 'Misplaced', type: 'epic', column: 'todo', parentId: 'task-2' });
      const result = lintCommand({ file: ws.brainfilePath }, logger);
      expect(result.issues.map((i) => [i.code, i.type])).toEqual([['OFF_PATTERN_PARENT', 'warning']]);

      fs.rmSync(ws.tempDir, { recursive: true, force: true });
      useBoard(true);
      writeV2Task(ws, { id: 'epic-9', title: 'Misplaced', type: 'epic', column: 'todo', parentId: 'task-2' });
      expect(() => lintCommand({ file: ws.brainfilePath }, new MemoryLogger())).toThrow('Lint failed with errors');
    });

    it('lints a like: that names no type', () => {
      useBoard(false, 'types:\n  bug:\n    like: nope\n');
      const result = lintCommand({ file: ws.brainfilePath }, logger);
      expect(result.issues.map((i) => i.code)).toEqual(['UNKNOWN_LIKE']);
    });

    it('search --type takes aliases', () => {
      useBoard(false);
      const result = searchCommand({ file: ws.brainfilePath, query: 'e', type: 'adr' }, logger);
      expect(result.results.map((r) => r.id).sort()).toEqual(['adr-1', 'decision-1', 'decision-2']);
      const tasks = searchCommand({ file: ws.brainfilePath, query: 'task', type: 'issue' }, new MemoryLogger());
      expect(tasks.results.map((r) => r.id).sort()).toEqual(['task-1', 'task-2']);
    });
  });
});

describe('spec-12 through MCP', () => {
  let ws: V2TestWorkspace;
  let server: FakeMcpServer;

  const useBoard = (strict: boolean) => {
    ws = createV2TestWorkspace('brainfile-graph-mcp-', board(strict));
    seed(ws);
    server = new FakeMcpServer();
    for (const register of [registerTaskAddTool, registerTaskPatchTool, registerListTasksTool, registerGetTaskTool, registerSearchTool, registerTaskCompleteTool]) {
      register(server as any, ws.brainfilePath);
    }
  };

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('task_add accepts aliases and decisions, and needs no column for a decision', async () => {
    useBoard(false);
    const decision = await server.handler('task_add')({ title: 'Use Bun', type: 'adr' });
    expect(decision.isError).toBeFalsy();
    expect((decision as any).structuredContent).toEqual({ id: 'decision-3', title: 'Use Bun', type: 'decision' });

    const work = await server.handler('task_add')({ column: 'todo', title: 'Port', type: 'issue', parentId: 'plan-1', decisions: ['decision-3'] });
    expect((work as any).structuredContent).toEqual({ id: 'task-10', title: 'Port' });
    expect(readV2Task(ws, 'task-10')!.task).toMatchObject({ parentId: 'plan-1', decisions: ['decision-3'] });

    const noColumn = await server.handler('task_add')({ title: 'Work' });
    expect(noColumn.isError).toBe(true);
    expect(mcpText(noColumn)).toContain('column is required');

    const warned = await server.handler('task_add')({ column: 'todo', title: 'Epic in a task', type: 'epic', parentId: 'task-2' });
    expect((warned as any).structuredContent.warnings).toEqual(['the new epic under task-2: an epic sits at the top of the tree, not under a task']);
  });

  it('task_add and task_patch refuse off-pattern links on a strict board', async () => {
    useBoard(true);
    const add = await server.handler('task_add')({ column: 'todo', title: 'Spec', type: 'spec', parentId: 'plan-1' });
    expect(add.isError).toBe(true);
    expect(mcpText(add)).toContain('refused on a strict board');

    const patch = await server.handler('task_patch')({ task: 'task-2', parentId: 'decision-1' });
    expect(patch.isError).toBe(true);
    expect(mcpText(patch)).toContain('decisions hold nothing');

    const ok = await server.handler('task_patch')({ task: 'task-2', decisions: ['decision-1'], parentId: 'plan-1' });
    expect(ok.isError).toBeFalsy();
    expect(readV2Task(ws, 'task-2')!.task).toMatchObject({ parentId: 'plan-1', decisions: ['decision-1'] });
  });

  it('list_tasks leaves decisions out, lists them by type, and returns the tree', async () => {
    useBoard(false);
    const all = mcpJson(await server.handler('list_tasks')({}));
    expect(all.tasks.map((t: any) => t.id)).not.toContain('adr-1');
    expect(all.tasks.find((t: any) => t.id === 'spec-1')).toMatchObject({ type: 'spec', parentId: 'epic-1' });

    const decisions = mcpJson(await server.handler('list_tasks')({ type: 'adr' }));
    expect(decisions.tasks.map((t: any) => [t.id, t.status, t.column])).toEqual([
      ['adr-1', 'current', 'todo'], ['decision-1', 'current', 'none'], ['decision-2', 'superseded', 'none'],
    ]);

    const tree = mcpJson(await server.handler('list_tasks')({ tree: true }));
    expect(tree.tree.map((n: any) => [n.id, n.depth])).toEqual([
      ['task-2', 0], ['epic-1', 0], ['spec-1', 1], ['plan-1', 2], ['task-1', 3],
    ]);
    expect(tree.tree.find((n: any) => n.id === 'epic-1').children).toEqual(['spec-1']);
  });

  it('get_task carries the graph; search takes aliases; task_complete refuses a decision', async () => {
    useBoard(false);
    const task = mcpJson(await server.handler('get_task')({ task: 'task-1' }));
    expect(task.graph.restsOnSuperseded).toEqual(['decision-2']);
    expect(task.graph.parent).toMatchObject({ id: 'plan-1', type: 'plan' });

    const found = mcpJson(await server.handler('search')({ query: 'cache', type: 'adr' }));
    expect(found.results.map((r: any) => r.id)).toEqual(['decision-2']);

    const complete = await server.handler('task_complete')({ task: 'decision-1' });
    expect(complete.isError).toBe(true);
    expect(mcpText(complete)).toContain('decisions are not completed');

    const parent = await server.handler('task_complete')({ task: 'plan-1' });
    expect(parent.isError).toBe(true);
    expect(mcpText(parent)).toContain('Plan plan-1 has 1 incomplete child task(s)');
    expect(fs.existsSync(path.join(ws.boardDir, 'plan-1.md'))).toBe(true);
    expect(readTaskFile(path.join(ws.boardDir, 'plan-1.md'))).not.toBeNull();
  });
});
