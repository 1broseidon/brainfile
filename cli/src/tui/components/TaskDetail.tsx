import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE } from '../theme.js';

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

export interface TaskDetailProps {
  task: Task;
  allTasks?: Task[];
  /** Optional top spacing before the detail block */
  marginTop?: number;
}

/**
 * TaskDetail - detail sections shown when a task card is expanded.
 */
export function TaskDetail({ task, allTasks = [], marginTop = 0 }: TaskDetailProps) {
  const parentId = (task as Task & { parentId?: string }).parentId;
  const children = allTasks.filter(t => {
    const candidateParentId = (t as Task & { parentId?: string }).parentId;
    return candidateParentId === task.id && t.id !== task.id;
  });
  const isAdr = (task.type || 'task').toLowerCase() === 'adr';
  const adrStatus = isAdr ? (task as Task & { status?: string }).status : undefined;

  const hasParentOrChildren = Boolean(parentId) || children.length > 0;
  const hasContract = Boolean(task.contract);
  const hasAdrStatus = Boolean(adrStatus);

  if (!hasParentOrChildren && !hasContract && !hasAdrStatus) {
    return null;
  }

  const status = task.contract?.status;
  const deliverablesCount = task.contract?.deliverables?.length ?? 0;

  return (
    <Box flexDirection="column" marginTop={marginTop}>
      {parentId && (
        <Text>
          <Text color={PALETTE.textDim}>Parent: </Text>
          <Text color={PALETTE.textSecondary}>{parentId}</Text>
        </Text>
      )}

      {children.length > 0 && (
        <Text>
          <Text color={PALETTE.textDim}>Children: </Text>
          <Text color={PALETTE.textSecondary}>[{children.map(c => c.id).join(', ')}]</Text>
        </Text>
      )}

      {hasAdrStatus && (
        <Text>
          <Text color={PALETTE.textDim}>Status: </Text>
          <Text color={PALETTE.textSecondary}>{adrStatus}</Text>
        </Text>
      )}

      {hasContract && (
        <>
          {(parentId || children.length > 0 || hasAdrStatus) && <Box marginTop={1} />}
          <Text color={PALETTE.textDim} bold>Contract</Text>
          <Text>
            <Text color={PALETTE.textDim}>Status: </Text>
            <Text color={getContractStatusColor(status!)} bold>{status}</Text>
          </Text>
          <Text>
            <Text color={PALETTE.textDim}>Deliverables: </Text>
            <Text color={PALETTE.textSecondary}>{deliverablesCount}</Text>
          </Text>
        </>
      )}
    </Box>
  );
}
