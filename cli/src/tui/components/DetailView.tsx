/**
 * Standalone document detail (design §4.2).
 *
 * ```
 *  task-8  CLIError renders raw stack trace                    todo · high
 *  ─────────────────────────────────────────────────────────────────────────
 *  tags #cli #ux     assignee —     created 2026-08-11     parent —
 *
 *  Repro: run 'brainfile complete task-5' (missing --task flag).
 *
 *  subtasks                                                    contract
 *    ◻ add top-level catch in cli.ts                             (none)
 *    ◻ regression test
 *
 *  files  cli/src/cli.ts · cli/src/utils/errorHandler.ts
 * ```
 *
 * Wide terminals render this as a persistent right pane beside a still-
 * interactive list; narrow terminals render it fullscreen in place of the list.
 * The only difference between the two is the width it is handed and whether it
 * draws its own footer — the content is identical.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '@brainfile/core';
import { PALETTE, RULE, GLYPHS, getContractStateColor } from '../theme.js';
import { getPriorityColor, getContractState } from '../utils.js';
import { truncate, wrapText, pad } from '../text.js';

export interface DetailViewProps {
  task: Task;
  /** Column the document currently sits in — the `todo` half of the state chip. */
  columnLabel: string;
  width: number;
  height: number;
  /** Focused subtask row; `space` toggles it. */
  selectedSubtaskIndex: number;
  /** Parent document, when it is on the board. */
  parent?: Task;
}

export function DetailView({
  task,
  columnLabel,
  width,
  height,
  selectedSubtaskIndex,
  parent,
}: DetailViewProps) {
  const contentWidth = Math.max(20, width - 2);
  const stacked = contentWidth < 60;

  const priority = task.priority;
  const contractState = getContractState(task);
  const subtasks = task.subtasks ?? [];
  const files = task.relatedFiles ?? [];

  const state = priority ? `${columnLabel} · ${priority}` : columnLabel;
  const headWidth = Math.max(1, contentWidth - state.length - 2);
  const head = truncate(`${task.id}  ${task.title}`, headWidth);

  const bodyLines = buildBodyLines(task.description, contentWidth);
  // Leave room for the header (2), metadata block, subtasks/contract, files.
  const bodyBudget = Math.max(
    1,
    height - 8 - (stacked ? 3 : 1) - subtasks.length - (files.length ? 2 : 0),
  );
  const body = bodyLines.slice(0, bodyBudget);
  const bodyTruncated = bodyLines.length > body.length;

  return (
    <Box flexDirection="column" width={width}>
      <Box paddingLeft={1} width={width}>
        <Text wrap="truncate">
          <Text color={PALETTE.text} bold>
            {head}
          </Text>
          <Text>{pad(Math.max(1, contentWidth - head.length - state.length))}</Text>
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

      <Box flexDirection="column" paddingLeft={1} marginTop={1}>
        {body.length === 0 ? (
          <Text color={PALETTE.textMuted}>(no description)</Text>
        ) : (
          body.map((line, index) => (
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
          ))
        )}
        {bodyTruncated ? <Text color={PALETTE.textDim}>…</Text> : null}
      </Box>

      {subtasks.length > 0 || contractState ? (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          <Text>
            <Text color={PALETTE.textMuted}>subtasks</Text>
            <Text>{pad(Math.max(1, contentWidth - 8 - 8))}</Text>
            <Text color={PALETTE.textMuted}>contract</Text>
          </Text>
          {renderSubtaskAndContractRows(
            subtasks,
            selectedSubtaskIndex,
            contractState,
            contentWidth,
          )}
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

function renderSubtaskAndContractRows(
  subtasks: NonNullable<Task['subtasks']>,
  selectedSubtaskIndex: number,
  contractState: string | undefined,
  contentWidth: number,
) {
  const rowCount = Math.max(subtasks.length, 1);
  const rows: React.ReactElement[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const subtask = subtasks[index];
    const selected = subtask !== undefined && index === selectedSubtaskIndex;
    const glyph = subtask?.completed ? GLYPHS.subtaskDone : GLYPHS.subtaskOpen;
    const label = subtask ? `  ${glyph} ${subtask.title}` : '  (none)';
    const right =
      index === 0 ? (contractState ?? (subtasks.length > 0 ? '(none)' : undefined)) : undefined;
    const rightText = right ?? '';
    const left = truncate(label, Math.max(1, contentWidth - rightText.length - 2));

    rows.push(
      <Text key={`sub-${index}`} wrap="truncate">
        <Text
          color={
            selected ? undefined : subtask?.completed ? PALETTE.textMuted : PALETTE.textSecondary
          }
          inverse={selected}
        >
          {left}
        </Text>
        <Text>{pad(Math.max(1, contentWidth - left.length - rightText.length))}</Text>
        {rightText ? (
          <Text color={getContractStateColor(right)}>{rightText}</Text>
        ) : null}
      </Text>,
    );
  }

  return rows;
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
  const parentLabel = task.parentId ? (parent ? task.parentId : `${task.parentId} ↗`) : '—';

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

interface BodyLine {
  text: string;
  kind: 'text' | 'heading' | 'code' | 'list';
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
