/**
 * The calm list (task-43), after brainfile-mobile's board: one signal a
 * row, the groups nearest done first, the backlog and done resting folded,
 * and an open group at a glance. Pure functions; `npm test` in desktop/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calmOrder, glance, outline, restingSignal, restsFolded, rootsHeld, visibleRows, type OutlineRow } from '../src/renderer/lib/format.ts';
import type { ColumnView, TaskView } from '../src/shared/api.ts';

const columns: ColumnView[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done', completionColumn: true },
];

function doc(id: string, extra: Partial<TaskView> = {}): TaskView {
  return { id, title: id, column: 'todo', role: 'task', glyph: '', ...extra };
}

const signal = (task: TaskView, done = false, running = false) => restingSignal(task, done, running)?.kind ?? null;

test('the groups run nearest done first, the backlog and a completion column last', () => {
  const order = calmOrder(columns, columns.map((column) => ({ column }))).map((g) => g.column.id);
  assert.deepEqual(order, ['review', 'in-progress', 'todo', 'backlog', 'done']);
});

test('the backlog and a completion column rest folded; the columns of work do not', () => {
  assert.deepEqual(
    columns.filter(restsFolded).map((c) => c.id),
    ['backlog', 'done']
  );
  assert.equal(restsFolded({ id: 'someday', title: 'Someday' }), true);
});

test('a row says only its loudest signal', () => {
  const all = doc('t', {
    restsOnRetired: ['decision-1'],
    blockedOn: ['mobile:task-3'],
    contractStatus: 'delivered',
    priority: 'critical',
    subtasks: [
      { id: 's1', title: 'a', completed: true },
      { id: 's2', title: 'b', completed: false },
    ],
  });
  assert.equal(signal(all, false, true), 'run');
  assert.equal(signal(all), 'changed');
  assert.equal(signal({ ...all, restsOnRetired: [] }), 'blocked');
  assert.equal(signal({ ...all, restsOnRetired: [], blockedOn: [] }), 'contract');
  assert.equal(signal({ ...all, restsOnRetired: [], blockedOn: [], contractStatus: 'ready' }), 'priority');
  assert.equal(signal({ ...all, restsOnRetired: [], blockedOn: [], contractStatus: undefined, priority: 'medium' }), 'subtasks');
  assert.deepEqual(restingSignal({ ...all, restsOnRetired: [], blockedOn: [], contractStatus: undefined, priority: 'low' }, false), {
    kind: 'subtasks',
    count: '1/2',
  });
});

test('what only confirms things are fine says nothing', () => {
  assert.equal(signal(doc('a', { assignee: 'george', tags: ['x'], priority: 'medium' })), null);
  assert.equal(signal(doc('b', { contractStatus: 'ready' })), null);
  assert.equal(signal(doc('c', { contractStatus: 'in_progress' })), null);
  // An untouched checklist and a finished one wait for the task pane.
  assert.equal(signal(doc('d', { subtasks: [{ id: 's', title: 's', completed: false }] })), null);
  assert.equal(signal(doc('e', { subtasks: [{ id: 's', title: 's', completed: true }] })), null);
  // Done work has none, but an agent at work on it still says so.
  assert.equal(signal(doc('f', { priority: 'critical' }), true), null);
  assert.equal(signal(doc('g'), true, true), 'run');
});

const ids = (rows: OutlineRow[]) => rows.map((r) => `${'  '.repeat(r.depth)}${r.task.id}`);

test('a group shows three roots at a glance, each with everything under it', () => {
  const tasks = [
    doc('epic-1'),
    doc('task-1', { parentId: 'epic-1' }),
    doc('task-2', { parentId: 'epic-1' }),
    doc('task-3'),
    doc('task-4'),
    doc('task-5'),
    doc('task-6'),
  ];
  const rows = outline(columns, tasks, []).groups.find((g) => g.column.id === 'todo')!.rows;
  const { shown, more } = glance(rows);
  assert.deepEqual(ids(shown), ['epic-1', '  task-1', '  task-2', 'task-3', 'task-4']);
  assert.equal(more, 2);
});

test('one row left over is shown rather than said as `1 more`', () => {
  const rows = outline(columns, ['a', 'b', 'c', 'd'].map((id) => doc(id)), []).groups.find((g) => g.column.id === 'todo')!.rows;
  assert.deepEqual(glance(rows), { shown: rows, more: 0 });
});

test('a family is never cut: a leftover root with children is said as more', () => {
  const tasks = [doc('a'), doc('b'), doc('c'), doc('d'), doc('d1', { parentId: 'd' })];
  const rows = outline(columns, tasks, []).groups.find((g) => g.column.id === 'todo')!.rows;
  const { shown, more } = glance(rows);
  assert.deepEqual(ids(shown), ['a', 'b', 'c']);
  assert.equal(more, 2);
});

const todo = (tasks: ReturnType<typeof doc>[]) => outline(columns, tasks, []).groups.find((g) => g.column.id === 'todo')!.rows;

test('a task an agent is working stays past the glance, and its family stays with it', () => {
  const rows = todo([
    doc('a'),
    doc('b'),
    doc('c'),
    doc('d'),
    doc('d1', { parentId: 'd' }),
    doc('e'),
    doc('e1', { parentId: 'e' }),
    doc('e2', { parentId: 'e' }),
    doc('f'),
  ]);
  const { shown, more } = glance(rows, 3, rootsHeld(rows, new Set(['e1'])));
  assert.deepEqual(ids(shown), ['a', 'b', 'c', 'e', '  e1', '  e2']);
  assert.equal(more, 3);
});

test('the glance still holds for every row an agent is not working', () => {
  const rows = todo(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => doc(id)));
  const { shown, more } = glance(rows, 3, rootsHeld(rows, new Set(['e', 'g'])));
  assert.deepEqual(ids(shown), ['a', 'b', 'c', 'e', 'g']);
  assert.equal(more, 3);
});

test('a task already in the glance does not pull the rows past it', () => {
  const rows = todo(['a', 'b', 'c', 'd', 'e'].map((id) => doc(id)));
  const { shown, more } = glance(rows, 3, rootsHeld(rows, new Set(['b'])));
  assert.deepEqual(ids(shown), ['a', 'b', 'c']);
  assert.equal(more, 2);
});

test('one row left over is still shown when a later task is being worked', () => {
  const rows = todo(['a', 'b', 'c', 'd', 'e'].map((id) => doc(id)));
  assert.deepEqual(glance(rows, 3, rootsHeld(rows, new Set(['e']))), { shown: rows, more: 0 });
});

test('a collapsed child past the glance keeps its root in the drawn list', () => {
  const all = todo([...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => doc(id)), doc('f1', { parentId: 'f' })]);
  const visible = visibleRows(all, (id) => id === 'f');
  const { shown, more } = glance(visible, 3, rootsHeld(all, new Set(['f1'])));
  assert.deepEqual(ids(shown), ['a', 'b', 'c', 'f']);
  assert.equal(more, 2);
});
