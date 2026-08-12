/**
 * TUI-local view state: collapsed-row ids (v3.1 §A1) plus the resume view —
 * which column and type-cycle stop the last session ended on (§C3).
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
  /**
   * Column id the last session was on. Stored by ID, not index: a column added
   * or reordered between sessions must not silently resume somewhere else.
   */
  lastColumn?: string;
  /**
   * Type-cycle stop the last session was on (`all`, a document type, or
   * `done`). Both this and `lastColumn` already have on-screen indicators —
   * the header tabs and the `· type` label — so resuming into them satisfies
   * rubric P9 without any new chrome.
   */
  lastTypeFilter?: string;
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
    return {
      collapsed,
      ...(typeof parsed.lastColumn === 'string' ? { lastColumn: parsed.lastColumn } : {}),
      ...(typeof parsed.lastTypeFilter === 'string'
        ? { lastTypeFilter: parsed.lastTypeFilter }
        : {}),
    };
  } catch {
    return { collapsed: [] };
  }
}

/**
 * Merge a partial update into the persisted state.
 *
 * Every writer touches one concern (collapse toggles, or the resume view), and
 * a whole-object write would let the last writer clobber the other's field.
 */
export function patchTuiState(brainfilePath: string, patch: Partial<TuiState>): void {
  const current = readTuiState(brainfilePath);
  writeTuiState(brainfilePath, { ...current, ...patch });
}

export function writeTuiState(brainfilePath: string, state: TuiState): void {
  // Called on every write, not just first-init: a project created before this
  // entry existed would otherwise leak state into git on its first collapse.
  ensureDotBrainfileGitignore(brainfilePath);
  atomicWriteFileSync(getTuiStatePath(brainfilePath), `${JSON.stringify(state, null, 2)}\n`);
}
