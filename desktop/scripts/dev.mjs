#!/usr/bin/env node
/**
 * Dev loop: Vite serves the window with HMR, esbuild rebuilds the Node side,
 * and Electron restarts when main, preload or the host change.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

let electron = null;
let restarting = false;
function launch() {
  electron = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, BRAINFILE_DEV_URL: url } });
  electron.on('exit', () => {
    if (!restarting) process.exit(0);
  });
}

const ctx = await context({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/preload/preload.ts', host: 'src/host/host.ts' },
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
