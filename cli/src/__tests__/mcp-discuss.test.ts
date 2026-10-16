/**
 * The discuss prompt and tool (task-79, decision-19), over the real server:
 * any MCP client is a chat, so `brainfile mcp` hands it one task as the board
 * has it and the rules of a discussion, as a prompt and, for a client without
 * prompts, as a tool with the same text.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WireClient } from './helpers/mcp-wire';

const ENV = ['BRAINFILE_DATA_DIR', 'BRAINFILE_WORKTREES'];

describe('discuss over MCP', () => {
  const saved: Record<string, string | undefined> = {};
  let base: string;
  let brainfilePath: string;
  let client: WireClient;

  beforeAll(async () => {
    for (const key of ENV) saved[key] = process.env[key];
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-mcp-discuss-')));
    Object.assign(process.env, { BRAINFILE_DATA_DIR: path.join(base, 'data'), BRAINFILE_WORKTREES: path.join(base, 'worktrees') });
    const dotDir = path.join(base, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, '---\ntitle: Discuss\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n');
    fs.writeFileSync(
      path.join(dotDir, 'board', 'task-1.md'),
      '---\nid: task-1\ntitle: Talk it over\ncolumn: todo\nsubtasks:\n  - id: task-1-1\n    title: A key\n    completed: false\n---\n\n## Description\nA Discuss key beside Hand to.\n',
    );
    client = await WireClient.open(brainfilePath, 'modern');
  });

  afterAll(async () => {
    await client?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('the server lists a discuss prompt that takes a task id', async () => {
    const listed = await client.request('prompts/list', {});
    const discuss = (listed.prompts as Array<{ name: string; arguments?: Array<{ name: string; required?: boolean }> }>).find((p) => p.name === 'discuss');
    expect(discuss).toBeDefined();
    expect(discuss!.arguments).toEqual([expect.objectContaining({ name: 'taskId', required: true })]);
  });

  test('the prompt gives the task as data, its work, the rules and how to begin', async () => {
    const got = await client.request('prompts/get', { name: 'discuss', arguments: { taskId: 'task-1' } });
    const messages = got.messages as Array<{ role: string; content: { type: string; text: string } }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const text = messages[0].content.text;
    expect(text).toMatch(/^<task-information id="task-1" as-of="[^"]+ UTC">\ntask-1 · Talk it over\nStage: To Do \(To Do → Review\)\./);
    expect(text).toContain('<description>\nA Discuss key beside Hand to.\n</description>');
    expect(text).toContain('<subtasks>\n- [ ] A key\n</subtasks>');
    // Not a repository and nothing running: no branch, no agent on it.
    expect(text).toContain('<work>\nNo branch or worktree: it has not been handed off to one.');
    expect(text).toContain('No agent is working on it now.\n</work>\n</task-information>');
    // The rules, as a session outside the window keeps them.
    expect(text).toContain("With the person's yes, you may change this task's description (the brainfile task_patch tool), its subtasks (subtask) and its contract (contract).");
    expect(text).toContain('Run check on it first');
    expect(text).toContain('brainfile note tool');
    expect(text).toContain('When you change the board, say in a line what you changed.');
    expect(text).not.toContain('the window shows them');
    expect(text).toMatch(/Begin with where task-1 stands, in a line or two, and ask the person what they want to talk over\.$/);
  });

  test('the discuss tool returns the same text, for a client without prompts', async () => {
    const prompt = await client.request('prompts/get', { name: 'discuss', arguments: { taskId: 'task-1' } });
    const result = await client.callTool('discuss', { taskId: 'task-1' });
    expect(result.isError).toBeFalsy();
    const strip = (t: string) => t.replace(/as-of="[^"]+"/, '');
    expect(strip(WireClient.text(result)!)).toBe(strip(prompt.messages[0].content.text));
    expect(result.structuredContent).toEqual({ task: 'task-1', text: WireClient.text(result) });
  });

  test('a task that is not on the board is an error', async () => {
    const result = await client.callTool('discuss', { taskId: 'task-99' });
    expect(result.isError).toBe(true);
    expect(WireClient.text(result)).toMatch(/task-99 not found/);
    await expect(client.request('prompts/get', { name: 'discuss', arguments: { taskId: 'task-99' } })).rejects.toThrow(/task-99 not found/);
  });

  test('a discussion\'s own server lists it too: it only reads', async () => {
    const opened = await WireClient.open(brainfilePath, 'modern', { role: 'discuss' });
    try {
      expect((await opened.listTools()).map((t) => t.name)).toContain('discuss');
    } finally {
      await opened.close();
    }
  });
});
