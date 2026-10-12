/**
 * spec-11 at the command level: decide, supersede, retire, search over the
 * local index (and its fallback), index and check, plus the MCP decide,
 * supersede, check and search tools. The brief and the hook are in
 * brief-hook.test.ts.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { readTaskFile, writeTaskFile } from '@brainfile/core';
import { getIndexPath, setSqliteLoaderForTesting, sqliteAvailable } from '@brainfile/core/memory';
import { decideCommand, retireCommand, supersedeCommand } from '../commands/decide';
import { searchCommand } from '../commands/search';
import { indexCommand } from '../commands/memory-index';
import { checkCommand } from '../commands/check';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer, mcpJson, mcpText } from './helpers/mcp';
import { registerDecideTool } from '../mcp/tools/decide_tool';
import { registerSupersedeTool } from '../mcp/tools/supersede_tool';
import { registerCheckTool } from '../mcp/tools/check_tool';
import { registerSearchTool } from '../mcp/tools/search_tool';

const HAS_SQLITE = sqliteAvailable();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const structured = (result: unknown): any => (result as { structuredContent?: unknown }).structuredContent;
const itIndex = HAS_SQLITE ? it : it.skip;

function workspace(): V2TestWorkspace {
  const ws = createV2TestWorkspace('brainfile-memory-cli-');
  spawnSync('git', ['init', '-q'], { cwd: ws.tempDir });
  fs.writeFileSync(path.join(ws.tempDir, 'README.md'), '# Widget\n\n## HTTP\n\nEvery outbound request goes through one client with retries.\n');
  fs.mkdirSync(path.join(ws.tempDir, 'docs'));
  fs.writeFileSync(path.join(ws.tempDir, 'docs', 'index.md'), '# Search index\n\nThe index uses sqlite fts5.\n');
  writeTaskFile(path.join(ws.boardDir, 'task-1.md'), { id: 'task-1', title: 'Build the HTTP retry layer', column: 'in-progress', assignee: 'claude' });
  return ws;
}

describe('decide, supersede, retire', () => {
  let ws: V2TestWorkspace;
  let logger: MemoryLogger;
  beforeEach(() => { ws = workspace(); logger = new MemoryLogger(); });
  afterEach(() => fs.rmSync(ws.tempDir, { recursive: true, force: true }));

  it('decides, auto-supersedes, and reports both', () => {
    const first = decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use axios for HTTP', stance: 'prefers', subject: 'axios' }, logger);
    expect(first.decision).toMatchObject({ id: 'decision-1', claimKey: 'dependency.http-client', status: 'current', path: '.brainfile/board/decision-1.md' });
    expect(first.familyWasEmpty).toBe(true);
    expect(logger.getOutput()).toContain('Decided decision-1');

    const second = decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use undici for HTTP', for: 'task-1,task-99' }, new MemoryLogger());
    expect(second.superseded).toEqual(['decision-1']);
    expect(second.decision.supersedes).toEqual(['decision-1']);
    expect(second.linked).toEqual(['task-1']);
    expect(second.notFound).toEqual(['task-99']);
    expect(readTaskFile(path.join(ws.logsDir, 'decision-1.md'))!.task).toMatchObject({ status: 'superseded', supersededBy: 'decision-2' });
    expect(readTaskFile(path.join(ws.boardDir, 'task-1.md'))!.task.decisions).toEqual(['decision-2']);
  });

  it('prints JSON, names related families, and says when nothing changed', () => {
    decideCommand({ file: ws.brainfilePath, claimKey: 'storage.index', text: 'Index with sqlite' }, new MemoryLogger());
    const json = new MemoryLogger();
    const related = decideCommand({ file: ws.brainfilePath, claimKey: 'storage.cache', text: 'Cache in memory', json: true }, json);
    expect(JSON.parse(json.getOutput())).toMatchObject({ success: true, familyWasEmpty: true, related: [{ claimKey: 'storage.index', reason: 'prefix' }] });
    expect(related.related).toHaveLength(1);

    const human = new MemoryLogger();
    decideCommand({ file: ws.brainfilePath, claimKey: 'storage.queue', text: 'Queue in sqlite' }, human);
    expect(human.getOutput()).toContain('Related families');

    const dup = new MemoryLogger();
    expect(decideCommand({ file: ws.brainfilePath, claimKey: 'storage.index', text: 'Index with sqlite' }, dup).duplicate).toBe(true);
    expect(dup.getOutput()).toContain('Already current: decision-1');
  });

  it('records a source relative to the shell cwd, stored against the project root', () => {
    const cwd = process.cwd();
    try {
      process.chdir(path.join(ws.tempDir, 'docs'));
      const result = decideCommand({ file: ws.brainfilePath, claimKey: 'storage.index', text: 'Per the design', source: 'index.md', package: 'zod>=4', validUntil: '2030-01-01', holdsWhile: 'we ship on node', recheck: 'yearly', kind: 'constraint', tags: 'a,b' }, new MemoryLogger());
      expect(result.decision).toMatchObject({ sourcePath: 'docs/index.md', packageVersion: 'zod>=4', validUntil: '2030-01-01', kind: 'constraint' });
    } finally {
      process.chdir(cwd);
    }
  });

  it('keeps both with --no-supersede, and refuses bad input', () => {
    decideCommand({ file: ws.brainfilePath, claimKey: 'a.b', text: 'One' }, new MemoryLogger());
    expect(decideCommand({ file: ws.brainfilePath, claimKey: 'a.b', text: 'Two', supersede: false }, new MemoryLogger()).superseded).toEqual([]);
    expect(() => decideCommand({ file: ws.brainfilePath, text: 'No key' }, new MemoryLogger())).toThrow(/--claim-key is required/);
    expect(() => decideCommand({ file: ws.brainfilePath, claimKey: 'a.b', text: 'x', stance: 'likes', subject: 's' }, new MemoryLogger())).toThrow(/invalid stance/);
    expect(() => decideCommand({ file: ws.brainfilePath, claimKey: 'a.b', text: '' }, new MemoryLogger())).toThrow(CLIError);
  });

  it('supersedes by hand and retires', () => {
    decideCommand({ file: ws.brainfilePath, claimKey: 'deploy.target', text: 'Ship to Fly' }, new MemoryLogger());
    const replaced = supersedeCommand('decision-1', { file: ws.brainfilePath, text: 'Ship to Render', json: true }, new MemoryLogger());
    expect(replaced).toMatchObject({ superseded: ['decision-1'], decision: { id: 'decision-2', claimKey: 'deploy.target' } });
    expect(() => supersedeCommand('decision-1', { file: ws.brainfilePath, text: 'Again' }, new MemoryLogger())).toThrow(/already superseded/);
    expect(() => supersedeCommand(undefined, { file: ws.brainfilePath, text: 'x' }, new MemoryLogger())).toThrow(CLIError);
    expect(() => supersedeCommand('decision-2', { file: ws.brainfilePath, text: '' }, new MemoryLogger())).toThrow(CLIError);

    const logger = new MemoryLogger();
    const retired = retireCommand('decision-2', { file: ws.brainfilePath, as: 'Stale', note: 'Render shut down' }, logger);
    expect(retired.decision).toMatchObject({ id: 'decision-2', status: 'stale', path: '.brainfile/logs/decision-2.md' });
    expect(logger.getOutput()).toContain('Retired decision-2 as stale');
    expect(() => retireCommand('decision-2', { file: ws.brainfilePath, as: 'gone' }, new MemoryLogger())).toThrow(/--as must be rejected or stale/);
    expect(() => retireCommand('decision-9', { file: ws.brainfilePath, as: 'rejected' }, new MemoryLogger())).toThrow(/not found/);
    expect(() => retireCommand(undefined, { file: ws.brainfilePath, as: 'rejected' }, new MemoryLogger())).toThrow(CLIError);
    const json = new MemoryLogger();
    decideCommand({ file: ws.brainfilePath, claimKey: 'x.y', text: 'Maybe' }, new MemoryLogger());
    retireCommand('decision-3', { file: ws.brainfilePath, as: 'rejected', json: true }, json);
    expect(JSON.parse(json.getOutput()).decision.status).toBe('rejected');
  });
});

describe('search, index and check', () => {
  let ws: V2TestWorkspace;
  beforeEach(() => {
    ws = workspace();
    decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use axios for HTTP' }, new MemoryLogger());
    decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use undici for HTTP, never axios', stance: 'forbids', subject: 'axios' }, new MemoryLogger());
  });
  afterEach(() => {
    setSqliteLoaderForTesting(undefined);
    delete process.env.BRAINFILE_INDEX;
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  itIndex('searches the index: current first, history in its lane, docs with path and lines', () => {
    const logger = new MemoryLogger();
    const result = searchCommand({ file: ws.brainfilePath, query: 'http' }, logger);
    expect(result.mode).toBe('index');
    expect(result.results.map((r) => [r.id, r.lane])).toEqual(expect.arrayContaining([
      ['decision-2', 'current'], ['task-1', 'current'], ['README.md:1-5', 'current'], ['decision-1', 'history'],
    ]));
    const lanes = result.results.map((r) => r.lane);
    expect(lanes.indexOf('history')).toBeGreaterThan(lanes.lastIndexOf('current'));
    expect(result.results.find((r) => r.source === 'repo')).toMatchObject({ path: 'README.md', startLine: 1, endLine: 5 });
    expect(logger.getOutput()).toContain('History');
    expect(logger.getOutput()).toContain('README.md:1-5');

    const current = searchCommand({ file: ws.brainfilePath, query: 'http', history: false, limit: '1', json: true }, new MemoryLogger());
    expect(current.results.every((r) => r.lane === 'current')).toBe(true);
    expect(current.results).toHaveLength(1);
  });

  it('falls back to the scan without node:sqlite, in the same shape', () => {
    setSqliteLoaderForTesting(() => null);
    const json = new MemoryLogger();
    const result = searchCommand({ file: ws.brainfilePath, query: 'http', json: true }, json);
    expect(result.mode).toBe('scan');
    expect(result.results.map((r) => [r.id, r.lane])).toEqual([['decision-2', 'current'], ['task-1', 'current'], ['decision-1', 'history']]);
    expect(JSON.parse(json.getOutput())).toMatchObject({ success: true, mode: 'scan', count: 3 });
    expect(fs.existsSync(getIndexPath(ws.brainfilePath))).toBe(false);

    const idx = new MemoryLogger();
    expect(indexCommand({ file: ws.brainfilePath }, idx)).toMatchObject({ available: false, action: 'unavailable' });
    expect(idx.getOutput()).toContain('No local index');
  });

  itIndex('index refreshes, rebuilds and reports', () => {
    const logger = new MemoryLogger();
    expect(indexCommand({ file: ws.brainfilePath, status: true }, logger)).toMatchObject({ available: true, action: 'status' });
    expect(logger.getOutput()).toContain('No index yet');
    const refreshed = indexCommand({ file: ws.brainfilePath }, new MemoryLogger());
    expect(refreshed.refresh!.added).toBe(5);
    expect(refreshed.status!.files).toMatchObject({ board: 2, logs: 1, repo: 2 });
    const rebuilt = indexCommand({ file: ws.brainfilePath, rebuild: true, json: true }, new MemoryLogger());
    expect(rebuilt).toMatchObject({ action: 'rebuild', refresh: { added: 5 } });
    const human = new MemoryLogger();
    indexCommand({ file: ws.brainfilePath, status: true }, human);
    expect(human.getOutput()).toContain('Project docs');
  });

  it('BRAINFILE_INDEX=off reports the index as unavailable', () => {
    process.env.BRAINFILE_INDEX = 'off';
    const json = new MemoryLogger();
    expect(indexCommand({ file: ws.brainfilePath, json: true }, json).reason).toBe('BRAINFILE_INDEX is off');
    expect(JSON.parse(json.getOutput()).available).toBe(false);
  });

  it('checks actions, decisions and claim keys, with exit codes', () => {
    const blocked = new MemoryLogger();
    const result = checkCommand({ file: ws.brainfilePath, query: 'add axios for retries' }, blocked, false);
    expect(result).toMatchObject({ verdict: 'review', recommendation: 'block_action', exitCode: 2 });
    expect(blocked.getOutput()).toContain('Verdict: review');
    expect(blocked.getOutput()).toContain('Your action: adopt subject');

    const replacement = new MemoryLogger();
    expect(checkCommand({ file: ws.brainfilePath, query: 'decision-1' }, replacement, false)).toMatchObject({ verdict: 'use_replacement', exitCode: 3 });
    expect(replacement.getOutput()).toContain('Use instead: decision-2');

    expect(checkCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client' }, new MemoryLogger(), false)).toMatchObject({ verdict: 'use', exitCode: 0 });
    const none = new MemoryLogger();
    expect(checkCommand({ file: ws.brainfilePath, query: 'rename the logger' }, none, false)).toMatchObject({ verdict: 'no_decision', exitCode: 0 });
    expect(none.getOutput()).toContain('No decision on the board speaks to this');

    const prefix = new MemoryLogger();
    expect(checkCommand({ file: ws.brainfilePath, claimKeyPrefix: 'dependency', query: 'use axios' }, prefix, false)).toMatchObject({ claimKeyPrefix: 'dependency', verdict: 'review', exitCode: 2 });
    expect(prefix.getOutput()).toContain('dependency.http-client');

    const json = new MemoryLogger();
    checkCommand({ file: ws.brainfilePath, query: 'drop axios', json: true }, json, false);
    expect(JSON.parse(json.getOutput())).toMatchObject({ verdict: 'use', matchedBy: expect.any(String) });

    expect(() => checkCommand({ file: ws.brainfilePath }, new MemoryLogger(), false)).toThrow(/check needs an action/);
    expect(() => checkCommand({ file: ws.brainfilePath, claimKey: 'a', claimKeyPrefix: 'b' }, new MemoryLogger(), false)).toThrow(/not both/);

    const previous = process.exitCode;
    checkCommand({ file: ws.brainfilePath, query: 'add axios' }, new MemoryLogger());
    expect(process.exitCode).toBe(2);
    process.exitCode = previous;
  });
});

describe('MCP decide, supersede, check and search', () => {
  let ws: V2TestWorkspace;
  let server: FakeMcpServer;
  beforeEach(() => {
    ws = workspace();
    server = new FakeMcpServer();
    for (const register of [registerDecideTool, registerSupersedeTool, registerCheckTool, registerSearchTool]) {
      register(server as never, ws.brainfilePath);
    }
  });
  afterEach(() => fs.rmSync(ws.tempDir, { recursive: true, force: true }));

  it('decides and supersedes with structured output', async () => {
    const first = await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Use axios', stance: 'prefers', subject: 'axios' });
    expect(structured(first)).toMatchObject({ decision: { id: 'decision-1', status: 'current' }, familyWasEmpty: true });
    const second = await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Use undici', source: 'README.md', forWork: ['task-1'] });
    expect(mcpText(second)).toContain('Superseded decision-1');
    expect(structured(second).decision.sourcePath).toBe('README.md');
    const dup = await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Use undici' });
    expect(mcpText(dup)).toContain('Already current: decision-2');
    const bad = await server.handler('decide')({ claimKey: 'bad key', text: 'x' });
    expect(bad.isError).toBe(true);

    const replaced = await server.handler('supersede')({ taskId: 'decision-2', text: 'Use fetch' });
    expect(structured(replaced).superseded).toEqual(['decision-2']);
    const refused = await server.handler('supersede')({ taskId: 'decision-1', text: 'again' });
    expect(refused.isError).toBe(true);
    expect(mcpText(refused)).toContain('already superseded');
  });

  it('checks, refusing contradictory targets', async () => {
    await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Never axios', stance: 'forbids', subject: 'axios' });
    const result = await server.handler('check')({ query: 'switch to axios' });
    expect(structured(result)).toMatchObject({ verdict: 'review', recommendation: 'block_action', exitCode: 2 });
    const prefix = await server.handler('check')({ claimKeyPrefix: 'dependency' });
    expect(structured(prefix)).toMatchObject({ familyCount: 1, verdict: 'use', exitCode: 0 });
    expect((await server.handler('check')({})).isError).toBe(true);
    expect((await server.handler('check')({ claimKey: 'a', claimKeyPrefix: 'b' })).isError).toBe(true);
  });

  it('searches with lanes', async () => {
    await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Use axios for HTTP' });
    await server.handler('decide')({ claimKey: 'dependency.http-client', text: 'Use undici for HTTP' });
    const found = mcpJson<{ results: Array<{ id: string; lane: string; path: string }>; mode: string }>(await server.handler('search')({ query: 'http' }));
    expect(found.results.find((r) => r.id === 'decision-1')?.lane).toBe('history');
    expect(found.results.every((r) => typeof r.path === 'string')).toBe(true);
    const currentOnly = mcpJson<{ results: Array<{ lane: string }> }>(await server.handler('search')({ query: 'http', history: false, limit: 5 }));
    expect(currentOnly.results.every((r) => r.lane === 'current')).toBe(true);

  });
});
