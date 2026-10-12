/**
 * Children stay under their parent across columns (task-20).
 *
 * A child sits under its parent in the parent's column list, says its own
 * column at the row's right edge, and is not listed again in its own column;
 * a completed child stays under its open parent, `✓ done`, until the parent
 * is done too. Tabs count what each list holds. The board is
 * `outline-board.ts`: epic-1 in In Progress with children in To Do, In
 * Progress and Review, a grandchild in Backlog, and two completed in logs/.
 */
import * as path from 'node:path';
import { readTaskFile } from '@brainfile/core';
import { mount, ENTER, SPACE, WIDE, NARROW, type Harness } from './helpers.js';
import { plain, lineWith } from './fixture-board.js';
import { createOutlineBoard } from './outline-board.js';

const IN_PROGRESS = 2;

const header = (h: Harness) => plain(h.frame()).split('\n')[0] ?? '';
const footer = (h: Harness) => plain(h.frame()).trimEnd().split('\n').pop() ?? '';
const ids = (h: Harness) =>
  plain(h.frame())
    .split('\n')
    .slice(2)
    .map((line) => line.trim().split(/\s+/).find((t) => /^(task|epic|spec|plan)-\d+$/.test(t)))
    .filter(Boolean);

describe('outline across columns (task-20)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26, { column: IN_PROGRESS, board: createOutlineBoard });
  });
  afterEach(() => h.teardown());

  it('draws every child under its parent, by column, the completed ones last and newest first', () => {
    expect(ids(h)).toEqual(['epic-1', 'task-2', 'task-3', 'spec-1', 'plan-1', 'task-5', 'task-4']);
    const epic = lineWith(h.frame(), 'epic-1').indexOf('epic-1');
    expect(lineWith(h.frame(), 'task-2').indexOf('task-2') - epic).toBe(2);
    expect(lineWith(h.frame(), 'spec-1').indexOf('spec-1') - epic).toBe(2);
    expect(lineWith(h.frame(), 'plan-1').indexOf('plan-1') - epic).toBe(4);
  });

  it('gives each child its own status: its column, or nothing when it is the tab’s', () => {
    expect(lineWith(h.frame(), 'task-2')).toMatch(/\btodo$/);
    expect(lineWith(h.frame(), 'spec-1')).toMatch(/\breview$/);
    expect(lineWith(h.frame(), 'plan-1')).toMatch(/\bbacklog$/);
    expect(lineWith(h.frame(), 'task-3')).toMatch(/Keyboard follows the outline$/);
  });

  it('keeps completed children under the open parent, ticked', () => {
    expect(lineWith(h.frame(), 'task-5')).toMatch(/✓ done$/);
    expect(lineWith(h.frame(), 'task-4')).toMatch(/✓ done$/);
  });

  it('counts what each tab holds, and lists no child a second time', async () => {
    expect(header(h)).toContain('Backlog 0');
    expect(header(h)).toContain('To Do 1');
    expect(header(h)).toContain('In Progress 7*');
    expect(header(h)).toContain('Review 1');
    expect(footer(h)).toContain('7 items');

    await h.press('l'); // Review
    expect(ids(h)).toEqual(['task-6']);
  });

  it('leaves an open child of a completed parent in its own column, pointing at it', async () => {
    await h.press('h'); // To Do
    expect(ids(h)).toEqual(['task-7']);
    expect(lineWith(h.frame(), 'task-7')).toContain('← epic-9');
  });

  it('collapses children from other columns with the parent, and the count stands', async () => {
    await h.press(SPACE);
    expect(ids(h)).toEqual(['epic-1']);
    expect(lineWith(h.frame(), 'epic-1')).toContain('5 hidden');
    expect(header(h)).toContain('In Progress 7*');
  });

  it('treats a completed child as read-only, as the done stop does', async () => {
    await h.press('j', 'j', 'j', 'j', 'j'); // task-5
    expect(footer(h)).not.toContain('m move');
    expect(footer(h)).not.toContain('c complete');

    await h.press('m');
    expect(plain(h.frame())).toContain('Completed documents are read-only here');
    await h.press('c');
    expect(plain(h.frame())).toContain('Already completed');
  });

  it('starts the move picker on the child’s own column', async () => {
    await h.press('j', 'j', 'j'); // spec-1, in Review
    await h.press('m', 'k', ENTER); // one up from Review is In Progress

    const doc = readTaskFile(path.join(h.fixture.boardDir, 'spec-1.md'));
    expect(doc?.task.column).toBe('in-progress');
    // Still under its parent, now in the tab's own column, so it says nothing.
    expect(lineWith(h.frame(), 'spec-1')).toMatch(/Each child keeps its own status$/);
  });
});

describe('outline across columns — the cursor follows the document', () => {
  it('stays on a child moved from under it', async () => {
    const h = await mount(NARROW, 26, { column: IN_PROGRESS, board: createOutlineBoard });
    try {
      await h.press('j'); // task-2, in To Do
      await h.press('m', '3', ENTER); // to In Progress: it now sorts after task-3
      await h.press(ENTER);
      expect(plain(h.frame())).toContain('Count what a group shows');
    } finally {
      h.teardown();
    }
  });
});
