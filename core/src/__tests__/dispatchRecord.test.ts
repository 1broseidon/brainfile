/**
 * The dispatch record on a task (spec-16-1, task-74): the request round-trips
 * with what core does not know, a claim is taken by compare-and-swap, a
 * second one is refused, and a stale one is taken on the same machine only.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  claimDispatch,
  claimDispatchFile,
  dispatchRecordProblems,
  lintDispatchRecords,
  parseDispatchRecord,
  pidAlive,
  readDispatchRecord,
  releaseDispatchFile,
  requestDispatchFile,
  withDispatchRequest,
} from '../dispatchRecord';
import { readTaskFile } from '../taskFile';
import type { DispatchRecord, DispatchRequest, Task } from '../types';

const REQUEST: DispatchRequest = { agent: 'codex', model: 'gpt-5', effort: 'high', by: 'chat', at: '2026-10-15T10:00:00.000Z', until: 'review', role: 'worker' };
const HERE = { host: 'mac', runner: 'desktop' as const, pid: process.pid };
/** A process id nothing on this machine runs. */
const GONE = 2 ** 22 + 12345;

let dotDir: string;
let file: string;

beforeEach(() => {
  dotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-dispatch-'));
  file = path.join(dotDir, 'board', 'task-1.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nid: task-1\ntitle: One\ncolumn: todo\nx-otto:\n  keep: true\n---\n\n## Description\nBody.\n', 'utf-8');
});

afterEach(() => {
  fs.rmSync(dotDir, { recursive: true, force: true });
});

const onDisk = (): Task => readTaskFile(file)!.task;

describe('the record', () => {
  it('round-trips the request, the claim and keys core does not know', () => {
    expect(requestDispatchFile(file, REQUEST, { assignee: true }).ok).toBe(true);
    const task = onDisk();
    expect(task.assignee).toBe('codex');
    expect(task['x-otto']).toEqual({ keep: true });
    expect(readTaskFile(file)!.body).toContain('Body.');
    expect(readDispatchRecord(task)).toEqual(REQUEST);

    const raw = fs.readFileSync(file, 'utf-8').replace('  role: worker\n', '  role: worker\n  x-runner: later\n');
    fs.writeFileSync(file, raw, 'utf-8');
    expect(claimDispatchFile(file, { ...HERE, at: '2026-10-15T10:00:01.000Z' }).ok).toBe(true);
    const record = readDispatchRecord(onDisk())!;
    expect(record['x-runner']).toBe('later');
    expect(record.claim).toEqual({ host: 'mac', runner: 'desktop', pid: process.pid, at: '2026-10-15T10:00:01.000Z' });
  });

  it('reads the record the desktop wrote before core knew it', () => {
    const legacy = { agent: 'claude', model: 'opus', by: 'person', at: '2026-10-12T23:31:00.177Z' };
    expect(parseDispatchRecord(legacy)).toEqual(legacy);
  });

  it('reads an unquoted time as YAML gives it, a Date, as ISO text', () => {
    const record = parseDispatchRecord({ agent: 'codex', by: 'cli', at: new Date('2026-10-15T10:00:00Z') });
    expect(record?.at).toBe('2026-10-15T10:00:00.000Z');
  });

  it('a new request keeps a claim that holds and drops one that ended', () => {
    const base: Task = { id: 'task-1', title: 'One', dispatch: { ...REQUEST, claim: { ...HERE, at: REQUEST.at } } };
    const again = withDispatchRequest(base, { agent: 'claude', by: 'lead', at: '2026-10-15T11:00:00.000Z' });
    expect(again.dispatch).toEqual({ agent: 'claude', by: 'lead', at: '2026-10-15T11:00:00.000Z', claim: { ...HERE, at: REQUEST.at } });

    const ended: Task = { ...base, dispatch: { ...REQUEST, claim: { ...HERE, at: REQUEST.at, ended: REQUEST.at, outcome: 'done' } } };
    expect(withDispatchRequest(ended, REQUEST).dispatch?.claim).toBeUndefined();
  });

  it('refuses to write a malformed request', () => {
    expect(() => requestDispatchFile(file, { ...REQUEST, by: 'robot' as DispatchRequest['by'] })).toThrow(/by: must be one of/);
    expect(onDisk().dispatch).toBeUndefined();
  });
});

describe('lint', () => {
  it('says what is wrong with a malformed record, and nothing about a good one', () => {
    const tasks = [
      { id: 'task-1', dispatch: REQUEST },
      { id: 'task-2' },
      { id: 'task-3', dispatch: 'codex' },
      { id: 'task-4', dispatch: { agent: '', by: 'chat', at: 'yesterday', until: 'forever', claim: { host: 'mac', runner: 'daemon', pid: -1, at: REQUEST.at, outcome: 'done' } } },
    ];
    const issues = lintDispatchRecords(tasks);
    expect(issues.every((issue) => issue.code === 'MALFORMED_DISPATCH' && issue.type === 'warning')).toBe(true);
    expect(issues.map((issue) => issue.message)).toEqual([
      'task-3: dispatch must be a mapping (agent, by, at, ...)',
      'task-4: dispatch agent: must name the agent',
      'task-4: dispatch at: must be an ISO 8601 time',
      'task-4: dispatch until: must be one of review, done',
      'task-4: dispatch claim.runner: must be one of desktop, cli, mcp',
      'task-4: dispatch claim.pid: must be a process id',
      'task-4: dispatch claim.outcome: only with claim.ended',
    ]);
    expect(dispatchRecordProblems({ ...REQUEST, model: 3, role: 'boss' })).toEqual(['model: must be text', 'role: must be one of worker, lead']);
  });
});

describe('claims', () => {
  beforeEach(() => {
    requestDispatchFile(file, REQUEST);
  });

  it('needs a request, or takes one with the claim in the same swap', () => {
    fs.writeFileSync(file, '---\nid: task-2\ntitle: Two\n---\n', 'utf-8');
    const refused = claimDispatchFile(file, HERE);
    expect(refused).toMatchObject({ ok: false, reason: 'no-request' });

    const taken = claimDispatchFile(file, HERE, { request: REQUEST });
    expect(taken.ok).toBe(true);
    expect(readDispatchRecord(onDisk())).toMatchObject({ ...REQUEST, claim: { host: 'mac', pid: process.pid } });
  });

  it('refuses a second claim while the first holds', () => {
    expect(claimDispatchFile(file, HERE).ok).toBe(true);
    const second = claimDispatchFile(file, { host: 'mac', runner: 'cli', pid: process.pid });
    expect(second).toMatchObject({ ok: false, reason: 'claimed', holder: { runner: 'desktop', pid: process.pid } });
    expect(readDispatchRecord(onDisk())!.claim!.runner).toBe('desktop');
  });

  it('takes a stale claim on the same machine', () => {
    claimDispatchFile(file, { host: 'mac', runner: 'cli', pid: GONE, at: REQUEST.at });
    expect(pidAlive(GONE)).toBe(false);
    const taken = claimDispatchFile(file, HERE);
    expect(taken).toMatchObject({ ok: true, replaced: { runner: 'cli', pid: GONE } });
    expect(readDispatchRecord(onDisk())!.claim!.pid).toBe(process.pid);
  });

  it('asks isLost about a claim on the same machine, and takes it when it says so', () => {
    claimDispatchFile(file, { host: 'mac', runner: 'cli', pid: process.pid });
    expect(claimDispatchFile(file, HERE, { isLost: () => false })).toMatchObject({ ok: false, reason: 'claimed' });
    expect(claimDispatchFile(file, HERE, { isLost: () => true })).toMatchObject({ ok: true, replaced: { runner: 'cli' } });
  });

  it('never takes another machine\'s claim, stale or not, without force', () => {
    claimDispatchFile(file, { host: 'other-mac', runner: 'cli', pid: GONE });
    const refused = claimDispatchFile(file, HERE, { isLost: () => true });
    expect(refused).toMatchObject({ ok: false, reason: 'other-host', holder: { host: 'other-mac' } });
    expect(claimDispatchFile(file, HERE, { force: true })).toMatchObject({ ok: true, replaced: { host: 'other-mac' } });
  });

  it('a claim that ended holds nothing', () => {
    claimDispatchFile(file, { host: 'other-mac', runner: 'cli', pid: 7 });
    expect(releaseDispatchFile(file, { host: 'other-mac', pid: 7 }, { outcome: 'review', at: '2026-10-15T12:00:00.000Z' })).toMatchObject({ ok: true, changed: true });
    expect(readDispatchRecord(onDisk())!.claim).toMatchObject({ host: 'other-mac', ended: '2026-10-15T12:00:00.000Z', outcome: 'review' });
    expect(claimDispatchFile(file, HERE).ok).toBe(true);
  });

  it('is given back only by its holder, and cleared without an outcome', () => {
    claimDispatchFile(file, HERE);
    expect(releaseDispatchFile(file, { host: 'mac', pid: GONE })).toMatchObject({ ok: false, reason: 'not-yours' });
    expect(releaseDispatchFile(file, HERE)).toMatchObject({ ok: true, changed: true });
    expect(readDispatchRecord(onDisk())).toEqual(REQUEST);
    expect(releaseDispatchFile(file, HERE)).toMatchObject({ ok: true, changed: false });
  });

  it('refuses a malformed record rather than writing over it', () => {
    fs.writeFileSync(file, '---\nid: task-1\ntitle: One\ndispatch: codex\n---\n', 'utf-8');
    expect(claimDispatchFile(file, HERE)).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('says when the task file is not there', () => {
    expect(claimDispatchFile(path.join(dotDir, 'board', 'task-9.md'), HERE)).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('waits on another writer\'s lock, and takes one its writer left behind', () => {
    const lock = path.join(dotDir, 'state', 'locks', 'task-1.md.lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, String(GONE), 'utf-8');
    expect(claimDispatchFile(file, HERE).ok).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('claims in memory without touching the file', () => {
    const task: Task = { id: 'task-1', title: 'One', dispatch: REQUEST as DispatchRecord };
    const result = claimDispatch(task, { ...HERE, at: REQUEST.at });
    expect(result.ok && result.record.claim).toEqual({ ...HERE, at: REQUEST.at });
    expect(task.dispatch?.claim).toBeUndefined();
  });

  const dist = path.join(__dirname, '..', '..', 'dist', 'dispatchRecord.js');
  (fs.existsSync(dist) ? it : it.skip)('of runners claiming at once, exactly one gets the task', async () => {
    const start = Date.now() + 400;
    const script = `
      const { claimDispatchFile } = require(${JSON.stringify(dist)});
      while (Date.now() < ${start}) {}
      const result = claimDispatchFile(${JSON.stringify(file)}, { host: 'mac', runner: 'cli', pid: process.pid });
      process.stdout.write(JSON.stringify({ ok: result.ok, reason: result.reason }));
      // Stay up until every runner has claimed: a claim whose process is gone is free to take.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ${start} + 3000 - Date.now()));
    `;
    const runs = Array.from({ length: 4 }, () => new Promise<{ ok: boolean; reason?: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (err += chunk));
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err))));
    }));
    const results = await Promise.all(runs);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => r.reason)).toEqual(['claimed', 'claimed', 'claimed']);
  }, 20_000);
});
