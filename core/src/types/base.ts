/**
 * Base type definitions shared across all brainfile types
 * @packageDocumentation
 */

import type { Contract } from './contract';

/**
 * Rule definition for project guidelines
 */
export interface Rule {
  id: number;
  rule: string;
}

/**
 * Rules structure with different priority levels
 */
export interface Rules {
  always?: Rule[];
  never?: Rule[];
  prefer?: Rule[];
  context?: Rule[];
}

/**
 * AI agent instructions
 */
export interface AgentInstructions {
  instructions: string[];
  llmNotes?: string;
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
  /** Project rules and guidelines */
  rules?: Rules;
}

/**
 * Subtask definition used by tasks
 */
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

/**
 * Task definition - used by board type and per-task files (v2)
 */
export interface Task {
  id: string;
  title: string;
  description?: string;
  relatedFiles?: string[];
  assignee?: string;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  subtasks?: Subtask[];
  template?: 'bug' | 'feature' | 'refactor';
  /** Optional PM-to-agent contract metadata */
  contract?: Contract;
  createdAt?: string;  // ISO 8601 timestamp
  updatedAt?: string;  // ISO 8601 timestamp
  /** Column this task belongs to (v2 per-task files) */
  column?: string;
  /** Sort position within the column (v2 per-task files) */
  position?: number;
  /** ISO 8601 timestamp when task was completed (v2 per-task files, set when moved to logs/) */
  completedAt?: string;
}

/**
 * A task document wrapping the YAML frontmatter metadata and markdown body.
 * Represents a standalone task file in `.brainfile/tasks/` or `.brainfile/logs/`.
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
