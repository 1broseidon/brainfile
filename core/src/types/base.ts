/**
 * Base type definitions shared across all brainfile types
 * @packageDocumentation
 */

import type { Contract } from './contract';
import type { DispatchRecord } from './dispatch';

/**
 * AI agent instructions
 */
export interface AgentInstructions {
  instructions: string[];
  llmNotes?: string;
  /** System prompt identity — who this agent is and how it should behave */
  identity?: string;

  /** Extension fields (x-otto, x-cursor, etc.) are preserved for round-tripping. */
  [key: string]: unknown;
}

/**
 * Statistics configuration
 */
export interface StatsConfig {
  columns?: string[];  // Column IDs to display in stats (max 4)
}

/**
 * Base fields shared by all brainfile types
 */
export interface BrainfileBase {
  /** Brainfile title */
  title: string;
  /** Type discriminator (e.g., 'board', 'journal', 'collection') */
  type?: string;
  /** Schema URL for validation */
  schema?: string;
  /** Protocol version (semver) */
  protocolVersion?: string;
  /** AI agent instructions */
  agent?: AgentInstructions;
}

/**
 * Subtask definition used by tasks
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

/** Where a pull request stands on the forge: open, merged, or closed without merging. */
export type PullRequestState = 'open' | 'merged' | 'closed';

/**
 * `pullRequest:` on a task (decision-16): a hand-off landed by a pull
 * request instead of Merge. While it is `open` the task is out of Ready to
 * merge; `merged` completes it, `closed` puts it back.
 */
export interface PullRequestRecord {
  number: number;
  /** The pull request's page, e.g. `https://github.com/o/r/pull/12`. */
  url: string;
  state: PullRequestState;
  /** The branch it goes into: the task's target, the trunk unless set. */
  base: string;
  /** The branch it carries: `dispatch/<task-id>`. */
  head: string;
  /** ISO 8601, when it was opened. */
  at: string;
}

/**
 * Task definition - used by board type and per-task files (v2)
 *
 * Extension fields (e.g. `x-otto`, `x-cursor`) are preserved through
 * parse/serialize cycles via the index signature.  Values are opaque —
 * brainfile never transforms keys inside extension objects.
 */
export interface Task {
  id: string;
  title: string;
  /** Optional parent task/document ID for first-class parent-child linking. */
  parentId?: string;
  /** Task IDs that must be completed before this task's contract can auto-activate or dispatch. */
  dependsOn?: string[];
  /**
   * Decisions this piece of work rests on (spec-12). The reverse ("what rests
   * on this decision") is computed, never written on the decision.
   */
  decisions?: string[];
  /**
   * Document type: one of the built-ins (epic, spec, plan, task, decision; `issue`
   * and `adr` are aliases) or a type from the board's `types:`. Determines the
   * ID prefix when generating IDs. Absent means task.
   */
  type?: string;
  description?: string;
  relatedFiles?: string[];
  assignee?: string;
  tags?: string[];
  /** Task IDs that must be completed before this task can run. */
  blockedBy?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  subtasks?: Subtask[];
  template?: 'bug' | 'feature' | 'refactor';
  /** Optional PM-to-agent contract metadata */
  contract?: Contract;
  /**
   * A hand-off: who asked, with what, and the runner's claim (spec-16-1). As
   * written; `readDispatchRecord` checks it.
   */
  dispatch?: DispatchRecord;
  /**
   * Where the work came from outside the board: the web URL of the issue it
   * was made from (decision-4), e.g. `https://github.com/o/r/issues/12`.
   */
  source?: string;
  /**
   * The pull request the task's hand-off was opened as (decision-16): it
   * lands when that merges on the forge. As written; `parsePullRequest`
   * checks it.
   */
  pullRequest?: PullRequestRecord;
  createdAt?: string;  // ISO 8601 timestamp
  updatedAt?: string;  // ISO 8601 timestamp
  /** Column this task belongs to (v2 per-task files) */
  column?: string;
  /** Sort position within the column (v2 per-task files) */
  position?: number;
  /** ISO 8601 timestamp when task was completed (v2 per-task files, set when moved to logs/) */
  completedAt?: string;
  /**
   * The branch a hand-off of this task forks from and lands on (decision-16).
   * Inherited by everything under it unless a nearer document sets its own;
   * absent all the way up means the repository's trunk. See `landsOnOf`.
   */
  landsOn?: string;
  /**
   * On an epic (or any document with children): its lead makes the epic its
   * own branch, `dispatch/<id>`, from the epic's target, and everything under
   * it forks from and lands on that branch (decision-16). Off by default.
   */
  epicBranch?: boolean;

  /** Extension fields (x-otto, x-cursor, etc.) are preserved for round-tripping. */
  [key: string]: unknown;
}

/** How firmly a decision binds (spec-11). */
export type DecisionKind = 'decision' | 'preference' | 'constraint' | 'rule';

/** Where a decision stands. A decision with no status is current; a legacy `type: adr` with none is proposed. */
export type DecisionStatus = 'current' | 'superseded' | 'rejected' | 'stale' | 'proposed';

/** What a decision says about its subject (spec-11). */
export type DecisionStance = 'prefers' | 'rejects' | 'requires' | 'forbids';

/**
 * Frontmatter of a `decision` document (alias `adr`): a standing choice, not
 * work. No column, never completed; current until superseded, rejected or
 * stale. The body is the decision and why. spec-11 builds on these fields.
 */
export interface DecisionFields {
  /** Dotted claim family, e.g. `dependency.http-client`. One current decision per family. */
  claimKey?: string;
  kind?: DecisionKind;
  /** `current`, `superseded`, `rejected` or `stale`. Legacy ADRs may say `proposed`, `accepted`, `promoted` or `deprecated`. */
  status?: DecisionStatus | string;
  stance?: DecisionStance;
  /** What the stance is about: a package, a pattern, a tool. */
  subject?: string;
  /** The condition under which the decision holds. */
  holdsWhile?: string;
  /** When or why to look at it again. */
  recheck?: string;
  /** ISO date after which it is stale. */
  validUntil?: string;
  /** The decision(s) this one replaces. */
  supersedes?: string | string[];
  /** The decision that replaced this one. */
  supersededBy?: string;
}

/** A decision document's frontmatter. */
export type Decision = Task & DecisionFields;

/**
 * A task document wrapping the YAML frontmatter metadata and markdown body.
 * Represents a standalone task file in `.brainfile/board/` or `.brainfile/logs/`.
 */
export interface TaskDocument {
  /** Task metadata parsed from YAML frontmatter */
  task: Task;
  /** Markdown body content (everything after the frontmatter closing `---`) */
  body: string;
  /** Absolute path to the task file on disk (set when read from filesystem) */
  filePath?: string;
}

// Task Template Types
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  template: Partial<Task>;
  variables?: TemplateVariable[];
  isBuiltIn?: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required?: boolean;
}

export interface TemplateConfig {
  builtInTemplates: TaskTemplate[];
  userTemplates: TaskTemplate[];
}

// Built-in template type enum
export const TEMPLATE_TYPES = {
  BUG: 'bug',
  FEATURE: 'feature',
  REFACTOR: 'refactor'
} as const;

export type TemplateType = typeof TEMPLATE_TYPES[keyof typeof TEMPLATE_TYPES];
