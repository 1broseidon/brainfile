import * as fs from 'fs';
import * as path from 'path';

/**
 * `@brainfile/core/browser` must stay loadable in a renderer: nothing it
 * reaches may import a Node built-in at runtime. Walks the entry's relative
 * imports (type-only imports are erased, so they do not count).
 */
const NODE_ONLY = /^(node:)?(fs|path|child_process|crypto|os|url|util|stream|events)$/;

function runtimeImports(source: string): string[] {
  const out: string[] = [];
  const pattern = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) out.push(match[1]);
  const bare = /^import\s+['"]([^'"]+)['"]/gm;
  while ((match = bare.exec(source))) out.push(match[1]);
  return out;
}

function walk(file: string, seen: Set<string>, nodeImports: string[], packages: string[] = []): void {
  if (seen.has(file)) return;
  seen.add(file);
  const source = fs.readFileSync(file, 'utf-8');
  for (const spec of runtimeImports(source)) {
    if (spec.startsWith('.')) {
      const base = path.resolve(path.dirname(file), spec);
      const candidates = [`${base}.ts`, path.join(base, 'index.ts')];
      const next = candidates.find((c) => fs.existsSync(c));
      if (next) walk(next, seen, nodeImports, packages);
    } else if (NODE_ONLY.test(spec)) {
      nodeImports.push(`${path.basename(file)} → ${spec}`);
    } else {
      packages.push(spec);
    }
  }
}

const DISPATCH = path.join(__dirname, '..', 'dispatch') + path.sep;
const ACP_SDK = '@agentclientprotocol/sdk';

describe('browser entry', () => {
  it('reaches no Node built-in', () => {
    const seen = new Set<string>();
    const nodeImports: string[] = [];
    walk(path.join(__dirname, '..', 'browser.ts'), seen, nodeImports);
    expect(nodeImports).toEqual([]);
    expect([...seen].map((f) => path.basename(f))).toEqual(expect.arrayContaining(['docTypes.ts', 'docGraph.ts']));
  });

  it('reaches nothing of dispatch, nor the ACP SDK (decision-18)', () => {
    for (const entry of ['browser.ts', 'index.ts']) {
      const seen = new Set<string>();
      const packages: string[] = [];
      walk(path.join(__dirname, '..', entry), seen, [], packages);
      expect([...seen].filter((f) => f.startsWith(DISPATCH))).toEqual([]);
      expect(packages).not.toContain(ACP_SDK);
    }
  });

  it('exports the type registry and the graph', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const browser = require('../browser');
    for (const name of ['DOC_TYPES', 'TYPE_ALIASES', 'TYPE_GLYPHS', 'resolveDocType', 'parentFit', 'listDocTypes', 'buildDocGraph', 'decisionStatus', 'checkDocumentLinks']) {
      expect(browser[name]).toBeDefined();
    }
  });
});

describe('dispatch entry', () => {
  it('loads the ACP SDK only when a session opens: its imports of it are types', () => {
    const seen = new Set<string>();
    const packages: string[] = [];
    walk(path.join(DISPATCH, 'index.ts'), seen, [], packages);
    expect([...seen].map((f) => path.basename(f))).toEqual(expect.arrayContaining(['session.ts', 'agents.ts', 'brief.ts']));
    expect(packages).not.toContain(ACP_SDK);
    expect(fs.readFileSync(path.join(DISPATCH, 'session.ts'), 'utf-8')).toContain(`require('${ACP_SDK}')`);
  });
});
