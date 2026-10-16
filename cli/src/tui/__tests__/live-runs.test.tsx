/**
 * Live runs on the rows (task-82): a run file in `state/runs`, written by any
 * runner on this machine (`brainfile run`, the desktop), puts
 * `● codex · editing` on its task's row, and the row lets go of it when the
 * run ends, as the desktop's rows do.
 */
import * as path from 'node:path';
import { jest } from '@jest/globals';
import { currentHost } from '@brainfile/core';
import { writeRunFile, type RunFile } from '@brainfile/core/repo';
import { buildChips } from '../components/DocumentRow.js';
import { markLiveRuns } from '../rows.js';
import { mount, tick } from './helpers.js';
import { lineWith, plain } from './fixture-board.js';

jest.setTimeout(30_000);

async function waitFor(check: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !check()) await tick(100);
}

test('a row with a live run leads its chips with it', () => {
  const task = { id: 'task-1', title: 'One', tags: ['cli'] } as never;
  const [row] = markLiveRuns([{ task, depth: 0 }], new Map([['task-1', 'codex · editing']]));
  expect(buildChips(row).map((c) => c.text)).toEqual(['● codex · editing', '#cli']);
  const rows = [{ task, depth: 0 }];
  expect(markLiveRuns(rows, new Map())).toBe(rows);
});

test("a run file puts what the agent is doing on its task's row, and it goes when the run ends", async () => {
  const h = await mount();
  try {
    const dotDir = path.dirname(h.fixture.brainfilePath);
    const now = Date.now();
    const run: RunFile = {
      id: 'run-live-1',
      kind: 'dispatch',
      taskId: 'task-1',
      agent: 'codex',
      state: 'working',
      activity: 'editing',
      startedAt: now,
      host: currentHost(),
      pid: process.pid,
      runner: 'cli',
      beatAt: now,
      projectId: path.dirname(dotDir),
    };
    writeRunFile(dotDir, run);
    await waitFor(() => plain(h.frame()).includes('codex · editing'));
    expect(lineWith(h.frame(), 'task-1')).toContain('● codex · editing');

    writeRunFile(dotDir, { ...run, activity: 'running' });
    await waitFor(() => plain(h.frame()).includes('codex · running'));
    expect(lineWith(h.frame(), 'task-1')).toContain('codex · running');

    writeRunFile(dotDir, { ...run, state: 'done', endedAt: Date.now() });
    await waitFor(() => !plain(h.frame()).includes('codex ·'));
    expect(plain(h.frame())).not.toContain('codex ·');
  } finally {
    h.teardown();
  }
});
