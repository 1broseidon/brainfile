import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';
import { truncate } from '../utils.js';
import type { BoardColumn } from '../types.js';

export interface ColumnTabsProps {
  columns: BoardColumn[];
  activeIndex: number;
  termWidth: number;
}

export function ColumnTabs({ columns, activeIndex, termWidth }: ColumnTabsProps) {
  if (columns.length === 0) {
    return (
      <Box paddingLeft={1} paddingRight={1} marginTop={1}>
        <Text color={PALETTE.textMuted}>No columns</Text>
      </Box>
    );
  }

  const maxTabWidth = Math.floor((termWidth - 4) / Math.max(columns.length, 1)) - 2;

  return (
    <Box paddingLeft={1} paddingRight={1} marginTop={1}>
      {columns.map((col, idx) => {
        const isActive = idx === activeIndex;
        const label = truncate(col.title.toUpperCase(), maxTabWidth - 4);
        const count = col.tasks.length;

        return (
          <Box key={col.id} marginRight={1}>
            {isActive ? (
              <Text>
                <Text color={PALETTE.accent}>▌</Text>
                <Text color={PALETTE.text} bold backgroundColor={PALETTE.bgHighlight}>{` ${label} `}</Text>
                <Text color={PALETTE.accent} bold>{` ${count}`}</Text>
              </Text>
            ) : (
              <Text>
                <Text color={PALETTE.textDim}>{' '}</Text>
                <Text color={PALETTE.textMuted}>{` ${label} `}</Text>
                <Text color={PALETTE.textDim}>{` ${count}`}</Text>
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
