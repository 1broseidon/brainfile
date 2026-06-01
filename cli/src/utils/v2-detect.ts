/**
 * V2 per-task file architecture detection, path resolution, and body helpers.
 *
 * Core owns these helpers (`@brainfile/core` workspace exports). This file
 * re-exports them for existing CLI imports and retains CLI-only migration
 * hint helpers.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Brainfile } from '@brainfile/core';

// ── Re-exports from core ─────────────────────────────────────────────

export {
  type V2Dirs,
  getV2Dirs,
  isV2,
  ensureV2Dirs,
  getTaskFilePath,
  getLogFilePath,
  findV2Task,
  extractDescription,
  extractLog,
  composeBody,
  readV2BoardConfig,
  buildBoardFromV2,
} from '@brainfile/core';

// ── CLI-specific migration hint helpers ──────────────────────────────

import { isV2 } from '@brainfile/core';
import {
  probeWorkspaceForBrainfile,
  shouldSuggestMigration,
} from './workspace-format';

const v2MigrationHintShown = new Set<string>();

/**
 * Check whether we should show the one-time migration suggestion.
 *
 * Returns true when ALL of these hold:
 *   a. The workspace appears to be in a legacy or mixed layout, OR this file
 *      itself looks like a legacy board file.
 *   b. This process has not already shown the hint for this brainfile path.
 */
export function shouldSuggestV2Migration(brainfilePath: string): boolean {
  const resolved = path.resolve(brainfilePath);

  if (v2MigrationHintShown.has(resolved)) return false;

  const probe = probeWorkspaceForBrainfile(resolved);
  if (shouldSuggestMigration(probe)) {
    return true;
  }

  // Fallback: explicit non-standard board files (e.g. fixtures/test-board.md)
  // should still receive a migration suggestion when they parse as v1 board files.
  if (!isV2(resolved) && fs.existsSync(resolved)) {
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      const parsed = Brainfile.parseWithErrors(content);
      if (parsed.board) return true;
    } catch {
      // Ignore parse/read errors and suppress hint.
    }
  }

  return false;
}

/**
 * Record that the migration hint has been shown so it won't appear again.
 *
 * This is intentionally in-memory only; Brainfile no longer persists state.json.
 */
export function markV2MigrationHintShown(brainfilePath: string): void {
  v2MigrationHintShown.add(path.resolve(brainfilePath));
}

/** @internal test helper */
export function __resetV2MigrationHintState(): void {
  v2MigrationHintShown.clear();
}
