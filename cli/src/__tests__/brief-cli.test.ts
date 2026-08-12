/**
 * `brainfile brief` at the real process boundary.
 *
 * Brief is the first command with its own `--json` envelope and its own
 * per-agent state file, so the things worth proving here are the ones a unit
 * test cannot see: the envelope shape a script would actually parse, the exit
 * codes, and that `--peek` really writes nothing.
 *
 * Follows cli-error-boundary.test.ts: spawn the built bundle, skip loudly on a
 * fresh checkout that has only run `npm ci`.
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('built CLI: brainfile brief', () => {
  const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
  const hasBundle = fs.existsSync(distCli);

  let tempRoot: string;
  let boardPath: string;

  function makeBoard(): string {
    const dir = fs.mkdtempSync(path.join(tempRoot, 'board-'));
    const dotDir = path.join(dir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });

    const brainfile = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(
      brainfile,
      `---
title: Brief CLI Board
columns:
  - id: todo
    title: To Do
  - id: done
    title: Done
    completionColumn: true
agent:
  instructions:
    - Keep the build green
---
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(dotDir, 'board', 'task-1.md'),
      `---
id: task-1
title: A task for codex
column: todo
assignee: codex
createdAt: 2026-08-01T00:00:00.000Z
updatedAt: 2026-08-01T00:00:00.000Z
---

## Log
- 2026-08-01T01:00:00.000Z: [pm] context for the agent
`,
      'utf-8',
    );

    return brainfile;
  }

  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-brief-cli-'));
  });

  beforeEach(() => {
    // A board per test: brief mutates per-agent state.
    boardPath = makeBoard();
  });

  function runCli(args: string[]) {
    return spawnSync(process.execPath, [distCli, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  }

  const maybe = hasBundle ? test : test.skip;

  if (!hasBundle) {
    // eslint-disable-next-line no-console
    console.warn(
      '[brief-cli] dist/cli.js not found — skipping end-to-end checks. Run `npm run build` to enable them.',
    );
  }

  maybe('a missing --agent prints message + usage, not a stack', () => {
    const result = runCli(['brief', '-f', boardPath]);

    expect(result.stderr).toContain('--agent is required');
    expect(result.stderr).toContain('Usage: brainfile brief --agent <name>');
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(result.status).toBe(1);
  });

  maybe('a missing --agent in --json mode emits a parseable error envelope', () => {
    const result = runCli(['brief', '-f', boardPath, '--json']);

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stderr);
    expect(payload).toMatchObject({
      version: '0.1',
      kind: 'error',
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(payload.error.message).toContain('--agent is required');
    // The envelope goes to stderr so stdout stays clean for pipe consumers.
    expect(result.stdout).toBe('');
  });

  maybe('a first brief emits the {version, kind, data} envelope and exits 0', () => {
    const result = runCli(['brief', '-f', boardPath, '--agent', 'codex', '--json']);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.version).toBe('0.1');
    expect(payload.kind).toBe('brief');
    expect(payload.data).toMatchObject({
      agent: 'codex',
      mode: 'full',
      lastBriefAt: null,
      peek: false,
    });
    expect(payload.data.lanes.map((l: { id: string }) => l.id)).toEqual(
      ['orientation', 'assigned', 'notes', 'completions'],
    );
  });

  maybe('a second brief is a delta against the stored checkpoint', () => {
    const first = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'codex', '--json']).stdout,
    );
    const second = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'codex', '--json']).stdout,
    );

    expect(second.data.mode).toBe('delta');
    expect(second.data.lastBriefAt).toBe(first.data.generatedAt);
  });

  maybe('--peek twice in a row produces identical lanes and no state change', () => {
    // Establish a checkpoint first.
    runCli(['brief', '-f', boardPath, '--agent', 'codex']);

    const one = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'codex', '--peek', '--json']).stdout,
    );
    const two = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'codex', '--peek', '--json']).stdout,
    );

    expect(one.data.peek).toBe(true);
    expect(two.data.peek).toBe(true);
    // generatedAt moves with the clock; everything that reflects state must not.
    expect(two.data.lastBriefAt).toBe(one.data.lastBriefAt);
    expect(two.data.lanes).toEqual(one.data.lanes);
  });

  maybe('a first-ever --peek writes no state file', () => {
    const result = runCli(['brief', '-f', boardPath, '--agent', 'never-seen', '--peek', '--json']);
    expect(result.status).toBe(0);

    const statePath = path.join(path.dirname(boardPath), 'state', 'never-seen.json');
    expect(fs.existsSync(statePath)).toBe(false);
  });

  maybe('a non-peek brief writes gitignored per-agent state', () => {
    runCli(['brief', '-f', boardPath, '--agent', 'codex']);

    const dotDir = path.dirname(boardPath);
    const statePath = path.join(dotDir, 'state', 'codex.json');
    expect(fs.existsSync(statePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statePath, 'utf-8'))).toMatchObject({
      version: 1,
      agent: 'codex',
    });

    // Finding: without the ensureDotBrainfileGitignore fix this state gets committed.
    const ignore = fs.readFileSync(path.join(dotDir, '.gitignore'), 'utf-8');
    expect(ignore.split('\n').map((l) => l.trim())).toContain('state/');
  });

  maybe('human mode renders lane labels and a why-column', () => {
    const result = runCli(['brief', '-f', boardPath, '--agent', 'codex']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Board & Decisions');
    expect(result.stdout).toContain('Your Tasks');
    expect(result.stdout).toContain('task-1');
    expect(result.stdout).toContain('(todo)');
  });

  maybe('human mode reports an empty delta as a friendly line, exit 0', () => {
    runCli(['brief', '-f', boardPath, '--agent', 'codex']);
    const result = runCli(['brief', '-f', boardPath, '--agent', 'codex']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nothing new since your last brief.');
  });

  maybe('assignee matching is case-insensitive but not substring', () => {
    const exact = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'CODEX', '--json']).stdout,
    );
    const assignedLane = exact.data.lanes.find((l: { id: string }) => l.id === 'assigned');
    expect(assignedLane.items).toHaveLength(1);

    const substring = JSON.parse(
      runCli(['brief', '-f', boardPath, '--agent', 'cod', '--json']).stdout,
    );
    const otherLane = substring.data.lanes.find((l: { id: string }) => l.id === 'assigned');
    expect(otherLane.items).toHaveLength(0);
  });
});
