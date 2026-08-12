/**
 * v3 overlays. All chrome-free (design §1: "No chrome") — the v2 rounded
 * `borderStyle` boxes are gone; a dim label row and indentation carry the
 * separation instead.
 *
 * The v2 subtask picker modal is deleted: subtasks toggle with `space` directly
 * in the detail view (design §4.2).
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, GLYPHS } from '../theme.js';
import type { StatusMessage as StatusMessageType, BoardColumn, CompleteConfirmTarget } from '../types.js';
import { truncate } from '../text.js';

export interface StatusMessageProps {
  message: StatusMessageType | null;
}

export function StatusMessageDisplay({ message }: StatusMessageProps) {
  if (!message) return null;

  const color =
    message.type === 'success'
      ? PALETTE.success
      : message.type === 'error'
        ? PALETTE.error
        : PALETTE.textSecondary;

  const glyph =
    message.type === 'success'
      ? GLYPHS.success
      : message.type === 'error'
        ? GLYPHS.error
        : GLYPHS.live;

  return (
    <Box paddingLeft={1}>
      <Text color={color} wrap="truncate">{`${glyph} ${message.text}`}</Text>
    </Box>
  );
}

export interface MoveOverlayProps {
  columns: BoardColumn[];
  selectedIndex: number;
  taskId: string;
  taskTitle: string;
  width: number;
}

export function MoveOverlay({
  columns,
  selectedIndex,
  taskId,
  taskTitle,
  width,
}: MoveOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Text color={PALETTE.textMuted}>move</Text>
      <Text wrap="truncate">
        <Text color={PALETTE.textMuted}>{`  ${taskId}  `}</Text>
        <Text color={PALETTE.text}>{truncate(taskTitle, Math.max(1, width - taskId.length - 6))}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1} paddingLeft={2}>
        {columns.map((column, index) => (
          <Text key={column.id} inverse={index === selectedIndex} wrap="truncate">
            {`${index + 1}  ${column.title}`}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>↑↓ select · 1-{columns.length} jump · ↵ confirm · esc cancel</Text>
      </Box>
    </Box>
  );
}

export interface DeleteConfirmOverlayProps {
  taskId: string;
  taskTitle: string;
  width: number;
}

export function DeleteConfirmOverlay({ taskId, taskTitle, width }: DeleteConfirmOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Text color={PALETTE.error}>delete</Text>
      <Text wrap="truncate">
        <Text color={PALETTE.textMuted}>{`  ${taskId}  `}</Text>
        <Text color={PALETTE.text}>{truncate(taskTitle, Math.max(1, width - taskId.length - 6))}</Text>
      </Text>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>This cannot be undone.</Text>
      </Box>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>y delete · n cancel</Text>
      </Box>
    </Box>
  );
}

export interface CompleteConfirmOverlayProps {
  target: CompleteConfirmTarget;
  width: number;
}

/**
 * Raised when core's epic-safety gate refuses a completion. The blockers come
 * straight from `ActionResult.incompleteChildren`, so the prompt names them
 * rather than making the user go find out which children are still open.
 */
export function CompleteConfirmOverlay({ target, width }: CompleteConfirmOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Text color={PALETTE.warning}>complete</Text>
      <Text wrap="truncate">
        <Text color={PALETTE.textMuted}>{`  ${target.id}  `}</Text>
        <Text color={PALETTE.text}>
          {truncate(target.title, Math.max(1, width - target.id.length - 6))}
        </Text>
      </Text>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>
          {`${target.incompleteChildren.length} incomplete child task${
            target.incompleteChildren.length === 1 ? '' : 's'
          }:`}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={4}>
        {target.incompleteChildren.map((child) => (
          <Text key={child.id} wrap="truncate">
            <Text color={PALETTE.textMuted}>{`${child.id}  `}</Text>
            <Text color={PALETTE.textSecondary}>
              {truncate(child.title, Math.max(1, width - child.id.length - 8))}
            </Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>y complete anyway · n cancel</Text>
      </Box>
    </Box>
  );
}

export interface AddOverlayProps {
  title: string;
  columnName: string;
}

export function AddOverlay({ title, columnName }: AddOverlayProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Text color={PALETTE.textMuted}>{`add to ${columnName}`}</Text>
      <Box marginTop={1} paddingLeft={2}>
        <Text wrap="truncate">
          <Text color={title ? PALETTE.text : PALETTE.textMuted}>{title || 'title…'}</Text>
          <Text color={PALETTE.accent}>{GLYPHS.cursor}</Text>
        </Text>
      </Box>
      <Box marginTop={1} paddingLeft={2}>
        <Text color={PALETTE.textMuted}>↵ create · esc cancel</Text>
      </Box>
    </Box>
  );
}
