/**
 * Document detail v2 (v3.1 spec §B1) — anatomy, top to bottom:
 *
 * ```
 *  epic-1 ▸ task-2   Prune supervisor remnants from docs        todo · med
 *  ─────────────────────────────────────────────────────────────────────
 *  #docs   assignee —   created 08-11   parent epic-1
 *  description                                                      ↕ 2/9
 *    docs/guides/orchestration.md still documents @brainfile/…
 *  children (3)
 *    task-1  Triage marketing board                     todo
 *  subtasks (0/2)
 *    ◻ sweep guides
 *  contract   ⧉ ready
 *    deliverables  docs/guides/orchestration.md — rewrite
 *    validation    npm test -w cli
 *  activity
 *    08-12 [claude] moved todo → in-progress
 *  files  docs/guides/orchestration.md
 * ```
 *
 * Sections render only when non-empty — a childless task shows no `children`
 * heading, an uncontracted doc shows no `contract` block, and so on.
 *
 * The flat cursor (§B2, the locked decision) walks children then subtasks —
 * `detailStops.ts` is the single source of truth for what stop N means, so
 * this file and `useKeyboardNavigation` can never disagree.
 *
 * Wide terminals render this as a persistent right pane beside a still-
 * interactive list; narrow terminals render it fullscreen in place of the
 * list. The only difference is the width/height it is handed — the content
 * (and this module's layout math) is identical either way, which is why
 * `computeDetailLayout` is exported and reused by the keyboard hook for
 * scroll clamping and by the footer for the conditional `u/d scroll` hint.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE, RULE, GLYPHS, getContractStateColor } from '../theme.js';
import { getPriorityColor, getDocType } from '../utils.js';
import { truncate, truncateStart, wrapText, pad } from '../text.js';
import { buildDetailStops } from '../detailStops.js';
import type { ActivityEntry } from '../actions.js';

/** Deliverables shown before the rest are dropped (§B1). */
export const MAX_DELIVERABLES = 3;
/** Validation commands shown before the rest are dropped (§B1). */
export const MAX_VALIDATION_COMMANDS = 2;
/** Activity entries the caller should hand in (§B1: "last 5 log entries"). */
export const MAX_ACTIVITY_ENTRIES = 5;

export interface DetailViewProps {
  task: Task;
  /** Column the document currently sits in — the `todo` half of the state chip. */
  columnLabel: string;
  width: number;
  height: number;
  /** Breadcrumb chain, root first, current (`task`) last — ids only. */
  breadcrumb: string[];
  /** Parent document, when it is on the board. */
  parent?: Task;
  /** Direct children of `task`, board order. */
  children: Task[];
  /** Pre-fetched, pre-capped activity entries (newest first). */
  activity: ActivityEntry[];
  /** Flat-cursor index across `children` then `task.subtasks` (§B2). */
  cursor: number;
  /** Body scroll offset in lines, cursor-independent (§B2). */
  scrollOffset: number;
}

interface BodyLine {
  text: string;
  kind: 'text' | 'heading' | 'code' | 'list';
}

export interface DetailLayout {
  bodyLines: BodyLine[];
  /** Visible body height in lines. */
  bodyBudget: number;
  bodyOverflows: boolean;
}

/**
 * Shared layout math: how many lines the description region gets once every
 * other section's (estimated) height is subtracted. Exported so the keyboard
 * hook (scroll clamping) and the footer (conditional `u/d scroll`) agree with
 * what actually renders, without duplicating the arithmetic.
 */
export function computeDetailLayout(
  task: Task,
  width: number,
  height: number,
  children: Task[],
  activity: ActivityEntry[],
): DetailLayout {
  const contentWidth = Math.max(20, width - 2);
  const stacked = contentWidth < 60;
  const subtasks = task.subtasks ?? [];
  const files = task.relatedFiles ?? [];
  const contract = task.contract;

  const bodyLines = buildBodyLines(task.description, contentWidth);

  const metaLines = stacked ? 4 : 1;
  const childrenLines = children.length > 0 ? 1 + children.length : 0;
  const subtasksLines = subtasks.length > 0 ? 1 + subtasks.length : 0;
  const contractLines = contract
    ? 1 +
      Math.min(contract.deliverables?.length ?? 0, MAX_DELIVERABLES) +
      Math.min(contract.validation?.commands?.length ?? 0, MAX_VALIDATION_COMMANDS) +
      (contract.feedback ? 1 : 0)
    : 0;
  const activityLines = activity.length > 0 ? 1 + activity.length : 0;
  const filesLines = files.length > 0 ? 1 : 0;

  const sectionsWithMargin = [
    bodyLines.length > 0,
    childrenLines > 0,
    subtasksLines > 0,
    contractLines > 0,
    activityLines > 0,
    filesLines > 0,
  ].filter(Boolean).length;

  const bodyBudget = Math.max(
    2,
    height -
      2 /* header + rule */ -
      metaLines -
      1 /* description heading line */ -
      childrenLines -
      subtasksLines -
      contractLines -
      activityLines -
      filesLines -
      sectionsWithMargin,
  );

  return { bodyLines, bodyBudget, bodyOverflows: bodyLines.length > bodyBudget };
}

export function DetailView({
  task,
  columnLabel,
  width,
  height,
  breadcrumb,
  parent,
  children,
  activity,
  cursor,
  scrollOffset,
}: DetailViewProps) {
  const contentWidth = Math.max(20, width - 2);
  const stacked = contentWidth < 60;

  const priority = task.priority;
  const subtasks = task.subtasks ?? [];
  const files = task.relatedFiles ?? [];
  const contract = task.contract;

  const { bodyLines, bodyBudget, bodyOverflows } = computeDetailLayout(
    task,
    width,
    height,
    children,
    activity,
  );
  const clampedScroll = Math.max(0, Math.min(scrollOffset, Math.max(0, bodyLines.length - bodyBudget)));
  const visibleBody = bodyLines.slice(clampedScroll, clampedScroll + bodyBudget);

  const stops = buildDetailStops(task, children);

  const stateText = priority ? `${columnLabel} · ${priority}` : columnLabel;
  const breadcrumbBudget = Math.max(6, Math.floor(contentWidth * 0.4));
  const breadcrumbStr = truncateStart(breadcrumb.join(' ▸ ') || task.id, breadcrumbBudget);
  const headWidth = Math.max(1, contentWidth - stateText.length - 2);
  const head = truncate(`${breadcrumbStr}  ${task.title}`, headWidth);

  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      <Box paddingLeft={1} width={width}>
        <Text wrap="truncate">
          <Text color={PALETTE.text} bold>
            {head}
          </Text>
          <Text>{pad(Math.max(1, contentWidth - head.length - stateText.length))}</Text>
          <Text color={PALETTE.textSecondary}>{columnLabel}</Text>
          {priority ? (
            <Text>
              <Text color={PALETTE.textDim}> · </Text>
              <Text color={getPriorityColor(priority)}>{priority}</Text>
            </Text>
          ) : null}
        </Text>
      </Box>

      <Box paddingLeft={1} width={width}>
        <Text color={PALETTE.textDim}>{RULE.repeat(contentWidth)}</Text>
      </Box>

      <MetadataBlock task={task} parent={parent} stacked={stacked} width={width} />

      {bodyLines.length > 0 ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <DescriptionHeading
            bodyOverflows={bodyOverflows}
            scrollStart={clampedScroll + 1}
            total={bodyLines.length}
            contentWidth={contentWidth}
          />
          {visibleBody.map((line, index) => (
            <Text
              key={`body-${index}`}
              wrap="truncate"
              bold={line.kind === 'heading'}
              color={
                line.kind === 'code'
                  ? PALETTE.textMuted
                  : line.kind === 'heading'
                    ? PALETTE.text
                    : PALETTE.textSecondary
              }
            >
              {line.text || ' '}
            </Text>
          ))}
        </Box>
      ) : null}

      {children.length > 0 ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text color={PALETTE.textMuted}>{`children (${children.length})`}</Text>
          {children.map((child, index) => (
            <StopRow
              key={child.id}
              selected={index === cursor}
              left={`  ${child.id}  ${child.title}`}
              right={child.column ?? ''}
              rightColor={PALETTE.textSecondary}
              contentWidth={contentWidth}
            />
          ))}
        </Box>
      ) : null}

      {subtasks.length > 0 ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text color={PALETTE.textMuted}>
            {`subtasks (${subtasks.filter((s) => s.completed).length}/${subtasks.length})`}
          </Text>
          {subtasks.map((subtask, index) => {
            const stopIndex = children.length + index;
            const glyph = subtask.completed ? GLYPHS.subtaskDone : GLYPHS.subtaskOpen;
            return (
              <StopRow
                key={subtask.id}
                selected={stopIndex === cursor}
                left={`  ${glyph} ${subtask.title}`}
                leftColor={subtask.completed ? PALETTE.textMuted : PALETTE.textSecondary}
                contentWidth={contentWidth}
              />
            );
          })}
        </Box>
      ) : null}

      {contract ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text>
            <Text color={PALETTE.textMuted}>{'contract   '}</Text>
            <Text color={getContractStateColor(contract.status)}>{contract.status}</Text>
          </Text>
          {contract.deliverables?.length ? (
            <LabeledList
              label="deliverables"
              items={contract.deliverables
                .slice(0, MAX_DELIVERABLES)
                .map((d) => (d.description ? `${d.path} — ${d.description}` : d.path))}
              contentWidth={contentWidth}
              color={PALETTE.textSecondary}
            />
          ) : null}
          {contract.validation?.commands?.length ? (
            <LabeledList
              label="validation"
              items={contract.validation.commands.slice(0, MAX_VALIDATION_COMMANDS)}
              contentWidth={contentWidth}
              color={PALETTE.textMuted}
            />
          ) : null}
          {contract.feedback ? (
            <Text wrap="truncate">
              <Text color={PALETTE.textMuted}>{'  feedback  '}</Text>
              <Text color={PALETTE.error}>{truncate(contract.feedback, Math.max(1, contentWidth - 12))}</Text>
            </Text>
          ) : null}
        </Box>
      ) : null}

      {activity.length > 0 ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text color={PALETTE.textMuted}>activity</Text>
          {activity.map((entry, index) => {
            const stamp = entry.at ? entry.at.slice(5, 10) : '  ';
            const prefix = `  ${stamp} `;
            return (
              <Text key={`activity-${index}`} wrap="truncate">
                <Text color={PALETTE.textDim}>{prefix}</Text>
                <Text color={PALETTE.textSecondary}>
                  {truncate(entry.text, Math.max(1, contentWidth - prefix.length))}
                </Text>
              </Text>
            );
          })}
        </Box>
      ) : null}

      {files.length > 0 ? (
        <Box paddingLeft={1} marginTop={1} width={width}>
          <Text wrap="truncate">
            <Text color={PALETTE.textMuted}>{'files  '}</Text>
            <Text color={PALETTE.textSecondary}>
              {truncate(files.join(' · '), Math.max(1, contentWidth - 7))}
            </Text>
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function DescriptionHeading({
  bodyOverflows,
  scrollStart,
  total,
  contentWidth,
}: {
  bodyOverflows: boolean;
  scrollStart: number;
  total: number;
  contentWidth: number;
}) {
  const indicator = bodyOverflows ? `${GLYPHS.scroll} ${scrollStart}/${total}` : '';
  const gap = Math.max(1, contentWidth - 'description'.length - indicator.length);

  return (
    <Text wrap="truncate">
      <Text color={PALETTE.textMuted}>description</Text>
      {indicator ? <Text>{pad(gap)}</Text> : null}
      {indicator ? <Text color={PALETTE.textDim}>{indicator}</Text> : null}
    </Text>
  );
}

/** One flat-cursor stop: a child row or a subtask row. */
function StopRow({
  selected,
  left,
  right,
  leftColor,
  rightColor,
  contentWidth,
}: {
  selected: boolean;
  left: string;
  right?: string;
  leftColor?: string;
  rightColor?: string;
  contentWidth: number;
}) {
  const rightText = right ?? '';
  const leftTruncated = truncate(left, Math.max(1, contentWidth - rightText.length - 2));
  const gap = Math.max(1, contentWidth - leftTruncated.length - rightText.length);

  return (
    <Text wrap="truncate">
      <Text color={selected ? undefined : leftColor} inverse={selected}>
        {leftTruncated}
      </Text>
      <Text>{pad(gap)}</Text>
      {rightText ? <Text color={rightColor}>{rightText}</Text> : null}
    </Text>
  );
}

/** `  label  value` on the first line; continuations align under the value column. */
function LabeledList({
  label,
  items,
  contentWidth,
  color,
}: {
  label: string;
  items: string[];
  contentWidth: number;
  color: string;
}) {
  // +2 over the longest label this is ever called with ("deliverables", 12
  // chars) so there is always at least one gap space before the value.
  const labelWidth = 16;
  return (
    <React.Fragment>
      {items.map((item, index) => (
        <Text key={`${label}-${index}`} wrap="truncate">
          <Text color={PALETTE.textMuted}>
            {`  ${index === 0 ? label.padEnd(labelWidth - 2) : ' '.repeat(labelWidth - 2)}`}
          </Text>
          <Text color={color}>{truncate(item, Math.max(1, contentWidth - labelWidth))}</Text>
        </Text>
      ))}
    </React.Fragment>
  );
}

function MetadataBlock({
  task,
  parent,
  stacked,
  width,
}: {
  task: Task;
  parent?: Task;
  stacked: boolean;
  width: number;
}) {
  const tags = task.tags?.length ? task.tags.map((t) => `#${t}`).join(' ') : '—';
  const assignee = task.assignee || '—';
  const created = task.createdAt ? task.createdAt.slice(0, 10) : '—';
  const parentLabel = parentLabelFor(task, parent);

  const fields: Array<[string, string]> = [
    ['tags', tags],
    ['assignee', assignee],
    ['created', created],
    ['parent', parentLabel],
  ];

  if (stacked) {
    return (
      <Box flexDirection="column" paddingLeft={1} width={width}>
        {fields.map(([label, value]) => (
          <Text key={label} wrap="truncate">
            <Text color={PALETTE.textMuted}>{`${label} `}</Text>
            <Text color={PALETTE.textSecondary}>{value}</Text>
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box paddingLeft={1} width={width}>
      <Text wrap="truncate">
        {fields.map(([label, value], index) => (
          <Text key={label}>
            {index > 0 ? <Text>{pad(4)}</Text> : null}
            <Text color={PALETTE.textMuted}>{`${label} `}</Text>
            <Text color={PALETTE.textSecondary}>{value}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}

/** `epic-1` for an on-board parent; `plan plan-N` when the parent is a plan (§B1). */
function parentLabelFor(task: Task, parent?: Task): string {
  if (!task.parentId) return '—';
  if (!parent) return `${task.parentId} ↗`;
  if (getDocType(parent) === 'plan') return `plan ${parent.id}`;
  return parent.id;
}

/**
 * Minimal markdown for detail bodies (design §4.2): headings bold, fenced code
 * dim, list items indented. No syntax highlighting this round.
 */
export function buildBodyLines(description: string | undefined, width: number): BodyLine[] {
  if (!description) return [];

  const out: BodyLine[] = [];
  let inFence = false;

  for (const raw of description.split('\n')) {
    const line = raw.replace(/\s+$/, '');

    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push({ text: `  ${truncate(line, Math.max(1, width - 2))}`, kind: 'code' });
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      out.push({ text: truncate(line.replace(/^#{1,6}\s*/, ''), width), kind: 'heading' });
      continue;
    }
    if (/^\s*[-*+]\s/.test(line)) {
      const item = line.replace(/^\s*[-*+]\s*/, '');
      for (const wrapped of wrapText(item, Math.max(1, width - 4))) {
        out.push({ text: `  • ${wrapped}`, kind: 'list' });
      }
      continue;
    }
    if (line.trim() === '') {
      out.push({ text: '', kind: 'text' });
      continue;
    }
    for (const wrapped of wrapText(line, width)) {
      out.push({ text: wrapped, kind: 'text' });
    }
  }

  return out;
}
