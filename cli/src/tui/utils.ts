import type { Task } from '@brainfile/core';
import { PALETTE } from './theme.js';

/**
 * Parsed search query with structured filters and text search
 */
export interface ParsedSearch {
  text: string;           // Remaining text for substring search
  priority?: string;      // p:high, priority:critical
  tag?: string;           // t:bug, #bug, tag:feature
  assignee?: string;      // @john, assignee:john
  due?: 'overdue' | 'today' | 'week' | 'month';  // due:overdue, due:today, due:week
  contract?: 'ready' | 'in_progress' | 'delivered' | 'done' | 'failed'; // contract:ready, contract:in_progress
}

/**
 * Parse search query to extract structured filters
 * Supports: p:high, t:bug, #tag, @assignee, due:overdue, contract:ready
 */
export function parseSearchQuery(query: string): ParsedSearch {
  const result: ParsedSearch = { text: '' };
  const parts: string[] = [];

  // Split by spaces but preserve quoted strings (future enhancement)
  const tokens = query.trim().split(/\s+/);

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Priority filter: p:high or priority:critical
    if (lower.startsWith('p:') || lower.startsWith('priority:')) {
      result.priority = token.split(':')[1]?.toLowerCase();
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
      if (['overdue', 'today', 'week', 'month'].includes(value)) {
        result.due = value as ParsedSearch['due'];
      }
      continue;
    }

    // Contract status filter: contract:ready, contract:in_progress, contract:delivered, contract:done, contract:failed
    if (lower.startsWith('contract:')) {
      const value = lower.split(':')[1];
      if (['ready', 'in_progress', 'delivered', 'done', 'failed'].includes(value)) {
        result.contract = value as NonNullable<ParsedSearch['contract']>;
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
 * Check if a task matches the parsed search filters
 */
export function taskMatchesFilter(task: Task, filter: ParsedSearch): boolean {
  // Priority filter
  if (filter.priority) {
    if (!task.priority || task.priority.toLowerCase() !== filter.priority) {
      return false;
    }
  }

  // Tag filter
  if (filter.tag) {
    if (!task.tags || !task.tags.some(t => t.toLowerCase().includes(filter.tag!))) {
      return false;
    }
  }

  // Assignee filter
  if (filter.assignee) {
    if (!task.assignee || !task.assignee.toLowerCase().includes(filter.assignee)) {
      return false;
    }
  }

  // Due date filter
  if (filter.due && task.dueDate) {
    const due = new Date(task.dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    switch (filter.due) {
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
  } else if (filter.due) {
    // Due filter specified but task has no due date
    return false;
  }

  // Contract status filter
  if (filter.contract) {
    const contractStatus = (task as any).contract?.status as string | undefined;
    if (!contractStatus || contractStatus !== filter.contract) {
      return false;
    }
  }

  // Text search (substring match across multiple fields)
  if (filter.text) {
    const searchText = filter.text;
    const matchesText =
      task.title.toLowerCase().includes(searchText) ||
      task.id.toLowerCase().includes(searchText) ||
      task.tags?.some(t => t.toLowerCase().includes(searchText)) ||
      task.priority?.toLowerCase().includes(searchText) ||
      task.description?.toLowerCase().includes(searchText) ||
      task.assignee?.toLowerCase().includes(searchText);

    if (!matchesText) return false;
  }

  return true;
}

export function truncate(value: string, maxLength: number): string {
  if (!value) return ' '; // Return space instead of empty string for Ink compatibility
  if (maxLength <= 0) return ' ';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function getPriorityColor(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'critical':
      return PALETTE.critical;
    case 'giga':
      return PALETTE.giga;
    case 'high':
      return PALETTE.high;
    case 'medium':
      return PALETTE.medium;
    case 'low':
      return PALETTE.low;
    default:
      return PALETTE.border;
  }
}
