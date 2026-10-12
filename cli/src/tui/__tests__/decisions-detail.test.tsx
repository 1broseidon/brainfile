/**
 * Decisions in the TUI (task-19), part two: a decision's detail (its fields,
 * its chain and the work resting on it, all on the flat cursor), work's
 * `rests on`, and the `decision changed` signal on a row resting on a retired
 * decision. Plus NO_COLOR and the narrow fullscreen detail.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { plain, lineWith } from './fixture-board.js';
import { createDecisionBoard } from './decision-board.js';
import { mount, ENTER, ESC, SPACE, NARROW, type Harness } from './helpers.js';

const footer = (h: Harness) => plain(h.frame()).trimEnd().split('\n').pop() ?? '';
/** Wide enough that the detail pane (45%) holds a decision's fields unwrapped. */
const mountWide = () => mount(160, 34, { column: 0, board: createDecisionBoard });

/** Decisions view rows, standing then history (open): see decision-board.ts. */
const ORDER = ['decision-2', 'decision-5', 'decision-3', 'decision-4', 'decision-6', 'adr-1', 'decision-1', 'decision-7', 'decision-8'];

/** Open a decision's detail from the decisions view, history unfolded. */
async function openDecision(h: Harness, id: string): Promise<void> {
  await h.press('D', 'L', 'g');
  for (let i = 0; i < ORDER.indexOf(id); i += 1) await h.press('j');
  await h.press(ENTER);
}

/** The To Do column's rows, in order. */
const TODO = ['task-10', 'task-11', 'task-12'];

async function openWork(h: Harness, id: string): Promise<void> {
  await h.press('g');
  for (let i = 0; i < TODO.indexOf(id); i += 1) await h.press('j');
  await h.press(ENTER);
}

/** The detail pane's header line: breadcrumb, title and state chip. */
const detailHead = (h: Harness, needle: string) =>
  plain(h.frame())
    .split('\n')
    .find((line) => line.includes(needle) && /(current|superseded|rejected|stale|proposed|todo|doing)\s*$/.test(line)) ?? '';

describe('a decision\'s detail', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountWide();
  });
  afterEach(() => h.teardown());

  it('shows claim key, kind, stance and subject, holds while, recheck and when it was made', async () => {
    await openDecision(h, 'decision-3');
    expect(lineWith(h.frame(), 'claim key')).toMatch(/claim key {4}storage\.cache$/);
    expect(lineWith(h.frame(), 'kind ')).toMatch(/kind {9}decision$/);
    expect(lineWith(h.frame(), 'stance')).toMatch(/stance {7}rejects Redis$/);
    expect(lineWith(h.frame(), 'holds while')).toMatch(/holds while {2}one instance and under 10k requests a minute$/);
    expect(lineWith(h.frame(), 'recheck')).toMatch(/recheck {6}Has traffic outgrown one instance\?$/);
    expect(lineWith(h.frame(), 'created')).toMatch(/created {6}2026-10-03$/);
    // No work fields: a decision has no priority, assignee or parent.
    expect(plain(h.frame())).not.toContain('assignee');
    expect(plain(h.frame())).not.toContain('parent ');
  });

  it('says where it stands in the state chip, not a column', async () => {
    await openDecision(h, 'decision-3');
    expect(detailHead(h, 'No Redis')).toMatch(/current$/);
  });

  it('shows valid until, and review once it has passed', async () => {
    await openDecision(h, 'decision-5');
    expect(lineWith(h.frame(), 'valid until')).toMatch(/valid until {2}2020-01-01 {2}review$/);
  });

  it('shows valid until with no review while it holds', async () => {
    await openDecision(h, 'decision-6');
    expect(lineWith(h.frame(), 'valid until')).toMatch(/valid until {2}2999-12-31$/);
  });

  it('lists the open work resting on it, and only open work', async () => {
    await openDecision(h, 'decision-1');
    const frame = plain(h.frame());
    expect(frame).toContain('work resting on it (1)');
    expect(lineWith(h.frame(), 'Empty states for no board')).toContain('task-10');
    // task-13 rests on it too, but is completed.
    expect(frame).not.toContain('task-13');
  });

  it('walks its chain and its resting work with the cursor, and opens each', async () => {
    await openDecision(h, 'decision-1');
    expect(detailHead(h, 'Use fetch for HTTP.')).toMatch(/superseded$/);
    // Stop 0: replaced by decision-2, under the cursor.
    expect(lineWith(h.frame(), 'replaced by')).toMatch(/replaced by ▌decision-2 {2}Never axios/);
    expect(footer(h)).toContain('↵ open');

    await h.press(ENTER);
    expect(plain(h.frame())).toContain('decision-1 ▸ decision-2');
    expect(lineWith(h.frame(), 'replaces')).toMatch(/replaces {4}▌decision-1 {2}Use fetch for HTTP\./);
    expect(detailHead(h, 'decision-1 ▸ decision-2')).toMatch(/current$/);

    await h.press(ESC); // back to decision-1
    await h.press('j'); // stop 1: task-10, resting on it
    expect(lineWith(h.frame(), 'task-10  Empty states')).toMatch(/▌task-10/);
    await h.press(ENTER);
    expect(plain(h.frame())).toContain('decision-1 ▸ task-10');
    expect(plain(h.frame())).toContain('rests on (1)');
  });

  it('offers no move or complete, and says why when they are pressed', async () => {
    await openDecision(h, 'decision-2');
    expect(footer(h)).not.toContain('m move');
    expect(footer(h)).not.toContain('c complete');
    expect(footer(h)).toContain('e edit');
    expect(footer(h)).toContain('esc back');

    const before = fs.readdirSync(h.fixture.boardDir).sort();
    await h.press('c');
    expect(plain(h.frame())).toContain('decision-2 cannot be completed');
    await h.press('m');
    expect(plain(h.frame())).toContain('Decisions have no column');
    expect(plain(h.frame())).not.toContain('move to');
    await h.press(SPACE);
    expect(plain(h.frame())).toContain('Decisions change with brainfile decide, supersede or retire');
    expect(fs.readdirSync(h.fixture.boardDir).sort()).toEqual(before);
  });

  it('reads a legacy ADR as proposed, with no fields it does not have', async () => {
    await openDecision(h, 'adr-1');
    expect(detailHead(h, 'Drop V1')).toMatch(/proposed$/);
    expect(plain(h.frame())).not.toContain('claim key');
  });
});

describe('work that rests on decisions', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountWide();
  });
  afterEach(() => h.teardown());

  it('lists a retired decision it rests on, marked where it went', async () => {
    await openWork(h, 'task-10');
    expect(plain(h.frame())).toContain('rests on (1)');
    expect(lineWith(h.frame(), 'Use fetch for HTTP.')).toMatch(/▌○ decision-1 {2}Use fetch for HTTP\.\s+superseded → decision-2$/);
    expect(footer(h)).toContain('↵ open');
    // still work: it moves and completes
    expect(footer(h)).toContain('m move');
    expect(footer(h)).toContain('c complete');
  });

  it('opens the decision it rests on', async () => {
    await openWork(h, 'task-10');
    await h.press(ENTER);
    expect(plain(h.frame())).toContain('task-10 ▸ decision-1');
    expect(plain(h.frame())).toContain('replaced by');
    await h.press(ESC);
    expect(plain(h.frame())).toContain('rests on (1)');
  });

  it('lists a standing decision with ● and nothing more', async () => {
    await openWork(h, 'task-11');
    const row = lineWith(h.frame(), 'No Redis for the cache');
    expect(row).toMatch(/▌● decision-3 {2}No Redis for the cache/);
    expect(row).not.toMatch(/superseded|rejected|stale|→/);
  });

  it('names a rejected decision, and one that is not on the board', async () => {
    await openWork(h, 'task-12');
    expect(plain(h.frame())).toContain('rests on (2)');
    expect(lineWith(h.frame(), 'Tabs for indentation.')).toMatch(/○ decision-7 {2}Tabs for indentation\.\s+rejected$/);
    expect(lineWith(h.frame(), 'decision-9')).toMatch(/decision-9 {2}not on this board$/);

    await h.press('j', ENTER); // the missing one
    expect(plain(h.frame())).toContain('decision-9 is not on this board');
    expect(plain(h.frame())).not.toContain('task-12 ▸ decision-9');
  });
});

describe('a row resting on a retired decision', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountWide();
  });
  afterEach(() => h.teardown());

  it('says decision changed, ahead of its other signals', () => {
    const row = lineWith(h.frame(), 'task-10');
    expect(row).toContain('decision changed');
    expect(row.indexOf('decision changed')).toBeLessThan(row.indexOf('#ux'));
    // rejected counts as well as superseded
    expect(lineWith(h.frame(), 'task-12')).toContain('decision changed');
  });

  it('says nothing when the decision still stands, or only ever was proposed', async () => {
    expect(lineWith(h.frame(), 'task-11')).not.toContain('decision changed');
    await h.press('l'); // Doing: task-14 rests on adr-1, proposed
    expect(lineWith(h.frame(), 'task-14')).not.toContain('decision changed');
  });

  it('keeps the signal when the row is squeezed: the title yields first', async () => {
    const narrow = await mount(60, 26, { column: 0, board: createDecisionBoard });
    try {
      const row = lineWith(narrow.frame(), 'task-10');
      expect(row).toContain('…');
      expect(row).toContain('decision changed');
      expect(row.length).toBeLessThanOrEqual(60);
    } finally {
      narrow.teardown();
    }
  });
});

describe('decision detail — narrow and NO_COLOR', () => {
  it('replaces the list fullscreen below the breakpoint, and esc returns to the view', async () => {
    const h = await mount(NARROW, 30, { column: 0, board: createDecisionBoard });
    try {
      await openDecision(h, 'decision-1');
      const frame = plain(h.frame());
      expect(frame).toContain('claim key');
      expect(frame).toContain('work resting on it (1)');
      expect(frame).not.toContain('decision-5'); // the list is gone
      for (const line of frame.split('\n')) expect(line.length).toBeLessThanOrEqual(NARROW);
      expect(footer(h).trimEnd().endsWith('superseded')).toBe(true);

      await h.press(ESC);
      expect(plain(h.frame())).toContain('▾ history (3)');
    } finally {
      h.teardown();
    }
  });

  it('wraps long fields under their label in a narrow pane rather than lose them', async () => {
    // The narrowest the TUI draws: the value column is 35 wide here.
    const h = await mount(50, 30, { column: 0, board: createDecisionBoard });
    try {
      await openDecision(h, 'decision-3');
      const lines = plain(h.frame()).split('\n');
      const at = lines.findIndex((line) => line.includes('holds while'));
      expect(lines[at]).toMatch(/holds while {2}one instance and under 10k/);
      expect(lines[at + 1]).toMatch(/^ {14}\S/); // the continuation, under the value
      expect(lines.join('\n')).toContain('a minute');
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(50);
    } finally {
      h.teardown();
    }
  });

  it('marks the detail cursor with a character, so it survives without colour', async () => {
    const h = await mountWide();
    try {
      // This environment renders no ANSI (see no-color.test.tsx): what shows is what NO_COLOR shows.
      await openDecision(h, 'decision-1');
      expect(h.frame()).not.toContain(String.fromCharCode(27));
      expect(lineWith(h.frame(), 'replaced by')).toContain('▌decision-2');
      await h.press('j');
      expect(lineWith(h.frame(), 'replaced by')).not.toContain('▌');
      expect(lineWith(h.frame(), 'task-10  Empty states')).toContain('▌task-10');
    } finally {
      h.teardown();
    }
  });

  it('leaves the board as it was', async () => {
    const h = await mountWide();
    try {
      const read = () =>
        fs.readdirSync(h.fixture.boardDir).map((name) => fs.readFileSync(path.join(h.fixture.boardDir, name), 'utf-8'));
      const before = read();
      await openDecision(h, 'decision-1');
      await h.press(ENTER, 'c', 'm', SPACE, ESC, 'j', ENTER, ESC, ESC);
      expect(read()).toEqual(before);
    } finally {
      h.teardown();
    }
  });
});
