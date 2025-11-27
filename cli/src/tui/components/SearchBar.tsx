import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, ICONS } from '../theme.js';

export interface SearchBarProps {
  query: string;
  width: number;
}

export function SearchBar({ query, width }: SearchBarProps) {
  const inputWidth = Math.min(width - 6, 60);
  const displayQuery = query.padEnd(inputWidth, ' ').slice(0, inputWidth);

  return (
    <Box paddingLeft={1} marginTop={0}>
      <Text color={PALETTE.accent}>{ICONS.search} </Text>
      <Text color={PALETTE.text} backgroundColor={PALETTE.bgHighlight}> {displayQuery} </Text>
    </Box>
  );
}
