/**
 * Where a hand-off lands (decision-16): each task has a branch its work
 * forks from and lands on. `landsOn` in its frontmatter, else its parent's,
 * up the tree, else none, which is the repository's trunk. An epic with
 * `epicBranch: true` is a branch of its own, `dispatch/<epic-id>`, for
 * everything under it.
 *
 * Board data only, and browser-safe: what a branch is in git (whether it
 * exists, the trunk's name) is `@brainfile/core/repo`'s.
 */
import type { Task } from './types';

/** An epic's own branch: the branch a hand-off of it would have (`branchFor` in repo/worktree.ts). */
export const epicBranchOf = (epicId: string): string => `dispatch/${epicId}`;

/** A task's target, and where it comes from. */
export interface LandsOn {
  /** The branch. */
  branch: string;
  /** The document that sets it: the task itself, or the ancestor it inherits from. */
  from: string;
  /** It is the branch of the epic `from`, which has `epicBranch: true`. */
  epicBranch: boolean;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The task's target (decision-16): the nearest of itself and its ancestors,
 * by parentId, that names one. A document's own `landsOn` names it; an
 * ancestor with `epicBranch: true` names its own branch, `dispatch/<id>`
 * (before its `landsOn`, which is where the epic's branch itself lands).
 * Null when none does: the trunk. `docs` should hold the completed documents
 * too, so a parent in logs/ still counts.
 */
export function targetOf(docs: Iterable<Pick<Task, 'id' | 'parentId' | 'landsOn' | 'epicBranch'>> | Map<string, Pick<Task, 'id' | 'parentId' | 'landsOn' | 'epicBranch'>>, taskId: string): LandsOn | null {
  const byId = docs instanceof Map ? docs : new Map([...docs].map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (let id: string | undefined = taskId; id && !seen.has(id); ) {
    seen.add(id);
    const doc = byId.get(id);
    if (!doc) return null;
    if (id !== taskId && doc.epicBranch === true) return { branch: epicBranchOf(id), from: id, epicBranch: true };
    const own = text(doc.landsOn);
    if (own) return { branch: own, from: id, epicBranch: false };
    id = text(doc.parentId) ?? undefined;
  }
  return null;
}

/** The branch the task forks from and lands on, or null for the trunk. */
export function landsOnOf(docs: Parameters<typeof targetOf>[0], taskId: string): string | null {
  return targetOf(docs, taskId)?.branch ?? null;
}

/**
 * Whether `name` can be a branch, by git's rules for a ref name
 * (git-check-ref-format), without asking git: what the board may hold in
 * `landsOn`. Whether the branch exists is lint's to say.
 */
export function isBranchName(name: string): boolean {
  if (!name || name !== name.trim() || name.startsWith('-') || name === '@') return false;
  // Control characters, space, ~ ^ : ? * [ \ and DEL.
  if (/[\u0000- ~^:?*[\\\u007f]/.test(name)) return false;
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false;
  if (name.startsWith('/') || name.endsWith('/') || name.endsWith('.')) return false;
  return name.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'));
}
