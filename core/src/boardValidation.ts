import type { BoardConfig, TypesConfig } from "./types";

export interface BoardValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Returns the board's type configuration map, or an empty map when absent.
 */
export function getBoardTypes(board: BoardConfig): TypesConfig {
  return board.types ?? {};
}

/**
 * Returns whether a task of the given type may be auto-completed.
 *
 * The implicit `task` type is always completable. Any other type is
 * completable unless its board config entry sets `completable: false`.
 */
export function isTypeCompletable(
  taskType: string | undefined,
  types: TypesConfig | undefined,
): boolean {
  const resolvedType = taskType || "task";
  if (resolvedType === "task") {
    return true;
  }

  const typeConfig = (types ?? {})[resolvedType];
  return typeConfig?.completable !== false;
}

/**
 * Validates a type name against board config strict mode.
 */
export function validateType(board: BoardConfig, typeName: string): BoardValidationResult {
  if (!board.strict || !board.types) {
    return { valid: true };
  }

  if (typeName === "task") {
    return { valid: true };
  }

  if (Object.prototype.hasOwnProperty.call(board.types, typeName)) {
    return { valid: true };
  }

  const definedKeys = Object.keys(board.types);
  const availableTypes = definedKeys.includes("task") ? definedKeys : ["task", ...definedKeys];
  return {
    valid: false,
    error: `Type '${typeName}' is not defined. Available types: ${availableTypes.join(", ")}`,
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
