/**
 * Ranked search over task documents.
 *
 * Combines the structured filter syntax (`p:high`, `t:bug`, `@alice`,
 * `due:overdue`, `contract:ready`, `type:plan`) with a weighted relevance
 * score, so CLI, MCP, and TUI frontends all rank identically.
 *
 * @packageDocumentation
 */

import type { Task, TaskDocument } from './types';
import type { ContractStatus } from './types/contract';
import { extractDescription, extractLog } from './workspace';

export interface SearchFilters {
  column?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tag?: string;
  assignee?: string;
  due?: 'overdue' | 'today' | 'week' | 'month';
  contract?: ContractStatus;
  /** Document type filter (e.g. 'epic', 'plan'). Untyped tasks match 'task'. */
  type?: string;
}

export interface ParsedSearchQuery extends SearchFilters {
  /** Remaining free-text portion after stripping structured filter tokens, lowercased. */
  text: string;
}

const DUE_VALUES = ['overdue', 'today', 'week', 'month'];
const CONTRACT_VALUES = ['ready', 'in_progress', 'delivered', 'done', 'failed'];

/**
 * Parse a search query into structured filters plus remaining free text.
 *
 * Supported tokens: `p:`/`priority:`, `t:`/`tag:`/`#tag`, `@user`/`assignee:`,
 * `due:`, `contract:`, `type:`.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = { text: '' };
  const parts: string[] = [];

  const tokens = query.trim().split(/\s+/);

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Priority filter: p:high or priority:critical
    if (lower.startsWith('p:') || lower.startsWith('priority:')) {
      result.priority = token.split(':')[1]?.toLowerCase() as SearchFilters['priority'];
      continue;
    }

    // Tag filter: t:bug, tag:feature, or #hashtag
    if (lower.startsWith('t:') || lower.startsWith('tag:')) {
      result.tag = token.split(':')[1]?.toLowerCase();
      continue;
    }
    if (token.startsWith('#') && token.length > 1) {
      result.tag = token.slice(1).toLowerCase();
      continue;
    }

    // Assignee filter: @john or assignee:john
    if (token.startsWith('@') && token.length > 1) {
      result.assignee = token.slice(1).toLowerCase();
      continue;
    }
    if (lower.startsWith('assignee:')) {
      result.assignee = token.split(':')[1]?.toLowerCase();
      continue;
    }

    // Due date filter: due:overdue, due:today, due:week, due:month
    if (lower.startsWith('due:')) {
      const value = lower.split(':')[1];
      if (DUE_VALUES.includes(value)) {
        result.due = value as SearchFilters['due'];
      }
      continue;
    }

    // Contract status filter
    if (lower.startsWith('contract:')) {
      const value = lower.split(':')[1];
      if (CONTRACT_VALUES.includes(value)) {
        result.contract = value as ContractStatus;
      }
      continue;
    }

    // Document type filter: type:plan
    if (lower.startsWith('type:')) {
      const value = token.split(':')[1];
      if (value) {
        result.type = value.toLowerCase();
      }
      continue;
    }

    // Not a filter, add to text search
    parts.push(token);
  }

  result.text = parts.join(' ').toLowerCase();
  return result;
}

/**
 * Check whether a task satisfies every supplied filter.
 *
 * `text` (when present on a `ParsedSearchQuery`) is also applied here as a
 * substring match across title/id/tags/priority/description/assignee.
 */
export function taskMatchesFilters(task: Task, filters: SearchFilters & { text?: string }): boolean {
  if (filters.column) {
    if (task.column !== filters.column) return false;
  }

  if (filters.type) {
    if ((task.type || 'task') !== filters.type) return false;
  }

  if (filters.priority) {
    if (!task.priority || task.priority.toLowerCase() !== filters.priority) {
      return false;
    }
  }

  if (filters.tag) {
    if (!task.tags || !task.tags.some((t) => t.toLowerCase().includes(filters.tag!))) {
      return false;
    }
  }

  if (filters.assignee) {
    if (!task.assignee || !task.assignee.toLowerCase().includes(filters.assignee)) {
      return false;
    }
  }

  if (filters.due && task.dueDate) {
    const due = new Date(task.dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    switch (filters.due) {
      case 'overdue':
        if (diffDays >= 0) return false;
        break;
      case 'today':
        if (diffDays !== 0) return false;
        break;
      case 'week':
        if (diffDays < 0 || diffDays > 7) return false;
        break;
      case 'month':
        if (diffDays < 0 || diffDays > 30) return false;
        break;
    }
  } else if (filters.due) {
    // Due filter specified but task has no due date
    return false;
  }

  if (filters.contract) {
    const contractStatus = task.contract?.status;
    if (!contractStatus || contractStatus !== filters.contract) {
      return false;
    }
  }

  if (filters.text) {
    const searchText = filters.text;
    const matchesText =
      task.title.toLowerCase().includes(searchText) ||
      task.id.toLowerCase().includes(searchText) ||
      task.tags?.some((t) => t.toLowerCase().includes(searchText)) ||
      task.priority?.toLowerCase().includes(searchText) ||
      task.description?.toLowerCase().includes(searchText) ||
      task.assignee?.toLowerCase().includes(searchText);

    if (!matchesText) return false;
  }

  return true;
}

export interface SearchMatch {
  doc: TaskDocument;
  score: number;
}

/**
 * Score a task document against a lowercased query string.
 *
 * Weights: ID exact match +20, title substring +10 (+5 when it also starts
 * with the query), frontmatter description +5, body `## Description` +5,
 * tag substring +3, body `## Log` +2.
 */
export function scoreTaskDocument(doc: TaskDocument, queryLower: string): number {
  const task = doc.task;
  let score = 0;

  if (task.id.toLowerCase() === queryLower) score += 20;

  if (task.title.toLowerCase().includes(queryLower)) {
    score += 10;
    if (task.title.toLowerCase().startsWith(queryLower)) score += 5;
  }

  if (task.description?.toLowerCase().includes(queryLower)) score += 5;

  if (extractDescription(doc.body)?.toLowerCase().includes(queryLower)) score += 5;

  if (task.tags?.some((t) => t.toLowerCase().includes(queryLower))) score += 3;

  if (extractLog(doc.body)?.toLowerCase().includes(queryLower)) score += 2;

  return score;
}

/**
 * Ranked search over a caller-supplied set of task documents.
 *
 * The caller decides which documents participate (board docs, log docs, or
 * both) — this function performs no filesystem access.
 *
 * `query` may embed structured filter tokens; they are parsed out and merged
 * with the explicit `filters` param, which wins on conflict. Keys whose value
 * is `undefined` never override an embedded token — callers routinely build the
 * `filters` object from optional parameters (`{ column, priority, assignee }`),
 * which produces explicitly-`undefined` properties for omitted options, and
 * those must not erase a filter the query itself specified.
 * Matches with a score above zero are returned sorted descending, ties broken
 * by input order.
 * A filter-only query (no free text) returns every surviving doc with score 1.
 */
export function searchTasksRanked(
  docs: TaskDocument[],
  query: string,
  filters?: SearchFilters,
): SearchMatch[] {
  const parsed = parseSearchQuery(query);
  const mergedFilters: SearchFilters & { text?: string } = { ...parsed };
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        (mergedFilters as Record<string, unknown>)[key] = value;
      }
    }
  }
  const text = parsed.text;

  const matches: SearchMatch[] = [];

  for (const doc of docs) {
    // Free text is scored, not substring-filtered — apply structural filters only.
    const { text: _ignored, ...structural } = mergedFilters;
    if (!taskMatchesFilters(doc.task, structural)) continue;

    if (!text) {
      matches.push({ doc, score: 1 });
      continue;
    }

    const score = scoreTaskDocument(doc, text);
    if (score > 0) {
      matches.push({ doc, score });
    }
  }

  // Stable sort: Array.prototype.sort is stable in Node >= 11.
  matches.sort((a, b) => b.score - a.score);

  return matches;
}
