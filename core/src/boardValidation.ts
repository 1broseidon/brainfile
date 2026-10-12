import type { BoardConfig, TypesConfig } from "./types";
import { availableTypeNames, isKnownType, resolveDocType } from "./docTypes";

export interface BoardValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Returns the board's type configuration map, or an empty map when absent.
 * The built-in types are not in it unless the board overrides them; use
 * `listDocTypes` for every type a board has.
 */
export function getBoardTypes(board: BoardConfig): TypesConfig {
  return board.types ?? {};
}

/**
 * Returns whether a task of the given type may be auto-completed.
 *
 * A `task` (or `issue`) always is and a decision (or `adr`) never is. Any
 * other type is completable unless its board config entry sets
 * `completable: false`; a custom type with `like:` defaults to its model's rule.
 */
export function isTypeCompletable(
  taskType: string | undefined,
  types: TypesConfig | undefined,
): boolean {
  return resolveDocType(taskType, types).completable;
}

/**
 * Validates a type name against board config strict mode. On a strict board
 * a type must be one of the five built-ins (or an alias of one) or be named
 * under `types:`.
 */
export function validateType(board: BoardConfig, typeName: string): BoardValidationResult {
  if (!board.strict) {
    return { valid: true };
  }

  if (isKnownType(typeName, board.types)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Type '${typeName}' is not defined. Available types: ${availableTypeNames(board.types).join(", ")}`,
  };
}

/**
 * Validates a column ID against board config strict mode.
 */
export function validateColumn(board: BoardConfig, columnId: string): BoardValidationResult {
  if (!board.strict) {
    return { valid: true };
  }

  const columnIds = board.columns.map((column) => column.id);
  if (columnIds.includes(columnId)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Column '${columnId}' is not defined. Available columns: ${columnIds.join(", ")}`,
  };
}
