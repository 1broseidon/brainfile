#!/usr/bin/env node
/**
 * Bundle the three Node-side entry points with esbuild: main, the preload
 * (sandboxed, so CommonJS with only `electron` external), and the board host
 * utility process, which carries @brainfile/core inside it.
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
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
