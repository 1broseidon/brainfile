/**
 * Help (design §4.4): one condensed pane, grouped nav / actions / filter,
 * dismissed by any key. The v2 two-variant (wide vs narrow) help is gone — a
 * keymap this small does not need to paginate or reflow.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, RULE } from '../theme.js';
import { truncate } from '../text.js';

export interface HelpOverlayProps {
  termWidth: number;
  termHeight: number;
}

const GROUPS: Array<{ heading: string; rows: Array<[string, string]> }> = [
  {
    heading: 'nav',
    rows: [
      ['j / k  ↑ ↓', 'move selection'],
      ['h / l  tab  ← →', 'cycle column'],
      ['g / G', 'top / bottom'],
      ['ctrl-d / ctrl-u', 'half page'],
      ['↵', 'open detail / child'],
      ['esc', 'back / clear filter'],
      ['t', 'cycle type · done'],
      ['u / d', 'scroll detail body'],
    ],
  },
  {
    heading: 'actions',
    rows: [
      ['a', 'add (title only)'],
      ['m', 'move to column'],
      ['c', 'complete'],
      ['e', 'edit file in $EDITOR'],
      ['N', 'new doc in $EDITOR'],
      ['p', 'cycle priority / parent'],
      ['space', 'collapse row / toggle subtask'],
      ['d', 'delete'],
      ['y', 'copy id'],
      ['r', 'reload'],
    ],
  },
  {
    heading: 'filter',
    rows: [
      ['/', 'open filter'],
      ['p:high', 'priority'],
      ['#tag  t:tag', 'tag'],
      ['@name', 'assignee'],
      ['type:epic', 'document type'],
      ['contract:ready', 'contract state'],
      ['due:overdue', 'due date'],
    ],
  },
];

/** Width of the keys column inside each group. */
const KEYS_WIDTH = 16;

export function HelpOverlay({ termWidth, termHeight }: HelpOverlayProps) {
  const columnWidth = Math.max(24, Math.floor((termWidth - 4) / GROUPS.length));
  // Truncate descriptions rather than letting a long one run into the next
  // group's column.
  const descriptionWidth = Math.max(6, columnWidth - KEYS_WIDTH - 2);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingLeft={1}>
      <Text color={PALETTE.text} bold>
        help
      </Text>
      <Text color={PALETTE.textDim}>{RULE.repeat(Math.max(1, termWidth - 2))}</Text>
      <Box marginTop={1}>
        {GROUPS.map((group) => (
          <Box key={group.heading} flexDirection="column" width={columnWidth}>
            <Text color={PALETTE.textSecondary} bold>
              {group.heading}
            </Text>
            {group.rows.map(([keys, description]) => (
              <Text key={keys} wrap="truncate">
                <Text color={PALETTE.text}>{keys.padEnd(KEYS_WIDTH)}</Text>
                <Text color={PALETTE.textMuted}>{truncate(description, descriptionWidth)}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={PALETTE.textDim}>any key to dismiss · q quit</Text>
      </Box>
    </Box>
  );
}
