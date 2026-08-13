import * as fs from 'fs';
import * as path from 'path';
import { createV2TestWorkspace, type V2TestWorkspace } from './helpers/v2';
import { migrateCommand } from '../commands/migrate';
import { logCommand } from '../commands/log';

const silent = { log: () => {}, error: () => {}, info: () => {}, warn: () => {} };

function writeArchivedTask(ws: V2TestWorkspace, id: string, title: string): string {
  const filePath = path.join(ws.logsDir, `${id}.md`);
  fs.writeFileSync(
    filePath,
    `---\nid: ${id}\ntitle: ${JSON.stringify(title)}\ncompletedAt: "2026-08-12T00:00:00.000Z"\n---\n\n## Description\nBody of ${id}.\n`,
    'utf-8',
  );
  return filePath;
}

describe('migrate --logs-to-ledger is a non-destructive backfill', () => {
  let ws: V2TestWorkspace;
  let cwd: string;

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-ledger-backfill-');
    cwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('appends ledger records and KEEPS the markdown archives', () => {
    const mdPath = writeArchivedTask(ws, 'task-7', 'Archived work');
    process.chdir(ws.tempDir);

    migrateCommand({ logsToLedger: true, dir: ws.tempDir });

    const ledgerPath = path.join(ws.logsDir, 'ledger.jsonl');
    expect(fs.existsSync(ledgerPath)).toBe(true);
    const records = fs
      .readFileSync(ledgerPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(records.map((r) => r.id)).toContain('task-7');
    // The regression: the markdown archive must survive the backfill.
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(fs.readFileSync(mdPath, 'utf-8')).toContain('Body of task-7');
  });

  it('is idempotent — re-running neither duplicates records nor touches files', () => {
    const mdPath = writeArchivedTask(ws, 'task-8', 'Twice-migrated');
    process.chdir(ws.tempDir);

    migrateCommand({ logsToLedger: true, dir: ws.tempDir });
    migrateCommand({ logsToLedger: true, dir: ws.tempDir });

    const records = fs
      .readFileSync(path.join(ws.logsDir, 'ledger.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(records.filter((r) => r.id === 'task-8')).toHaveLength(1);
    expect(fs.existsSync(mdPath)).toBe(true);
  });
});

describe('log --recent is ledger-aware', () => {
  let ws: V2TestWorkspace;

  beforeEach(() => {
    ws = createV2TestWorkspace('brainfile-log-ledger-');
  });

  afterEach(() => {
    fs.rmSync(ws.tempDir, { recursive: true, force: true });
  });

  it('lists ledger-only records (no markdown archive) alongside archived docs', () => {
    writeArchivedTask(ws, 'task-1', 'Has markdown');
    fs.writeFileSync(
      path.join(ws.logsDir, 'ledger.jsonl'),
      JSON.stringify({ id: 'task-2', type: 'task', title: 'Ledger only', completedAt: '2026-08-13T00:00:00.000Z' }) + '\n',
      'utf-8',
    );

    const result = logCommand({ file: ws.brainfilePath, recent: true }, silent);
    const ids = (result.tasks ?? []).map((t) => t.id);
    expect(ids).toContain('task-1');
    expect(ids).toContain('task-2');
    // Newest first: the ledger-only record is more recent.
    expect(ids[0]).toBe('task-2');
  });
});
