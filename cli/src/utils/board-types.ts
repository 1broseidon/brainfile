import type { Board } from '@brainfile/core';

export interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

export interface TypesConfig {
  [typeName: string]: TypeEntry;
}

export function getBoardTypes(board: Board & { types?: TypesConfig }): TypesConfig {
  return board.types ?? {};
}
