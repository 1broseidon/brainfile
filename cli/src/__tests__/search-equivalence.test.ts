/**
 * Search-equivalence tests.
 *
 * The CLI `search` command and the MCP `search` tool must return the same
 * task IDs in the same rank order, now that both delegate to core's
 * `searchTasksRanked`. Also pins the log-body canonicalization: an *active*
 * task matched only via its `## Log` section is found by both surfaces.
 */

import * as fs from 'fs';
import * as path from 'path';
import { taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpJson } from './helpers/mcp';
import { searchCommand } from '../commands/search';
import { registerSearchTool } from '../mcp/tools/search_tool';
import { MemoryLogger } from '../utils/logger';

describe('search equivalence (CLI vs MCP)', () => {
  let ws: V2TestWorkspace;
  let server: FakeMcpServer;

  const seedBoard = (task: Task, body = '') => {
    writeTaskFile(path.join(ws.boardDir, taskFileName(task.id)), task, body);
  };

  const seedLog = (task: Task, body = '') => {
    writeTaskFile(path.join(ws.logsDir, taskFileName(task.id)), task, body);
  };

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-search-equiv-');

    seedBoard({ id: 'task-1', title: 'Auth token refresh', column: 'todo' });
    seedBoard({ id: 'task-2', title: 'Unrelated work', column: 'todo' }, '## Description\nMentions auth in passing\n');
    seedBoard(
      { id: 'task-3', title: 'Widget polish', column: 'in-progress' },
      '## Log\n- 2026-01-01: chased an auth regression\n',
    );
    seedLog({ id: 'task-9', title: 'Old auth cleanup', completedAt: '2026-01-01T00:00:00.000Z' });

    server = new FakeMcpServer();
    registerSearchTool(server as any, ws.brainfilePath);
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  async function mcpIds(args: Record<string, unknown>): Promise<string[]> {
    const result = await server.handler('search')({ file: ws.brainfilePath, ...args });
    return mcpJson<{ results: Array<{ id: string }> }>(result).results.map((r) => r.id);
  }

  function cliIds(args: { query: string; column?: string }): string[] {
    return searchCommand({ file: ws.brainfilePath, ...args }, new MemoryLogger()).results.map((r) => r.id);
  }

  it('returns the same IDs in the same rank order', async () => {
    const cli = cliIds({ query: 'auth' });
    const mcp = await mcpIds({ query: 'auth' });

    expect(cli).toEqual(mcp);
    expect(cli.length).toBeGreaterThan(0);
  });

  it('ranks an exact ID match first on both surfaces', async () => {
    expect(cliIds({ query: 'task-1' })[0]).toBe('task-1');
    expect((await mcpIds({ query: 'task-1' }))[0]).toBe('task-1');
  });

  it('agrees when a column filter is applied', async () => {
    const cli = cliIds({ query: 'auth', column: 'todo' });
    const mcp = await mcpIds({ query: 'auth', column: 'todo' });

    expect(cli).toEqual(mcp);
    expect(cli).not.toContain('task-9'); // logs excluded under a column filter
  });

  it('finds an active task matched only through its ## Log section', async () => {
    // Canonicalization: log-body text is scored for every document, not just
    // completed ones. Pre-refactor the MCP tool skipped log text for board docs.
    expect(cliIds({ query: 'regression' })).toContain('task-3');
    expect(await mcpIds({ query: 'regression' })).toContain('task-3');
  });

  it('honors an embedded p: token when no explicit priority param is passed', async () => {
    // Regression: the tool destructures optional params, so `priority` is an
    // explicitly-undefined key on the filters object. It must not clobber the
    // priority parsed out of the query string itself.
    seedBoard({ id: 'task-20', title: 'Fix login bug', column: 'todo', priority: 'high' });
    seedBoard({ id: 'task-21', title: 'Fix login bug', column: 'todo', priority: 'low' });

    const mcp = await mcpIds({ query: 'p:high bug' });

    expect(mcp).toContain('task-20');
    expect(mcp).not.toContain('task-21');
  });

  it('honors an embedded @assignee token when no explicit assignee param is passed', async () => {
    seedBoard({ id: 'task-30', title: 'Fix login bug', column: 'todo', assignee: 'alice' });
    seedBoard({ id: 'task-31', title: 'Fix login bug', column: 'todo', assignee: 'bob' });

    const mcp = await mcpIds({ query: '@alice bug' });

    expect(mcp).toContain('task-30');
    expect(mcp).not.toContain('task-31');
  });

  it('agrees on embedded-token queries across CLI and MCP', async () => {
    seedBoard({ id: 'task-40', title: 'Auth rework', column: 'todo', priority: 'high' });
    seedBoard({ id: 'task-41', title: 'Auth rework', column: 'todo', priority: 'low' });

    const cli = cliIds({ query: 'p:high auth' });
    const mcp = await mcpIds({ query: 'p:high auth' });

    expect(cli).toEqual(mcp);
    expect(cli).toContain('task-40');
    expect(cli).not.toContain('task-41');
  });

  it('lets an explicit priority param still override an embedded token', async () => {
    seedBoard({ id: 'task-50', title: 'Fix login bug', column: 'todo', priority: 'high' });
    seedBoard({ id: 'task-51', title: 'Fix login bug', column: 'todo', priority: 'low' });

    const mcp = await mcpIds({ query: 'p:high bug', priority: 'low' });

    expect(mcp).toContain('task-51');
    expect(mcp).not.toContain('task-50');
  });

  it('returns nothing on both surfaces for a non-matching query', async () => {
    expect(cliIds({ query: 'zzz-nonexistent-zzz' })).toEqual([]);
    expect(await mcpIds({ query: 'zzz-nonexistent-zzz' })).toEqual([]);
  });
});
