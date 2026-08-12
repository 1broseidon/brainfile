/**
 * Detail v2 render tests (v3.1 spec §B1) — plan item 3 plus the carried-over
 * wide/narrow layout mechanics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { plain, lineWith } from './fixture-board.js';
import { mount, ENTER, ESC, SPACE, WIDE, NARROW, type Harness } from './helpers.js';

/** Render order of the fixture's `To Do` column (unchanged by the detail-v2 fixture additions). */
const TODO_ROWS = [
  'epic-1',
  'task-1',
  'task-2',
  'task-3',
  'task-4',
  'task-8',
  'task-9',
  'spec-4',
  'adr-1',
  'plan-1',
  'task-11',
];

/** Move the selection to a document by id in the To Do column, then open its detail view. */
async function openTodoDocument(h: Harness, id: string): Promise<void> {
  const index = TODO_ROWS.indexOf(id);
  if (index < 0) throw new Error(`fixture has no row ${id}`);
  await h.press('g');
  for (let i = 0; i < index; i += 1) await h.press('j');
  await h.press(ENTER);
}

/**
 * Drill from `epic-9` (the detail-v2 fixture's root, in the `Later` column,
 * index 4) down into its only child, `task-50` — this is the fixture built
 * for §B1/§B2: a parent, 3 children, subtasks, a full contract, a long body,
 * and `## Log` entries.
 */
async function openTask50(h: Harness): Promise<void> {
  await h.press('g'); // epic-9 is the only row at the top of Later
  await h.press(ENTER); // open epic-9's detail
  await h.press(ENTER); // cursor's first (only) stop is the task-50 child row
}

describe('detail v2 — full anatomy (§B1)', () => {
  let h: Harness;

  beforeAll(async () => {
    // Wider than the shared WIDE constant: the detail *pane* is 45% of the
    // terminal, and this fixture's breadcrumb (`epic-9 ▸ task-50`) plus its
    // title need more room than the 44-baseline docs ever needed.
    h = await mount(180, 45, { column: 4 });
    await openTask50(h);
  });
  afterAll(() => h.teardown());

  it('renders a breadcrumb that grows with drill-down', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('epic-9 ▸ task-50');
  });

  it('renders the title and the column · priority header', () => {
    const head =
      plain(h.frame())
        .split('\n')
        .find((line) => line.includes('Prune supervisor remnants') && line.includes('later')) ?? '';
    expect(head).toContain('medium');
  });

  it('renders the metadata row, including the parent reference', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('#docs');
    expect(frame).toContain('assignee claude');
    expect(frame).toContain('created 2026-08-11');
    expect(frame).toContain('parent epic-9');
  });

  it('renders the description heading with the ↕ overflow indicator', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('description');
    expect(frame).toMatch(/↕ \d+\/\d+/);
    expect(frame).toContain('Line 1 of a long body');
  });

  it('renders the children section with the count and each child row', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('children (3)');
    expect(frame).toContain('task-51');
    expect(frame).toContain('Triage marketing board');
    expect(frame).toContain('task-52');
    expect(frame).toContain('task-53');
  });

  it('renders the subtasks section with progress and glyphs', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('subtasks (1/2)');
    expect(frame).toContain('◻ sweep guides');
    expect(frame).toContain('☑ verify links');
  });

  it('renders the contract block: state, deliverables capped at 3, validation capped at 2, feedback', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('contract');
    expect(frame).toContain('failed');
    expect(frame).toContain('deliverables');
    expect(frame).toContain('docs/guides/orchestration.md — rewrite');
    expect(frame).toContain('cli/src/tui/__tests__/detail-v2.test.tsx — coverage');
    expect(frame).toContain('cli/src/tui/components/DetailView.tsx — implementation');
    expect(frame).not.toContain('README.md');
    expect(frame).toContain('validation');
    expect(frame).toContain('npm test -w cli');
    expect(frame).toContain('npm run typecheck');
    expect(frame).not.toContain('npm run build');
    expect(frame).toContain('feedback');
    expect(frame).toContain('Missing regression test for the scroll indicator.');
  });

  it('renders the activity section, newest first, merging ## Log entries', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('activity');
    expect(frame).toContain('[claude]');
    expect(frame).toContain('moved todo → in-progress');
    expect(frame).toContain('[pm]');
    expect(frame).toContain('contract attached');
    const movedIdx = frame.indexOf('moved todo');
    const attachedIdx = frame.indexOf('contract attached');
    expect(movedIdx).toBeGreaterThan(-1);
    expect(movedIdx).toBeLessThan(attachedIdx);
  });

  it('renders the files line', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('files');
    expect(frame).toContain('docs/guides/orchestration.md');
  });

  it('shows the full detail footer, context-sensitive to this document', () => {
    const footer = plain(h.frame()).trimEnd().split('\n').pop() ?? '';
    expect(footer).toContain('↵ open child');
    expect(footer).toContain('space toggle');
    expect(footer).toContain('u/d scroll');
    expect(footer).toContain('p parent');
    expect(footer).toContain('e edit');
    expect(footer).toContain('m move');
    expect(footer).toContain('c complete');
    expect(footer).toContain('esc back');
  });
});

describe('detail v2 — sections render only when non-empty', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
    await openTodoDocument(h, 'task-8');
  });
  afterAll(() => h.teardown());

  it('keeps the list rendered on the left', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(frame).toContain('adr-1');
  });

  it('renders the breadcrumb as just the id when there is no parent', () => {
    const head =
      plain(h.frame())
        .split('\n')
        .find((line) => line.includes('CLIError') && line.includes('todo')) ?? '';
    expect(head).toContain('task-8');
    expect(head).toContain('todo');
    expect(head).toContain('high');
  });

  it('renders subtasks but no children heading and no contract block (§B1: empty sections omitted)', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('subtasks (0/2)');
    expect(frame).toContain('◻ add top-level catch in cli.ts');
    expect(frame).toContain('◻ regression test');
    expect(frame).not.toMatch(/children \(/);
    expect(frame).not.toContain('contract');
  });

  it('renders the files list', () => {
    expect(plain(h.frame())).toContain('files');
    expect(plain(h.frame())).toContain('cli/src/cli.ts');
  });

  it('omits ↵ open child, p parent and u/d scroll when none apply', () => {
    const footer = plain(h.frame()).trimEnd().split('\n').pop() ?? '';
    expect(footer).not.toContain('open child');
    expect(footer).not.toContain('p parent');
    expect(footer).toContain('space toggle');
    expect(footer).toContain('e edit');
    expect(footer).toContain('m move');
    expect(footer).toContain('c complete');
    expect(footer).toContain('esc back');
  });

  it('renders headings bold and list items indented in the body', async () => {
    const md = await mount(WIDE, 30);
    try {
      // spec-4 has no body; epic-1 does — assert the markdown pass ran on it.
      await openTodoDocument(md, 'epic-1');
      expect(plain(md.frame())).toContain('Close out the June-migration leftovers.');
    } finally {
      md.teardown();
    }
  });
});

describe('detail v2 — narrow (fullscreen replace)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(NARROW, 26);
  });
  afterAll(() => h.teardown());

  it('replaces the list entirely and returns to it on esc', async () => {
    await openTodoDocument(h, 'task-8');

    const detail = plain(h.frame());
    expect(detail).toContain('task-8');
    expect(detail).toContain('subtasks');
    // the list is gone — no other document is on screen
    expect(detail).not.toContain('adr-1');
    expect(detail).not.toContain('epic-1');
    expect(detail).toContain('esc back');

    await h.press(ESC);
    const list = plain(h.frame());
    expect(list).toContain('adr-1');
    expect(list).toContain('epic-1');
    expect(list).toContain('↵ detail');
  });
});

describe('detail v2 — subtask space-toggle at the flat cursor', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
  });
  afterAll(() => h.teardown());

  it('toggles the subtask under the cursor (children first, then subtasks — here, no children)', async () => {
    await openTodoDocument(h, 'task-8');
    expect(plain(h.frame())).toContain('◻ add top-level catch in cli.ts');

    await h.press(SPACE);
    // The action wrote through to the task file on disk...
    const onDisk = fs.readFileSync(path.join(h.fixture.boardDir, 'task-8.md'), 'utf-8');
    expect(onDisk).toMatch(/id: st-a[\s\S]*?completed: true/);
    // ...and the reloaded frame shows the flipped glyph.
    expect(plain(h.frame())).toContain('☑ add top-level catch in cli.ts');
    expect(plain(h.frame())).toContain('◻ regression test');
  });
});
