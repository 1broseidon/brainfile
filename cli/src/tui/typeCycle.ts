/**
 * Type-cycle (`t`) options for the v3.1 list view (§A2).
 *
 * `t` cycles `all → task → epic → spec → plan → decision → all`, restricted to
 * document types only — completed history is the orthogonal `L` toggle, so
 * the two compose (done view of one type).
 *
 * The decision stop is not a filter over the columns: decisions have no
 * column, so it is the decisions view (task-19), also reached directly with
 * `D`. It is always named `decision`, the canonical type, whether the board
 * spells it `adr` or not; a custom type that is `like: decision` gets no stop
 * of its own, since its documents are in that view too.
 *
 * Restriction:
 * types that actually exist *on the current board* — read from the board
 * config's `types` map, since that is the source of truth for which document
 * types a board recognises (strict mode enforces exactly this set). `task`
 * is always included even when a board never bothered to declare it, because
 * it is the implicit default type every doc without a `type` field gets.
 */
import { isTypeAlias, resolveDocType, type Board, type Task } from '@brainfile/core';
import { boardTypes } from './decisions.js';

/** Fixed cycle order (excluding `'all'`, which always leads). */
const FIXED_TYPE_ORDER = ['task', 'epic', 'spec', 'plan', 'decision'];

/**
 * @param decisions The board's decisions, which the loader has lifted out of
 *   the columns: any at all gives the decision stop.
 */
export function getTypeCycleOptions(board: Board | null, decisions: readonly Task[] = []): string[] {
  // `types` is a BoardConfig-only field; `Board` (the runtime, task-populated
  // shape) doesn't declare it statically, but the parsed object still carries
  // it — the same `(board as any).x` pattern actions.ts already uses for
  // `archive.destination`.
  const configured = Object.keys(
    (board as unknown as { types?: Record<string, unknown> } | null)?.types ?? {},
  );
  const configuredSet = new Set(configured);
  // spec-12: the built-ins exist without being listed, so one with documents
  // on the board gets a stop even when types: does not name it.
  const present = new Set(
    (board?.columns ?? []).flatMap((column) => (column.tasks ?? []).map((task) => (task.type || 'task').toLowerCase())),
  );
  // One decision stop, under the canonical name, for decisions on the board
  // or any configured type in the decision role (adr, `like: decision`).
  const types = boardTypes(board);
  const isDecisionType = (type: string) => resolveDocType(type, types).role === 'decision';
  const hasDecisionStop = decisions.length > 0 || configured.some(isDecisionType);
  const known = FIXED_TYPE_ORDER.filter(
    (type) => type === 'task' || (type === 'decision' ? hasDecisionStop : configuredSet.has(type) || present.has(type)),
  );
  const extra = configured
    .filter((type) => !FIXED_TYPE_ORDER.includes(type) && !isTypeAlias(type) && !isDecisionType(type))
    .sort();
  return ['all', ...known, ...extra];
}
