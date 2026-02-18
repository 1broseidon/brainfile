import * as fs from 'fs';
import * as path from 'path';
import { BRAINFILE_STATE_VERSION, type BrainfileState, type ContractState } from '../types/state';

export const DOT_BRAINFILE_DIRNAME = '.brainfile';
export const BRAINFILE_BASENAME = 'brainfile.md';
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
 * Return the `.brainfile/` directory used for machine state for a given brainfile.
 *
 * - If the brainfile itself is inside `.brainfile/`, state lives alongside it.
 * - Otherwise state lives in `<brainfileDir>/.brainfile/`.
 */
export function getBrainfileStateDir(brainfilePath: string): string {
  const abs = toAbsolute(brainfilePath);
  const dir = path.dirname(abs);
  if (path.basename(dir) === DOT_BRAINFILE_DIRNAME) return dir;
  return path.join(dir, DOT_BRAINFILE_DIRNAME);
}

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

export function ensureDotBrainfileGitignore(brainfilePath: string): void {
  ensureDotBrainfileDir(brainfilePath);
  const gitignorePath = getDotBrainfileGitignorePath(brainfilePath);
  const entry = `${BRAINFILE_STATE_BASENAME}\n`;

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, entry, 'utf-8');
    return;
  }

  const existing = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = existing.split(/\r?\n/);
  const hasEntry = lines.some((line) => line.trim() === BRAINFILE_STATE_BASENAME);
  if (hasEntry) return;

  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const next = `${existing}${needsNewline ? '\n' : ''}${entry}`;
  fs.writeFileSync(gitignorePath, next, 'utf-8');
}

function defaultState(): BrainfileState {
  return {
    version: BRAINFILE_STATE_VERSION,
    contracts: {},
    agents: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeParseState(contents: string): BrainfileState {
  try {
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) return defaultState();
    const version = typeof parsed.version === 'string' ? parsed.version : BRAINFILE_STATE_VERSION;
    const merged = { ...defaultState(), ...parsed, version };
    return merged as BrainfileState;
  } catch {
    return defaultState();
  }
}

export function readBrainfileState(brainfilePath: string): BrainfileState {
  const statePath = getBrainfileStatePath(brainfilePath);
  if (!fs.existsSync(statePath)) return defaultState();
  const contents = fs.readFileSync(statePath, 'utf-8');
  return safeParseState(contents);
}

export function writeBrainfileState(brainfilePath: string, state: BrainfileState): void {
  ensureDotBrainfileDir(brainfilePath);
  ensureDotBrainfileGitignore(brainfilePath);
  const statePath = getBrainfileStatePath(brainfilePath);
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

export function updateBrainfileState(
  brainfilePath: string,
  updater: (state: BrainfileState) => BrainfileState
): BrainfileState {
  const current = readBrainfileState(brainfilePath);
  const next = updater(current);
  writeBrainfileState(brainfilePath, next);
  return next;
}

export function recordContractPickup(params: {
  brainfilePath: string;
  taskId: string;
  agent?: string;
  at?: Date;
}): BrainfileState {
  const at = params.at ?? new Date();
  const atIso = at.toISOString();

  return updateBrainfileState(params.brainfilePath, (state) => {
    const contracts = { ...(state.contracts ?? {}) };
    const existing = contracts[params.taskId];
    const nextVersion = (existing?.pickedUpVersion ?? 0) + 1;

    const nextContract: ContractState = {
      pickedUpVersion: nextVersion,
      pickedUpAt: atIso,
      agent: params.agent,
    };

    contracts[params.taskId] = nextContract;

    const agents = { ...(state.agents ?? {}) };
    if (params.agent) {
      const prevAgent = agents[params.agent] ?? {};
      const active = new Set(prevAgent.activeContracts ?? []);
      active.add(params.taskId);
      agents[params.agent] = {
        ...prevAgent,
        lastSeen: atIso,
        activeContracts: [...active],
      };
    }

    return {
      ...state,
      version: state.version || BRAINFILE_STATE_VERSION,
      contracts,
      agents,
    };
  });
}
