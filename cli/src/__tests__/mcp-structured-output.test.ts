/**
 * MCP structured output, exercised against the REAL SDK server on BOTH
 * protocol eras.
 *
 * These assertions cannot be made with `FakeMcpServer`: it invokes captured
 * handler functions directly, so it never runs `outputSchema` validation, the
 * era-specific wire codec, or the `structuredContent` projection. Everything
 * here goes through `serveStdio` + `McpServer` over a real transport.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeTaskFile, type Task } from '@brainfile/core';
import { composeBody } from '../utils/v2-detect';
import { WireClient, type Era } from './helpers/mcp-wire';

const ERAS: Era[] = ['legacy', 'modern'];

const EXPECTED_TOOLS = [
  'brief',
  'contract',
  'get_task',
  'list_tasks',
  'search',
  'subtask',
  'task_add',
  'task_complete',
  'task_delete',
  'task_move',
  'task_patch',
];

/** A board with two tasks, one of which carries an extension field. */
function makeFixture(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-mcp-wire-'));
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  fs.writeFileSync(
    path.join(dotDir, 'brainfile.md'),
    `---
title: Wire Test Board
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
    completionColumn: true
---
`,
    'utf-8',
  );

  const taskOne: Task = {
    id: 'task-1',
    title: 'First wire task',
    column: 'todo',
    priority: 'high',
    tags: ['wire'],
    subtasks: [{ id: 'task-1.1', title: 'A subtask', completed: false }],
    // Extension field: must survive get_task's output validation.
    'x-otto': { owner: 'someone' },
  };
  writeTaskFile(path.join(boardDir, 'task-1.md'), taskOne, composeBody('First task body.'));

  const taskTwo: Task = { id: 'task-2', title: 'Second wire task', column: 'todo' };
  writeTaskFile(path.join(boardDir, 'task-2.md'), taskTwo, composeBody('Second task body.'));

  return path.join(dotDir, 'brainfile.md');
}

describe.each(ERAS)('mcp structured output (%s era)', (era) => {
  let client: WireClient;
  let brainfilePath: string;

  beforeAll(async () => {
    brainfilePath = makeFixture();
    client = await WireClient.open(brainfilePath, era);
  });

  afterAll(async () => {
    await client?.close();
  });

  // ── advertisement ────────────────────────────────────────────────────────

  test('advertises exactly the 11 consolidated tools', async () => {
    const names = (await client.listTools()).map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
  });

  test('every tool advertises an outputSchema', async () => {
    const tools = await client.listTools();
    const missing = tools.filter((t) => !t.outputSchema).map((t) => t.name);
    expect(missing).toEqual([]);
  });

  /**
   * The 2025-era codec re-wraps `structuredContent` as `{result: …}` whenever
   * the ADVERTISED schema root is not `type: "object"`, while the 2026-era
   * codec is identity — a non-object root would hand the two eras different
   * bytes. The SDK injects `type: "object"` for unions whose members are all
   * objects, so this holds for the discriminated-union tools too; a
   * non-object union member would break it.
   */
  test('every advertised outputSchema has an object root', async () => {
    const tools = await client.listTools();
    const nonObject = tools
      .filter((t) => t.outputSchema?.type !== 'object')
      .map((t) => `${t.name}:${JSON.stringify(t.outputSchema?.type)}`);
    expect(nonObject).toEqual([]);
  });

  test('get_task advertises an open schema so extension fields stay legal', async () => {
    const tools = await client.listTools();
    const getTask = tools.find((t) => t.name === 'get_task');
    expect(getTask?.outputSchema?.additionalProperties).not.toBe(false);
  });

  // ── structuredContent on success ─────────────────────────────────────────

  test('list_tasks returns structuredContent matching its text block', async () => {
    const result = await client.callTool('list_tasks', {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: 'task-1', title: 'First wire task', column: 'To Do' }),
      ]),
      count: 2,
    });
    // The text block is unchanged and still parses to the same payload, so
    // clients reading only `content` are unaffected.
    expect(JSON.parse(WireClient.text(result)!)).toEqual(result.structuredContent);
  });

  test('get_task passes output validation while carrying an extension field', async () => {
    const result = await client.callTool('get_task', { task: 'task-1' });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({ id: 'task-1', title: 'First wire task', column: 'todo' });
    expect(structured['x-otto']).toEqual({ owner: 'someone' });
  });

  test('search returns the matching union variant per input', async () => {
    const query = await client.callTool('search', { query: 'wire' });
    expect(query.structuredContent).toMatchObject({ count: expect.any(Number) });
    expect((query.structuredContent as any).results).toBeDefined();

    const recent = await client.callTool('search', { recent: true });
    expect((recent.structuredContent as any).logs).toBeDefined();

    const single = await client.callTool('search', { task: 'task-1' });
    expect(single.structuredContent).toMatchObject({ id: 'task-1', isLog: false });
  });

  test('task_move returns the batch shape even for a single task', async () => {
    const result = await client.callTool('task_move', { task: 'task-2', column: 'in-progress' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      success: true,
      successCount: 1,
      failureCount: 0,
      results: [{ taskId: 'task-2', success: true }],
    });
    // The single-task text stays prose, not JSON.
    expect(WireClient.text(result)).toContain('moved from');
  });

  test('task_patch returns the batch shape even for a single task', async () => {
    const result = await client.callTool('task_patch', { task: 'task-2', priority: 'low' });
    expect(result.structuredContent).toMatchObject({
      success: true,
      successCount: 1,
      results: [{ taskId: 'task-2', success: true }],
    });
  });

  test('subtask tags its payload with the action, disambiguating toggle from update', async () => {
    const toggled = await client.callTool('subtask', {
      action: 'toggle',
      task: 'task-1',
      subtask: 'task-1.1',
    });
    expect(toggled.structuredContent).toMatchObject({
      action: 'toggle',
      count: 1,
      updated: [{ id: 'task-1.1', completed: true }],
    });

    const updated = await client.callTool('subtask', {
      action: 'update',
      task: 'task-1',
      subtask: 'task-1.1',
      title: 'Renamed subtask',
    });
    // Same `updated` key, different item shape — only `action` tells them apart.
    expect(updated.structuredContent).toMatchObject({
      action: 'update',
      updated: [{ id: 'task-1.1', title: 'Renamed subtask' }],
    });
  });

  test('subtask emits the plural array shape even for a single item', async () => {
    const added = await client.callTool('subtask', {
      action: 'add',
      task: 'task-1',
      subtask: 'Just one',
    });
    expect(Array.isArray((added.structuredContent as any).added)).toBe(true);
    expect(added.structuredContent).toMatchObject({ action: 'add', count: 1 });
    // Text keeps its singular phrasing.
    expect(WireClient.text(added)).toContain('Subtask added:');
  });

  test('task_add returns the new id as structured data', async () => {
    const result = await client.callTool('task_add', { column: 'todo', title: 'Added by wire' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ title: 'Added by wire' });
    expect((result.structuredContent as any).id).toMatch(/^task-/);
  });

  test('contract round-trips the action discriminator across its branches', async () => {
    const attached = await client.callTool('contract', {
      action: 'attach',
      task: 'task-1',
      deliverables: ['file:src/thing.ts'],
      ready: true,
    });
    expect(attached.structuredContent).toMatchObject({ action: 'attach', task: 'task-1' });

    const pickedUp = await client.callTool('contract', { action: 'pickup', task: 'task-1' });
    expect(pickedUp.structuredContent).toMatchObject({ action: 'pickup', task: 'task-1' });
    // pickup's payload is free-text markdown; the schema carries it verbatim.
    expect(typeof (pickedUp.structuredContent as any).markdown).toBe('string');
    expect((pickedUp.structuredContent as any).markdown).toBe(WireClient.text(pickedUp));

    const validated = await client.callTool('contract', { action: 'validate', task: 'task-1' });
    expect(validated.structuredContent).toMatchObject({
      action: 'validate',
      ok: false, // the deliverable does not exist in the fixture
      status: 'failed',
    });
    expect(Array.isArray((validated.structuredContent as any).deliverables)).toBe(true);
  });

  test('task_complete returns completedAt as a real field, not just prose', async () => {
    const result = await client.callTool('task_complete', { task: 'task-2' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      destination: 'local',
      taskId: 'task-2',
      archived: false,
    });
    expect((result.structuredContent as any).completedAt).toEqual(expect.any(String));
  });

  test('task_delete returns a structured confirmation', async () => {
    await client.callTool('task_add', { column: 'todo', title: 'Doomed' });
    const listed = await client.callTool('list_tasks', {});
    const doomed = (listed.structuredContent as any).tasks.find((t: any) => t.title === 'Doomed');
    const result = await client.callTool('task_delete', { task: doomed.id });
    expect(result.structuredContent).toEqual({ id: doomed.id, deleted: true });
  });

  // ── error paths ──────────────────────────────────────────────────────────

  /**
   * `McpServer.validateToolOutput` returns early on `isError: true`, so error
   * results need neither `structuredContent` nor schema conformance. Pinning
   * the observed behaviour here catches a change in either direction.
   */
  test('an isError result is returned as-is, without output validation', async () => {
    const result = await client.callTool('get_task', { task: 'task-nope' });
    expect(result.isError).toBe(true);
    expect(WireClient.text(result)).toContain('Task not found: task-nope');
    expect(result.structuredContent).toBeUndefined();
  });

  test('brief returns a full orientation on first call, then a delta', async () => {
    // A per-era-unique agent: the brief checkpoint is per-agent state, and the
    // two eras get separate fixture dirs, so this cannot leak across eras.
    const agent = `wire-first-${era}`;

    const first = await client.callTool('brief', { agent });
    expect(first.isError).toBeFalsy();
    expect(first.structuredContent).toMatchObject({
      agent,
      mode: 'full',
      lastBriefAt: null,
      peek: false,
    });
    const lanes = (first.structuredContent as any).lanes;
    expect(Array.isArray(lanes)).toBe(true);
    // Full mode always orients, even when nothing is assigned to this agent.
    expect(lanes.map((l: any) => l.id)).toEqual(
      ['orientation', 'assigned', 'notes', 'completions'],
    );

    const second = await client.callTool('brief', { agent });
    expect(second.structuredContent).toMatchObject({
      mode: 'delta',
      lastBriefAt: (first.structuredContent as any).generatedAt,
    });
    expect((second.structuredContent as any).lanes.map((l: any) => l.id)).toEqual(
      ['notes', 'changes', 'completions', 'config'],
    );
  });

  test('brief --peek does not advance the stored checkpoint', async () => {
    const agent = `wire-peek-${era}`;

    const seed = await client.callTool('brief', { agent });
    const checkpoint = (seed.structuredContent as any).generatedAt;

    const peeked = await client.callTool('brief', { agent, peek: true });
    expect(peeked.structuredContent).toMatchObject({ peek: true, lastBriefAt: checkpoint });

    // A second peek still sees the same checkpoint: peek wrote nothing.
    const again = await client.callTool('brief', { agent, peek: true });
    expect(again.structuredContent).toMatchObject({ peek: true, lastBriefAt: checkpoint });
  });

  test('brief rejects a missing agent without tripping output validation', async () => {
    const result = await client.callTool('brief', { agent: '   ' });
    expect(result.isError).toBe(true);
    expect(WireClient.text(result) ?? '').not.toContain('Output validation error');
  });

  test('no success path trips the SDK output-validation guard', async () => {
    // Once a tool declares outputSchema, ANY non-error result lacking
    // structuredContent becomes an "Output validation error" isError result.
    // Sweep the read-only tools to prove none of them regressed.
    const calls: Array<[string, Record<string, unknown>]> = [
      ['list_tasks', {}],
      ['list_tasks', { column: 'todo' }],
      ['get_task', { task: 'task-1' }],
      ['search', { query: 'wire' }],
      ['search', { recent: true }],
      ['search', { task: 'task-1' }],
      // peek keeps this sweep side-effect-free against the shared fixture.
      ['brief', { agent: `wire-sweep-${era}`, peek: true }],
    ];
    for (const [name, args] of calls) {
      const result = await client.callTool(name, args);
      expect(WireClient.text(result) ?? '').not.toContain('Output validation error');
      expect(result.structuredContent).toBeDefined();
    }
  });

  test('the server keeps serving after an error result', async () => {
    await client.callTool('get_task', { task: 'still-not-there' });
    const names = (await client.listTools()).map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
  });
});

/**
 * The whole point of declaring object-rooted schemas: the 2025-era `{result:…}`
 * wrap must never fire, so both eras ship the same bytes.
 */
describe('mcp structured output is identical across protocol eras', () => {
  let legacy: WireClient;
  let modern: WireClient;

  beforeAll(async () => {
    // A fixture each: these calls mutate the board.
    legacy = await WireClient.open(makeFixture(), 'legacy');
    modern = await WireClient.open(makeFixture(), 'modern');
  });

  afterAll(async () => {
    await legacy?.close();
    await modern?.close();
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ['list_tasks', {}],
    ['get_task', { task: 'task-1' }],
    ['search', { query: 'wire' }],
    ['search', { recent: true }],
    ['search', { task: 'task-1' }],
    ['subtask', { action: 'toggle', task: 'task-1', all: true }],
    ['task_patch', { task: 'task-2', priority: 'low' }],
  ];

  test.each(cases)('%s returns identical structuredContent on both eras', async (name, args) => {
    const fromLegacy = await legacy.callTool(name, args);
    const fromModern = await modern.callTool(name, args);
    expect(fromLegacy.structuredContent).toEqual(fromModern.structuredContent);
    // And specifically: not wrapped in `{result: …}` on the legacy era.
    expect(Object.keys(fromLegacy.structuredContent as object)).not.toEqual(['result']);
  });
});
