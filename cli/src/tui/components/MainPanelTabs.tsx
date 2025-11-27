import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';
import type { MainPanel } from '../types.js';

export interface MainPanelTabsProps {
  activePanel: MainPanel;
  rulesCount: number;
  archiveCount: number;
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

export function MainPanelTabs({ activePanel, rulesCount, archiveCount }: MainPanelTabsProps) {
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
        label="Archive"
        shortcut="3"
        isActive={activePanel === 'archive'}
        count={archiveCount}
      />
    </Box>
  );
}
