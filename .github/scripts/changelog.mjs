#!/usr/bin/env node
// Usage: node .github/scripts/changelog.mjs            print what the next release will say
//        node .github/scripts/changelog.mjs <version>  fold changes/ into CHANGELOG.md as <version>
//
// A change is written as its own small file in changes/ (task-64), so two
// branches never edit the same lines of CHANGELOG.md. A fragment is either a
// paragraph of prose for the release's opening, or, under a `kind:` front
// matter, entries for that kind's list:
//
//   ---
//   kind: Fixed
//   ---
//   - A board never commits `state/`, whatever its `.gitignore` says.
//
// The release folds every fragment, and whatever Unreleased already holds,
// into one dated section, and removes the fragments.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep a Changelog's kinds, in its order. */
export const KINDS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

/** One fragment: its kind, or none for prose, and its text. */
export function parseFragment(text, name) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const kind = fm ? /^kind:\s*(\S+)\s*$/m.exec(fm[1])?.[1] : undefined;
  if (kind && !KINDS.includes(kind)) throw new Error(`${name}: kind is ${kind}; it must be one of ${KINDS.join(', ')}`);
  const body = (fm ? fm[2] : text).trim();
  if (!body) throw new Error(`${name} says nothing`);
  // A list's entries are bullets: a fragment that forgot the dash gets one.
  return { name, kind, body: kind && !body.startsWith('- ') ? `- ${body}` : body };
}

/** A section's text as its prose and its kinds' lists. */
function split(text) {
  const prose = [];
  const lists = new Map();
  let into = null;
  let block = [];
  const flush = () => {
    const done = block.join('\n').trim();
    if (done) (into ? (lists.get(into) ?? lists.set(into, []).get(into)) : prose).push(done);
    block = [];
  };
  for (const line of text.split('\n')) {
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      into = heading[1];
      continue;
    }
    if (!into && !line.trim()) flush();
    block.push(line);
  }
  flush();
  return { prose, lists };
}

/** A section's text again: prose first, then each kind's list, Keep a Changelog's kinds first. */
function joinSection(prose, lists) {
  const kinds = [...KINDS.filter((k) => lists.has(k)), ...[...lists.keys()].filter((k) => !KINDS.includes(k))];
  return [...prose, ...kinds.map((k) => `### ${k}\n${lists.get(k).join('\n')}`)].join('\n\n');
}

/** What Unreleased says with the fragments folded in. */
export function unreleased(changelog, fragments) {
  const at = changelog.indexOf('## [Unreleased]');
  if (at < 0) throw new Error('CHANGELOG.md has no ## [Unreleased]');
  const next = changelog.indexOf('\n## [', at + 1);
  const { prose, lists } = split(changelog.slice(at + '## [Unreleased]'.length, next < 0 ? undefined : next).trim());
  for (const f of [...fragments].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!f.kind) prose.push(f.body);
    else (lists.get(f.kind) ?? lists.set(f.kind, []).get(f.kind)).push(f.body);
  }
  return joinSection(prose, lists);
}

/** The changelog released as `version` on `date`: Unreleased, fragments and all, becomes its section; Unreleased starts empty. */
export function release(changelog, fragments, version, date) {
  const at = changelog.indexOf('## [Unreleased]');
  const body = unreleased(changelog, fragments);
  const next = changelog.indexOf('\n## [', at + 1);
  const rest = next < 0 ? '' : changelog.slice(next + 1);
  return `${changelog.slice(0, at)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n${rest ? `\n${rest}` : ''}`;
}

/** The fragments in a folder: every .md but its README. */
export function readFragments(dir) {
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md');
  } catch {
    return [];
  }
  return names.map((n) => ({ ...parseFragment(readFileSync(join(dir, n), 'utf8'), n), file: join(dir, n) }));
}

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

/** Writes the release into CHANGELOG.md and removes the fragments it took. */
export function releaseChangelog(version, date = new Date().toISOString().slice(0, 10), root = ROOT) {
  const file = join(root, 'CHANGELOG.md');
  const fragments = readFragments(join(root, 'changes'));
  writeFileSync(file, release(readFileSync(file, 'utf8'), fragments, version, date));
  for (const f of fragments) rmSync(f.file);
  return fragments.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    console.log(`## [Unreleased]\n\n${unreleased(changelog, readFragments(join(ROOT, 'changes')))}`);
  } else {
    const n = releaseChangelog(version);
    console.log(`CHANGELOG.md: ${version}, ${n} change${n === 1 ? '' : 's'} from changes/`);
  }
}
