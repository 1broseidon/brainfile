/**
 * The dock's sessions and the palette's recent documents (decision-8, task-46).
 * Pure functions; `npm test` in desktop/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropSession, handoffRun, keepRecent, keepSession, restingWord, type Session } from '../src/renderer/lib/sessions.ts';
import type { AgentRun, ReadyView } from '../src/shared/api.ts';

const chat = (id: string, projectId = 'a'): Session => ({ projectId, kind: 'chat', id });
const handoff = (id: string, projectId = 'a'): Session => ({ projectId, kind: 'handoff', id });

function run(extra: Partial<AgentRun>): AgentRun {
  return { id: 'r', projectId: 'a', agentId: 'codex', kind: 'dispatch', taskId: 'task-1', state: 'done', activity: 'working', startedAt: 0, ...extra };
}

test('a session is kept once, at the newest end', () => {
  let list = keepSession([], chat('t-1'));
  list = keepSession(list, handoff('task-1'));
  const same = keepSession(list, chat('t-1'));
  assert.equal(same, list, 'one already there keeps its place and the list');
  assert.deepEqual(list, [chat('t-1'), handoff('task-1')]);
  // A thread and a hand-off with the same ID are different sessions.
  assert.equal(keepSession(list, handoff('t-1')).length, 3);
});

test('each board keeps its own newest few; the oldest go first', () => {
  let list: Session[] = [chat('x', 'b')];
  for (let i = 1; i <= 4; i++) list = keepSession(list, chat(`t-${i}`), 3);
  assert.deepEqual(list, [chat('x', 'b'), chat('t-2'), chat('t-3'), chat('t-4')]);
});

test('× drops only that session', () => {
  const list = [chat('t-1'), handoff('t-1'), chat('t-1', 'b')];
  assert.deepEqual(dropSession(list, chat('t-1')), [handoff('t-1'), chat('t-1', 'b')]);
});

test('a document opened goes to the front, once, and the list is capped', () => {
  let list = keepRecent([], { projectId: 'a', id: 'task-1' });
  list = keepRecent(list, { projectId: 'b', id: 'task-1' });
  list = keepRecent(list, { projectId: 'a', id: 'task-1' });
  assert.deepEqual(list, [
    { projectId: 'a', id: 'task-1' },
    { projectId: 'b', id: 'task-1' },
  ]);
  for (let i = 2; i < 20; i++) list = keepRecent(list, { projectId: 'a', id: `task-${i}` }, 5);
  assert.equal(list.length, 5);
  assert.equal(list[0].id, 'task-19');
});

test("a hand-off's tab speaks for its live run, else its latest", () => {
  const runs = [
    run({ id: 'old', startedAt: 1, state: 'failed' }),
    run({ id: 'new', startedAt: 5, state: 'done' }),
    run({ id: 'other', taskId: 'task-2', startedAt: 9, state: 'working' }),
    run({ id: 'chat', kind: 'ask', taskId: 'task-1', startedAt: 9, state: 'working' }),
  ];
  assert.equal(handoffRun(runs, 'a', 'task-1')?.id, 'new');
  assert.equal(handoffRun([...runs, run({ id: 'live', startedAt: 3, state: 'waiting' })], 'a', 'task-1')?.id, 'live');
  assert.equal(handoffRun(runs, 'b', 'task-1'), undefined);
});

test('a resting tab says a reply waiting, or how its hand-off ended', () => {
  assert.deepEqual(restingWord(chat('t-1'), { unread: 't-1' }), { word: 'Reply waiting' });
  assert.equal(restingWord(chat('t-1'), { unread: 't-2' }), null);
  const ready: ReadyView = { taskId: 'task-1', into: 'main', ahead: 1, added: 3, removed: 1, conflicts: false };
  assert.deepEqual(restingWord(handoff('task-1'), { run: run({}), ready }), { word: 'Ready to merge' });
  assert.deepEqual(restingWord(handoff('task-1'), { ready: { ...ready, conflicts: true } }), { word: 'Conflicts', tone: 'warn' });
  assert.deepEqual(restingWord(handoff('task-1'), { run: run({}) }), { word: 'Done' });
  assert.deepEqual(restingWord(handoff('task-1'), { run: run({ state: 'failed' }) }), { word: 'Failed', tone: 'warn' });
  assert.deepEqual(restingWord(handoff('task-1'), { run: run({ state: 'stopped' }) }), { word: 'Stopped' });
  assert.equal(restingWord(handoff('task-1'), {}), null);
});
