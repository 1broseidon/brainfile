/**
 * Type-cycle (`t`) tests (v3.1 spec §A2) — plan item 2.
 *
 * The fixture's To Do column carries one document of every configured type
 * (task, epic, spec, adr, plan), and its board config declares `types` for
 * all five — exactly what `t`'s cycle is read from.
 */
import { plain } from './fixture-board.js';
import { mount, ESC, WIDE, type Harness } from './helpers.js';

const headerLine = (h: Harness) => plain(h.frame()).split('\n')[0];

describe('type-cycle (§A2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(WIDE, 26);
  });
  afterEach(() => h.teardown());

  it('cycles all → task → epic → spec → plan, narrowing the list and the header label each step', async () => {
    expect(headerLine(h)).not.toContain(' · ');

    await h.press('t'); // task
    expect(headerLine(h)).toContain(' · task');

    await h.press('t'); // epic
    expect(headerLine(h)).toContain(' · epic');
    expect(plain(h.frame())).toContain('epic-1');
    expect(plain(h.frame())).not.toContain('task-4');

    await h.press('t'); // spec
    expect(headerLine(h)).toContain(' · spec');

    await h.press('t'); // plan
    expect(headerLine(h)).toContain(' · plan');

    const frame = plain(h.frame());
    expect(frame).toContain('plan-1');
    expect(frame).not.toContain('task-4');
    expect(frame).not.toContain('adr-1');
    expect(frame).not.toContain('epic-1');
  });

  it('narrows the column tab counts to the active type', async () => {
    await h.press('t', 't', 't', 't'); // all → task → epic → spec → plan
    expect(headerLine(h)).toContain('To Do 1*');
  });

  it('composes with the / filter (AND)', async () => {
    await h.press('t', 't', 't', 't'); // plan
    await h.press('/', 't', 'u', 'i');

    const rule = plain(h.frame()).split('\n')[1] ?? '';
    expect(rule).toContain('1/1 match "tui"');
    expect(plain(h.frame())).toContain('plan-1');

    await h.press(ESC); // clear the search only — type filter stays
    expect(headerLine(h)).toContain(' · plan');
  });

  it('cycles back to all, restoring every type', async () => {
    await h.press('t', 't', 't', 't'); // plan
    await h.press('t'); // adr
    expect(headerLine(h)).toContain(' · adr');
    await h.press('t'); // done — the completed-history stop (adr-2 §B2)
    expect(headerLine(h)).toContain('done');
    await h.press('t'); // all

    expect(headerLine(h)).not.toContain(' · ');
    const frame = plain(h.frame());
    expect(frame).toContain('task-4');
    expect(frame).toContain('adr-1');
    expect(frame).toContain('epic-1');
  });
});
