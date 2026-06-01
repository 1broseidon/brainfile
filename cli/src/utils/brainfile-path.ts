import { resolveBrainfilePath } from '@brainfile/core';

/**
 * Resolve a brainfile path for CLI commands.
 *
 * When called with the default placeholder `brainfile.md`, this will auto-discover
 * `.brainfile/brainfile.md` (preferred) or fall back to legacy locations.
 */
export function resolveCliBrainfilePath(filePath?: string): string {
  return resolveBrainfilePath({ filePath, startDir: process.cwd() });
}

