/**
 * TaskCardMeasure - Single source of truth for TaskCard height calculations
 *
 * This module provides deterministic height calculation for TaskCards.
 * Used by both TaskCard (rendering) and TaskList (viewport scrolling).
 */
import type { Task } from '@brainfile/core';

export interface TaskCardDimensions {
  collapsed: number;
  expanded: number;
}

/**
 * Wrap text to a maximum width, returning an array of lines.
 * Each line is guaranteed to fit within maxWidth characters.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text || maxWidth <= 0) return [];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxWidth) {
      // Word is longer than line - split it
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let i = 0; i < word.length; i += maxWidth) {
        lines.push(word.slice(i, i + maxWidth));
      }
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      // Word fits on current line
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      // Start new line
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/**
 * Safe truncation that always returns a non-empty string.
 * Ink requires non-empty strings to avoid rendering errors.
 */
export function safeTruncate(text: string | undefined, maxWidth: number): string {
  if (!text) return ' ';
  if (maxWidth <= 0) return ' ';
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Calculate exact height dimensions for a TaskCard.
 *
 * Linear-style borderless design:
 *
 * COLLAPSED (always 3 lines):
 * - Row 1: indicator + priority + title = 1
 * - Row 2: indented meta + ID = 1
 * - Margin between cards (handled by TaskList) = 1
 *
 * EXPANDED (variable):
 * - Base collapsed: 3
 * - marginTop before expanded content: 1
 * - Description: min(lines, 3) + overflow(1) (if present)
 * - Subtasks: marginTop(conditional) + min(count, 5) + overflow(1) (if present)
 * - Related files: marginTop(1) + min(count, 3) + overflow(1) (if present)
 */
export function measureTaskCard(task: Task, contentWidth: number): TaskCardDimensions {
  // Collapsed is ALWAYS 3 lines (2 content + 1 margin)
  const collapsed = 3;

  // Expanded builds on top of collapsed base
  let expanded = 3;

  // marginTop before expanded content
  expanded += 1;

  // Description section (if present)
  if (task.description) {
    const descLines = wrapText(task.description, contentWidth - 4);
    expanded += Math.min(descLines.length, 3);
    if (descLines.length > 3) {
      expanded += 1; // "…" overflow indicator
    }
  }

  // Subtasks section (if present)
  if (task.subtasks && task.subtasks.length > 0) {
    if (task.description) {
      expanded += 1; // marginTop={1} only if description present
    }
    expanded += Math.min(task.subtasks.length, 5);
    if (task.subtasks.length > 5) {
      expanded += 1; // "+N more" line
    }
  }

  // Related files section (if present)
  if (task.relatedFiles && task.relatedFiles.length > 0) {
    expanded += 1; // marginTop={1}
    expanded += Math.min(task.relatedFiles.length, 3);
    if (task.relatedFiles.length > 3) {
      expanded += 1; // "+N more" line
    }
  }

  return { collapsed, expanded };
}

/**
 * Get the height for a task card based on expanded state.
 * Convenience wrapper for TaskList viewport calculations.
 */
export function getTaskCardHeight(task: Task, isExpanded: boolean, contentWidth: number): number {
  const dims = measureTaskCard(task, contentWidth);
  return isExpanded ? dims.expanded : dims.collapsed;
}
