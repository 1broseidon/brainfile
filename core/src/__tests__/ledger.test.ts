import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendLedgerRecord,
  buildLedgerRecord,
  getFileHistory,
  getTaskContext,
  queryLedger,
  readLedger,
} from '../ledger';
import { writeTaskFile } from '../taskFile';
import type { LedgerRecord, Task } from '../types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-ledger-test-'));
}

function makeRecord(overrides: Partial<LedgerRecord> = {}): LedgerRecord {
  return {
    id: 'task-1',
    type: 'task',
    title: 'Default title',
    filesChanged: ['src/default.ts'],
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T01:00:00.000Z',
    cycleTimeHours: 1,
    summary: 'Default summary',
    ...overrides,
  };
}

describe('ledger', () => {
  let testDir: string;
  let logsDir: string;

  beforeEach(() => {
    testDir = makeTempDir();
    logsDir = path.join(testDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('builds a ledger record from task metadata and options', () => {
    const task: Task = {
      id: 'task-12',
      type: 'task',
      title: 'Implement ledger internals',
      column: 'done',
      assignee: 'alice',
      priority: 'high',
      tags: ['core', 'ledger'],
      parentId: 'epic-2',
      relatedFiles: ['core/src/ledger.ts'],
      createdAt: '2026-01-01T00:00:00.000Z',
      subtasks: [
        { id: 'task-12-1', title: 'types', completed: true },
        { id: 'task-12-2', title: 'tests', completed: false },
      ],
      contract: {
        status: 'done',
        deliverables: [{ type: 'file', path: 'core/src/ledger.ts' }],
        constraints: ['Use append-only writes'],
        metrics: { reworkCount: 2 },
      },
    };

    const record = buildLedgerRecord(task, '## Summary\nImplemented ledger internals.\n', {
      summary: 'Completed implementation and tests',
      filesChanged: ['core/src/ledger.ts', 'core/src/__tests__/ledger.test.ts'],
      completedAt: '2026-01-02T00:00:00.000Z',
      columnHistory: ['todo', 'in-progress', 'done'],
    });

    expect(record.id).toBe('task-12');
    expect(record.type).toBe('task');
    expect(record.title).toBe('Implement ledger internals');
    expect(record.filesChanged).toEqual(['core/src/ledger.ts', 'core/src/__tests__/ledger.test.ts']);
    expect(record.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(record.completedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(record.cycleTimeHours).toBe(24);
    expect(record.summary).toBe('Completed implementation and tests');
    expect(record.columnHistory).toEqual(['todo', 'in-progress', 'done']);
    expect(record.contractStatus).toBe('done');
    expect(record.deliverables).toEqual(['core/src/ledger.ts']);
    expect(record.validationAttempts).toBe(2);
    expect(record.subtasksCompleted).toBe(1);
    expect(record.subtasksTotal).toBe(2);
  });

  it('appends records and reads them back from ledger.jsonl', () => {
    const first = makeRecord({ id: 'task-1', title: 'One', completedAt: '2026-01-01T01:00:00.000Z' });
    const second = makeRecord({ id: 'task-2', title: 'Two', completedAt: '2026-01-02T01:00:00.000Z' });

    const ledgerPath = appendLedgerRecord(logsDir, first);
    appendLedgerRecord(logsDir, second);

    expect(ledgerPath).toBe(path.join(logsDir, 'ledger.jsonl'));
    const records = readLedger(logsDir);
    expect(records.map((record) => record.id)).toEqual(['task-1', 'task-2']);
  });

  it('falls back to legacy markdown logs when ledger file is missing', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const legacyTask: Task = {
      id: 'task-legacy-1',
      title: 'Legacy completed task',
      completedAt: '2026-01-03T10:00:00.000Z',
      createdAt: '2026-01-03T08:00:00.000Z',
      relatedFiles: ['src/legacy.ts'],
    };
    writeTaskFile(path.join(logsDir, 'task-legacy-1.md'), legacyTask, '## Summary\nLegacy completion.\n');

    const records = readLedger(logsDir);

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('task-legacy-1');
    expect(records[0].summary).toBe('Legacy completion.');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('filters records with queryLedger', () => {
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-1',
        assignee: 'alice',
        tags: ['core', 'ledger'],
        completedAt: '2026-02-05T12:00:00.000Z',
        contractStatus: 'done',
        filesChanged: ['src/ledger.ts'],
      }),
    );

    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-2',
        assignee: 'bob',
        tags: ['docs'],
        completedAt: '2026-02-12T12:00:00.000Z',
        contractStatus: 'failed',
        filesChanged: ['docs/readme.md'],
      }),
    );

    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-3',
        assignee: 'alice',
        tags: ['ops'],
        completedAt: '2026-03-01T12:00:00.000Z',
        contractStatus: 'done',
        filesChanged: ['src/runtime.ts'],
      }),
    );

    const filtered = queryLedger(logsDir, {
      assignee: 'alice',
      tags: ['ledger'],
      dateRange: {
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-02-28T23:59:59.999Z',
      },
      contractStatus: 'done',
      files: ['src/ledger.ts'],
    });

    expect(filtered.map((record) => record.id)).toEqual(['task-1']);
  });

  it('returns file history sorted by completedAt descending', () => {
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-1',
        completedAt: '2026-02-01T12:00:00.000Z',
        filesChanged: ['src/shared.ts'],
      }),
    );
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-2',
        completedAt: '2026-02-10T12:00:00.000Z',
        filesChanged: ['src/unrelated.ts'],
      }),
    );
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-3',
        completedAt: '2026-02-20T12:00:00.000Z',
        filesChanged: ['src/shared.ts'],
      }),
    );

    const history = getFileHistory(logsDir, 'src/shared.ts');
    expect(history.map((record) => record.id)).toEqual(['task-3', 'task-1']);

    const limited = getFileHistory(logsDir, 'src/shared.ts', { limit: 1 });
    expect(limited.map((record) => record.id)).toEqual(['task-3']);
  });

  it('builds scoped task context using file intersections', () => {
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-1',
        completedAt: '2026-02-01T12:00:00.000Z',
        filesChanged: ['src/shared.ts'],
        deliverables: ['docs/spec.md'],
      }),
    );
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-2',
        completedAt: '2026-02-11T12:00:00.000Z',
        filesChanged: ['src/another.ts'],
        relatedFiles: ['docs/spec.md'],
      }),
    );
    appendLedgerRecord(
      logsDir,
      makeRecord({
        id: 'task-3',
        completedAt: '2026-02-20T12:00:00.000Z',
        filesChanged: ['src/unrelated.ts'],
      }),
    );

    const context = getTaskContext(
      logsDir,
      ['src/shared.ts'],
      [{ type: 'file', path: 'docs/spec.md' }],
    );

    expect(context.map((entry) => entry.record.id)).toEqual(['task-2', 'task-1']);
    expect(context[0].matchedFiles).toContain('docs/spec.md');
    expect(context[1].matchedFiles).toContain('src/shared.ts');

    const limited = getTaskContext(
      logsDir,
      ['src/shared.ts'],
      [{ type: 'file', path: 'docs/spec.md' }],
      { limit: 1 },
    );
    expect(limited).toHaveLength(1);
    expect(limited[0].record.id).toBe('task-2');
  });
});
