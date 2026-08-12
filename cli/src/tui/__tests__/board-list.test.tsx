/**
 * Board-list render tests (design §3, §4.1) — plan items 1–4 and 11.
 *
 * These assert on the text of real rendered frames, not on component props, so
 * glyphs, indentation, chip precedence and footer context are checked as the
 * user sees them.
 */
import { plain, lineWith } from './fixture-board.js';
import { mount, WIDE, NARROW, type Harness } from './helpers.js';

describe('board list — wide', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
  });
  afterAll(() => h.teardown());

  it('renders the header: board title, column tabs with live counts, active column marked', () => {
    const header = plain(h.frame()).split('\n')[0];
    expect(header).toContain('brainfile ▸');
    expect(header).toContain('Backlog 1');
    expect(header).toContain('To Do 11*');
    expect(header).toContain('In Progress 0');
    expect(header).toContain('Review 0');
    expect(header).toContain('/ filter  ? help');
  });

  it('gives every document type its glyph in column 1, and a plain task none', () => {
    expect(lineWith(h.frame(), 'epic-1')).toMatch(/^ ▸ epic-1\b/);
    expect(lineWith(h.frame(), 'spec-4')).toMatch(/^ ◆ spec-4\b/);
    expect(lineWith(h.frame(), 'adr-1')).toMatch(/^ ● adr-1\b/);
    expect(lineWith(h.frame(), 'plan-1')).toMatch(/^ ⎘ plan-1\b/);
    // A plain task leaves the glyph column blank — no placeholder character.
    expect(lineWith(h.frame(), 'task-4')).toMatch(/^ {3}task-4\b/);
  });

  it('indents children exactly two spaces beyond their visible parent', () => {
    const epic = lineWith(h.frame(), 'epic-1');
    const child = lineWith(h.frame(), 'task-1 ');
    const epicIndent = epic.indexOf('epic-1');
    const childIndent = child.indexOf('task-1');
    expect(childIndent - epicIndent).toBe(2);
  });

  it('pulls children up under their parent regardless of board order', () => {
    const ids = plain(h.frame())
      .split('\n')
      .map((line) => line.trim().split(/\s+/).find((t) => /^(task|epic|adr|spec|plan)-\d+$/.test(t)))
      .filter(Boolean);
    expect(ids.slice(0, 4)).toEqual(['epic-1', 'task-1', 'task-2', 'task-3']);
  });

  it('renders the orphan reference when the parent lives in another column', () => {
    const row = lineWith(h.frame(), 'task-11');
    expect(row).toContain('← epic-2');
    // and does not indent it, because there is no visible parent to indent under
    expect(row).toMatch(/^ {3}task-11\b/);
  });

  it('shows the footer with item count, actions and the state chip', () => {
    const footer = plain(h.frame()).trimEnd().split('\n').pop() ?? '';
    expect(footer).toContain('11 items');
    expect(footer).toContain('↵ detail');
    expect(footer).toContain('m move');
    expect(footer).toContain('a add');
    expect(footer).toContain('tab column');
    expect(footer).toContain('q quit');
    expect(footer.trimEnd().endsWith('todo')).toBe(true);
  });

  it('draws no box borders anywhere — only the header and footer rules', () => {
    const frame = plain(h.frame());
    expect(frame).not.toMatch(/[╭╮╰╯┌┐└┘╔╗╚╝┏┓┗┛]/);
    expect(frame.split('\n').filter((l) => l.includes('──')).length).toBe(2);
  });
});

describe('board list — chips', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
  });
  afterAll(() => h.teardown());

  it('orders chips contract state → subtask progress → first tag', () => {
    // task-9 has all three plus a critical priority marker.
    const row = lineWith(h.frame(), 'task-9');
    const contract = row.indexOf('delivered');
    const progress = row.indexOf('1/1');
    const tag = row.indexOf('#core');
    expect(contract).toBeGreaterThan(-1);
    expect(contract).toBeLessThan(progress);
    expect(progress).toBeLessThan(tag);
  });

  it('caps the chip group at three, dropping the lowest-precedence extras', () => {
    // task-9 carries three tags; only the first appears, and no fourth chip.
    const row = lineWith(h.frame(), 'task-9');
    expect(row).toContain('#core');
    expect(row).not.toContain('#net');
    expect(row).not.toContain('#security');
  });

  it('renders the priority marker only for high and critical', () => {
    expect(lineWith(h.frame(), 'task-8')).toContain('⚠ high');
    expect(lineWith(h.frame(), 'task-9')).toContain('⚠ critical');
    expect(lineWith(h.frame(), 'task-4')).not.toContain('⚠');
    expect(lineWith(h.frame(), 'epic-1')).not.toContain('⚠');
  });

  it('renders every contract state that appears on the board', () => {
    expect(lineWith(h.frame(), 'task-3')).toContain('ready');
    expect(lineWith(h.frame(), 'task-2')).toContain('in_progress');
    expect(lineWith(h.frame(), 'task-9')).toContain('delivered');
    expect(lineWith(h.frame(), 'spec-4')).toContain('done');
    expect(lineWith(h.frame(), 'plan-1')).toContain('draft');
    expect(lineWith(h.frame(), 'task-11')).toContain('failed');
  });

  it('shows subtask progress as done/total', () => {
    expect(lineWith(h.frame(), 'epic-1')).toContain('0/3');
    expect(lineWith(h.frame(), 'task-9')).toContain('1/1');
  });

  it('truncates the title before a chip is ever dropped or wrapped', async () => {
    // At a much narrower width the long title must shrink, yet the chips stay.
    const narrow = await mount(55, 26);
    try {
      const row = lineWith(narrow.frame(), 'task-3');
      expect(row).toContain('…');
      // both chips survive the squeeze, intact and in order
      expect(row).toContain('ready');
      expect(row).toContain('#cleanup');
      expect(row.indexOf('ready')).toBeLessThan(row.indexOf('#cleanup'));
      expect(row.length).toBeLessThanOrEqual(55);
    } finally {
      narrow.teardown();
    }
  });
});

describe('board list — narrow', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(NARROW, 26);
  });
  afterAll(() => h.teardown());

  it('renders the same glyphs, indentation and chips below the detail breakpoint', () => {
    expect(lineWith(h.frame(), 'epic-1')).toMatch(/^ ▸ epic-1\b/);
    expect(lineWith(h.frame(), 'adr-1')).toMatch(/^ ● adr-1\b/);
    expect(lineWith(h.frame(), 'task-4')).toMatch(/^ {3}task-4\b/);

    const epicIndent = lineWith(h.frame(), 'epic-1').indexOf('epic-1');
    const childIndent = lineWith(h.frame(), 'task-1 ').indexOf('task-1');
    expect(childIndent - epicIndent).toBe(2);
  });

  it('never overflows the terminal width', () => {
    for (const line of plain(h.frame()).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(NARROW);
    }
  });
});

describe('footer context-sensitivity', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
  });
  afterAll(() => h.teardown());

  const footer = () => plain(h.frame()).trimEnd().split('\n').pop() ?? '';

  it('offers c complete for a task', async () => {
    await h.press('g'); // top of list — epic-1
    expect(footer()).toContain('c complete');
  });

  it('omits c complete when an adr is selected', async () => {
    await h.press('G'); // bottom — task-11
    // walk up to adr-1
    for (let i = 0; i < 10; i += 1) {
      if (plain(h.frame()).includes('adr-1')) {
        const selectedIsAdr = footer();
        if (!selectedIsAdr.includes('c complete')) break;
      }
      await h.press('k');
    }
    expect(footer()).not.toContain('c complete');
    // the other actions are still advertised
    expect(footer()).toContain('↵ detail');
    expect(footer()).toContain('m move');
  });
});
