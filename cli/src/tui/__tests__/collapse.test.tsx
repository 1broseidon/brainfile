/**
 * List collapse/expand tests (v3.1 spec §A1) — plan item 1.
 *
 * `epic-1` in the fixture's To Do column carries exactly three children
 * (task-1, task-2, task-3), which is what this section of the spec was
 * written against.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';
import { BrainfileTUI } from '../BrainfileTUI.js';
import { createFixtureBoard, plain, lineWith } from './fixture-board.js';
import { mount, tick, TAB, SPACE, WIDE, type Harness } from './helpers.js';

function readTuiStateFile(h: Harness): { collapsed: string[] } | null {
  const statePath = path.join(h.fixture.tempDir, '.brainfile', 'state', 'tui.json');
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

describe('list collapse/expand (§A1)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26); // To Do column; epic-1 is the top row
  });
  afterEach(() => h.teardown());

  it('is expanded by default: ▾ glyph, children visible, no state file written yet', () => {
    expect(lineWith(h.frame(), 'epic-1')).toMatch(/^ ▾ epic-1\b/);
    expect(plain(h.frame())).toContain('Triage marketing board');
    expect(readTuiStateFile(h)?.collapsed ?? []).not.toContain('epic-1');
  });

  it('space collapses: ▸ glyph, "3 hidden" chip leads, children gone, state persisted', async () => {
    await h.press(SPACE);

    const row = lineWith(h.frame(), 'epic-1');
    expect(row).toMatch(/^ ▸ epic-1\b/);
    expect(row).toContain('3 hidden');
    expect(plain(h.frame())).not.toContain('Triage marketing board');
    expect(plain(h.frame())).not.toContain('Prune supervisor remnants');

    expect(readTuiStateFile(h)?.collapsed).toContain('epic-1');
  });

  it('space again restores: ▾ glyph, children back, id cleared from the state file', async () => {
    await h.press(SPACE);
    await h.press(SPACE);

    expect(lineWith(h.frame(), 'epic-1')).toMatch(/^ ▾ epic-1\b/);
    expect(plain(h.frame())).toContain('Triage marketing board');
    expect(readTuiStateFile(h)?.collapsed ?? []).not.toContain('epic-1');
  });

  it('does not change the column tab counts — collapse hides rows, not truth', async () => {
    const before = plain(h.frame()).split('\n')[0];
    expect(before).toContain('To Do 11*');

    await h.press(SPACE);
    const after = plain(h.frame()).split('\n')[0];
    expect(after).toContain('To Do 11*');
  });

  it('is a no-op on a row with no children', async () => {
    await h.press('j'); // task-1, a childless child row
    const before = plain(h.frame());
    await h.press(SPACE);
    expect(plain(h.frame())).toBe(before);
  });

});

describe('list collapse/expand — survives a restart (§A1)', () => {
  it('a fresh mount against the same board file reads the collapsed id back', async () => {
    const fixture = createFixtureBoard();
    try {
      const first = render(
        <BrainfileTUI filePath={fixture.brainfilePath} width={WIDE} height={26} />,
      );
      await tick(200);
      first.stdin.write(TAB); // To Do column
      await tick();
      first.stdin.write(SPACE); // collapse epic-1
      await tick();
      expect(lineWith(first.lastFrame(), 'epic-1')).toContain('3 hidden');
      first.unmount();

      // A brand-new BrainfileTUI instance against the *same* filePath — the
      // collapsed id must be read from `.brainfile/state/tui.json`, not kept
      // in memory (there is no shared memory between these two instances).
      const second = render(
        <BrainfileTUI filePath={fixture.brainfilePath} width={WIDE} height={26} />,
      );
      await tick(200);
      second.stdin.write(TAB);
      await tick();
      const row = lineWith(second.lastFrame(), 'epic-1');
      expect(row).toMatch(/^ ▸ epic-1\b/);
      expect(row).toContain('3 hidden');
      second.unmount();
    } finally {
      fixture.cleanup();
    }
  });
});
