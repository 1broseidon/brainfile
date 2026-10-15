/**
 * `brainfile issues` and the MCP `issues` tool (task-77): a project's open
 * GitHub issues, marked when a task on the board (open or completed) carries
 * one as `source:`, and import, which makes a task from an issue once.
 * `brainfile add --source` and `task_add`'s source refuse a second task for
 * the same issue. GitHub is a fake fetch behind core's client; nothing here
 * reaches the network.
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { readTaskFile, readTasksDir, writeTaskFile } from '@brainfile/core';
import { GitHub } from '@brainfile/core/forge';
import { issueNumbers, issuesCommand } from '../commands/issues';
import { addCommand } from '../commands/add';
import { commandWrites } from '../utils/board-commit-hooks';
import { toolWrites } from '../mcp/helpers';
import { registerIssuesTool } from '../mcp/tools/issues_tool';
import { registerTaskAddTool } from '../mcp/tools/task_add_tool';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { FakeMcpServer, mcpText } from './helpers/mcp';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';

const CONFIG = `---
title: Issues Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: done
    title: Done
    completionColumn: true
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---
`;

function item(number: number, over: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: `Body of ${number}`,
    labels: [{ name: 'bug' }, { name: 'Good First Issue' }],
    html_url: `https://github.com/o/r/issues/${number}`,
    user: { login: 'someone' },
    comments: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    ...over,
  };
}

/** A GitHub with these open issues, which counts what it is asked. */
function fakeGitHub(items: unknown[]) {
  const asked: string[] = [];
  const github = new GitHub({
    fetch: (async (url: string) => {
      asked.push(String(url));
      return new Response(JSON.stringify(items), { status: 200, headers: { 'content-type': 'application/json', etag: 'W/"x"' } });
    }) as typeof fetch,
    ghToken: async () => null,
    env: {},
    store: { read: () => null, write: () => {} },
  });
  return { github, asked };
}

const ISSUES = [item(12), item(15, { labels: [], body: null }), { ...item(20), pull_request: {} }, item(7)];

let ws: V2TestWorkspace;
let logger: MemoryLogger;

beforeEach(() => {
  ws = createV2TestWorkspace('brainfile-issues-', CONFIG);
  execFileSync('git', ['init', '-q'], { cwd: ws.tempDir });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:o/r.git'], { cwd: ws.tempDir });
  fs.writeFileSync(path.join(ws.logsDir, 'ledger.jsonl'), '');
  // Issue #7 was made into a task long ago, and finished.
  writeTaskFile(path.join(ws.logsDir, 'task-1.md'), { id: 'task-1', title: 'Old', source: 'https://github.com/o/r/issues/7/', completedAt: '2026-09-01T00:00:00Z' });
  logger = new MemoryLogger();
});

afterEach(() => {
  fs.rmSync(ws.tempDir, { recursive: true, force: true });
});

describe('brainfile issues', () => {
  test('lists the open issues with a fake fetch, pull requests left out, and marks those already on the board', async () => {
    const { github, asked } = fakeGitHub(ISSUES);
    const report = await issuesCommand({ file: ws.brainfilePath }, logger, github);
    expect(asked).toEqual(['https://api.github.com/repos/o/r/issues?state=open&sort=updated&direction=desc&per_page=100']);
    expect(report.repo).toMatchObject({ owner: 'o', name: 'r' });
    expect(report.auth).toBe('none');
    expect(report.issues.map((i) => [i.number, i.task])).toEqual([[12, undefined], [15, undefined], [7, 'task-1']]);
    expect(report.imported).toEqual([]);
    const out = logger.getOutput();
    expect(out).toContain('o/r');
    expect(out).toContain('3 open issues');
    expect(out).toMatch(/#7\s.*on the board: task-1/);
    expect(readTasksDir(ws.boardDir)).toEqual([]);
  });

  test('import makes a task with source:, its body as the description and its labels as tags, in the first column not done', async () => {
    const { github } = fakeGitHub(ISSUES);
    const report = await issuesCommand({ file: ws.brainfilePath, import: ['#12'] }, logger, github);
    expect(report.imported).toEqual([{ number: 12, task: 'task-2', made: true }]);
    expect(report.issues.find((i) => i.number === 12)?.task).toBe('task-2');
    const doc = readTaskFile(path.join(ws.boardDir, 'task-2.md'))!;
    expect(doc.task).toMatchObject({ title: 'Issue 12', column: 'todo', tags: ['bug', 'good-first-issue'], source: 'https://github.com/o/r/issues/12' });
    expect(doc.body).toContain('## Description\nBody of 12');
    expect(logger.getOutput()).toContain('#12 → task-2');
  });

  test('a second import finds the task already made, and a completed one counts', async () => {
    const { github } = fakeGitHub(ISSUES);
    await issuesCommand({ file: ws.brainfilePath, import: ['12'] }, logger, github);
    const again = await issuesCommand({ file: ws.brainfilePath, import: ['12,7', '15'], column: 'in-progress' }, logger, github);
    expect(again.imported).toEqual([
      { number: 12, task: 'task-2', made: false },
      { number: 7, task: 'task-1', made: false },
      { number: 15, task: 'task-3', made: true },
    ]);
    expect(readTasksDir(ws.boardDir).map((d) => [d.task.id, d.task.column])).toEqual(
      expect.arrayContaining([['task-2', 'todo'], ['task-3', 'in-progress']]),
    );
    expect(readTasksDir(ws.boardDir)).toHaveLength(2);
    expect(logger.getOutput()).toContain('#12 is already task-2');
  });

  test('an issue that is not open, or a number that is none, is refused, after reading GitHub afresh', async () => {
    const { github, asked } = fakeGitHub(ISSUES);
    await expect(issuesCommand({ file: ws.brainfilePath, import: ['99'] }, logger, github)).rejects.toThrow(/Not among o\/r's open issues: #99/);
    expect(asked).toHaveLength(2);
    expect(() => issueNumbers(['twelve'])).toThrow(CLIError);
    expect(issueNumbers(['#12', '12, 15'])).toEqual([12, 15]);
    await expect(issuesCommand({ file: ws.brainfilePath, import: ['12'], column: 'nowhere' }, logger, github)).rejects.toThrow(/Column not found/);
  });

  test("a project whose origin is not on GitHub says so", async () => {
    const other = createV2TestWorkspace('brainfile-issues-other-', CONFIG);
    try {
      await expect(issuesCommand({ file: other.brainfilePath }, logger, fakeGitHub([]).github)).rejects.toThrow(/origin is not on GitHub/);
    } finally {
      fs.rmSync(other.tempDir, { recursive: true, force: true });
    }
  });

  test('only an import writes the board', () => {
    const command = (opts: Record<string, unknown>) => ({ name: () => 'issues', args: [], opts: () => opts, parent: { name: () => 'brainfile', args: [], opts: () => ({}), parent: null } });
    expect(commandWrites(command({}))).toBe(false);
    expect(commandWrites(command({ import: ['12'] }))).toBe(true);
    expect(toolWrites('issues', { action: 'list' })).toBe(false);
    expect(toolWrites('issues', {})).toBe(false);
    expect(toolWrites('issues', { action: 'import', numbers: [12] })).toBe(true);
  });
});

describe('brainfile add --source', () => {
  test('writes source:, and a second task for the same issue is refused', () => {
    const quiet = new MemoryLogger();
    const made = addCommand({ file: ws.brainfilePath, column: 'todo', title: 'From an issue', source: 'https://github.com/o/r/issues/12/' }, quiet);
    expect(readTaskFile(path.join(ws.boardDir, `${made.taskId}.md`))!.task.source).toBe('https://github.com/o/r/issues/12');
    expect(quiet.getOutput()).toContain('Source:   https://github.com/o/r/issues/12');
    expect(() => addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Again', source: 'https://github.com/o/r/issues/12' }, quiet)).toThrow(`That issue is already ${made.taskId}.`);
    expect(() => addCommand({ file: ws.brainfilePath, column: 'todo', title: 'Old', source: 'https://github.com/o/r/issues/7' }, quiet)).toThrow('That issue is already task-1.');
  });
});

describe('MCP', () => {
  test('issues lists and imports; a second import finds the task already made', async () => {
    const server = new FakeMcpServer();
    const { github } = fakeGitHub(ISSUES);
    registerIssuesTool(server as never, ws.brainfilePath, () => github);
    const issues = server.handler('issues');

    const listed = (await issues({})) as { structuredContent?: { issues: Array<{ number: number; task?: string }> } };
    expect(listed.structuredContent?.issues.map((i) => i.task ?? null)).toEqual([null, null, 'task-1']);

    const refused = await issues({ action: 'import' });
    expect(refused.isError).toBe(true);

    const first = (await issues({ action: 'import', numbers: [15] })) as { structuredContent?: { imported: unknown[] } };
    expect(first.structuredContent?.imported).toEqual([{ number: 15, task: 'task-2', made: true }]);
    expect(readTaskFile(path.join(ws.boardDir, 'task-2.md'))!.task.source).toBe('https://github.com/o/r/issues/15');

    const second = await issues({ action: 'import', numbers: [15] });
    expect(mcpText(second)).toBe('#15 is already task-2');

    const missing = await issues({ action: 'import', numbers: [99] });
    expect(missing.isError).toBe(true);
    expect(mcpText(missing)).toMatch(/Not among o\/r's open issues: #99/);
  });

  test('task_add takes source and refuses a second task for the same issue', async () => {
    const server = new FakeMcpServer();
    registerTaskAddTool(server as never, ws.brainfilePath);
    const add = server.handler('task_add');
    const made = (await add({ title: 'From an issue', column: 'todo', source: 'https://github.com/o/r/issues/12' })) as { structuredContent?: { id: string } };
    const id = made.structuredContent!.id;
    expect(readTaskFile(path.join(ws.boardDir, `${id}.md`))!.task.source).toBe('https://github.com/o/r/issues/12');
    const again = await add({ title: 'Again', column: 'todo', source: 'https://github.com/o/r/issues/12/' });
    expect(again.isError).toBe(true);
    expect(mcpText(again)).toBe(`Error: That issue is already ${id}.`);
  });
});
