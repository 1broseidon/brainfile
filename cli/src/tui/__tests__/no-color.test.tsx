/**
 * NO_COLOR (§C2 / rubric P4).
 *
 * Tested at two levels, deliberately, because `ink-testing-library`'s
 * `lastFrame()` carries NO ANSI here — jest runs without a TTY, so chalk
 * resolves to level 0 and emits no escape sequences at all (verified, not
 * assumed). Asserting "no colour codes present" on that frame would pass
 * whether or not the gate exists, which is worse than having no test.
 *
 * So instead:
 *
 *  1. **The gate itself** — `makePalette(true)` returns a palette whose every
 *     entry reads `undefined`, which is the value ink renders unstyled. Testing
 *     the factory rather than the module singleton avoids depending on when
 *     `theme.ts` first happened to be imported.
 *  2. **Selection does not depend on colour** — `DocumentRow` is invoked
 *     directly and its element tree inspected: the selected row is marked with
 *     `inverse` and carries no `color`/`backgroundColor` anywhere. Inverse is
 *     the one attribute the gate does not touch, which is exactly why the gate
 *     lives at the prop layer rather than on `chalk.level` — zeroing the level
 *     would kill `inverse` along with colour, taking the selection bar with it.
 *
 * Plus a legibility check on a real frame, which in this environment is already
 * an unstyled frame: glyphs, indentation, IDs and titles must all still carry
 * the layout on their own.
 */
import React from 'react';
import { mount, type Harness } from './helpers.js';
import { plain, lineWith } from './fixture-board.js';
import { makePalette, isNoColor, getContractStateColor, getTypeGlyph, GLYPHS, RULE } from '../theme.js';
import { DocumentRow } from '../components/DocumentRow.js';
import type { DocRow } from '../rows.js';

/** Every prop of every node in a rendered element tree, flattened. */
function collectProps(node: unknown, out: Array<Record<string, unknown>> = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectProps(child, out);
    return out;
  }
  if (!React.isValidElement(node)) return out;

  const props = node.props as Record<string, unknown>;
  out.push(props);
  if (props.children !== undefined) collectProps(props.children, out);
  return out;
}

function makeRow(overrides: Partial<DocRow['task']> = {}): DocRow {
  return {
    task: {
      id: 'task-1',
      title: 'A document',
      priority: 'high',
      tags: ['cli'],
      ...overrides,
    },
    depth: 0,
  } as DocRow;
}

describe('NO_COLOR (§C2 / P4)', () => {
  describe('the palette gate', () => {
    it('returns undefined for every colour under NO_COLOR', () => {
      const palette = makePalette(true);

      expect(palette.text).toBeUndefined();
      expect(palette.critical).toBeUndefined();
      expect(palette.textMuted).toBeUndefined();
      expect(palette.contractReady).toBeUndefined();
      // Every key, not just the ones this test happens to name.
      for (const key of Object.keys(makePalette(false))) {
        expect(palette[key as keyof typeof palette]).toBeUndefined();
      }
    });

    it('returns real colours when colour is allowed', () => {
      const palette = makePalette(false);

      expect(palette.text).toBe('#ffffff');
      expect(palette.contractReady).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('reads NO_COLOR per no-color.org — non-empty enables, empty does not', () => {
      expect(isNoColor({ NO_COLOR: '1' })).toBe(true);
      expect(isNoColor({ NO_COLOR: '0' })).toBe(true); // presence is what counts
      expect(isNoColor({ NO_COLOR: '' })).toBe(false);
      expect(isNoColor({})).toBe(false);
    });

    it('derived colours inherit the gate through the live PALETTE', () => {
      // `getContractStateColor` reads PALETTE, so whatever the process-level
      // gate decided, the derived helper agrees with it rather than hardcoding.
      const expected = isNoColor() ? undefined : expect.stringMatching(/^#[0-9a-f]{6}$/);
      expect(getContractStateColor('ready')).toEqual(expected);
    });

    it('leaves the glyph vocabulary alone — structure is not colour', () => {
      expect(RULE).toBe('─');
      expect(GLYPHS.warning).toBe('⚠');
      expect(getTypeGlyph('epic')).toBe('▸');
      expect(getTypeGlyph('adr')).toBe('●');
    });
  });

  describe('selection is a non-colour mechanism', () => {
    const renderRow = (selected: boolean, archived = false) =>
      collectProps(DocumentRow({ row: makeRow(), selected, width: 80, idWidth: 8, archived }));

    it('marks the selected row with inverse', () => {
      expect(renderRow(true).some((p) => p.inverse === true)).toBe(true);
    });

    it('sets no colour anywhere on a selected row', () => {
      const coloured = renderRow(true).filter(
        (p) => p.color !== undefined || p.backgroundColor !== undefined,
      );
      expect(coloured).toEqual([]);
    });

    it('does not invert an unselected row', () => {
      expect(renderRow(false).some((p) => p.inverse === true)).toBe(false);
    });

    it('inverts a selected ARCHIVED row too — selection outranks dimming', () => {
      const props = renderRow(true, true);
      expect(props.some((p) => p.inverse === true)).toBe(true);
      expect(props.filter((p) => p.color !== undefined)).toEqual([]);
    });

    it('never uses backgroundColor for selection anywhere', () => {
      for (const selected of [true, false]) {
        const withBg = renderRow(selected).filter((p) => p.backgroundColor !== undefined);
        expect(withBg).toEqual([]);
      }
    });
  });

  // This environment already produces an unstyled frame (chalk level 0), so
  // these assertions describe exactly what a NO_COLOR terminal shows.
  describe('the frame still reads without colour', () => {
    let h: Harness;

    beforeEach(async () => {
      h = await mount();
    });

    afterEach(() => {
      h.teardown();
    });

    it('emits no ANSI at all in this environment — the premise above', () => {
      expect(h.frame()).not.toContain(String.fromCharCode(27));
    });

    it('keeps glyphs, indentation, ids and titles', async () => {
      const frame = plain(h.frame());

      // Type glyphs (the structural signal colour never carried).
      expect(frame).toContain('▸');
      // IDs and titles.
      expect(frame).toContain('epic-1');
      expect(frame).toContain('Post-migration cleanup');
      // Hierarchy is indentation, and it survives.
      expect(lineWith(h.frame(), 'task-1')).toMatch(/^ {3,}/);
      // Priority is a glyph plus a word, not a colour alone.
      expect(frame).toContain('⚠');
      // Chrome rules still draw.
      expect(frame).toContain('─');
    });

    it('still announces the footer affordances', async () => {
      const frame = plain(h.frame());
      expect(frame).toContain('detail');
      expect(frame).toContain('q quit');
    });
  });
});
