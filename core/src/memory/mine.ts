/**
 * Which of a project's own files the local index reads (recoil's rules):
 * markdown and plain text (README, AGENTS.md, CLAUDE.md, docs/, …), at most
 * 256 KiB each, skipping `.git`, `node_modules`, `dist` and the like and
 * hidden paths. Inside git the list comes from
 * `git ls-files -co --exclude-standard`, so `.gitignore` is honoured; outside
 * git, a walk with the same skip list. `.brainfile/` is never part of it: the
 * board is indexed on its own terms.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const MAX_FILE_BYTES = 256 * 1024;
/** A ceiling on how many files one project contributes. */
export const MAX_DOC_FILES = 5000;

/** Directories never read. */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.brainfile', '.git', '.hg', '.svn', '.recoil',
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  'coverage', '.next', '.cache', 'tmp', 'temp',
]);

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.txt', '.text', '.rst', '.adoc', '.asciidoc', '.org']);

/** Extensionless names worth reading: README, AGENTS, CONTRIBUTING, … */
const OPERATIONAL_NAMES = new Set([
  'agents', 'claude', 'readme', 'security', 'security_contacts', 'security_policy',
  'contributing', 'contribute', 'developers', 'developing', 'developer',
]);

/** Instructions agents read whether or not git tracks them; included even when ignored. */
export const ALWAYS_INCLUDED_ROOT_DOCS: readonly string[] = ['AGENTS.md', 'CLAUDE.md'];

/** Hidden folders that still hold documentation. */
function isOperationalHiddenDir(rel: string): boolean {
  return rel === '.github' || rel === '.well-known' || rel.endsWith('/.well-known');
}

/** True for a markdown or text file, or an extensionless README-like name. */
export function isSupportedTextPath(rel: string): boolean {
  const base = path.posix.basename(rel).toLowerCase();
  const ext = path.posix.extname(base);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return ext === '' && OPERATIONAL_NAMES.has(base);
}

/** True when a path (relative, `/`-separated) sits in a skipped or hidden folder, or is itself hidden. */
export function isSkippedPath(rel: string): boolean {
  const parts = rel.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isDir = i < parts.length - 1;
    if (isDir && SKIP_DIRS.has(part)) return true;
    if (part.startsWith('.')) {
      const prefix = parts.slice(0, i + 1).join('/');
      if (isDir && isOperationalHiddenDir(prefix)) continue;
      return true;
    }
  }
  return false;
}

export interface MinedFile {
  /** Relative to the project root, `/`-separated. */
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

export interface MineResult {
  files: MinedFile[];
  /** How the list was made: git, a walk, or not at all (no project, or the home folder). */
  via: 'git' | 'walk' | 'none';
}

/** The project roots never mined: the home folder and a filesystem root. */
export function isUnminableRoot(root: string): boolean {
  const resolved = path.resolve(root);
  return resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir());
}

function statFile(root: string, rel: string): MinedFile | null {
  const abs = path.join(root, rel);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return { rel, abs, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

function gitListing(root: string): string[] | null {
  const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout.split('\0').filter(Boolean);
}

function walkListing(root: string, limit: number): string[] {
  const out: string[] = [];
  const visit = (dir: string, rel: string, depth: number) => {
    if (out.length >= limit || depth > 12) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= limit) return;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && !isOperationalHiddenDir(childRel)) continue;
        visit(path.join(dir, entry.name), childRel, depth + 1);
      } else if (entry.isFile() && isSupportedTextPath(childRel) && !isSkippedPath(childRel)) {
        out.push(childRel);
      }
    }
  };
  visit(root, '', 0);
  return out;
}

/**
 * The project's own documents under `root`, sorted by path. Never the
 * home folder or a filesystem root (a home board has no project to read).
 */
export function listProjectDocs(root: string, options: { maxFiles?: number } = {}): MineResult {
  const limit = options.maxFiles ?? MAX_DOC_FILES;
  if (isUnminableRoot(root)) return { files: [], via: 'none' };
  try {
    if (!fs.statSync(root).isDirectory()) return { files: [], via: 'none' };
  } catch {
    return { files: [], via: 'none' };
  }

  const listed = gitListing(root);
  const via: MineResult['via'] = listed ? 'git' : 'walk';
  const candidates = (listed ?? walkListing(root, limit * 4))
    .map((rel) => rel.split(path.sep).join('/'))
    .filter((rel) => isSupportedTextPath(rel) && !isSkippedPath(rel));
  for (const name of ALWAYS_INCLUDED_ROOT_DOCS) {
    if (!candidates.includes(name) && fs.existsSync(path.join(root, name))) candidates.push(name);
  }

  const files: MinedFile[] = [];
  for (const rel of [...new Set(candidates)].sort()) {
    if (files.length >= limit) break;
    const file = statFile(root, rel);
    if (file) files.push(file);
  }
  return { files, via };
}
