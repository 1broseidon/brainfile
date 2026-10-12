/**
 * The decisions view (task-19): the board's standing choices, grouped by the
 * family their claim key names, with history folded below.
 *
 * ```
 *  dependency (1)
 * ▌● decision-2  Never axios: one HTTP client is enough, and fetch…  http-client
 *
 *  storage (2)
 *   ● decision-3  No Redis for the cache: an in-process LRU is enough…
 *   ● decision-4  Postgres only; nothing that needs a second database…  constraint
 *
 *  ▸ history (1)
 * ```
 *
 * A decision is not work, so its row has no priority, contract or progress:
 * it leads with `●` (`○` once retired) where a task has its type glyph, and
 * says at rest only what needs saying: a kind other than `decision`, a legacy
 * ADR still `proposed`, or `review` once `validUntil` has passed. The rest of
 * its claim key waits for the cursor, the TUI's hand, where the title leaves
 * room for it. A retired row says where it went (`superseded → decision-2`).
 *
 * Rows share DocumentRow's measure (cursor column, glyph cell, padded ID,
 * title that yields first), so the two lists read alike. Headings and gaps
 * are lines, not stops: the cursor walks decisions only.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, GLYPHS, getTypeGlyph } from '../theme.js';
import { truncate, pad } from '../text.js';
import { EMPTY } from '../copy.js';
import {
  claimKeyTail,
  isPastValidUntil,
  retiredLabel,
  windowLines,
  type DecisionLine,
} from '../decisions.js';

type RowLine = Extract<DecisionLine, { kind: 'row' }>;

interface Signal {
  text: string;
  color: string;
}

/**
 * What a decision's row says on the right. At rest: `proposed`, a kind other
 * than `decision`, `review` past `validUntil`; retired: where it went.
 */
export function decisionSignals(line: RowLine): Signal[] {
  const { summary, retired } = line;
  const out: Signal[] = [];
  if (retired) {
    out.push({ text: retiredLabel(summary), color: PALETTE.textMuted });
    return out;
  }
  if (summary.status === 'proposed') out.push({ text: 'proposed', color: PALETTE.textMuted });
  if (summary.kind && summary.kind !== 'decision') out.push({ text: summary.kind, color: PALETTE.textMuted });
  if (isPastValidUntil(summary)) out.push({ text: 'review', color: PALETTE.warning });
  return out;
}

/**
 * The claim key the cursor reveals: its tail under a family heading, whole
 * in history, where rows of every family mix.
 */
export function revealedClaimKey(line: RowLine): string {
  const key = line.summary.claimKey;
  if (!key) return '';
  return line.retired ? key : claimKeyTail(key);
}

const widthOf = (signals: Signal[]) =>
  signals.reduce((sum, signal) => sum + signal.text.length, 0) + Math.max(0, signals.length - 1) * 2;

export interface DecisionRowProps {
  line: RowLine;
  selected: boolean;
  width: number;
  /** Shared id-column width so titles align within the visible window. */
  idWidth: number;
}

export function DecisionRow({ line, selected, width, idWidth }: DecisionRowProps) {
  const { task, retired } = line;
  // Column 1 carries the cursor glyph as well as reverse video, for NO_COLOR.
  const indent = selected ? GLYPHS.cursor : ' ';
  const glyphCell = `${retired ? GLYPHS.retiredDecision : getTypeGlyph('decision')} `;
  const idCell = `${task.id.padEnd(idWidth)}  `;
  const leftWidth = indent.length + glyphCell.length + idCell.length;

  // The rest of the claim key waits for the cursor, and only takes the room
  // the title leaves: the title keeps the row, so selecting never cuts it.
  const atRest = decisionSignals(line);
  const key = selected ? revealedClaimKey(line) : '';
  const withKey = key ? [{ text: key, color: PALETTE.textMuted }, ...atRest] : atRest;
  const fits = width - leftWidth - widthOf(withKey) - 2 >= task.title.length;
  const signals = key && fits ? withKey : atRest;
  const rightWidth = widthOf(signals);

  // The title yields first, as on every other row.
  const titleWidth = Math.max(1, width - leftWidth - rightWidth - 2);
  const title = truncate(task.title, titleWidth);
  const gap = Math.max(1, width - leftWidth - title.length - rightWidth - 1);

  return (
    <Text wrap="truncate" inverse={selected}>
      <Text>{indent}</Text>
      <Text color={selected ? undefined : retired ? PALETTE.textMuted : PALETTE.textSecondary}>{glyphCell}</Text>
      <Text color={selected ? undefined : PALETTE.textMuted}>{idCell}</Text>
      <Text color={selected ? undefined : retired ? PALETTE.textMuted : PALETTE.text}>{title}</Text>
      <Text>{pad(gap)}</Text>
      {signals.map((signal, index) => (
        <Text key={`${signal.text}-${index}`}>
          {index > 0 ? <Text>{pad(2)}</Text> : null}
          <Text color={selected ? undefined : signal.color}>{signal.text}</Text>
        </Text>
      ))}
      <Text>{pad(1)}</Text>
    </Text>
  );
}

export interface DecisionListProps {
  lines: DecisionLine[];
  /** Index among the selectable rows, not among the lines. */
  selectedIndex: number;
  viewportHeight: number;
  width: number;
  /** Shown when there is nothing to list: no decisions, or none matching the filter. */
  emptyMessage?: string;
}

export function DecisionList({
  lines,
  selectedIndex,
  viewportHeight,
  width,
  emptyMessage = EMPTY.noDecisions,
}: DecisionListProps) {
  if (lines.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
        <Text color={PALETTE.textMuted}>{emptyMessage}</Text>
      </Box>
    );
  }

  const { visible, start } = windowLines(lines, selectedIndex, viewportHeight);
  const idWidth = Math.max(
    6,
    ...visible.flatMap((line) => (line.kind === 'row' ? [line.task.id.length] : [])),
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {visible.map((line, offset) => {
        const key = `${line.kind}-${start + offset}`;
        switch (line.kind) {
          case 'row':
            return (
              <DecisionRow
                key={line.task.id}
                line={line}
                selected={line.index === selectedIndex}
                width={width}
                idWidth={idWidth}
              />
            );
          case 'heading':
            return (
              // Headings sit in the glyph column, so a family's name lines up
              // with the marks of the decisions under it.
              <Text key={key} wrap="truncate">
                <Text> </Text>
                <Text color={PALETTE.textSecondary}>{truncate(line.label, Math.max(1, width - 10))}</Text>
                <Text color={PALETTE.textMuted}>{` (${line.count})`}</Text>
              </Text>
            );
          case 'history':
            return (
              <Text key={key} wrap="truncate">
                <Text> </Text>
                <Text color={PALETTE.textMuted}>{`${line.open ? GLYPHS.foldOpen : GLYPHS.foldClosed} `}</Text>
                <Text color={PALETTE.textSecondary}>history</Text>
                <Text color={PALETTE.textMuted}>{` (${line.count})`}</Text>
              </Text>
            );
          case 'note':
            return (
              <Text key={key} wrap="truncate" color={PALETTE.textMuted}>
                {` ${line.text}`}
              </Text>
            );
          case 'gap':
          default:
            return <Text key={key}> </Text>;
        }
      })}
    </Box>
  );
}
