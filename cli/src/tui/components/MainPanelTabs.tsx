import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';
import type { MainPanel, LayoutMode } from '../types.js';

export interface MainPanelTabsProps {
  activePanel: MainPanel;
  rulesCount: number;
  logsCount: number;
  layoutMode?: LayoutMode;
}

interface TabProps {
  label: string;
  shortcut: string;
  isActive: boolean;
  count?: number;
}

function Tab({ label, shortcut, isActive, count }: TabProps) {
  // Match ColumnTabs visual style exactly
  if (isActive) {
    return (
      <Box marginRight={1}>
        <Text>
          <Text color={PALETTE.accent}>▌</Text>
          <Text color={PALETTE.text} bold backgroundColor={PALETTE.bgHighlight}>
            {` `}<Text color={PALETTE.accent}>{shortcut}</Text>{` ${label} `}
          </Text>
          {count !== undefined && count > 0 && (
            <Text color={PALETTE.accent} bold>{` (${count})`}</Text>
          )}
        </Text>
      </Box>
    );
  }

  return (
    <Box marginRight={1}>
      <Text>
        <Text color={PALETTE.textDim}>{' '}</Text>
        <Text color={PALETTE.textMuted}>
          {` `}<Text color={PALETTE.textDim}>{shortcut}</Text>{` ${label} `}
        </Text>
        {count !== undefined && count > 0 && (
          <Text color={PALETTE.textDim}>{` (${count})`}</Text>
        )}
      </Text>
    </Box>
  );
}

/** Compact tab for narrow mode - just shows shortcut hint */
function CompactTab({ label, shortcut, isActive, count }: TabProps) {
  return (
    <Text>
      <Text color={isActive ? PALETTE.accent : PALETTE.textDim} bold={isActive}>
        {shortcut}
      </Text>
      <Text color={isActive ? PALETTE.text : PALETTE.textMuted}>
        {label.charAt(0)}
      </Text>
      {count !== undefined && count > 0 && (
        <Text color={PALETTE.textDim}>({count})</Text>
      )}
      <Text>{' '}</Text>
    </Text>
  );
}

export function MainPanelTabs({ activePanel, rulesCount, logsCount, layoutMode = 'wide' }: MainPanelTabsProps) {
  // Narrow mode: compact single-line format
  if (layoutMode === 'narrow') {
    return (
      <Box paddingLeft={1} marginTop={1}>
        <CompactTab label="Tasks" shortcut="1" isActive={activePanel === 'tasks'} />
        <CompactTab label="Rules" shortcut="2" isActive={activePanel === 'rules'} count={rulesCount} />
        <CompactTab label="Logs" shortcut="3" isActive={activePanel === 'logs'} count={logsCount} />
      </Box>
    );
  }

  // Wide mode: full tabs
  return (
    <Box paddingLeft={1} paddingRight={1} marginTop={1}>
      <Tab
        label="Tasks"
        shortcut="1"
        isActive={activePanel === 'tasks'}
      />
      <Tab
        label="Rules"
        shortcut="2"
        isActive={activePanel === 'rules'}
        count={rulesCount}
      />
      <Tab
        label="Logs"
        shortcut="3"
        isActive={activePanel === 'logs'}
        count={logsCount}
      />
    </Box>
  );
}
