/**
 * The window's words for where a board lives (spec-15): the two-boards line
 * and the health notes. Pure, so plain `node --test` runs it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrityView } from '../src/host/integrity.ts';

const sighting = (kind: string, label: string, docs: number, extra: Record<string, unknown> = {}) =>
  ({ kind, ref: kind === 'folder' ? '/w/app/.brainfile' : 'refs/brainfile/remotes/origin/board', label, docs, lastChange: null, ...extra }) as never;

const quiet = { boards: [], conflict: null, lineage: null, strayWorktrees: [], outsideHome: null, trackedTwice: null };

test('nothing to say when the board is the only one, in its place', () => {
  assert.deepEqual(integrityView(quiet as never), { twoBoards: null, notes: [], short: null });
});

test("runprism.ai: origin's has everything, so using it loses nothing", () => {
  const view = integrityView({
    ...quiet,
    conflict: {
      current: sighting('folder', 'this folder', 7),
      other: sighting('remote', "origin's", 19, { remote: 'origin' }),
      relation: 'contained',
      message: "Two boards: this folder (7) and origin's (19, newer).",
      resolve: 'brainfile adopt refs/brainfile/remotes/origin/board',
    },
  } as never);
  assert.deepEqual(view.twoBoards, {
    message: "Two boards: this folder (7) and origin's (19, newer).",
    detail: "Origin's already has everything this folder has.",
    useOther: "Use origin's",
    lossless: 'theirs',
  });
  assert.equal(view.short, 'two copies of the board');
});

test('boards that each have something the other lacks are merged to lose nothing', () => {
  const view = integrityView({
    ...quiet,
    conflict: {
      current: sighting('folder', 'this folder', 3),
      other: sighting('branch', "the 'brainfile' branch", 4),
      relation: 'diverged',
      message: 'Two boards: …',
      resolve: 'brainfile merge-boards refs/heads/brainfile',
    },
  } as never);
  assert.equal(view.twoBoards?.useOther, 'Use the branch');
  assert.equal(view.twoBoards?.lossless, 'merge');
});

test('a stray checkout, a code branch tracking a copy and an unfinished merge are each said once', () => {
  const view = integrityView(
    {
      ...quiet,
      strayWorktrees: [{ path: '/tmp/rp-board', missing: false }, { path: '/gone', missing: true }],
      trackedTwice: sighting('code-branch', 'the copy on main', 21),
    } as never,
    ['board/task-3.md']
  );
  assert.equal(view.short, 'a merge is unfinished');
  assert.deepEqual(view.notes, [
    'A merge stopped with conflicts in board/task-3.md. Keep the right version in each, then sync.',
    'The board branch is also checked out at /tmp/rp-board. It belongs at .brainfile/ only.',
    'main still tracks an old copy of .brainfile/ (21 docs). brainfile migrate --to-branch removes it in one commit.',
  ]);
});
