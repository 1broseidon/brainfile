/**
 * `buildBrief` — per-agent attention primitive.
 *
 * Answers "what changed that I should care about?" for one agent, either as a
 * full first-run orientation or as a delta against a persisted checkpoint.
 *
 * This module is deliberately READ-ONLY: it never touches `.brainfile/state/`.
 * Reading and advancing the per-agent checkpoint is the caller's job (CLI
 * command / MCP handler), which is what makes `--peek` a caller-side decision
 * rather than a branch in here, and what makes fake-clock unit tests possible
 * without mocking the filesystem beyond the fixture board.
 *
 * Honesty constraints baked into this implementation:
 * - Notes and task changes are INDEPENDENT signals. `brainfile note` does not
 *   bump `task.updatedAt` (cli/src/commands/log.ts writes `doc.task` back
 *   unmodified), so `updatedAt` delta detection is blind to notes.
 * - Contract states are reported as CURRENT TRUTH only. No prior status is
 *   recorded anywhere in this codebase, so "changed from draft to in_progress"
 *   is unknowable and must never be fabricated.
 * - Board config carries no `updatedAt`, so config change detection uses the
 *   brainfile's filesystem mtime and can only say THAT something changed.
 */
import * as fs from 'fs';
import type { Board, Task, TaskDocument } from './types';
import type { LedgerRecord } from './types/ledger';
import { readTasksDir } from './taskFile';
import { queryLedger } from './ledger';
import { extractLog, readV2BoardConfig, type V2Dirs } from './workspace';

// ============================================================================
// Public types
// ============================================================================

export interface BuildBriefOptions {
  /** Persisted per-agent checkpoint, or null for first-ever brief (full orientation). */
  lastBriefAt: string | null;
  /** Injectable clock for deterministic tests; defaults to new Date().toISOString(). */
  now?: string;
}

export interface BriefItem {
  taskId?: string;
  text: string;
  why: string;
  /** ISO timestamp the item's recency is computed from, when one exists. */
  at?: string;
}

export interface BriefLane {
  id: string;
  label: string;
  items: BriefItem[];
}

export interface BriefResult {
  agent: string;
  mode: 'full' | 'delta';
  generatedAt: string;
  lastBriefAt: string | null;
  lanes: BriefLane[];
}

/** Max completions shown in first-run orientation (all-time, no floor to bound it). */
const FULL_MODE_COMPLETION_LIMIT = 10;

// ============================================================================
// Note parsing
// ============================================================================

/**
 * A single parsed `## Log` line.
 *
 * There is no structured per-note model in the schema — `extractLog` returns the
 * raw section as one opaque string. But both writers that exist emit a leading
 * ISO-8601 token, in two subtly different shapes:
 *
 *   core `appendLog`:  `- <ts> [agent]: text`   (bracket BEFORE colon, prepended)
 *   CLI  `logNoteCommand`: `- <ts>: [agent] text` (bracket AFTER colon, appended)
 *
 * We parse exactly that leading token and best-effort recover the bracket.
 * Because the two writers insert at OPPOSITE ENDS of the section, position in
 * the string does not encode recency — callers must sort by `at`, never by index.
 */
export interface ParsedNote {
  at: string;
  text: string;
  agent?: string;
}

/**
 * Require a full ISO-8601 date-time shape, not merely something `Date.parse`
 * tolerates — otherwise a hand-written line like `- 2026 was rough` would parse
 * as a valid timestamp and fabricate a delta.
 */
const ISO_TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function parseNoteLine(line: string): ParsedNote | null {
  const match = /^-\s+(\S+)/.exec(line);
  if (!match) return null;

  // `\S+` is greedy, so the CLI format's trailing colon lands inside the token.
  let token = match[1];
  if (token.endsWith(':')) token = token.slice(0, -1);

  if (!ISO_TIMESTAMP_SHAPE.test(token)) return null;
  const parsed = Date.parse(token);
  if (Number.isNaN(parsed)) return null;

  let rest = line.slice(match[0].length);
  let agent: string | undefined;

  // Accept the bracket on either side of the colon (the two writers disagree).
  const takeBracket = (): void => {
    const bracket = /^\s*\[([^\]]+)\]/.exec(rest);
    if (bracket) {
      agent = bracket[1].trim() || undefined;
      rest = rest.slice(bracket[0].length);
    }
  };

  takeBracket();
  rest = rest.replace(/^\s*:/, '');
  if (!agent) takeBracket();

  return {
    at: new Date(parsed).toISOString(),
    text: rest.trim(),
    agent,
  };
}

/** Parse every timestamped line of a task's `## Log` section, newest first. */
export function parseNotes(body: string): ParsedNote[] {
  const log = extractLog(body);
  if (!log) return [];

  const notes: ParsedNote[] = [];
  for (const line of log.split('\n')) {
    const parsed = parseNoteLine(line);
    if (parsed) notes.push(parsed);
  }

  // Sort by parsed timestamp, never by position: the two writers insert at
  // opposite ends, so section order does not encode recency.
  return notes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Last non-empty line of the log section, used only as an unstamped fallback. */
function lastRawLogLine(body: string): string | null {
  const log = extractLog(body);
  if (!log) return null;
  const lines = log.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  return lines[lines.length - 1].replace(/^-\s+/, '');
}

// ============================================================================
// Helpers
// ============================================================================

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Case-insensitive EXACT assignee match.
 *
 * Deliberate deviation from `search.ts`, which uses case-insensitive SUBSTRING
 * matching (`task.assignee.toLowerCase().includes(filters.assignee)`). An
 * attention guarantee needs "is this precisely my task": substring semantics
 * would let agent `cursor` silently inherit tasks assigned to `cursor-2`.
 */
function isAssignedTo(assignee: string | undefined, agentName: string): boolean {
  if (!assignee) return false;
  return assignee.trim().toLowerCase() === agentName.trim().toLowerCase();
}

/** "3d", "4h", "12m", "just now" — compact, no fabricated precision. */
export function relativeTime(from: string, to: string): string {
  const fromMs = parseMs(from);
  const toMs = parseMs(to);
  if (fromMs === null || toMs === null) return 'unknown';

  const deltaSec = Math.max(0, Math.round((toMs - fromMs) / 1000));
  if (deltaSec < 60) return 'just now';
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** "12m ago" / "just now" — avoids the "just now ago" stutter. */
function agoPhrase(from: string, to: string): string {
  const rel = relativeTime(from, to);
  return rel === 'just now' || rel === 'unknown' ? rel : `${rel} ago`;
}

function taskStateWhy(task: Task): string {
  const parts: string[] = [task.column || 'unknown'];
  if (task.priority) parts.push(task.priority);
  if (task.contract?.status) parts.push(`contract:${task.contract.status}`);
  return parts.join(' · ');
}

function completionWhy(record: LedgerRecord): string {
  const cycle = typeof record.cycleTimeHours === 'number'
    ? `${record.cycleTimeHours}h cycle`
    : 'cycle unknown';
  return `completed · ${cycle}`;
}

function boardMtimeMs(brainfilePath: string): number | null {
  try {
    return fs.statSync(brainfilePath).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Ledger records for this agent.
 *
 * NOTE: `queryLedger`'s own `assignee` filter is case-SENSITIVE exact
 * (`record.assignee !== filters.assignee`), which would contradict the
 * case-insensitive matching used for active tasks. So we query by date range
 * only and apply the assignee predicate ourselves.
 *
 * `queryLedger`'s `dateRange.from` is also INCLUSIVE (`completedMs < fromMs` is
 * the only rejection), so a completion landing in the same millisecond as the
 * checkpoint would resurface on every brief. We post-filter with strict `>`.
 */
function completionsFor(
  dirs: V2Dirs,
  agentName: string,
  lastBriefAtMs: number | null,
): LedgerRecord[] {
  let records: LedgerRecord[];
  try {
    records = queryLedger(dirs.logsDir, {});
  } catch {
    return [];
  }

  const matching = records.filter((record) => {
    if (!isAssignedTo(record.assignee, agentName)) return false;
    if (lastBriefAtMs === null) return true;
    const completedMs = parseMs(record.completedAt);
    return completedMs !== null && completedMs > lastBriefAtMs;
  });

  return matching.sort((a, b) => (parseMs(b.completedAt) ?? 0) - (parseMs(a.completedAt) ?? 0));
}

function readBoardConfig(brainfilePath: string): Board | null {
  try {
    return readV2BoardConfig(brainfilePath) as Board;
  } catch {
    return null;
  }
}

// ============================================================================
// buildBrief
// ============================================================================

export function buildBrief(
  dirs: V2Dirs,
  agentName: string,
  opts: BuildBriefOptions,
): BriefResult {
  const generatedAt = opts.now ?? new Date().toISOString();
  const lastBriefAt = opts.lastBriefAt;
  const lastBriefAtMs = parseMs(lastBriefAt);
  const mode: 'full' | 'delta' = lastBriefAtMs === null ? 'full' : 'delta';

  const assigned = readTasksDir(dirs.boardDir)
    .filter((doc) => isAssignedTo(doc.task.assignee, agentName));

  const lanes = mode === 'full'
    ? fullLanes(dirs, agentName, assigned, generatedAt)
    : deltaLanes(dirs, agentName, assigned, generatedAt, lastBriefAtMs as number);

  return {
    agent: agentName,
    mode,
    generatedAt,
    // Normalize away an unparseable stored checkpoint rather than echoing it.
    lastBriefAt: lastBriefAtMs === null ? null : lastBriefAt,
    lanes,
  };
}

function sortAssigned(docs: TaskDocument[]): TaskDocument[] {
  return [...docs].sort((a, b) => {
    const aMs = parseMs(a.task.updatedAt) ?? parseMs(a.task.createdAt) ?? 0;
    const bMs = parseMs(b.task.updatedAt) ?? parseMs(b.task.createdAt) ?? 0;
    return bMs - aMs;
  });
}

/**
 * Accepted ADRs — the standing decisions an agent must orient against (adr-2
 * replaced the old `rules` block with exactly this).
 *
 * An ADR counts as accepted once `adr promote` has marked it (`status:
 * promoted`, which also moves the file into `logs/`); a board-resident ADR
 * explicitly marked `accepted` counts too, since the status field is free-form
 * and both spellings appear in practice. Board and logs are both searched:
 * promotion archives the doc, so restricting to `board/` would show nothing.
 */
function acceptedAdrs(dirs: V2Dirs): TaskDocument[] {
  const ACCEPTED = new Set(['accepted', 'promoted']);
  const docs: TaskDocument[] = [];

  for (const dir of [dirs.boardDir, dirs.logsDir]) {
    let entries: TaskDocument[];
    try {
      entries = readTasksDir(dir);
    } catch {
      continue; // A missing/unreadable dir is orientation we simply don't have.
    }
    for (const doc of entries) {
      const task = doc.task as Task & { status?: string };
      if ((task.type || '').toLowerCase() !== 'adr') continue;
      if (!ACCEPTED.has((task.status || '').toLowerCase())) continue;
      docs.push(doc);
    }
  }

  return docs.sort((a, b) => a.task.id.localeCompare(b.task.id, undefined, { numeric: true }));
}

function fullLanes(
  dirs: V2Dirs,
  agentName: string,
  assigned: TaskDocument[],
  generatedAt: string,
): BriefLane[] {
  // ── orientation ─────────────────────────────────────────────────────────
  const orientation: BriefItem[] = [];
  const board = readBoardConfig(dirs.brainfilePath);

  if (board?.title) {
    orientation.push({ text: board.title, why: 'board' });
  }
  for (const instruction of board?.agent?.instructions ?? []) {
    orientation.push({ text: instruction, why: 'agent instructions' });
  }
  for (const doc of acceptedAdrs(dirs)) {
    orientation.push({ taskId: doc.task.id, text: doc.task.title, why: 'accepted adr' });
  }

  // ── assigned ────────────────────────────────────────────────────────────
  const assignedItems: BriefItem[] = sortAssigned(assigned).map((doc) => ({
    taskId: doc.task.id,
    text: doc.task.title,
    why: taskStateWhy(doc.task),
    ...(doc.task.updatedAt ? { at: doc.task.updatedAt } : {}),
  }));

  // ── notes (most recent per task) ────────────────────────────────────────
  const noteItems: BriefItem[] = [];
  for (const doc of assigned) {
    const notes = parseNotes(doc.body);
    if (notes.length > 0) {
      const latest = notes[0];
      noteItems.push({
        taskId: doc.task.id,
        text: latest.text,
        why: `logged ${agoPhrase(latest.at, generatedAt)}`,
        at: latest.at,
      });
      continue;
    }
    const raw = lastRawLogLine(doc.body);
    if (raw) {
      noteItems.push({ taskId: doc.task.id, text: raw, why: 'unstamped entry' });
    }
  }
  noteItems.sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0));

  // ── completions ─────────────────────────────────────────────────────────
  const completionItems: BriefItem[] = completionsFor(dirs, agentName, null)
    .slice(0, FULL_MODE_COMPLETION_LIMIT)
    .map((record) => ({
      taskId: record.id,
      text: record.title,
      why: completionWhy(record),
      at: record.completedAt,
    }));

  return [
    { id: 'orientation', label: 'Board & Decisions', items: orientation },
    { id: 'assigned', label: 'Your Tasks', items: assignedItems },
    { id: 'notes', label: 'Latest Notes', items: noteItems },
    { id: 'completions', label: 'Recently Completed (yours)', items: completionItems },
  ];
}

function deltaLanes(
  dirs: V2Dirs,
  agentName: string,
  assigned: TaskDocument[],
  generatedAt: string,
  lastBriefAtMs: number,
): BriefLane[] {
  // ── notes ───────────────────────────────────────────────────────────────
  // Independent of updatedAt: `brainfile note` never bumps it.
  const noteItems: BriefItem[] = [];
  for (const doc of assigned) {
    for (const note of parseNotes(doc.body)) {
      const noteMs = parseMs(note.at);
      if (noteMs === null || noteMs <= lastBriefAtMs) continue;
      noteItems.push({
        taskId: doc.task.id,
        text: note.agent ? `[${note.agent}] ${note.text}` : note.text,
        why: agoPhrase(note.at, generatedAt),
        at: note.at,
      });
    }
  }
  noteItems.sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0));

  // ── changes ─────────────────────────────────────────────────────────────
  // Covers moves, patches, subtask edits, contract transitions, reassignment
  // TO this agent, and new tasks — because the assignee filter is applied at
  // query time, not against a stored snapshot. Never a "changed from X" diff:
  // no prior state is recorded anywhere.
  const changeItems: BriefItem[] = [];
  for (const doc of sortAssigned(assigned)) {
    const createdMs = parseMs(doc.task.createdAt);
    const updatedMs = parseMs(doc.task.updatedAt);
    const isNew = createdMs !== null && createdMs > lastBriefAtMs;
    const isUpdated = updatedMs !== null && updatedMs > lastBriefAtMs;
    if (!isNew && !isUpdated) continue;

    const stamp = isNew ? doc.task.createdAt : doc.task.updatedAt;
    const verb = isNew ? 'created' : 'updated';
    changeItems.push({
      taskId: doc.task.id,
      text: doc.task.title,
      why: `${verb} ${agoPhrase(stamp as string, generatedAt)} · ${taskStateWhy(doc.task)}`,
      ...(stamp ? { at: stamp } : {}),
    });
  }

  // ── completions ─────────────────────────────────────────────────────────
  const completionItems: BriefItem[] = completionsFor(dirs, agentName, lastBriefAtMs)
    .map((record) => ({
      taskId: record.id,
      text: record.title,
      why: completionWhy(record),
      at: record.completedAt,
    }));

  // ── config ──────────────────────────────────────────────────────────────
  // No BoardConfig.updatedAt exists, so mtime is the only honest signal, and it
  // can only report THAT something changed — never which rule.
  const configItems: BriefItem[] = [];
  const mtime = boardMtimeMs(dirs.brainfilePath);
  if (mtime !== null && mtime > lastBriefAtMs) {
    const at = new Date(mtime).toISOString();
    configItems.push({
      text: 'Board config changed',
      why: 'brainfile.md changed since last brief',
      at,
    });
  }

  return [
    { id: 'notes', label: 'New Notes', items: noteItems },
    { id: 'changes', label: 'Task Changes', items: changeItems },
    { id: 'completions', label: 'Completed Since Last Brief', items: completionItems },
    { id: 'config', label: 'Board Config', items: configItems },
  ];
}

/** True when a brief has nothing to report (a valid, non-error outcome). */
export function isEmptyBrief(result: BriefResult): boolean {
  return result.lanes.every((lane) => lane.items.length === 0);
}
