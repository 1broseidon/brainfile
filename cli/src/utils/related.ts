/**
 * Reading a task on a related board (spec-10) — shared by `show` and the MCP
 * `get_task` tool so both say the same thing when the board is not there.
 */
import { relatedBoards, describeRelatedBoard, type RelatedBoard } from '@brainfile/core/repo';

export type FoundRelatedBoard = Extract<RelatedBoard, { status: 'found' }>;

export type RelatedTaskTarget =
  | { ok: true; board: FoundRelatedBoard; id: string }
  | { ok: false; kind: 'malformed' | 'unknown-alias' | 'unavailable' | 'not-found'; message: string; details?: string };

/** Resolve `alias:id` from the board at `brainfilePath` to the board and ID to read. */
export function resolveRelatedTask(brainfilePath: string, ref: string): RelatedTaskTarget {
  const hit = relatedBoards(brainfilePath).lookup(ref);
  switch (hit.state) {
    case 'malformed':
      return { ok: false, kind: 'malformed', message: `${ref} is not a task reference; use alias:task-id` };
    case 'unknown-alias':
      return {
        ok: false,
        kind: 'unknown-alias',
        message: `No related board named '${hit.alias}'`,
        details: `Name it under related: in brainfile.md, e.g.\n  related:\n    ${hit.alias}: ../folder`,
      };
    case 'missing':
    case 'no-board':
      return {
        ok: false,
        kind: 'unavailable',
        message: describeRelatedBoard(hit.board!),
        details: `Looked in ${hit.board!.folder}`,
      };
    case 'not-found':
      return { ok: false, kind: 'not-found', message: `Task not found: ${ref}` };
    default:
      return { ok: true, board: hit.board as FoundRelatedBoard, id: hit.id };
  }
}
