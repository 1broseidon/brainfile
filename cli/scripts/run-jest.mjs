#!/usr/bin/env node
/**
 * Jest launcher — runs the two projects as two ISOLATED jest invocations.
 *
 * The `tui` project runs ink 7 / ink-testing-library / yoga-layout as genuine
 * native ESM, which needs Node's flag-gated VM modules API. Running both
 * projects in ONE jest process shares worker processes between them, and a
 * worker that has executed native-ESM suites corrupts the module registry for
 * later CommonJS suites ("ReferenceError: exports is not defined"). The
 * failure is worker-count dependent: invisible on many-core dev machines,
 * near-certain on 4-core CI runners.
 *
 * So: `cli` project runs WITHOUT the flag in its own process, then `tui`
 * runs WITH it. Workers never mix eras; the flag only exists where it is
 * actually needed.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestBin = require.resolve('jest/bin/jest');
const extraArgs = process.argv.slice(2);

function runProject(name, nodeFlags) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        ...nodeFlags,
        jestBin,
        '--selectProjects', name,
        // A user-supplied test-path filter may match nothing in one of the
        // two projects; that must not fail the run.
        '--passWithNoTests',
        ...extraArgs,
      ],
      { stdio: 'inherit' },
    );
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const cliCode = await runProject('cli', []);
const tuiCode = await runProject('tui', [
  '--experimental-vm-modules',
  '--disable-warning=ExperimentalWarning',
]);

process.exit(cliCode || tuiCode);
