#!/usr/bin/env node
/**
 * Bundle the Node-side entry points with esbuild: main, the preload
 * (sandboxed, so CommonJS with only `electron` external), the board host
 * utility process, which carries @brainfile/core inside it, and the agents
 * process.
 */
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
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
  // ws (the phone link) tries these native speed-ups and does without them.
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
