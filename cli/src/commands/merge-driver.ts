/**
 * `brainfile merge-driver <base> <ours> <theirs>` — git merge driver for
 * board documents (spec-9). Registered by init/migrate/sync as
 * `merge.brainfile.driver`, selected by `.gitattributes` on the board branch.
 *
 * Frontmatter merges field by field: a field changed on one side takes that
 * side; changed on both, the later `updatedAt` wins and a tie goes to theirs,
 * so both machines converge on the same answer. The body goes through git's
 * own three-way text merge; a conflict whose two sides are both list items
 * (log entries, notes) resolves by union ordered by timestamp. Anything else
 * keeps git's markers and exits 1 so `sync` can name the file.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { parseFrontmatter, serializeFrontmatter } from '@brainfile/core';

type Fields = Record<string, unknown>;

export interface MergeOutcome {
  content: string;
  /** False when conflict markers remain in the body. */
  clean: boolean;
}

interface Doc {
  data: Fields;
  body: string;
}

function parseDoc(content: string): Doc | null {
  const parsed = parseFrontmatter<Fields>(content);
  if (!parsed) return null;
  return { data: parsed.data, body: parsed.body };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function stamp(data: Fields): string {
  const value = data.updatedAt;
  return typeof value === 'string' ? value : '';
}

/** Field-level last-writer-wins; exported for tests. */
export function mergeFields(base: Fields, ours: Fields, theirs: Fields): Fields {
  const keys: string[] = [];
  for (const key of [...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)]) {
    if (!keys.includes(key)) keys.push(key);
  }
  const oursWins = stamp(ours) > stamp(theirs);
  const out: Fields = {};
  for (const key of keys) {
    const b = base[key];
    const o = ours[key];
    const t = theirs[key];
    let pick: unknown;
    if (same(o, t)) pick = o;
    else if (same(b, o)) pick = t;
    else if (same(b, t)) pick = o;
    else if (key === 'updatedAt') pick = String(o ?? '') > String(t ?? '') ? o : t;
    else pick = oursWins ? o : t;
    if (pick !== undefined) out[key] = pick;
  }
  return out;
}

const CONFLICT = /^<{7}[^\n]*\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7}[^\n]*\n?/gm;
const LIST_ITEM = /^\s*[-*]\s+/;
const LEADING_STAMP = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2}T[0-9:.]+Z?)\b/;

function unionLists(ours: string, theirs: string): string | null {
  const a = ours.split('\n').filter((l) => l.trim().length > 0);
  const b = theirs.split('\n').filter((l) => l.trim().length > 0);
  if (![...a, ...b].every((l) => LIST_ITEM.test(l))) return null;
  const merged = [...a];
  for (const line of b) if (!merged.includes(line)) merged.push(line);
  if (merged.every((l) => LEADING_STAMP.test(l))) {
    merged.sort((x, y) => {
      const sx = LEADING_STAMP.exec(x)?.[1] ?? '';
      const sy = LEADING_STAMP.exec(y)?.[1] ?? '';
      return sx < sy ? -1 : sx > sy ? 1 : 0;
    });
  }
  return `${merged.join('\n')}\n`;
}

/** Three-way text merge through git, then union-resolve list conflicts. */
export function mergeBodies(base: string, ours: string, theirs: string): MergeOutcome {
  if (ours === theirs) return { content: ours, clean: true };
  if (base === ours) return { content: theirs, clean: true };
  if (base === theirs) return { content: ours, clean: true };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-merge-'));
  try {
    const files = { base: path.join(dir, 'base'), ours: path.join(dir, 'ours'), theirs: path.join(dir, 'theirs') };
    fs.writeFileSync(files.base, base);
    fs.writeFileSync(files.ours, ours);
    fs.writeFileSync(files.theirs, theirs);
    const r = spawnSync('git', ['merge-file', '-p', '-L', 'ours', '-L', 'base', '-L', 'theirs', files.ours, files.base, files.theirs], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === null || r.status < 0) {
      return { content: `<<<<<<< ours\n${ours}=======\n${theirs}>>>>>>> theirs\n`, clean: false };
    }
    if (r.status === 0) return { content: r.stdout, clean: true };
    let clean = true;
    const content = r.stdout.replace(CONFLICT, (whole, oursHunk: string, theirsHunk: string) => {
      const union = unionLists(oursHunk, theirsHunk);
      if (union === null) {
        clean = false;
        return whole;
      }
      return union;
    });
    return { content, clean };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Merge two board documents against their common base. */
export function mergeBoardDocuments(base: string, ours: string, theirs: string): MergeOutcome {
  const b = parseDoc(base);
  const o = parseDoc(ours);
  const t = parseDoc(theirs);
  if (!o || !t) return mergeBodies(base, ours, theirs);
  const data = mergeFields(b?.data ?? {}, o.data, t.data);
  const body = mergeBodies(b?.body ?? '', o.body, t.body);
  return { content: serializeFrontmatter(data, body.content), clean: body.clean };
}

/** "column: todo → review; title: …" for the fields that differ; exported for sync. */
export function summarizeFieldChanges(before: string, after: string): string {
  const b = parseDoc(before)?.data ?? {};
  const a = parseDoc(after)?.data ?? {};
  const parts: string[] = [];
  for (const key of Object.keys(a)) {
    if (key === 'updatedAt' || same(b[key], a[key])) continue;
    const render = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
    parts.push(`${key}: ${b[key] === undefined ? '∅' : render(b[key])} → ${render(a[key])}`);
  }
  return parts.join('; ');
}

export interface MergeDriverOptions {
  base: string;
  ours: string;
  theirs: string;
}

/**
 * Entry point for git: reads the three files, writes the result over `ours`,
 * returns the exit code (0 clean, 1 conflicts remain, 2 usage).
 */
export function mergeDriverCommand(options: MergeDriverOptions): number {
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '');
  if (!options.ours || !options.theirs) return 2;
  const outcome = mergeBoardDocuments(read(options.base), read(options.ours), read(options.theirs));
  fs.writeFileSync(options.ours, outcome.content, 'utf-8');
  return outcome.clean ? 0 : 1;
}
