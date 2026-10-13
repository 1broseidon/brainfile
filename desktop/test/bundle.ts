/**
 * Loads source modules the way the app ships them: bundled by esbuild. Node
 * only strips types, and the link's modules use TypeScript that has to be
 * compiled (noise.ts is shared verbatim with brainfile-mobile, which runs it
 * through tsx), so a test asks for them here instead of importing them.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

/** One module exporting everything the given files export, as CommonJS. */
export function bundled<T>(...entries: string[]): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-bundle-'));
  const outfile = path.join(dir, 'bundle.cjs');
  buildSync({
    stdin: {
      contents: entries.map((entry) => `export * from ${JSON.stringify(path.join(ROOT, entry))};`).join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'bufferutil', 'utf-8-validate'],
    logLevel: 'silent',
  });
  return require(outfile) as T;
}
