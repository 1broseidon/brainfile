/**
 * TaskCard - Linear-style modern minimal (borderless)
 *
 * Design principles:
 * 1. No borders - clean, fast scanning
 * 2. Selected indicator ▌ matches column tabs
 * 3. Priority badge leads the title row
 * 4. Meta row indented to align with title
 * 5. Consistent visual language (█░ progress, · separators)
 */
import React from 'react';
import { Box, Text, Spacer } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE, ICONS } from '../theme.js';
import { truncate, getPriorityColor } from '../utils.js';
import { wrapText } from './TaskCardMeasure.js';
import { TaskDetail } from './TaskDetail.js';

export interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isExpanded: boolean;
  width: number;
  allTasks?: Task[];
  /** Hide tags in meta row when collapsed (for narrow/stacked mode) */
  hideTagsWhenCollapsed?: boolean;
  /** Show contract badge in the title row (tasks with contracts only) */
  showContractBadge?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

/** Priority badge - compact colored label */
function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;

  const color = getPriorityColor(priority);
  const abbrev: Record<string, string> = {
    low: 'LOW',
    medium: 'MED',
    high: 'HIGH',
    critical: 'CRIT',
  };
  const label = abbrev[priority.toLowerCase()] || priority.toUpperCase().slice(0, 4);

  return (
    <Text color="black" backgroundColor={color} bold>
      {` ${label} `}
    </Text>
  );
}

function getTypeBadgeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'epic':
      return 'cyan';
    case 'adr':
      return 'yellow';
    default:
      return 'gray';
  }
}

function getTypeBadgeLabel(type?: string): string | null {
  if (!type) return null;
  const normalized = type.toLowerCase();
  if (normalized === 'task') return null;
  return `[${normalized}]`;
}

/** Type badge for non-default task types */
function TypeBadge({ type }: { type?: string }) {
  const label = getTypeBadgeLabel(type);
  if (!label) return null;

  return <Text color={getTypeBadgeColor(type!)}>{label}</Text>;
}

/** Compact bracketed progress count [X/Y] */
function SubtaskCount({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null;

  const allDone = completed === total;
  const color = allDone ? PALETTE.success : PALETTE.textSecondary;

  return (
    <Text color={color}>[{completed}/{total}]</Text>
  );
}

/** Due date with urgency coloring */
function DueDate({ dueDate }: { dueDate?: string }) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const getColor = () => {
    if (diffDays < 0) return PALETTE.error;
    if (diffDays <= 2) return PALETTE.warning;
    return PALETTE.textSecondary;
  };

  const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const icon = diffDays < 0 ? ` ${ICONS.warning}` : '';

  return (
    <Text color={getColor()}>
      {formatted}{icon}
    </Text>
  );
}

/** Tags display - compact inline */
function Tags({ tags, maxTags = 2 }: { tags?: string[]; maxTags?: number }) {
  if (!tags || tags.length === 0) return null;

  const visible = tags.slice(0, maxTags);
  const remaining = tags.length - maxTags;

  return (
    <Text color={PALETTE.textMuted}>
      {visible.map((t, i) => (
        <Text key={t}>
          <Text color={PALETTE.textSecondary}>#{t}</Text>
          {i < visible.length - 1 && ' '}
        </Text>
      ))}
      {remaining > 0 && <Text color={PALETTE.textDim}> +{remaining}</Text>}
    </Text>
  );
}

/** Separator dot */
function Sep() {
  return <Text color={PALETTE.textDim}> · </Text>;
}

function getContractStatusColor(status: string) {
  switch (status) {
    case 'done':
      return PALETTE.success;
    case 'in_progress':
      return PALETTE.warning;
    case 'failed':
      return PALETTE.error;
    default:
      return PALETTE.textMuted;
  }
}

// ============================================================================
// Main TaskCard Component
// ============================================================================

export function TaskCard({
  task,
  isSelected,
  isExpanded,
  width,
  allTasks = [],
  hideTagsWhenCollapsed = false,
  showContractBadge = true,
}: TaskCardProps) {
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const parentId = (task as Task & { parentId?: string }).parentId;

  // Indicator width: "  ▌ " = 4 chars for selected, "    " = 4 chars for not
  const indicatorWidth = 4;
  const contentWidth = width - indicatorWidth - 2; // -2 for right padding

  // Build meta segments for row 2
  // Order: parent -> date -> tags
  const metaSegments: React.ReactNode[] = [];

  if (parentId) {
    metaSegments.push(
      <Text key="parent" color={PALETTE.textDim}>Child of: {parentId}</Text>
    );
  }

  if (task.dueDate) {
    metaSegments.push(<DueDate key="due" dueDate={task.dueDate} />);
  }

  // Only show tags when expanded, or when not hiding tags in collapsed state
  if (task.tags && task.tags.length > 0 && (isExpanded || !hideTagsWhenCollapsed)) {
    metaSegments.push(<Tags key="tags" tags={task.tags} maxTags={3} />);
  }

  // Join meta segments with separators
  const metaContent: React.ReactNode[] = [];
  metaSegments.forEach((seg, i) => {
    if (i > 0) metaContent.push(<Sep key={`sep-${i}`} />);
    metaContent.push(seg);
  });

  // Calculate title width (account for priority badge, type badge, subtask count, contract badge)
  const priorityWidth = task.priority ? 7 : 0; // " HIGH " = 6 + 1 space
  const typeBadgeLabel = getTypeBadgeLabel(task.type);
  const typeBadgeWidth = typeBadgeLabel ? typeBadgeLabel.length + 1 : 0; // +1 for trailing space

  // Estimate subtask width: "[10/10]" = 7 chars, plus padding
  const subtaskLabelWidth = subtasks.length > 0 ? 9 : 0;

  const contractBadgeText = showContractBadge && task.contract ? `[C:${task.contract.status}]` : null;
  const contractBadgeWidth = contractBadgeText ? contractBadgeText.length + 1 : 0; // +1 for leading space

  const titleWidth = contentWidth - priorityWidth - typeBadgeWidth - subtaskLabelWidth - contractBadgeWidth;

  return (
    <Box flexDirection="column" width={width}>
      {/* Row 1: Indicator + Priority + Type + Title */}
      <Box>
        <Text color={isSelected ? PALETTE.accent : PALETTE.textDim}>
          {isSelected ? '  ▌ ' : '    '}
        </Text>
        {task.priority && (
          <>
            <PriorityBadge priority={task.priority} />
            <Text> </Text>
          </>
        )}
        {typeBadgeLabel && (
          <>
            <TypeBadge type={task.type} />
            <Text> </Text>
          </>
        )}
        <Text color={isSelected ? PALETTE.text : PALETTE.textSecondary} bold={isSelected}>
          {truncate(task.title, titleWidth)}
        </Text>
        {contractBadgeText && (
          <>
            <Text> </Text>
            <Text color={getContractStatusColor(task.contract!.status)}>[C:{task.contract!.status}]</Text>
          </>
        )}
        {subtasks.length > 0 && (
          <>
            <Text> </Text>
            <SubtaskCount completed={completedSubtasks} total={subtasks.length} />
          </>
        )}
      </Box>

      {/* Row 2: Indented meta + ID */}
      <Box width={width} marginTop={0}>
        <Text>{'    '}</Text>
        {metaContent.length > 0 ? (
          <Box>{metaContent}</Box>
        ) : null}
        <Spacer />
        <Text color={PALETTE.textDim}>{task.id}</Text>
      </Box>

      {/* Expanded content */}
      {isExpanded && (
        <Box flexDirection="column" marginTop={1} marginLeft={4}>
          {/* Description */}
          {task.description && (
            <Box flexDirection="column">
              {wrapText(task.description, contentWidth - 4).slice(0, 3).map((line, i) => (
                <Text key={i} color={PALETTE.textSecondary}>{truncate(line, contentWidth - 4)}</Text>
              ))}
              {wrapText(task.description, contentWidth - 4).length > 3 && (
                <Text color={PALETTE.textDim}>…</Text>
              )}
            </Box>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <Box flexDirection="column" marginTop={task.description ? 1 : 0}>
              {subtasks.slice(0, 5).map((st, i) => (
                <Text key={i} color={st.completed ? PALETTE.success : PALETTE.textSecondary}>
                  {st.completed ? ICONS.success : '○'} {truncate(st.title, contentWidth - 6)}
                </Text>
              ))}
              {subtasks.length > 5 && (
                <Text color={PALETTE.textDim}>  +{subtasks.length - 5} more</Text>
              )}
            </Box>
          )}

          {/* Related files */}
          {task.relatedFiles && task.relatedFiles.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {task.relatedFiles.slice(0, 3).map((file, i) => {
                const fileName = file.split('/').pop() || file;
                return (
                  <Text key={i}>
                    <Text color={PALETTE.textDim}>→ </Text>
                    <Text color={PALETTE.accentAlt}>{truncate(fileName, contentWidth - 6)}</Text>
                  </Text>
                );
              })}
              {task.relatedFiles.length > 3 && (
                <Text color={PALETTE.textDim}>  +{task.relatedFiles.length - 3} more</Text>
              )}
            </Box>
          )}

          {/* Parent/children/ADR/contract details */}
          <TaskDetail
            task={task}
            allTasks={allTasks}
            marginTop={(task.description || subtasks.length > 0 || (task.relatedFiles && task.relatedFiles.length > 0)) ? 1 : 0}
          />
        </Box>
      )}
    </Box>
  );
}
