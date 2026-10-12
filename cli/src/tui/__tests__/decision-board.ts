/**
 * A board with decisions, for the task-19 suites: the shape of /tmp/bf-demo
 * (decide's own output: decision-1 superseded by decision-2, work resting on
 * both kinds), widened to one decision per thing the view must say.
 *
 *  - standing, by family: dependency (decision-2), release (decision-5, past
 *    its validUntil), storage (decision-3 with stance, holds while and
 *    recheck; decision-4 a constraint), style (decision-6, a preference
 *    valid until far ahead), and adr-1, a legacy ADR: no claim key, no
 *    status, so `proposed` and unfiled;
 *  - history in logs/: decision-1 superseded by decision-2, decision-7
 *    rejected, decision-8 stale;
 *  - work: task-10 rests on decision-1 (superseded), task-11 on decision-3
 *    (current), task-12 on decision-7 (rejected) and decision-9 (not on the
 *    board), task-14 on adr-1 (proposed: never stood, so not "changed"), and
 *    task-13, completed, on decision-1.
 *
 * Dates are fixed and far from today either way (2020, 2999), so `review`
 * does not depend on when the suite runs.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';
import type { FixtureBoard } from './fixture-board.js';

const CONFIG = `---
title: decisions
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
    order: 0
  - id: doing
    title: Doing
    order: 1
---
`;

const decision = (task: Partial<Task> & { id: string; title: string }): Task =>
  ({ type: 'decision', status: 'current', kind: 'decision', ...task }) as Task;

const BOARD: Array<{ task: Task; body?: string }> = [
  {
    task: decision({
      id: 'decision-2',
      title: 'Never axios: one HTTP client is enough, and fetch is it.',
      claimKey: 'dependency.http-client',
      stance: 'forbids',
      subject: 'axios',
      supersedes: 'decision-1',
      createdAt: '2026-10-02T07:00:00.000Z',
    }),
    body: '## Description\nNever axios. fetch covers every call we make.',
  },
  {
    task: decision({
      id: 'decision-3',
      title: 'No Redis for the cache: an in-process LRU is enough at this size.',
      claimKey: 'storage.cache',
      stance: 'rejects',
      subject: 'Redis',
      holdsWhile: 'one instance and under 10k requests a minute',
      recheck: 'Has traffic outgrown one instance?',
      createdAt: '2026-10-03T07:00:00.000Z',
    }),
  },
  {
    task: decision({
      id: 'decision-4',
      title: 'Postgres only; nothing that needs a second database to run.',
      claimKey: 'storage.database',
      kind: 'constraint',
      createdAt: '2026-10-04T07:00:00.000Z',
    }),
  },
  {
    task: decision({
      id: 'decision-5',
      title: 'Release on Tuesdays only.',
      claimKey: 'release.window',
      recheck: 'Ask before the next release',
      validUntil: '2020-01-01',
      createdAt: '2026-10-05T07:00:00.000Z',
    }),
  },
  {
    task: decision({
      id: 'decision-6',
      title: 'Name things for what they do, not how they do it.',
      claimKey: 'style.naming',
      kind: 'preference',
      validUntil: '2999-12-31',
      createdAt: '2026-10-06T07:00:00.000Z',
    }),
  },
  {
    // A legacy ADR: no claim key and no status, so it reads as proposed.
    task: { id: 'adr-1', title: 'Drop V1 board-format support', type: 'adr' } as Task,
  },
  {
    task: {
      id: 'task-10',
      title: 'Empty states for no board, legacy board, missing folder',
      column: 'todo',
      position: 0,
      tags: ['ux'],
      decisions: ['decision-1'],
    },
  },
  {
    task: {
      id: 'task-11',
      title: 'Board view card density pass',
      column: 'todo',
      position: 1,
      tags: ['design'],
      decisions: ['decision-3'],
    },
  },
  {
    task: {
      id: 'task-12',
      title: 'Tabs or spaces, settled again',
      column: 'todo',
      position: 2,
      decisions: ['decision-7', 'decision-9'],
    },
  },
  {
    task: {
      id: 'task-14',
      title: 'Remove the v1 parser',
      column: 'doing',
      position: 0,
      decisions: ['adr-1'],
    },
  },
];

const LOGS: Array<{ task: Task; body?: string }> = [
  {
    task: decision({
      id: 'decision-1',
      title: 'Use fetch for HTTP.',
      status: 'superseded',
      claimKey: 'dependency.http-client',
      supersededBy: 'decision-2',
      createdAt: '2026-10-01T07:00:00.000Z',
      updatedAt: '2026-10-02T07:00:00.000Z',
    }),
    body: '## Description\nUse fetch for HTTP. It ships with Node and covers every call we make.',
  },
  {
    task: decision({
      id: 'decision-7',
      title: 'Tabs for indentation.',
      status: 'rejected',
      claimKey: 'style.indent',
      createdAt: '2026-09-20T07:00:00.000Z',
      updatedAt: '2026-09-21T07:00:00.000Z',
    }),
  },
  {
    task: decision({
      id: 'decision-8',
      title: 'Node 20 is the floor.',
      status: 'stale',
      claimKey: 'runtime.node',
      createdAt: '2026-09-10T07:00:00.000Z',
      updatedAt: '2026-09-11T07:00:00.000Z',
    }),
  },
  {
    task: {
      id: 'task-13',
      title: 'Ship the fetch client',
      column: 'done',
      decisions: ['decision-1'],
      createdAt: '2026-09-01T07:00:00.000Z',
      completedAt: '2026-09-02T07:00:00.000Z',
    },
  },
];

export function createDecisionBoard(prefix = 'brainfile-tui-decisions-'): FixtureBoard {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  const brainfilePath = path.join(dotDir, 'brainfile.md');

  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(brainfilePath, CONFIG, 'utf-8');

  for (const { task, body } of BOARD) {
    writeTaskFile(path.join(boardDir, taskFileName(task.id)), task, body ?? '');
  }
  for (const { task, body } of LOGS) {
    writeTaskFile(path.join(logsDir, taskFileName(task.id)), task, body ?? '');
  }
  // As in fixture-board.ts: without a ledger core falls back to scanning
  // markdown and warns once per logs directory, which floods jest's IPC.
  // Retired decisions are not completions, so only the task has a record.
  fs.writeFileSync(
    path.join(logsDir, 'ledger.jsonl'),
    `${JSON.stringify({
      id: 'task-13',
      type: 'task',
      title: 'Ship the fetch client',
      filesChanged: [],
      createdAt: '2026-09-01T07:00:00.000Z',
      completedAt: '2026-09-02T07:00:00.000Z',
      cycleTimeHours: 24,
      summary: 'Ship the fetch client',
    })}\n`,
    'utf-8',
  );

  return {
    tempDir,
    brainfilePath,
    boardDir,
    logsDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/** A board with work and not one decision: the decisions view's empty state. */
export function createBoardWithoutDecisions(): FixtureBoard {
  const board = createDecisionBoard('brainfile-tui-no-decisions-');
  for (const name of fs.readdirSync(board.boardDir)) {
    if (name.startsWith('decision-') || name.startsWith('adr-')) fs.rmSync(path.join(board.boardDir, name));
  }
  for (const name of fs.readdirSync(board.logsDir)) {
    if (name.startsWith('decision-')) fs.rmSync(path.join(board.logsDir, name));
  }
  return board;
}
