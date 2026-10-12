/**
 * Autosync policy shared by every frontend. How a push is actually carried
 * out differs (the CLI spawns a detached `brainfile sync --push`; a
 * long-running app syncs in its own process), so only the policy lives here.
 *
 * `BRAINFILE_AUTOSYNC=off|push|full` overrides the board's config for one
 * process (tests and CI set `off`).
 */
import { isTrackedBoard } from './boardRepo';
import { type AutosyncMode, type SyncResult, boardAutosync, secondsSinceSync, syncBoard } from './boardSync';

export const AUTOSYNC_DELAY_MS = 5000;
export const FETCH_MAX_AGE_SECONDS = 60;

export function effectiveAutosync(dotDir: string): AutosyncMode {
  const override = process.env.BRAINFILE_AUTOSYNC;
  if (override === 'off' || override === 'push' || override === 'full') return override;
  return boardAutosync(dotDir);
}

/**
 * In `full` mode, bring the board up to date before a read when the last
 * sync attempt is older than `maxAgeSeconds`. Returns the sync result, or
 * null when nothing was fetched.
 */
export function fetchBeforeRead(dotDir: string, maxAgeSeconds = FETCH_MAX_AGE_SECONDS): SyncResult | null {
  if (!isTrackedBoard(dotDir)) return null;
  if (effectiveAutosync(dotDir) !== 'full') return null;
  const age = secondsSinceSync(dotDir);
  if (age !== null && age < maxAgeSeconds) return null;
  return syncBoard(dotDir, { pull: true, push: false });
}
