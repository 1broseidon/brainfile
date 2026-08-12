/**
 * Detail-view render tests (design §4.2) — plan items 5–7.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { plain, lineWith } from './fixture-board.js';
import { mount, ENTER, ESC, SPACE, WIDE, NARROW, type Harness } from './helpers.js';

/**
 * Render order of the fixture's `To Do` column — children are pulled up under
 * `epic-1`, everything else keeps board order.
 */
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

/** Move the selection to a document by id, then open its detail view. */
async function openDocument(h: Harness, id: string): Promise<void> {
  const index = TODO_ROWS.indexOf(id);
  if (index < 0) throw new Error(`fixture has no row ${id}`);
  await h.press('g');
  for (let i = 0; i < index; i += 1) await h.press('j');
  await h.press(ENTER);
}

describe('detail — wide (persistent right pane)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
    await openDocument(h, 'task-8');
  });
  afterAll(() => h.teardown());

  it('keeps the list rendered on the left', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(frame).toContain('adr-1');
  });

  it('renders the id, title and the state · priority header row', () => {
    // The list row carries the same title, so pick the line that also carries
    // the state chip — that is the detail pane's header row.
    const head =
      plain(h.frame())
        .split('\n')
        .find((line) => line.includes('CLIError') && line.includes('todo')) ?? '';
    expect(head).toContain('task-8');
    expect(head).toContain('todo');
    expect(head).toContain('high');
  });

  it('renders the metadata block', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('tags #cli #ux');
    expect(frame).toContain('assignee —');
    expect(frame).toContain('created 2026-08-11');
    expect(frame).toContain('parent —');
  });

  it('renders the body', () => {
    expect(plain(h.frame())).toContain("Repro: run 'brainfile complete task-5'");
  });

  it('renders the subtasks block with open/done glyphs and the contract column', () => {
    const frame = plain(h.frame());
    expect(frame).toContain('subtasks');
    expect(frame).toContain('contract');
    expect(frame).toContain('◻ add top-level catch in cli.ts');
    expect(frame).toContain('◻ regression test');
    expect(frame).toContain('(none)');
  });

  it('renders the files list', () => {
    expect(plain(h.frame())).toContain('files');
    expect(plain(h.frame())).toContain('cli/src/cli.ts');
  });

  it('switches the footer to the detail actions', () => {
    const footer = plain(h.frame()).trimEnd().split('\n').pop() ?? '';
    expect(footer).toContain('space toggle subtask');
    expect(footer).toContain('e edit');
    expect(footer).toContain('m move');
    expect(footer).toContain('c complete');
    expect(footer).toContain('esc back');
  });

  it('renders headings bold and list items indented in the body', async () => {
    const md = await mount(WIDE, 30);
    try {
      // spec-4 has no body; epic-1 does — assert the markdown pass ran on it.
      await openDocument(md, 'epic-1');
      expect(plain(md.frame())).toContain('Close out the June-migration leftovers.');
    } finally {
      md.teardown();
    }
  });
});

describe('detail — narrow (fullscreen replace)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(NARROW, 26);
  });
  afterAll(() => h.teardown());

  it('replaces the list entirely and returns to it on esc', async () => {
    await openDocument(h, 'task-8');

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

describe('detail — subtask space-toggle', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await mount(WIDE, 26);
  });
  afterAll(() => h.teardown());

  it('toggles the focused subtask through core and re-renders the glyph', async () => {
    await openDocument(h, 'task-8');
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
