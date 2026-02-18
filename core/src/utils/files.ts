import * as fs from 'fs';
import * as path from 'path';

export const DOT_BRAINFILE_DIRNAME = '.brainfile';
export const BRAINFILE_BASENAME = 'brainfile.md';
/** @deprecated state.json is no longer used by Brainfile. */
export const BRAINFILE_STATE_BASENAME = 'state.json';
export const DOT_BRAINFILE_GITIGNORE_BASENAME = '.gitignore';

export type BrainfileResolutionKind = 'dotdir' | 'root' | 'hidden' | 'bb';

export interface FoundBrainfile {
  absolutePath: string;
  /** Directory considered the "project root" for this brainfile */
  projectRoot: string;
  kind: BrainfileResolutionKind;
}

function toAbsolute(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(p);
}

function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Find a brainfile by walking up from a starting directory.
 *
 * Resolution priority (per directory):
 * 1) `.brainfile/brainfile.md` (preferred)
 * 2) `brainfile.md` (legacy)
 * 3) `.brainfile.md` (legacy hidden)
 * 4) `.bb.md` (legacy)
 */
export function findBrainfile(startDir: string = process.cwd()): FoundBrainfile | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (true) {
    const preferred = path.join(currentDir, DOT_BRAINFILE_DIRNAME, BRAINFILE_BASENAME);
    if (existsFile(preferred)) {
      return { absolutePath: preferred, projectRoot: currentDir, kind: 'dotdir' };
    }

    const legacy = path.join(currentDir, BRAINFILE_BASENAME);
    if (existsFile(legacy)) {
      return { absolutePath: legacy, projectRoot: currentDir, kind: 'root' };
    }

    const hiddenLegacy = path.join(currentDir, '.brainfile.md');
    if (existsFile(hiddenLegacy)) {
      return { absolutePath: hiddenLegacy, projectRoot: currentDir, kind: 'hidden' };
    }

    const bbLegacy = path.join(currentDir, '.bb.md');
    if (existsFile(bbLegacy)) {
      return { absolutePath: bbLegacy, projectRoot: currentDir, kind: 'bb' };
    }

    if (currentDir === root) break;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return null;
}

export interface ResolveBrainfilePathOptions {
  /**
   * If set, an explicit file path. If `undefined` or the default `brainfile.md`,
   * auto-discovery is used.
   */
  filePath?: string;
  /** Starting directory used for auto-discovery and relative resolution */
  startDir?: string;
}

/**
 * Resolve a brainfile path for CLI/MCP usage.
 *
 * - If `filePath` is omitted (or is the default `brainfile.md`), attempts auto-discovery.
 * - If discovery fails, falls back to resolving `filePath` relative to `startDir`/cwd.
 */
export function resolveBrainfilePath(options: ResolveBrainfilePathOptions = {}): string {
  const startDir = options.startDir ? path.resolve(options.startDir) : process.cwd();
  const filePath = options.filePath;

  const isDefaultPlaceholder =
    filePath === undefined ||
    filePath === BRAINFILE_BASENAME ||
    filePath === `./${BRAINFILE_BASENAME}`;

  if (isDefaultPlaceholder) {
    const found = findBrainfile(startDir);
    if (found) return found.absolutePath;
    return toAbsolute(filePath ?? BRAINFILE_BASENAME);
  }

  return toAbsolute(path.isAbsolute(filePath) ? filePath : path.resolve(startDir, filePath));
}

/**
 * Return the `.brainfile/` directory for a given brainfile.
 *
 * - If the brainfile itself is inside `.brainfile/`, returns that directory.
 * - Otherwise returns `<brainfileDir>/.brainfile/`.
 */
export function getBrainfileStateDir(brainfilePath: string): string {
  const abs = toAbsolute(brainfilePath);
  const dir = path.dirname(abs);
  if (path.basename(dir) === DOT_BRAINFILE_DIRNAME) return dir;
  return path.join(dir, DOT_BRAINFILE_DIRNAME);
}

/**
 * @deprecated state.json is no longer used by Brainfile.
 */
export function getBrainfileStatePath(brainfilePath: string): string {
  return path.join(getBrainfileStateDir(brainfilePath), BRAINFILE_STATE_BASENAME);
}

export function getDotBrainfileGitignorePath(brainfilePath: string): string {
  return path.join(getBrainfileStateDir(brainfilePath), DOT_BRAINFILE_GITIGNORE_BASENAME);
}

export function ensureDotBrainfileDir(brainfilePath: string): string {
  const dir = getBrainfileStateDir(brainfilePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Ensure `.brainfile/.gitignore` exists.
 *
 * Note: Brainfile no longer writes `state.json`, so no state entry is added.
 */
export function ensureDotBrainfileGitignore(brainfilePath: string): void {
  ensureDotBrainfileDir(brainfilePath);
  const gitignorePath = getDotBrainfileGitignorePath(brainfilePath);

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '', 'utf-8');
  }
}
