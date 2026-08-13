/**
 * Esc always retreats (rubric P5).
 *
 * "Esc-mashing from anywhere reaches the main list without side effects." The
 * anywhere is smaller than it used to be — adr-2 deleted the rules and logs
 * modal modes — so what remains is: detail, move, delete-confirm,
 * complete-confirm, add, filter and help.
 *
 * Both halves matter. Arriving back at the list is easy to get right by
 * accident; arriving back with the board UNTOUCHED is the part a
 * confirm-on-escape bug breaks, so every case snapshots the board directory and
 * asserts it is byte-identical afterwards.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mount, tick, ESC, ENTER, type Harness } from './helpers.js';
import { plain } from './fixture-board.js';

/** Every board document's path → contents, for an exact before/after compare. */
function snapshotBoard(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of fs.readdirSync(dir).sort()) {
    out[name] = fs.readFileSync(path.join(dir, name), 'utf-8');
  }
  return out;
}

function footer(h: Harness): string {
  const lines = plain(h.frame()).split('\n').filter((l) => l.trim());
  return lines[lines.length - 1] ?? '';
}

/** The browse list is identifiable by its footer: an item count + `↵ detail`. */
function isOnBrowseList(h: Harness): boolean {
  const f = footer(h);
  return /\d+ items?/.test(f) && f.includes('↵ detail');
}

describe('Esc always retreats (P5)', () => {
  let h: Harness;
  let before: Record<string, string>;

  beforeEach(async () => {
    h = await mount();
    before = snapshotBoard(h.fixture.boardDir);
  });

  afterEach(() => {
    h.teardown();
  });

  /**
   * Enter a mode, mash escape, assert we are back on a plain list with nothing
   * changed. `expectDoc` is the document that proves which list we landed on —
   * the board list by default.
   */
  async function mashFrom(name: string, enter: () => Promise<void>, expectDoc = 'epic-1') {
    await enter();
    await h.press(ESC, ESC, ESC, ESC, ESC);
    await tick(200);

    expect(isOnBrowseList(h)).toBe(true);
    expect(plain(h.frame())).toContain(expectDoc);
    expect(snapshotBoard(h.fixture.boardDir)).toEqual(before);
    // Nothing claims a mutation happened.
    const frame = plain(h.frame());
    for (const claim of ['Moved', 'Deleted', 'Completed', 'Added']) {
      expect(frame).not.toContain(claim);
    }
  }

  it('from detail', async () => {
    await mashFrom('detail', () => h.press(ENTER));
  });

  it('from a nested detail drill-down', async () => {
    await mashFrom('nested detail', async () => {
      await h.press(ENTER); // epic-1
      await h.press('j'); // cursor onto a child stop
      await h.press(ENTER); // drill in
    });
  });

  it('from the move overlay', async () => {
    await mashFrom('move', () => h.press('m'));
  });

  it('from the move overlay opened inside detail', async () => {
    await mashFrom('detail → move', async () => {
      await h.press(ENTER);
      await h.press('m');
    });
  });

  it('from the delete confirmation', async () => {
    await mashFrom('delete-confirm', () => h.press('d'));
  });

  it('from the complete confirmation', async () => {
    // epic-1 has three incomplete children, so `c` is refused by core's
    // epic-safety gate and becomes a confirmation prompt.
    await mashFrom('complete-confirm', () => h.press('c'));
  });

  it('from the add overlay, mid-typing', async () => {
    await mashFrom('add', async () => {
      await h.press('a');
      for (const ch of 'a new task') await h.press(ch);
    });
  });

  it('from the filter, mid-query', async () => {
    await mashFrom('filter', async () => {
      await h.press('/');
      for (const ch of 'triage') await h.press(ch);
    });
  });

  it('from help', async () => {
    await mashFrom('help', () => h.press('?'));
  });

  // The `done` stop is a list filter, not a mode: like every other type-cycle
  // stop, esc clears the SEARCH and leaves the stop alone (`t` is how you leave
  // it). What P5 demands here is that mashing lands on a plain, unmodal list
  // having changed nothing — not that esc unwinds the filter.
  it('from a modal opened on top of the done stop', async () => {
    await mashFrom(
      'done → detail',
      async () => {
        await h.press('L');
        await h.press(ENTER); // detail on an archived doc
        await h.press('/'); // and a filter on top of that
        for (const ch of 'ship') await h.press(ch);
      },
      'task-90',
    );
  });

  it('clears an active filter rather than leaving it stuck', async () => {
    await h.press('/');
    for (const ch of 'triage') await h.press(ch);
    expect(plain(h.frame())).not.toContain('adr-1');

    await h.press(ESC, ESC);
    await tick();

    // The whole column is back — the filter did not survive the retreat.
    const frame = plain(h.frame());
    expect(frame).toContain('adr-1');
    expect(frame).toContain('epic-1');
  });

  it('reaches the list from the deepest reachable state', async () => {
    // detail → drill down → move overlay, then mash.
    await h.press(ENTER);
    await h.press('j');
    await h.press(ENTER);
    await h.press('m');

    await h.press(ESC, ESC, ESC, ESC, ESC, ESC);
    await tick(200);

    expect(isOnBrowseList(h)).toBe(true);
    expect(snapshotBoard(h.fixture.boardDir)).toEqual(before);
  });
});
