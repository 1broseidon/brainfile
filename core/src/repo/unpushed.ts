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

/** Commits on the local `base` that origin's copy lacks, carried by a branch forked from it: what a pull request from that branch would bring along unasked. */
export interface CarriedUnpushed {
  base: string;
  count: number;
  /** The tasks whose landings they are (`Merge task-N: …`), in order. */
  tasks: string[];
}

/**
 * What a pull request from `head` into origin's `base` would carry besides
 * `head`'s own work: the commits `head` has from the local `base` that
 * origin's `base`, as last fetched, lacks (landings made here by Merge, never
 * pushed). Null when there are none, or when origin has no `base`, or there
 * is no local one to compare.
 */
export function carriedUnpushed(projectId: string, head: string, base: string): CarriedUnpushed | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const has = (ref: string) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot).ok;
  if (!has(`refs/heads/${base}`) || !has(`refs/remotes/origin/${base}`) || !has(`refs/heads/${head}`)) return null;
  const fork = git(['merge-base', `refs/heads/${head}`, `refs/heads/${base}`], repoRoot).stdout;
  if (!fork) return null;
  const subjects = git(['log', '--format=%s', fork, `^refs/remotes/origin/${base}`], repoRoot);
  const lines = subjects.ok ? subjects.stdout.split('\n').filter(Boolean) : [];
  if (!lines.length) return null;
  const tasks = lines.flatMap((s) => /^Merge ([a-z][\w-]*-\d+)\b/.exec(s)?.[1] ?? []).reverse();
  return { base, count: lines.length, tasks };
}

/**
 * After a pull request merged into origin's `branch` (spec-18-5): the local
 * `branch` follows origin's, when nothing on it would be lost and nobody has
 * it checked out. A fast-forward when it is only behind; when the two have
 * diverged (a squash of what was here), only when merging them would change
 * nothing in origin's. Moved by compare-and-swap. Null when there is nothing
 * to follow; otherwise what was done, in words for the task's log.
 */
export function followOrigin(projectId: string, branch: string): { moved: boolean; said: string } | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const sha = (ref: string) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot).stdout;
  const here = sha(`refs/heads/${branch}`);
  const there = sha(`refs/remotes/origin/${branch}`);
  if (!here || !there || here === there) return null;
  const isAncestor = (a: string, b: string) => git(['merge-base', '--is-ancestor', a, b], repoRoot).ok;
  if (isAncestor(there, here)) return null;
  const at = git(['worktree', 'list', '--porcelain'], repoRoot)
    .stdout.split('\n\n')
    .find((block) => block.split('\n').includes(`branch refs/heads/${branch}`))
    ?.split('\n')[0]
    ?.replace(/^worktree /, '');
  if (at) return { moved: false, said: `${branch} is checked out at ${at}: pull origin's ${branch} there to bring it up to date` };
  const behind = isAncestor(here, there);
  if (!behind) {
    const merged = git(['merge-tree', '--write-tree', there, here], repoRoot);
    const tree = merged.ok ? merged.stdout.split('\n')[0] : '';
    if (!tree || tree !== git(['rev-parse', `${there}^{tree}`], repoRoot).stdout) {
      return { moved: false, said: `${branch} here has commits origin's ${branch} does not: it is left as it is` };
    }
  }
  if (!git(['update-ref', `refs/heads/${branch}`, there, here], repoRoot).ok) return { moved: false, said: `${branch} moved meanwhile: it is left as it is` };
  return { moved: true, said: behind ? `${branch} here is brought up to origin's` : `${branch} here now matches origin's, which has everything it had` };
}
