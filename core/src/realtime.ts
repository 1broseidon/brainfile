import { createHash } from 'crypto';
import { BrainfileSerializer } from './serializer';
import { Board } from './types';
export { diffBoards } from './realtimeDiff';
export type { BoardDiff, ColumnDiff, TaskDiff } from './realtimeDiff';

/**
  * Generate a stable hash for raw Brainfile content.
  * Uses SHA-256 for collision resistance and cross-process consistency.
  */
export function hashBoardContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
  * Generate a stable hash for a Board by serializing with BrainfileSerializer.
  */
export function hashBoard(board: Board): string {
  const serialized = BrainfileSerializer.serialize(board);
  return hashBoardContent(serialized);
}
