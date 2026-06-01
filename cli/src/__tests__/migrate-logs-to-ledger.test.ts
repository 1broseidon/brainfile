import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateCommand } from '../commands/migrate';
import { readTaskFile, writeTaskFile, readLedger } from '@brainfile/core';

function setupV2Workspace(tempDir: string): { dotDir: string; boardDir: string; logsDir: string } {
  const dotDir = path.join(tempDir, '.brainfile');
  const boardDir = path.join(dotDir, 'board');
  const logsDir = path.join(dotDir, 'logs');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const config = `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---
`;
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), config, 'utf-8');
  return { dotDir, boardDir, logsDir };
}

function writeLogTask(logsDir: string, id: string, title: string, extra: Record<string, unknown> = {}): void {
  const task = { id, title, completedAt: '2026-01-15T12:00:00Z', ...extra };
  writeTaskFile(path.join(logsDir, `${id}.md`), task as any, `Completed ${title}.`);
}

function writeBoardTask(boardDir: string, id: string, title: string, extra: Record<string, unknown> = {}): void {
  const task = { id, title, column: 'todo', position: 0, ...extra };
  writeTaskFile(path.join(boardDir, `${id}.md`), task as any, '');
}

describe('migrate --logs-to-ledger', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-logs-ledger-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('migrates log .md files into ledger.jsonl and removes them', () => {
    const { logsDir } = setupV2Workspace(tempDir);
    writeLogTask(logsDir, 'task-1', 'First completed task');
    writeLogTask(logsDir, 'task-2', 'Second completed task', { tags: ['bug'] });

    migrateCommand({ logsToLedger: true });

    const records = readLedger(logsDir);
    expect(records.length).toBe(2);
    expect(records.map((r) => r.id).sort()).toEqual(['task-1', 'task-2']);
    expect(records[0].completedAt).toBe('2026-01-15T12:00:00Z');

    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(false);
    expect(fs.existsSync(path.join(logsDir, 'task-2.md'))).toBe(false);
  });

  it('skips log tasks already in the ledger', () => {
    const { logsDir } = setupV2Workspace(tempDir);
    writeLogTask(logsDir, 'task-1', 'Already tracked');

    // Pre-populate ledger with task-1
    const ledgerPath = path.join(logsDir, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      id: 'task-1', type: 'task', title: 'Already tracked',
      filesChanged: ['task-1.md'], createdAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-15T12:00:00Z', cycleTimeHours: 360, summary: 'done',
    }) + '\n');

    migrateCommand({ logsToLedger: true });

    const records = readLedger(logsDir);
    expect(records.length).toBe(1);
    // .md file kept (no --force)
    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(true);
  });

  it('removes stale .md files with --force when already in ledger', () => {
    const { logsDir } = setupV2Workspace(tempDir);
    writeLogTask(logsDir, 'task-1', 'Already tracked');

    const ledgerPath = path.join(logsDir, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, JSON.stringify({
      id: 'task-1', type: 'task', title: 'Already tracked',
      filesChanged: ['task-1.md'], createdAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-15T12:00:00Z', cycleTimeHours: 360, summary: 'done',
    }) + '\n');

    migrateCommand({ logsToLedger: true, force: true });

    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(false);
    expect(readLedger(logsDir).length).toBe(1);
  });

  it('resolves ID conflicts by renaming the board task', () => {
    const { boardDir, logsDir } = setupV2Workspace(tempDir);

    // Simulate the old bug: task-1 exists in both board/ and logs/
    writeLogTask(logsDir, 'task-1', 'Original completed task');
    writeBoardTask(boardDir, 'task-1', 'Duplicate board task');
    writeBoardTask(boardDir, 'task-5', 'Another board task');

    migrateCommand({ logsToLedger: true });

    // Log task should be in ledger
    const records = readLedger(logsDir);
    expect(records.length).toBe(1);
    expect(records[0].id).toBe('task-1');
    expect(records[0].title).toBe('Original completed task');

    // Old board/task-1.md should be gone
    expect(fs.existsSync(path.join(boardDir, 'task-1.md'))).toBe(false);

    // Board task should have been renamed (next available after task-5 + ledger task-1)
    const boardFiles = fs.readdirSync(boardDir).filter((f) => f.endsWith('.md'));
    expect(boardFiles).toContain('task-5.md');
    expect(boardFiles.length).toBe(2);

    // The renamed task should have the same title as the duplicate
    const renamedFile = boardFiles.find((f) => f !== 'task-5.md')!;
    const renamedTask = readTaskFile(path.join(boardDir, renamedFile));
    expect(renamedTask).not.toBeNull();
    expect(renamedTask!.task.title).toBe('Duplicate board task');

    // Log .md file should be cleaned up
    expect(fs.existsSync(path.join(logsDir, 'task-1.md'))).toBe(false);
  });

  it('handles epic- and adr- prefixed tasks', () => {
    const { logsDir } = setupV2Workspace(tempDir);
    writeLogTask(logsDir, 'epic-1', 'Done epic');
    writeLogTask(logsDir, 'adr-1', 'Done ADR');

    migrateCommand({ logsToLedger: true });

    const records = readLedger(logsDir);
    expect(records.length).toBe(2);
    expect(records.find((r) => r.id === 'epic-1')?.type).toBe('epic');
    expect(records.find((r) => r.id === 'adr-1')?.type).toBe('adr');
  });

  it('does nothing when logs/ has no .md files', () => {
    const { logsDir } = setupV2Workspace(tempDir);

    migrateCommand({ logsToLedger: true });

    expect(fs.existsSync(path.join(logsDir, 'ledger.jsonl'))).toBe(false);
  });
});
