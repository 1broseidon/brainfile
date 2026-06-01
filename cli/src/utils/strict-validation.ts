import type { Board } from '@brainfile/core';

export interface BoardValidationResult {
  valid: boolean;
  error?: string;
}

interface CoreValidationExports {
  validateType?: (board: Board, typeName: string) => BoardValidationResult;
  validateColumn?: (board: Board, columnId: string) => BoardValidationResult;
}

const coreValidation = require('@brainfile/core') as CoreValidationExports;

export function validateType(board: Board, typeName: string): BoardValidationResult {
  if (typeof coreValidation.validateType === 'function') {
    return coreValidation.validateType(board, typeName);
  }

  const strict = (board as any).strict;
  const types = (board as any).types as Record<string, unknown> | undefined;

  if (!strict || !types) {
    return { valid: true };
  }

  if (typeName === 'task' || Object.prototype.hasOwnProperty.call(types, typeName)) {
    return { valid: true };
  }

  const definedKeys = Object.keys(types);
  const availableTypes = definedKeys.includes('task') ? definedKeys : ['task', ...definedKeys];
  return {
    valid: false,
    error: `Type '${typeName}' is not defined. Available types: ${availableTypes.join(', ')}`,
  };
}

export function validateColumn(board: Board, columnId: string): BoardValidationResult {
  if (typeof coreValidation.validateColumn === 'function') {
    return coreValidation.validateColumn(board, columnId);
  }

  if (!(board as any).strict) {
    return { valid: true };
  }

  const columnIds = board.columns.map(column => column.id);
  if (columnIds.includes(columnId)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Column '${columnId}' is not defined. Available columns: ${columnIds.join(', ')}`,
  };
}
