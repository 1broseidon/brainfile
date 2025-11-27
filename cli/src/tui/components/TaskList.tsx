import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE } from '../theme.js';
import { TaskCard } from './TaskCard.js';

export interface TaskListProps {
  tasks: Task[];
  selectedIndex: number;
  expandedIds: Set<string>;
  viewportHeight: number;
  termWidth: number;
}

export function TaskList({ tasks, selectedIndex, expandedIds, viewportHeight, termWidth }: TaskListProps) {
  const cardWidth = termWidth - 4;

  // Helper to calculate task height
  const getTaskHeight = (task: Task, isExpanded: boolean): number => {
    // Base: top border(1) + title(1) + metadata(1) + bottom border(1) + margin(1) = 5
    if (!isExpanded) return 5;
    const subtaskCount = task.subtasks?.length || 0;
    const hasDescription = task.description;
    const hasFiles = task.relatedFiles?.length;
    // expandedLines: separator(1) + description(2 if present) + subtasks + files(2 if present)
    return 5 + 1 + (hasDescription ? 2 : 0) + subtaskCount + (hasFiles ? 2 : 0);
  };

  // Calculate scroll offset - ensure selected task is visible
  // Start from selected task and work backwards to find scroll position
  let scrollOffset = 0;
  let heightBeforeSelected = 0;

  for (let i = 0; i < selectedIndex; i++) {
    const task = tasks[i];
    const isExpanded = expandedIds.has(task.id);
    heightBeforeSelected += getTaskHeight(task, isExpanded);
  }

  // If selected task would be off screen, adjust scroll
  const selectedTask = tasks[selectedIndex];
  const selectedHeight = selectedTask ? getTaskHeight(selectedTask, expandedIds.has(selectedTask.id)) : 5;

  if (heightBeforeSelected + selectedHeight > viewportHeight) {
    // Need to scroll - start from selected task
    scrollOffset = selectedIndex;
  } else if (heightBeforeSelected > viewportHeight * 0.6) {
    // Selected is in lower part of viewport, scroll to center it a bit
    scrollOffset = Math.max(0, selectedIndex - 2);
  }

  // Build visible items starting from scrollOffset
  const visibleItems: { task: Task; isSelected: boolean; isExpanded: boolean }[] = [];
  let linesUsed = 0;

  for (let i = scrollOffset; i < tasks.length; i++) {
    const task = tasks[i];
    const isSelected = i === selectedIndex;
    const isExpanded = expandedIds.has(task.id);
    const taskLines = getTaskHeight(task, isExpanded);

    // Always include the selected task, even if it's tall
    if (isSelected) {
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
      continue;
    }

    // For non-selected tasks, check if they fit
    if (linesUsed + taskLines <= viewportHeight) {
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
    } else if (linesUsed > 0) {
      // We have items and this one doesn't fit, stop
      break;
    }
  }

  // Calculate remaining empty lines to fill viewport
  const emptyLines = Math.max(0, viewportHeight - linesUsed);

  if (tasks.length === 0) {
    return (
      <Box flexGrow={1} flexDirection="column" paddingLeft={2}>
        <Text color={PALETTE.textMuted} dimColor>No tasks in this column</Text>
        {/* Fill remaining space */}
        {Array.from({ length: viewportHeight - 1 }).map((_, i) => (
          <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingLeft={1}>
      {visibleItems.map(({ task, isSelected, isExpanded }) => (
        <TaskCard
          key={task.id}
          task={task}
          isSelected={isSelected}
          isExpanded={isExpanded}
          width={cardWidth}
        />
      ))}
      {/* Fill remaining viewport space with empty lines */}
      {Array.from({ length: emptyLines }).map((_, i) => (
        <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
      ))}
    </Box>
  );
}
