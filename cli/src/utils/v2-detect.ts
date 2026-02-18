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

const v2MigrationHintShown = new Set<string>();

/**
 * Check whether we should show the one-time v2 migration suggestion.
 *
 * Returns true when ALL of these hold:
 *   a. The brainfile is v1 format (no board/ directory next to it)
 *   b. The brainfile has at least one task in any column
 *   c. This process has not already shown the hint for this brainfile path
 */
export function shouldSuggestV2Migration(brainfilePath: string): boolean {
  const resolved = path.resolve(brainfilePath);

  // (a) Must be v1 format
  if (isV2(resolved)) return false;

  // (c) One-time guard for this process
  if (v2MigrationHintShown.has(resolved)) return false;

  // (b) Parse brainfile and check for at least one task
  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    const result = Brainfile.parseWithErrors(content);
    if (!result.board) return false;

    const hasTasks = result.board.columns.some(
      (col) => col.tasks && col.tasks.length > 0,
    );
    return hasTasks;
  } catch {
    return false;
  }
}

/**
 * Record that the v2 migration hint has been shown so it won't appear again.
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
