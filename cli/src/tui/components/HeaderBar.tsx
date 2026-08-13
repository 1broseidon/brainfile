/**
 * Single-row header plus the rule beneath it (design §4.1):
 *
 * ```
 *  brainfile ▸ Backlog 1 │ To Do 9* │ In Progress 0 │ Review 0    / filter  ? help
 *  ──────────────────────────────────────────────────────────────────────────────
 * ```
 *
 * When a filter is open or active the rule line is replaced by the inline
 * filter input and its match count (design §4.3) — the filter lives *in* the
 * header rule line rather than occupying a row of its own.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { PALETTE, RULE, GLYPHS } from '../theme.js';
import type { BoardColumn } from '../types.js';
import { truncate, pad } from '../text.js';
import { CHROME, matchCountLabel } from '../copy.js';

export interface HeaderBarProps {
  title: string;
  columns: BoardColumn[];
  activeColumnIndex: number;
  width: number;
  /** Present while `/` is open or a filter is applied. */
  filterQuery?: string;
  filterActive: boolean;
  /** Documents surviving the filter / total documents on the board. */
  matchCount?: number;
  totalCount?: number;
  /**
   * Label shown instead of column tabs for the `L` done view, whose
   * rows come from `logs/` and are not column-organized.
   */
  panelLabel?: string;
  /** Active type-cycle filter (§A2), e.g. `plan`. Omitted/`'all'` renders nothing. */
  activeType?: string;
}

export function HeaderBar({
  title,
  columns,
  activeColumnIndex,
  width,
  filterQuery = '',
  filterActive,
  matchCount,
  totalCount,
  panelLabel,
  activeType,
}: HeaderBarProps) {
  const affordances = CHROME.filterAffordance;
  const boardTitle = truncate(title, 24);
  const separator = ` ${GLYPHS.pointer} `;
  const typeLabel = activeType && activeType !== 'all' ? ` · ${activeType}` : '';

  // Width of the tab strip, computed rather than measured so the affordances
  // can be right-aligned inside a single truncating Text row.
  const tabsWidth =
    (panelLabel
      ? panelLabel.length
      : columns.reduce((sum, column, index) => {
          const active = index === activeColumnIndex;
          return (
            sum +
            (index > 0 ? 3 : 0) +
            `${column.title} ${column.tasks?.length ?? 0}`.length +
            (active ? 1 : 0)
          );
        }, 0)) + typeLabel.length;

  const used = boardTitle.length + separator.length + tabsWidth;
  const gap = Math.max(1, width - 1 - used - affordances.length - 1);

  return (
    // flexShrink={0}: a detail v2 pane can legitimately render taller than the
    // nominal viewport (§B1's many optional sections). Without this, yoga
    // shrinks *this* sibling instead of letting the column overflow, and the
    // header silently loses rows rather than the frame simply growing.
    <Box flexDirection="column" flexShrink={0}>
      <Box paddingLeft={1} width={width}>
        <Text wrap="truncate">
          <Text color={PALETTE.text} bold>
            {boardTitle}
          </Text>
          <Text color={PALETTE.textDim}>{separator}</Text>
          {panelLabel ? (
            <Text color={PALETTE.text}>{panelLabel}</Text>
          ) : (
            columns.map((column, index) => {
              const active = index === activeColumnIndex;
              const count = column.tasks?.length ?? 0;
              return (
                <Text key={column.id}>
                  {index > 0 ? <Text color={PALETTE.textDim}>{' │ '}</Text> : null}
                  <Text color={active ? PALETTE.text : PALETTE.textMuted} bold={active}>
                    {`${column.title} ${count}`}
                  </Text>
                  {active ? (
                    <Text color={PALETTE.text} bold>
                      *
                    </Text>
                  ) : null}
                </Text>
              );
            })
          )}
          {typeLabel ? <Text color={PALETTE.textDim}>{typeLabel}</Text> : null}
          <Text>{pad(gap)}</Text>
          <Text color={PALETTE.textMuted}>{affordances}</Text>
        </Text>
      </Box>

      {filterActive ? (
        <FilterLine
          query={filterQuery}
          width={width}
          matchCount={matchCount}
          totalCount={totalCount}
        />
      ) : (
        <Box paddingLeft={1} width={width}>
          <Text color={PALETTE.textDim}>{RULE.repeat(Math.max(1, width - 2))}</Text>
        </Box>
      )}
    </Box>
  );
}

function FilterLine({
  query,
  width,
  matchCount,
  totalCount,
}: {
  query: string;
  width: number;
  matchCount?: number;
  totalCount?: number;
}) {
  const count =
    matchCount === undefined || totalCount === undefined
      ? ''
      : matchCountLabel(matchCount, totalCount, query);
  const input = `/${query}`;
  const gap = Math.max(1, width - 2 - input.length - 1 - count.length);

  return (
    <Box paddingLeft={1} width={width}>
      <Text wrap="truncate">
        <Text color={PALETTE.accent}>{input}</Text>
        <Text color={PALETTE.accent}>{GLYPHS.cursor}</Text>
        <Text>{pad(gap)}</Text>
        <Text color={PALETTE.textMuted}>{count || ' '}</Text>
      </Text>
    </Box>
  );
}
