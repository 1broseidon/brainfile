#!/usr/bin/env node
/**
 * esbuild bundle for the `brainfile` executable (TUI v3 platform).
 *
 * Why this exists
 * ---------------
 * ink 7 is ESM-only and drags in `yoga-layout`, whose entry contains a genuine
 * top-level `await` (it instantiates an inline base64 wasm blob). Top-level
 * await cannot be represented in CommonJS, so the executable has to be emitted
 * as ESM. The published package keeps `"type"` unset so the tsc-built library
 * entry (`dist/index.js`, CJS) keeps working for programmatic consumers, and
 * the bundle carries an explicit `.mjs` extension instead.
 *
 * Three non-obvious bindings, each verified rather than assumed:
 *
 * 1. `format: 'esm'` — required by yoga-layout's top-level await.
 *
 * 2. `splitting: true` + `outdir` (never a single `outfile`) — ink's
 *    `reconciler.js` guards its devtools hookup behind `process.env.DEV` and a
 *    try/caught `import.meta.resolve`, but the module it lazily imports
 *    (`ink/build/devtools.js`) *statically* imports `react-devtools-core`.
 *    Without code splitting esbuild inlines the dynamic import, hoisting that
 *    static import to the top of the entry chunk, and every single CLI
 *    invocation dies with ERR_MODULE_NOT_FOUND. With splitting the dynamic
 *    import stays a real deferred `import()` of a separate chunk that is only
 *    ever loaded when DEV=true *and* the package is genuinely installed.
 *
 * 3. `dist/cli.js` is emitted as a tiny CJS launcher that `import()`s
 *    `dist/cli.mjs`. `bin` keeps pointing at `dist/cli.js` so nothing that
 *    shells out to the published binary path (or the MCP stdio server) has to
 *    change.
 */
import { build } from 'esbuild';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = join(pkgRoot, 'dist');

// The bundle is built into a folder of its own under dist, then each file is
// moved into place (a rename, atomic), and only then are the chunks of the
// build before removed. A `brainfile mcp` an agent starts meanwhile (the
// desktop's dev loop rebuilds while agents run) finds either the old bundle
// whole or the new one, never cli.js without the cli.mjs it imports
// (ERR_MODULE_NOT_FOUND). Split chunks are content-hashed, so a rebuild after
// any source change emits a new filename and orphans the old one; left alone
// they would accumulate in `dist` and ship in the tarball. `.mjs` is
// exclusively ours; the tsc library build emits `.js`.
mkdirSync(outdir, { recursive: true });
for (const entry of readdirSync(outdir)) if (entry.startsWith('.bundle-')) rmSync(join(outdir, entry), { recursive: true, force: true });
const staging = mkdtempSync(join(outdir, '.bundle-'));
const before = readdirSync(outdir).filter((entry) => entry.endsWith('.mjs') || entry.endsWith('.mjs.map'));
const isBundle = (entry) => entry.endsWith('.mjs') || entry.endsWith('.mjs.map');

// ESM has no __dirname/__filename/require. `src/program.ts` reads package.json via
// __dirname and `src/commands/schema.ts` resolves the schemas dir the same way;
// both must keep resolving relative to dist/, which is where the bundle lands.
const esmShims = [
  `import { createRequire as __brainfileCreateRequire } from 'node:module';`,
  `import { fileURLToPath as __brainfileFileURLToPath } from 'node:url';`,
  `import { dirname as __brainfileDirname } from 'node:path';`,
  `const require = __brainfileCreateRequire(import.meta.url);`,
  `const __filename = __brainfileFileURLToPath(import.meta.url);`,
  `const __dirname = __brainfileDirname(__filename);`,
].join('\n');

const result = await build({
  // `hook` is the lean entry for `brainfile hooks session-start` (spec-11):
  // core and the brief only, no commander, MCP server or TUI. Splitting keeps
  // the code the two entries share in common chunks.
  entryPoints: [join(pkgRoot, 'src', 'cli.ts'), join(pkgRoot, 'src', 'hook.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  splitting: true,
  outdir: staging,
  outExtension: { '.js': '.mjs' },
  // Reachable only through ink's DEV-guarded devtools chunk. Marking them
  // external keeps the multi-MB devtools payload out of the shipped bundle;
  // splitting is what makes that safe (see note 2 above).
  //
  // `node:sqlite` (the local index, spec-11) is loaded at run time through
  // process.getBuiltinModule inside try/catch, so a Node without it falls
  // back to the scan; listed here so no bundler change can ever inline or
  // reject it.
  external: ['react-devtools-core', 'ws', 'node:sqlite'],
  // react and react-reconciler ship a dev and a prod CJS build behind a
  // NODE_ENV branch; without this both get bundled (~730 kB of dead weight in
  // the shipped executable). No brainfile source reads NODE_ENV, so pinning it
  // only prunes the vendored React dev builds.
  define: { 'process.env.NODE_ENV': '"production"' },
  // No shebang here: esbuild already hoists the one from `src/cli.ts` to line 1
  // of the entry chunk, and repeating it produces two shebang lines (a syntax
  // error) plus a stray shebang inside every split chunk.
  banner: { js: esmShims },
  // The bundle inlines ink + react + yoga's base64 wasm; a source map for it is
  // ~6 MB and would dominate the published tarball. Library output built by
  // `tsc -p tsconfig.lib.json` keeps its declaration and source maps.
  sourcemap: false,
  metafile: true,
  logLevel: 'info',
});

chmodSync(join(staging, 'cli.mjs'), 0o755);
chmodSync(join(staging, 'hook.mjs'), 0o755);

// Into place, each whole; then what the build before left that this one did not write.
const built = readdirSync(staging);
for (const entry of built) renameSync(join(staging, entry), join(outdir, entry));
rmSync(staging, { recursive: true, force: true });
for (const entry of before) if (!built.includes(entry)) rmSync(join(outdir, entry), { force: true });

// CJS launcher so `bin` (and every existing `node dist/cli.js ...` call site,
// including the MCP stdio server) keeps working against a package that is not
// `"type": "module"`.
const launcher = `#!/usr/bin/env node
'use strict';
// Generated by scripts/build-bundle.mjs — do not edit.
// Defers to the ESM bundle; dynamic import() is the only way a CJS file can
// load ESM, and the bundle must be ESM because yoga-layout uses top-level await.
// \`brainfile hooks session-start\` runs the lean hook entry instead: an agent's
// session start should not pay for the whole CLI.
const args = process.argv.slice(2);
const entry = args.length === 2 && args[0] === 'hooks' && args[1] === 'session-start'
  ? './hook.mjs'
  : './cli.mjs';
import(entry).catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
const launcherPath = join(outdir, 'cli.js');
writeFileSync(`${launcherPath}.tmp`, launcher, { encoding: 'utf8', mode: 0o755 });
chmodSync(`${launcherPath}.tmp`, 0o755);
renameSync(`${launcherPath}.tmp`, launcherPath);

const outputs = Object.entries(result.metafile.outputs)
  .filter(([file]) => isBundle(file))
  .map(([file, meta]) => `  dist/${basename(file)} (${(meta.bytes / 1024).toFixed(1)} kB)`)
  .sort();
console.log(`bundle: ${outputs.length} chunk(s)\n${outputs.join('\n')}`);
console.log('  dist/cli.js (CJS launcher)');
