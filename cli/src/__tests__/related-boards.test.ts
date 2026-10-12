/**
 * spec-10: related boards. A board names sister boards under `related:`;
 * `alias:task-id` works in dependsOn, show, list --related and the MCP
 * list/get tools. Sister boards are only ever read.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { writeTaskFile, type Task } from '@brainfile/core';
import { showCommand } from '../commands/show';
import { listCommand } from '../commands/list';
import { lintCommand } from '../commands/lint';
import { contractGraphCommand, contractPickupCommand } from '../commands/contract';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { FakeMcpServer, mcpJson, mcpText } from './helpers/mcp';
import { WireClient } from './helpers/mcp-wire';
import { registerListTasksTool } from '../mcp/tools/list_tasks_tool';
import { registerGetTaskTool } from '../mcp/tools/get_task_tool';

const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function git(args: string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function writeBoard(dotDir: string, title: string, related?: Record<string, string>): string {
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  const relatedYaml = related
    ? `related:\n${Object.entries(related).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`
    : '';
  const brainfilePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(
    brainfilePath,
    `---\ntitle: ${title}\n${relatedYaml}columns:\n  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n---\n`,
  );
  return brainfilePath;
}

function task(dir: string, t: Task): void {
  writeTaskFile(path.join(dir, `${t.id}.md`), t, '');
}

const contract = { status: 'ready' as const, deliverables: [] };

describe('related boards', () => {
  let base: string;
  let app: string;
  let appDot: string;
  let webDot: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-related-cli-')));
    appDot = path.join(base, 'app', '.brainfile');
    webDot = path.join(base, 'web', '.brainfile');
    app = writeBoard(appDot, 'App', { web: '../web', gone: '../gone' });
    writeBoard(webDot, 'Web');

    task(path.join(webDot, 'board'), { id: 'task-1', title: 'Web API client', column: 'in-progress', priority: 'high' });
    task(path.join(webDot, 'board'), { id: 'task-4', title: 'Unrelated web task', column: 'todo' });
    task(path.join(webDot, 'logs'), { id: 'task-2', title: 'Shipped web task', completedAt: '2026-01-01T00:00:00.000Z' });

    task(path.join(appDot, 'board'), { id: 'task-1', title: 'Local base', column: 'todo' });
    task(path.join(appDot, 'board'), {
      id: 'task-2', title: 'Needs the web client', column: 'todo', dependsOn: ['web:task-1', 'task-1'], contract,
    });
    task(path.join(appDot, 'board'), {
      id: 'task-3', title: 'Needs shipped web work', column: 'todo', dependsOn: ['web:task-2'], contract,
    });
    task(path.join(appDot, 'board'), {
      id: 'task-5', title: 'Local deps only', column: 'todo', dependsOn: ['task-1'], contract,
    });
    task(path.join(appDot, 'board'), {
      id: 'task-6', title: 'Needs a board not here', column: 'todo', dependsOn: ['gone:task-7'], contract,
    });
    logger = new MemoryLogger();
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  // ── show ──────────────────────────────────────────────────────────────────

  describe('show', () => {
    test('reads a task on a related board', () => {
      const result = showCommand({ file: app, task: 'web:task-1' }, logger);
      expect(result).toMatchObject({ taskId: 'web:task-1', archived: false });
      const out = logger.getOutput();
      expect(out).toContain('web:task-1');
      expect(out).toContain('Board: web (../web)');
      expect(out).toContain('Web API client');
    });

    test('reads a completed task there, and as JSON', () => {
      showCommand({ file: app, task: 'web:task-2', json: true }, logger);
      const json = JSON.parse(logger.getOutput());
      expect(json).toMatchObject({ id: 'task-2', board: 'web', ref: 'web:task-2', archived: true, column: 'Completed' });
    });

    test('says the board is not on this machine', () => {
      expect(() => showCommand({ file: app, task: 'gone:task-7' }, logger)).toThrow('gone (../gone) is not on this machine');
    });

    test('rejects an unknown alias, a malformed ref and a missing task', () => {
      expect(() => showCommand({ file: app, task: 'nope:task-1' }, logger)).toThrow("No related board named 'nope'");
      expect(() => showCommand({ file: app, task: 'web:' }, logger)).toThrow('is not a task reference');
      expect(() => showCommand({ file: app, task: 'web:task-99' }, logger)).toThrow('Task not found: web:task-99');
      try {
        showCommand({ file: app, task: 'gone:task-7' }, logger);
      } catch (e) {
        expect(e).toBeInstanceOf(CLIError);
        expect((e as CLIError).details).toContain(path.join(base, 'gone'));
      }
    });

    test('shows each dependency and what blocks the task', () => {
      showCommand({ file: app, task: 'task-2' }, logger);
      const out = logger.getOutput();
      expect(out).toContain('Depends on:');
      expect(out).toMatch(/web:task-1 open \(in-progress\)/);
      expect(out).toMatch(/task-1 open \(todo\)/);
      expect(out).toContain('Blocked by: web:task-1');
    });

    test('a completed cross-repo dependency does not block', () => {
      showCommand({ file: app, task: 'task-3', json: true }, logger);
      const json = JSON.parse(logger.getOutput());
      expect(json.dependencies).toEqual([{ ref: 'web:task-2', state: 'completed', done: true }]);
      expect(json.blocked).toBe(false);
    });

    test('a task without dependsOn shows exactly what it did before', () => {
      showCommand({ file: app, task: 'task-1', json: true }, logger);
      const json = JSON.parse(logger.getOutput());
      expect(json).not.toHaveProperty('dependencies');
      expect(json).not.toHaveProperty('blocked');
      expect(json).not.toHaveProperty('board');
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    test('marks tasks blocked by a related board, and only those', () => {
      listCommand({ file: app }, logger);
      const out = logger.getOutput();
      expect(out).toContain('Blocked by: web:task-1');
      expect(out).toContain('Blocked by: gone:task-7');
      // task-3's dependency is completed; task-5 depends only on this board.
      expect(out.match(/Blocked by:/g)).toHaveLength(2);
    });

    test('--related lists open tasks this board depends on', () => {
      const result = listCommand({ file: app, related: true }, logger);
      const out = logger.getOutput();
      expect(out).toContain('App — related boards');
      expect(out).toContain('web (../web) · Web (1)');
      expect(out).toContain('[web:task-1] Web API client');
      expect(out).toContain('Column: In Progress');
      expect(out).toContain('Needed by: task-2');
      expect(out).not.toContain('Unrelated web task');
      expect(out).not.toContain('Shipped web task');
      expect(out).toContain('gone (../gone) is not on this machine');
      expect(out).toContain('[gone:task-7] needed by task-6');
      expect(result.totalTasks).toBe(1);
    });

    test('--related all lists every open task on every related board', () => {
      const result = listCommand({ file: app, related: 'all' }, logger);
      const out = logger.getOutput();
      expect(out).toContain('[web:task-1] Web API client');
      expect(out).toContain('[web:task-4] Unrelated web task');
      expect(out).not.toContain('Shipped web task');
      expect(out).toContain('gone (../gone) is not on this machine');
      expect(result.totalTasks).toBe(2);
    });

    test('--related names a referenced task the board does not have', () => {
      task(path.join(appDot, 'board'), { id: 'task-8', title: 'Bad ref', column: 'todo', dependsOn: ['web:task-99'] });
      listCommand({ file: app, related: true }, logger);
      expect(logger.getOutput()).toContain('[web:task-99] not on that board');
    });

    test('--related with no related boards, or none depended on', () => {
      const lone = writeBoard(path.join(base, 'lone', '.brainfile'), 'Lone');
      listCommand({ file: lone, related: true }, logger);
      expect(logger.getOutput()).toContain('No related boards');

      const quiet = writeBoard(path.join(base, 'quiet', '.brainfile'), 'Quiet', { web: '../web' });
      const quietLogger = new MemoryLogger();
      listCommand({ file: quiet, related: true }, quietLogger);
      expect(quietLogger.getOutput()).toContain('No task on this board depends on a related board');

      const allLogger = new MemoryLogger();
      writeBoard(path.join(base, 'empty', '.brainfile'), 'Empty');
      const emptyRef = writeBoard(path.join(base, 'quiet2', '.brainfile'), 'Q2', { empty: '../empty' });
      listCommand({ file: emptyRef, related: 'all' }, allLogger);
      expect(allLogger.getOutput()).toContain('(no open tasks)');
    });

    test('--related rejects any value but all', () => {
      expect(() => listCommand({ file: app, related: 'some' }, logger)).toThrow("--related takes no value or 'all'");
    });
  });

  // ── dependsOn blocks contract pickup ────────────────────────────────────

  describe('contract pickup', () => {
    test('refuses while a related-board dependency is open', () => {
      expect(() => contractPickupCommand({ file: app, task: 'task-2' }, logger))
        .toThrow('Task task-2 is blocked by web:task-1 — open (in-progress). It can be picked up once that task is completed.');
    });

    test('refuses while the related board is not on this machine', () => {
      expect(() => contractPickupCommand({ file: app, task: 'task-6' }, logger))
        .toThrow('blocked by gone:task-7 — gone is not on this machine');
    });

    test('goes ahead once the dependency is completed there', () => {
      contractPickupCommand({ file: app, task: 'task-3' }, logger);
      expect(logger.getOutput()).toContain('# Contract pickup: task-3');

      fs.renameSync(path.join(webDot, 'board', 'task-1.md'), path.join(webDot, 'logs', 'task-1.md'));
      contractPickupCommand({ file: app, task: 'task-2' }, new MemoryLogger());

      const listed = new MemoryLogger();
      listCommand({ file: app, related: true }, listed);
      expect(listed.getOutput()).toContain('(nothing open that this board depends on)');
    });

    test('dependencies on this board behave as before', () => {
      contractPickupCommand({ file: app, task: 'task-5' }, logger);
      expect(logger.getOutput()).toContain('# Contract pickup: task-5');
    });
  });

  // ── contract graph and lint accept references ────────────────────────────

  test('contract graph accepts a dependency on a related board', () => {
    const result = contractGraphCommand({
      file: app,
      tasks: [{ task: 'task-1', deliverable: 'file:src/a.ts', dependsOn: ['web:task-4'] }],
    }, logger);
    expect(result.graph).toContain('web:task-4 -> task-1');
  });

  test('lint warns on unknown aliases and malformed refs, not on a missing folder', () => {
    task(path.join(appDot, 'board'), { id: 'task-9', title: 'Refs', column: 'todo', dependsOn: ['nope:task-1', 'web:', 'gone:task-1', 'task-1'] });
    const result = lintCommand({ file: app }, logger);
    expect(result.success).toBe(true);
    expect(result.issues.map((i) => i.code).sort()).toEqual(['MALFORMED_TASK_REF', 'UNKNOWN_RELATED_ALIAS']);
  });

  // ── MCP ───────────────────────────────────────────────────────────────────

  describe('MCP', () => {
    let server: FakeMcpServer;

    beforeEach(() => {
      server = new FakeMcpServer();
      registerListTasksTool(server as any, app);
      registerGetTaskTool(server as any, app);
    });

    test('list_tasks related: true and "all"', async () => {
      const depends = mcpJson(await server.handler('list_tasks')({ related: true }));
      expect(depends.related).toEqual([
        expect.objectContaining({
          alias: 'web', status: 'found', title: 'Web', notFound: [],
          tasks: [expect.objectContaining({ ref: 'web:task-1', id: 'task-1', column: 'in-progress', neededBy: ['task-2'] })],
        }),
        expect.objectContaining({ alias: 'gone', status: 'missing', note: 'gone (../gone) is not on this machine', tasks: [] }),
      ]);

      const all = mcpJson(await server.handler('list_tasks')({ related: 'all' }));
      expect(all.related[0].tasks.map((t: any) => t.ref)).toEqual(['web:task-4', 'web:task-1']);

      const plain = mcpJson(await server.handler('list_tasks')({}));
      expect(plain).not.toHaveProperty('related');
    });

    test('get_task reads alias:id and reports dependencies', async () => {
      const remote = mcpJson(await server.handler('get_task')({ task: 'web:task-1' }));
      expect(remote).toMatchObject({ id: 'task-1', board: 'web', ref: 'web:task-1', column: 'in-progress' });

      const local = mcpJson(await server.handler('get_task')({ task: 'task-2' }));
      expect(local.blocked).toBe(true);
      expect(local.dependencies).toEqual([
        { ref: 'web:task-1', state: 'open', done: false },
        { ref: 'task-1', state: 'open', done: false },
      ]);
    });

    test('get_task says when the board is not on this machine', async () => {
      const missing = await server.handler('get_task')({ task: 'gone:task-7' });
      expect(missing.isError).toBe(true);
      expect(mcpText(missing)).toContain('gone (../gone) is not on this machine');

      const unknown = await server.handler('get_task')({ task: 'nope:task-1' });
      expect(mcpText(unknown)).toContain("No related board named 'nope'");

      const notFound = await server.handler('get_task')({ task: 'web:task-99' });
      expect(mcpText(notFound)).toContain('Task not found: web:task-99');
    });

    test('outputs pass schema validation over the wire', async () => {
      const client = await WireClient.open(app, 'modern');
      try {
        const listed = await client.callTool('list_tasks', { related: 'all' });
        expect(listed.isError).toBeFalsy();
        expect((listed.structuredContent as any).related).toHaveLength(2);
        const got = await client.callTool('get_task', { task: 'task-2' });
        expect(got.isError).toBeFalsy();
        expect((got.structuredContent as any).blocked).toBe(true);
        const remote = await client.callTool('get_task', { task: 'web:task-1' });
        expect((remote.structuredContent as any).ref).toBe('web:task-1');
      } finally {
        await client.close();
      }
    });
  });

  // ── a sister kept on its board branch ────────────────────────────────────

  test('a sister board on the brainfile branch resolves like brainfile in that folder', () => {
    // App's own board is a branch worktree at <repo>/.brainfile: related paths
    // are relative to the repo root, not to .brainfile/.
    const repoApp = path.join(base, 'repo-app');
    const repoMobile = path.join(base, 'repo-mobile');
    for (const repo of [repoApp, repoMobile]) {
      fs.mkdirSync(repo);
      git(['init', '-q', '-b', 'main'], repo);
      git(['commit', '-q', '--allow-empty', '-m', 'init'], repo);
      git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', path.join(repo, '.brainfile')], repo);
    }
    const appBoard = writeBoard(path.join(repoApp, '.brainfile'), 'Repo App', { mobile: '../repo-mobile' });
    writeBoard(path.join(repoMobile, '.brainfile'), 'Mobile');
    task(path.join(repoMobile, '.brainfile', 'board'), { id: 'task-12', title: 'Mobile login', column: 'todo' });
    task(path.join(repoApp, '.brainfile', 'board'), { id: 'task-1', title: 'Wait on mobile', column: 'todo', dependsOn: ['mobile:task-12'] });

    showCommand({ file: appBoard, task: 'mobile:task-12' }, logger);
    expect(logger.getOutput()).toContain('Mobile login');

    const listLogger = new MemoryLogger();
    listCommand({ file: appBoard, related: true }, listLogger);
    expect(listLogger.getOutput()).toContain('[mobile:task-12] Mobile login');
  });
});
