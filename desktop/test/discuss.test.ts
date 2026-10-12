/**
 * Discuss (task-35): the task as the agent first sees it, read from a scratch
 * board; the preamble that keeps it to the spec; what a discussion allows,
 * refuses or asks about; and the mode it runs in, never the bypass one.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discussContext, discussMode, discussPermission, discussPreamble } from '../src/agents/discuss.ts';
import type { AgentModes } from '../src/shared/api.ts';

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n';

const DOCS: Record<string, string> = {
  'board/epic-1.md': '---\nid: epic-1\ntype: epic\ntitle: Dispatch\ncolumn: todo\n---\n',
  'board/decision-1.md': '---\nid: decision-1\ntype: decision\ntitle: Each hand-off works in its own worktree\ncolumn: todo\nstatus: current\n---\n',
  'board/task-7.md': [
    '---',
    'id: task-7',
    'title: Talk it over first',
    'column: todo',
    'parentId: epic-1',
    'decisions:',
    '  - decision-1',
    '  - decision-9',
    'relatedFiles:',
    '  - desktop/src/agents/agents.ts',
    'subtasks:',
    '  - id: task-7-1',
    '    title: A key',
    '    completed: true',
    '  - id: task-7-2',
    '    title: Tests',
    '    completed: false',
    'contract:',
    '  status: ready',
    '  deliverables:',
    '    - type: file',
    '      path: desktop/src/agents/discuss.ts',
    '      description: the rules',
    '  constraints:',
    '    - no code from the discussion',
    '---',
    '',
    '## Description',
    'A Discuss key beside Hand to.',
    '',
  ].join('\n'),
};

let base: string;
let brainfilePath: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-discuss-')));
  const dotDir = path.join(base, '.brainfile');
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
  brainfilePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(brainfilePath, CONFIG);
  for (const [rel, content] of Object.entries(DOCS)) fs.writeFileSync(path.join(dotDir, rel), content);
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('the context carries the task, its parent, its decisions, its contract and the files it names', () => {
  const ctx = discussContext(brainfilePath, 'task-7', 'Standing decisions on this board:\n- decision-1');
  assert.equal(ctx.id, 'task-7');
  assert.equal(ctx.title, 'Talk it over first');
  assert.equal(ctx.column, 'To Do');
  assert.match(ctx.body, /A Discuss key beside Hand to\./);
  assert.deepEqual(ctx.parent, { id: 'epic-1', title: 'Dispatch', type: 'epic' });
  // A decision that cannot be found is still named.
  assert.deepEqual(ctx.decisions, ['decision-1: Each hand-off works in its own worktree', 'decision-9']);
  assert.deepEqual(ctx.subtasks, [
    { title: 'A key', completed: true },
    { title: 'Tests', completed: false },
  ]);
  assert.deepEqual(ctx.contract, { status: 'ready', lines: ['file desktop/src/agents/discuss.ts: the rules', 'constraint: no code from the discussion'] });
  assert.deepEqual(ctx.relatedFiles, ['desktop/src/agents/agents.ts']);
  assert.match(ctx.standing, /decision-1/);
});

test('a task that is not on the board says so', () => {
  assert.throws(() => discussContext(brainfilePath, 'task-99'), /task-99 not found/);
});

test('the preamble loads the task and keeps the agent to its spec', () => {
  const text = discussPreamble(discussContext(brainfilePath, 'task-7'));
  assert.match(text, /task-7, "Talk it over first", in To Do/);
  assert.match(text, /Its parent: epic-1 \(epic\), "Dispatch"/);
  assert.match(text, /- \[x\] A key\n- \[ \] Tests/);
  assert.match(text, /Contract \(status ready\):\n- file desktop\/src\/agents\/discuss\.ts: the rules/);
  assert.match(text, /- decision-1: Each hand-off works in its own worktree/);
  assert.match(text, /The code it touches: desktop\/src\/agents\/agents\.ts\./);
  // With the person's agreement, the spec only; no code, no hand-off; what was agreed is noted.
  assert.match(text, /only with the person's agreement/);
  assert.match(text, /Do not write or edit code/);
  assert.match(text, /do not hand the task off/);
  assert.match(text, /brainfile note tool/);
});

test('a discussion may read the board and change the task\'s spec, and nothing else on the board', () => {
  for (const title of ['mcp__brainfile__get_task', 'brainfile_list_tasks', 'mcp.brainfile.search', 'mcp__brainfile__task_patch', 'mcp__brainfile__subtask', 'mcp__brainfile__contract', 'mcp__brainfile__note']) {
    assert.equal(discussPermission(title, 'other'), 'allow', title);
  }
  for (const title of ['mcp__brainfile__task_move', 'mcp__brainfile__task_complete', 'mcp__brainfile__task_delete', 'mcp__brainfile__task_add', 'mcp__brainfile__decide', 'brainfile_sync']) {
    assert.equal(discussPermission(title, 'other'), 'refuse', title);
  }
});

test('a discussion refuses edits, commands and mode changes, and asks about reading as usual', () => {
  assert.equal(discussPermission('Write desktop/src/x.ts', 'edit'), 'refuse');
  assert.equal(discussPermission('rm -rf build', 'execute'), 'refuse');
  assert.equal(discussPermission('Delete notes.md', 'delete'), 'refuse');
  assert.equal(discussPermission('Ready to code?', 'switch_mode'), 'refuse');
  assert.equal(discussPermission('Read ../secrets.txt', 'read'), 'usual');
  assert.equal(discussPermission('Fetch https://example.com', 'fetch'), 'usual');
  assert.equal(discussPermission('Something', undefined), 'usual');
  // The desk is not a board tool: a discussion has none, and one asked for is not let through as the board's.
  assert.equal(discussPermission('mcp__desk__dispatch', 'other'), 'usual');
});

const claude: AgentModes = {
  initial: 'default',
  options: [
    { id: 'default', name: 'Default' },
    { id: 'acceptEdits', name: 'Accept Edits' },
    { id: 'plan', name: 'Plan Mode' },
    { id: 'bypassPermissions', name: 'Bypass Permissions' },
  ],
  bypass: 'bypassPermissions',
};
const codex: AgentModes = {
  initial: 'auto',
  options: [
    { id: 'read-only', name: 'Read Only' },
    { id: 'auto', name: 'Default' },
    { id: 'full-access', name: 'Full Access' },
  ],
  bypass: 'full-access',
};

test('a discussion runs read-only when the agent can, else in its own default, never in the bypass mode', () => {
  assert.equal(discussMode(codex), 'read-only');
  assert.equal(discussMode(claude), 'default');
  assert.equal(discussMode({ ...claude, initial: 'bypassPermissions' }), 'default');
  assert.equal(discussMode({ initial: 'yolo', options: [{ id: 'yolo', name: 'YOLO' }], bypass: 'yolo' }), 'yolo');
});
