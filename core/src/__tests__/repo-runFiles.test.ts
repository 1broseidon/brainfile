/**
 * Run and runner files under `.brainfile/state/` (task-74): written
 * atomically, lost when their process is gone or their beat is old, and
 * ended runs pruned after half an hour, as the desktop's `live` tells them.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  ENDED_KEEP_MS,
  ENDED_KEEP_RUNS,
  LOST_AFTER_MS,
  beatRun,
  beatRunner,
  isClaimLost,
  isRunLost,
  isRunnerLost,
  listRunFiles,
  listRunners,
  liveRunners,
  pruneRunFiles,
  readRunFile,
  removeRunFile,
  removeRunnerFile,
  runFilePath,
  runnerFilePath,
  writeRunFile,
  writeRunnerFile,
  type RunFile,
  type RunnerFile,
} from '../repo';
import type { DispatchClaim } from '../types';

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const HOST = 'mac';
const alive = (pid: number) => pid === 100;
const here = { host: HOST, alive, now: NOW };

let dotDir: string;

beforeEach(() => {
  dotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-runs-'));
});

afterEach(() => {
  fs.rmSync(dotDir, { recursive: true, force: true });
});

function run(id: string, fields: Partial<RunFile> = {}): RunFile {
  return {
    id,
    kind: 'dispatch',
    taskId: 'task-1',
    agent: 'codex',
    state: 'working',
    activity: 'editing',
    startedAt: NOW - 60_000,
    host: HOST,
    pid: 100,
    runner: 'cli',
    worktree: '/tmp/wt/task-1',
    branch: 'dispatch/task-1',
    beatAt: NOW - 1_000,
    ...fields,
  };
}

const runner = (fields: Partial<RunnerFile> = {}): RunnerFile => ({ host: HOST, pid: 100, runner: 'cli', startedAt: NOW - 60_000, beatAt: NOW - 1_000, ...fields });

describe('run files', () => {
  it('live in state/runs and state/runners', () => {
    expect(runFilePath(dotDir, 'run-1')).toBe(path.join(dotDir, 'state', 'runs', 'run-1.json'));
    expect(runnerFilePath(dotDir, 'George’s Mac', 100)).toBe(path.join(dotDir, 'state', 'runners', 'George_s_Mac-100.json'));
    expect(() => runFilePath(dotDir, '../board/task-1')).toThrow(/Not a run id/);
    expect(() => runnerFilePath(dotDir, HOST, 0)).toThrow(/Not a process id/);
  });

  it('write and read a run whole, with its ask and steps', () => {
    const asking = run('run-1', {
      state: 'waiting',
      steps: [{ kind: 'tool', title: 'Edit src/a.ts', tool: 'edit' }, { kind: 'note', text: 'Done with a.' }],
      ask: { title: 'Run npm test?', options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] },
    });
    writeRunFile(dotDir, asking);
    expect(readRunFile(dotDir, 'run-1')).toEqual(asking);
    expect(readRunFile(dotDir, 'run-2')).toBeNull();
  });

  it('write atomically: a temp file renamed into place, none left behind', () => {
    writeRunFile(dotDir, run('run-1'));
    const first = fs.statSync(runFilePath(dotDir, 'run-1')).ino;
    writeRunFile(dotDir, run('run-1', { activity: 'running' }));
    expect(fs.statSync(runFilePath(dotDir, 'run-1')).ino).not.toBe(first);
    expect(fs.readdirSync(path.join(dotDir, 'state', 'runs'))).toEqual(['run-1.json']);
    expect(readRunFile(dotDir, 'run-1')?.activity).toBe('running');
  });

  it('a reader never sees half a run while it is written', async () => {
    const big = (n: number) => run('run-1', { steps: Array.from({ length: 4000 }, (_, i) => ({ kind: 'note' as const, text: `step ${n}.${i}` })) });
    writeRunFile(dotDir, big(0));
    const file = runFilePath(dotDir, 'run-1');
    const script = `
      const fs = require('fs');
      let reads = 0, torn = 0;
      const until = Date.now() + 1500;
      while (Date.now() < until) {
        try { JSON.parse(fs.readFileSync(${JSON.stringify(file)}, 'utf-8')); reads++; } catch (e) { torn++; }
      }
      process.stdout.write(JSON.stringify({ reads, torn }));
    `;
    const reader = new Promise<{ reads: number; torn: number }>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`reader exited ${code}`))));
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    for (let n = 1; n <= 150; n++) writeRunFile(dotDir, big(n));
    const { reads, torn } = await reader;
    expect(reads).toBeGreaterThan(0);
    expect(torn).toBe(0);
  }, 20_000);

  it('list runs oldest first, skipping temp and unreadable files', () => {
    writeRunFile(dotDir, run('run-b', { startedAt: NOW - 10 }));
    writeRunFile(dotDir, run('run-a', { startedAt: NOW - 20 }));
    fs.writeFileSync(path.join(dotDir, 'state', 'runs', '.run-c.json.tmp-1-2'), '{', 'utf-8');
    fs.writeFileSync(path.join(dotDir, 'state', 'runs', 'run-d.json'), 'not json', 'utf-8');
    fs.writeFileSync(path.join(dotDir, 'state', 'runs', 'run-e.json'), '{"id":"run-e"}', 'utf-8');
    expect(listRunFiles(dotDir).map((r) => r.id)).toEqual(['run-a', 'run-b']);
    expect(listRunFiles(path.join(dotDir, 'nowhere'))).toEqual([]);
  });

  it('beat a run and a runner, and remove them', () => {
    writeRunFile(dotDir, run('run-1'));
    writeRunnerFile(dotDir, runner());
    expect(beatRun(dotDir, 'run-1', NOW)?.beatAt).toBe(NOW);
    expect(readRunFile(dotDir, 'run-1')?.beatAt).toBe(NOW);
    expect(beatRunner(dotDir, HOST, 100, NOW)?.beatAt).toBe(NOW);
    expect(listRunners(dotDir)).toEqual([runner({ beatAt: NOW })]);
    expect(beatRun(dotDir, 'run-2', NOW)).toBeNull();
    expect(beatRunner(dotDir, HOST, 101, NOW)).toBeNull();
    removeRunFile(dotDir, 'run-1');
    removeRunnerFile(dotDir, HOST, 100);
    expect(listRunFiles(dotDir)).toEqual([]);
    expect(listRunners(dotDir)).toEqual([]);
  });
});

describe('lost', () => {
  it('a run whose process is gone, or whose beat is older than 30 s, on this machine', () => {
    expect(isRunLost(run('a'), here)).toBe(false);
    expect(isRunLost(run('a', { pid: 101 }), here)).toBe(true);
    expect(isRunLost(run('a', { beatAt: NOW - LOST_AFTER_MS - 1 }), here)).toBe(true);
    expect(isRunLost(run('a', { beatAt: NOW - LOST_AFTER_MS }), here)).toBe(false);
  });

  it('never a run that ended, or one from another machine', () => {
    expect(isRunLost(run('a', { pid: 101, state: 'done', endedAt: NOW - 5_000 }), here)).toBe(false);
    expect(isRunLost(run('a', { pid: 101, state: 'failed' }), here)).toBe(false);
    expect(isRunLost(run('a', { host: 'other-mac', pid: 101, beatAt: 0 }), here)).toBe(false);
  });

  it('a runner the same way; liveRunners leaves lost ones out', () => {
    writeRunnerFile(dotDir, runner());
    writeRunnerFile(dotDir, runner({ pid: 101 }));
    writeRunnerFile(dotDir, runner({ pid: 100, host: 'other-mac', beatAt: 0 }));
    expect(isRunnerLost(runner({ beatAt: NOW - LOST_AFTER_MS - 1 }), here)).toBe(true);
    expect(liveRunners(dotDir, here).map((r) => `${r.host}-${r.pid}`).sort()).toEqual(['mac-100', 'other-mac-100']);
  });

  it('a claim, when it ended, or its runner on this machine is gone or not beaten', () => {
    const claim: DispatchClaim = { host: HOST, runner: 'cli', pid: 100, at: '2026-10-15T11:59:00.000Z' };
    expect(isClaimLost(dotDir, claim, here)).toBe(false); // no runner file: its process alone
    writeRunnerFile(dotDir, runner());
    expect(isClaimLost(dotDir, claim, here)).toBe(false);
    writeRunnerFile(dotDir, runner({ beatAt: NOW - LOST_AFTER_MS - 1 }));
    expect(isClaimLost(dotDir, claim, here)).toBe(true);
    expect(isClaimLost(dotDir, { ...claim, pid: 101 }, here)).toBe(true);
    expect(isClaimLost(dotDir, { ...claim, ended: claim.at, outcome: 'done' }, here)).toBe(true);
    expect(isClaimLost(dotDir, { ...claim, host: 'other-mac', pid: 101 }, here)).toBe(false);
  });
});

describe('pruning', () => {
  it('removes runs that ended more than 30 minutes ago and keeps the rest', () => {
    writeRunFile(dotDir, run('going'));
    writeRunFile(dotDir, run('just-ended', { state: 'done', endedAt: NOW - 60_000 }));
    writeRunFile(dotDir, run('long-ended', { state: 'failed', endedAt: NOW - ENDED_KEEP_MS - 1 }));
    writeRunFile(dotDir, run('lost-lately', { pid: 101, beatAt: NOW - 5 * 60_000 }));
    writeRunFile(dotDir, run('lost-long-ago', { pid: 101, beatAt: NOW - ENDED_KEEP_MS - 1 }));
    writeRunFile(dotDir, run('elsewhere', { host: 'other-mac', beatAt: 0 }));
    const removed = pruneRunFiles(dotDir, here).map((file) => path.basename(file)).sort();
    expect(removed).toEqual(['long-ended.json', 'lost-long-ago.json']);
    expect(listRunFiles(dotDir).map((r) => r.id).sort()).toEqual(['elsewhere', 'going', 'just-ended', 'lost-lately']);
  });

  it('keeps at most the latest 50 that ended', () => {
    for (let i = 0; i < ENDED_KEEP_RUNS + 3; i++) writeRunFile(dotDir, run(`run-${i}`, { state: 'done', endedAt: NOW - 1_000 * (i + 1) }));
    expect(pruneRunFiles(dotDir, here)).toHaveLength(3);
    const kept = listRunFiles(dotDir).map((r) => r.id);
    expect(kept).toHaveLength(ENDED_KEEP_RUNS);
    expect(kept).not.toContain(`run-${ENDED_KEEP_RUNS}`);
  });

  it('removes lost runners and temp files a dead write left', () => {
    writeRunnerFile(dotDir, runner());
    writeRunnerFile(dotDir, runner({ pid: 101 }));
    const tmp = path.join(dotDir, 'state', 'runs', '.run-1.json.tmp-9-9');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, '{', 'utf-8');
    const old = (NOW - LOST_AFTER_MS - 1) / 1000;
    fs.utimesSync(tmp, old, old);
    const removed = pruneRunFiles(dotDir, here).map((file) => path.basename(file)).sort();
    expect(removed).toEqual(['.run-1.json.tmp-9-9', 'mac-101.json']);
    expect(listRunners(dotDir).map((r) => r.pid)).toEqual([100]);
  });

  it('does nothing on a board with no state yet', () => {
    expect(pruneRunFiles(dotDir, here)).toEqual([]);
  });
});
