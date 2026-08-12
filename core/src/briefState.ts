/**
 * Per-agent `brief` checkpoint state.
 *
 * Lives at `.brainfile/state/<agent>.json` — local-only, never committed
 * (`ensureDotBrainfileGitignore` writes the `state/` entry).
 *
 * Kept separate from `buildBrief`, which is read-only: the caller decides
 * whether to advance the checkpoint, which is what makes `--peek` a caller-side
 * no-op on the write step rather than a branch inside brief construction.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  DOT_BRAINFILE_STATE_DIRNAME,
  atomicWriteFileSync,
  ensureDotBrainfileGitignore,
  getBrainfileStateDir,
} from './utils/files';

export const BRIEF_STATE_VERSION = 1;

export interface BriefState {
  version: number;
  agent: string;
  lastBriefAt: string | null;
}

/**
 * Agent identifiers are free text (a PM can type anything), so the filename is
 * sanitized to prevent path traversal and invalid-filename characters.
 */
export function sanitizeAgentFilename(agentName: string): string {
  const cleaned = agentName.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  // Guard against names that sanitize to something empty or path-meaningful.
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return '_';
  return cleaned;
}

export function getBriefStateDir(brainfilePath: string): string {
  return path.join(getBrainfileStateDir(brainfilePath), DOT_BRAINFILE_STATE_DIRNAME);
}

export function getBriefStatePath(brainfilePath: string, agentName: string): string {
  return path.join(getBriefStateDir(brainfilePath), `${sanitizeAgentFilename(agentName)}.json`);
}

/**
 * Read an agent's checkpoint. Missing file → first-ever brief (`null`).
 *
 * A corrupt file degrades gracefully to `null` with a warning, mirroring
 * `parseLedgerLine`'s convention, rather than throwing — a broken checkpoint
 * should cost the agent a redundant full brief, not break the command.
 */
export function readBriefState(brainfilePath: string, agentName: string): BriefState {
  const statePath = getBriefStatePath(brainfilePath, agentName);
  const fallback: BriefState = { version: BRIEF_STATE_VERSION, agent: agentName, lastBriefAt: null };

  if (!fs.existsSync(statePath)) return fallback;

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Partial<BriefState>;
    const lastBriefAt = typeof parsed.lastBriefAt === 'string' ? parsed.lastBriefAt : null;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : BRIEF_STATE_VERSION,
      agent: typeof parsed.agent === 'string' ? parsed.agent : agentName,
      lastBriefAt,
    };
  } catch {
    console.warn(`Warning: unreadable brief state at ${statePath}; treating as first brief`);
    return fallback;
  }
}

/** Advance an agent's checkpoint. Atomic, and ensures `state/` stays gitignored. */
export function writeBriefState(
  brainfilePath: string,
  agentName: string,
  lastBriefAt: string,
): BriefState {
  // Called on every write (not just init/migrate): a project created before
  // `state/` was added to the ignore list would otherwise leak state into git.
  ensureDotBrainfileGitignore(brainfilePath);

  const state: BriefState = { version: BRIEF_STATE_VERSION, agent: agentName, lastBriefAt };
  atomicWriteFileSync(
    getBriefStatePath(brainfilePath, agentName),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  return state;
}
