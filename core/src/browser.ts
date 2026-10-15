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
  COLUMN_ID_PATTERN,
  columnIdFromTitle,
  orderedColumns,
  findColumnConfig,
  addColumn,
  renameColumn,
  reorderColumns,
  removeColumn,
  readBoardSettings,
  updateBoardSettings,
} from './boardConfigEdits';
export type {
  AddColumnInput,
  BoardConfigEditResult,
  BoardSettings,
  BoardSettingsPatch,
  BoardSettingsResult,
} from './boardConfigEdits';
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
export { epicBranchOf, targetOf, landsOnOf, isBranchName } from './landsOn';
export type { LandsOn } from './landsOn';
export {
  DECISION_KINDS,
  DECISION_STANCES,
  CLAIM_KEY_PATTERN,
  ACTION_CUE_WORDS,
  CHECK_VERDICT_SEVERITY,
  isDecisionKind,
  isDecisionStance,
  normalizeClaimKey,
  isValidClaimKey,
  claimKeyOf,
  claimKeyParent,
  claimKeyMatchesPrefix,
  isDecisionDoc,
  isHistoricalStatus,
  isHistoricalDecision,
  isCurrentDecision,
  decisionFamilyKey,
  compareDecisionsNewestFirst,
  groupDecisionFamilies,
  groupDecisionsByPrefix,
  decisionFamilyMembers,
  significantTokens,
  tokenCoverage,
  stemLight,
  relatedClaimFamilies,
  requestedAction,
  stanceActionAligns,
  parsePredicateTime,
  evaluateValidUntil,
  parsePackageSpec,
  compareVersionish,
  comparePredicateValue,
  summarizeDecision,
  assessDecisionFamily,
  checkVerdictSeverity,
  worstCheckResult,
} from './decisions';
export type {
  DecisionFamily,
  DecisionFamilyGroup,
  RelatedClaim,
  RequestedAction,
  PredicateCheck,
  PredicateReport,
  PredicateStatus,
  CheckVerdict,
  CheckRecommendation,
  DecisionSummary,
  CheckResult,
} from './decisions';
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
export {
  labelTag,
  issueTask,
  sourceKey,
  sourcesOf,
  linkedTask,
} from './issues';
export type { Issue, IssueTaskInput } from './issues';
export { PULL_REQUEST_STATES, parsePullRequest, openPullRequestOf, withPullRequest, pullRequestText } from './pullRequest';
export type {
  Board,
  BoardConfig,
  Column,
  ColumnConfig,
  Task,
  TaskDocument,
  Subtask,
  PullRequestRecord,
  PullRequestState,
} from './types';
