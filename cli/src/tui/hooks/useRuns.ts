import { useEffect, useState } from 'react';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { isRunEnded, isRunLost, listRunFiles, runsDir, type RunFile } from '@brainfile/core/repo';
import { agentLabel } from '../../utils/agent-label.js';

/** Run files are beaten every 10 s and a run is lost after 30 s unbeaten: looked at again this often, so a lost one leaves its row. */
const LOOK_MS = 5000;

/**
 * What an agent is doing on each task now (task-82), as the desktop's rows
 * say it: `codex · editing`, `codex · asking` when it waits on an answer,
 * `codex · leading` on an epic whose lead is in a turn. From every runner's
 * run files on this machine (`state/runs`): `brainfile run`, the desktop, a
 * `dispatch --now`. A run that ended or lost its runner says nothing.
 */
export function liveRunsOf(dotDir: string): Map<string, string> {
  const live = new Map<string, string>();
  let files: RunFile[] = [];
  try {
    files = listRunFiles(dotDir);
  } catch {
    return live;
  }
  // The latest run on a task speaks for it.
  for (const run of files.filter((f) => !isRunEnded(f) && !isRunLost(f)).sort((a, b) => a.startedAt - b.startedAt)) {
    if (!run.taskId || run.kind === 'ask') continue;
    const who = agentLabel(run.agent);
    const what = run.kind === 'lead' ? 'leading' : run.ask || run.state === 'waiting' ? 'asking' : run.activity || run.state;
    live.set(run.taskId, `${who} · ${what}`);
  }
  return live;
}

function same(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/**
 * The live runs for the TUI's rows, by task id, read again whenever a run
 * file changes (and every few seconds, for one whose runner went away).
 */
export function useRuns(filePath: string): Map<string, string> {
  const dotDir = path.dirname(path.resolve(filePath));
  const [runs, setRuns] = useState<Map<string, string>>(() => liveRunsOf(dotDir));

  useEffect(() => {
    const dir = runsDir(dotDir);
    let watcher: chokidar.FSWatcher | null = null;
    const refresh = () => {
      // state/runs comes with the first run on the board: watched from when it is there.
      if (!watcher && fs.existsSync(dir)) {
        watcher = chokidar.watch(dir, { persistent: true, ignoreInitial: true, usePolling: true, interval: 500, depth: 0 });
        watcher.on('all', refresh);
        watcher.on('error', () => {});
      }
      const next = liveRunsOf(dotDir);
      setRuns((prev) => (same(prev, next) ? prev : next));
    };
    refresh();
    const timer = setInterval(refresh, LOOK_MS);
    timer.unref?.();
    return () => {
      clearInterval(timer);
      void watcher?.close();
    };
  }, [dotDir]);

  return runs;
}
