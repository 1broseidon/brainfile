/**
 * The v3 board list: a fixed-height window of one-line document rows.
 *
 * Because every row is exactly one line, viewport scrolling is plain arithmetic
 * on the selected index — the v2 variable-height card measurement (and the
 * expand/collapse state that fed it) is gone.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { DocRow } from '../rows.js';
import { windowRows } from '../rows.js';
import { PALETTE } from '../theme.js';
import { DocumentRow } from './DocumentRow.js';

export interface DocumentListProps {
  rows: DocRow[];
  selectedIndex: number;
  viewportHeight: number;
  width: number;
  /** Rows are archived docs (`done` stop) — titles render muted (§B2). */
  archived?: boolean;
  /** Shown instead of rows when the column (or the filter result) is empty. */
  emptyMessage?: string;
}

export function DocumentList({
  rows,
  selectedIndex,
  viewportHeight,
  width,
  archived = false,
  emptyMessage = 'No documents',
}: DocumentListProps) {
  if (rows.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
        <Text color={PALETTE.textMuted}>{emptyMessage}</Text>
      </Box>
    );
  }

  const { visible, start } = windowRows(rows, selectedIndex, viewportHeight);
  const idWidth = Math.max(6, ...visible.map((row) => row.task.id.length));

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visible.map((row, index) => (
        <DocumentRow
          key={row.task.id}
          row={row}
          selected={start + index === selectedIndex}
          width={width}
          idWidth={idWidth}
          archived={archived}
        />
      ))}
    </Box>
  );
}
