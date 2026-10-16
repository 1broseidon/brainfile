#!/usr/bin/env node
/**
 * Dev loop: Vite serves the window with HMR, esbuild rebuilds the Node side,
 * and Electron restarts when main, preload or the host change. A change to
 * the agents process alone restarts nothing: main lets the old process go
 * and the next request starts the new one, so the window stays as it is.
 *
 * Neither happens while an agent is at work: the agents process writes how
 * many are in BRAINFILE_DEV_BUSY, and a restart waits for none, so merging
 * one hand-off into this app's own code never ends another.
 *
 * The app's agents get the repository's own CLI (ownCli.ts, cli/dist), so it
 * is built once first: the bundle, which is quick, and core before it when
 * core has no dist to bundle from. A stale or missing cli/dist would fail
 * every agent's board server, or hand it last week's commands.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electronPath from 'electron';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** cli/dist as the app's agents need it: core built when it has no dist, then the CLI bundle and its schemas. */
function buildOwnCli() {
  const run = (what, command, args, cwd) => {
    console.log(`build: ${what}`);
    const r = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`build: ${what} failed, and the app's agents would get no brainfile of their own`);
      process.exit(r.status ?? 1);
    }
  };
  if (!existsSync(join(ROOT, 'core', 'dist'))) run('core (it has no dist yet)', 'npm', ['run', 'build'], join(ROOT, 'core'));
  run('the CLI bundle', process.execPath, [join(ROOT, 'cli', 'scripts', 'build-bundle.mjs')], join(ROOT, 'cli'));
  // As the CLI's copy-schemas step does.
  const schemas = join(ROOT, 'cli', 'dist', 'schemas');
  mkdirSync(schemas, { recursive: true });
  for (const name of readdirSync(join(ROOT, 'cli', 'src', 'schemas')).filter((n) => n.endsWith('.json'))) copyFileSync(join(ROOT, 'cli', 'src', 'schemas', name), join(schemas, name));
}
buildOwnCli();

const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = server.resolvedUrls.local[0];

let electron = null;
let restarting = false;

const BUSY = join(tmpdir(), `brainfile-dev-busy-${process.pid}`);
rmSync(BUSY, { force: true });
process.on('exit', () => rmSync(BUSY, { force: true }));
/** How many agents are at work in the running app. */
function atWork() {
  try {
    return Number(readFileSync(BUSY, 'utf-8')) || 0;
  } catch {
    return 0;
  }
}

/** What each bundle was last time, to tell which ones a rebuild changed. */
const BUNDLES = ['main', 'preload', 'host', 'agents'];
/** Bundles that take effect without restarting Electron: main lets the agents process go. */
const NO_RESTART = new Set(['agents']);
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
  electron = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, BRAINFILE_DEV_URL: url, BRAINFILE_DEV_BUSY: BUSY } });
  electron.on('exit', () => {
    if (!restarting) process.exit(0);
  });
}

/** Restart Electron on the new build, once no agent is at work; later rebuilds join the wait. */
let waiting = null;
function restart() {
  if (waiting) return;
  const working = atWork();
  if (working > 0) {
    console.log(`electron: the restart waits for ${working} agent run${working === 1 ? '' : 's'} to finish`);
    const again = () => {
      if (atWork() > 0) return void (waiting = setTimeout(again, 2000));
      waiting = null;
      restart();
    };
    waiting = setTimeout(again, 2000);
    return;
  }
  restarting = true;
  electron.once('exit', () => {
    restarting = false;
    launch();
  });
  electron.kill();
}

const ctx = await context({
  entryPoints: {
    main: 'src/main/main.ts',
    preload: 'src/preload/preload.ts',
    host: 'src/host/host.ts',
    agents: 'src/agents/agents.ts',
  },
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
          if (electron && changed.every((name) => NO_RESTART.has(name))) return;
          if (electron) restart();
          else launch();
        });
      },
    },
  ],
});
await ctx.watch();
