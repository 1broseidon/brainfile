/**
 * An epic's lead (decision-15, spec-16 phase 2). Handing off a document that
 * has children starts a lead: an agent with no worktree that writes no code,
 * the board chat's kind (decision-14), with the desk scoped to its tree. It
 * checks the plan first (its children, the files each touches, whether the
 * dependencies are right), then hands the children off in order, and is
 * woken with a new turn when one ends, lands or is sent back; it never polls.
 *
 * The app holds the rules the lead cannot bend, here: a child goes only once
 * its dependsOn are done (startDispatch's own check), at most `limit`
 * hand-offs at once in the repository, retries to the contract's maxRetries,
 * only children under its epic with none of their own, one lead per tree,
 * and only the lead dispatches in it. Children it adds wait for the person,
 * unless the epic was handed off until done (a bypass repository), where the
 * app also lands each child that ends in Review. The epic is completed with
 * its last child; an epic with a branch of its own (`epicBranch`,
 * decision-16) has the lead make that branch when it starts, and with its
 * last child it waits in Ready to merge instead, for the person to say where
 * its branch goes.
 *
 * The board is its memory: `lead:` on the epic says one is meant to run, the
 * plan is in notes on the epic, and a lead lost to a restart is resumed from
 * there. Nothing here touches Electron, an agent or the board: the agents
 * process gives it those as `LeadDeps`, and `npm test` drives it with fakes.
 */
import type { AgentId, AgentRun, LeadRecord, LeadState, LeadView, PermissionPolicy, Result } from '../shared/api';

/** A document under an epic, as the lead and its rules read it. */
export interface TreeDoc {
  id: string;
  title: string;
  parentId?: string;
  /** Completed: in logs/. */
  done: boolean;
  /** Completed, but its hand-off's branch has not landed: what depends on it still waits. */
  unlanded?: boolean;
  /** Its column's title, when open. */
  column?: string;
  /** In the board's review column. */
  inReview?: boolean;
  dependsOn: string[];
  /** What it touches: its relatedFiles and its contract's deliverables. */
  files: string[];
  validation: string[];
  maxRetries?: number;
  createdAt?: string;
}

/** The epic and everything under it, at any depth. */
export interface Tree {
  epic: TreeDoc;
  children: TreeDoc[];
  /** Every document on the board, open and done, by ID: dependencies can reach outside the tree. */
  all: Map<string, TreeDoc>;
}

/** The descendants of `epicId` by parentId, nearest first; null when the epic is not on the board. */
export function treeOf(docs: TreeDoc[], epicId: string): Tree | null {
  const all = new Map(docs.map((d) => [d.id, d]));
  const epic = all.get(epicId);
  if (!epic) return null;
  const children: TreeDoc[] = [];
  const seen = new Set([epicId]);
  for (let at = [epicId]; at.length; ) {
    const next = docs.filter((d) => d.parentId && at.includes(d.parentId) && !seen.has(d.id));
    for (const d of next) seen.add(d.id);
    children.push(...next);
    at = next.map((d) => d.id);
  }
  return { epic, children, all };
}

const parentsIn = (tree: Tree) => new Set(tree.children.map((c) => c.parentId).filter((p): p is string => !!p));

/** Children the lead hands off: open, with no children of their own. */
export function workOf(tree: Tree): TreeDoc[] {
  const parents = parentsIn(tree);
  return tree.children.filter((c) => !c.done && !parents.has(c.id));
}

/**
 * A dependency on this board still open, or complete with its branch not
 * landed yet; one on a related board (`alias:task-1`) is not the lead's to wait on.
 */
function openDeps(doc: TreeDoc, all: Map<string, TreeDoc>): string[] {
  return doc.dependsOn.filter((ref) => {
    const dep = all.get(ref);
    return !ref.includes(':') && !!dep && (!dep.done || !!dep.unlanded);
  });
}

/** Children whose dependencies are all done and landed: the ones that can be handed off now. */
export function readyOf(tree: Tree): TreeDoc[] {
  return workOf(tree).filter((c) => openDeps(c, tree.all).length === 0);
}

/** Two paths name the same code: the same file, or one a folder holding the other. */
function sameCode(a: string, b: string): boolean {
  const clean = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '');
  const x = clean(a);
  const y = clean(b);
  return x === y || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
}

/** Whether `from` waits on `to`, directly or through others. */
function waitsOn(from: string, to: string, all: Map<string, TreeDoc>): boolean {
  const seen = new Set<string>();
  for (let at = [from]; at.length; ) {
    const next: string[] = [];
    for (const id of at) {
      for (const dep of all.get(id)?.dependsOn ?? []) {
        if (dep === to) return true;
        if (!seen.has(dep)) {
          seen.add(dep);
          next.push(dep);
        }
      }
    }
    at = next;
  }
  return false;
}

/** What the app finds in the plan before the lead starts: problems to settle, and the order dependsOn gives. */
export interface PlanReport {
  problems: string[];
  /** The open work in waves: each wave waits only on earlier ones. A cycle leaves its members out. */
  waves: string[][];
}

/**
 * The app's own reading of the plan, for the lead's first turn: children that
 * touch the same code and neither waits on the other (they would conflict if
 * run together), dependencies that are missing, circular or outside the epic
 * and still open, children that name no files or carry no validation, and
 * the order dependsOn gives.
 */
export function planReport(tree: Tree): PlanReport {
  const problems: string[] = [];
  const work = workOf(tree);
  const parents = parentsIn(tree);
  const inTree = new Set(tree.children.map((c) => c.id));

  for (let i = 0; i < work.length; i++) {
    for (let j = i + 1; j < work.length; j++) {
      const a = work[i];
      const b = work[j];
      const shared = a.files.filter((f) => b.files.some((g) => sameCode(f, g)));
      if (shared.length && !waitsOn(a.id, b.id, tree.all) && !waitsOn(b.id, a.id, tree.all)) {
        problems.push(`${a.id} and ${b.id} both touch ${shared.slice(0, 3).join(', ')}, and neither waits on the other: run together, they will conflict.`);
      }
    }
  }
  for (const c of tree.children.filter((c) => !c.done)) {
    for (const dep of c.dependsOn.filter((d) => !d.includes(':'))) {
      const target = tree.all.get(dep);
      if (!target) problems.push(`${c.id} depends on ${dep}, which is not on this board.`);
      else if (!inTree.has(dep) && dep !== tree.epic.id && !target.done) problems.push(`${c.id} waits on ${dep}, outside ${tree.epic.id} and still open: it cannot start until someone does ${dep}.`);
      else if (dep === tree.epic.id) problems.push(`${c.id} depends on its own epic, ${dep}, which is done only after it: drop that dependency.`);
    }
    if (waitsOn(c.id, c.id, tree.all)) problems.push(`${c.id} waits on itself through its dependencies: break the cycle.`);
  }
  for (const c of work) {
    if (!c.files.length) problems.push(`${c.id} names no files: what it touches, and so what it collides with, cannot be seen. Add its relatedFiles.`);
    if (!c.validation.length) problems.push(`${c.id} has no validation commands: only its agent's word says it is done.`);
  }
  for (const c of tree.children.filter((c) => !c.done && parents.has(c.id))) {
    problems.push(`${c.id} has children of its own: its children are handed off, not it.`);
  }

  const waves: string[][] = [];
  const placed = new Set(tree.children.filter((c) => c.done).map((c) => c.id));
  let left = work.filter((c) => !waitsOn(c.id, c.id, tree.all));
  while (left.length) {
    const wave = left.filter((c) => c.dependsOn.every((d) => d.includes(':') || !inTree.has(d) || placed.has(d) || parents.has(d)));
    if (!wave.length) break;
    waves.push(wave.map((c) => c.id));
    for (const c of wave) placed.add(c.id);
    left = left.filter((c) => !placed.has(c.id));
  }
  return { problems, waves };
}

/** One lead, as the manager keeps it. */
export interface Lead {
  projectId: string;
  epicId: string;
  agentId: AgentId;
  model?: string;
  effort?: string;
  by: 'person' | 'chat';
  state: LeadState;
  until: 'review' | 'done';
  startedAt: number;
  /** ISO, for comparing with a child's createdAt: one added after it waits for the person. */
  startedIso: string;
  note?: string;
  /** Taken over from the board after a restart: its first turn reads its notes first. */
  resumed: boolean;
  /** What happened since its last turn, one line each. */
  queue: string[];
  /** A turn is running. */
  busy: boolean;
  /** Hand-offs it made, per child. */
  attempts: Map<string, number>;
  /** Children seen done, so one completed by the person wakes it once. */
  doneSeen: Set<string>;
  /** Children the app is landing: their completion is said by the landing, not by the board's change. */
  landing: Set<string>;
  /** Turns that failed in a row. */
  failures: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Its first turn has run: the next ones carry only what happened. */
  briefed: boolean;
  /** The epic's own branch (decision-16), made when it started: its children fork from and land on it. */
  branch?: string;
}

export interface LeadTurn {
  run: AgentRun;
  /** Settles when the turn ends: `stopped` when the person stopped it. */
  done: Promise<{ ok: boolean; stopped?: boolean; reply?: string; error?: string }>;
}

/** What the lead needs from the agents process. */
export interface LeadDeps {
  /** The epic's tree as the board has it now; null when the epic is gone. */
  tree(projectId: string, epicId: string): Tree | null;
  /** Hand-offs live in the repository now. */
  live(projectId: string): AgentRun[];
  /** The latest hand-off run on a task, live or ended. */
  lastRun(projectId: string, taskId: string): AgentRun | undefined;
  policy(projectId: string): PermissionPolicy;
  limit(projectId: string): number;
  /**
   * One turn of the lead: in its session, or a new one when it has none
   * (then `prompt(true)`, the whole brief). The run exists when this returns.
   */
  turn(lead: Lead, prompt: (fresh: boolean) => string): LeadTurn;
  /** Stops a turn under way and lets the lead's session go. */
  close(lead: Lead): void;
  record(projectId: string, epicId: string, record: LeadRecord | null): Promise<Result>;
  complete(projectId: string, epicId: string): Promise<Result>;
  /** The child's branch can merge now, with no conflict. */
  mergeable(projectId: string, taskId: string): boolean;
  /** Lands a child as Merge does, checks first; what happened, in a line. */
  land(projectId: string, taskId: string): Promise<{ ok: boolean; said: string }>;
  /**
   * The epic's own branch (decision-16), made from its target as the lead
   * starts: its name, or null when the epic has none. Absent: none has one.
   */
  branch?(projectId: string, epicId: string): Result<string | null>;
  /**
   * Its last child done, an epic with a branch of its own goes to Ready to
   * merge instead of being completed (decision-16): its branch and where
   * Merge would put it, or null when it has nothing to merge, and is completed
   * as before. Absent: every epic is completed.
   */
  offer?(projectId: string, epicId: string): Promise<Result<{ branch: string; into: string } | null>>;
  emit(view: LeadView): void;
  /** Waits before a turn, so events that come together make one turn. */
  later(ms: number, fn: () => void): ReturnType<typeof setTimeout>;
}

/** The default most hand-offs at once in a repository. */
export const DEFAULT_LIMIT = 3;
/** Events within this long of each other make one turn. */
export const GATHER_MS = 1500;
/** Turns that fail in a row before the lead pauses itself. */
const FAILURES = 3;

const ended = (run: AgentRun) => run.state === 'done' || run.state === 'failed' || run.state === 'stopped';

/**
 * What a lead is told when its session is new: who it is, the rules, and how
 * it works. `continuing`: it has led this epic before (a restart, or a
 * session let go while it waited), so it reads its notes rather than
 * checking the plan again.
 */
export function leadPreamble(lead: Lead, tree: Tree, limit: number, continuing = lead.resumed): string {
  const { epic } = tree;
  const until =
    lead.until === 'done'
      ? 'This repository runs in bypass: each child that ends in Review is checked and landed by the app, and a landed child is done. Children you add may be handed off.'
      : 'Each child ends in Review, and the person merges it; a merged child is done. Children you add wait for the person to hand them off.';
  return (
    `You lead ${epic.id} ("${epic.title}") on this repository's Brainfile board: you orchestrate its children, and you write no code. ` +
    'Use the brainfile MCP tools for the board (never edit its files by hand), and the desk to have work done: `dispatch` hands a child to a coding agent in its own worktree (agent and model are optional: by default, you and your model), `runs` says what is running, `stop` stops one. ' +
    'You may read the code and run git commands that only read; edits and other commands are refused.\n\n' +
    `The app holds these rules, and refuses what breaks them: a child is handed off only once its dependsOn are done and their branches landed on their own target; at most ${limit} hand-offs at once in this repository; a child is retried at most its contract's maxRetries; you hand off only children under ${epic.id} that have none of their own. ${until} ` +
    (lead.branch
      ? `${epic.id} has a branch of its own, ${lead.branch}: each child forks from it and lands on it, not on the trunk, and the app brings ${epic.id}'s target into it before each hand-off. When the last child is done, ${epic.id} waits in Ready to merge for the person to say where ${lead.branch} goes. `
      : '') +
    'You are woken with a new turn when a child ends, lands or is sent back, or when the person resumes you: never wait, sleep or poll.\n\n' +
    (continuing
      ? `You are carrying on with ${epic.id}: the plan is in the notes on ${epic.id}. Read them and the board, then carry on from where it stands.\n\n`
      : `First, check the plan before handing anything off. Read each child, the files it names and the code it will change. Where two children would change the same code, or one needs what another builds, make the later one wait: add to its dependsOn with task_patch. Split a child that is too large into children under it. Fix a contract whose validation would not prove the work done. Make sure the epic ends with its pieces working together: when each child builds a part, one child must wire them and test the whole against the epic's description of done; add that child, last, if none does. The app's own reading of the plan is below. Then write the plan as a note on ${epic.id}: the order and why, so another lead can pick it up. Then hand off what is ready, up to the limit, choosing the agent and model for each.\n\n`) +
    `On later turns: read what happened, look at the board, and act. Hand off what became ready; re-dispatch a child that failed, after a note on it saying what to do differently; when a child's notes leave something for a later task, put it in that task's description with task_patch, or add a child for it; and when the plan is wrong, say why in a note on ${epic.id} and hand off nothing more. Never merge, complete or move children yourself. Reply in a sentence or two: what you did, and what you are waiting for.\n\n`
  );
}

/** The app's reading of the plan, as the lead's first turn shows it. */
export function reportText(report: PlanReport): string {
  const lines: string[] = [];
  lines.push(report.problems.length ? `The app's reading of the plan finds:\n${report.problems.map((p) => `- ${p}`).join('\n')}` : "The app's reading of the plan finds nothing wrong.");
  if (report.waves.length) lines.push(`By dependsOn, the order is:\n${report.waves.map((w, i) => `${i + 1}. ${w.join(', ')}`).join('\n')}`);
  return `${lines.join('\n\n')}\n\n`;
}

/** The tree as it stands, one line a child, with what the app knows of its hand-off. */
export function treeText(lead: Lead, tree: Tree, deps: Pick<LeadDeps, 'live' | 'lastRun' | 'mergeable' | 'limit'>): string {
  const parents = parentsIn(tree);
  const live = deps.live(lead.projectId);
  const limit = deps.limit(lead.projectId);
  const byId = (a: TreeDoc, b: TreeDoc) => a.id.localeCompare(b.id, undefined, { numeric: true });
  const lines = [...tree.children].sort(byId).map((c) => {
    const parts = [`- ${c.id} "${c.title}"`];
    if (c.done) {
      parts.push(c.unlanded ? 'complete, its branch not landed: what waits on it still waits' : 'done');
      if (c.unlanded && deps.mergeable(lead.projectId, c.id)) parts.push(lead.until === 'done' ? 'ready to land' : 'ready to merge (the person merges it)');
    } else {
      parts.push(c.column ?? 'open');
      if (parents.has(c.id)) parts.push('has children');
      const run = live.find((r) => r.taskId === c.id);
      if (run) parts.push(`${run.agentId} ${run.state === 'waiting' ? 'asking the person' : run.activity}`);
      else {
        const last = deps.lastRun(lead.projectId, c.id);
        if (last && ended(last)) parts.push(`last hand-off ${last.state}${last.error ? `: ${last.error}` : ''}`);
        if (deps.mergeable(lead.projectId, c.id)) parts.push(lead.until === 'done' ? 'ready to land' : 'ready to merge (the person merges it)');
        const waits = openDeps(c, tree.all);
        if (waits.length) parts.push(`waits on ${waits.join(', ')}`);
        else if (!parents.has(c.id) && !c.inReview && !deps.mergeable(lead.projectId, c.id)) parts.push('ready');
      }
      const tries = lead.attempts.get(c.id);
      if (tries) parts.push(`handed off ${tries}×`);
      if (addedByLead(lead, c) && lead.until === 'review') parts.push('added after you started: waits for the person');
    }
    return parts.join(' · ');
  });
  return `${tree.epic.id} now (${live.length} of ${limit} hand-offs running in this repository):\n${lines.join('\n')}\n\n`;
}

function addedByLead(lead: Lead, doc: TreeDoc): boolean {
  return !!doc.createdAt && doc.createdAt > lead.startedIso;
}

export class Leads {
  private leads = new Map<string, Lead>();
  private deps: LeadDeps;

  constructor(deps: LeadDeps) {
    this.deps = deps;
  }

  private key(projectId: string, epicId: string): string {
    return `${projectId}\n${epicId}`;
  }

  get(projectId: string, epicId: string): Lead | undefined {
    return this.leads.get(this.key(projectId, epicId));
  }

  private active(lead: Lead | undefined): lead is Lead {
    return !!lead && (lead.state === 'leading' || lead.state === 'paused');
  }

  /** The running lead whose tree holds `taskId` (or that leads it), if any. */
  leadOver(projectId: string, taskId: string): Lead | undefined {
    for (const lead of this.leads.values()) {
      if (lead.projectId !== projectId || !this.active(lead)) continue;
      if (lead.epicId === taskId) return lead;
      const tree = this.deps.tree(projectId, lead.epicId);
      if (tree?.children.some((c) => c.id === taskId)) return lead;
    }
    return undefined;
  }

  view(lead: Lead): LeadView {
    const tree = this.deps.tree(lead.projectId, lead.epicId);
    const waiting =
      tree && lead.until === 'review'
        ? workOf(tree)
            .filter((c) => addedByLead(lead, c) && !this.deps.lastRun(lead.projectId, c.id))
            .map((c) => c.id)
        : [];
    return {
      projectId: lead.projectId,
      epicId: lead.epicId,
      agentId: lead.agentId,
      ...(lead.model ? { model: lead.model } : {}),
      ...(lead.effort ? { effort: lead.effort } : {}),
      state: lead.state,
      until: lead.until,
      limit: this.deps.limit(lead.projectId),
      startedAt: lead.startedAt,
      ...(lead.note ? { note: lead.note } : {}),
      queued: lead.queue.length,
      waitingForYou: waiting,
    };
  }

  views(): LeadView[] {
    return [...this.leads.values()].map((l) => this.view(l));
  }

  private emit(lead: Lead): void {
    this.deps.emit(this.view(lead));
  }

  /**
   * Starts a lead on an epic with children: refused when the epic has no open
   * work, or when its tree already has one (above it or under it).
   */
  async start(
    projectId: string,
    epicId: string,
    agentId: AgentId,
    options: { model?: string; effort?: string; by?: 'person' | 'chat'; resumed?: boolean } = {}
  ): Promise<Result<{ lead: LeadView; run: AgentRun | null }>> {
    const tree = this.deps.tree(projectId, epicId);
    if (!tree) return { ok: false, error: `${epicId} is not on this board` };
    if (tree.epic.done) return { ok: false, error: `${epicId} is done` };
    if (!workOf(tree).length) return { ok: false, error: `${epicId} has no open children to lead` };
    const here = this.get(projectId, epicId);
    if (this.active(here)) return { ok: false, error: `${epicId} already has a lead: ${here.agentId}, ${here.state}` };
    for (const other of this.leads.values()) {
      if (other.projectId !== projectId || !this.active(other) || other.epicId === epicId) continue;
      if (tree.children.some((c) => c.id === other.epicId)) return { ok: false, error: `${other.epicId}, under ${epicId}, has a lead already: stop it first` };
      if (this.deps.tree(projectId, other.epicId)?.children.some((c) => c.id === epicId)) {
        return { ok: false, error: `${epicId} is under ${other.epicId}, whose lead runs it` };
      }
    }
    // The epic's own branch, made before anything is handed off from it (decision-16).
    const branch = this.deps.branch?.(projectId, epicId) ?? { ok: true as const, value: null };
    if (!branch.ok) return { ok: false, error: `${epicId}'s branch could not be made: ${branch.error}` };
    const until = this.deps.policy(projectId) === 'bypass' ? 'done' : 'review';
    const now = Date.now();
    const lead: Lead = {
      projectId,
      epicId,
      agentId,
      model: options.model,
      effort: options.effort,
      by: options.by ?? 'person',
      state: 'leading',
      until,
      startedAt: now,
      startedIso: new Date(now).toISOString(),
      resumed: !!options.resumed,
      queue: [options.resumed ? 'The person resumed you.' : `The person handed you ${epicId}.`],
      busy: false,
      attempts: new Map(),
      doneSeen: new Set(tree.children.filter((c) => c.done).map((c) => c.id)),
      landing: new Set(),
      failures: 0,
      timer: null,
      briefed: false,
      ...(branch.value ? { branch: branch.value } : {}),
    };
    const record: LeadRecord = {
      agent: agentId,
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      by: lead.by,
      at: lead.startedIso,
      until,
    };
    this.leads.set(this.key(projectId, epicId), lead);
    const written = await this.deps.record(projectId, epicId, record);
    if (!written.ok) lead.note = `The lead is not on the board: ${written.error}`;
    const run = this.kick(lead);
    this.emit(lead);
    return { ok: true, value: { lead: this.view(lead), run } };
  }

  /**
   * Whether the lead may hand off `taskId` now: the rules it cannot bend,
   * besides dependsOn (the hand-off checks those itself). `dispatched` counts
   * the try once the hand-off has started.
   */
  mayDispatch(projectId: string, epicId: string, taskId: string): Result {
    const lead = this.get(projectId, epicId);
    if (!lead || !this.active(lead)) return { ok: false, error: `You no longer lead ${epicId}` };
    if (lead.state === 'paused') return { ok: false, error: `The person paused you: hand nothing off until you are resumed` };
    const tree = this.deps.tree(projectId, epicId);
    const child = tree?.children.find((c) => c.id === taskId);
    if (!tree || !child) return { ok: false, error: `${taskId} is not under ${epicId}: you hand off its children only` };
    if (child.done) return { ok: false, error: `${taskId} is done` };
    if (parentsIn(tree).has(taskId)) return { ok: false, error: `${taskId} has children of its own: hand those off instead` };
    if (addedByLead(lead, child) && lead.until === 'review') {
      return { ok: false, error: `${taskId} was added after you started: it waits for the person to hand it off. Say so in your reply.` };
    }
    const allowed = Math.max(0, child.maxRetries ?? 1);
    const tries = lead.attempts.get(taskId) ?? 0;
    if (tries > allowed) {
      return { ok: false, error: `${taskId} has been handed off ${tries} times, and its contract allows ${allowed} ${allowed === 1 ? 'retry' : 'retries'}: leave it for the person, with a note on it saying what went wrong` };
    }
    const live = this.deps.live(projectId);
    const limit = this.deps.limit(projectId);
    if (live.length >= limit) return { ok: false, error: `${live.length} hand-offs are running in this repository, the most at once (${limit}): you are woken when one ends` };
    return { ok: true, value: undefined };
  }

  /**
   * The app is landing `taskId` (Merge, or a landing of its own): until the
   * returned release, the board's change that completes it is not news, as
   * the landing says how it went.
   */
  landing(projectId: string, taskId: string): () => void {
    const lead = this.leadOver(projectId, taskId);
    if (!lead || lead.epicId === taskId) return () => {};
    lead.landing.add(taskId);
    return () => {
      lead.landing.delete(taskId);
      const tree = this.deps.tree(projectId, lead.epicId);
      if (tree?.children.find((c) => c.id === taskId)?.done) lead.doneSeen.add(taskId);
    };
  }

  /** The lead's hand-off of `taskId` started: one more try. */
  dispatched(projectId: string, epicId: string, taskId: string): void {
    const lead = this.get(projectId, epicId);
    if (lead) lead.attempts.set(taskId, (lead.attempts.get(taskId) ?? 0) + 1);
  }

  /** A hand-off asked by someone else (`chat`) inside a led tree is refused; the person's own is theirs to make, and takes it off the waiting list. */
  guard(projectId: string, taskId: string, by: 'person' | 'chat'): Result {
    const lead = this.leadOver(projectId, taskId);
    if (!lead) return { ok: true, value: undefined };
    if (by === 'chat') return { ok: false, error: `${lead.epicId}'s lead runs ${taskId === lead.epicId ? 'it' : 'that tree'}: only the lead hands off its children. Pause or stop it first.` };
    if (lead.epicId === taskId) return { ok: false, error: `${taskId} already has a lead: ${lead.agentId}, ${lead.state}` };
    return { ok: true, value: undefined };
  }

  /** Something happened to `taskId`: the lead over it hears it in its next turn. */
  wake(projectId: string, taskId: string, what: string): void {
    const lead = this.leadOver(projectId, taskId);
    if (!lead || lead.epicId === taskId) return;
    lead.queue.push(what);
    this.gather(lead);
    this.emit(lead);
  }

  /** A child's hand-off ended. Until done, one in Review that can merge is landed first, and the lead hears both. */
  async childEnded(run: AgentRun): Promise<void> {
    if (run.kind !== 'dispatch' || !run.taskId) return;
    const lead = this.leadOver(run.projectId, run.taskId);
    if (!lead || lead.epicId === run.taskId) return;
    const said =
      run.state === 'done'
        ? `${run.taskId}: ${run.agentId} finished${run.reply ? `: "${run.reply.slice(0, 300)}"` : ''}.`
        : run.state === 'failed'
          ? `${run.taskId}: ${run.agentId} failed: ${run.error ?? 'no reason given'}.`
          : `${run.taskId}: ${run.agentId} was stopped.`;
    lead.queue.push(said);
    if (lead.until === 'done' && run.state === 'done' && lead.state === 'leading' && this.deps.mergeable(run.projectId, run.taskId)) {
      const release = this.landing(run.projectId, run.taskId);
      try {
        const landed = await this.deps.land(run.projectId, run.taskId);
        lead.queue.push(landed.said);
      } finally {
        release();
      }
    }
    this.gather(lead);
    this.emit(lead);
  }

  /**
   * The board changed: a child the person completed wakes the lead, and an
   * epic whose children are all done is completed and its lead ends.
   */
  boardChanged(projectId: string): void {
    for (const lead of this.leads.values()) {
      if (lead.projectId !== projectId || !this.active(lead)) continue;
      const tree = this.deps.tree(projectId, lead.epicId);
      if (!tree) {
        void this.end(lead, 'stopped', `${lead.epicId} is no longer on the board`);
        continue;
      }
      // One the app is landing is said by the landing.
      for (const c of tree.children) if (c.done && lead.landing.has(c.id)) lead.doneSeen.add(c.id);
      const fresh = tree.children.filter((c) => c.done && !lead.doneSeen.has(c.id));
      for (const c of fresh) {
        lead.doneSeen.add(c.id);
        lead.queue.push(c.unlanded ? `${c.id} is complete, but its branch has not landed: what waits on it still waits.` : `${c.id} is done.`);
      }
      if (fresh.length) this.gather(lead);
    }
  }

  pause(projectId: string, epicId: string): Result {
    const lead = this.get(projectId, epicId);
    if (!lead || lead.state !== 'leading') return { ok: false, error: `${epicId} has no lead at work` };
    lead.state = 'paused';
    lead.note = 'Paused: it hands off nothing until resumed; what is running goes on.';
    this.emit(lead);
    return { ok: true, value: undefined };
  }

  /** Resumes a paused lead; one on the board with none running (a restart) starts again from the board. */
  async resume(projectId: string, epicId: string, fromBoard?: { agentId: AgentId; model?: string; effort?: string; by?: 'person' | 'chat' }): Promise<Result> {
    const lead = this.get(projectId, epicId);
    if (lead?.state === 'paused') {
      lead.state = 'leading';
      lead.failures = 0;
      lead.note = undefined;
      lead.queue.push('The person resumed you.');
      this.kick(lead);
      this.emit(lead);
      return { ok: true, value: undefined };
    }
    if (lead?.state === 'leading') return { ok: true, value: undefined };
    if (!fromBoard) return { ok: false, error: `${epicId} has no lead to resume` };
    const started = await this.start(projectId, epicId, fromBoard.agentId, { ...fromBoard, resumed: true });
    return started.ok ? { ok: true, value: undefined } : started;
  }

  /** Stops the lead: what it handed off goes on, and is the person's now. */
  async stop(projectId: string, epicId: string): Promise<Result> {
    const lead = this.get(projectId, epicId);
    if (!lead || !this.active(lead)) {
      // A lead left on the board by a restart is taken off.
      const cleared = await this.deps.record(projectId, epicId, null);
      return cleared.ok ? { ok: true, value: undefined } : cleared;
    }
    await this.end(lead, 'stopped', 'Stopped by the person: what it handed off goes on, and is yours now.');
    return { ok: true, value: undefined };
  }

  private async end(lead: Lead, state: 'stopped' | 'done', note: string, record = true): Promise<void> {
    if (lead.timer) clearTimeout(lead.timer);
    lead.timer = null;
    lead.state = state;
    lead.note = note;
    lead.queue = [];
    this.deps.close(lead);
    this.emit(lead);
    if (record) await this.deps.record(lead.projectId, lead.epicId, null);
  }

  /** Events that come together make one turn. */
  private gather(lead: Lead): void {
    if (lead.timer) clearTimeout(lead.timer);
    lead.timer = this.deps.later(GATHER_MS, () => {
      lead.timer = null;
      this.kick(lead);
    });
  }

  /**
   * A turn, when the lead is leading, idle, and has something to hear. An
   * epic whose children are all done is completed instead.
   */
  private kick(lead: Lead): AgentRun | null {
    if (lead.state !== 'leading' || lead.busy || !lead.queue.length) return null;
    const tree = this.deps.tree(lead.projectId, lead.epicId);
    if (!tree) {
      void this.end(lead, 'stopped', `${lead.epicId} is no longer on the board`);
      return null;
    }
    if (tree.children.length && tree.children.every((c) => c.done && !c.unlanded)) {
      void this.finish(lead);
      return null;
    }
    lead.busy = true;
    const events = lead.queue.splice(0);
    const limit = this.deps.limit(lead.projectId);
    const happened = `What happened:\n${events.map((e) => `- ${e}`).join('\n')}\n\n`;
    const prompt = (fresh: boolean) => {
      const whole = fresh || !lead.briefed;
      const continuing = lead.resumed || lead.briefed;
      return (
        (whole ? leadPreamble(lead, tree, limit, continuing) + (continuing ? '' : reportText(planReport(tree))) : '') +
        happened +
        treeText(lead, tree, this.deps)
      );
    };
    const { run, done } = this.deps.turn(lead, prompt);
    void done.then((outcome) => {
      lead.busy = false;
      if (outcome.stopped && lead.state === 'leading') {
        // The person stopped its turn: it waits for them.
        lead.state = 'paused';
        lead.note = 'Paused: its turn was stopped. Resume it to carry on.';
        lead.queue.unshift(...events);
      } else if (outcome.ok) {
        lead.briefed = true;
        lead.failures = 0;
        if (outcome.reply) lead.note = outcome.reply.slice(0, 400);
      } else if (lead.state === 'leading') {
        lead.failures += 1;
        lead.note = `Its turn failed: ${outcome.error ?? 'no reason given'}`;
        // A new session next time, with the whole brief: the old one may be what failed.
        lead.briefed = false;
        if (lead.failures >= FAILURES) {
          lead.state = 'paused';
          lead.note = `Paused after ${FAILURES} failed turns: ${outcome.error ?? 'no reason given'}`;
        } else lead.queue.unshift(...events);
      }
      this.emit(lead);
      const after = this.deps.tree(lead.projectId, lead.epicId);
      if (lead.state === 'leading' && after && after.children.length && after.children.every((c) => c.done && !c.unlanded)) void this.finish(lead);
      else if (lead.queue.length) this.gather(lead);
    });
    return run;
  }

  /** The last child is done: the epic is completed, or, with a branch of its own, waits in Ready to merge; and the lead ends. */
  private async finish(lead: Lead): Promise<void> {
    if (lead.state === 'done' || lead.landing.has(lead.epicId)) return;
    // Once only, however many wakes find it finished; the record comes off while the epic is still on the board.
    lead.landing.add(lead.epicId);
    await this.deps.record(lead.projectId, lead.epicId, null);
    const offered = this.deps.offer ? await this.deps.offer(lead.projectId, lead.epicId) : { ok: true as const, value: null };
    if (!offered.ok) {
      await this.end(lead, 'done', `Every child is done; ${lead.epicId}'s branch could not be put up to merge: ${offered.error}`, false);
      return;
    }
    if (offered.value) {
      await this.end(lead, 'done', `Every child is done: ${lead.epicId} is in Ready to merge, ${offered.value.branch} into ${offered.value.into}.`, false);
      return;
    }
    const completed = await this.deps.complete(lead.projectId, lead.epicId);
    await this.end(lead, 'done', completed.ok ? `${lead.epicId} is done: every child is.` : `Every child is done; ${lead.epicId} could not be completed: ${completed.error}`, false);
  }
}
