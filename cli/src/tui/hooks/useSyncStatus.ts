import { useEffect, useState } from 'react';
import * as path from 'path';
import { syncStatusLabel } from '../../utils/board-sync.js';

const POLL_MS = 5000;

/**
 * Header label for a shared board: `synced 12s ago`, `sync failed`, or
 * undefined for a board that is not shared. Re-read every few seconds and
 * whenever the board reloads (`lastUpdated`), since the autosync child writes
 * `state/sync.json` from another process.
 */
export function useSyncStatus(filePath: string, lastUpdated: unknown): string | undefined {
  const dotDir = path.dirname(path.resolve(filePath));
  const [label, setLabel] = useState<string | undefined>(() => syncStatusLabel(dotDir) ?? undefined);

  useEffect(() => {
    const refresh = () => setLabel(syncStatusLabel(dotDir) ?? undefined);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    timer.unref?.();
    return () => clearInterval(timer);
  }, [dotDir, lastUpdated]);

  return label;
}
