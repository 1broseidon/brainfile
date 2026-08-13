/**
 * Live-refresh cursor survival (§C4 / rubric P3) — the missing guarantee test.
 *
 * P3: "External mutation (MCP/CLI/git) appears in the open TUI ~instantly;
 * selection and scroll survive the refresh." The TUI is a viewport onto files,
 * not a copy of them, so these tests mutate the board **on disk, behind the
 * TUI's back** — exactly what `brainfile move`, an MCP tool call or a `git
 * checkout` does — and then assert on the frame.
 *
 * The selection guarantee is id-keyed, and that is the whole point: inserting a
 * document ABOVE the cursor must not slide the selection onto a different one.
 * An index-preserving implementation passes a naive "still row 3" test and
 * fails this one.
 *
 * Timing: chokidar runs with `usePolling: true, interval: 750` and
 * `awaitWriteFinish.stabilityThreshold: 250`, so a refresh needs ~1s of real
 * time to land. `settle()` encodes that rather than scattering magic numbers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';
import { jest } from '@jest/globals';
import { mount, tick, ESC, ENTER, NARROW, type Harness } from './helpers.js';
import { plain, lineWith } from './fixture-board.js';

// Each case waits on real chokidar polling, so the default 5s is not enough.
jest.setTimeout(60_000);

/**
 * Wait for chokidar's poll interval + write-finish debounce to produce a
 * refresh. A fixed sleep here is flaky: the watcher polls at 750ms with a
 * 250ms stability threshold, so one busy scheduling slice is enough to push a
 * refresh past any constant. Poll for the expected outcome instead, and give up
 * generously — on the give-up path we simply return and let the caller's own
 * expect() report the real assertion failure, so nothing is weakened.
 */
async function settleUntil(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      await tick(120); // let the frame finish painting
      return;
    }
    await tick(100);
  }
}

/** Watcher settle with no single observable to poll on. */
const settle = () => tick(2500);

/** Poll until the rendered frame contains `text`. */
const settleForText = (h: Harness, text: string) =>
  settleUntil(() => plain(h.frame()).includes(text));

/** Poll until the rendered frame no longer contains `text`. */
const settleForNoText = (h: Harness, text: string) =>
  settleUntil(() => !plain(h.frame()).includes(text));

/** Write a new document straight into the board directory. */
function addDocOnDisk(h: Harness, task: Partial<Task> & { id: string; title: string }) {
  writeTaskFile(
    path.join(h.fixture.boardDir, taskFileName(task.id)),
    { column: 'todo', position: 0, ...task } as Task,
    '',
  );
}

/** The list row currently drawn inverse is not visible in stripped text, so
 *  selection is read from the detail view instead: `↵` opens whatever is
 *  selected, which is the only observable that cannot lie about it. */
async function selectedIdViaDetail(h: Harness): Promise<string> {
  await h.press(ENTER);
  await tick(150);
  const frame = plain(h.frame());
  // The detail header line carries the document id.
  const match = frame.match(/\b((?:task|epic|spec|adr|plan)-\d+)\b/);
  const id = match?.[1] ?? '';
  await h.press(''); // esc back to the list
  await tick(150);
  return id;
}

describe('live refresh (§C4 / P3)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await mount(NARROW);
  });

  afterEach(() => {
    h.teardown();
  });

  it('shows an externally added document without any keystroke', async () => {
    expect(plain(h.frame())).not.toContain('task-777');

    addDocOnDisk(h, { id: 'task-777', title: 'Added from outside' });
    await settleForText(h, 'task-777');

    const frame = plain(h.frame());
    expect(frame).toContain('task-777');
    expect(frame).toContain('Added from outside');
  });

  it('shows an externally removed document disappearing', async () => {
    expect(plain(h.frame())).toContain('task-9');

    fs.unlinkSync(path.join(h.fixture.boardDir, 'task-9.md'));
    await settleForNoText(h, 'task-9');

    expect(plain(h.frame())).not.toContain('task-9');
  });

  it('reflects an external edit to the selected document', async () => {
    const filePath = path.join(h.fixture.boardDir, 'epic-1.md');
    const content = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, content.replace('Post-migration cleanup', 'Renamed externally'));
    await settleForText(h, 'Renamed externally');

    expect(plain(h.frame())).toContain('Renamed externally');
  });

  it('keeps the SAME document selected when one is inserted above it', async () => {
    // Move down a few rows so there is something above the cursor to insert into.
    await h.press('j', 'j', 'j');
    const before = await selectedIdViaDetail(h);
    expect(before).toBeTruthy();

    // `position: 0` puts this new doc at the top of the column, above the cursor.
    addDocOnDisk(h, { id: 'task-778', title: 'Inserted above', position: -1 });
    await settleForText(h, 'task-778');

    expect(plain(h.frame())).toContain('task-778');
    // Same id — not "same row index", which would now be a different document.
    expect(await selectedIdViaDetail(h)).toBe(before);
  });

  it('clamps the selection without throwing when the selected doc is deleted', async () => {
    await h.press('G'); // last row — the worst case for a clamp bug
    const before = await selectedIdViaDetail(h);
    expect(before).toBeTruthy();

    fs.unlinkSync(path.join(h.fixture.boardDir, `${before}.md`));
    await settleForNoText(h, before);

    // Still rendering a usable list, and the deleted doc is gone.
    const frame = plain(h.frame());
    expect(frame).not.toContain(before);
    expect(frame).toContain('epic-1');
    // And the cursor landed on something real, not off the end.
    expect(await selectedIdViaDetail(h)).toBeTruthy();
  });

  it('survives a refresh in the done stop, keyed by id', async () => {
    await h.press('L');
    await h.press('j'); // second archived doc
    const before = await selectedIdViaDetail(h);
    expect(before).toBeTruthy();

    // Archive a further document externally, sorting ahead of the others.
    writeTaskFile(
      path.join(h.fixture.logsDir, taskFileName('task-91')),
      {
        id: 'task-91',
        title: 'Completed even more recently',
        column: 'done',
        completedAt: '2026-08-12T23:00:00.000Z',
      } as Task,
      '',
    );
    await settleForText(h, 'task-91');

    expect(plain(h.frame())).toContain('task-91');
    expect(await selectedIdViaDetail(h)).toBe(before);
  });

  it('picks up a document completed externally into logs/', async () => {
    const from = path.join(h.fixture.boardDir, 'task-4.md');
    const body = fs.readFileSync(from, 'utf-8');
    fs.unlinkSync(from);
    fs.writeFileSync(
      path.join(h.fixture.logsDir, 'task-4.md'),
      body.replace(/^column:.*$/m, 'completedAt: 2026-08-12T18:00:00.000Z'),
      'utf-8',
    );
    await settleForNoText(h, 'task-4');

    // Gone from the board list…
    expect(plain(h.frame())).not.toContain('task-4');

    // …and present in the done stop.
    await h.press('L');
    expect(plain(h.frame())).toContain('task-4');
  });

  it('keeps the detail view open on the same document across a refresh', async () => {
    await h.press(ENTER); // detail on epic-1
    await tick();
    expect(plain(h.frame())).toContain('Post-migration cleanup');

    addDocOnDisk(h, { id: 'task-779', title: 'Noise from outside' });
    // Nothing to poll on here: the detail view is open, so the new document is
    // deliberately NOT on screen — the whole assertion is that the frame does
    // not change out from under the user. Fall back to a generous fixed wait.
    await settle();

    // Still in detail, still the same document.
    const frame = plain(h.frame());
    expect(frame).toContain('Post-migration cleanup');
    expect(lineWith(h.frame(), 'esc back')).toContain('esc back');
  });
});
