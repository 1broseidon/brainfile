import * as fs from 'fs';
import * as path from 'path';

function getDotBrainfileDir(brainfilePath: string): string {
  const abs = path.resolve(brainfilePath);
  const dir = path.dirname(abs);
  if (path.basename(dir) === '.brainfile') return dir;
  return path.join(dir, '.brainfile');
}

/**
 * Remove legacy `.brainfile/state.json` if it exists.
 */
export function removeLegacyStateFile(brainfilePath: string): string {
  const dotDir = getDotBrainfileDir(brainfilePath);
  const statePath = path.join(dotDir, 'state.json');
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
  return statePath;
}
