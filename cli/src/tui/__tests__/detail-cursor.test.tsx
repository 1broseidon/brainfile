/**
 * Detail v2 flat-cursor and body-scroll tests (v3.1 spec §B2) — plan items
 * 4 and 5. Both exercise the `epic-9 → task-50 → {task-51, task-52, task-53}`
 * fixture in the `Later` column (`fixture-board.ts`), which was built with
 * exactly this in mind: a parent, three children, two subtasks, and a body
 * long enough to force scrolling at any reasonable viewport.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { plain } from './fixture-board.js';
import { mount, ENTER, ESC, SPACE, type Harness } from './helpers.js';

/** Drill from `epic-9` (Later, top row) into its child `task-50`. */
async function openTask50(h: Harness): Promise<void> {
  await h.press('g');
  await h.press(ENTER); // open epic-9
  await h.press(ENTER); // its only stop is the task-50 child row
}

describe('detail v2 — body scroll is cursor-independent (§B2)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(180, 45, { column: 4 });
    await openTask50(h);
  });
  afterAll(() => h.teardown());

  it('shows the top of the body and the ↕ indicator before any scroll', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('Line 1 of');
    expect(frame).toMatch(/↕ 1\//);
  });

  it('`d` scrolls the body down (by half the visible height) without moving the flat cursor', async () => {
    await h.press('d');
    const frame = plain(h.frame());
    // `d` always steps forward by at least one line, so the very first line
    // is gone regardless of the exact budget this viewport computed.
    expect(frame).not.toContain('Line 1 of');
    expect(frame).toMatch(/↕ \d+\/47/);
    expect(frame).not.toMatch(/↕ 1\/47/);

    // The cursor is unmoved (still stop 0 — the task-51 child row): drilling
    // in from here must land on task-51, proving j/k never touched it.
    await h.press(ENTER);
    expect(plain(h.frame())).toContain('epic-9 ▸ task-50 ▸ task-51');
    await h.press(ESC); // back to task-50
  });

  it('`u` scrolls back up', async () => {
    await h.press('u');
    const frame = plain(h.frame());
    expect(frame).toContain('Line 1 of');
  });
});

describe('detail v2 — flat cursor: children, then subtasks (§B2, the locked decision)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(180, 45, { column: 4 });
    await openTask50(h);
  });
  afterEach(() => h.teardown());

  it('walks children first, then subtasks, and toggles the subtask under the cursor', async () => {
    // stops: task-51, task-52, task-53, st-x (sweep guides), st-y (verify links)
    await h.press('j', 'j', 'j'); // cursor now on the first subtask stop
    await h.press(SPACE);

    const onDisk = fs.readFileSync(path.join(h.fixture.boardDir, 'task-50.md'), 'utf-8');
    expect(onDisk).toMatch(/id: st-x[\s\S]*?completed: true/);
    expect(plain(h.frame())).toContain('☑ sweep guides');
  });

  it('enter on a child stop drills in and grows the breadcrumb; esc pops one level', async () => {
    await h.press(ENTER); // cursor 0 = task-51
    expect(plain(h.frame())).toContain('epic-9 ▸ task-50 ▸ task-51');

    await h.press(ESC);
    const frame = plain(h.frame());
    expect(frame).toContain('epic-9 ▸ task-50');
    expect(frame).not.toContain('▸ task-51');
    expect(frame).toContain('children (3)');
  });

  it('p jumps to the parent\'s detail', async () => {
    await h.press('p');
    const frame = plain(h.frame());
    // Back at epic-9: its own detail, breadcrumb collapses to just the id.
    expect(frame).toContain('Detail v2 rollout');
    expect(frame).not.toContain('▸ task-50');
    expect(frame).toContain('children (1)');
  });

  it('esc at the root of the drill-down returns to the list', async () => {
    await h.press('p'); // epic-9 — root of this drill-down
    await h.press(ESC);
    const frame = plain(h.frame());
    expect(frame).toContain('epic-9');
    expect(frame).toContain('↵ detail');
  });
});
