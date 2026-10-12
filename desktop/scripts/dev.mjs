#!/usr/bin/env node
/**
 * Dev loop: Vite serves the window with HMR, esbuild rebuilds the Node side,
 * and Electron restarts when main, preload or the host change. A change to
 * the agents process alone restarts nothing: main lets the old process go
 * and the next request starts the new one, so the window stays as it is.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

let electron = null;
let restarting = false;

/** What each bundle was last time, to tell which ones a rebuild changed. */
const BUNDLES = ['main', 'preload', 'host', 'agents'];
let last = {};
function changedBundles() {
  const now = {};
  for (const name of BUNDLES) {
    try {
      now[name] = createHash('sha1').update(readFileSync(`dist-electron/${name}.js`)).digest('hex');
    } catch {
      now[name] = '';
    }
  }
  const changed = BUNDLES.filter((name) => now[name] !== last[name]);
  last = now;
  return changed;
}
function launch() {
  electron = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, BRAINFILE_DEV_URL: url } });
  electron.on('exit', () => {
    if (!restarting) process.exit(0);
  });
}

const ctx = await context({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/preload/preload.ts', host: 'src/host/host.ts', agents: 'src/agents/agents.ts' },
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  plugins: [
    {
      name: 'restart-electron',
      setup(b) {
        b.onEnd((result) => {
          if (result.errors.length) return;
          const changed = changedBundles();
          if (electron && changed.length === 0) return;
          // main reloads the agents process itself; nothing else to do.
          if (electron && changed.every((name) => name === 'agents')) return;
          if (electron) {
            restarting = true;
            electron.once('exit', () => {
              restarting = false;
              launch();
            });
            electron.kill();
          } else {
            launch();
          }
        });
      },
    },
  ],
});
await ctx.watch();
