/**
 * Decisions in the TUI (task-19, after spec-11/12).
 *
 * A decision is a standing choice, not work: it has no column and never
 * completes. So the loader lifts decisions out of the columns (where, with no
 * `column:`, they used to land in `todo`) and out of the done list, and they
 * get a view of their own: standing decisions grouped by claim-key family,
 * history (superseded, rejected, stale) folded below.
 *
 * Everything here is pure and reads core's API, so the view, the keyboard
 * hook and the loader agree on what a decision is and in which order the
 * rows run: `groupDecisionsByPrefix` for the families, `summarizeDecision`
 * for the fields, `buildDocGraph` for `decisions:` and its computed reverse.
 */
import {
  compareDecisionsNewestFirst,
  groupDecisionsByPrefix,
  isHistoricalStatus,
  resolveDocType,
  searchTasksRanked,
  summarizeDecision,
  type Board,
  type DecisionStatus,
  type DecisionSummary,
  type DocGraph,
  type Task,
  type TypesConfig,
} from '@brainfile/core';

/** The board's `types:`, which `Board` does not declare but the parsed config carries. */
export function boardTypes(board: Board | null | undefined): TypesConfig | undefined {
  return (board as unknown as { types?: TypesConfig } | null | undefined)?.types;
}

/** True for a document whose type plays the decision role on this board (adr, `like: decision`, …). */
export function isDecisionTask(task: Task | undefined, types?: TypesConfig): boolean {
  return Boolean(task) && resolveDocType(task!.type, types).role === 'decision';
}

/** True when a type-cycle stop names the decision role: the stop that shows the decisions view. */
export function isDecisionStop(type: string | undefined, types?: TypesConfig): boolean {
  if (!type || type === 'all') return false;
  return resolveDocType(type, types).role === 'decision';
}

/**
 * Lift decisions out of the columns and the archive. Board decisions come
 * first, then retired ones from logs/, so a graph built from them keeps the
 * board copy when an ID somehow appears in both.
 */
export function splitDecisions(
  board: Board,
  logs: Task[],
): { board: Board; logs: Task[]; decisions: Task[] } {
  const types = boardTypes(board);
  const decisions: Task[] = [];
  const columns = board.columns.map((column) => {
    const tasks = column.tasks ?? [];
    const work = tasks.filter((task) => {
      if (!isDecisionTask(task, types)) return true;
      decisions.push(task);
      return false;
    });
    return work.length === tasks.length ? column : { ...column, tasks: work };
  });
  const seen = new Set(decisions.map((task) => task.id));
  const work = logs.filter((task) => {
    if (!isDecisionTask(task, types)) return true;
    if (!seen.has(task.id)) {
      seen.add(task.id);
      decisions.push(task);
    }
    return false;
  });
  return { board: { ...board, columns }, logs: work, decisions };
}

/** Standing: still guidance. A legacy ADR that is only `proposed` stands too, and says so. */
export function isStanding(status: DecisionStatus): boolean {
  return !isHistoricalStatus(status);
}

/** The `/` filter over decisions: core's ranked search, so tokens mean what they do elsewhere. */
export function filterDecisions(decisions: Task[], query: string): Task[] {
  const q = query.trim();
  if (!q) return decisions;
  const docs = decisions.map((task) => ({ task, body: task.description ?? '' }));
  return searchTasksRanked(docs, q).map((match) => match.doc.task);
}

/** `YYYY-MM-DD` for today, local to nothing: validUntil is a date, compared as text. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True once `validUntil` has passed: the decision wants another look. */
export function isPastValidUntil(summary: Pick<DecisionSummary, 'validUntil'>, on = today()): boolean {
  return Boolean(summary.validUntil) && summary.validUntil!.slice(0, 10) < on;
}

/** The claim key after its family, which the group heading already says. */
export function claimKeyTail(claimKey: string | undefined): string {
  if (!claimKey) return '';
  const parts = claimKey.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : claimKey;
}

/** `superseded → decision-2`, `rejected`, `stale`: where a retired decision went. */
export function retiredLabel(summary: Pick<DecisionSummary, 'status' | 'supersededBy'>): string {
  return summary.supersededBy ? `${summary.status} → ${summary.supersededBy}` : summary.status;
}

// ── the view's lines ───────────────────────────────────────────────────────

export type DecisionLine =
  | { kind: 'heading'; label: string; count: number }
  | { kind: 'history'; count: number; open: boolean }
  | { kind: 'gap' }
  | { kind: 'note'; text: string }
  | {
      kind: 'row';
      task: Task;
      summary: DecisionSummary;
      retired: boolean;
      /** Index among the selectable rows: what `selectedTaskIndex` counts. */
      index: number;
    };

export interface DecisionViewModel {
  lines: DecisionLine[];
  /** The rows the cursor walks, in order: standing, then history when it is open. */
  selectable: Task[];
  standingCount: number;
  historyCount: number;
}

/** Heading for decisions with no claim key. */
export const UNFILED = 'unfiled';

/**
 * The decisions view, line by line: one heading per claim-key family (the
 * key's first segment, alphabetical, unfiled last: core's order), standing
 * decisions under it, then the history fold. Folded history keeps its
 * heading and count, so nothing is hidden without saying so.
 */
export function buildDecisionView(
  decisions: Task[],
  { historyOpen, types }: { historyOpen: boolean; types?: TypesConfig },
): DecisionViewModel {
  const lines: DecisionLine[] = [];
  const selectable: Task[] = [];
  const history: Task[] = [];

  const pushRow = (task: Task, retired: boolean) => {
    lines.push({ kind: 'row', task, summary: summarizeDecision(task), retired, index: selectable.length });
    selectable.push(task);
  };

  let standingCount = 0;
  for (const group of groupDecisionsByPrefix(decisions, types)) {
    const standing = group.families.flatMap((family) => [...family.current, ...family.other]);
    history.push(...group.families.flatMap((family) => family.history));
    if (standing.length === 0) continue;
    if (lines.length > 0) lines.push({ kind: 'gap' });
    lines.push({ kind: 'heading', label: group.prefix || UNFILED, count: standing.length });
    for (const task of standing) pushRow(task, false);
    standingCount += standing.length;
  }

  if (history.length > 0) {
    if (standingCount === 0) lines.push({ kind: 'note', text: 'No standing decisions' });
    lines.push({ kind: 'gap' });
    lines.push({ kind: 'history', count: history.length, open: historyOpen });
    if (historyOpen) {
      for (const task of [...history].sort(compareDecisionsNewestFirst)) pushRow(task, true);
    }
  }

  return { lines, selectable, standingCount, historyCount: history.length };
}

/** Where the selected row sits among the lines. */
export function selectedLineIndex(lines: DecisionLine[], selectedIndex: number): number {
  const at = lines.findIndex((line) => line.kind === 'row' && line.index === selectedIndex);
  return at < 0 ? 0 : at;
}

/** The window of lines to draw, keeping the selected row inside the viewport. */
export function windowLines(
  lines: DecisionLine[],
  selectedIndex: number,
  viewportHeight: number,
): { visible: DecisionLine[]; start: number } {
  if (lines.length <= viewportHeight) return { visible: lines, start: 0 };
  const selected = selectedLineIndex(lines, selectedIndex);
  const half = Math.floor(viewportHeight / 2);
  const start = Math.max(0, Math.min(selected - half, lines.length - viewportHeight));
  return { visible: lines.slice(start, start + viewportHeight), start };
}

// ── relations in the detail view ──────────────────────────────────────────

/** A decision named from the detail view: one it replaces or was replaced by, or one work rests on. */
export interface DecisionRef {
  relation: 'rests-on' | 'replaces' | 'replaced-by';
  id: string;
  /** The decision, when it is on this board. */
  task?: Task;
  summary?: DecisionSummary;
  /** Why it cannot be opened, when it cannot. */
  missing?: 'not on this board' | 'on a related board' | 'not a decision';
}

/** What the detail view shows around a document besides its own fields. */
export interface DetailRelations {
  /** Set when the document is a decision. */
  decision?: DecisionSummary;
  /** A decision's chain (replaces, replaced by), or the decisions work rests on. */
  refs: DecisionRef[];
  /** For a decision: open work resting on it. */
  resting: Task[];
}

export const NO_RELATIONS: DetailRelations = { refs: [], resting: [] };

function refFor(relation: DecisionRef['relation'], id: string, graph: DocGraph): DecisionRef {
  if (id.includes(':')) return { relation, id, missing: 'on a related board' };
  const task = graph.get(id);
  if (!task) return { relation, id, missing: 'not on this board' };
  if (graph.typeOf(task).role !== 'decision') return { relation, id, task, missing: 'not a decision' };
  return { relation, id, task, summary: summarizeDecision(task) };
}

/**
 * A document's decision relations. A decision: what it replaces, what
 * replaced it, and the open work resting on it (`decisions:` reversed by the
 * graph, never written twice). Work: the decisions it rests on.
 */
export function relationsFor(task: Task | undefined, graph: DocGraph): DetailRelations {
  if (!task) return NO_RELATIONS;
  if (graph.typeOf(task).role === 'decision') {
    const decision = summarizeDecision(task);
    const refs = [
      ...decision.supersedes.map((id) => refFor('replaces', id, graph)),
      ...(decision.supersededBy ? [refFor('replaced-by', decision.supersededBy, graph)] : []),
    ];
    const resting = graph.restingOn(task.id).filter((t) => graph.isOpenWork(t));
    return { decision, refs, resting };
  }
  const refs = graph.decisionsOf(task.id).map((link) => refFor('rests-on', link.id, graph));
  return { refs, resting: [] };
}

/** True for a ref to a decision that no longer stands: superseded, rejected or stale. */
export function isRetiredRef(ref: DecisionRef): boolean {
  return Boolean(ref.summary && isHistoricalStatus(ref.summary.status));
}

/**
 * Open work resting on a retired decision: the rows that say
 * `decision changed`. Superseded, rejected and stale all count; a decision
 * still `proposed` does not, since it never stood.
 */
export function workOnRetiredDecisions(graph: DocGraph): Set<string> {
  const out = new Set<string>();
  for (const task of graph.tasks) {
    if (!graph.isOpenWork(task)) continue;
    const links = graph.decisionsOf(task.id);
    if (links.some((link) => link.isDecision && link.status && isHistoricalStatus(link.status))) {
      out.add(task.id);
    }
  }
  return out;
}
