/**
 * The v2 fixture board every render suite shares.
 *
 * The pre-existing `src/__tests__/fixtures/*.md` files are flat v1 boards built
 * for the parser suites; none of them carry the `type`, `parentId` or
 * `contract` shapes v3 renders. This builds a real `.brainfile/` workspace on
 * disk (board/ + logs/ + config) covering, deliberately, one row per thing the
 * design says must be visible:
 *
 *  - an epic with visible children (indent, `0/3` progress chip)
 *  - a spec, an adr and a plan (all four non-blank type glyphs)
 *  - a plain task with no type (blank glyph column)
 *  - `priority: high` and `priority: critical` and no priority
 *  - contracts in ready / in_progress / delivered / done / failed / draft
 *  - a document with a subtask checklist (detail space-toggle)
 *  - an orphan child whose parent is in another column (`← epic-1`)
 *  - a document with more than three eligible chips (chip cap)
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';

export interface FixtureBoard {
  tempDir: string;
  brainfilePath: string;
  boardDir: string;
  logsDir: string;
  cleanup(): void;
}

const CONFIG = `---
title: brainfile
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

const TASKS: Array<{ task: Task; body?: string }> = [
  {
    task: {
      id: 'epic-1',
      title: 'Post-migration cleanup',
      type: 'epic',
      column: 'todo',
      position: 0,
      tags: ['cleanup'],
      createdAt: '2026-08-11T21:59:29.355Z',
      subtasks: [
        { id: 'st-1', title: 'triage', completed: false },
        { id: 'st-2', title: 'prune', completed: false },
        { id: 'st-3', title: 'delete', completed: false },
      ],
    },
    body: '## Description\nClose out the June-migration leftovers.',
  },
  {
    task: {
      id: 'task-1',
      title: 'Triage marketing board',
      parentId: 'epic-1',
      column: 'todo',
      position: 1,
      tags: ['marketing'],
    },
  },
  {
    task: {
      id: 'task-2',
      title: 'Prune supervisor remnants from docs',
      parentId: 'epic-1',
      column: 'todo',
      position: 2,
      tags: ['docs'],
      contract: { status: 'in_progress', version: 1 } as never,
    },
  },
  {
    task: {
      id: 'task-3',
      title: 'Delete migration leftovers after soak',
      parentId: 'epic-1',
      column: 'todo',
      position: 3,
      tags: ['cleanup'],
      contract: { status: 'ready', version: 1 } as never,
    },
  },
  {
    task: {
      id: 'task-4',
      title: 'Revisit @modelcontextprotocol/sdk pin',
      column: 'todo',
      position: 4,
      tags: ['deps'],
    },
  },
  {
    task: {
      id: 'task-8',
      title: 'CLIError renders raw stack trace',
      column: 'todo',
      position: 5,
      priority: 'high',
      tags: ['cli', 'ux'],
      relatedFiles: ['cli/src/cli.ts', 'cli/src/utils/errorHandler.ts'],
      createdAt: '2026-08-11T10:00:00.000Z',
      subtasks: [
        { id: 'st-a', title: 'add top-level catch in cli.ts', completed: false },
        { id: 'st-b', title: 'regression test', completed: false },
      ],
    },
    body: '## Description\nRepro: run \'brainfile complete task-5\' (missing --task flag).\nExpected: one-line error + usage.',
  },
  {
    task: {
      id: 'task-9',
      title: 'Remove fetch() from core schemaHints',
      column: 'todo',
      position: 6,
      priority: 'critical',
      tags: ['core', 'net', 'security'],
      contract: { status: 'delivered', version: 1 } as never,
      subtasks: [{ id: 'st-c', title: 'strip fetch', completed: true }],
    },
  },
  {
    task: {
      id: 'spec-4',
      title: 'CLI/core boundary',
      type: 'spec',
      column: 'todo',
      position: 7,
      tags: ['architecture'],
      contract: { status: 'done', version: 1 } as never,
    },
  },
  {
    task: {
      id: 'adr-1',
      title: 'Drop V1 board-format support',
      type: 'adr',
      column: 'todo',
      position: 8,
      tags: ['v1'],
    },
  },
  {
    task: {
      id: 'plan-1',
      title: 'TUI v3 rollout',
      type: 'plan',
      column: 'todo',
      position: 9,
      tags: ['tui'],
      contract: { status: 'draft', version: 1 } as never,
    },
  },
  {
    // parentId points at an epic that lives in another column → orphan row.
    task: {
      id: 'task-11',
      title: 'Orphaned child of a backlog epic',
      parentId: 'epic-2',
      column: 'todo',
      position: 10,
      contract: { status: 'failed', version: 1 } as never,
    },
  },
  {
    task: {
      id: 'epic-2',
      title: 'Multi-agent communication',
      type: 'epic',
      column: 'backlog',
      position: 0,
      tags: ['agents'],
    },
  },
];

export function createFixtureBoard(prefix = 'brainfile-tui-v3-'): FixtureBoard {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  const brainfilePath = path.join(dotDir, 'brainfile.md');

  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(brainfilePath, CONFIG, 'utf-8');

  for (const { task, body } of TASKS) {
    writeTaskFile(path.join(boardDir, taskFileName(task.id)), task, body ?? '');
  }

  return {
    tempDir,
    brainfilePath,
    boardDir,
    logsDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

/** Strip ANSI so assertions can match the text the user actually sees. */
export function plain(frame: string | undefined): string {
  if (!frame) return '';
  // eslint-disable-next-line no-control-regex
  return frame.replace(/\[[0-9;]*m/g, '');
}

/** The rendered line containing `needle`, with trailing padding removed. */
export function lineWith(frame: string | undefined, needle: string): string {
  const line = plain(frame)
    .split('\n')
    .find((l) => l.includes(needle));
  return line === undefined ? '' : line.replace(/\s+$/, '');
}
