import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, ICONS } from '../theme.js';

export interface ProgressBarProps {
  done: number;
  total: number;
  width: number;
}

export function ProgressBar({ done, total, width }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  // Reserve space for: padding + "XX% " + " X of Y complete"
  const textWidth = 20 + String(done).length + String(total).length;
  const barWidth = Math.max(width - textWidth, 20);
  const filled = Math.round((percentage / 100) * barWidth);
  const empty = barWidth - filled;

  // Color the percentage based on completion
  const percentColor = percentage === 100 ? PALETTE.success :
                       percentage >= 50 ? PALETTE.progress :
                       PALETTE.textMuted;

  return (
    <Box paddingLeft={2} paddingTop={1} paddingBottom={1}>
      <Text color={percentColor} bold>{percentage}%</Text>
      <Text color={PALETTE.textMuted}> </Text>
      {filled > 0 && <Text color={PALETTE.success}>{ICONS.progressFilled.repeat(filled)}</Text>}
      {empty > 0 && <Text color={PALETTE.border}>{ICONS.progressEmpty.repeat(empty)}</Text>}
      <Text color={PALETTE.textSecondary}> {done}</Text>
      <Text color={PALETTE.textMuted}>/</Text>
      <Text color={PALETTE.textSecondary}>{total}</Text>
      <Text color={PALETTE.textMuted}> complete</Text>
    </Box>
  );
}
