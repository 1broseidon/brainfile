import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getV2Dirs,
  isV2,
  ensureV2Dirs,
  getTaskFilePath,
  getLogFilePath,
  findV2Task,
  extractDescription,
  extractLog,
  composeBody,
  readV2BoardConfig,
  buildBoardFromV2,
  writeTaskFile,
  type Task,
} from '../index';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-workspace-'));
}

function writeBoardConfig(dotDir: string, content?: string): string {
  const brainfilePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(
    brainfilePath,
    content ?? `---
title: Workspace Test
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
---
`,
    'utf-8',
  );
  return brainfilePath;
}

describe('workspace helpers', () => {
  let tmp: string;
  let dotDir: string;
  let boardDir: string;
  let logsDir: string;
  let brainfilePath: string;

  beforeEach(() => {
    tmp = makeTempDir();
    dotDir = path.join(tmp, '.brainfile');
    boardDir = path.join(dotDir, 'board');
    logsDir = path.join(dotDir, 'logs');
    fs.mkdirSync(dotDir, { recursive: true });
    brainfilePath = writeBoardConfig(dotDir);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves v2 directory paths from brainfile path', () => {
    const dirs = getV2Dirs(brainfilePath);
    expect(dirs.dotDir).toBe(dotDir);
    expect(dirs.boardDir).toBe(boardDir);
    expect(dirs.logsDir).toBe(logsDir);
    expect(dirs.brainfilePath).toBe(path.resolve(brainfilePath));
  });

  it('detects v2 by board directory presence', () => {
    expect(isV2(brainfilePath)).toBe(false);
    fs.mkdirSync(boardDir, { recursive: true });
    expect(isV2(brainfilePath)).toBe(true);
  });

  it('creates missing board and logs directories', () => {
    const dirs = ensureV2Dirs(brainfilePath);
    expect(fs.existsSync(dirs.boardDir)).toBe(true);
    expect(fs.existsSync(dirs.logsDir)).toBe(true);
  });

  it('builds canonical board/log file paths', () => {
    expect(getTaskFilePath(boardDir, 'task-1')).toBe(path.join(boardDir, 'task-1.md'));
    expect(getLogFilePath(logsDir, 'task-1')).toBe(path.join(logsDir, 'task-1.md'));
  });

  it('finds tasks across board and logs', () => {
    ensureV2Dirs(brainfilePath);

    const active: Task = {
      id: 'task-1',
      title: 'Active',
      column: 'todo',
      position: 0,
    };

    const completed: Task = {
      id: 'task-2',
      title: 'Completed',
      column: 'done',
      completedAt: new Date().toISOString(),
    };

    writeTaskFile(path.join(boardDir, 'task-1.md'), active, composeBody('Active description'));
    writeTaskFile(path.join(logsDir, 'task-2.md'), completed, composeBody('Completed description', '- done'));

    const dirs = getV2Dirs(brainfilePath);

    const foundActive = findV2Task(dirs, 'task-1', true);
    expect(foundActive).not.toBeNull();
    expect(foundActive?.isLog).toBe(false);

    const foundLogWithoutSearch = findV2Task(dirs, 'task-2', false);
    expect(foundLogWithoutSearch).toBeNull();

    const foundLog = findV2Task(dirs, 'task-2', true);
    expect(foundLog).not.toBeNull();
    expect(foundLog?.isLog).toBe(true);
  });

  it('extracts description/log sections and composes body', () => {
    const body = composeBody('Line one\nLine two', '- 2026-01-01 started');

    expect(extractDescription(body)).toBe('Line one\nLine two');
    expect(extractLog(body)).toBe('- 2026-01-01 started');

    expect(composeBody(undefined, undefined)).toBe('');
    expect(composeBody('Only description')).toBe('## Description\nOnly description\n');
    expect(composeBody(undefined, 'Only log')).toBe('## Log\nOnly log\n');
  });

  it('reads config-only board and ensures columns have tasks arrays', () => {
    const board = readV2BoardConfig(brainfilePath);
    expect(board.title).toBe('Workspace Test');
    expect(board.columns.length).toBe(3);
    expect(Array.isArray(board.columns[0].tasks)).toBe(true);
    expect(board.columns[0].tasks.length).toBe(0);
  });

  it('builds full board from board/ files sorted by position and restores descriptions from body', () => {
    ensureV2Dirs(brainfilePath);

    const t1: Task = {
      id: 'task-1',
      title: 'First by position',
      column: 'todo',
      position: 1,
    };

    const t2: Task = {
      id: 'task-2',
      title: 'Second by position',
      column: 'todo',
      position: 2,
      description: 'frontmatter description',
    };

    const t3: Task = {
      id: 'task-3',
      title: 'Other column',
      column: 'in-progress',
      position: 0,
    };

    writeTaskFile(path.join(boardDir, 'task-2.md'), t2, composeBody('body description ignored'));
    writeTaskFile(path.join(boardDir, 'task-1.md'), t1, composeBody('body description restored'));
    writeTaskFile(path.join(boardDir, 'task-3.md'), t3, composeBody('progress body'));

    const board = buildBoardFromV2(brainfilePath);
    const todo = board.columns.find(c => c.id === 'todo');
    const inProgress = board.columns.find(c => c.id === 'in-progress');

    expect(todo).toBeDefined();
    expect(todo!.tasks.map(t => t.id)).toEqual(['task-1', 'task-2']);
    expect(todo!.tasks[0].description).toBe('body description restored');
    expect(todo!.tasks[1].description).toBe('frontmatter description');

    expect(inProgress).toBeDefined();
    expect(inProgress!.tasks.map(t => t.id)).toEqual(['task-3']);
    expect(inProgress!.tasks[0].description).toBe('progress body');
  });
});
