/**
 * The MCP tools spec-13 adds, against the real server over a real transport:
 * note, log, columns, board, types, template, lint, sync, where, retire and
 * adr_promote, list_tasks' status filter (plan list --status), and one board
 * commit per mutating call on a tracked board.
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { readBoardConfig, readTaskFile, writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';
import { WireClient, type ToolResult } from './helpers/mcp-wire';

interface Board {
  dir: string;
  dotDir: string;
  brainfilePath: string;
  boardDir: string;
  logsDir: string;
}

const CONFIG = `---
title: Tools Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
    completionColumn: true
---

# Tools Board

The body stays.
`;

function makeBoard(config = CONFIG): Board {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-mcp-tools-'));
  const dotDir = path.join(dir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  const brainfilePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(brainfilePath, config, 'utf-8');
  return { dir, dotDir, brainfilePath, boardDir, logsDir };
}

function writeTask(board: Board, task: Task, body = '', where: 'board' | 'logs' = 'board'): void {
  writeTaskFile(path.join(where === 'board' ? board.boardDir : board.logsDir, `${task.id}.md`), task, body);
}

const data = <T = any>(result: ToolResult): T => result.structuredContent as T;
const text = (result: ToolResult): string => WireClient.text(result) ?? '';

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

describe('spec-13 MCP tools', () => {
  let board: Board;
  let client: WireClient;

  beforeEach(async () => {
    board = makeBoard();
    writeTask(board, { id: 'task-1', title: 'Wire the cache', column: 'todo' }, composeBody('Bounded by bytes.'));
    writeTask(board, { id: 'task-2', title: 'Ship it', column: 'in-progress' });
    writeTask(board, { id: 'task-9', title: 'Old work', completedAt: '2026-01-02T00:00:00.000Z' }, composeBody('Done long ago.', '- 2026-01-01T00:00:00.000Z: [codex] found the eviction bug'), 'logs');
    client = await WireClient.open(board.brainfilePath, 'modern');
  });

  afterEach(async () => {
    await client?.close();
    fs.rmSync(board.dir, { recursive: true, force: true });
    delete process.env.BRAINFILE_AGENT;
  });

  describe('note', () => {
    test('appends a timestamped, attributed line to an open task', async () => {
      const result = await client.callTool('note', { task: 'task-1', message: 'Bounded by bytes, not entries', agent: 'codex' });
      expect(result.isError).toBeFalsy();
      expect(data(result)).toMatchObject({ taskId: 'task-1', agent: 'codex', isLog: false });
      expect(data(result).entry).toMatch(/^- \d{4}-\d\d-\d\dT[\d:.]+Z: \[codex\] Bounded by bytes, not entries$/);
      const doc = readTaskFile(path.join(board.boardDir, 'task-1.md'))!;
      expect(doc.body).toContain('## Log');
      expect(doc.body).toContain('[codex] Bounded by bytes, not entries');
      expect(doc.body).toContain('Bounded by bytes.');
    });

    test('names the agent from BRAINFILE_AGENT, like the CLI', async () => {
      process.env.BRAINFILE_AGENT = 'claude';
      const result = await client.callTool('note', { task: 'task-1', message: 'From the env' });
      expect(data(result).entry).toContain('[claude] From the env');
    });

    test('works on completed work and refuses an unknown task or an empty message', async () => {
      const done = await client.callTool('note', { task: 'task-9', message: 'Follow-up', agent: 'x' });
      expect(data(done)).toMatchObject({ taskId: 'task-9', isLog: true });

      const missing = await client.callTool('note', { task: 'task-404', message: 'x' });
      expect(missing.isError).toBe(true);
      expect(text(missing)).toContain('Task not found: task-404');

      const empty = await client.callTool('note', { task: 'task-1', message: '  ' });
      expect(empty.isError).toBe(true);
    });
  });

  describe('log', () => {
    test('reads one task, searches completed work, lists the recent', async () => {
      const one = await client.callTool('log', { task: 'task-9' });
      expect(data(one)).toMatchObject({ mode: 'task', task: { id: 'task-9', isLog: true, completedAt: '2026-01-02T00:00:00.000Z' } });
      expect(data(one).task.log).toContain('found the eviction bug');

      const found = await client.callTool('log', { query: 'eviction' });
      expect(data(found)).toMatchObject({ mode: 'search', query: 'eviction', count: 1 });
      expect(data(found).entries[0]).toMatchObject({ id: 'task-9', match: expect.stringContaining('eviction') });

      await client.callTool('task_complete', { task: 'task-2' });
      fs.appendFileSync(path.join(board.logsDir, 'ledger.jsonl'), `${JSON.stringify({ id: 'task-0', title: 'Ledger only', completedAt: '2025-12-01T00:00:00.000Z' })}\n`);
      const recent = await client.callTool('log', {});
      expect(data(recent).mode).toBe('recent');
      expect(data(recent).entries.map((e: any) => e.id)).toEqual(['task-2', 'task-9', 'task-0']);
      expect(data(recent).entries[2]).toMatchObject({ ledgerOnly: true });

      const limited = await client.callTool('log', { limit: 1 });
      expect(data(limited)).toMatchObject({ count: 3 });
      expect(data(limited).entries).toHaveLength(1);
    });

    test('refuses task and query together, or an unknown task', async () => {
      expect((await client.callTool('log', { task: 'task-9', query: 'x' })).isError).toBe(true);
      expect(text(await client.callTool('log', { task: 'nope' }))).toContain('Task not found: nope');
    });
  });

  describe('columns', () => {
    test('lists, adds, renames, reorders and removes', async () => {
      const listed = await client.callTool('columns', {});
      expect(data(listed)).toMatchObject({ action: 'list' });
      expect(data(listed).columns.map((c: any) => [c.id, c.taskCount])).toEqual([['todo', 1], ['in-progress', 1], ['done', 0]]);

      const added = await client.callTool('columns', { action: 'add', title: 'In Review', after: 'In Progress' });
      expect(data(added).column).toEqual({ id: 'in-review', title: 'In Review' });
      expect(data(added).columns.map((c: any) => c.id)).toEqual(['todo', 'in-progress', 'in-review', 'done']);

      const renamed = await client.callTool('columns', { action: 'rename', column: 'in-review', title: 'Review' });
      expect(data(renamed).column).toEqual({ id: 'in-review', title: 'Review' });

      const reordered = await client.callTool('columns', { action: 'reorder', order: ['done', 'todo'] });
      expect(data(reordered).columns.map((c: any) => c.id)).toEqual(['done', 'todo', 'in-progress', 'in-review']);

      const refused = await client.callTool('columns', { action: 'remove', column: 'in-progress' });
      expect(refused.isError).toBe(true);
      expect(text(refused)).toContain("column 'in-progress' holds 1 task (task-2); say which column they move to");

      const removed = await client.callTool('columns', { action: 'remove', column: 'in-progress', moveTo: 'todo' });
      expect(data(removed)).toMatchObject({ action: 'remove', column: { id: 'in-progress' }, moved: ['task-2'], movedTo: { id: 'todo' } });
      expect(readTaskFile(path.join(board.boardDir, 'task-2.md'))?.task.column).toBe('todo');

      const config = readBoardConfig(board.brainfilePath)!;
      expect(config.config.columns.map((c) => c.id)).toEqual(['done', 'todo', 'in-review']);
      expect(config.body).toContain('The body stays.');
    });

    test('says what is missing', async () => {
      expect(text(await client.callTool('columns', { action: 'add' }))).toContain('add needs a title');
      expect(text(await client.callTool('columns', { action: 'rename', column: 'todo' }))).toContain('rename needs a column and a title');
      expect(text(await client.callTool('columns', { action: 'reorder' }))).toContain('reorder needs order');
      expect(text(await client.callTool('columns', { action: 'remove' }))).toContain('remove needs a column');
      expect(text(await client.callTool('columns', { action: 'add', title: 'To Do' }))).toContain('already exists');
    });
  });

  describe('board', () => {
    test('reads the settings without writing', async () => {
      const before = fs.readFileSync(board.brainfilePath, 'utf-8');
      const result = await client.callTool('board', {});
      expect(data(result)).toMatchObject({ title: 'Tools Board', instructions: [], related: [], strict: false, changed: [] });
      expect(data(result).columns).toHaveLength(3);
      expect(fs.readFileSync(board.brainfilePath, 'utf-8')).toBe(before);
    });

    test('sets the title, the agent instructions and related boards', async () => {
      const set = await client.callTool('board', {
        title: 'Renamed Board',
        instructions: ['Write tests', 'Keep IDs'],
        addRelated: [{ alias: 'mobile', path: '../mobile' }],
      });
      expect(data(set)).toMatchObject({
        title: 'Renamed Board',
        instructions: ['Write tests', 'Keep IDs'],
        related: [{ alias: 'mobile', path: '../mobile' }],
        changed: ['title', 'instructions', 'related'],
      });

      const edited = await client.callTool('board', { removeInstructions: ['Keep IDs'], addInstructions: ['Run lint'], removeRelated: ['mobile'] });
      expect(data(edited)).toMatchObject({ instructions: ['Write tests', 'Run lint'], related: [], changed: ['instructions', 'related'] });

      const config = readBoardConfig(board.brainfilePath)!;
      expect(config.config.title).toBe('Renamed Board');
      expect(config.config.agent?.instructions).toEqual(['Write tests', 'Run lint']);
      expect(config.config.related).toBeUndefined();
      expect(config.body).toContain('The body stays.');
    });

    test('refuses a bad change and writes nothing', async () => {
      const before = fs.readFileSync(board.brainfilePath, 'utf-8');
      const result = await client.callTool('board', { title: 'X', removeInstructions: ['Not there'] });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('not an instruction on this board');
      expect(text(await client.callTool('board', { addRelated: [{ alias: 'bad name', path: '../x' }] }))).toContain('letters, digits');
      expect(fs.readFileSync(board.brainfilePath, 'utf-8')).toBe(before);
    });
  });

  describe('types', () => {
    test('lists every type with its place in the graph, and adds one', async () => {
      const listed = await client.callTool('types', {});
      expect(data(listed).graph.map((t: any) => t.name)).toEqual(['epic', 'spec', 'plan', 'task', 'decision']);
      expect(data(listed).graph[2]).toMatchObject({ name: 'plan', parents: ['epic', 'spec'], children: ['task'] });

      const added = await client.callTool('types', { action: 'add', name: 'bug', like: 'task' });
      expect(data(added)).toMatchObject({ action: 'add', added: { name: 'bug', entry: { idPrefix: 'bug', like: 'task' } } });
      expect(data(added).types.bug).toMatchObject({ idPrefix: 'bug', like: 'task' });
      expect(data(added).graph.map((t: any) => t.name)).toContain('bug');
      expect((readBoardConfig(board.brainfilePath)!.config.types as any).bug).toMatchObject({ like: 'task' });
    });

    test('refuses an alias name or a missing name', async () => {
      expect(text(await client.callTool('types', { action: 'add', name: 'adr' }))).toContain("'adr' is an alias of decision");
      expect((await client.callTool('types', { action: 'add' })).isError).toBe(true);
    });
  });

  describe('template', () => {
    test('lists the templates and adds a task from one', async () => {
      const listed = await client.callTool('template', {});
      expect(data(listed).templates.map((t: any) => t.id)).toEqual(['bug-report', 'feature-request', 'refactor']);
      expect(data(listed).templates[0]).toMatchObject({ priority: 'high', tags: ['bug', 'needs-triage'] });
      expect(data(listed).templates[0].subtasks.length).toBeGreaterThan(0);

      const used = await client.callTool('template', { action: 'use', template: 'bug-report', title: 'Login times out', column: 'In Progress' });
      expect(data(used)).toMatchObject({ action: 'use', task: { title: 'Login times out', template: 'bug-report', column: 'in-progress' } });
      const created = await client.callTool('get_task', { task: data(used).task.id });
      expect(data(created)).toMatchObject({ title: 'Login times out', priority: 'high', column: 'in-progress' });
      expect(data(created).subtasks.length).toBeGreaterThan(0);
    });

    test('says which templates exist and refuses an unknown column', async () => {
      expect(text(await client.callTool('template', { action: 'use', title: 'x' }))).toContain('bug-report, feature-request, refactor');
      expect(text(await client.callTool('template', { action: 'use', template: 'nope', title: 'x' }))).toContain('Available templates');
      expect(text(await client.callTool('template', { action: 'use', template: 'refactor', title: 'x', column: 'nope' }))).toContain('Column not found: nope');
    });
  });

  describe('lint', () => {
    test('a clean board is valid', async () => {
      const result = await client.callTool('lint', {});
      expect(data(result)).toMatchObject({ valid: true, issues: [], errorCount: 0, fixed: false });
      expect(text(result)).toContain('No issues found');
    });

    test('reports graph problems as warnings, not a failed call', async () => {
      writeTask(board, { id: 'task-3', title: 'Orphan', column: 'todo', parentId: 'epic-404' });
      const result = await client.callTool('lint', {});
      expect(result.isError).toBeFalsy();
      expect(data(result).issues.some((i: any) => i.message.includes('epic-404'))).toBe(true);
    });

    test('fixes what it can', async () => {
      fs.writeFileSync(board.brainfilePath, CONFIG.replace('title: In Progress', 'title: In Progress (Source: QA)'));
      const found = await client.callTool('lint', {});
      expect(data(found).fixableCount).toBeGreaterThan(0);
      expect(data(found).fixed).toBe(false);

      const fixed = await client.callTool('lint', { fix: true });
      expect(data(fixed)).toMatchObject({ fixed: true });
      expect(fs.readFileSync(board.brainfilePath, 'utf-8')).toContain('"In Progress (Source: QA)"');
      expect(data(await client.callTool('lint', {}))).toMatchObject({ valid: true });
    });
  });

  describe('sync and where', () => {
    test('a plain board is skipped by sync and reported plain by where', async () => {
      const synced = await client.callTool('sync', {});
      expect(data(synced)).toMatchObject({ ok: true, skipped: 'not-tracked', remote: null, remoteRef: null, autosync: null, pulled: 0, pushed: 0 });
      expect(data(synced).message).toMatch(/plain files/);
      expect((await client.callTool('sync', { pull: true, push: true })).isError).toBe(true);

      const where = await client.callTool('where', {});
      expect(data(where)).toMatchObject({ path: board.dotDir, storage: 'plain', remote: null, pendingChanges: 0 });
    });

    test('a board with its own repository and no remote', async () => {
      git(['init', '--quiet'], board.dotDir);
      const where = await client.callTool('where', {});
      expect(data(where)).toMatchObject({ storage: 'repository', remote: null });
      const synced = await client.callTool('sync', {});
      expect(data(synced)).toMatchObject({ skipped: 'no-remote', autosync: 'off' });
    });
  });

  describe('retire and adr_promote', () => {
    test('retire marks a decision rejected and moves it to logs/', async () => {
      const decided = await client.callTool('decide', { claimKey: 'dependency.http', text: 'Use axios' });
      const id = data(decided).decision.id;
      const retired = await client.callTool('retire', { taskId: id, as: 'rejected', note: 'Too heavy', agent: 'claude' });
      expect(retired.isError).toBeFalsy();
      expect(data(retired).decision).toMatchObject({ id, status: 'rejected', path: `.brainfile/logs/${id}.md` });
      const doc = readTaskFile(path.join(board.logsDir, `${id}.md`))!;
      expect(doc.body).toMatch(/\[claude\]: rejected: Too heavy/);
      expect(fs.existsSync(path.join(board.boardDir, `${id}.md`))).toBe(false);

      expect(text(await client.callTool('retire', { taskId: 'task-1', as: 'stale' }))).toContain('is not a decision');
    });

    test('adr_promote accepts a legacy ADR and moves it to logs/', async () => {
      writeTask(board, { id: 'adr-1', title: 'Boards live on a branch', type: 'adr', column: 'todo' });
      const promoted = await client.callTool('adr_promote', { task: 'adr-1' });
      expect(data(promoted)).toMatchObject({ taskId: 'adr-1', status: 'promoted' });
      expect(readTaskFile(path.join(board.logsDir, 'adr-1.md'))?.task).toMatchObject({ status: 'promoted' });

      const notAdr = await client.callTool('adr_promote', { task: 'task-1' });
      expect(notAdr.isError).toBe(true);
      expect(text(notAdr)).toContain('Only ADRs can be promoted');
    });
  });

  describe('plans: plan add, list --status, link', () => {
    test('task_add, list_tasks and task_patch cover the plan commands', async () => {
      const spec = await client.callTool('task_add', { title: 'Cache spec', type: 'spec', column: 'todo' });
      const plan = await client.callTool('task_add', { title: 'Cache plan', type: 'plan', column: 'todo', status: 'draft', parentId: data(spec).id });
      expect(data(plan).id).toMatch(/^plan-/);

      const drafts = await client.callTool('list_tasks', { type: 'plan', status: 'draft' });
      expect(data(drafts).tasks).toEqual([expect.objectContaining({ id: data(plan).id, status: 'draft', parentId: data(spec).id })]);
      expect(data(await client.callTool('list_tasks', { type: 'plan', status: 'active' })).count).toBe(0);

      const linked = await client.callTool('task_patch', { task: 'task-1', parentId: data(plan).id });
      expect(linked.isError).toBeFalsy();
      expect(data(await client.callTool('list_tasks', { tree: true })).tree.find((n: any) => n.id === 'task-1')).toMatchObject({ parentId: data(plan).id });
    });
  });

  describe('one board commit per change on a tracked board', () => {
    test('a write commits once; a read commits nothing', async () => {
      // A tracked board keeps board/ and logs/ in git with a .gitkeep each.
      fs.writeFileSync(path.join(board.boardDir, '.gitkeep'), '');
      fs.writeFileSync(path.join(board.logsDir, '.gitkeep'), '');
      git(['init', '--quiet'], board.dotDir);
      git(['config', 'user.name', 'Tester'], board.dotDir);
      git(['config', 'user.email', 'tester@example.com'], board.dotDir);
      git(['add', '-A'], board.dotDir);
      git(['commit', '--quiet', '-m', 'start'], board.dotDir);
      const count = () => Number(git(['rev-list', '--count', 'HEAD'], board.dotDir));

      await client.callTool('columns', {});
      await client.callTool('board', {});
      expect(count()).toBe(1);

      await client.callTool('columns', { action: 'add', title: 'Review' });
      expect(count()).toBe(2);
      expect(git(['log', '-1', '--format=%s'], board.dotDir)).toBe('columns add: Review');

      await client.callTool('note', { task: 'task-1', message: 'Noted', agent: 'codex' });
      expect(count()).toBe(3);
      expect(git(['log', '-1', '--format=%s'], board.dotDir)).toBe('note task-1');

      await client.callTool('board', { title: 'Tracked' });
      expect(git(['log', '-1', '--format=%s'], board.dotDir)).toBe('board: Tracked');
      expect(git(['status', '--porcelain'], board.dotDir)).toBe('');
    });
  });
});
