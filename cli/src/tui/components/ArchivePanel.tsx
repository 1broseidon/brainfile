import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE, BOX, ICONS } from '../theme.js';
import { truncate, getPriorityColor } from '../utils.js';
import type { BoardColumn, LayoutMode } from '../types.js';

export interface ArchivePanelProps {
  archive: Task[];
  selectedIndex: number;
  viewportHeight: number;
  termWidth: number;
  expandedIds: Set<string>;
  mode: string;
  columns: BoardColumn[];
  restoreColumnIndex: number;
  layoutMode?: LayoutMode;
}

export function ArchivePanel({
  archive,
  selectedIndex,
  viewportHeight,
  termWidth,
  expandedIds,
  mode,
  columns,
  restoreColumnIndex,
  layoutMode = 'wide',
}: ArchivePanelProps) {
  const maxWidth = Math.max(termWidth - 8, 20);

  // Calculate scroll offset
  const scrollPadding = 2;
  const headerRows = layoutMode === 'narrow' ? 4 : 6;
  const visibleTasks = Math.max(viewportHeight - headerRows, 3);
  let scrollOffset = 0;
  if (selectedIndex >= visibleTasks - scrollPadding) {
    scrollOffset = Math.min(
      selectedIndex - visibleTasks + scrollPadding + 1,
      Math.max(0, archive.length - visibleTasks)
    );
  }

  const selectedTask = archive[selectedIndex];

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header with count and instructions */}
      <Box marginBottom={1}>
        <Text color={PALETTE.textSecondary}>
          {archive.length} archived{layoutMode === 'wide' ? ` task${archive.length !== 1 ? 's' : ''}` : ''}
        </Text>
        {layoutMode === 'wide' && (
          <Box marginLeft={2}>
            <Text color={PALETTE.textMuted}>
              <Text color={PALETTE.textSecondary}>j/k</Text> select{' '}
              <Text color={PALETTE.textSecondary}>Enter</Text> expand{' '}
              <Text color={PALETTE.textSecondary}>R</Text> restore{' '}
              <Text color={PALETTE.textSecondary}>d</Text> delete
            </Text>
          </Box>
        )}
      </Box>

      {/* Separator */}
      <Box>
        <Text color={PALETTE.border}>{BOX.horizontal.repeat(Math.max(1, termWidth - 4))}</Text>
      </Box>

      {/* Restore mode: column picker */}
      {mode === 'archive-restore' && selectedTask && (
        <Box flexDirection="column" marginY={1}>
          <Text color={PALETTE.accent}>
            Restore "<Text color={PALETTE.text}>{truncate(selectedTask.title, 30)}</Text>" to:
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {columns.map((col, idx) => (
              <Box key={col.id}>
                <Text
                  color={idx === restoreColumnIndex ? PALETTE.text : PALETTE.textMuted}
                  backgroundColor={idx === restoreColumnIndex ? PALETTE.bgHighlight : undefined}
                  bold={idx === restoreColumnIndex}
                >
                  {idx === restoreColumnIndex ? ICONS.pointer : ' '} {col.title}
                  <Text color={PALETTE.textDim}> ({col.tasks.length})</Text>
                </Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={PALETTE.textMuted}>
              j/k to select, Enter to restore, Esc to cancel
            </Text>
          </Box>
        </Box>
      )}

      {/* Delete confirmation */}
      {mode === 'archive-delete-confirm' && selectedTask && (
        <Box flexDirection="column" marginY={1} paddingX={1}>
          <Text color={PALETTE.error} bold>
            Permanently delete this task?
          </Text>
          <Box marginTop={1}>
            <Text color={PALETTE.textSecondary}>
              {selectedTask.id}: {truncate(selectedTask.title, maxWidth - 15)}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={PALETTE.warning}>This cannot be undone.</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={PALETTE.textMuted}>
              Press <Text color={PALETTE.success}>y</Text> to confirm, <Text color={PALETTE.error}>n</Text> to cancel
            </Text>
          </Box>
        </Box>
      )}

      {/* Archive list */}
      {mode !== 'archive-restore' && mode !== 'archive-delete-confirm' && (
        <Box flexDirection="column" marginTop={1}>
          {archive.length === 0 ? (
            <Box paddingY={1}>
              <Text color={PALETTE.textMuted}>No archived tasks.</Text>
            </Box>
          ) : (
            archive.slice(scrollOffset, scrollOffset + visibleTasks).map((task, displayIdx) => {
              const actualIdx = scrollOffset + displayIdx;
              const isSelected = actualIdx === selectedIndex;
              const isExpanded = expandedIds.has(task.id);

              return (
                <Box key={task.id} flexDirection="column" paddingY={0}>
                  {/* Task header */}
                  <Box>
                    <Text
                      color={isSelected ? PALETTE.text : PALETTE.textSecondary}
                      backgroundColor={isSelected ? PALETTE.bgHighlight : undefined}
                      bold={isSelected}
                    >
                      {isSelected ? ICONS.pointer : ' '}{' '}
                      {isExpanded ? ICONS.expanded : ICONS.collapsed}{' '}
                      <Text color={PALETTE.textDim}>{task.id}</Text>
                      {' '}{truncate(task.title, maxWidth - task.id.length - 8)}
                      {task.priority && (
                        <Text color={getPriorityColor(task.priority)}> [{task.priority}]</Text>
                      )}
                    </Text>
                  </Box>

                  {/* Expanded details */}
                  {isExpanded && (
                    <Box flexDirection="column" marginLeft={4} marginBottom={1}>
                      {task.description && (
                        <Text color={PALETTE.textMuted}>
                          {truncate(task.description, maxWidth - 6)}
                        </Text>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <Text color={PALETTE.accent}>
                          {task.tags.map(t => `#${t}`).join(' ')}
                        </Text>
                      )}
                      {task.assignee && (
                        <Text color={PALETTE.textSecondary}>
                          @{task.assignee}
                        </Text>
                      )}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <Text color={PALETTE.textMuted}>
                          Subtasks: {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                        </Text>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })
          )}

          {/* Scroll indicator */}
          {archive.length > visibleTasks && (
            <Box marginTop={1}>
              <Text color={PALETTE.textDim}>
                {scrollOffset + 1}-{Math.min(scrollOffset + visibleTasks, archive.length)} of {archive.length}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
