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
