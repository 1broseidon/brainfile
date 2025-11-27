import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE } from '../theme.js';

export interface HelpOverlayProps {
  termWidth: number;
  termHeight: number;
}

export function HelpOverlay({ termWidth, termHeight }: HelpOverlayProps) {
  const panelWidth = 58;
  const panelHeight = 16;

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

        {/* Two-column layout */}
        <Box>
          {/* Left column: Navigation + View */}
          <Box flexDirection="column" marginRight={3}>
            <Text color={PALETTE.accent} bold>Navigation</Text>
            <HelpRow k="j/k ↓/↑" desc="Move up/down" />
            <HelpRow k="h/l ←/→" desc="Switch columns" />
            <HelpRow k="g/G" desc="Top / Bottom" />
            <HelpRow k="^d/^u" desc="Page down/up" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>View</Text>
            </Box>
            <HelpRow k="ENTER" desc="Expand/collapse" />
            <HelpRow k="/" desc="Search" />
            <HelpRow k="r" desc="Refresh" />
            <HelpRow k="ESC" desc="Clear/close" />
          </Box>

          {/* Right column: Task Management */}
          <Box flexDirection="column">
            <Text color={PALETTE.accent} bold>Tasks</Text>
            <HelpRow k="n" desc="New task (quick)" />
            <HelpRow k="N" desc="New task (editor)" />
            <HelpRow k="e" desc="Edit in $EDITOR" />
            <HelpRow k="m" desc="Move to column" />
            <HelpRow k="d" desc="Delete task" />
            <HelpRow k="a" desc="Archive task" />
            <HelpRow k="p" desc="Cycle priority" />
            <HelpRow k="t" desc="Toggle subtask" />
            <HelpRow k="y" desc="Copy task ID" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Quit</Text>
            </Box>
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
      <Box width={10}>
        <Text color={PALETTE.text}>{k}</Text>
      </Box>
      <Text color={PALETTE.textSecondary}>{desc}</Text>
    </Box>
  );
}
