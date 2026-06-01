import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, BOX } from '../theme.js';
import type { LayoutMode } from '../types.js';

export interface HelpOverlayProps {
  termWidth: number;
  termHeight: number;
  layoutMode?: LayoutMode;
}

export function HelpOverlay({ termWidth, termHeight, layoutMode = 'wide' }: HelpOverlayProps) {
  // Narrow mode: full-screen single-column scrollable layout
  if (layoutMode === 'narrow') {
    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text color={PALETTE.accent} bold>{BOX.topLeft}{BOX.horizontal}</Text>
          <Text color={PALETTE.text} bold> HELP </Text>
        </Box>

        {/* Single column layout - most important shortcuts first */}
        <Box flexDirection="column" paddingLeft={1}>
          <Text color={PALETTE.accent} bold>Navigation</Text>
          <CompactRow k="j/k" desc="Up/down" />
          <CompactRow k="g/G" desc="Top/bottom" />
          <CompactRow k="1/2/3" desc="Panels" />

          <Box marginTop={1}><Text color={PALETTE.accent} bold>Actions</Text></Box>
          <CompactRow k="ENTER" desc="Expand" />
          <CompactRow k="/" desc="Search" />
          <CompactRow k="n" desc="New" />
          <CompactRow k="m" desc="Move" />
          <CompactRow k="d" desc="Delete" />

          <Box marginTop={1}><Text color={PALETTE.accent} bold>Global</Text></Box>
          <CompactRow k="?" desc="Help" />
          <CompactRow k="r" desc="Refresh" />
          <CompactRow k="q" desc="Exit" />
        </Box>

        {/* Footer */}
        <Box flexGrow={1} />
        <Box>
          <Text color={PALETTE.textMuted}>any key to close</Text>
        </Box>
      </Box>
    );
  }

  // Wide mode: centered panel with three columns
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
            <HelpRow k="3" desc="Logs" />

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
            <HelpRow k="A" desc="To logs" />
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
            <HelpRow k="contract:ready" desc="Contract status" />
          </Box>

          {/* Right column: Rules + Logs */}
          <Box flexDirection="column">
            <Text color={PALETTE.accent} bold>Rules</Text>
            <HelpRow k="h/l" desc="Rule type" />
            <HelpRow k="n" desc="New rule" />
            <HelpRow k="e" desc="Edit rule" />
            <HelpRow k="d" desc="Delete rule" />

            <Box marginTop={1}>
              <Text color={PALETTE.accent} bold>Logs</Text>
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

/** Compact row for narrow mode - tighter spacing */
function CompactRow({ k, desc }: { k: string; desc: string }) {
  return (
    <Box>
      <Box width={8}>
        <Text color={PALETTE.text}>{k}</Text>
      </Box>
      <Text color={PALETTE.textSecondary}>{desc}</Text>
    </Box>
  );
}
