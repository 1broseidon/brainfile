import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if current directory is a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are uncommitted changes (excluding specified files)
 */
export async function hasUncommittedChanges(excludePatterns: string[] = []): Promise<boolean> {
  try {
    const isRepo = await isGitRepo();
    if (!isRepo) return false;

    // Build exclude arguments for git
    const excludeArgs = excludePatterns
      .map(pattern => `:(exclude)${pattern}`)
      .join(' ');

    const cmd = `git diff --name-only -- . ${excludeArgs}`.trim();
    const { stdout } = await execAsync(cmd);

    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get list of modified files (both staged and unstaged)
 */
export async function getModifiedFiles(): Promise<string[]> {
  try {
    const isRepo = await isGitRepo();
    if (!isRepo) return [];

    const { stdout } = await execAsync('git status --porcelain');

    return stdout
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3).trim());
  } catch {
    return [];
  }
}
