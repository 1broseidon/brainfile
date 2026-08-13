/**
 * Help (design §4.4): one condensed pane. Keys that change meaning by mode
 * live in separate groups (list vs detail) so the map never claims `p` is
 * both priority and parent on the same line. Dismissed by any key except
 * `q`, which still quits.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, RULE } from '../theme.js';
import { truncate } from '../text.js';
import { CHROME } from '../copy.js';

export interface HelpOverlayProps {
  termWidth: number;
  termHeight: number;
}

interface HelpGroup {
  heading: string;
  rows: Array<[string, string]>;
}

const LIST: HelpGroup = {
  heading: 'list',
  rows: [
    ['j k  ↑↓', 'move'],
    ['h l  tab ←→', 'column'],
    ['g G', 'top / bottom'],
    ['ctrl-d/u', 'half page'],
    ['↵', 'open'],
    ['t', 'type'],
    ['L', 'done'],
    ['/', 'filter'],
  ],
};

const DETAIL: HelpGroup = {
  heading: 'detail',
  rows: [
    ['↵', 'open child'],
    ['space', 'toggle subtask'],
    ['u d', 'scroll body'],
    ['p', 'parent'],
    ['esc', 'back'],
  ],
};

const ACTIONS: HelpGroup = {
  heading: 'actions',
  rows: [
    ['a n', 'add'],
    ['N', 'add + edit'],
    ['m', 'move'],
    ['c', 'complete'],
    ['e', 'edit'],
    ['p', 'priority'],
    ['space', 'collapse'],
    ['d', 'delete'],
    ['y', 'copy id'],
    ['r', 'reload'],
    ['A', 'archive'],
  ],
};

const FILTER: HelpGroup = {
  heading: 'filter',
  rows: [
    ['p:high', 'priority'],
    ['#tag  t:tag', 'tag'],
    ['@name', 'assignee'],
    ['type:epic', 'type'],
    ['contract:ready', 'contract'],
    ['due:overdue', 'due'],
  ],
};

/** Left column = where you are; right column = what you can do / query. */
const COLUMNS: HelpGroup[][] = [
  [LIST, DETAIL],
  [ACTIONS, FILTER],
];

/** Width of the keys column inside each group. */
const KEYS_WIDTH = 14;

export function HelpOverlay({ termWidth, termHeight }: HelpOverlayProps) {
  const columnWidth = Math.max(24, Math.floor((termWidth - 4) / COLUMNS.length));
  const descriptionWidth = Math.max(6, columnWidth - KEYS_WIDTH - 2);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingLeft={1}>
      <Text color={PALETTE.text} bold>
        {CHROME.helpTitle}
      </Text>
      <Text color={PALETTE.textDim}>{RULE.repeat(Math.max(1, termWidth - 2))}</Text>
      <Box marginTop={1}>
        {COLUMNS.map((column, columnIndex) => (
          <Box key={columnIndex} flexDirection="column" width={columnWidth}>
            {column.map((group, groupIndex) => (
              <Box
                key={group.heading}
                flexDirection="column"
                marginTop={groupIndex === 0 ? 0 : 1}
              >
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
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={PALETTE.textDim}>{CHROME.helpDismiss}</Text>
      </Box>
    </Box>
  );
}
