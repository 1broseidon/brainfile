/**
 * One document, one row.
 *
 * Layout (design §3/§4.1):
 *
 * ```
 *  ▸ epic-1  Post-migration cleanup                    0/3          #cleanup
 *      task-1  Triage marketing board                               #marketing
 *    task-8  CLIError renders raw stack trace   ⚠ high              #cli
 *  ● adr-1   Drop V1 board-format support                           #v1
 * ```
 *
 *  - column 1 is the type glyph (blank for a plain task — the emptiness is what
 *    makes typed documents legible at a glance);
 *  - children indent two spaces;
 *  - IDs are dim and padded to a shared width so titles line up within a depth;
 *  - the priority marker (`⚠ high`) is the single priority mechanism;
 *  - up to three right-aligned signal chips in fixed precedence: contract
 *    state → subtask progress → first tag;
 *  - the title truncates with `…` before a chip is ever dropped or wrapped.
 */
import React from 'react';
import { Text } from 'ink';
import type { DocRow } from '../rows.js';
import { PALETTE, getTypeGlyph, getContractStateColor, GLYPHS } from '../theme.js';
import { truncate, pad } from '../text.js';
import { getPriorityColor, getSubtaskProgress, getContractState } from '../utils.js';

/** Maximum right-aligned signal chips per row (design §3). */
export const MAX_CHIPS = 3;

interface Chip {
  text: string;
  color: string;
}

/** Chips in precedence order, capped at three. */
export function buildChips(row: DocRow): Chip[] {
  const chips: Chip[] = [];
  const { task } = row;

  const contractState = getContractState(task);
  if (contractState) {
    chips.push({ text: contractState, color: getContractStateColor(contractState) });
  }

  const progress = getSubtaskProgress(task);
  if (progress) {
    chips.push({ text: progress, color: PALETTE.textSecondary });
  }

  const firstTag = task.tags?.[0];
  if (firstTag) {
    chips.push({ text: `#${firstTag}`, color: PALETTE.textMuted });
  }

  return chips.slice(0, MAX_CHIPS);
}

/** `⚠ high` / `⚠ critical`, or nothing. Priority is signal, not decoration. */
export function buildPriorityMarker(row: DocRow): Chip | undefined {
  const priority = row.task.priority;
  if (priority !== 'high' && priority !== 'critical') return undefined;
  return { text: `${GLYPHS.warning} ${priority}`, color: getPriorityColor(priority) };
}

export interface DocumentRowProps {
  row: DocRow;
  selected: boolean;
  width: number;
  /** Shared id-column width so titles align within the visible window. */
  idWidth: number;
}

export function DocumentRow({ row, selected, width, idWidth }: DocumentRowProps) {
  const { task, depth, orphanParentId } = row;

  const glyph = getTypeGlyph(task.type);
  const indent = `${pad(1)}${pad(depth * 2)}`;
  const glyphCell = `${glyph || ' '} `;
  const idCell = `${task.id.padEnd(idWidth)}  `;
  const leftWidth = indent.length + glyphCell.length + idCell.length;

  const marker = buildPriorityMarker(row);
  const chips = buildChips(row);
  const orphan = orphanParentId ? `${GLYPHS.orphanParent} ${orphanParentId}` : undefined;

  const rightSegments: Chip[] = [];
  if (orphan) rightSegments.push({ text: orphan, color: PALETTE.textDim });
  if (marker) rightSegments.push(marker);
  rightSegments.push(...chips);

  const rightWidth =
    rightSegments.reduce((sum, seg) => sum + seg.text.length, 0) +
    Math.max(0, rightSegments.length - 1) * 2;

  // Title yields first: chips never wrap and are never dropped for space.
  const titleWidth = Math.max(1, width - leftWidth - rightWidth - 2);
  const title = truncate(task.title, titleWidth);
  const gap = Math.max(1, width - leftWidth - title.length - rightWidth - 1);

  const dim = selected ? undefined : PALETTE.textMuted;

  return (
    <Text wrap="truncate" inverse={selected}>
      <Text>{indent}</Text>
      <Text color={selected ? undefined : PALETTE.textSecondary}>{glyphCell}</Text>
      <Text color={dim}>{idCell}</Text>
      <Text color={selected ? undefined : PALETTE.text}>{title}</Text>
      <Text>{pad(gap)}</Text>
      {rightSegments.map((seg, index) => (
        <Text key={`${seg.text}-${index}`}>
          {index > 0 ? <Text>{pad(2)}</Text> : null}
          <Text color={selected ? undefined : seg.color}>{seg.text}</Text>
        </Text>
      ))}
      <Text>{pad(1)}</Text>
    </Text>
  );
}
