/**
 * Type-cycle (`t`) options for the v3.1 list view (§A2).
 *
 * `t` cycles `all → task → epic → spec → plan → adr → all`, restricted to
 * types that actually exist *on the current board* — read from the board
 * config's `types` map, since that is the source of truth for which document
 * types a board recognises (strict mode enforces exactly this set). `task`
 * is always included even when a board never bothered to declare it, because
 * it is the implicit default type every doc without a `type` field gets.
 */
import type { Board } from '@brainfile/core';

/** Fixed cycle order (excluding `'all'`, which always leads). */
const FIXED_TYPE_ORDER = ['task', 'epic', 'spec', 'plan', 'adr'];

export function getTypeCycleOptions(board: Board | null): string[] {
  // `types` is a BoardConfig-only field; `Board` (the runtime, task-populated
  // shape) doesn't declare it statically, but the parsed object still carries
  // it — the same `(board as any).x` pattern actions.ts already uses for
  // `archive.destination`.
  const configured = new Set(
    Object.keys((board as unknown as { types?: Record<string, unknown> } | null)?.types ?? {}),
  );
  const available = FIXED_TYPE_ORDER.filter((type) => type === 'task' || configured.has(type));
  return ['all', ...available];
}
