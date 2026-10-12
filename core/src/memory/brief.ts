/**
 * The brief as a session-start block (spec-11; recoil's `wake`): one
 * budgeted piece of text, about 1,600 characters by default, in lanes:
 *
 * - heads up: work resting on a superseded decision, and current decisions
 *   whose predicates broke (expired, source changed, package moved);
 * - current decisions;
 * - your tasks (or, when nothing is assigned to you, the work in flight);
 * - what changed since your checkpoint (notes, task changes, completions,
 *   config, and decisions made or retired), or on a first brief the latest
 *   notes and completions;
 * - the docs that bear on your tasks: index hits for their titles.
 *
 * `buildBrief` (core `brief.ts`) still computes the checkpoint delta; this
 * composes it with the rest and renders the text. Reading and advancing the
 * checkpoint stays the caller's job.
 *
 * @packageDocumentation
 */

import * as path from 'path';
import type { Task, TaskDocument } from '../types/base';
import type { BoardConfig, TypesConfig } from '../types/board';
import { buildBrief, relativeTime, type BriefItem, type BriefLane, type BriefResult } from '../brief';
import { readBoardConfig } from '../boardFile';
import { readTasksDir } from '../taskFile';
import type { V2Dirs } from '../workspace';
import { resolveDocType } from '../docTypes';
import { buildDocGraph, decisionStatus } from '../docGraph';
import { claimKeyOf, isDecisionDoc } from '../decisions';
import { evaluateDecisionPredicates } from '../decisionOperations';
import { MemoryIndex, type MemoryHit } from './memoryIndex';

export const DEFAULT_BRIEF_MAX_CHARS = 1600;

/** Longest line the block prints; longer ones end in an ellipsis. */
const MAX_LINE = 180;

export interface ComposeBriefOptions {
  /** The agent's checkpoint; null for a first brief. */
  lastBriefAt: string | null;
  /** Injectable clock (ISO). */
  now?: string;
  /** Character budget for `text`; 0 for no limit. Default 1,600. */
  maxChars?: number;
  /** Look up docs for the tasks in the local index (default true; skipped where there is none). */
  docs?: boolean;
  /** Time budget for refreshing the index first, in ms (the session-start hook keeps it short). */
  refreshBudgetMs?: number;
}

/** The brief, its lanes, and the budgeted text. */
export interface ComposedBrief extends BriefResult {
  /** The block's lanes, in order: warnings, decisions, tasks, changes, docs (empty ones included). */
  sections: BriefLane[];
  /** The rendered block, within `maxChars`. */
  text: string;
  maxChars: number;
  /** True when items did not fit the budget. */
  truncated: boolean;
  /** Whether the docs lane came from the index. */
  docsMode: 'index' | 'none';
}

function parseMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function isAssignedTo(task: Task, agent: string): boolean {
  return typeof task.assignee === 'string' && task.assignee.trim().toLowerCase() === agent.trim().toLowerCase();
}

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const IN_FLIGHT = /progress|doing|review|active|wip|working/i;

function workWhy(task: Task, config: BoardConfig | null): string {
  const column = config?.columns?.find((c) => c.id === task.column);
  const parts: string[] = [column?.title ?? task.column ?? ''];
  if (task.priority) parts.push(task.priority);
  if (task.contract?.status) parts.push(`contract:${task.contract.status}`);
  return parts.filter(Boolean).join(' · ');
}

/** Furthest along first (later columns), then priority, then most recently touched. */
function sortWork(tasks: Task[], config: BoardConfig | null): Task[] {
  const order = (config?.columns ?? []).map((c) => c.id);
  const rank = (t: Task) => {
    const i = order.indexOf(t.column ?? '');
    return i === -1 ? -1 : i;
  };
  return [...tasks].sort((a, b) =>
    rank(b) - rank(a)
    || (PRIORITY_RANK[a.priority ?? ''] ?? 4) - (PRIORITY_RANK[b.priority ?? ''] ?? 4)
    || (parseMs(b.updatedAt ?? b.createdAt) ?? 0) - (parseMs(a.updatedAt ?? a.createdAt) ?? 0));
}

function inFlight(work: Task[], config: BoardConfig | null): Task[] {
  const columns = config?.columns ?? [];
  let ids = columns.filter((c) => IN_FLIGHT.test(c.id) || IN_FLIGHT.test(c.title ?? '')).map((c) => c.id);
  if (ids.length === 0) ids = columns.slice(1).map((c) => c.id);
  return work.filter((t) => ids.includes(t.column ?? ''));
}

function decisionWhy(task: Task): string {
  const record = task as Task & Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.kind === 'string' && record.kind !== 'decision') parts.push(record.kind);
  if (typeof record.stance === 'string' && typeof record.subject === 'string') parts.push(`${record.stance} ${record.subject}`);
  if (typeof record.holdsWhile === 'string' && record.holdsWhile.trim()) parts.push(`while ${record.holdsWhile.trim()}`);
  if ((task.type ?? '').toLowerCase() === 'adr') parts.push('adr');
  return parts.join(' · ');
}

function agoPhrase(from: string, to: string): string {
  const rel = relativeTime(from, to);
  return rel === 'just now' || rel === 'unknown' ? rel : `${rel} ago`;
}

/**
 * Compose an agent's brief: the checkpoint delta from `buildBrief`, plus the
 * lanes above, rendered within the budget.
 */
export function composeBrief(dirs: V2Dirs, agent: string, options: ComposeBriefOptions): ComposedBrief {
  const now = options.now ?? new Date().toISOString();
  const maxChars = options.maxChars === undefined ? DEFAULT_BRIEF_MAX_CHARS : Math.max(0, Math.floor(options.maxChars));
  const base = buildBrief(dirs, agent, { lastBriefAt: options.lastBriefAt, now });
  const config = readBoardConfig(dirs.brainfilePath)?.config ?? null;
  const types: TypesConfig | undefined = config?.types;
  const projectRoot = path.dirname(dirs.dotDir);

  const boardDocs = readTasksDir(dirs.boardDir);
  const logDocs = readTasksDir(dirs.logsDir);
  const graph = buildDocGraph([...boardDocs.map((d) => d.task), ...logDocs.map((d) => d.task)], { types });
  const isWork = (task: Task) => resolveDocType(task.type, types).role !== 'decision';
  const openWork = boardDocs.map((d) => d.task).filter((t) => isWork(t) && !t.completedAt);
  const decisions: TaskDocument[] = [...boardDocs, ...logDocs].filter((d) => isDecisionDoc(d.task, types));
  const current = decisions
    .filter((d) => decisionStatus(d.task as Task & { status?: unknown }) === 'current')
    .sort((a, b) => (claimKeyOf(a.task) ?? `~${a.task.id}`).localeCompare(claimKeyOf(b.task) ?? `~${b.task.id}`, undefined, { numeric: true }));

  // ── your tasks, or the work in flight ─────────────────────────────────
  const mine = sortWork(openWork.filter((t) => isAssignedTo(t, agent)), config);
  const taskList = mine.length > 0 ? mine : sortWork(inFlight(openWork, config), config);
  const tasksLane: BriefLane = {
    id: 'tasks',
    label: mine.length > 0 ? 'Your tasks' : 'In flight',
    items: taskList.map((task) => ({ taskId: task.id, text: task.title, why: workWhy(task, config), ...(task.updatedAt ? { at: task.updatedAt } : {}) })),
  };

  // ── heads up ──────────────────────────────────────────────────────────
  const warnings: BriefItem[] = [];
  const resting = graph.openWorkOnSupersededDecisions();
  resting.sort((a, b) => Number(isAssignedTo(b.task, agent)) - Number(isAssignedTo(a.task, agent)));
  for (const { task, decisions: links } of resting) {
    const named = links.map((l) => (l.supersededBy ? `${l.id} (now ${l.supersededBy})` : l.id)).join(', ');
    warnings.push({ taskId: task.id, text: `${task.title}: rests on superseded ${named}`, why: 'rests on a superseded decision' });
  }
  const nowMs = parseMs(now) ?? Date.now();
  for (const doc of current) {
    const report = evaluateDecisionPredicates(doc.task, { projectRoot, now: nowMs });
    if (report.status !== 'broken') continue;
    const broken = report.checks.find((c) => c.status === 'broken');
    const recheck = typeof doc.task.recheck === 'string' && doc.task.recheck.trim() ? ` · recheck: ${doc.task.recheck.trim()}` : '';
    warnings.push({ taskId: doc.task.id, text: `${doc.task.title}: ${(broken?.reason ?? 'predicate broken').replace(/_/g, ' ')}${recheck}`, why: 'decision needs a look' });
  }

  // ── current decisions ─────────────────────────────────────────────────
  const decisionsLane: BriefLane = {
    id: 'decisions',
    label: 'Current decisions',
    items: current.map((doc) => {
      const key = claimKeyOf(doc.task);
      return { taskId: doc.task.id, text: key ? `${key}: ${doc.task.title}` : doc.task.title, why: decisionWhy(doc.task) };
    }),
  };

  // ── what changed ──────────────────────────────────────────────────────
  const changes: BriefItem[] = [];
  const laneItems = (id: string) => base.lanes.find((l) => l.id === id)?.items ?? [];
  if (base.mode === 'delta') {
    const since = parseMs(base.lastBriefAt) ?? 0;
    for (const doc of decisions) {
      const created = parseMs(doc.task.createdAt);
      const updated = parseMs(doc.task.updatedAt);
      const status = decisionStatus(doc.task as Task & { status?: unknown });
      if (status === 'current' && created !== null && created > since) {
        const supersedes = doc.task.supersedes ? ` (supersedes ${[doc.task.supersedes].flat().join(', ')})` : '';
        changes.push({ taskId: doc.task.id, text: `decided: ${doc.task.title}${supersedes}`, why: agoPhrase(doc.task.createdAt as string, now), at: doc.task.createdAt as string });
      } else if (status !== 'current' && updated !== null && updated > since) {
        const by = typeof doc.task.supersededBy === 'string' ? ` by ${doc.task.supersededBy}` : '';
        changes.push({ taskId: doc.task.id, text: `${status}${by}: ${doc.task.title}`, why: agoPhrase(doc.task.updatedAt as string, now), at: doc.task.updatedAt as string });
      }
    }
    for (const item of laneItems('notes')) changes.push({ ...item, text: `note: ${item.text}` });
    for (const item of laneItems('changes')) changes.push(item);
    for (const item of laneItems('completions')) changes.push({ ...item, text: `completed: ${item.text}` });
    for (const item of laneItems('config')) changes.push(item);
    if (changes.length === 0) changes.push({ text: 'Nothing new since your last brief.', why: '' });
  } else {
    for (const item of laneItems('notes')) changes.push({ ...item, text: `note: ${item.text}` });
    for (const item of laneItems('completions')) changes.push({ ...item, text: `completed: ${item.text}` });
  }
  changes.sort((a, b) => (parseMs(b.at) ?? 0) - (parseMs(a.at) ?? 0));
  const changesLane: BriefLane = {
    id: 'changes',
    label: base.mode === 'delta' ? 'Since your last brief' : 'Lately',
    items: changes,
  };

  // ── docs that bear on the tasks ───────────────────────────────────────
  let docsMode: ComposedBrief['docsMode'] = 'none';
  const docItems: BriefItem[] = [];
  if (options.docs !== false && taskList.length > 0) {
    const index = MemoryIndex.open(dirs.brainfilePath);
    if (index) {
      try {
        const budget = options.refreshBudgetMs;
        index.refresh(budget === undefined ? {} : { deadline: Date.now() + budget });
        const best = new Map<string, MemoryHit>();
        for (const task of taskList.slice(0, 5)) {
          for (const hit of index.relatedDocs(task.title, { limit: 2, sources: ['repo', 'plans'] })) {
            const existing = best.get(hit.path);
            if (!existing || hit.score > existing.score) best.set(hit.path, hit);
          }
        }
        for (const hit of [...best.values()].sort((a, b) => b.score - a.score).slice(0, 4)) {
          docItems.push({ text: hit.title, why: `${hit.path}:${hit.startLine}-${hit.endLine}` });
        }
        docsMode = 'index';
      } catch {
        // No docs lane is better than no brief.
      } finally {
        index.close();
      }
    }
  }

  const sections: BriefLane[] = [
    { id: 'warnings', label: 'Heads up', items: warnings },
    decisionsLane,
    tasksLane,
    changesLane,
    { id: 'docs', label: 'Docs that bear on them', items: docItems },
  ];
  const title = config?.title ? ` · ${config.title}` : '';
  const when = base.mode === 'full' ? 'first brief' : `since ${agoPhrase(base.lastBriefAt as string, now)}`;
  const header = `Brainfile brief for ${agent}${title} (${when})`;
  const rendered = renderBriefText(header, sections, maxChars, agent);
  return { ...base, sections, text: rendered.text, maxChars, truncated: rendered.truncated, docsMode };
}

function clip(line: string, max: number): string {
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** One lane item as a line of the block. */
export function briefItemLine(laneId: string, item: BriefItem): string {
  const id = item.taskId ? `${item.taskId} ` : '';
  switch (laneId) {
    case 'warnings':
      return `! ${id}${item.text}`;
    case 'docs':
      return `- ${item.why} ${item.text}`;
    case 'tasks':
      return `- ${id}${item.text}${item.why ? ` · ${item.why}` : ''}`;
    default:
      return `- ${id}${item.text}${item.why ? ` (${item.why})` : ''}`;
  }
}

/**
 * Render lanes within a character budget. Every non-empty lane gets its
 * heading and first item before any lane gets a second; what does not fit is
 * counted in a closing line. `maxChars` 0 prints everything.
 */
export function renderBriefText(header: string, sections: readonly BriefLane[], maxChars: number, agent = ''): { text: string; truncated: boolean } {
  const lanes = sections.filter((lane) => lane.items.length > 0);
  if (lanes.length === 0) {
    const text = `${header}\nNothing on the board for you yet.`;
    return maxChars > 0 && text.length > maxChars ? { text: clip(text, maxChars), truncated: true } : { text, truncated: false };
  }
  const lineMax = maxChars > 0 ? Math.min(MAX_LINE, Math.max(40, maxChars)) : MAX_LINE;
  const heading = (lane: BriefLane) => (lane.id === 'warnings' ? '' : `## ${lane.label}`);
  const lines = lanes.map((lane) => lane.items.map((item) => clip(briefItemLine(lane.id, item), lineMax)));

  const render = (counts: number[]) => {
    const out: string[] = [header];
    lanes.forEach((lane, i) => {
      if (counts[i] === 0) return;
      const h = heading(lane);
      if (h) out.push(h);
      out.push(...lines[i].slice(0, counts[i]));
    });
    return out.join('\n');
  };

  const total = lines.reduce((n, l) => n + l.length, 0);
  if (maxChars <= 0) return { text: render(lines.map((l) => l.length)), truncated: false };

  const more = (hidden: number) => `(+${hidden} more: brainfile brief${agent ? ` --agent ${agent}` : ''} --max-chars 0)`;
  const fits = (counts: number[]) => {
    const shown = counts.reduce((a, b) => a + b, 0);
    const text = render(counts);
    return (shown < total ? `${text}\n${more(total - shown)}` : text).length <= maxChars;
  };

  // First pass: every lane's first line. When they do not all fit whole,
  // each lane (in order, while the budget allows) gets a short one, and the
  // short ones grow together, ten characters a round, until it is spent: a
  // tight budget shows every lane it can rather than a few lanes in full.
  const counts = lines.map(() => 1);
  const full = lines.map((l) => l[0]);
  if (!fits(counts)) {
    const MIN_LINE = 16;
    for (let i = 0; i < lanes.length; i++) {
      counts[i] = 0;
      lines[i][0] = full[i].length > MIN_LINE ? clip(full[i], MIN_LINE) : full[i];
    }
    for (let i = 0; i < lanes.length; i++) {
      counts[i] = 1;
      if (!fits(counts)) counts[i] = 0;
    }
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < lanes.length; i++) {
        if (counts[i] === 0 || lines[i][0] === full[i]) continue;
        const before = lines[i][0];
        const next = before.length + 10;
        lines[i][0] = next >= full[i].length ? full[i] : clip(full[i], next);
        if (fits(counts)) grew = true;
        else lines[i][0] = before;
      }
    }
  }
  // Second pass: fill lane by lane.
  for (let i = 0; i < lanes.length; i++) {
    while (counts[i] > 0 && counts[i] < lines[i].length) {
      counts[i]++;
      if (!fits(counts)) {
        counts[i]--;
        break;
      }
    }
  }
  const shown = counts.reduce((a, b) => a + b, 0);
  let text = render(counts);
  if (shown < total) text = `${text}\n${more(total - shown)}`;
  if (text.length > maxChars) text = clip(text, maxChars);
  return { text, truncated: shown < total };
}
