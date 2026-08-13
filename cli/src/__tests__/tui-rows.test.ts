/**
 * Row model and design-system unit tests for TUI v3.
 *
 * These replace the v2 `TaskList.test.ts`, which asserted that a prop literal
 * appeared in `TaskList.tsx`'s *source text*. That guarded contract-badge
 * wiring by proxy; the same guarantee is now covered directly — the state→
 * colour mapping here, and the rendered chip itself in the render suites.
 *
 * Everything exercised in this file is ink-free, so it belongs in the ordinary
 * CommonJS Jest project rather than the ESM render project.
 */
import type { Task } from '@brainfile/core';
import { buildRows, windowRows } from '../tui/rows';
import { getContractStateColor, PALETTE, getTypeGlyph, makePalette } from '../tui/theme';
import { isCompletable, getSubtaskProgress, getContractState, getDocType } from '../tui/utils';

const task = (overrides: Partial<Task> & { id: string }): Task =>
  ({ title: `Title for ${overrides.id}`, ...overrides }) as Task;

describe('buildRows', () => {
  it('emits children directly under a visible parent, indented one level', () => {
    const rows = buildRows([
      task({ id: 'epic-1', type: 'epic' }),
      task({ id: 'task-4' }),
      task({ id: 'task-1', parentId: 'epic-1' }),
      task({ id: 'task-2', parentId: 'epic-1' }),
    ]);

    expect(rows.map((r) => [r.task.id, r.depth])).toEqual([
      ['epic-1', 0],
      ['task-1', 1],
      ['task-2', 1],
      ['task-4', 0],
    ]);
  });

  it('keeps a document at depth 0 and records an orphan reference when its parent is not visible', () => {
    const rows = buildRows([task({ id: 'task-9', parentId: 'epic-1' })]);

    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
    expect(rows[0].orphanParentId).toBe('epic-1');
  });

  it('does not mark a child as an orphan when its parent is visible', () => {
    const rows = buildRows([task({ id: 'epic-1', type: 'epic' }), task({ id: 'task-1', parentId: 'epic-1' })]);
    expect(rows[1].orphanParentId).toBeUndefined();
  });

  it('emits every document exactly once even with a parentId cycle', () => {
    const rows = buildRows([
      task({ id: 'a', parentId: 'b' }),
      task({ id: 'b', parentId: 'a' }),
      task({ id: 'c', parentId: 'c' }),
    ]);

    expect(rows.map((r) => r.task.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('windowRows', () => {
  const rows = buildRows(Array.from({ length: 40 }, (_, i) => task({ id: `task-${i}` })));

  it('returns everything when the list fits', () => {
    expect(windowRows(rows.slice(0, 5), 0, 10)).toEqual({ visible: rows.slice(0, 5), start: 0 });
  });

  it('centres the selection and clamps at both ends', () => {
    expect(windowRows(rows, 0, 10).start).toBe(0);
    expect(windowRows(rows, 20, 10).start).toBe(15);
    expect(windowRows(rows, 39, 10).start).toBe(30);
  });

  it('always keeps the selection inside the returned window', () => {
    for (const index of [0, 7, 19, 33, 39]) {
      const { start } = windowRows(rows, index, 10);
      expect(index).toBeGreaterThanOrEqual(start);
      expect(index).toBeLessThan(start + 10);
    }
  });
});

describe('type glyphs', () => {
  it('maps every document type the design names, and nothing else', () => {
    expect(getTypeGlyph('epic')).toBe('▸');
    expect(getTypeGlyph('spec')).toBe('◆');
    expect(getTypeGlyph('adr')).toBe('●');
    expect(getTypeGlyph('plan')).toBe('⎘');
    expect(getTypeGlyph('task')).toBe('');
    expect(getTypeGlyph(undefined)).toBe('');
    expect(getTypeGlyph('bug')).toBe('');
  });
});

describe('contract state colours', () => {
  it('covers all six states rather than defaulting most of them to muted', () => {
    expect(getContractStateColor('draft')).toBe(PALETTE.contractDraft);
    expect(getContractStateColor('ready')).toBe(PALETTE.contractReady);
    expect(getContractStateColor('in_progress')).toBe(PALETTE.contractInProgress);
    expect(getContractStateColor('delivered')).toBe(PALETTE.contractDelivered);
    expect(getContractStateColor('done')).toBe(PALETTE.contractDone);
    expect(getContractStateColor('failed')).toBe(PALETTE.contractFailed);
    expect(getContractStateColor('blocked')).toBe(PALETTE.contractFailed);
  });

  it('gives each state a distinct colour except the shared failed/blocked red', () => {
    // Assert against an ungated palette so NO_COLOR in the test env does not
    // collapse every entry to undefined and hide a mapping collision.
    const palette = makePalette(false);
    const colors = [
      palette.contractDraft,
      palette.contractReady,
      palette.contractInProgress,
      palette.contractDelivered,
      palette.contractDone,
      palette.contractFailed,
    ];
    expect(new Set(colors).size).toBe(6);
  });
});

describe('document helpers', () => {
  it('treats an untyped document as a task', () => {
    expect(getDocType(task({ id: 'task-1' }))).toBe('task');
    expect(getDocType(task({ id: 'adr-1', type: 'ADR' }))).toBe('adr');
  });

  it('never offers completion for an adr, but does for every other type', () => {
    expect(isCompletable(task({ id: 'adr-1', type: 'adr' }))).toBe(false);
    expect(isCompletable(task({ id: 'task-1' }))).toBe(true);
    expect(isCompletable(task({ id: 'epic-1', type: 'epic' }))).toBe(true);
    expect(isCompletable(task({ id: 'spec-1', type: 'spec' }))).toBe(true);
    expect(isCompletable(undefined)).toBe(false);
  });

  it('reports subtask progress only when there is a checklist', () => {
    expect(getSubtaskProgress(task({ id: 'task-1' }))).toBeUndefined();
    expect(
      getSubtaskProgress(
        task({
          id: 'task-1',
          subtasks: [
            { id: 'st-1', title: 'a', completed: true },
            { id: 'st-2', title: 'b', completed: false },
            { id: 'st-3', title: 'c', completed: false },
          ],
        }),
      ),
    ).toBe('1/3');
  });

  it('reads contract state off the document', () => {
    expect(getContractState(task({ id: 'task-1' }))).toBeUndefined();
    expect(
      getContractState(task({ id: 'task-1', contract: { status: 'ready' } as never })),
    ).toBe('ready');
  });
});
