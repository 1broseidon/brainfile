/**
 * Decisions in the TUI (task-19), part one: decisions leave the column list,
 * and get a view of their own — standing decisions by claim-key family,
 * history folded below — reached by the type cycle's decision stop and `D`.
 * Plus the keys, footer, help, NO_COLOR and narrow widths for that view.
 *
 * The board is `decision-board.ts`: six standing decisions (one a legacy
 * ADR), three retired in logs/, and work resting on both kinds.
 */
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildDocGraph, summarizeDecision, type Board, type Task } from '@brainfile/core';
import { plain, lineWith } from './fixture-board.js';
import { createDecisionBoard, createBoardWithoutDecisions } from './decision-board.js';
import { mount, tick, ESC, WIDE, type Harness } from './helpers.js';
import { readTuiState } from '../tuiState.js';
import { getTypeCycleOptions } from '../typeCycle.js';
import { buildDecisionView, splitDecisions, workOnRetiredDecisions, type DecisionLine } from '../decisions.js';
import { DecisionRow } from '../components/DecisionList.js';
import { GLYPHS } from '../theme.js';

const header = (h: Harness) => plain(h.frame()).split('\n')[0] ?? '';
const footer = (h: Harness) => plain(h.frame()).trimEnd().split('\n').pop() ?? '';
const mountDecisions = (width = WIDE, height = 26) =>
  mount(width, height, { column: 0, board: createDecisionBoard });

/** The selectable decisions, top to bottom, as the view draws them. */
const STANDING = ['decision-2', 'decision-5', 'decision-3', 'decision-4', 'decision-6', 'adr-1'];
const HISTORY = ['decision-1', 'decision-7', 'decision-8'];

// ── the model ─────────────────────────────────────────────────────────────

describe('decisions model', () => {
  const decision = (id: string, extra: Partial<Task> = {}) =>
    ({ id, title: id, type: 'decision', status: 'current', ...extra }) as Task;

  it('lifts decisions out of the columns and the archive, board first', () => {
    const board = {
      title: 'b',
      columns: [
        { id: 'todo', title: 'To Do', tasks: [{ id: 'task-1', title: 'work' } as Task, decision('decision-2')] },
      ],
    } as unknown as Board;
    const logs = [{ id: 'task-9', title: 'done', completedAt: '2026-01-01' } as Task, decision('decision-1', { status: 'superseded' })];

    const split = splitDecisions(board, logs);

    expect(split.board.columns[0].tasks.map((t) => t.id)).toEqual(['task-1']);
    expect(split.logs.map((t) => t.id)).toEqual(['task-9']);
    expect(split.decisions.map((t) => t.id)).toEqual(['decision-2', 'decision-1']);
  });

  it('counts a configured `like: decision` type as a decision, and gives it no stop of its own', () => {
    const board = {
      columns: [{ id: 'todo', title: 'To Do', tasks: [{ id: 'rfc-1', title: 'r', type: 'rfc' } as Task] }],
      types: { rfc: { like: 'decision' }, spike: {} },
    } as unknown as Board;

    const split = splitDecisions(board, []);
    expect(split.decisions.map((t) => t.id)).toEqual(['rfc-1']);
    expect(getTypeCycleOptions(split.board, split.decisions)).toEqual(['all', 'task', 'decision', 'spike']);
  });

  it('has a decision stop only when the board has decisions or a decision type', () => {
    expect(getTypeCycleOptions({ columns: [] } as unknown as Board, [])).toEqual(['all', 'task']);
    expect(getTypeCycleOptions({ columns: [] } as unknown as Board, [decision('decision-1')])).toEqual([
      'all',
      'task',
      'decision',
    ]);
  });

  it('groups standing decisions by family, unfiled last, and folds history below', () => {
    const decisions = [
      decision('decision-2', { claimKey: 'storage.cache' }),
      decision('decision-3', { claimKey: 'dependency.http' }),
      decision('decision-4'),
      decision('decision-1', { claimKey: 'dependency.http', status: 'superseded', supersededBy: 'decision-3' }),
    ];

    const folded = buildDecisionView(decisions, { historyOpen: false });
    const shape = (lines: DecisionLine[]) =>
      lines.map((line) =>
        line.kind === 'row' ? line.task.id : line.kind === 'heading' ? `# ${line.label}` : line.kind === 'history' ? `history ${line.open}` : line.kind,
      );
    expect(shape(folded.lines)).toEqual([
      '# dependency', 'decision-3', 'gap',
      '# storage', 'decision-2', 'gap',
      '# unfiled', 'decision-4', 'gap',
      'history false',
    ]);
    expect(folded.selectable.map((t) => t.id)).toEqual(['decision-3', 'decision-2', 'decision-4']);

    const open = buildDecisionView(decisions, { historyOpen: true });
    expect(open.selectable.map((t) => t.id)).toEqual(['decision-3', 'decision-2', 'decision-4', 'decision-1']);
    expect(open.historyCount).toBe(1);
  });

  it('finds the open work resting on a retired decision, not on a current or proposed one', () => {
    const graph = buildDocGraph([
      { id: 'task-1', title: 'a', decisions: ['decision-1'] } as Task,
      { id: 'task-2', title: 'b', decisions: ['decision-2'] } as Task,
      { id: 'task-3', title: 'c', decisions: ['decision-3'] } as Task,
      { id: 'task-4', title: 'd', decisions: ['adr-1'] } as Task,
      { id: 'task-5', title: 'e', decisions: ['decision-1'], completedAt: '2026-01-01' } as Task,
      decision('decision-1', { status: 'superseded', supersededBy: 'decision-2' }),
      decision('decision-2'),
      decision('decision-3', { status: 'stale' }),
      { id: 'adr-1', title: 'adr', type: 'adr' } as Task,
    ]);
    expect([...workOnRetiredDecisions(graph)].sort()).toEqual(['task-1', 'task-3']);
  });
});

// ── decisions leave the column list ───────────────────────────────────────

describe('decisions leave the column list', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountDecisions();
  });
  afterEach(() => h.teardown());

  it('puts no decision in any column, and counts only the work', async () => {
    expect(header(h)).toContain('To Do 3*');
    expect(header(h)).toContain('Doing 1');
    const frame = plain(h.frame());
    expect(frame).not.toContain('decision-');
    expect(frame).not.toContain('adr-1');
    expect(footer(h)).toContain('3 items');

    await h.press('l'); // Doing: only task-14, which rests on adr-1
    expect(plain(h.frame())).toContain('task-14');
    expect(plain(h.frame())).not.toContain('adr-1 ');
  });

  it('keeps retired decisions out of the done list: they were not completed', async () => {
    await h.press('L');
    const frame = plain(h.frame());
    expect(frame).toContain('task-13');
    for (const id of HISTORY) expect(frame).not.toContain(id);
  });
});

// ── the decisions view ────────────────────────────────────────────────────

describe('decisions view', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountDecisions();
  });
  afterEach(() => h.teardown());

  it('opens on D, named in the header in place of the column tabs', async () => {
    await h.press('D');
    expect(header(h)).toContain('decisions ▸ decisions');
    expect(header(h)).not.toContain('To Do');
    expect(footer(h).trimEnd().endsWith('decisions')).toBe(true);
  });

  it('groups standing decisions by claim-key family, alphabetical, unfiled last', async () => {
    await h.press('D');
    const lines = plain(h.frame()).split('\n');
    const at = (text: string) => lines.findIndex((line) => line.includes(text));

    const order = ['dependency (1)', 'release (1)', 'storage (2)', 'style (1)', 'unfiled (1)', 'history (3)'];
    const positions = order.map(at);
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    // Every standing decision sits under its family, in order.
    const rows = STANDING.map(at);
    expect([...rows].sort((a, b) => a - b)).toEqual(rows);
    expect(at('decision-3')).toBeGreaterThan(at('storage (2)'));
    expect(at('decision-4')).toBeLessThan(at('style (1)'));
    // A blank line between families.
    expect(lines[at('release (1)') - 1].trim()).toBe('');
  });

  it('leads each row with ● and its id, and says at rest only kind, proposed or review', async () => {
    await h.press('D', 'j'); // move off decision-2, so no row shows its claim key
    expect(lineWith(h.frame(), 'decision-2')).toMatch(/^ ● decision-2\s+Never axios/);
    // decision: nothing on the right
    expect(lineWith(h.frame(), 'decision-2')).toMatch(/fetch is it\.$/);
    expect(lineWith(h.frame(), 'decision-3')).toMatch(/at this size\.$/);
    // a kind other than decision
    expect(lineWith(h.frame(), 'decision-4')).toMatch(/constraint$/);
    expect(lineWith(h.frame(), 'decision-6')).toMatch(/preference$/);
    // valid until far ahead: no date at rest
    expect(lineWith(h.frame(), 'decision-6')).not.toContain('2999');
    // a legacy ADR, still proposed
    expect(lineWith(h.frame(), 'adr-1')).toMatch(/^ ● adr-1\s+Drop V1.*proposed$/);
    // past validUntil: review (the selected row, so the frame shows it inverted)
    expect(lineWith(h.frame(), 'decision-5')).toMatch(/review$/);
  });

  it('reveals the rest of the claim key on the selected row only', async () => {
    await h.press('D');
    expect(lineWith(h.frame(), 'decision-2')).toMatch(/^▌● decision-2.*http-client$/);
    await h.press('j');
    expect(lineWith(h.frame(), 'decision-2')).not.toContain('http-client');
    expect(lineWith(h.frame(), 'decision-5')).toMatch(/^▌● decision-5.*window {2}review$/);
  });

  it('folds history below; L opens it with ○ rows that say where each went', async () => {
    await h.press('D');
    expect(plain(h.frame())).toContain('▸ history (3)');
    for (const id of HISTORY) expect(plain(h.frame())).not.toContain(id);
    expect(footer(h)).toContain('6 items');
    expect(footer(h)).toContain('L history');

    await h.press('L');
    expect(plain(h.frame())).toContain('▾ history (3)');
    expect(lineWith(h.frame(), 'decision-1')).toMatch(/^ ○ decision-1\s+Use fetch.*superseded → decision-2$/);
    expect(lineWith(h.frame(), 'decision-7')).toMatch(/rejected$/);
    expect(lineWith(h.frame(), 'decision-8')).toMatch(/stale$/);
    // newest retirement first
    const frame = plain(h.frame());
    expect(frame.indexOf('decision-1')).toBeLessThan(frame.indexOf('decision-7'));
    expect(frame.indexOf('decision-7')).toBeLessThan(frame.indexOf('decision-8'));
    expect(footer(h)).toContain('9 items');
    expect(footer(h)).toContain('L hide history');

    await h.press('L');
    expect(plain(h.frame())).toContain('▸ history (3)');
  });

  it('walks decisions only: headings and gaps are not stops', async () => {
    await h.press('D', 'L', 'G');
    expect(lineWith(h.frame(), 'decision-8')).toMatch(/^▌○ decision-8/);
    await h.press('g', 'j', 'j');
    expect(lineWith(h.frame(), 'decision-3')).toMatch(/^▌● decision-3/);
  });

  it('is the type cycle\'s decision stop', async () => {
    await h.press('t'); // task
    expect(header(h)).toContain(' · task');
    await h.press('t'); // decision
    expect(header(h)).toContain('▸ decisions');
    expect(plain(h.frame())).toContain('dependency (1)');
    await h.press('t'); // all
    expect(header(h)).toContain('To Do 3*');
  });

  it('D returns to the stop it left from', async () => {
    await h.press('t'); // task
    await h.press('D');
    expect(header(h)).toContain('▸ decisions');
    await h.press('D');
    expect(header(h)).toContain(' · task');
    expect(header(h)).toContain('To Do');
  });

  it('filters with / like every other list, against all decisions', async () => {
    await h.press('D', '/', 'a', 'x', 'i', 'o', 's');
    const rule = plain(h.frame()).split('\n')[1] ?? '';
    expect(rule).toContain('1/9 match "axios"');
    const frame = plain(h.frame());
    expect(frame).toContain('decision-2');
    expect(frame).not.toContain('decision-5');
    expect(frame).not.toContain('storage');

    await h.press(ESC);
    expect(plain(h.frame())).toContain('decision-5');
  });

  it('says how decisions change instead of moving, completing, adding or deleting one', async () => {
    await h.press('D');
    const before = fs.readdirSync(h.fixture.boardDir).sort();

    await h.press('c');
    expect(plain(h.frame())).toContain('decision-2 cannot be completed');
    await h.press('m');
    expect(plain(h.frame())).toContain('Decisions have no column');
    await h.press('d');
    expect(plain(h.frame())).toContain('Decisions change with brainfile decide, supersede or retire');
    expect(plain(h.frame())).not.toContain('delete');
    await h.press('a');
    expect(plain(h.frame())).not.toContain('add to');

    expect(fs.readdirSync(h.fixture.boardDir).sort()).toEqual(before);
    expect(header(h)).toContain('▸ decisions');
  });

  it('does not cycle columns: there are none', async () => {
    await h.press('D');
    const before = plain(h.frame());
    await h.press('l', 'h');
    expect(plain(h.frame())).toBe(before);
  });

  it('is resumed next session, like any other stop', async () => {
    await h.press('D');
    await tick(100);
    expect(readTuiState(h.fixture.brainfilePath).lastTypeFilter).toBe('decision');
  });
});

describe('decisions view — a board with none', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mount(WIDE, 26, { column: 0, board: createBoardWithoutDecisions });
  });
  afterEach(() => h.teardown());

  it('keeps D reachable and says how decisions are made', async () => {
    expect(footer(h)).not.toContain('D decisions');
    await h.press('D');
    expect(header(h)).toContain('▸ decisions');
    expect(plain(h.frame())).toContain('No decisions yet · brainfile decide records one');
    expect(footer(h)).toContain('0 items');
    expect(footer(h)).not.toContain('history');
  });

  it('has no decision stop in the type cycle', async () => {
    await h.press('t'); // task
    await h.press('t'); // all, not the decisions view
    expect(header(h)).toContain('▸ To Do 3*');
    expect(header(h)).not.toContain(' · ');
  });
});

// ── footer and help ───────────────────────────────────────────────────────

describe('decisions — footer and help', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountDecisions(WIDE, 30);
  });
  afterEach(() => h.teardown());

  it('advertises D on a board that has decisions', () => {
    expect(footer(h)).toContain('D decisions');
  });

  it('offers only what applies to a decision in its view', async () => {
    await h.press('D');
    const text = footer(h);
    expect(text).toContain('↵ detail');
    expect(text).toContain('e edit');
    expect(text).toContain('L history');
    expect(text).toContain('t type');
    expect(text).toContain('D board');
    expect(text).toContain('q quit');
    for (const absent of ['m move', 'c complete', 'a add', 'tab column']) expect(text).not.toContain(absent);
  });

  it('lists D and L in the help overlay', async () => {
    await h.press('?');
    const frame = plain(h.frame());
    expect(frame).toMatch(/\bD\s+decisions\b/);
    expect(frame).toMatch(/\bL\s+done · history\b/);
    expect(frame).toMatch(/↵\s+open child or link/);
  });
});

// ── NO_COLOR ──────────────────────────────────────────────────────────────

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

describe('decisions view — NO_COLOR', () => {
  const rowLine = (retired: boolean) => {
    const task = {
      id: 'decision-1',
      title: 'Use fetch for HTTP.',
      type: 'decision',
      claimKey: 'dependency.http-client',
      ...(retired ? { status: 'superseded', supersededBy: 'decision-2' } : { status: 'current', validUntil: '2020-01-01' }),
    } as unknown as Task;
    return { kind: 'row' as const, task, summary: summarizeDecision(task), retired, index: 0 };
  };
  const render = (retired: boolean, selected: boolean) =>
    collectProps(DecisionRow({ line: rowLine(retired), selected, width: 80, idWidth: 10 }));
  const texts = (props: Array<Record<string, unknown>>) =>
    props.flatMap((p) => (typeof p.children === 'string' ? [p.children] : []));

  it('marks the selected row with the cursor glyph and inverse, and no colour', () => {
    const props = render(false, true);
    expect(texts(props)).toContain(GLYPHS.cursor);
    expect(props.some((p) => p.inverse === true)).toBe(true);
    expect(props.filter((p) => p.color !== undefined || p.backgroundColor !== undefined)).toEqual([]);
  });

  it('leaves an unselected row uninverted, without the cursor glyph', () => {
    const props = render(false, false);
    expect(props.some((p) => p.inverse === true)).toBe(false);
    expect(texts(props)).not.toContain(GLYPHS.cursor);
  });

  it('says standing or retired with a character, not a colour', () => {
    expect(texts(render(false, false)).join('')).toContain('● ');
    expect(texts(render(true, false)).join('')).toContain('○ ');
    // and `review` and where a retired one went are words
    expect(texts(render(false, false))).toContain('review');
    expect(texts(render(true, false))).toContain('superseded → decision-2');
  });

  it('reads without colour on a real frame (this environment has none)', async () => {
    const h = await mountDecisions();
    try {
      await h.press('D', 'L');
      expect(h.frame()).not.toContain(String.fromCharCode(27));
      expect(lineWith(h.frame(), 'decision-2')).toMatch(/^▌● decision-2/);
      expect(lineWith(h.frame(), 'decision-1')).toMatch(/^ ○ decision-1/);
      expect(plain(h.frame())).toContain('▾ history (3)');
    } finally {
      h.teardown();
    }
  });
});

// ── narrow widths ─────────────────────────────────────────────────────────

describe('decisions view — narrow', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await mountDecisions(60, 26);
  });
  afterEach(() => h.teardown());

  it('never overflows, and the title yields before a signal does', async () => {
    await h.press('D', 'L');
    for (const line of plain(h.frame()).split('\n')) expect(line.length).toBeLessThanOrEqual(60);
    const db = lineWith(h.frame(), 'decision-4');
    expect(db).toContain('…');
    expect(db).toMatch(/constraint$/);
    expect(lineWith(h.frame(), 'decision-1')).toMatch(/^ ○ decision-1\s+Use fetch.*superseded → decision-2$/);
  });

  it('keeps the selected title whole rather than reveal the claim key into it', async () => {
    await h.press('D', 'j', 'j'); // decision-3: a long title, the key would not fit
    const row = lineWith(h.frame(), 'decision-3');
    expect(row).toMatch(/^▌● decision-3/);
    // The title runs to the edge and is cut there; nothing was revealed after it.
    expect(row).toMatch(/…$/);
  });
});

// Keep the fixture's files honest: nothing in this suite should write a board file.
describe('decisions view — read-only on disk', () => {
  it('leaves every decision file as it was after a full tour', async () => {
    const h = await mountDecisions();
    try {
      const snapshot = () =>
        Object.fromEntries(
          [h.fixture.boardDir, h.fixture.logsDir].flatMap((dir) =>
            fs.readdirSync(dir).map((name) => [path.join(path.basename(dir), name), fs.readFileSync(path.join(dir, name), 'utf-8')]),
          ),
        );
      const before = snapshot();
      await h.press('D', 'L', 'j', 'c', 'm', 'p', 'A', 'n', ESC, 'G', ' ', 'D');
      await tick(200);
      expect(snapshot()).toEqual(before);
    } finally {
      h.teardown();
    }
  });
});
