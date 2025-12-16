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
  /** Optional top spacing before the detail block */
  marginTop?: number;
}

/**
 * TaskDetail - detail sections shown when a task card is expanded.
 *
 * Display-only: contract info is shown only when the task has a contract.
 */
export function TaskDetail({ task, marginTop = 0 }: TaskDetailProps) {
  if (!task.contract) return null;

  const status = task.contract.status;
  const deliverablesCount = task.contract.deliverables?.length ?? 0;

  return (
    <Box flexDirection="column" marginTop={marginTop}>
      <Text color={PALETTE.textDim} bold>Contract</Text>
      <Text>
        <Text color={PALETTE.textDim}>Status: </Text>
        <Text color={getContractStatusColor(status)} bold>{status}</Text>
      </Text>
      <Text>
        <Text color={PALETTE.textDim}>Deliverables: </Text>
        <Text color={PALETTE.textSecondary}>{deliverablesCount}</Text>
      </Text>
    </Box>
  );
}

