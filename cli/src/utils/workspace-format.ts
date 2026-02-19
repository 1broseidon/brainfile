import * as fs from 'fs';
import * as path from 'path';

export type WorkspaceFormat =
  | 'v2'
  | 'legacy-root'
  | 'legacy-dotbrainfile'
  | 'mixed'
  | 'empty';

export interface WorkspacePaths {
  rootDir: string;
  rootBrainfilePath: string;
  dotDir: string;
  dotBrainfilePath: string;
  boardDir: string;
  logsDir: string;
}

export interface WorkspacePresence {
  rootBrainfile: boolean;
  dotBrainfile: boolean;
  boardDir: boolean;
  logsDir: boolean;
}

export interface WorkspaceProbe {
  format: WorkspaceFormat;
  paths: WorkspacePaths;
  presence: WorkspacePresence;
}

function existsFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function existsDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function workspaceRootFromBrainfilePath(brainfilePath: string): string {
  const absolute = path.resolve(brainfilePath);
  const dir = path.dirname(absolute);
  return path.basename(dir) === '.brainfile' ? path.dirname(dir) : dir;
}

export function probeWorkspaceFormat(rootDir: string = process.cwd()): WorkspaceProbe {
  const resolvedRoot = path.resolve(rootDir);
  const dotDir = path.join(resolvedRoot, '.brainfile');

  const paths: WorkspacePaths = {
    rootDir: resolvedRoot,
    rootBrainfilePath: path.join(resolvedRoot, 'brainfile.md'),
    dotDir,
    dotBrainfilePath: path.join(dotDir, 'brainfile.md'),
    boardDir: path.join(dotDir, 'board'),
    logsDir: path.join(dotDir, 'logs'),
  };

  const presence: WorkspacePresence = {
    rootBrainfile: existsFile(paths.rootBrainfilePath),
    dotBrainfile: existsFile(paths.dotBrainfilePath),
    boardDir: existsDir(paths.boardDir),
    logsDir: existsDir(paths.logsDir),
  };

  const hasAnyV2Artifacts = presence.boardDir || presence.logsDir;
  const hasFullV2 = presence.dotBrainfile && presence.boardDir && presence.logsDir;

  let format: WorkspaceFormat;
  if (!presence.rootBrainfile && !presence.dotBrainfile && !hasAnyV2Artifacts) {
    format = 'empty';
  } else if (hasFullV2 && !presence.rootBrainfile) {
    format = 'v2';
  } else if (presence.rootBrainfile && !presence.dotBrainfile && !hasAnyV2Artifacts) {
    format = 'legacy-root';
  } else if (!presence.rootBrainfile && presence.dotBrainfile && !hasAnyV2Artifacts) {
    format = 'legacy-dotbrainfile';
  } else {
    format = 'mixed';
  }

  return { format, paths, presence };
}

export function probeWorkspaceForBrainfile(brainfilePath: string): WorkspaceProbe {
  return probeWorkspaceFormat(workspaceRootFromBrainfilePath(brainfilePath));
}

export function shouldSuggestMigration(probe: WorkspaceProbe): boolean {
  return probe.format === 'legacy-root' || probe.format === 'legacy-dotbrainfile' || probe.format === 'mixed';
}
