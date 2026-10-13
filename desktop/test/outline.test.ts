/**
 * The list's outline (task-20): children stay under their parent across
 * columns. Pure functions, so plain `node --test` runs them (Node strips the
 * types); `npm test` in desktop/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childMap, childrenOf, outline, visibleRows, type OutlineRow } from '../src/renderer/lib/format.ts';
import type { ColumnView, TaskView } from '../src/shared/api.ts';

const columns: ColumnView[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
];

function doc(id: string, column: string, parentId?: string): TaskView {
  return { id, title: id, column, role: 'task', glyph: '', ...(parentId ? { parentId } : {}) };
}

const ids = (rows: OutlineRow[]) => rows.map((r) => `${'  '.repeat(r.depth)}${r.task.id}${r.done ? ' ✓' : ''}`);
const group = (o: ReturnType<typeof outline>, column: string) => o.groups.find((g) => g.column.id === column)!.rows;

test('a child sits under its parent in the parent’s group, whatever its own column', () => {
  const tasks = [
    doc('task-1', 'todo', 'epic-1'),
    doc('epic-1', 'in-progress'),
    doc('task-2', 'in-progress'),
    doc('spec-1', 'review', 'epic-1'),
    doc('plan-1', 'backlog', 'spec-1'),
  ];
  const o = outline(columns, tasks, []);
  assert.deepEqual(ids(group(o, 'in-progress')), ['epic-1', '  task-1', '  spec-1', '    plan-1', 'task-2']);
  // Not a second time in their own groups.
  assert.deepEqual(group(o, 'todo'), []);
  assert.deepEqual(group(o, 'review'), []);
  assert.deepEqual(group(o, 'backlog'), []);
  assert.equal(group(o, 'in-progress')[0].children, 2);
});

test('completed children stay under an open parent, ticked, after the open ones', () => {
  const tasks = [doc('epic-1', 'in-progress'), doc('task-1', 'review', 'epic-1')];
  const completed = [doc('task-3', 'todo', 'epic-1'), doc('task-9', 'todo'), doc('task-2', 'todo', 'epic-1')];
  const o = outline(columns, tasks, completed);
  assert.deepEqual(ids(group(o, 'in-progress')), ['epic-1', '  task-1', '  task-3 ✓', '  task-2 ✓']);
  assert.deepEqual(ids(o.done), ['task-9 ✓']);
});

test('once the parent is done its children go with it into Done', () => {
  const completed = [doc('epic-1', 'todo'), doc('task-1', 'todo', 'epic-1'), doc('task-2', 'todo', 'epic-1')];
  const o = outline(columns, [], completed);
  assert.deepEqual(ids(o.done), ['epic-1 ✓', '  task-1 ✓', '  task-2 ✓']);
});

test('an open child of a completed parent is a root in its own column', () => {
  const o = outline(columns, [doc('task-1', 'todo', 'epic-1')], [doc('epic-1', 'todo')]);
  assert.deepEqual(ids(group(o, 'todo')), ['task-1']);
  assert.deepEqual(ids(o.done), ['epic-1 ✓']);
});

test('a parentId cycle still shows every document, once', () => {
  const o = outline(columns, [doc('task-1', 'todo', 'task-2'), doc('task-2', 'review', 'task-1'), doc('task-3', 'todo', 'task-3')], []);
  const all = o.groups.flatMap((g) => g.rows).map((r) => r.task.id).sort();
  assert.deepEqual(all, ['task-1', 'task-2', 'task-3']);
});

test('a collapsed parent hides everything beneath it, and only that', () => {
  const o = outline(columns, [doc('epic-1', 'todo'), doc('spec-1', 'review', 'epic-1'), doc('task-1', 'todo', 'spec-1'), doc('task-2', 'todo')], []);
  assert.deepEqual(ids(visibleRows(group(o, 'todo'), (id) => id === 'epic-1')), ['epic-1', 'task-2']);
  assert.deepEqual(ids(visibleRows(group(o, 'todo'), (id) => id === 'spec-1')), ['epic-1', '  spec-1', 'task-2']);
});

test('a parent’s children and the task pane’s list run in the outline’s order', () => {
  const tasks = [doc('epic-1', 'in-progress'), doc('task-2', 'review', 'epic-1'), doc('task-1', 'todo', 'epic-1')];
  const completed = [doc('task-3', 'todo', 'epic-1')];
  const kids = childMap(columns, tasks, completed).get('epic-1')!;
  assert.deepEqual(kids.map((k) => [k.task.id, k.done]), [['task-1', false], ['task-2', false], ['task-3', true]]);
  assert.deepEqual(childrenOf('epic-1', columns, tasks, completed), kids);
  // An open child of a completed parent hangs under nothing in the outline, but its pane still lists it.
  assert.equal(childMap(columns, [doc('task-1', 'todo', 'epic-9')], [doc('epic-9', 'todo')]).get('epic-9'), undefined);
  assert.equal(childrenOf('epic-9', columns, [doc('task-1', 'todo', 'epic-9')], [doc('epic-9', 'todo')]).length, 1);
});
