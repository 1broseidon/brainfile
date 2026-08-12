/**
 * Filter, help and overlay render tests (design §4.3, §4.4, §5) — plan items
 * 8–10 and 12–14.
 *
 * The action-firing tests assert the filesystem effect rather than a mocked
 * call: under Jest's ESM loader `jest.mock` is unavailable, and checking that
 * the board on disk actually changed is the stronger assertion anyway.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readTaskFile } from '@brainfile/core';
import { plain, lineWith } from './fixture-board.js';
import { mount, ENTER, ESC, WIDE, type Harness } from './helpers.js';

const footerOf = (h: Harness) => plain(h.frame()).trimEnd().split('\n').pop() ?? '';
const headerRule = (h: Harness) => plain(h.frame()).split('\n')[1] ?? '';

describe('filter', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26);
  });
  afterEach(() => h.teardown());

  it('opens inline in the header rule line and narrows incrementally', async () => {
    await h.press('/');
    expect(headerRule(h)).toContain('/');

    await h.press('p', ':', 'h', 'i', 'g', 'h');

    const rule = headerRule(h);
    expect(rule).toContain('/p:high');
    // Denominator is every document on the board (17: the original 12-doc
    // fixture plus the 5-doc detail-v2 fixture added for §B1/§B2 tests).
    expect(rule).toContain('1/17 match "p:high"');

    const frame = plain(h.frame());
    expect(frame).toContain('task-8');
    expect(frame).not.toContain('task-4');
    expect(frame).not.toContain('adr-1');
  });

  it('honours the structured tokens core already parses', async () => {
    await h.press('/', 't', 'y', 'p', 'e', ':', 'e', 'p', 'i', 'c');
    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(frame).not.toContain('task-4');
    expect(headerRule(h)).toContain('match "type:epic"');
  });

  it('ranks free text rather than plain substring filtering', async () => {
    await h.press('/', 'c', 'l', 'e', 'a', 'n', 'u', 'p');
    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(headerRule(h)).toMatch(/match "cleanup"/);
  });

  it('updates the column counts in the header while filtered', async () => {
    await h.press('/', 'p', ':', 'h', 'i', 'g', 'h');
    expect(plain(h.frame()).split('\n')[0]).toContain('To Do 1*');
  });

  it('clears on esc, restoring the full list and dropping the match count', async () => {
    await h.press('/', 'p', ':', 'h', 'i', 'g', 'h');
    expect(headerRule(h)).toContain('match');

    await h.press(ESC);

    const frame = plain(h.frame());
    expect(frame).toContain('task-4');
    expect(frame).toContain('adr-1');
    expect(headerRule(h)).not.toContain('match');
    expect(headerRule(h)).toMatch(/^ ─+$/);
  });
});

describe('help', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 30);
  });
  afterEach(() => h.teardown());

  it('is a single condensed pane grouped by nav / actions / filter', async () => {
    await h.press('?');
    const frame = plain(h.frame());
    expect(frame).toContain('help');
    expect(frame).toContain('nav');
    expect(frame).toContain('actions');
    expect(frame).toContain('filter');
    expect(frame).toContain('any key to dismiss');
    // no pagination affordance survives from v2
    expect(frame).not.toMatch(/page \d/i);
  });

  it('dismisses on any key, and that key does not also fire its action', async () => {
    await h.press('?');
    expect(plain(h.frame())).toContain('any key to dismiss');

    await h.press('a'); // 'a' would normally open the add overlay
    const frame = plain(h.frame());
    expect(frame).not.toContain('any key to dismiss');
    expect(frame).not.toContain('title…');
    expect(frame).toContain('↵ detail');
  });
});

describe('move overlay', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26);
  });
  afterEach(() => h.teardown());

  it('lists every board column with the current one pre-selected', async () => {
    await h.press('g', 'm');
    const frame = plain(h.frame());
    expect(frame).toContain('move');
    expect(frame).toContain('epic-1');
    expect(frame).toContain('1  Backlog');
    expect(frame).toContain('2  To Do');
    expect(frame).toContain('3  In Progress');
    expect(frame).toContain('4  Review');
  });

  it('moves the document to the chosen column on enter', async () => {
    await h.press('g', 'm', '3', ENTER);

    const doc = readTaskFile(path.join(h.fixture.boardDir, 'epic-1.md'));
    expect(doc?.task.column).toBe('in-progress');

    // back on the list, and the header counts followed the move
    expect(plain(h.frame()).split('\n')[0]).toContain('In Progress 1');
  });

  it('cancels on esc without touching the board', async () => {
    await h.press('g', 'm', '3', ESC);
    const doc = readTaskFile(path.join(h.fixture.boardDir, 'epic-1.md'));
    expect(doc?.task.column).toBe('todo');
  });
});

describe('complete', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26);
  });
  afterEach(() => h.teardown());

  it('confirms before completing an epic with incomplete children, naming them', async () => {
    await h.press('g', 'c'); // epic-1

    const frame = plain(h.frame());
    expect(frame).toContain('complete');
    expect(frame).toContain('epic-1');
    expect(frame).toContain('3 incomplete child tasks');
    expect(frame).toContain('task-1');
    expect(frame).toContain('task-2');
    expect(frame).toContain('task-3');
    expect(frame).toContain('y complete anyway');

    // nothing has happened on disk yet
    expect(fs.existsSync(path.join(h.fixture.boardDir, 'epic-1.md'))).toBe(true);
  });

  it('forces the completion through once confirmed', async () => {
    await h.press('g', 'c', 'y');

    expect(fs.existsSync(path.join(h.fixture.boardDir, 'epic-1.md'))).toBe(false);
    const ledger = fs.readFileSync(path.join(h.fixture.logsDir, 'ledger.jsonl'), 'utf-8');
    expect(ledger).toContain('"epic-1"');
  });

  it('leaves the board alone when the confirmation is declined', async () => {
    await h.press('g', 'c', 'n');
    expect(fs.existsSync(path.join(h.fixture.boardDir, 'epic-1.md'))).toBe(true);
    expect(plain(h.frame())).toContain('Complete cancelled');
  });

  it('completes a childless document straight away, with no confirmation', async () => {
    await h.press('g', 'j', 'j', 'j', 'j', 'c'); // task-4
    expect(fs.existsSync(path.join(h.fixture.boardDir, 'task-4.md'))).toBe(false);
  });

  it('refuses to complete an adr', async () => {
    // adr-1 is row index 8 in the To Do column
    await h.press('g');
    for (let i = 0; i < 8; i += 1) await h.press('j');
    expect(footerOf(h)).not.toContain('c complete');

    await h.press('c');
    expect(fs.existsSync(path.join(h.fixture.boardDir, 'adr-1.md'))).toBe(true);
    expect(plain(h.frame())).toContain('adr-1 cannot be completed');
  });
});

describe('quick add', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26);
  });
  afterEach(() => h.teardown());

  it('creates a title-only document in the active column and dismisses', async () => {
    await h.press('a');
    expect(plain(h.frame())).toContain('add to To Do');

    for (const ch of 'Write the changelog') await h.press(ch);
    expect(plain(h.frame())).toContain('Write the changelog');

    await h.press(ENTER);

    const created = fs
      .readdirSync(h.fixture.boardDir)
      .map((name) => readTaskFile(path.join(h.fixture.boardDir, name)))
      .find((doc) => doc?.task.title === 'Write the changelog');

    expect(created).toBeDefined();
    expect(created?.task.column).toBe('todo');

    // overlay is gone, list is back
    expect(plain(h.frame())).toContain('↵ detail');
    expect(lineWith(h.frame(), 'Write the changelog')).toBeTruthy();
  });

  it('cancels on esc without creating anything', async () => {
    const before = fs.readdirSync(h.fixture.boardDir).length;
    await h.press('a', 'x', 'y', ESC);
    expect(fs.readdirSync(h.fixture.boardDir).length).toBe(before);
    expect(plain(h.frame())).not.toContain('add to To Do');
  });
});
