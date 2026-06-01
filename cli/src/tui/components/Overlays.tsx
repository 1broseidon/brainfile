/**
 * Overlays - Modal-like UI components for task management
 *
 * - MoveOverlay: Column picker for moving tasks
 * - DeleteConfirmOverlay: Confirmation prompt for deletion
 * - SubtaskOverlay: Subtask picker for toggling completion
 * - StatusMessage: Toast-like feedback messages
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';
import type { StatusMessage as StatusMessageType, BoardColumn } from '../types.js';
import type { Task } from '@brainfile/core';
import { truncate } from '../utils.js';

// Status message toast
export interface StatusMessageProps {
  message: StatusMessageType | null;
}

export function StatusMessageDisplay({ message }: StatusMessageProps) {
  if (!message) return null;

  const color = message.type === 'success'
    ? PALETTE.success
    : message.type === 'error'
    ? PALETTE.error
    : PALETTE.accent;

  const icon = message.type === 'success'
    ? '✓'
    : message.type === 'error'
    ? '✗'
    : '●';

  return (
    <Box paddingLeft={1}>
      <Text color={color}>{icon} {message.text}</Text>
    </Box>
  );
}

// Move overlay - column picker
export interface MoveOverlayProps {
  columns: BoardColumn[];
  selectedIndex: number;
  taskTitle: string;
  termWidth: number;
}

export function MoveOverlay({ columns, selectedIndex, taskTitle, termWidth }: MoveOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={PALETTE.accent}
      paddingX={2}
      paddingY={1}
      marginX={2}
    >
      <Text color={PALETTE.text} bold>Move Task</Text>
      <Text color={PALETTE.textSecondary}>{truncate(taskTitle, termWidth - 10)}</Text>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted}>Select column: </Text>
        <Text color={PALETTE.textSecondary}>{'←/→ or 1-'}{columns.length}</Text>
      </Box>

      <Box marginTop={1}>
        {columns.map((col, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={col.id} marginRight={1}>
              {isSelected ? (
                <Text backgroundColor={PALETTE.accent} color={PALETTE.bg} bold>
                  {` ${idx + 1}:${col.title} `}
                </Text>
              ) : (
                <Text color={PALETTE.textSecondary}>
                  {` ${idx + 1}:${col.title} `}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted}>
          <Text color={PALETTE.success}>ENTER</Text> confirm
          <Text color={PALETTE.warning}> ESC</Text> cancel
        </Text>
      </Box>
    </Box>
  );
}

// Delete confirmation overlay
export interface DeleteConfirmOverlayProps {
  taskId: string;
  taskTitle: string;
  termWidth: number;
}

export function DeleteConfirmOverlay({ taskId, taskTitle, termWidth }: DeleteConfirmOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={PALETTE.error}
      paddingX={2}
      paddingY={1}
      marginX={2}
    >
      <Text color={PALETTE.error} bold>Delete Task?</Text>
      <Box marginTop={1}>
        <Text color={PALETTE.textSecondary}>{truncate(taskTitle, termWidth - 10)}</Text>
        <Text color={PALETTE.textMuted}> ({taskId})</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted}>This action cannot be undone.</Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color={PALETTE.error} bold>Y</Text>
          <Text color={PALETTE.textSecondary}> delete  </Text>
          <Text color={PALETTE.success} bold>N</Text>
          <Text color={PALETTE.textSecondary}> cancel</Text>
        </Text>
      </Box>
    </Box>
  );
}

// New task input overlay
export interface NewTaskOverlayProps {
  title: string;
  columnName: string;
  termWidth: number;
}

export function NewTaskOverlay({ title, columnName, termWidth }: NewTaskOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={PALETTE.accent}
      paddingX={2}
      paddingY={1}
      marginX={2}
    >
      <Text color={PALETTE.text} bold>New Task</Text>
      <Text color={PALETTE.textSecondary}>Adding to {columnName}</Text>

      <Box marginTop={1}>
        <Text color={PALETTE.accent}>{'❯ '}</Text>
        <Text color={title ? PALETTE.text : PALETTE.textMuted}>{title || 'Enter task title...'}</Text>
        <Text color={PALETTE.accent}>{'▌'}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted}>
          <Text color={PALETTE.success}>ENTER</Text> create
          <Text color={PALETTE.warning}> ESC</Text> cancel
        </Text>
      </Box>
    </Box>
  );
}

// Subtask picker overlay
export interface SubtaskOverlayProps {
  task: Task;
  selectedIndex: number;
  termWidth: number;
}

export function SubtaskOverlay({ task, selectedIndex, termWidth }: SubtaskOverlayProps) {
  const subtasks = task.subtasks || [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={PALETTE.accent}
      paddingX={2}
      paddingY={1}
      marginX={2}
    >
      <Text color={PALETTE.text} bold>Toggle Subtask</Text>
      <Text color={PALETTE.textSecondary}>{truncate(task.title, termWidth - 10)}</Text>

      <Box marginTop={1} flexDirection="column">
        {subtasks.map((st, idx) => {
          const isSelected = idx === selectedIndex;
          const checkmark = st.completed ? '✓' : '○';
          const textColor = st.completed ? PALETTE.success : PALETTE.textSecondary;

          return (
            <Box key={st.id}>
              {isSelected ? (
                <Text backgroundColor={PALETTE.bgHighlight}>
                  <Text color={PALETTE.accent}>{'▸ '}</Text>
                  <Text color={textColor}>{checkmark} {truncate(st.title, termWidth - 14)}</Text>
                </Text>
              ) : (
                <Text>
                  <Text color={PALETTE.textDim}>{'  '}</Text>
                  <Text color={textColor}>{checkmark} {truncate(st.title, termWidth - 14)}</Text>
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={PALETTE.textMuted}>
          <Text color={PALETTE.textSecondary}>↑/↓</Text> select
          <Text color={PALETTE.success}> ENTER/SPACE</Text> toggle
          <Text color={PALETTE.warning}> ESC</Text> close
        </Text>
      </Box>
    </Box>
  );
}
