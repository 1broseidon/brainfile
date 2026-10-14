/**
 * Discuss (task-35): the task as the agent first sees it, read from a scratch
 * board and written as a block it need not look up; the rules that keep it to
 * the spec and the board's decisions; what a discussion allows, refuses or
 * asks about; and the mode it runs in, never the bypass one.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discussContext, discussMode, discussPermission, discussPreamble, discussRules, taskInformation, workInformation, type DiscussWork } from '../src/agents/discuss.ts';
import type { AgentModes } from '../src/shared/api.ts';

const CONFIG = '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n';
const AT = new Date('2026-10-13T17:40:12Z');

const DOCS: Record<string, string> = {
  'board/epic-1.md': '---\nid: epic-1\ntype: epic\ntitle: Dispatch\ncolumn: todo\n---\n',
  'board/decision-1.md': [
    '---',
    'id: decision-1',
    'type: decision',
    'title: Each hand-off works in its own worktree',
    'status: current',
    'claimKey: dispatch.worktree',
    'stance: requires',
    'subject: git worktree per dispatch',
    'recheck: When two boards share a repository',
    '---',
    '',
    '## Description',
    'Each hand-off works in its own worktree',
    '',
    'So two agents never edit the same checkout.',
    '',
  ].join('\n'),
  'board/decision-2.md': '---\nid: decision-2\ntype: decision\ntitle: Notes are one line\nstatus: current\nclaimKey: board.notes\n---\n',
  'logs/decision-0.md': '---\nid: decision-0\ntype: decision\ntitle: Hand-offs share the checkout\nstatus: superseded\nsupersededBy: decision-1\n---\n',
  'logs/task-3.md': '---\nid: task-3\ntitle: Done already\ncolumn: todo\n---\n\n## Description\nIt shipped.\n',
  'board/task-7.md': [
    '---',
    'id: task-7',
    'title: Talk it over first',
    'column: review',
    'priority: high',
    'assignee: codex',
    'tags:',
    '  - desktop',
    '  - chat',
    'parentId: epic-1',
    'decisions:',
    '  - decision-1',
    '  - decision-0',
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
    '## Log',
    ...Array.from({ length: 12 }, (_, i) => `- 2026-10-13T1${Math.floor(i / 6)}:${String((i % 6) * 10).padStart(2, '0')}:00.000Z: [claude] Note ${i + 1}`),
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

test('the context carries the task, where it is, its parent, its decisions in full, its contract, its files and its latest notes', () => {
  const ctx = discussContext(brainfilePath, 'task-7', AT);
  assert.equal(ctx.id, 'task-7');
  assert.equal(ctx.title, 'Talk it over first');
  assert.equal(ctx.column, 'Review');
  assert.deepEqual(ctx.columns, ['To Do', 'Review']);
  assert.equal(ctx.done, false);
  assert.equal(ctx.priority, 'high');
  assert.equal(ctx.assignee, 'codex');
  assert.deepEqual(ctx.tags, ['desktop', 'chat']);
  // The description without the log.
  assert.equal(ctx.description, 'A Discuss key beside Hand to.');
  assert.deepEqual(ctx.parent, { id: 'epic-1', title: 'Dispatch', type: 'epic' });
  const [current, superseded, missing] = ctx.decisions;
  assert.deepEqual(
    { ...current },
    {
      id: 'decision-1',
      title: 'Each hand-off works in its own worktree',
      claimKey: 'dispatch.worktree',
      status: 'current',
      supersededBy: undefined,
      stance: 'requires',
      subject: 'git worktree per dispatch',
      holdsWhile: undefined,
      recheck: 'When two boards share a repository',
      // Without the title its body repeats.
      text: 'So two agents never edit the same checkout.',
    },
  );
  assert.equal(superseded.status, 'superseded');
  assert.equal(superseded.supersededBy, 'decision-1');
  // A decision that cannot be found is still named.
  assert.deepEqual(missing, { id: 'decision-9', title: 'decision-9' });
  assert.deepEqual(ctx.subtasks, [
    { title: 'A key', completed: true },
    { title: 'Tests', completed: false },
  ]);
  assert.deepEqual(ctx.contract, { status: 'ready', lines: ['file desktop/src/agents/discuss.ts: the rules', 'constraint: no code from the discussion'] });
  assert.deepEqual(ctx.relatedFiles, ['desktop/src/agents/agents.ts']);
  // The last ten notes, oldest first; the two before are counted.
  assert.equal(ctx.notes.length, 10);
  assert.equal(ctx.earlierNotes, 2);
  assert.deepEqual(ctx.notes[0], { at: '2026-10-13T10:20:00.000Z', agent: 'claude', text: 'Note 3' });
  assert.equal(ctx.notes[9].text, 'Note 12');
  // The board's other current decisions, not the ones it rests on.
  assert.deepEqual(ctx.standing, ['decision-2 [board.notes] Notes are one line']);
  assert.equal(ctx.asOf, AT);
});

test('a done task is read from logs/ and says so', () => {
  const ctx = discussContext(brainfilePath, 'task-3', AT);
  assert.equal(ctx.done, true);
  assert.equal(ctx.column, undefined);
  assert.match(taskInformation(ctx), /Stage: done \(completed, in logs\/\)\./);
});

test('a task that is not on the board says so', () => {
  assert.throws(() => discussContext(brainfilePath, 'task-99'), /task-99 not found/);
});

test('the task goes to the agent as a block of data it need not look up', () => {
  const text = taskInformation(discussContext(brainfilePath, 'task-7', AT));
  assert.match(text, /^<task-information id="task-7" as-of="2026-10-13 17:40 UTC">\ntask-7 · Talk it over first\n/);
  assert.match(text, /\nStage: Review \(To Do → Review\)\.\ntask · priority high · assigned to codex · tags desktop, chat\n/);
  assert.match(text, /\nParent: epic-1 \(epic\) · Dispatch\n/);
  // Nothing is missing here, so nothing is said to be.
  assert.doesNotMatch(text, /\nNo /);
  assert.match(text, /<description>\nA Discuss key beside Hand to\.\n<\/description>/);
  assert.match(text, /<subtasks>\n- \[x\] A key\n- \[ \] Tests\n<\/subtasks>/);
  assert.match(text, /<contract status="ready">\n- file desktop\/src\/agents\/discuss\.ts: the rules\n- constraint: no code from the discussion\n<\/contract>/);
  assert.match(text, /<files>desktop\/src\/agents\/agents\.ts<\/files>/);
  assert.match(
    text,
    /<decisions>\ndecision-1 \[dispatch\.worktree\] current · requires: git worktree per dispatch\n  Each hand-off works in its own worktree\n  So two agents never edit the same checkout\.\n  Recheck: When two boards share a repository\n/,
  );
  assert.match(text, /\ndecision-0 superseded by decision-1\n  Hand-offs share the checkout\n/);
  assert.match(text, /\ndecision-9 \(not found on the board\)\n<\/decisions>/);
  assert.match(text, /<log newest="last">\n\(2 earlier notes: the brainfile log tool\)\n2026-10-13 10:20 UTC claude: Note 3\n/);
  assert.match(text, /2026-10-13 11:50 UTC claude: Note 12\n<\/log>/);
  assert.match(text, /<board-decisions>\ndecision-2 \[board\.notes\] Notes are one line\n<\/board-decisions>\n<\/task-information>$/);
});

test('a bare task says what it lacks rather than leaving the agent to look', () => {
  const text = taskInformation(discussContext(brainfilePath, 'task-3', AT));
  assert.match(text, /\nNo parent, subtasks, contract, decisions or files\.\n/);
  assert.doesNotMatch(text, /<log|<subtasks>|<decisions>/);
});

test('the rules hold at any stage and keep the agent to the spec and the decisions', () => {
  const text = discussPreamble(discussContext(brainfilePath, 'task-7', AT));
  // Data first, then the rules; the person's own words follow.
  assert.ok(text.indexOf('</task-information>') < text.indexOf('<discussion-rules>'));
  assert.match(text, /<\/discussion-rules>\n\n$/);
  assert.doesNotMatch(text, /before it is handed off to a coding agent/);
  assert.match(text, /wherever it is in its life/);
  assert.match(text, /need not look the task up again/);
  // With the person's yes, the spec only; no code, no hand-off; what was agreed is noted.
  assert.match(text, /With the person's yes, you may change this task's description/);
  assert.match(text, /Do not write or edit code/);
  assert.match(text, /hand the task off: the person does that/);
  assert.match(text, /brainfile note tool/);
  // A decision the person settles is checked, shown, agreed, then recorded with the task resting on it.
  assert.match(text, /Run check on it first/);
  assert.match(text, /claim key, title and text, and which decision it replaces or retires, and wait for a yes/);
  assert.match(text, /with task-7 in forWork/);
  assert.match(text, /read it again with get_task/);
});

test('a discussion may read the board, change the task\'s spec and record decisions, and nothing else on the board', () => {
  for (const title of ['mcp__brainfile__get_task', 'brainfile_list_tasks', 'mcp.brainfile.search', 'mcp__brainfile__task_patch', 'mcp__brainfile__subtask', 'mcp__brainfile__contract', 'mcp__brainfile__note', 'mcp__brainfile__decide', 'brainfile_supersede', 'mcp.brainfile.retire']) {
    assert.equal(discussPermission(title, 'other'), 'allow', title);
  }
  for (const title of ['mcp__brainfile__task_move', 'mcp__brainfile__task_complete', 'mcp__brainfile__task_delete', 'mcp__brainfile__task_add', 'mcp__brainfile__adr_promote', 'brainfile_sync']) {
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

const REVIEW: DiscussWork = {
  review: {
    branch: 'dispatch/task-7',
    path: '/tmp/wt/task-7',
    base: 'main',
    into: 'main',
    ahead: 14,
    commits: Array.from({ length: 12 }, (_, i) => ({ sha: `abc${i}`, subject: `Step ${14 - i}` })),
    files: [{ path: 'desktop/src/agents/discuss.ts', added: 40, removed: 3 }],
    filesChanged: 1,
    added: 40,
    removed: 3,
    uncommitted: 2,
    merged: false,
  },
  uncommittedFiles: ['desktop/test/discuss.test.ts', 'notes.md'],
};

test('in review, the block says where the code is: branch, worktree, commits, files and what is uncommitted', () => {
  const ctx = { ...discussContext(brainfilePath, 'task-7', AT), work: REVIEW };
  const text = taskInformation(ctx);
  assert.match(text, /<work branch="dispatch\/task-7" worktree="\/tmp\/wt\/task-7">\nStarted from main; 14 commits ahead, 1 file changed \(\+40 −3\)\. Not merged into main\.\n/);
  assert.match(text, /Commits, newest first:\n- abc0 Step 14\n/);
  assert.match(text, /- abc11 Step 3\n- and 2 more\n/);
  assert.match(text, /Files changed on the branch:\n- desktop\/src\/agents\/discuss\.ts \+40 −3\n/);
  assert.match(text, /Not committed in the worktree \(2\): desktop\/test\/discuss\.test\.ts, notes\.md\.\nNo agent is working on it now\.\n<\/work>\n<\/task-information>$/);
  // The rules send it to the worktree, not the main checkout.
  const rules = discussRules(ctx);
  assert.match(rules, /on the branch dispatch\/task-7, in the worktree at \/tmp\/wt\/task-7, not in the main checkout/);
  assert.match(rules, /A merge takes only what is committed/);
  assert.match(rules, /and the worktree's files again/);
});

test('the block says when an agent is on the task now, and when there is no branch', () => {
  const live = workInformation({ ...REVIEW, working: { agent: 'Codex', state: 'working', model: 'gpt-5', effort: 'high' } });
  assert.match(live, /\nCodex \(gpt-5, high\) is working on it now \(working\): its worktree may change while you talk\.\n<\/work>$/);
  const merged = workInformation({ review: { ...REVIEW.review!, uncommitted: 0, merged: true }, uncommittedFiles: [] });
  assert.match(merged, /Already merged into main\.\n/);
  assert.match(merged, /\nNothing uncommitted in the worktree\.\n/);
  const none = { ...discussContext(brainfilePath, 'task-7', AT), work: { review: null, uncommittedFiles: [] } };
  assert.match(taskInformation(none), /<work>\nNo branch or worktree: it has not been handed off to one\. Its code, if any, is in the main checkout\.\nNo agent is working on it now\.\n<\/work>/);
  assert.doesNotMatch(discussRules(none), /not in the main checkout/);
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
