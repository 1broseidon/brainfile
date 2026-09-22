import * as fs from 'fs';
import * as path from 'path';
import { resolveBrainfilePath, findBrainfile, isV2, BRAINFILE_BASENAME } from '@brainfile/core';
import { CLIError } from './cli-error';
import { V1_UNSUPPORTED_MESSAGE } from './v2-only';
import {
  findTrackedBoardDir,
  homeBoardDir,
  isGlobalBoardRequested,
  materializeBoardWorktree,
} from './board-repo';

function isMigrationCommand(): boolean {
  return process.argv.includes('migrate');
}

function migrationHintForPath(brainfilePath: string): string {
  const absolute = path.resolve(brainfilePath);
  const dir = path.basename(path.dirname(absolute)) === '.brainfile'
    ? path.dirname(path.dirname(absolute))
    : path.dirname(absolute);
  return `Run: brainfile migrate --dir ${dir}`;
}

function rejectLegacyRuntimePath(resolvedPath: string): string {
  if (!isMigrationCommand() && fs.existsSync(resolvedPath) && !isV2(resolvedPath)) {
    throw new CLIError(V1_UNSUPPORTED_MESSAGE, undefined, migrationHintForPath(resolvedPath));
  }
  return resolvedPath;
}

function isPlaceholder(filePath?: string): boolean {
  return filePath === undefined || filePath === BRAINFILE_BASENAME || filePath === `./${BRAINFILE_BASENAME}`;
}

/**
 * Resolve a brainfile path for CLI commands.
 *
 * Supports three input forms:
 * - Default (omitted): auto-discover from cwd upward, stopping at the
 *   repository root; then, inside a repo, the worktree on the board branch
 *   (spec-9), creating it when the branch exists but has no checkout.
 * - Directory path (`cli/`, `./projects/foo`): find brainfile inside that directory
 * - File path (`path/to/brainfile.md`): use as-is
 *
 * `-g` / `--global` (or `BRAINFILE_GLOBAL=1`) targets the home board at
 * `~/.brainfile` instead of discovering one.
 */
export function resolveCliBrainfilePath(filePath?: string): string {
  if (isPlaceholder(filePath) && isGlobalBoardRequested()) {
    return rejectLegacyRuntimePath(path.join(homeBoardDir(), BRAINFILE_BASENAME));
  }

  // If a path was given and it's a directory, look for a brainfile inside it
  if (filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    try {
      if (fs.statSync(resolved).isDirectory()) {
        // Try discovery starting from this directory (non-recursive upward)
        const found = findBrainfile(resolved);
        if (found && found.projectRoot === resolved) {
          return rejectLegacyRuntimePath(found.absolutePath);
        }
        // Fallback: check .brainfile/brainfile.md directly
        const dotDir = path.join(resolved, '.brainfile', 'brainfile.md');
        return rejectLegacyRuntimePath(dotDir);
      }
    } catch {
      // Not a directory, fall through to normal resolution
    }
  }

  const cwd = process.cwd();
  if (isPlaceholder(filePath)) {
    const found = findBrainfile(cwd, { stopAtGitRoot: true });
    if (found) return rejectLegacyRuntimePath(found.absolutePath);

    const tracked = findTrackedBoardDir(cwd) ?? materializeBoardWorktree(cwd);
    if (tracked) return rejectLegacyRuntimePath(path.join(tracked, BRAINFILE_BASENAME));
  }

  return rejectLegacyRuntimePath(resolveBrainfilePath({ filePath, startDir: cwd, stopAtGitRoot: true }));
}

/**
 * The `.brainfile/` directory a command will operate on, or null when there
 * is no board (or resolution itself fails). Never throws.
 */
export function tryResolveBoardDir(filePath?: string): string | null {
  try {
    const resolved = resolveCliBrainfilePath(filePath);
    if (!fs.existsSync(resolved)) return null;
    return path.dirname(resolved);
  } catch {
    return null;
  }
}
