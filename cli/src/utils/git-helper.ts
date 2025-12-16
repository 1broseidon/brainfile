import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitHelperOptions {
  /** Working directory for git commands. Defaults to process.cwd() */
  cwd?: string;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(options: GitHelperOptions = {}): Promise<boolean> {
  try {
    const cwd = options.cwd ?? process.cwd();
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are uncommitted changes (excluding specified files)
 */
export async function hasUncommittedChanges(
  excludePatterns: string[] = [],
  options: GitHelperOptions = {}
): Promise<boolean> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const isRepo = await isGitRepo({ cwd });
    if (!isRepo) return false;

    // Build exclude arguments for git
    const excludeArgs = excludePatterns
      .map(pattern => `:(exclude)${pattern}`)
      .join(' ');

    const cmd = `git diff --name-only -- . ${excludeArgs}`.trim();
    const { stdout } = await execAsync(cmd, { cwd });

    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get list of modified files (both staged and unstaged)
 */
export async function getModifiedFiles(options: GitHelperOptions = {}): Promise<string[]> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const isRepo = await isGitRepo({ cwd });
    if (!isRepo) return [];

    const { stdout } = await execAsync('git status --porcelain', { cwd });

    return stdout
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3).trim());
  } catch {
    return [];
  }
}
