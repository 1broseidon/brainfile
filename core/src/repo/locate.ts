/**
 * Find the board that belongs to a project folder, for frontends that are
 * handed a folder rather than run inside one (a desktop app adding a
 * project). Mirrors the CLI's resolution order without its argv and cwd.
 */
import * as path from 'path';
import { BRAINFILE_BASENAME, type FoundBrainfile, findBrainfile } from '../utils/files';
import { isV2 } from '../workspace';
import {
  type BoardRepoKind,
  boardRepoKind,
  findTrackedBoardDir,
  gitToplevel,
  materializeBoardWorktree,
} from './boardRepo';

export type LocatedBoard =
  | {
      found: true;
      /** The `.brainfile/` directory. */
      dotDir: string;
      /** `.brainfile/brainfile.md`. */
      brainfilePath: string;
      /** The folder the board belongs to: the repository root, or the folder itself. */
      projectRoot: string;
      /** `linked` (board branch worktree), `standalone` (its own repo) or `plain` files. */
      storage: BoardRepoKind | 'plain';
      /** True when this call checked the board out from its branch or the remote. */
      materialized: boolean;
    }
  | {
      found: false;
      projectRoot: string;
      /** True when the folder is inside a git repository. */
      inRepo: boolean;
      /** A v1 single-file board exists and needs `brainfile migrate`. */
      legacy?: string;
    };

export interface LocateOptions {
  /** Check out a board that exists on the `brainfile` branch or the remote but not on disk. Default true. */
  materialize?: boolean;
}

export function locateBoard(folder: string, options: LocateOptions = {}): LocatedBoard {
  const dir = path.resolve(folder);
  const toplevel = gitToplevel(dir);
  const projectRoot = toplevel ?? dir;
  const inRepo = toplevel !== null;

  const fromDotDir = (dotDir: string, materialized: boolean): LocatedBoard => ({
    found: true,
    dotDir,
    brainfilePath: path.join(dotDir, BRAINFILE_BASENAME),
    projectRoot,
    storage: boardRepoKind(dotDir) ?? 'plain',
    materialized,
  });

  // Inside a repository, walk up to its root. Outside one, only the folder
  // itself counts: walking further would pick up an unrelated board above
  // it, such as the home board.
  const found = inRepo ? findBrainfile(dir, { stopAtGitRoot: true }) : findInFolder(dir);
  if (found) {
    if (found.kind !== 'dotdir' || !isV2(found.absolutePath)) {
      return { found: false, projectRoot, inRepo, legacy: found.absolutePath };
    }
    return fromDotDir(path.dirname(found.absolutePath), false);
  }

  if (inRepo) {
    const tracked = findTrackedBoardDir(dir);
    if (tracked) return fromDotDir(tracked, false);
    if (options.materialize ?? true) {
      const made = materializeBoardWorktree(dir, { quiet: true });
      if (made) return fromDotDir(made, true);
    }
  }
  return { found: false, projectRoot, inRepo };
}

function findInFolder(dir: string): FoundBrainfile | null {
  const found = findBrainfile(dir);
  return found && found.projectRoot === dir ? found : null;
}
