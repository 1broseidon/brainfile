/**
 * Browser-safe Brainfile entrypoint.
 *
 * This module exports parsing, serialization, graph, document-type and realtime diff helpers
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
export {
  DOC_ROLES,
  DOC_TYPES,
  TYPE_ALIASES,
  TYPE_GLYPHS,
  isDocRole,
  isTypeAlias,
  canonicalTypeName,
  typesMatch,
  isBuiltInType,
  resolveDocType,
  docRole,
  typeGlyph,
  isKnownType,
  listDocTypes,
  availableTypeNames,
  parentFit,
  allowedParentRoles,
  allowedChildRoles,
  lintTypesConfig,
} from './docTypes';
export type { DocRole, DocTypeDefinition, ResolvedDocType, ParentFit } from './docTypes';
export {
  DECISION_STATUSES,
  decisionStatus,
  idList,
  decisionIdsOf,
  buildDocGraph,
  docPlace,
  flattenDocTree,
  checkDocumentLinks,
  lintDocGraph,
} from './docGraph';
export type {
  DecisionLink,
  WorkOnSupersededDecision,
  DocTreeNode,
  DocTreeOptions,
  DocGraphOptions,
  DocGraph,
  LinkChange,
  LinkCheckResult,
  LinkCheckOptions,
  LintDocGraphOptions,
  DocPlace,
} from './docGraph';
export type { DependencyGraphNode } from './graph';
export {
  RELATED_ALIAS_PATTERN,
  isQualifiedRef,
  parseTaskRef,
  formatTaskRef,
  readRelatedConfig,
  lintRelatedConfig,
  lintTaskRefs,
} from './related';
export type { RelatedConfig, TaskRef } from './related';
export type {
  Board,
  BoardConfig,
  Column,
  ColumnConfig,
  Task,
  TaskDocument,
  Subtask,
} from './types';
