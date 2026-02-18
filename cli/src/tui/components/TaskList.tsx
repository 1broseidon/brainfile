import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE } from '../theme.js';
import { TaskCard } from './TaskCard.js';
import { getTaskCardHeight } from './TaskCardMeasure.js';

export interface TaskListProps {
  tasks: Task[];
  allTasks?: Task[];
  selectedIndex: number;
  expandedIds: Set<string>;
  viewportHeight: number;
  termWidth: number;
}

export function TaskList({ tasks, allTasks = [], selectedIndex, expandedIds, viewportHeight, termWidth }: TaskListProps) {
  const cardWidth = termWidth - 4;
  const contentWidth = cardWidth - 6; // indicator (4) + right padding (2) = 6

  // Calculate scroll offset - ensure selected task is visible
  // Start from selected task and work backwards to find scroll position
  let scrollOffset = 0;
  let heightBeforeSelected = 0;

  for (let i = 0; i < selectedIndex; i++) {
    const task = tasks[i];
    const isExpanded = expandedIds.has(task.id);
    heightBeforeSelected += getTaskCardHeight(task, isExpanded, contentWidth, allTasks);
  }

  // If selected task would be off screen, adjust scroll
  const selectedTask = tasks[selectedIndex];
  const selectedHeight = selectedTask
    ? getTaskCardHeight(selectedTask, expandedIds.has(selectedTask.id), contentWidth, allTasks)
    : 5;

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
    const taskLines = getTaskCardHeight(task, isExpanded, contentWidth, allTasks);

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
      <Box flexDirection="column" paddingLeft={2} height={viewportHeight}>
        <Text color={PALETTE.textMuted} dimColor>No tasks in this column</Text>
        {/* Fill remaining space */}
        {Array.from({ length: viewportHeight - 1 }).map((_, i) => (
          <Box key={`empty-${i}`}><Text>{' '}</Text></Box>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1} height={viewportHeight}>
      {visibleItems.map(({ task, isSelected, isExpanded }, index) => (
        <React.Fragment key={task.id}>
          {index > 0 && <Box height={1} />}
          <TaskCard
            task={task}
            allTasks={allTasks}
            isSelected={isSelected}
            isExpanded={isExpanded}
            width={cardWidth}
            showContractBadge={true}
          />
        </React.Fragment>
      ))}
      {/* Fill remaining viewport space */}
      {emptyLines > 0 && <Box height={emptyLines} />}
    </Box>
  );
}
