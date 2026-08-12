#!/usr/bin/env node
/**
 * Jest launcher.
 *
 * The `tui` Jest project runs ink 7 / ink-testing-library / yoga-layout as
 * genuine native ESM (no transform), which requires Node's VM modules API —
 * still flag-gated. The flag is a process-level switch applied to the whole
 * `jest` invocation, but it only changes behaviour for files a project marks
 * via `extensionsToTreatAsEsm`; the existing `cli` project keeps running
 * through the exact same ts-jest CommonJS path it always has.
 *
 * This wrapper exists instead of inlining the flag in the npm script because
 * jest's bin is hoisted to the workspace root here and lives in the package's
 * own node_modules in a standalone install — `require.resolve` finds it either
 * way, and on any platform.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// jest exports its launcher as the extensionless subpath './bin/jest'.
const jestBin = require.resolve('jest/bin/jest');

const child = spawn(
  process.execPath,
  [
    '--experimental-vm-modules',
    '--disable-warning=ExperimentalWarning',
    jestBin,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
