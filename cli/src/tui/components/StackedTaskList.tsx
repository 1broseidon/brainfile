/**
 * StackedTaskList - Responsive narrow layout
 *
 * Shows all columns stacked vertically with inline headers.
 * Used when terminal width is between 50-79 columns.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import type { BoardColumn } from '../types.js';
import { PALETTE, BOX } from '../theme.js';
import { TaskCard } from './TaskCard.js';
import { getTaskCardHeight } from './TaskCardMeasure.js';

export interface FlatTask {
  task: Task;
  columnId: string;
  columnTitle: string;
  globalIndex: number;
}

export interface StackedTaskListProps {
  columns: BoardColumn[];
  allTasks?: Task[];
  selectedGlobalIndex: number;
  expandedIds: Set<string>;
  viewportHeight: number;
  termWidth: number;
}

/** Flatten all tasks across columns with global indices */
export function flattenTasks(columns: BoardColumn[]): FlatTask[] {
  const flat: FlatTask[] = [];
  let globalIndex = 0;

  for (const col of columns) {
    for (const task of (col.tasks ?? [])) {
      flat.push({
        task,
        columnId: col.id,
        columnTitle: col.title,
        globalIndex,
      });
      globalIndex++;
    }
  }

  return flat;
}

export function StackedTaskList({
  columns,
  allTasks = [],
  selectedGlobalIndex,
  expandedIds,
  viewportHeight,
  termWidth,
}: StackedTaskListProps) {
  const cardWidth = termWidth - 4;
  const contentWidth = cardWidth - 6;

  // Flatten all tasks
  const flatTasks = flattenTasks(columns);

  if (flatTasks.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={2} height={viewportHeight}>
        <Text color={PALETTE.textMuted} dimColor>No tasks</Text>
        {Array.from({ length: viewportHeight - 1 }).map((_, i) => (
          <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
        ))}
      </Box>
    );
  }

  // Calculate scroll offset
  let scrollOffset = 0;
  let heightBeforeSelected = 0;

  for (let i = 0; i < selectedGlobalIndex; i++) {
    const ft = flatTasks[i];
    const isExpanded = expandedIds.has(ft.task.id);
    // Add column header height if this is first task in column
    if (i === 0 || flatTasks[i - 1].columnId !== ft.columnId) {
      heightBeforeSelected += 2; // header + margin
    }
    heightBeforeSelected += getTaskCardHeight(ft.task, isExpanded, contentWidth, allTasks);
  }

  const selectedFlatTask = flatTasks[selectedGlobalIndex];
  const selectedHeight = selectedFlatTask
    ? getTaskCardHeight(selectedFlatTask.task, expandedIds.has(selectedFlatTask.task.id), contentWidth, allTasks)
    : 5;

  if (heightBeforeSelected + selectedHeight > viewportHeight) {
    scrollOffset = selectedGlobalIndex;
  } else if (heightBeforeSelected > viewportHeight * 0.6) {
    scrollOffset = Math.max(0, selectedGlobalIndex - 2);
  }

  // Build visible items
  const visibleItems: React.ReactNode[] = [];
  let linesUsed = 0;
  let lastColumnId: string | null = null;
  let itemKey = 0;

  for (let i = scrollOffset; i < flatTasks.length; i++) {
    const ft = flatTasks[i];
    const isSelected = i === selectedGlobalIndex;
    const isExpanded = expandedIds.has(ft.task.id);

    // Column header when column changes
    if (ft.columnId !== lastColumnId) {
      const headerLines = lastColumnId ? 3 : 1; // separator + header or just header
      if (linesUsed + headerLines > viewportHeight && !isSelected) break;

      // Add separator before new column (except first)
      if (lastColumnId) {
        visibleItems.push(
          <Box key={`sep-${ft.columnId}-${itemKey++}`} paddingLeft={1} marginTop={1}>
            <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 4))}</Text>
          </Box>
        );
        linesUsed += 1;
      }

      visibleItems.push(
        <Box key={`header-${ft.columnId}-${itemKey++}`} marginTop={lastColumnId ? 1 : 0} paddingLeft={1}>
          <Text color={PALETTE.accent} bold>{ft.columnTitle.toUpperCase()}</Text>
          <Text color={PALETTE.textDim}> ({columns.find(c => c.id === ft.columnId)?.tasks?.length || 0})</Text>
        </Box>
      );
      linesUsed += 1;
      lastColumnId = ft.columnId;
    }

    const taskLines = getTaskCardHeight(ft.task, isExpanded, contentWidth, allTasks);

    // Always include selected task
    if (isSelected) {
      visibleItems.push(
        <Box key={ft.task.id} marginTop={visibleItems.length > 0 ? 1 : 0}>
          <TaskCard
            task={ft.task}
            allTasks={allTasks}
            isSelected={true}
            isExpanded={isExpanded}
            width={cardWidth}
            hideTagsWhenCollapsed={true}
            showContractBadge={true}
          />
        </Box>
      );
      linesUsed += taskLines;
      continue;
    }

    if (linesUsed + taskLines <= viewportHeight) {
      visibleItems.push(
        <Box key={ft.task.id} marginTop={1}>
          <TaskCard
            task={ft.task}
            allTasks={allTasks}
            isSelected={false}
            isExpanded={isExpanded}
            width={cardWidth}
            hideTagsWhenCollapsed={true}
            showContractBadge={true}
          />
        </Box>
      );
      linesUsed += taskLines;
    } else if (linesUsed > 0) {
      break;
    }
  }

  const emptyLines = Math.max(0, viewportHeight - linesUsed);

  return (
    <Box flexDirection="column" paddingLeft={1} height={viewportHeight}>
      {visibleItems}
      {emptyLines > 0 && <Box height={emptyLines} />}
    </Box>
  );
}
