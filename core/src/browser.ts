/**
 * Browser-safe Brainfile entrypoint.
 *
 * This module exports parsing, serialization, graph, and realtime diff helpers
 * that do not import Node-only modules such as `fs`, `path`, or `crypto`.
 *
 * @packageDocumentation
 */

export * from './types';
export * from './types/contract';
export { BrainfileParser } from './parser';
export type { ParseResult } from './parser';
export { BrainfileSerializer } from './serializer';
export type { SerializeOptions } from './serializer';
export {
  parseBoardConfig,
  serializeBoardConfig,
} from './boardContent';
export {
  parseTaskContent,
  serializeTaskContent,
} from './taskContent';
export {
  diffBoards,
} from './realtimeDiff';
export type {
  BoardDiff,
  ColumnDiff,
  TaskDiff,
} from './realtimeDiff';
export {
  MissingDependencyError,
  DependencyCycleError,
  topologicalSort,
} from './graph';
export type { DependencyGraphNode } from './graph';
export type {
  Board,
  BoardConfig,
  Column,
  ColumnConfig,
  Task,
  TaskDocument,
  Subtask,
} from './types';
