/**
 * Single-row footer plus the rule above it (design §4.1):
 *
 * ```
 *  ──────────────────────────────────────────────────────────────────────────
 *  10 items · ↵ detail · m move · c complete · a add · tab column · q quit  todo
 * ```
 *
 * The action list is context-sensitive: it advertises only what is valid for
 * the *selected* document. An adr never shows `c complete` (design §4.1),
 * because an adr records a decision rather than tracking work.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE, RULE } from '../theme.js';
import { isCompletable } from '../utils.js';
import { pad, truncate } from '../text.js';

/** Actions offered while browsing the board list. */
export function browseActions(selected: Task | undefined): string[] {
  const actions = ['↵ detail', 'm move'];
  if (isCompletable(selected)) actions.push('c complete');
  actions.push('a add', 't type', 'tab column', 'q quit');
  return actions;
}

/** Context detail v2's footer needs to decide which actions are valid (§B2). */
export interface DetailFooterContext {
  task: Task | undefined;
  hasParent: boolean;
  hasChildren: boolean;
  hasSubtasks: boolean;
  bodyOverflows: boolean;
}

/**
 * Actions offered inside the detail view (v3.1 §B2 footer):
 * `↵ open child · space toggle · u/d scroll · p parent · e edit · m move ·
 * esc back` — each item appears only when applicable to the document
 * currently in view (no `p` without a parent, no `space` without subtasks,
 * never `c complete` on a non-completable type — existing rule).
 */
export function detailActions(ctx: DetailFooterContext): string[] {
  const actions: string[] = [];
  if (ctx.hasChildren) actions.push('↵ open child');
  if (ctx.hasSubtasks) actions.push('space toggle');
  if (ctx.bodyOverflows) actions.push('u/d scroll');
  if (ctx.hasParent) actions.push('p parent');
  actions.push('e edit', 'm move');
  if (isCompletable(ctx.task)) actions.push('c complete');
  actions.push('esc back');
  return actions;
}

export interface FooterBarProps {
  width: number;
  /** Left-hand count, e.g. `10 items`. Omitted inside the detail view. */
  itemCount?: number;
  actions: string[];
  /** Right-aligned state chip — the column the selection lives in. */
  stateChip?: string;
  /** Whether to draw the rule above the footer row. */
  showRule?: boolean;
}

export function FooterBar({
  width,
  itemCount,
  actions,
  stateChip,
  showRule = true,
}: FooterBarProps) {
  const left =
    itemCount === undefined
      ? actions.join(' · ')
      : [`${itemCount} item${itemCount === 1 ? '' : 's'}`, ...actions].join(' · ');
  const chip = stateChip ?? '';
  const available = Math.max(1, width - 2 - chip.length - 2);
  const text = truncate(left, available);
  const gap = Math.max(1, width - 2 - text.length - chip.length);

  return (
    // flexShrink={0}: see HeaderBar's matching comment — the footer must not
    // be the thing that silently loses rows when detail v2 overflows.
    <Box flexDirection="column" flexShrink={0}>
      {showRule ? (
        <Box paddingLeft={1} width={width}>
          <Text color={PALETTE.textDim}>{RULE.repeat(Math.max(1, width - 2))}</Text>
        </Box>
      ) : null}
      <Box paddingLeft={1} width={width}>
        <Text wrap="truncate">
          <Text color={PALETTE.textMuted}>{text}</Text>
          <Text>{pad(gap)}</Text>
          <Text color={PALETTE.textSecondary}>{chip || ' '}</Text>
        </Text>
      </Box>
    </Box>
  );
}
