import * as fs from 'fs';
import * as path from 'path';
import { isV2 } from '@brainfile/core';
import { CLIError, fileNotFound } from './cli-error';

export const V1_UNSUPPORTED_MESSAGE =
  'Brainfile v1 is no longer supported by this command. Run `brainfile migrate` to convert this workspace to v2.';

function migrationHintForPath(brainfilePath: string): string {
  const absolute = path.resolve(brainfilePath);
  const dir = path.basename(path.dirname(absolute)) === '.brainfile'
    ? path.dirname(path.dirname(absolute))
    : path.dirname(absolute);
  return `Run: brainfile migrate --dir ${dir}`;
}

/**
 * Require v2 per-task file architecture for normal runtime commands.
 *
 * `brainfile migrate` is the only command allowed to read or transform v1
 * layouts. Runtime commands should call this after resolving the brainfile path.
 */
export function assertV2Brainfile(brainfilePath: string): void {
  if (!fs.existsSync(brainfilePath)) {
    throw fileNotFound(brainfilePath);
  }

  if (!isV2(brainfilePath)) {
    throw new CLIError(V1_UNSUPPORTED_MESSAGE, undefined, migrationHintForPath(brainfilePath));
  }
}
