/**
 * The window's words for where a board lives (spec-15): the two-boards line
 * and the health notes. Pure, so plain `node --test` runs it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrityView } from '../src/host/integrity.ts';
import { problemBrief } from '../src/renderer/lib/brief.ts';

const sighting = (kind: string, label: string, docs: number, extra: Record<string, unknown> = {}) =>
  ({ kind, ref: kind === 'folder' ? '/w/app/.brainfile' : 'refs/brainfile/remotes/origin/board', label, docs, lastChange: null, ...extra }) as never;

const quiet = { boards: [], conflict: null, lineage: null, strayWorktrees: [], outsideHome: null, trackedTwice: null };

test('nothing to say when the board is the only one, in its place', () => {
  assert.deepEqual(integrityView(quiet as never), { twoBoards: null, notes: [], short: null, line: null, fix: null, found: [] });
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
  assert.equal(view.short, 'two copies');
  assert.equal(view.line, "Origin's (19) already has everything this folder (7) has.");
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
  assert.equal(view.line, "This folder (3) and the 'brainfile' branch (4) each have changes the other lacks.");
});

test('each problem has its few words and one plain sentence', () => {
  const stray = integrityView({ ...quiet, strayWorktrees: [{ path: '/tmp/rp-board', missing: false }] } as never);
  assert.deepEqual([stray.short, stray.line], ['open twice', 'Also checked out at /tmp/rp-board.']);
  const away = integrityView({ ...quiet, outsideHome: '/w/app/.brainfile' } as never);
  assert.deepEqual([away.short, away.line], ['open elsewhere', 'This board is checked out outside .brainfile/, where it belongs.']);
  const old = integrityView({ ...quiet, trackedTwice: sighting('code-branch', 'the copy on main', 7) } as never);
  assert.deepEqual([old.short, old.line], ['old copy in main', 'An old copy of .brainfile/ (7 docs) is still tracked on main.']);
  // A checkout whose folder is gone is forgotten when the board opens: nothing to say.
  assert.equal(integrityView({ ...quiet, strayWorktrees: [{ path: '/gone', missing: true }] } as never).short, null);
});

test("what was found is said as plain lines, every copy with its count, for an agent's brief", () => {
  const view = integrityView({
    ...quiet,
    boards: [
      sighting('branch', "the 'brainfile' branch", 19, { ref: 'refs/heads/brainfile', path: '/w/app/.brainfile', lastChange: '2026-10-12T09:00:00.000Z' }),
      sighting('code-branch', 'the copy on main', 7, { ref: 'HEAD:.brainfile', lastChange: '2026-09-30T09:00:00.000Z' }),
    ],
    trackedTwice: sighting('code-branch', 'the copy on main', 7, { ref: 'HEAD:.brainfile' }),
  } as never);
  assert.deepEqual(view.found, [
    "The 'brainfile' branch: 19 docs, last change 2026-10-12 (refs/heads/brainfile, checked out at /w/app/.brainfile).",
    'The copy on main: 7 docs, last change 2026-09-30 (HEAD:.brainfile).',
    'The code branch main still tracks an old copy of .brainfile/.',
  ]);

  const brief = problemBrief('runprism.ai', { ...view, fix: { kind: 'untrack', words: "Back up both, then untrack main's copy" } });
  assert.match(brief, /^Brainfile says the board for runprism\.ai has a problem: old copy in main\.\n/);
  assert.match(brief, /\n- The copy on main: 7 docs/);
  assert.match(brief, /Brainfile's own safe fix would: Back up both, then untrack main's copy\./);
  assert.match(brief, /explain the difference in a few lines, and ask me how to settle it\./);
  assert.match(brief, /Change nothing until I choose/);
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
  assert.equal(view.short, 'merge unfinished');
  assert.equal(view.line, 'A merge stopped with conflicts in board/task-3.md.');
  assert.deepEqual(view.notes, [
    'A merge stopped with conflicts in board/task-3.md. Keep the right version in each, then sync.',
    'The board branch is also checked out at /tmp/rp-board. It belongs at .brainfile/ only.',
    'main still tracks an old copy of .brainfile/ (21 docs). brainfile migrate --to-branch removes it in one commit.',
  ]);
});
