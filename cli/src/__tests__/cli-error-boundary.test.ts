/**
 * The CLI's outermost error boundary.
 *
 * Commands throw `CLIError` instead of exiting themselves, but nothing used to
 * catch those throws: `cli.ts` called the synchronous `program.parse()` with
 * no surrounding try/catch and no `unhandledRejection`/`uncaughtException`
 * handler, so `brainfile complete` (no `--task`) escaped as an uncaught
 * exception and Node printed a raw stack trace instead of the message and
 * usage hint the error already carried.
 *
 * Covered in three layers, because each catches a different regression:
 *  1. wiring   — cli.ts still awaits parseAsync and routes failures here
 *  2. unit     — renderCliError's two branches behave correctly
 *  3. end-to-end — the real built CLI prints the right thing and exits right
 */
import { describe, test, expect, jest, beforeAll, afterEach } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CLIError, missingRequired, renderCliError } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';

// ── 1. wiring ──────────────────────────────────────────────────────────────

describe('cli entry point error wiring', () => {
  const cliSource = fs.readFileSync(path.join(__dirname, '..', 'cli.ts'), 'utf-8');

  /**
   * `parseAsync` is an async function awaiting commander's action chain, so it
   * converts BOTH a synchronous throw from a sync action handler and a
   * rejection from an async one into a single rejected promise. The plain
   * `program.parse()` could catch neither.
   */
  test('parses asynchronously so thrown and rejected failures both surface', () => {
    expect(cliSource).toContain('program.parseAsync().catch(renderCliError)');
    expect(cliSource).not.toMatch(/^\s*program\.parse\(\);/m);
  });
});

// ── 2. unit ────────────────────────────────────────────────────────────────

describe('renderCliError', () => {
  const errors: string[] = [];
  let exitCode: number | undefined;

  function install() {
    errors.length = 0;
    exitCode = undefined;
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code;
      throw new Error('__exit__');
    }) as never);
  }

  /** Runs renderCliError, absorbing the mocked process.exit. */
  function render(error: unknown): void {
    install();
    try {
      renderCliError(error);
    } catch (e) {
      if ((e as Error).message !== '__exit__') throw e;
    }
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('prints a CLIError message and its usage details, with no stack', () => {
    render(missingRequired('--task', 'brainfile complete --task <task-id>'));

    const output = errors.join('\n');
    expect(output).toContain('--task is required');
    expect(output).toContain('Usage: brainfile complete --task <task-id>');
    // A stack tells the user nothing about a missing flag.
    expect(output).not.toMatch(/\n\s+at /);
  });

  test('exits with the code the CLIError carries', () => {
    render(new CLIError('boom', ExitCode.USER_ERROR));
    expect(exitCode).toBe(ExitCode.USER_ERROR);
  });

  test('omits the details block when the CLIError has none', () => {
    render(new CLIError('bare failure'));
    const output = errors.join('\n');
    expect(output).toContain('bare failure');
    expect(output.trim().split('\n').filter(Boolean)).toHaveLength(1);
  });

  test('preserves the full stack for a genuine (non-CLIError) bug', () => {
    render(new Error('unexpected explosion'));

    const output = errors.join('\n');
    expect(output).toContain('unexpected explosion');
    // The stack is the diagnostic — it must not be swallowed or truncated.
    expect(output).toMatch(/\n\s+at /);
    expect(exitCode).toBe(1);
  });

  test('stringifies a non-Error throw rather than losing it', () => {
    render('just a string');
    expect(errors.join('\n')).toContain('just a string');
    expect(exitCode).toBe(1);
  });
});

// ── 3. end-to-end ──────────────────────────────────────────────────────────

/**
 * The bug was in the wiring, not the renderer, so it is worth proving at the
 * real process boundary. Both CI and the release build run `npm run build`
 * before tests; when the bundle is genuinely absent these skip loudly rather
 * than failing a fresh checkout that has only run `npm ci`.
 */
describe('built CLI error output', () => {
  const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
  const hasBundle = fs.existsSync(distCli);

  let boardPath: string;
  let malformedPath: string;

  beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-cli-boundary-'));

    const dotDir = path.join(tempDir, 'good', '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    boardPath = path.join(dotDir, 'brainfile.md');
    fs.writeFileSync(
      boardPath,
      `---
title: Boundary Board
columns:
  - id: todo
    title: To Do
---
`,
      'utf-8',
    );

    const badDir = path.join(tempDir, 'bad', '.brainfile');
    fs.mkdirSync(path.join(badDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(badDir, 'logs'), { recursive: true });
    malformedPath = path.join(badDir, 'brainfile.md');
    // Unterminated quote + unclosed flow sequence: the YAML parser throws
    // before any CLIError helper is reached.
    fs.writeFileSync(
      malformedPath,
      '---\ntitle: Bad\ncolumns:\n  - id: todo\n    title: "unterminated\n  bad: [1, 2\n---\n',
      'utf-8',
    );
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
      `[cli-error-boundary] dist/cli.js not found — skipping end-to-end checks. Run \`npm run build\` to enable them.`,
    );
  }

  maybe('a missing required option prints message + usage, not a stack', () => {
    const result = runCli(['complete', '-f', boardPath]);

    expect(result.stderr).toContain('--task is required');
    expect(result.stderr).toContain('Usage: brainfile complete --task <task-id>');
    // The regression this guards: a raw uncaught-exception stack trace.
    expect(result.stderr).not.toContain('CLIError:');
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(result.status).toBe(ExitCode.USER_ERROR);
    expect(result.stdout).toBe('');
  });

  /**
   * The gap was never `complete`-specific: 15 command files throw CLIError and
   * 7 have no local try/catch at all. One top-level catch closes all of them,
   * so a second command proves the fix is systemic.
   */
  maybe('the same fix covers other commands that throw CLIError', () => {
    for (const command of ['move', 'show']) {
      const result = runCli([command, '-f', boardPath]);
      expect(result.stderr).toContain('--task is required');
      expect(result.stderr).not.toMatch(/\n\s+at /);
      expect(result.status).toBe(ExitCode.USER_ERROR);
    }
  });

  maybe('a genuine crash keeps its stack trace', () => {
    const result = runCli(['list', '-f', malformedPath]);

    expect(result.stderr).toContain('Failed to parse');
    // Non-CLIError failures are real bugs: the stack must survive.
    expect(result.stderr).toMatch(/\n\s+at /);
    expect(result.status).toBe(1);
  });

  maybe('a successful command still exits 0', () => {
    const result = runCli(['list', '-f', boardPath]);
    expect(result.status).toBe(0);
  });
});
