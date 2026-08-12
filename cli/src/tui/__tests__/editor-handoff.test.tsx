/**
 * `$EDITOR` handoff (§C1 / rubric P8).
 *
 * The old `e` wrote a synthetic YAML snapshot of the task to a temp file, ran
 * the editor on THAT, then diffed the result back into a patch — a second
 * format to keep in sync, and a lossy one (it never carried the body, the
 * contract, or anything the snapshot builder had not been taught about).
 *
 * The bar now: `e` hands the terminal to `$EDITOR` pointed at the document's
 * own `.md` file, and whatever the editor writes is simply what the document
 * becomes.
 *
 * How these tests know which file was opened: the fake editor appends a marker
 * to whatever path it is given, and the assertions scan the fixture workspace
 * for files carrying it. That is stronger than trusting a recorded argv — it
 * proves the edit landed in the real board file, not merely that a path was
 * passed somewhere.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mount, tick, ENTER, ESC, type Harness } from './helpers.js';
import { plain } from './fixture-board.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_EDITOR = `node ${path.join(HERE, 'fixtures', 'fake-editor.mjs')}`;
const FAILING_EDITOR = `node ${path.join(HERE, 'fixtures', 'failing-editor.mjs')}`;
const MARKER = 'EDITED-BY-FAKE-EDITOR';

/** Every file under `dir` (recursively) whose contents carry the marker. */
function editedFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath ?? dir, entry.name);
    try {
      if (fs.readFileSync(full, 'utf-8').includes(MARKER)) found.push(full);
    } catch {
      // Unreadable entries are not candidates.
    }
  }
  return found.sort();
}

/** Anything the old flow would have left in the system temp dir. */
function strayTempSnapshots(): string[] {
  return fs
    .readdirSync(os.tmpdir())
    .filter((name) => /^brainfile-(edit|new-task)/.test(name));
}

describe('$EDITOR handoff (§C1 / P8)', () => {
  let h: Harness;
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    h = await mount();
    process.env.EDITOR = FAKE_EDITOR;
  });

  afterEach(() => {
    h.teardown();
    process.env = { ...savedEnv };
  });

  it("edits the document's real .md file, not a temp snapshot", async () => {
    const before = strayTempSnapshots();

    await h.press('e');
    await tick(400);

    // Exactly one file changed, and it is the selected document's own file in
    // the board directory.
    expect(editedFiles(h.fixture.tempDir)).toEqual([
      path.join(h.fixture.boardDir, 'epic-1.md'),
    ]);

    // No synthetic YAML snapshot was created anywhere.
    expect(strayTempSnapshots()).toEqual(before);
  });

  it('reloads and keeps the same document selected afterwards', async () => {
    expect(plain(h.frame())).toContain('epic-1');

    await h.press('e');
    await tick(400);

    const after = plain(h.frame());
    // Still rendering, still on the same document (id-keyed restore, §C4).
    expect(after).toContain('epic-1');
    expect(after).toContain('Post-migration cleanup');
  });

  it('works from the detail view on the drilled-into document', async () => {
    await h.press('j'); // task-1, epic-1's child
    await h.press(ENTER); // drill in
    await tick();

    await h.press('e');
    await tick(400);

    expect(editedFiles(h.fixture.tempDir)).toEqual([
      path.join(h.fixture.boardDir, 'task-1.md'),
    ]);
  });

  it('edits an ARCHIVED document — e is not a board mutation', async () => {
    for (let i = 0; i < 10; i += 1) {
      if (plain(h.frame()).split('\n')[0]?.includes('done')) break;
      await h.press('t');
    }

    await h.press('e');
    await tick(400);

    const edited = editedFiles(h.fixture.tempDir);
    expect(edited).toHaveLength(1);
    expect(path.dirname(edited[0])).toBe(h.fixture.logsDir);
  });

  it('survives an editor that exits non-zero', async () => {
    process.env.EDITOR = FAILING_EDITOR;

    await h.press('e');
    await tick(400);

    // Still rendering the board, not ink's error screen or a blank frame.
    const frame = plain(h.frame());
    expect(frame).toContain('epic-1');
    expect(frame).toContain('q quit'); // the normal footer, not `q quit · r retry`
    expect(frame).not.toContain('r retry');
    expect(editedFiles(h.fixture.tempDir)).toEqual([]);
  });

  it('falls back through $VISUAL when $EDITOR is unset', async () => {
    delete process.env.EDITOR;
    process.env.VISUAL = FAKE_EDITOR;

    await h.press('e');
    await tick(400);

    expect(editedFiles(h.fixture.tempDir)).toHaveLength(1);
  });

  it('N creates the document, then opens it — no untitled strays', async () => {
    await h.press('N');
    for (const ch of 'Written in the editor') await h.press(ch);
    await h.press('\r');
    await tick(500);

    const edited = editedFiles(h.fixture.tempDir);
    expect(edited).toHaveLength(1);
    // The editor opened the newly created board document, not a template.
    expect(path.dirname(edited[0])).toBe(h.fixture.boardDir);
    expect(fs.readFileSync(edited[0], 'utf-8')).toContain('Written in the editor');

    // Nothing untitled was left behind.
    expect(plain(h.frame())).not.toContain('Untitled');
  });

  it('N requires a title first, so abandoning it creates nothing', async () => {
    const before = fs.readdirSync(h.fixture.boardDir).sort();

    await h.press('N');
    await h.press('\r'); // empty title — refused, overlay stays open
    await tick(150);
    expect(plain(h.frame())).toContain('Title required');

    await h.press(ESC);
    await tick(300);

    expect(fs.readdirSync(h.fixture.boardDir).sort()).toEqual(before);
    expect(editedFiles(h.fixture.tempDir)).toEqual([]);
  });

  it('keeps rendering when the terminal cannot be suspended', async () => {
    const { render } = await import('ink-testing-library');
    const React = (await import('react')).default;
    const { BrainfileTUI } = await import('../BrainfileTUI.js');
    const { createFixtureBoard } = await import('./fixture-board.js');

    const fixture = createFixtureBoard();
    try {
      const app = render(
        React.createElement(BrainfileTUI, {
          filePath: fixture.brainfilePath,
          width: 120,
          height: 26,
        }),
      );
      await tick(200);

      (app.stdin as unknown as { isTTY: boolean }).isTTY = false;
      app.stdin.write('e');
      await tick(300);

      expect(app.lastFrame()).toBeTruthy();
      app.unmount();
    } finally {
      fixture.cleanup();
    }
  });
});
