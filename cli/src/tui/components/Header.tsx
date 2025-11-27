import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, BOX, ICONS } from '../theme.js';

export interface HeaderProps {
  title: string;
  stats: { total: number; done: number; percentage: number };
  reloadFlash: boolean;
}

export function Header({ title, reloadFlash }: HeaderProps) {
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
