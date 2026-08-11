import * as fs from 'fs';
import * as path from 'path';
import { resolveBrainfilePath, findBrainfile, isV2 } from '@brainfile/core';
import { CLIError } from './cli-error';
import { V1_UNSUPPORTED_MESSAGE } from './v2-only';

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

/**
 * Resolve a brainfile path for CLI commands.
 *
 * Supports three input forms:
 * - Default (omitted): auto-discover from cwd upward
 * - Directory path (`cli/`, `./projects/foo`): find brainfile inside that directory
 * - File path (`path/to/brainfile.md`): use as-is
 */
export function resolveCliBrainfilePath(filePath?: string): string {
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

  return rejectLegacyRuntimePath(resolveBrainfilePath({ filePath, startDir: process.cwd() }));
}

