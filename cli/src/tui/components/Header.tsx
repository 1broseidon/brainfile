import React from 'react';
import { Box, Text, Spacer } from 'ink';
import { PALETTE, BOX, ICONS } from '../theme.js';
import type { LayoutMode } from '../types.js';
import { truncate } from '../utils.js';

export interface HeaderProps {
  title: string;
  stats: { total: number; done: number; percentage: number };
  reloadFlash: boolean;
  layoutMode?: LayoutMode;
  termWidth?: number;
}

export function Header({ title, stats, reloadFlash, layoutMode = 'wide', termWidth = 80 }: HeaderProps) {
  // Narrow mode: title + percentage on same line
  if (layoutMode === 'narrow') {
    const percentColor = stats.percentage === 100 ? PALETTE.success :
                         stats.percentage >= 50 ? PALETTE.progress :
                         PALETTE.textMuted;
    // Reserve space for percentage (e.g., "100%") + padding
    const maxTitleWidth = termWidth - 10;
    const displayTitle = truncate(title, maxTitleWidth);

    return (
      <Box paddingLeft={1} paddingRight={1} width={termWidth}>
        <Text color={PALETTE.accent} bold>{BOX.topLeft}{BOX.horizontal}</Text>
        <Text color={PALETTE.text} bold> {displayTitle} </Text>
        {reloadFlash && <Text color={PALETTE.success}>{ICONS.reload}</Text>}
        <Spacer />
        <Text color={percentColor} bold>{stats.percentage}%</Text>
      </Box>
    );
  }

  // Wide mode: just title
  return (
    <Box paddingLeft={1} paddingRight={1}>
      <Text color={PALETTE.accent} bold>{BOX.topLeft}{BOX.horizontal}</Text>
      <Text color={PALETTE.text} bold> {title} </Text>
      {reloadFlash ? (
        <Text color={PALETTE.success}> {ICONS.reload} reloaded</Text>
      ) : null}
    </Box>
  );
}
