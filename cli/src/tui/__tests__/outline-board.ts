/**
 * A board for the task-20 suite: children stay under their parent across
 * columns. The shape of brainfile's own epic-2 while it ran: an epic in In
 * Progress with its specs in Review, a task in To Do and work completed under
 * it, beside an open task whose parent is already done.
 *
 *  - epic-1 (In Progress) holds task-2 (To Do), task-3 (In Progress),
 *    spec-1 (Review) and, completed into logs/, task-4 and task-5 (task-5
 *    the more recent); spec-1 holds plan-1 (Backlog);
 *  - task-6 (Review) has no parent; task-7 (To Do) hangs under epic-9, which
 *    is completed, so it stays in its own column with `← epic-9`;
 *  - task-8, completed with no parent, is only in the done stop.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';
import type { FixtureBoard } from './fixture-board.js';

const CONFIG = `---
title: outline
schema: https://brainfile.md/v2/board.json
columns:
  - id: backlog
    title: Backlog
    order: 0
  - id: todo
    title: To Do
    order: 1
  - id: in-progress
    title: In Progress
    order: 2
  - id: review
    title: Review
    order: 3
---
`;

const BOARD: Task[] = [
  { id: 'plan-1', title: 'Box levels across columns', type: 'plan', parentId: 'spec-1', column: 'backlog', position: 0 },
  { id: 'task-2', title: 'Count what a group shows', parentId: 'epic-1', column: 'todo', position: 0 },
  { id: 'task-7', title: 'Announce the release', parentId: 'epic-9', column: 'todo', position: 1 },
  { id: 'epic-1', title: 'Children stay under their parent', type: 'epic', column: 'in-progress', position: 0 },
  { id: 'task-3', title: 'Keyboard follows the outline', parentId: 'epic-1', column: 'in-progress', position: 1 },
  { id: 'spec-1', title: 'Each child keeps its own status', type: 'spec', parentId: 'epic-1', column: 'review', position: 0 },
  { id: 'task-6', title: 'Drag cards between columns', column: 'review', position: 1 },
] as Task[];

const LOGS: Task[] = [
  { id: 'task-5', title: 'Keep completed children', parentId: 'epic-1', completedAt: '2026-10-11T12:00:00.000Z' },
  { id: 'task-4', title: 'Ship the completed list', parentId: 'epic-1', completedAt: '2026-10-10T12:00:00.000Z' },
  { id: 'epic-9', title: 'Release 0.22', type: 'epic', completedAt: '2026-10-09T12:00:00.000Z' },
  { id: 'task-8', title: 'Unrelated and done', completedAt: '2026-10-08T12:00:00.000Z' },
] as Task[];

export function createOutlineBoard(prefix = 'brainfile-tui-outline-'): FixtureBoard {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  const brainfilePath = path.join(dotDir, 'brainfile.md');

  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(brainfilePath, CONFIG, 'utf-8');
  for (const task of BOARD) writeTaskFile(path.join(boardDir, taskFileName(task.id)), task, '');
  for (const task of LOGS) writeTaskFile(path.join(logsDir, taskFileName(task.id)), task, '');
  // As in fixture-board.ts: without a ledger core falls back to scanning
  // markdown and warns once per logs directory, which floods jest's IPC.
  fs.writeFileSync(
    path.join(logsDir, 'ledger.jsonl'),
    LOGS.map((task) =>
      JSON.stringify({
        id: task.id,
        type: task.type ?? 'task',
        title: task.title,
        filesChanged: [],
        createdAt: task.completedAt,
        completedAt: task.completedAt,
        cycleTimeHours: 1,
        summary: task.title,
      }),
    ).join('\n') + '\n',
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
