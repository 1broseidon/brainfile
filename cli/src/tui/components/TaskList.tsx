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
  // Calculate scroll offset to keep selection visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(viewportHeight / 3),
      Math.max(0, tasks.length - Math.floor(viewportHeight / 2))
    )
  );

  const cardWidth = termWidth - 4;

  // Build visible items with expansion
  const visibleItems: { task: Task; isSelected: boolean; isExpanded: boolean }[] = [];
  let linesUsed = 0;

  for (let i = scrollOffset; i < tasks.length && linesUsed < viewportHeight; i++) {
    const task = tasks[i];
    const isSelected = i === selectedIndex;
    const isExpanded = expandedIds.has(task.id);

    // Calculate how many lines this task will take with rounded border card
    // Base: top border(1) + title(1) + metadata(1) + bottom border(1) + margin(1) = 5
    const subtaskLines = isExpanded ? Math.min((task.subtasks?.length || 0), 5) : 0;
    const hasDescription = isExpanded && task.description;
    const hasFiles = isExpanded && task.relatedFiles?.length;
    const expandedLines = isExpanded ? 1 + (hasDescription ? 2 : 0) + subtaskLines + (hasFiles ? 2 : 0) : 0;
    const taskLines = 5 + expandedLines;

    if (linesUsed + taskLines <= viewportHeight) {
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
    } else if (visibleItems.length === 0) {
      // Always show at least one item
      visibleItems.push({ task, isSelected, isExpanded });
      linesUsed += taskLines;
      break;
    } else {
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
