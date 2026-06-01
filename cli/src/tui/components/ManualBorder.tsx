/**
 * ManualBorder - Bordered container with exact dimension control
 *
 * Renders borders using box-drawing characters (╭╮╰╯│─) for complete
 * control over dimensions. Unlike Ink's borderStyle, this guarantees
 * exact line counts and prevents content overflow.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';

export interface ManualBorderProps {
  /** Total width including borders */
  width: number;
  /** Border color */
  borderColor?: string;
  /** Whether to show separator line (for expanded cards) */
  separatorAfterLine?: number;
  /** Content rows to render inside the border */
  children: React.ReactNode[];
}

/**
 * Renders a bordered container with manual box-drawing characters.
 *
 * Layout:
 * ╭─────────────────────────╮  <- top border
 * │ content line 1          │  <- content rows
 * │ content line 2          │
 * │─────────────────────────│  <- optional separator
 * │ content line 3          │
 * ╰─────────────────────────╯  <- bottom border
 */
export function ManualBorder({
  width,
  borderColor = PALETTE.border,
  separatorAfterLine,
  children,
}: ManualBorderProps) {
  // Inner width is total width minus 2 border characters
  const innerWidth = Math.max(width - 2, 1);

  // Convert children to array for iteration
  const rows = React.Children.toArray(children);

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Text color={borderColor}>
        {'╭'}{'─'.repeat(innerWidth)}{'╮'}
      </Text>

      {/* Content rows with side borders */}
      {rows.map((child, index) => (
        <React.Fragment key={index}>
          <Box>
            <Text color={borderColor}>{'│'}</Text>
            <Box width={innerWidth}>{child}</Box>
            <Text color={borderColor}>{'│'}</Text>
          </Box>
          {/* Separator line if specified */}
          {separatorAfterLine === index && (
            <Text color={borderColor}>
              {'├'}{'─'.repeat(innerWidth)}{'┤'}
            </Text>
          )}
        </React.Fragment>
      ))}

      {/* Bottom border */}
      <Text color={borderColor}>
        {'╰'}{'─'.repeat(innerWidth)}{'╯'}
      </Text>
    </Box>
  );
}

/**
 * A single row inside a ManualBorder.
 * Handles padding and ensures content fits within available width.
 */
export interface BorderRowProps {
  /** Content to render */
  children: React.ReactNode;
  /** Horizontal padding (applied to both sides) */
  paddingX?: number;
}

export function BorderRow({ children, paddingX = 1 }: BorderRowProps) {
  return (
    <Box paddingX={paddingX}>
      {children}
    </Box>
  );
}
