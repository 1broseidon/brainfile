/**
 * TaskCard - Lipgloss-style task card with rounded borders
 *
 * Features:
 * 1. Rounded borders (like Bubbletea/Lipgloss)
 * 2. Better visual hierarchy with consistent spacing
 * 3. Subtle color accents for priority
 * 4. Cleaner metadata display
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE } from '../theme.js';
import { truncate, getPriorityColor } from '../utils.js';

export interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isExpanded: boolean;
  width: number;
}

// Priority badge with background color
function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;

  const color = getPriorityColor(priority);
  const label = priority.toUpperCase().slice(0, 4);

  return (
    <Text color="black" backgroundColor={color} bold>
      {` ${label} `}
    </Text>
  );
}

// Tag pills
function TagPills({ tags, maxTags = 3 }: { tags?: string[]; maxTags?: number }) {
  if (!tags || tags.length === 0) return null;

  return (
    <Box marginLeft={1}>
      {tags.slice(0, maxTags).map((tag, idx) => (
        <Box key={tag} marginRight={idx < Math.min(tags.length, maxTags) - 1 ? 1 : 0}>
          <Text color={PALETTE.textSecondary}>#{tag}</Text>
        </Box>
      ))}
      {tags.length > maxTags && (
        <Text color={PALETTE.textSecondary}> +{tags.length - maxTags}</Text>
      )}
    </Box>
  );
}

// Subtask progress indicator
function SubtaskProgress({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;

  const barWidth = 10;
  const filled = Math.round((completed / total) * barWidth);

  return (
    <Box>
      <Text color={PALETTE.textSecondary}>{'['}</Text>
      {filled > 0 && <Text color={PALETTE.success}>{'█'.repeat(filled)}</Text>}
      {barWidth - filled > 0 && <Text color={PALETTE.textMuted}>{'░'.repeat(barWidth - filled)}</Text>}
      <Text color={PALETTE.textSecondary}>{`] ${completed}/${total}`}</Text>
    </Box>
  );
}

// Due date indicator with color coding
function DueDateBadge({ dueDate }: { dueDate?: string }) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Determine color based on urgency
  const getColor = () => {
    if (diffDays < 0) return PALETTE.error; // Overdue
    if (diffDays <= 2) return PALETTE.warning; // Due soon
    return PALETTE.textSecondary;
  };

  // Format as short date
  const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Text color={getColor()}>
      {diffDays < 0 ? '⚠ ' : '📅 '}{formatted}
    </Text>
  );
}

export function TaskCard({ task, isSelected, isExpanded, width }: TaskCardProps) {
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const borderColor = isSelected ? PALETTE.progress : PALETTE.border;
  const contentWidth = width - 4; // Account for border + padding

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header row: Title + ID */}
      <Box justifyContent="space-between">
        <Box flexShrink={1}>
          <Text color={isSelected ? PALETTE.text : PALETTE.textSecondary} bold={isSelected}>
            {truncate(task.title, contentWidth - task.id.length - 2)}
          </Text>
        </Box>
        <Text color={PALETTE.textMuted}>{task.id}</Text>
      </Box>

      {/* Metadata row: Priority badge + tags + due date */}
      {(task.priority || (task.tags && task.tags.length > 0) || subtasks.length > 0 || task.dueDate) && (
        <Box marginTop={0}>
          <PriorityBadge priority={task.priority} />
          <TagPills tags={task.tags} />
          {subtasks.length > 0 && (
            <Box marginLeft={1}>
              <SubtaskProgress completed={completedSubtasks} total={subtasks.length} />
            </Box>
          )}
          {task.dueDate && (
            <Box marginLeft={1}>
              <DueDateBadge dueDate={task.dueDate} />
            </Box>
          )}
        </Box>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <Box flexDirection="column" marginTop={1}>
          {/* Separator line */}
          {contentWidth > 0 && <Text color={PALETTE.border}>{'─'.repeat(contentWidth)}</Text>}

          {/* Description */}
          {task.description && (
            <Box marginTop={1}>
              <Text color={PALETTE.textSecondary}>
                {truncate(task.description.split('\n')[0], contentWidth)}
              </Text>
            </Box>
          )}

          {/* Subtasks list - show all when expanded */}
          {subtasks.length > 0 && (
            <Box flexDirection="column" marginTop={task.description ? 1 : 0}>
              {subtasks.map((st) => (
                <Box key={st.id}>
                  <Text color={st.completed ? PALETTE.success : PALETTE.textSecondary}>
                    {st.completed ? '✓' : '○'} {truncate(st.title, contentWidth - 2)}
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {/* Related files */}
          {task.relatedFiles && task.relatedFiles.length > 0 && (
            <Box marginTop={1}>
              <Text color={PALETTE.accentAlt}>
                {'📁 '}{truncate(task.relatedFiles.slice(0, 2).join(', '), contentWidth - 3)}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
