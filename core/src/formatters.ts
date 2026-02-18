/**
 * Formatters for external service payloads
 *
 * Pure transformation functions that convert Brainfile tasks into
 * payloads suitable for GitHub Issues, Linear, and other services.
 *
 * These functions have no I/O or dependencies - CLI handles the actual API calls.
 *
 * @packageDocumentation
 */

import type { Task, Subtask } from './types/base';

// ============================================================================
// GitHub Types
// ============================================================================

/**
 * Payload for creating a GitHub Issue
 */
export interface GitHubIssuePayload {
  /** Issue title */
  title: string;
  /** Issue body in markdown */
  body: string;
  /** Labels to apply */
  labels?: string[];
  /** Issue state - archived tasks are created as closed */
  state?: 'open' | 'closed';
}

/**
 * Options for formatting a task for GitHub
 */
export interface GitHubFormatOptions {
  /** Include task metadata (priority, dates, etc.) in body */
  includeMeta?: boolean;
  /** Include subtasks as checklist in body */
  includeSubtasks?: boolean;
  /** Include related files section */
  includeRelatedFiles?: boolean;
  /** Commit SHA or URL that resolved this task */
  resolvedBy?: string;
  /** PR number or URL that resolved this task */
  resolvedByPR?: string;
  /** Column the task was in when archived */
  fromColumn?: string;
  /** Board title for context */
  boardTitle?: string;
  /** Extra labels to add (in addition to tags) */
  extraLabels?: string[];
  /** Prefix for task ID in title (default: true) */
  includeTaskId?: boolean;
}

// ============================================================================
// Linear Types
// ============================================================================

/**
 * Payload for creating a Linear Issue
 */
export interface LinearIssuePayload {
  /** Issue title */
  title: string;
  /** Issue description in markdown */
  description: string;
  /** Priority (1=urgent, 2=high, 3=normal, 4=low, 0=none) */
  priority?: number;
  /** Label names to apply */
  labelNames?: string[];
  /** State name (e.g., "Done", "Canceled") */
  stateName?: string;
}

/**
 * Options for formatting a task for Linear
 */
export interface LinearFormatOptions {
  /** Include task metadata in description */
  includeMeta?: boolean;
  /** Include subtasks as checklist */
  includeSubtasks?: boolean;
  /** Include related files section */
  includeRelatedFiles?: boolean;
  /** Commit SHA or URL that resolved this task */
  resolvedBy?: string;
  /** PR number or URL that resolved this task */
  resolvedByPR?: string;
  /** Column the task was in when archived */
  fromColumn?: string;
  /** Board title for context */
  boardTitle?: string;
  /** State to set (default: "Done") */
  stateName?: string;
  /** Prefix for task ID in title (default: false for Linear) */
  includeTaskId?: boolean;
}

// ============================================================================
// GitHub Formatter
// ============================================================================

/**
 * Format a Brainfile task as a GitHub Issue payload
 *
 * @param task - The task to format
 * @param options - Formatting options
 * @returns GitHub Issue payload ready for octokit
 *
 * @example
 * ```typescript
 * const payload = formatTaskForGitHub(task, {
 *   includeMeta: true,
 *   resolvedByPR: '#123'
 * });
 * await octokit.issues.create({ owner, repo, ...payload });
 * ```
 */
export function formatTaskForGitHub(
  task: Task,
  options: GitHubFormatOptions = {}
): GitHubIssuePayload {
  const {
    includeMeta = true,
    includeSubtasks = true,
    includeRelatedFiles = true,
    resolvedBy,
    resolvedByPR,
    fromColumn,
    boardTitle,
    extraLabels = [],
    includeTaskId = true,
  } = options;

  // Build title
  const title = includeTaskId ? `[${task.id}] ${task.title}` : task.title;

  // Build body sections
  const sections: string[] = [];

  // Description
  if (task.description) {
    sections.push(task.description);
  }

  // Subtasks as checklist
  if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
    sections.push(formatSubtasksMarkdown(task.subtasks));
  }

  // Metadata section
  if (includeMeta) {
    const meta = formatMetadataSection(task, { fromColumn, boardTitle });
    if (meta) {
      sections.push(meta);
    }
  }

  // Related files
  if (includeRelatedFiles && task.relatedFiles && task.relatedFiles.length > 0) {
    sections.push(formatRelatedFilesSection(task.relatedFiles));
  }

  // Resolution info
  if (resolvedBy || resolvedByPR) {
    sections.push(formatResolutionSection(resolvedBy, resolvedByPR));
  }

  // Footer
  sections.push('---\n*Archived from brainfile.md*');

  // Build labels from tags + extras
  const labels: string[] = [...(task.tags || []), ...extraLabels];

  // Add priority as label if present
  if (task.priority) {
    labels.push(`priority:${task.priority}`);
  }

  // Add template type as label if present
  if (task.template) {
    labels.push(task.template);
  }

  return {
    title,
    body: sections.join('\n\n'),
    labels: labels.length > 0 ? labels : undefined,
    state: 'closed',
  };
}

// ============================================================================
// Linear Formatter
// ============================================================================

/**
 * Map Brainfile priority to Linear priority number
 * Linear: 1=urgent, 2=high, 3=normal, 4=low, 0=none
 */
function mapPriorityToLinear(priority?: Task['priority']): number | undefined {
  switch (priority) {
    case 'critical':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
      return 4;
    default:
      return undefined;
  }
}

/**
 * Format a Brainfile task as a Linear Issue payload
 *
 * @param task - The task to format
 * @param options - Formatting options
 * @returns Linear Issue payload ready for @linear/sdk
 *
 * @example
 * ```typescript
 * const payload = formatTaskForLinear(task, {
 *   includeMeta: true,
 *   stateName: 'Done'
 * });
 * await linearClient.createIssue({ teamId, ...payload });
 * ```
 */
export function formatTaskForLinear(
  task: Task,
  options: LinearFormatOptions = {}
): LinearIssuePayload {
  const {
    includeMeta = true,
    includeSubtasks = true,
    includeRelatedFiles = true,
    resolvedBy,
    resolvedByPR,
    fromColumn,
    boardTitle,
    stateName = 'Done',
    includeTaskId = false,
  } = options;

  // Build title (Linear typically doesn't use ID prefixes)
  const title = includeTaskId ? `[${task.id}] ${task.title}` : task.title;

  // Build description sections
  const sections: string[] = [];

  // Description
  if (task.description) {
    sections.push(task.description);
  }

  // Subtasks as checklist
  if (includeSubtasks && task.subtasks && task.subtasks.length > 0) {
    sections.push(formatSubtasksMarkdown(task.subtasks));
  }

  // Metadata section
  if (includeMeta) {
    const meta = formatMetadataSection(task, { fromColumn, boardTitle });
    if (meta) {
      sections.push(meta);
    }
  }

  // Related files
  if (includeRelatedFiles && task.relatedFiles && task.relatedFiles.length > 0) {
    sections.push(formatRelatedFilesSection(task.relatedFiles));
  }

  // Resolution info
  if (resolvedBy || resolvedByPR) {
    sections.push(formatResolutionSection(resolvedBy, resolvedByPR));
  }

  // Footer
  sections.push('---\n*Archived from brainfile.md*');

  return {
    title,
    description: sections.join('\n\n'),
    priority: mapPriorityToLinear(task.priority),
    labelNames: task.tags && task.tags.length > 0 ? task.tags : undefined,
    stateName,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format subtasks as a markdown checklist
 */
function formatSubtasksMarkdown(subtasks: Subtask[]): string {
  const items = subtasks.map(
    (st) => `- [${st.completed ? 'x' : ' '}] ${st.title}`
  );
  return `## Subtasks\n\n${items.join('\n')}`;
}

/**
 * Format task metadata as a markdown section
 */
function formatMetadataSection(
  task: Task,
  context: { fromColumn?: string; boardTitle?: string }
): string | null {
  const lines: string[] = [];

  if (context.boardTitle) {
    lines.push(`**Board:** ${context.boardTitle}`);
  }

  if (context.fromColumn) {
    lines.push(`**Column:** ${context.fromColumn}`);
  }

  if (task.priority) {
    lines.push(`**Priority:** ${task.priority}`);
  }

  if (task.assignee) {
    lines.push(`**Assignee:** ${task.assignee}`);
  }

  if (task.dueDate) {
    lines.push(`**Due Date:** ${task.dueDate}`);
  }

  if (task.createdAt) {
    lines.push(`**Created:** ${task.createdAt}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return `## Details\n\n${lines.join('\n')}`;
}

/**
 * Format related files as a markdown section
 */
function formatRelatedFilesSection(files: string[]): string {
  const items = files.map((f) => `- \`${f}\``);
  return `## Related Files\n\n${items.join('\n')}`;
}

/**
 * Format resolution information
 */
function formatResolutionSection(
  resolvedBy?: string,
  resolvedByPR?: string
): string {
  const lines: string[] = ['## Resolution'];

  if (resolvedByPR) {
    lines.push(`\n**Pull Request:** ${resolvedByPR}`);
  }

  if (resolvedBy) {
    lines.push(`\n**Commit:** ${resolvedBy}`);
  }

  return lines.join('');
}
