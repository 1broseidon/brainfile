import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, ICONS } from '../theme.js';
import type { ViewMode, MainPanel } from '../types.js';

export interface StatusBarProps {
  mode: ViewMode;
  columnName: string;
  taskIndex: number;
  taskCount: number;
  termWidth: number;
  isWatching?: boolean;
  activePanel?: MainPanel;
}

export function StatusBar({ mode, columnName, taskIndex, taskCount, termWidth, isWatching = true, activePanel = 'tasks' }: StatusBarProps) {
  // Determine TAB hint based on panel
  const tabHint = activePanel === 'tasks' ? ' column  ' : activePanel === 'rules' ? ' type  ' : null;

  // Left section: essential commands with subtle styling
  const leftCommands = mode === 'search' ? (
    <Text color={PALETTE.textMuted}>
      <Text color={PALETTE.warning}>ESC</Text>
      <Text>{' cancel'}</Text>
    </Text>
  ) : (
    <Text color={PALETTE.textMuted}>
      <Text color={PALETTE.textSecondary}>?</Text>
      <Text>{' help  '}</Text>
      {tabHint && (
        <>
          <Text color={PALETTE.textSecondary}>TAB</Text>
          <Text>{tabHint}</Text>
        </>
      )}
      <Text color={PALETTE.textSecondary}>q</Text>
      <Text>{' quit'}</Text>
    </Text>
  );

  // Middle section: column and position
  const position = taskCount > 0 ? `${taskIndex}/${taskCount}` : null;

  return (
    <Box flexDirection="column" width={termWidth}>
      {/* Main status row */}
      <Box width={termWidth - 2} paddingLeft={1} paddingRight={1}>
        {/* Left: Essential commands */}
        {leftCommands}

        {/* Flexible spacer */}
        <Box flexGrow={1} />

        {/* Center: Column and position */}
        {columnName ? (
          <Text>
            <Text color={PALETTE.textSecondary}>{columnName.toUpperCase()}</Text>
            {position ? <Text color={PALETTE.accent} bold>{` ${position}`}</Text> : null}
          </Text>
        ) : null}

        {/* Flexible spacer */}
        <Box flexGrow={1} />

        {/* Right: Status indicator */}
        {isWatching ? (
          <Text color={PALETTE.success}>
            <Text>{ICONS.live}</Text>
            <Text dimColor>{' live'}</Text>
          </Text>
        ) : null}
      </Box>

      {/* Bottom padding row */}
      <Box paddingLeft={1}>
        <Text>{' '}</Text>
      </Box>
    </Box>
  );
}
