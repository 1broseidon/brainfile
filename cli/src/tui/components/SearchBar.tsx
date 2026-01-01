import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, ICONS } from '../theme.js';

export interface SearchBarProps {
  query: string;
  width: number;
  showHints?: boolean;
}

export function SearchBar({ query, width, showHints = true }: SearchBarProps) {
  const inputWidth = Math.min(width - 6, 60);
  const displayQuery = query.padEnd(inputWidth, ' ').slice(0, inputWidth);

  // Show hints when query is empty
  const showFilterHints = showHints && query.length === 0;

  return (
    <Box flexDirection="column" paddingLeft={1} marginTop={0}>
      <Box>
        <Text color={PALETTE.accent}>{ICONS.search} </Text>
        <Text color={PALETTE.text} backgroundColor={PALETTE.bgHighlight}> {displayQuery} </Text>
      </Box>
      {showFilterHints && (
        <Box marginTop={0} marginLeft={3}>
          <Text color={PALETTE.textMuted}>
            <Text color={PALETTE.textDim}>filters: </Text>
            <Text color={PALETTE.textSecondary}>p:</Text>
            <Text color={PALETTE.textDim}>priority </Text>
            <Text color={PALETTE.textSecondary}>#</Text>
            <Text color={PALETTE.textDim}>tag </Text>
            <Text color={PALETTE.textSecondary}>@</Text>
            <Text color={PALETTE.textDim}>assignee </Text>
            <Text color={PALETTE.textSecondary}>due:</Text>
            <Text color={PALETTE.textDim}>overdue|today|week </Text>
            <Text color={PALETTE.textSecondary}>contract:</Text>
            <Text color={PALETTE.textDim}>ready|in_progress|delivered|done|failed</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
