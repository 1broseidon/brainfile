import * as fs from 'fs';
import * as path from 'path';

function getDotBrainfileDir(brainfilePath: string): string {
  const abs = path.resolve(brainfilePath);
  const dir = path.dirname(abs);
  if (path.basename(dir) === '.brainfile') return dir;
  return path.join(dir, '.brainfile');
}

/**
 * Ensure `.brainfile/.gitignore` exists and remove legacy `state.json` entries.
 */
export function ensureDotBrainfileGitignore(brainfilePath: string): string {
  const dotDir = getDotBrainfileDir(brainfilePath);
  fs.mkdirSync(dotDir, { recursive: true });

  const gitignorePath = path.join(dotDir, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';

  const filtered = existing
    .split(/\r?\n/)
    .filter((line) => line.trim() !== 'state.json')
    .join('\n')
    .trimEnd();

  fs.writeFileSync(gitignorePath, filtered.length > 0 ? `${filtered}\n` : '', 'utf-8');
  return gitignorePath;
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
