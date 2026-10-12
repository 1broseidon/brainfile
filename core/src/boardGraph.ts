/**
 * Read a board from disk into its graph (spec-12). The graph itself is pure
 * and lives in `docGraph.ts`; this is the Node side that finds the files.
 *
 * @packageDocumentation
 */

import { readBoardConfig } from './boardFile';
import { buildDocGraph, type DocGraph, type WorkOnSupersededDecision } from './docGraph';
import { readTasksDir } from './taskFile';
import type { BoardConfig, Task } from './types';
import { getV2Dirs, type V2Dirs } from './workspace';

export interface BoardGraph {
  /** The board config, or null when brainfile.md cannot be parsed. */
  config: BoardConfig | null;
  dirs: V2Dirs;
  graph: DocGraph;
}

/**
 * Every document on a board, board/ first and logs/ after, as a graph typed
 * by the board's `types:`. Reads both directories once.
 */
export function readBoardGraph(brainfilePath: string): BoardGraph {
  const dirs = getV2Dirs(brainfilePath);
  const config = readBoardConfig(dirs.brainfilePath)?.config ?? null;
  const tasks: Task[] = [
    ...readTasksDir(dirs.boardDir).map((doc) => doc.task),
    ...readTasksDir(dirs.logsDir).map((doc) => doc.task),
  ];
  return { config, dirs, graph: buildDocGraph(tasks, { types: config?.types }) };
}

/**
 * Open work on a board that rests on a superseded decision: the hook `brief`
 * and the desktop app use to say "rests on a superseded decision".
 */
export function findWorkOnSupersededDecisions(brainfilePath: string): WorkOnSupersededDecision[] {
  return readBoardGraph(brainfilePath).graph.openWorkOnSupersededDecisions();
}
