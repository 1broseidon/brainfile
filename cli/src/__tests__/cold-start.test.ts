/**
 * Cold-start guard (§C5 / rubric P1).
 *
 * P1 is "time-to-truth": cold launch to a readable board has to stay fast. The
 * specific regression worth catching is structural, not a few milliseconds of
 * drift — the TUI chunk (ink + react + yoga-wasm) is loaded through a dynamic
 * `import()` inside the `tui` action handler precisely so that every non-TUI
 * invocation never pays for it. Turning that into a static import at the top of
 * `cli.ts` would not fail a single existing test; it would just make the whole
 * CLI several times slower to start, forever, quietly.
 *
 * So the budgets here are deliberately an order of magnitude above what the
 * code actually does (measured: `tui --help` ≈ 190ms, first frame ≈ 90ms). They
 * are not micro-benchmarks and must never become flaky on a loaded CI runner —
 * if one of these trips, something structural changed.
 */
import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const distCli = path.join(__dirname, '..', '..', 'dist', 'cli.js');
const hasBundle = fs.existsSync(distCli);

/** ~10x the observed ~190ms. */
const HELP_BUDGET_MS = 2000;

describe('cold start (§C5 / P1)', () => {
  const maybe = hasBundle ? test : test.skip;

  if (!hasBundle) {
    // eslint-disable-next-line no-console
    console.warn(
      '[cold-start] dist/cli.js not found — skipping. Run `npm run build` to enable.',
    );
  }

  function timeCli(args: string[]) {
    const started = Date.now();
    const result = spawnSync(process.execPath, [distCli, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    return { ms: Date.now() - started, result };
  }

  maybe('tui --help responds well inside the budget', () => {
    // Warm the filesystem cache so the first run's disk I/O is not the measurement.
    timeCli(['tui', '--help']);

    const { ms, result } = timeCli(['tui', '--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('tui');
    expect(ms).toBeLessThan(HELP_BUDGET_MS);
  });

  maybe('the TUI chunk stays lazy — --help never loads ink', () => {
    // The structural claim behind the budget, asserted directly rather than
    // inferred from a timing number: commander resolves `--help` without
    // running the action handler, so the dynamic import never fires.
    const source = fs.readFileSync(path.join(__dirname, '..', 'cli.ts'), 'utf-8');

    // No static import of the TUI entry point anywhere in cli.ts…
    expect(source).not.toMatch(/^import .*from ['"]\.\/commands\/tui/m);
    // …and the only reference to it is a dynamic import.
    expect(source).toMatch(/await import\(['"]\.\/commands\/tui/);
  });

  maybe('a plain list is not slowed down by the TUI chunk either', () => {
    timeCli(['--version']);
    const { ms, result } = timeCli(['--version']);

    expect(result.status).toBe(0);
    expect(ms).toBeLessThan(HELP_BUDGET_MS);
  });
});
