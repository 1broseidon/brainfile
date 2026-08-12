/**
 * The `done` stop (§B2) — completed history as a type-cycle stop rather than a
 * panel.
 *
 * The old 1/2/3 LogsPanel is gone; `logs/` is now just another row source for
 * the same DocumentList and DetailView. What has to hold: the rows come from
 * the archive, they read as past tense, the detail view says when they were
 * completed, and nothing on that list can mutate the board.
 */
import { mount, tick, ENTER, TAB, type Harness } from './helpers.js';
import { plain, lineWith } from './fixture-board.js';

/** Cycle `t` until the header shows the `done` stop, or give up loudly. */
async function toDone(h: Harness): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    if (headerLine(h).includes('done')) return;
    await h.press('t');
  }
  throw new Error(`never reached the done stop; header: ${headerLine(h)}`);
}

function headerLine(h: Harness): string {
  return plain(h.frame()).split('\n')[0] ?? '';
}

function footerLine(h: Harness): string {
  const lines = plain(h.frame()).split('\n').filter((l) => l.trim());
  return lines[lines.length - 1] ?? '';
}

describe('done stop (§B2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount();
  });

  afterEach(() => {
    h.teardown();
  });

  it('cycles to done and lists documents read from logs/', async () => {
    await toDone(h);

    const frame = plain(h.frame());
    expect(frame).toContain('task-90');
    expect(frame).toContain('Ship the v2 migration');
    expect(frame).toContain('spec-90');

    // Board documents are NOT in this list — it is the archive, not a filter
    // over everything.
    expect(frame).not.toContain('epic-1');
    expect(frame).not.toContain('Post-migration cleanup');
  });

  it('announces the stop in the header (P9)', async () => {
    await toDone(h);
    expect(headerLine(h)).toContain('done');
  });

  it('offers no board mutations in the footer, but keeps e edit', async () => {
    await toDone(h);

    const footer = footerLine(h);
    expect(footer).not.toContain('m move');
    expect(footer).not.toContain('c complete');
    expect(footer).not.toContain('a add');
    expect(footer).toContain('e edit');
    expect(footer).toContain('↵ detail');
  });

  it('answers a mutating keystroke instead of silently ignoring it (P6)', async () => {
    await toDone(h);
    await h.press('m');

    expect(plain(h.frame())).toContain('read-only');
  });

  it('opens detail with a completed banner instead of a column', async () => {
    await toDone(h);
    await h.press(ENTER);
    await tick();

    const frame = plain(h.frame());
    expect(frame).toContain('Ship the v2 migration');
    // `completedAt` is 2026-08-12 → the MM-DD slice the state line renders.
    expect(frame).toContain('completed 08-12');
  });

  it('does not cycle columns — there is one flat archive list', async () => {
    await toDone(h);
    const before = plain(h.frame());

    await h.press(TAB);
    await h.press('l');
    await h.press('h');

    expect(plain(h.frame())).toBe(before);
  });

  it('composes with the / filter', async () => {
    await toDone(h);
    await h.press('/');
    for (const ch of 'migration') await h.press(ch);

    const frame = plain(h.frame());
    expect(frame).toContain('task-90');
    expect(frame).not.toContain('spec-90');
  });

  it('leaves the board untouched when cycling back to all', async () => {
    await toDone(h);
    await h.press('t'); // wraps to `all`

    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(lineWith(h.frame(), 'epic-1')).toContain('Post-migration cleanup');
  });
});
