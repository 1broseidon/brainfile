/**
 * The board as a graph (spec-12): containment through `parentId`, order
 * through `dependsOn`, and the decisions a piece of work rests on through
 * `decisions:`. Built from documents the caller has already read, so it is
 * pure and browser-safe; `readBoardGraph` in `boardGraph.ts` reads a board
 * from disk into one.
 *
 * The reverse of `decisions:` ("what rests on this decision") is computed
 * here and never written on the decision.
 *
 * @packageDocumentation
 */

import type { LintIssue } from './linter';
import type { DecisionStatus, Task } from './types/base';
import type { TypesConfig } from './types/board';
import { canonicalTypeName, parentFit, resolveDocType, type ResolvedDocType } from './docTypes';
import { isQualifiedRef } from './related';

// ── decisions ──────────────────────────────────────────────────────────────

/** The statuses spec-11 gives a decision. */
export const DECISION_STATUSES: readonly DecisionStatus[] = ['current', 'superseded', 'rejected', 'stale'];

const CURRENT = new Set(['current', 'accepted', 'promoted', 'active']);
const STALE = new Set(['stale', 'deprecated', 'expired']);
const PROPOSED = new Set(['proposed', 'draft']);

/**
 * Where a decision stands. `supersededBy` wins over any status. Legacy ADR
 * spellings map across (`accepted`/`promoted` → current, `deprecated` →
 * stale). With no status, a `decision` is current and a legacy `type: adr`
 * is proposed, as it always was.
 */
export function decisionStatus(task: Pick<Task, 'type'> & { status?: unknown; supersededBy?: unknown }): DecisionStatus {
  if (typeof task.supersededBy === 'string' && task.supersededBy.trim()) return 'superseded';
  const status = typeof task.status === 'string' ? task.status.trim().toLowerCase() : '';
  if (CURRENT.has(status)) return 'current';
  if (status === 'superseded') return 'superseded';
  if (status === 'rejected') return 'rejected';
  if (STALE.has(status)) return 'stale';
  if (PROPOSED.has(status)) return 'proposed';
  const legacyAdr = typeof task.type === 'string' && task.type.trim().toLowerCase() === 'adr';
  return legacyAdr ? 'proposed' : 'current';
}

/** A list-valued frontmatter field, as clean IDs: trimmed, de-duplicated, a single string accepted. */
export function idList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The decisions a document names in `decisions:`. */
export function decisionIdsOf(task: Pick<Task, 'decisions'>): string[] {
  return idList(task.decisions);
}

/** One entry of a document's `decisions:`, resolved. */
export interface DecisionLink {
  id: string;
  /** False when nothing on this board has the ID. */
  found: boolean;
  /** True for `alias:decision-N`, a decision on a related board; it is not resolved here. */
  external: boolean;
  /** The document, when found. */
  task?: Task;
  /** False when the ID names a document that is not a decision. */
  isDecision: boolean;
  /** Where the decision stands, when found and a decision. */
  status?: DecisionStatus;
  /** The decision that replaced it, when it says. */
  supersededBy?: string;
  /** True when the decision has been superseded: open work resting on it should say so. */
  superseded: boolean;
}

/** Open work resting on at least one superseded decision. */
export interface WorkOnSupersededDecision {
  task: Task;
  decisions: DecisionLink[];
}

// ── the graph ──────────────────────────────────────────────────────────────

/** A node of the containment outline. */
export interface DocTreeNode {
  task: Task;
  type: ResolvedDocType;
  /** 0 for a root. */
  depth: number;
  children: DocTreeNode[];
  /** False when the node is in the outline only as an ancestor of a match. */
  match: boolean;
  /** True when its parent does not fit the defaults (an epic under a task, say). */
  offPattern: boolean;
  /**
   * Set on a root whose `parentId` names a document outside the outline:
   * completed (in logs/), missing from the board, or not shown (a decision,
   * or filtered out).
   */
  detachedFrom?: { id: string; state: 'completed' | 'missing' | 'outside' };
  /** True when the node sits in a `parentId` loop; it is shown as a root. */
  cycle?: boolean;
}

export interface DocTreeOptions {
  /** Which documents to show. Their open ancestors are shown too, as context. */
  include?: (task: Task) => boolean;
  /** Show only what sits under this document (it is the root). */
  rootId?: string;
}

export interface DocGraphOptions {
  /** The board's `types:`. */
  types?: TypesConfig;
}

export interface DocGraph {
  readonly types?: TypesConfig;
  /** Every document, in the order given (open ones first when read from a board). */
  readonly tasks: readonly Task[];
  get(id: string): Task | undefined;
  /** A document's type as this board sees it. */
  typeOf(task: Task | string | undefined): ResolvedDocType;
  /** Still on the board: not completed. */
  isOpen(task: Task): boolean;
  /** Open work: not completed and not a decision. */
  isOpenWork(task: Task): boolean;
  parentOf(id: string): Task | undefined;
  /** Everything whose `parentId` names this document, open and completed. Decisions are never children. */
  childrenOf(id: string): Task[];
  /** Children still open: what keeps a parent from completing. */
  openChildrenOf(id: string): Task[];
  /** Parent, grandparent, … up to the root, stopping at a loop. */
  ancestorsOf(id: string): Task[];
  /** True when making `parentId` the parent of `id` would close a loop. */
  wouldCycle(id: string, parentId: string): boolean;
  /** A document's `decisions:`, resolved. */
  decisionsOf(id: string): DecisionLink[];
  /** The reverse of `decisions:`: every document that rests on this decision. */
  restingOn(decisionId: string): Task[];
  /** The superseded decisions a document rests on. */
  supersededDecisionsOf(id: string): DecisionLink[];
  /** Open work resting on a superseded decision: what `show`, `brief` and the app flag. */
  openWorkOnSupersededDecisions(): WorkOnSupersededDecision[];
  /** The containment outline of open work. Decisions are never in it. */
  tree(options?: DocTreeOptions): DocTreeNode[];
}

/**
 * Build the graph of a board from its documents. Pass board/ documents
 * first and logs/ after: when an ID appears twice the first one wins.
 */
export function buildDocGraph(tasks: readonly Task[], options: DocGraphOptions = {}): DocGraph {
  const types = options.types;
  const byId = new Map<string, Task>();
  const ordered: Task[] = [];
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || byId.has(task.id)) continue;
    byId.set(task.id, task);
    ordered.push(task);
  }

  const typeCache = new Map<string, ResolvedDocType>();
  const typeOf = (task: Task | string | undefined): ResolvedDocType => {
    const name = typeof task === 'string' ? task : task?.type;
    const key = canonicalTypeName(name);
    let resolved = typeCache.get(key);
    if (!resolved) {
      resolved = resolveDocType(key, types);
      typeCache.set(key, resolved);
    }
    return resolved;
  };

  const isOpen = (task: Task): boolean => !task.completedAt;
  const isDecision = (task: Task): boolean => typeOf(task).role === 'decision';
  const isOpenWork = (task: Task): boolean => isOpen(task) && !isDecision(task);

  const childrenById = new Map<string, Task[]>();
  const restingById = new Map<string, Task[]>();
  for (const task of ordered) {
    if (typeof task.parentId === 'string' && task.parentId.trim() && !isDecision(task)) {
      const parentId = task.parentId.trim();
      const list = childrenById.get(parentId) ?? [];
      list.push(task);
      childrenById.set(parentId, list);
    }
    for (const decisionId of decisionIdsOf(task)) {
      const list = restingById.get(decisionId) ?? [];
      list.push(task);
      restingById.set(decisionId, list);
    }
  }

  const parentIdOf = (task: Task | undefined): string | undefined =>
    typeof task?.parentId === 'string' && task.parentId.trim() ? task.parentId.trim() : undefined;

  const ancestorsOf = (id: string): Task[] => {
    const out: Task[] = [];
    const seen = new Set<string>([id]);
    let current = byId.get(id);
    while (current) {
      const parentId = parentIdOf(current);
      if (!parentId || seen.has(parentId)) break;
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      out.push(parent);
      current = parent;
    }
    return out;
  };

  const wouldCycle = (id: string, parentId: string): boolean => {
    if (id === parentId) return true;
    return ancestorsOf(parentId).some((t) => t.id === id);
  };

  const resolveDecision = (id: string): DecisionLink => {
    const external = isQualifiedRef(id);
    const task = external ? undefined : byId.get(id);
    if (!task) {
      return { id, found: false, external, isDecision: false, superseded: false };
    }
    if (!isDecision(task)) {
      return { id, found: true, external, task, isDecision: false, superseded: false };
    }
    const status = decisionStatus(task as Task & { status?: unknown });
    const supersededBy = typeof task.supersededBy === 'string' && task.supersededBy.trim()
      ? task.supersededBy.trim()
      : undefined;
    return {
      id,
      found: true,
      external,
      task,
      isDecision: true,
      status,
      ...(supersededBy ? { supersededBy } : {}),
      superseded: status === 'superseded',
    };
  };

  const decisionsOf = (id: string): DecisionLink[] => {
    const task = byId.get(id);
    return task ? decisionIdsOf(task).map(resolveDecision) : [];
  };

  const graph: DocGraph = {
    types,
    tasks: ordered,
    get: (id) => byId.get(id),
    typeOf,
    isOpen,
    isOpenWork,
    parentOf: (id) => {
      const parentId = parentIdOf(byId.get(id));
      return parentId ? byId.get(parentId) : undefined;
    },
    childrenOf: (id) => [...(childrenById.get(id) ?? [])],
    openChildrenOf: (id) => (childrenById.get(id) ?? []).filter(isOpen),
    ancestorsOf,
    wouldCycle,
    decisionsOf,
    restingOn: (decisionId) => [...(restingById.get(decisionId) ?? [])],
    supersededDecisionsOf: (id) => decisionsOf(id).filter((link) => link.superseded),
    openWorkOnSupersededDecisions: () => {
      const out: WorkOnSupersededDecision[] = [];
      for (const task of ordered) {
        if (!isOpenWork(task)) continue;
        const superseded = decisionsOf(task.id).filter((link) => link.superseded);
        if (superseded.length > 0) out.push({ task, decisions: superseded });
      }
      return out;
    },
    tree: (treeOptions = {}) => buildTree(treeOptions),
  };

  function buildTree(treeOptions: DocTreeOptions): DocTreeNode[] {
    const work = ordered.filter(isOpenWork);
    let pool = work;
    if (treeOptions.rootId) {
      const rootId = treeOptions.rootId;
      pool = work.filter((t) => t.id === rootId || ancestorsOf(t.id).some((a) => a.id === rootId));
    }

    const matched = new Set<string>();
    const kept = new Set<string>();
    for (const task of pool) {
      if (treeOptions.include && !treeOptions.include(task)) continue;
      matched.add(task.id);
      kept.add(task.id);
      for (const ancestor of ancestorsOf(task.id)) {
        if (!isOpenWork(ancestor)) break;
        if (treeOptions.rootId && !pool.includes(ancestor)) break;
        kept.add(ancestor.id);
      }
    }

    const visited = new Set<string>();
    const makeNode = (task: Task, depth: number, parent?: Task): DocTreeNode => {
      visited.add(task.id);
      const type = typeOf(task);
      const node: DocTreeNode = {
        task,
        type,
        depth,
        children: [],
        match: matched.has(task.id),
        offPattern: parent ? !parentFit(task.type, parent.type, types).fits : false,
      };
      for (const child of childrenById.get(task.id) ?? []) {
        if (!kept.has(child.id) || visited.has(child.id)) continue;
        node.children.push(makeNode(child, depth + 1, task));
      }
      return node;
    };

    const roots: DocTreeNode[] = [];
    for (const task of ordered) {
      if (!kept.has(task.id) || visited.has(task.id)) continue;
      const parentId = parentIdOf(task);
      const isRoot = !parentId
        || !kept.has(parentId)
        || (treeOptions.rootId !== undefined && task.id === treeOptions.rootId);
      if (!isRoot) continue;
      const node = makeNode(task, 0);
      if (parentId && !(treeOptions.rootId !== undefined && task.id === treeOptions.rootId)) {
        const parent = byId.get(parentId);
        const state = !parent ? 'missing' : !isOpen(parent) ? 'completed' : 'outside';
        node.detachedFrom = { id: parentId, state };
        if (parent) node.offPattern = !parentFit(task.type, parent.type, types).fits;
      }
      roots.push(node);
    }

    // Anything left sits in a parentId loop; show it rather than lose it.
    for (const task of ordered) {
      if (!kept.has(task.id) || visited.has(task.id)) continue;
      const node = makeNode(task, 0);
      node.cycle = true;
      roots.push(node);
    }

    return roots;
  }

  return graph;
}

/** A document's place in the graph, as plain data: what `show --json`, MCP `get_task` and the app read. */
export interface DocPlace {
  id: string;
  /** Canonical type name. */
  type: string;
  role: ResolvedDocType['role'];
  glyph: string;
  parent?: {
    id: string;
    found: boolean;
    title?: string;
    type?: string;
    done?: boolean;
    /** Why the parent does not fit the defaults, when it does not. */
    offPattern?: string;
  };
  /** Everything under it, open and done. */
  children: Array<{ id: string; title: string; type: string; done: boolean }>;
  /** Its `decisions:`, resolved. */
  decisions: Array<{
    id: string;
    found: boolean;
    external: boolean;
    isDecision: boolean;
    title?: string;
    status?: DecisionStatus;
    supersededBy?: string;
    superseded: boolean;
  }>;
  /** IDs of superseded decisions it rests on; non-empty means "rests on a superseded decision". */
  restsOnSuperseded: string[];
  /** For a decision: the work resting on it (the computed reverse of `decisions:`). */
  restedOnBy?: Array<{ id: string; title: string; type: string; done: boolean }>;
}

/** A document's place in the graph, or undefined when it is not in it. */
export function docPlace(graph: DocGraph, id: string): DocPlace | undefined {
  const task = graph.get(id);
  if (!task) return undefined;
  const type = graph.typeOf(task);
  const brief = (t: Task) => ({ id: t.id, title: t.title, type: graph.typeOf(t).name, done: Boolean(t.completedAt) });

  let parent: DocPlace['parent'];
  const parentId = typeof task.parentId === 'string' && task.parentId.trim() ? task.parentId.trim() : undefined;
  if (parentId) {
    const parentTask = graph.get(parentId);
    if (parentTask) {
      const fit = parentFit(task.type, parentTask.type, graph.types);
      parent = {
        id: parentId,
        found: true,
        title: parentTask.title,
        type: graph.typeOf(parentTask).name,
        done: Boolean(parentTask.completedAt),
        ...(fit.fits ? {} : { offPattern: fit.reason }),
      };
    } else {
      parent = { id: parentId, found: false };
    }
  }

  const decisions = graph.decisionsOf(id);
  return {
    id,
    type: type.name,
    role: type.role,
    glyph: type.glyph,
    ...(parent ? { parent } : {}),
    children: graph.childrenOf(id).map(brief),
    decisions: decisions.map((link) => ({
      id: link.id,
      found: link.found,
      external: link.external,
      isDecision: link.isDecision,
      ...(link.task ? { title: link.task.title } : {}),
      ...(link.status ? { status: link.status } : {}),
      ...(link.supersededBy ? { supersededBy: link.supersededBy } : {}),
      superseded: link.superseded,
    })),
    restsOnSuperseded: graph.isOpenWork(task) ? decisions.filter((l) => l.superseded).map((l) => l.id) : [],
    ...(type.role === 'decision' ? { restedOnBy: graph.restingOn(id).map(brief) } : {}),
  };
}

/** The outline flattened in reading order, each node with its depth. */
export function flattenDocTree(nodes: readonly DocTreeNode[]): DocTreeNode[] {
  const out: DocTreeNode[] = [];
  const walk = (list: readonly DocTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

// ── checking links ─────────────────────────────────────────────────────────

/** A document about to be written, and the links it will carry. */
export interface LinkChange {
  /** The document's ID; absent for one not yet created. */
  id?: string;
  /** Its type (an alias is fine). Defaults to the existing document's type, else task. */
  type?: string;
  /** `null` clears; `undefined` leaves it alone and is not checked. */
  parentId?: string | null;
  dependsOn?: readonly string[] | null;
  decisions?: readonly string[] | null;
}

export interface LinkCheckResult {
  /** Refusals: the write should not happen. */
  errors: string[];
  /** Worth saying; the write goes ahead. */
  warnings: string[];
}

export interface LinkCheckOptions {
  /** On a strict board an off-pattern link is refused; elsewhere it is a warning. */
  strict?: boolean;
}

/**
 * Check the links a write would set, against the board as it stands.
 *
 * Always refused: a document as its own parent or dependency, and a
 * `parentId` or `dependsOn` that would close a loop. Off-pattern (refused on
 * a strict board, a warning elsewhere): a parent that does not fit the
 * defaults, `decisions:` naming something that is not a decision or set on a
 * decision, and `dependsOn` between a decision and anything. A link to an ID
 * that is not on the board is a warning; `alias:id` references to related
 * boards are not checked.
 */
export function checkDocumentLinks(
  graph: DocGraph,
  change: LinkChange,
  options: LinkCheckOptions = {},
): LinkCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const offPattern = (message: string) => {
    if (options.strict) errors.push(`${message} (refused on a strict board)`);
    else warnings.push(message);
  };

  const existing = change.id ? graph.get(change.id) : undefined;
  const typeName = change.type ?? existing?.type;
  const type = graph.typeOf(typeName);
  const label = change.id ?? `the new ${type.name}`;

  if (typeof change.parentId === 'string' && change.parentId.trim()) {
    const parentId = change.parentId.trim();
    const parent = graph.get(parentId);
    if (change.id && parentId === change.id) {
      errors.push(`${change.id} cannot be its own parent`);
    } else if (change.id && graph.wouldCycle(change.id, parentId)) {
      errors.push(`${parentId} sits under ${change.id}; it cannot also be its parent`);
    } else if (!parent) {
      warnings.push(`parent ${parentId} is not on this board`);
    } else {
      const fit = parentFit(typeName, parent.type, graph.types);
      if (!fit.fits) offPattern(`${label} under ${parentId}: ${fit.reason}`);
    }
  }

  if (Array.isArray(change.dependsOn)) {
    for (const raw of change.dependsOn) {
      const depId = raw.trim();
      if (!depId || isQualifiedRef(depId)) continue;
      if (change.id && depId === change.id) {
        errors.push(`${change.id} cannot depend on itself`);
        continue;
      }
      const dep = graph.get(depId);
      if (!dep) {
        warnings.push(`dependency ${depId} is not on this board`);
        continue;
      }
      if (change.id && dependsOnReaches(graph, depId, change.id)) {
        errors.push(`${depId} already depends on ${change.id}; depending on it would loop`);
        continue;
      }
      if (type.role === 'decision' || graph.typeOf(dep).role === 'decision') {
        offPattern(`${label} depends on ${depId}: dependsOn orders work, and decisions are not work`);
      }
    }
  }

  if (Array.isArray(change.decisions)) {
    const ids = idList(change.decisions);
    if (ids.length > 0 && type.role === 'decision') {
      offPattern(`${label} is a decision: decisions link to each other with supersedes and supersededBy, not decisions:`);
    }
    for (const id of ids) {
      if (isQualifiedRef(id)) continue;
      const target = graph.get(id);
      if (!target) {
        warnings.push(`decision ${id} is not on this board`);
      } else if (graph.typeOf(target).role !== 'decision') {
        offPattern(`${id} is ${articleFor(graph.typeOf(target).name)}, not a decision; decisions: names decisions`);
      }
    }
  }

  return { errors, warnings };
}

function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/** True when following `dependsOn` from `fromId` reaches `targetId`. */
function dependsOnReaches(graph: DocGraph, fromId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const task = graph.get(id);
    for (const dep of idList(task?.dependsOn)) {
      if (!isQualifiedRef(dep)) stack.push(dep);
    }
  }
  return false;
}

// ── lint ───────────────────────────────────────────────────────────────────

export interface LintDocGraphOptions {
  /** On a strict board an off-pattern link is an error, not a warning. */
  strict?: boolean;
}

/**
 * Graph problems on the open documents of a board: parents that are missing,
 * loop or do not fit the defaults; `decisions:` that name nothing or
 * something other than a decision; `dependsOn` to or from a decision; and
 * `supersedes`/`supersededBy` on work. Off-pattern links are errors on a
 * strict board, warnings elsewhere.
 */
export function lintDocGraph(graph: DocGraph, options: LintDocGraphOptions = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const offPattern = (message: string, code: string) => {
    issues.push({ type: options.strict ? 'error' : 'warning', message, fixable: false, code });
  };
  const warn = (message: string, code: string) => {
    issues.push({ type: 'warning', message, fixable: false, code });
  };

  for (const task of graph.tasks) {
    if (!graph.isOpen(task)) continue;
    const type = graph.typeOf(task);

    const parentId = typeof task.parentId === 'string' ? task.parentId.trim() : '';
    if (parentId) {
      const parent = graph.get(parentId);
      if (graph.wouldCycle(task.id, parentId)) {
        offPattern(`${task.id}: parentId ${parentId} loops back to ${task.id}`, 'PARENT_CYCLE');
      } else if (!parent) {
        warn(`${task.id}: parentId ${parentId} is not on this board`, 'PARENT_NOT_FOUND');
      } else {
        const fit = parentFit(task.type, parent.type, graph.types);
        if (!fit.fits) offPattern(`${task.id}: off-pattern parent ${parentId} (${fit.reason})`, 'OFF_PATTERN_PARENT');
      }
    }

    const decisionIds = decisionIdsOf(task);
    if (decisionIds.length > 0 && type.role === 'decision') {
      offPattern(`${task.id}: decisions: is for work; decisions link with supersedes and supersededBy`, 'DECISIONS_ON_DECISION');
    }
    for (const link of graph.decisionsOf(task.id)) {
      if (link.external) continue;
      if (!link.found) warn(`${task.id}: decision ${link.id} is not on this board`, 'DECISION_NOT_FOUND');
      else if (!link.isDecision) offPattern(`${task.id}: decisions: names ${link.id}, which is not a decision`, 'NOT_A_DECISION');
    }

    for (const depId of idList(task.dependsOn)) {
      if (isQualifiedRef(depId)) continue;
      const dep = graph.get(depId);
      if (dep && (type.role === 'decision' || graph.typeOf(dep).role === 'decision')) {
        offPattern(`${task.id}: dependsOn ${depId} links a decision; dependsOn orders work`, 'DEPENDS_ON_DECISION');
      }
    }

    if (type.role !== 'decision') {
      const record = task as Task & { supersedes?: unknown; supersededBy?: unknown };
      if (idList(record.supersedes).length > 0 || (typeof record.supersededBy === 'string' && record.supersededBy.trim())) {
        offPattern(`${task.id}: supersedes and supersededBy are between decisions only`, 'SUPERSEDES_ON_WORK');
      }
    }
  }

  return issues;
}
