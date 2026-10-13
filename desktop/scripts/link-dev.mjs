#!/usr/bin/env node
/**
 * `npm run link:dev`: the phone link's harness (src/link/dev.ts), bundled
 * with esbuild as the app's own bundles are, and run: the real server on
 * port 47211 with a fake desk, for the phone in the iOS Simulator.
 *
 *   npm run link:dev
 *   npm run link:dev -- --link /tmp/brainfile-link.txt   # the pairing link, kept in a file
 *   npm run link:dev -- --fresh                          # a new desk key; linked phones forgotten
 *   npm run link:dev -- --port 47212
 */
import { buildSync } from 'esbuild';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(os.tmpdir(), 'brainfile-link-dev', 'harness.cjs');

buildSync({
  absWorkingDir: desktop,
  entryPoints: ['src/link/dev.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  sourcemap: 'inline',
  logLevel: 'warning',
});

process.env.BRAINFILE_LINK_FIXTURE = path.join(desktop, 'test', 'fixtures', 'link');
createRequire(import.meta.url)(outfile);
