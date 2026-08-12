/**
 * Keybinds (§C6 / rubric P2) and the resume view (§C3 / rubric P9).
 *
 * P2 is "keys never silently change meaning". adr-2 retires three groups, and
 * a retired key must become a genuine no-op rather than quietly doing something
 * else:
 *
 *  - `[` / `]` — duplicated h/l and tab for no gain.
 *  - `1` / `2` / `3` — the rules/logs panels they switched to are gone.
 *  - every rules/logs modal key.
 *
 * P9 is "any non-default view state has an on-screen indicator", tested here as
 * the round trip: a resumed column and type filter both come back visible.
 */
import { mount, tick, TAB, type Harness } from './helpers.js';
import { plain } from './fixture-board.js';
import { readTuiState } from '../tuiState.js';

function headerLine(h: Harness): string {
  return plain(h.frame()).split('\n')[0] ?? '';
}

/** The active column, read off the header's `*` marker. */
function activeColumn(h: Harness): string {
  const match = headerLine(h).match(/([A-Za-z ]+?) \d+\*/);
  return match?.[1]?.trim() ?? '';
}

describe('keybinds (§C6 / P2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount();
  });

  afterEach(() => {
    h.teardown();
  });

  it('cycles columns with l and h', async () => {
    expect(activeColumn(h)).toBe('To Do');

    await h.press('l');
    expect(activeColumn(h)).toBe('In Progress');

    await h.press('h');
    expect(activeColumn(h)).toBe('To Do');
  });

  it('keeps tab as an alias for the same cycle', async () => {
    await h.press(TAB);
    expect(activeColumn(h)).toBe('In Progress');
  });

  it('retires [ and ] — they no longer move the column', async () => {
    const before = activeColumn(h);

    await h.press(']');
    expect(activeColumn(h)).toBe(before);

    await h.press('[');
    expect(activeColumn(h)).toBe(before);
  });

  it('retires 1 / 2 / 3 — no panel switching remains', async () => {
    const before = plain(h.frame());

    await h.press('1');
    await h.press('2');
    await h.press('3');
    await tick();

    // Same board list, no rules or logs panel anywhere.
    const after = plain(h.frame());
    expect(after).toBe(before);
    expect(after).not.toContain('rules');
  });

  it('leaves no rules panel behind for the panel keys to reach', async () => {
    // `2` used to open the rules panel, where `a`/`e`/`d` meant add/edit/delete
    // RULE. `e` and `d` still exist on the board with their board meanings, so
    // the thing to prove is that `2` cannot put the TUI somewhere those keys
    // would mean something else.
    //
    // Deliberately NOT pressing `e` here: `e` now genuinely hands the terminal
    // to `$EDITOR`, and with none set it falls back to `vi`, which blocks on
    // inherited stdio forever. Editor behaviour is covered by
    // editor-handoff.test.tsx, which scripts a fake editor.
    const before = plain(h.frame());

    await h.press('2');
    await tick(200);

    // Frame is byte-identical: `2` changed nothing at all.
    expect(plain(h.frame())).toBe(before);
    expect(plain(h.frame())).toContain('epic-1');
    // The header still shows column tabs, not a panel label.
    expect(headerLine(h)).toContain('To Do');
    expect(headerLine(h)).not.toContain('rules');
  });
});

describe('resume view (§C3 / P9)', () => {
  it('persists the column and type filter, and comes back into them', async () => {
    const first = await mount();
    try {
      await first.press(TAB); // → In Progress
      await first.press(TAB); // → Review
      await first.press('t'); // → task
      await tick(100);

      const persisted = readTuiState(first.fixture.brainfilePath);
      expect(persisted.lastColumn).toBe('review');
      expect(persisted.lastTypeFilter).toBe('task');
    } finally {
      first.app.unmount();
    }

    // A brand-new mount against the same workspace.
    const { render } = await import('ink-testing-library');
    const React = (await import('react')).default;
    const { BrainfileTUI } = await import('../BrainfileTUI.js');

    const second = render(
      React.createElement(BrainfileTUI, {
        filePath: first.fixture.brainfilePath,
        width: 120,
        height: 26,
      }),
    );
    try {
      await tick(300);
      const header = plain(second.lastFrame() ?? '').split('\n')[0] ?? '';

      // Both resumed states are VISIBLE, which is what P9 asks for.
      expect(header).toMatch(/Review \d+\*/);
      expect(header).toContain('· task');
    } finally {
      second.unmount();
      first.fixture.cleanup();
    }
  });

  it('falls back to defaults when the persisted column no longer exists', async () => {
    const h = await mount();
    try {
      await h.press(TAB); // remember some column
      await tick(100);

      // Rewrite state to name a column the board does not have.
      const { patchTuiState } = await import('../tuiState.js');
      patchTuiState(h.fixture.brainfilePath, { lastColumn: 'a-column-that-vanished' });

      const { render } = await import('ink-testing-library');
      const React = (await import('react')).default;
      const { BrainfileTUI } = await import('../BrainfileTUI.js');

      const app = render(
        React.createElement(BrainfileTUI, {
          filePath: h.fixture.brainfilePath,
          width: 120,
          height: 26,
        }),
      );
      await tick(300);

      // First column, no crash.
      const header = plain(app.lastFrame() ?? '').split('\n')[0] ?? '';
      expect(header).toMatch(/Backlog \d+\*/);
      app.unmount();
    } finally {
      h.teardown();
    }
  });
});
