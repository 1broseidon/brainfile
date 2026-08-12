/**
 * TUI-local view state — currently just collapsed-row ids (v3.1 §A1).
 *
 * Lives at `.brainfile/state/tui.json`, sibling to `brief`'s per-agent
 * checkpoints (`core`'s `briefState.ts`), and reuses the same atomic-write
 * helper and `.gitignore` guarantee: `state/` is local-only, never committed,
 * and safe to read-modify-write from a single-user TUI session.
 *
 * This module never touches board files — it is the one new write target the
 * v3.1 spec permits (§ Constraints).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  DOT_BRAINFILE_STATE_DIRNAME,
  atomicWriteFileSync,
  ensureDotBrainfileGitignore,
  getBrainfileStateDir,
} from '@brainfile/core';

export interface TuiState {
  collapsed: string[];
}

export function getTuiStatePath(brainfilePath: string): string {
  return path.join(getBrainfileStateDir(brainfilePath), DOT_BRAINFILE_STATE_DIRNAME, 'tui.json');
}

/** Missing or corrupt state degrades to "nothing collapsed" rather than throwing. */
export function readTuiState(brainfilePath: string): TuiState {
  const statePath = getTuiStatePath(brainfilePath);
  if (!fs.existsSync(statePath)) return { collapsed: [] };

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Partial<TuiState>;
    const collapsed = Array.isArray(parsed.collapsed)
      ? parsed.collapsed.filter((id): id is string => typeof id === 'string')
      : [];
    return { collapsed };
  } catch {
    return { collapsed: [] };
  }
}

export function writeTuiState(brainfilePath: string, state: TuiState): void {
  // Called on every write, not just first-init: a project created before this
  // entry existed would otherwise leak state into git on its first collapse.
  ensureDotBrainfileGitignore(brainfilePath);
  atomicWriteFileSync(getTuiStatePath(brainfilePath), `${JSON.stringify(state, null, 2)}\n`);
}
