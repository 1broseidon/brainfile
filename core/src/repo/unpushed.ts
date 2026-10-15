/**
 * What landing left unpushed (spec-18): Merge lands on the local trunk and
 * never pushes, so the trunk can carry commits origin lacks for a long while
 * without anyone noticing. This counts them, from what origin was last
 * fetched as; nothing here reaches the network or pushes.
 */
import { git, gitToplevel } from './boardRepo';
import { trunkOf } from './worktree';

export interface Unpushed {
  /** The local branch: the trunk unless another was asked for. */
  branch: string;
  /** Commits on it that origin's copy, as last fetched, lacks. */
  ahead: number;
}

/**
 * How far the local `branch` (the trunk by default) is ahead of origin's
 * copy of it. Null when either is missing: a branch origin has never seen is
 * not behind on anything, and a repository with no origin has nowhere to
 * push.
 */
export function unpushed(projectId: string, branch?: string): Unpushed | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const name = branch ?? trunkOf(repoRoot)?.name;
  if (!name) return null;
  const has = (ref: string) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot).ok;
  if (!has(`refs/heads/${name}`) || !has(`refs/remotes/origin/${name}`)) return null;
  const count = git(['rev-list', '--count', `refs/remotes/origin/${name}..refs/heads/${name}`], repoRoot);
  return count.ok ? { branch: name, ahead: Number(count.stdout) || 0 } : null;
}
