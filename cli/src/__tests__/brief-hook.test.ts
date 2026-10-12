/**
 * spec-11: the brief as a session-start block, the SessionStart hook that
 * injects it, and the MCP brief tool.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { writeTaskFile } from '@brainfile/core';
import { decideCommand } from '../commands/decide';
import { briefCommand } from '../commands/brief';
import { sessionStartCommand } from '../commands/hooks';
import { hookAgent, hookCaller, readHookInput, runSessionStartHook, sessionStartOutput } from '../hooks/session-start';
import { MemoryLogger } from '../utils/logger';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { FakeMcpServer } from './helpers/mcp';
import { registerBriefTool } from '../mcp/tools/brief_tool';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const structured = (result: unknown): any => (result as { structuredContent?: unknown }).structuredContent;

function workspace(): V2TestWorkspace {
  const ws = createV2TestWorkspace('brainfile-brief-hook-');
  spawnSync('git', ['init', '-q'], { cwd: ws.tempDir });
  fs.writeFileSync(path.join(ws.tempDir, 'README.md'), '# Widget\n\n## HTTP\n\nEvery outbound request goes through one client with retries.\n');
  writeTaskFile(path.join(ws.boardDir, 'task-1.md'), { id: 'task-1', title: 'Build the HTTP retry layer', column: 'in-progress', assignee: 'claude' });
  return ws;
}

describe('brief and the SessionStart hook', () => {
  let ws: V2TestWorkspace;
  beforeEach(() => {
    ws = workspace();
    decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use undici for HTTP' }, new MemoryLogger());
  });
  afterEach(() => fs.rmSync(ws.tempDir, { recursive: true, force: true }));

  it('brief prints the block and keeps the checkpoint lanes in JSON', () => {
    const logger = new MemoryLogger();
    const result = briefCommand({ file: ws.brainfilePath, agent: 'claude', offline: true }, logger)!;
    expect(result.sections.map((s) => s.id)).toEqual(['warnings', 'decisions', 'tasks', 'changes', 'docs']);
    expect(result.lanes.map((l) => l.id)).toEqual(['orientation', 'assigned', 'notes', 'completions']);
    expect(logger.getOutput()).toContain('Current decisions');
    expect(logger.getOutput()).toContain('- task-1 Build the HTTP retry layer · In Progress');

    const tight = briefCommand({ file: ws.brainfilePath, agent: 'claude', offline: true, peek: true, maxChars: '120' }, new MemoryLogger())!;
    expect(tight.text.length).toBeLessThanOrEqual(120);
    expect(() => briefCommand({ file: ws.brainfilePath, agent: 'claude', offline: true, maxChars: '-3' }, new MemoryLogger())).toThrow(/--max-chars/);
  });

  it('names the caller and the agent', () => {
    expect(hookCaller({ hook_event_name: 'SessionStart' })).toBe('claude-code');
    expect(hookCaller({ hook_event_name: 'stop' })).toBe('cursor');
    expect(hookCaller({ clineVersion: '1', hookName: 'TaskStart' })).toBe('cline');
    expect(hookCaller({})).toBe('unknown');
    expect(hookCaller(null)).toBe('unknown');
    expect(hookAgent('claude-code', {})).toBe('claude');
    expect(hookAgent('claude-code', { BRAINFILE_AGENT: 'pork-chop' })).toBe('pork-chop');
    expect(hookAgent('cline', {})).toBe('cline');
    expect(hookAgent('cursor', {})).toBe('cursor');
    expect(hookAgent('unknown', { CODEX_THREAD_ID: 'x' })).toBe('codex');
    expect(hookAgent('unknown', { GEMINI_CLI: '1' })).toBe('gemini');
    expect(hookAgent('unknown', { CLAUDECODE: '1' })).toBe('claude');
    expect(hookAgent('unknown', {})).toBe('agent');
  });

  it('injects the brief for Claude Code as additionalContext, and plain text otherwise', () => {
    const claude = JSON.parse(sessionStartOutput({ hook_event_name: 'SessionStart', cwd: ws.tempDir }, {})!);
    expect(claude.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(claude.hookSpecificOutput.additionalContext).toContain('Brainfile brief for claude · Test Board (first brief)');
    expect(claude.hookSpecificOutput.additionalContext).toContain('dependency.http-client: Use undici for HTTP');
    expect(fs.existsSync(path.join(ws.dotDir, 'state', 'claude.json'))).toBe(true);

    const plain = sessionStartOutput({ cwd: ws.tempDir }, { BRAINFILE_AGENT: 'codex', BRAINFILE_BRIEF_MAX_CHARS: '90' })!;
    expect(plain.startsWith('Brainfile brief for codex')).toBe(true);
    expect(plain.length).toBeLessThanOrEqual(90);

    expect(sessionStartOutput({ hook_event_name: 'stop', cwd: ws.tempDir }, {})).toContain('Remember to update task status');
    const nowhere = fs.mkdtempSync(path.join(path.dirname(ws.tempDir), 'no-board-'));
    spawnSync('git', ['init', '-q'], { cwd: nowhere });
    expect(sessionStartOutput({ cwd: nowhere }, {})).toBeNull();
    fs.rmSync(nowhere, { recursive: true, force: true });
  });

  it('reads hook input from a stream, a terminal, or not at all', async () => {
    const stream = new PassThrough();
    const pending = readHookInput(stream);
    stream.end(JSON.stringify({ hook_event_name: 'SessionStart' }));
    await expect(pending).resolves.toEqual({ hook_event_name: 'SessionStart' });

    const junk = new PassThrough();
    const junkPending = readHookInput(junk);
    junk.end('not json');
    await expect(junkPending).resolves.toEqual({});

    await expect(readHookInput(Object.assign(new PassThrough(), { isTTY: true }))).resolves.toEqual({});
    await expect(readHookInput(new PassThrough(), 10)).resolves.toEqual({});
  });

  it('runs the whole hook, and the command delegates to it', async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const run = runSessionStartHook(input, (t) => written.push(t), { BRAINFILE_AGENT: 'gemini' });
    input.end(JSON.stringify({ cwd: ws.tempDir }));
    await run;
    expect(written.join('')).toContain('Brainfile brief for gemini');

    const logger = new MemoryLogger();
    const stdin = new PassThrough();
    const done = sessionStartCommand(logger, stdin as unknown as NodeJS.ReadStream);
    stdin.end(JSON.stringify({ hook_event_name: 'SessionStart', cwd: ws.tempDir }));
    await done;
    expect(JSON.parse(logger.getOutput()).hookSpecificOutput.additionalContext).toContain('Brainfile brief for');
  });
});

describe('MCP brief', () => {
  let ws: V2TestWorkspace;
  afterEach(() => fs.rmSync(ws.tempDir, { recursive: true, force: true }));

  it('returns the block as text and its sections', async () => {
    ws = workspace();
    decideCommand({ file: ws.brainfilePath, claimKey: 'dependency.http-client', text: 'Use undici for HTTP' }, new MemoryLogger());
    const server = new FakeMcpServer();
    registerBriefTool(server as never, ws.brainfilePath);
    const brief = await server.handler('brief')({ agent: 'claude', peek: true, offline: true, maxChars: 0 });
    const output = structured(brief);
    expect(output.sections.map((s: { id: string }) => s.id)).toEqual(['warnings', 'decisions', 'tasks', 'changes', 'docs']);
    expect(output.text).toContain('dependency.http-client: Use undici for HTTP');
    expect(output.truncated).toBe(false);
    expect(output.lanes.map((l: { id: string }) => l.id)).toEqual(['orientation', 'assigned', 'notes', 'completions']);
    const tight = structured(await server.handler('brief')({ agent: 'claude', peek: true, offline: true, maxChars: 100 }));
    expect(tight.text.length).toBeLessThanOrEqual(100);
  });
});
