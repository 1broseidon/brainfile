/**
 * Related boards (spec-10): a board names sister boards in other repos under
 * `related:` in brainfile.md, and a task can point at one of their tasks as
 * `alias:task-id`. This module is the pure part — parsing references and the
 * `related:` map, and linting both. Finding a sister board on disk needs git
 * and lives in `@brainfile/core/repo` (`repo/related.ts`).
 *
 * Browser-safe: no fs, path or child_process.
 *
 * @packageDocumentation
 */

import type { LintIssue } from './linter';

/** `related:` from brainfile.md: short name → repo folder, relative to the project root. */
export type RelatedConfig = Record<string, string>;

/** A parsed task reference. `alias` is absent for a task on this board. */
export interface TaskRef {
  /** The reference exactly as written. */
  raw: string;
  /** The related board's short name, for `alias:id`. */
  alias?: string;
  /** The task ID on whichever board the reference names. */
  id: string;
}

/** Short names: letters, digits, `-` and `_`, starting with a letter or digit. */
export const RELATED_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** A task ID inside a qualified reference: no whitespace, slashes or colons. */
const REF_ID_PATTERN = /^[^\s/\\:]+$/;

/** True when the reference names another board (`alias:id`), well formed or not. */
export function isQualifiedRef(ref: string): boolean {
  return ref.includes(':');
}

/**
 * Parse `alias:id` or a plain `id`. A plain ID is returned untouched, so a
 * reference to this board behaves exactly as it always has. Returns null for
 * a malformed qualified reference (`mobile:`, `:task-1`, `a:b:c`).
 */
export function parseTaskRef(ref: string): TaskRef | null {
  if (!isQualifiedRef(ref)) return { raw: ref, id: ref };
  const at = ref.indexOf(':');
  const alias = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (!RELATED_ALIAS_PATTERN.test(alias) || !REF_ID_PATTERN.test(id)) return null;
  return { raw: ref, alias, id };
}

/** `alias:id`, or `id` when there is no alias. */
export function formatTaskRef(alias: string | undefined, id: string): string {
  return alias ? `${alias}:${id}` : id;
}

/**
 * The usable entries of a board config's `related:` map. Anything that is not
 * a well-named alias pointing at a non-empty string is dropped; `lintRelatedConfig`
 * reports those.
 */
export function readRelatedConfig(config: unknown): RelatedConfig {
  const related = (config as { related?: unknown } | null | undefined)?.related;
  const out: RelatedConfig = {};
  if (!related || typeof related !== 'object' || Array.isArray(related)) return out;
  for (const [alias, folder] of Object.entries(related as Record<string, unknown>)) {
    if (!RELATED_ALIAS_PATTERN.test(alias)) continue;
    if (typeof folder !== 'string' || folder.trim() === '') continue;
    out[alias] = folder.trim();
  }
  return out;
}

/** Problems with the shape of a `related:` value. A folder that is missing is not one. */
export function lintRelatedConfig(related: unknown): LintIssue[] {
  if (related === undefined || related === null) return [];
  if (typeof related !== 'object' || Array.isArray(related)) {
    return [{
      type: 'warning',
      message: 'related: must be a map of short names to repo folders',
      fixable: false,
      code: 'RELATED_INVALID',
    }];
  }
  const issues: LintIssue[] = [];
  for (const [alias, folder] of Object.entries(related as Record<string, unknown>)) {
    if (!RELATED_ALIAS_PATTERN.test(alias)) {
      issues.push({
        type: 'warning',
        message: `related.${alias}: short names use letters, digits, '-' and '_'`,
        fixable: false,
        code: 'RELATED_INVALID',
      });
    }
    if (typeof folder !== 'string' || folder.trim() === '') {
      issues.push({
        type: 'warning',
        message: `related.${alias}: must be a folder path`,
        fixable: false,
        code: 'RELATED_INVALID',
      });
    }
  }
  return issues;
}

/**
 * Warnings for `dependsOn` entries that cannot resolve: a malformed
 * `alias:id`, or an alias that `related:` does not name. Plain IDs are never
 * checked here, and a related folder missing from this machine is not a
 * problem: the reference stays valid.
 */
export function lintTaskRefs(
  tasks: ReadonlyArray<{ id: string; dependsOn?: unknown }>,
  related: RelatedConfig,
): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const task of tasks) {
    if (!Array.isArray(task.dependsOn)) continue;
    for (const entry of task.dependsOn) {
      if (typeof entry !== 'string' || !isQualifiedRef(entry)) continue;
      const ref = parseTaskRef(entry);
      if (!ref) {
        issues.push({
          type: 'warning',
          message: `${task.id}: dependsOn '${entry}' is not a task reference (use alias:task-id)`,
          fixable: false,
          code: 'MALFORMED_TASK_REF',
        });
      } else if (!Object.prototype.hasOwnProperty.call(related, ref.alias!)) {
        issues.push({
          type: 'warning',
          message: `${task.id}: dependsOn '${entry}' names '${ref.alias}', which is not under related: in brainfile.md`,
          fixable: false,
          code: 'UNKNOWN_RELATED_ALIAS',
        });
      }
    }
  }
  return issues;
}
