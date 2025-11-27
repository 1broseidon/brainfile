import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';

export interface HelpOverlayProps {
  termWidth: number;
  termHeight: number;
}

export function HelpOverlay({ termWidth, termHeight }: HelpOverlayProps) {
  const panelWidth = 72;
  const panelHeight = 22;

  // Calculate centering
  const padTop = Math.max(0, Math.floor((termHeight - panelHeight) / 2));

  return (
    <Box
      flexDirection="column"
      width={termWidth}
      height={termHeight}
      alignItems="center"
    >
      {/* Vertical centering spacer */}
      {padTop > 0 && <Box height={padTop} />}

      {/* Centered panel */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PALETTE.accent}
        paddingX={2}
        paddingY={1}
        width={panelWidth}
      >
        {/* Header */}
        <Box justifyContent="center" marginBottom={1}>
          <Text color={PALETTE.text} bold>KEYBOARD SHORTCUTS</Text>
        </Box>

        {/* Three-column layout */}
        <Box>
          {/* Left column: Navigation + View */}
          <Box flexDirection="column" marginRight={2}>
            <Text color={PALETTE.accent} bold>Panels</Text>
            <HelpRow k="1" desc="Tasks" />
            <HelpRow k="2" desc="Rules" />
            <HelpRow k="3" desc="Archive" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Navigation</Text>
            </Box>
            <HelpRow k="j/k" desc="Up/down" />
            <HelpRow k="h/l" desc="Left/right" />
            <HelpRow k="g/G" desc="Top/bottom" />
            <HelpRow k="^d/^u" desc="Page scroll" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>View</Text>
            </Box>
            <HelpRow k="ENTER" desc="Expand" />
            <HelpRow k="/" desc="Search" />
            <HelpRow k="r" desc="Refresh" />
            <HelpRow k="ESC" desc="Close" />
          </Box>

          {/* Middle column: Task Management */}
          <Box flexDirection="column" marginRight={2}>
            <Text color={PALETTE.accent} bold>Tasks</Text>
            <HelpRow k="n/N" desc="New task" />
            <HelpRow k="e" desc="Edit" />
            <HelpRow k="m" desc="Move" />
            <HelpRow k="d" desc="Delete" />
            <HelpRow k="A" desc="Archive" />
            <HelpRow k="p" desc="Priority" />
            <HelpRow k="t" desc="Subtask" />
            <HelpRow k="y" desc="Copy ID" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Filters</Text>
            </Box>
            <HelpRow k="p:high" desc="Priority" />
            <HelpRow k="#tag" desc="Tag" />
            <HelpRow k="@name" desc="Assignee" />
            <HelpRow k="due:week" desc="Due date" />
          </Box>

          {/* Right column: Rules + Archive */}
          <Box flexDirection="column">
            <Text color={PALETTE.accent} bold>Rules</Text>
            <HelpRow k="h/l" desc="Rule type" />
            <HelpRow k="n" desc="New rule" />
            <HelpRow k="e" desc="Edit rule" />
            <HelpRow k="d" desc="Delete rule" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Archive</Text>
            </Box>
            <HelpRow k="R" desc="Restore" />
            <HelpRow k="d" desc="Delete" />
            <HelpRow k="ENTER" desc="Expand" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Global</Text>
            </Box>
            <HelpRow k="?" desc="Help" />
            <HelpRow k="q/^c" desc="Exit" />
          </Box>
        </Box>

        {/* Footer */}
        <Box justifyContent="center" marginTop={1}>
          <Text color={PALETTE.textMuted}>press any key to close</Text>
        </Box>
      </Box>
    </Box>
  );
}

function HelpRow({ k, desc }: { k: string; desc: string }) {
  return (
    <Box>
      <Box width={9}>
        <Text color={PALETTE.text}>{k}</Text>
      </Box>
      <Text color={PALETTE.textSecondary}>{desc}</Text>
    </Box>
  );
}
