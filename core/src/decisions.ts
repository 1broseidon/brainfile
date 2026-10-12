/**
 * Decisions as memory (spec-11): claim families, the stance rule, the
 * predicates worth keeping and the verdicts `check` gives.
 *
 * A decision belongs to a claim family through its dotted `claimKey`
 * (`dependency.http-client`). A family has one current decision; a new one
 * supersedes it. `check` finds the family an action touches and answers
 * `use`, `review`, `use_replacement` or `no_decision`, in recoil's order:
 * more than one current decision, a broken predicate, a historical match, the
 * stance rule, then the plain current decision.
 *
 * Pure and browser-safe: no fs, path or child_process. Reading files (the
 * source-unchanged and package-version predicates) lives in
 * `decisionOperations.ts`; the index-backed family search in
 * `@brainfile/core/memory`.
 *
 * @packageDocumentation
 */

import type { DecisionKind, DecisionStance, DecisionStatus, Task } from './types/base';
import type { TypesConfig } from './types/board';
import { resolveDocType } from './docTypes';
import { decisionStatus, idList } from './docGraph';

// ── vocabulary ─────────────────────────────────────────────────────────────

/** How firmly a decision binds. */
export const DECISION_KINDS: readonly DecisionKind[] = ['decision', 'preference', 'constraint', 'rule'];

/** What a decision says about its subject. */
export const DECISION_STANCES: readonly DecisionStance[] = ['prefers', 'rejects', 'requires', 'forbids'];

/** A claim key: dotted segments of lowercase letters, digits, `_` and `-`. */
export const CLAIM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/;

export function isDecisionKind(value: unknown): value is DecisionKind {
  return typeof value === 'string' && (DECISION_KINDS as readonly string[]).includes(value);
}

export function isDecisionStance(value: unknown): value is DecisionStance {
  return typeof value === 'string' && (DECISION_STANCES as readonly string[]).includes(value);
}

/** A claim key as stored and compared: trimmed and lowercased. Empty for anything else. */
export function normalizeClaimKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** True for a well-formed claim key (after normalising). */
export function isValidClaimKey(value: unknown): boolean {
  return CLAIM_KEY_PATTERN.test(normalizeClaimKey(value));
}

/** A document's claim key, normalised, or undefined when it has none. */
export function claimKeyOf(task: object | undefined | null): string | undefined {
  const key = normalizeClaimKey((task as { claimKey?: unknown } | undefined | null)?.claimKey);
  return key || undefined;
}

/** The family above a claim key: `dependency.http-client` → `dependency`. Undefined at the top. */
export function claimKeyParent(key: string): string | undefined {
  const normalized = normalizeClaimKey(key);
  const cut = normalized.lastIndexOf('.');
  return cut > 0 ? normalized.slice(0, cut) : undefined;
}

/**
 * True when `key` is `prefix` or sits under it, segment by segment:
 * `dependency` covers `dependency` and `dependency.http-client`, not
 * `dependencyx`. A trailing dot is ignored.
 */
export function claimKeyMatchesPrefix(key: string | undefined, prefix: string): boolean {
  const k = normalizeClaimKey(key);
  const p = normalizeClaimKey(prefix).replace(/\.+$/, '');
  if (!k || !p) return false;
  return k === p || k.startsWith(`${p}.`);
}

/** True for a document whose type plays the decision role on this board. */
export function isDecisionDoc(task: Pick<Task, 'type'> | undefined | null, types?: TypesConfig): boolean {
  return Boolean(task) && resolveDocType(task!.type, types).role === 'decision';
}

/** Superseded, rejected or stale: no longer guidance. */
export function isHistoricalStatus(status: DecisionStatus): boolean {
  return status === 'superseded' || status === 'rejected' || status === 'stale';
}

/** A decision that no longer stands. */
export function isHistoricalDecision(task: Task): boolean {
  return isHistoricalStatus(decisionStatus(task as Task & { status?: unknown }));
}

/** A decision that stands. */
export function isCurrentDecision(task: Task): boolean {
  return decisionStatus(task as Task & { status?: unknown }) === 'current';
}

/** The family a decision belongs to: its claim key, or for one with none its own ID (a family of one). */
export function decisionFamilyKey(task: Task): string {
  return claimKeyOf(task) ?? task.id;
}

// ── families ───────────────────────────────────────────────────────────────

function stampOf(task: Task): number {
  const value = (task.updatedAt as string | undefined) ?? (task.createdAt as string | undefined);
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Newest first; IDs break ties, higher numbers first. */
export function compareDecisionsNewestFirst(a: Task, b: Task): number {
  return stampOf(b) - stampOf(a) || b.id.localeCompare(a.id, undefined, { numeric: true });
}

/** Every decision sharing a claim key (or, with none, one decision on its own). */
export interface DecisionFamily {
  /** The claim key; for a decision without one, its ID. */
  key: string;
  /** The claim key, when the family has one. */
  claimKey?: string;
  /** Current decisions, newest first. More than one means the family needs a look. */
  current: Task[];
  /** Superseded, rejected and stale decisions, newest first. */
  history: Task[];
  /** Neither: a legacy ADR still proposed. */
  other: Task[];
}

/**
 * Group the decisions among `tasks` into claim families, sorted by key.
 * Pass board/ documents before logs/: when an ID appears twice the first wins.
 */
export function groupDecisionFamilies(tasks: readonly Task[], types?: TypesConfig): DecisionFamily[] {
  const byKey = new Map<string, DecisionFamily>();
  const seen = new Set<string>();
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || seen.has(task.id)) continue;
    if (!isDecisionDoc(task, types)) continue;
    seen.add(task.id);
    const claimKey = claimKeyOf(task);
    const key = claimKey ?? task.id;
    let family = byKey.get(key);
    if (!family) {
      family = { key, ...(claimKey ? { claimKey } : {}), current: [], history: [], other: [] };
      byKey.set(key, family);
    }
    const status = decisionStatus(task as Task & { status?: unknown });
    if (status === 'current') family.current.push(task);
    else if (isHistoricalStatus(status)) family.history.push(task);
    else family.other.push(task);
  }
  const families = [...byKey.values()];
  for (const family of families) {
    family.current.sort(compareDecisionsNewestFirst);
    family.history.sort(compareDecisionsNewestFirst);
    family.other.sort(compareDecisionsNewestFirst);
  }
  return families.sort((a, b) => {
    // Families with a claim key first, then the keyless ones by ID.
    if (Boolean(a.claimKey) !== Boolean(b.claimKey)) return a.claimKey ? -1 : 1;
    return a.key.localeCompare(b.key, undefined, { numeric: true });
  });
}

/** Families under one top-level claim-key segment (`dependency`), for a grouped view. */
export interface DecisionFamilyGroup {
  /** The first segment of the claim keys in it; empty for decisions with no claim key. */
  prefix: string;
  families: DecisionFamily[];
}

/**
 * Decisions grouped by the first segment of their claim key, each family
 * with its current decision and its history: the Decisions view.
 * Keyless decisions come last, under an empty prefix.
 */
export function groupDecisionsByPrefix(tasks: readonly Task[], types?: TypesConfig): DecisionFamilyGroup[] {
  const groups = new Map<string, DecisionFamilyGroup>();
  for (const family of groupDecisionFamilies(tasks, types)) {
    const prefix = family.claimKey ? family.claimKey.split('.')[0] : '';
    let group = groups.get(prefix);
    if (!group) {
      group = { prefix, families: [] };
      groups.set(prefix, group);
    }
    group.families.push(family);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.prefix !== !b.prefix) return a.prefix ? -1 : 1;
    return a.prefix.localeCompare(b.prefix);
  });
}

/** The decisions in one claim family, current first, then the rest newest first. */
export function decisionFamilyMembers(tasks: readonly Task[], claimKey: string, types?: TypesConfig): Task[] {
  const key = normalizeClaimKey(claimKey);
  if (!key) return [];
  const family = groupDecisionFamilies(tasks, types).find((f) => f.key === key);
  return family ? [...family.current, ...family.history, ...family.other] : [];
}

// ── tokens ─────────────────────────────────────────────────────────────────

/** recoil's stopwords: words too common to say anything about a document. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'that', 'this', 'what', 'when', 'where', 'which',
  'who', 'why', 'how', 'do', 'did', 'does', 'was', 'were', 'are', 'is', 'in', 'on', 'of', 'to',
  'we', 'i', 'you', 'your', 'have', 'has', 'had', 'from', 'about', 'into', 'onto', 'then', 'than',
  'them', 'they', 'their', 'our', 'out', 'can', 'could', 'would', 'should',
]);

/** True for a word too common to search on. */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token.toLowerCase());
}

const TOKEN_PATTERN = /[A-Za-z0-9_]+/g;

/**
 * The words of a text worth matching on: lowercased, stopwords (and any
 * `ignore` words) dropped, de-duplicated, at most 32. When every word is a
 * stopword and nothing is ignored, they are kept.
 */
export function significantTokens(text: string, ignore?: ReadonlySet<string>): string[] {
  const all = (text.match(TOKEN_PATTERN) ?? []).map((t) => t.toLowerCase());
  const pick = (skip: (t: string) => boolean): string[] => {
    const out: string[] = [];
    for (const token of all) {
      if (skip(token) || out.includes(token)) continue;
      out.push(token);
      if (out.length === 32) break;
    }
    return out;
  };
  const significant = pick((t) => STOPWORDS.has(t) || Boolean(ignore?.has(t)));
  // With words to ignore (check's action cues), nothing left means nothing to match on.
  if (significant.length > 0 || ignore) return significant;
  return pick(() => false);
}

/** The share of `tokens` that appear in `text` (case-insensitive, whole-word prefixes count). */
export function tokenCoverage(tokens: readonly string[], text: string): number {
  if (tokens.length === 0) return 0;
  const words = new Set((text.match(TOKEN_PATTERN) ?? []).map((t) => t.toLowerCase()));
  let hits = 0;
  for (const token of tokens) {
    if (words.has(token)) {
      hits++;
      continue;
    }
    for (const word of words) {
      if (word.startsWith(token) && token.length >= 3) {
        hits++;
        break;
      }
    }
  }
  return hits / tokens.length;
}

/**
 * Words that say what to do rather than what about: "use", "switch",
 * "remove". On their own they do not tie an action to a claim family.
 */
export const ACTION_CUE_WORDS: ReadonlySet<string> = new Set([
  'use', 'using', 'add', 'adding', 'introduce', 'enable', 'switch', 'keep', 'continue', 'preserve',
  'remove', 'drop', 'disable', 'turn', 'off', 'stop', 'skip', 'avoid', 'avoiding', 'replace',
  'move', 'not', 'don', 't', 'dont', 'let', 'lets', 'go', 'make', 'start', 'it', 'be', 'now',
  'want', 'need', 'should', 'will', 'just', 'still', 'more', 'some', 'any', 'all', 'back',
  'decision', 'policy', 'call', 'follow', 'honor', 'stick',
]);

// ── related families ───────────────────────────────────────────────────────

/** A claim family worth a look when a new decision starts a family of its own. */
export interface RelatedClaim {
  id: string;
  claimKey: string;
  title: string;
  /** `prefix`: a sibling under the same parent key; `text`: shares at least half the new decision's words. */
  reason: 'prefix' | 'text';
  /** Share of the new decision's words found in it (for `text`). */
  coverage?: number;
}

/** What a related-family search compares against: a decision and its body. */
export interface DecisionText {
  task: Task;
  body?: string;
}

/** Everything a decision says, as one string: for matching. */
export function decisionSearchText(task: Task, body = ''): string {
  return [
    task.title,
    typeof task.description === 'string' ? task.description : '',
    body,
    normalizeClaimKey(task.claimKey).replace(/[.-]/g, ' '),
    typeof task.subject === 'string' ? task.subject : '',
  ].join('\n');
}

/**
 * Current decisions in other claim families that may say the same thing:
 * siblings under the same parent key first, then those sharing at least half
 * of the new decision's significant words. At most `limit` (3).
 */
export function relatedClaimFamilies(
  decisions: readonly DecisionText[],
  probe: { claimKey?: string; text: string; excludeIds?: readonly string[] },
  types?: TypesConfig,
  limit = 3,
): RelatedClaim[] {
  const ownKey = normalizeClaimKey(probe.claimKey);
  const parent = ownKey ? claimKeyParent(ownKey) : undefined;
  const tokens = significantTokens(probe.text, ACTION_CUE_WORDS);
  const exclude = new Set(probe.excludeIds ?? []);
  const byFamily = new Map<string, RelatedClaim>();

  for (const { task, body } of decisions) {
    if (exclude.has(task.id) || !isDecisionDoc(task, types) || !isCurrentDecision(task)) continue;
    const key = claimKeyOf(task);
    if (!key || key === ownKey) continue;
    let claim: RelatedClaim | undefined;
    if (parent && claimKeyMatchesPrefix(key, parent)) {
      claim = { id: task.id, claimKey: key, title: task.title, reason: 'prefix' };
    } else {
      const coverage = tokenCoverage(tokens, decisionSearchText(task, body));
      if (coverage >= 0.5) claim = { id: task.id, claimKey: key, title: task.title, reason: 'text', coverage };
    }
    if (!claim) continue;
    const existing = byFamily.get(key);
    if (!existing || rankRelated(claim) > rankRelated(existing)) byFamily.set(key, claim);
  }

  return [...byFamily.values()]
    .sort((a, b) => rankRelated(b) - rankRelated(a) || a.claimKey.localeCompare(b.claimKey))
    .slice(0, limit);
}

function rankRelated(claim: RelatedClaim): number {
  return claim.reason === 'prefix' ? 2 : claim.coverage ?? 0;
}

// ── the stance rule (recoil cmd/check.go) ──────────────────────────────────

/** What an action asks to do with a decision's subject. */
export type RequestedAction = 'affirm_decision' | 'adopt_subject' | 'remove_subject' | 'replace_subject' | 'unknown';

function normalizedActionText(value: string): string {
  return value.toLowerCase().trim().replace(/-/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}

function cueBefore(query: string, cue: string, subject: string, withWord = false): boolean {
  return query.includes(`${cue} ${subject}`)
    || query.includes(`${cue} the ${subject}`)
    || (withWord && query.includes(`${cue} with ${subject}`));
}

/**
 * Read an action against a decision's subject: the subject next to an adopt
 * cue ("use axios", "switch to the axios") or a remove cue ("drop axios",
 * "avoid axios"), or a phrase that affirms the decision itself. Anything else
 * is `unknown` and the stance rule does not apply.
 */
export function requestedAction(query: string, subject: string): RequestedAction {
  const q = normalizedActionText(query);
  const s = normalizedActionText(subject);
  if (!q) return 'unknown';
  for (const cue of ['keep the decision', 'stick with the decision', 'stick with the call', 'follow the policy', 'follow the decision', 'honor the decision']) {
    if (q.includes(cue)) return 'affirm_decision';
  }
  if (!s || !q.includes(s)) return 'unknown';
  for (const cue of ['keep avoiding', 'continue avoiding', 'keep out', 'do not use', "don't use", 'avoid', 'drop', 'disable', 'turn off', 'switch off', 'stop', 'skip', 'remove']) {
    if (cueBefore(q, cue, s)) return 'remove_subject';
  }
  for (const cue of ['switch from', 'replace', 'move from']) {
    if (cueBefore(q, cue, s)) return 'replace_subject';
  }
  for (const cue of ['use', 'add', 'introduce', 'enable', 'switch to', 'file', 'send', 'register', 'treat as', 'quote', 'keep', 'continue', 'preserve']) {
    if (cueBefore(q, cue, s, true)) return 'adopt_subject';
  }
  return 'unknown';
}

/** Does the action go the way the decision does? */
export function stanceActionAligns(stance: DecisionStance, action: RequestedAction): boolean {
  switch (stance) {
    case 'prefers':
    case 'requires':
      return action === 'affirm_decision' || action === 'adopt_subject';
    case 'rejects':
    case 'forbids':
      return action === 'affirm_decision' || action === 'remove_subject' || action === 'replace_subject';
    default:
      return false;
  }
}

// ── predicates ─────────────────────────────────────────────────────────────

/** The deterministic predicates a decision can carry. */
export type PredicateKind = 'valid_until' | 'source_unchanged' | 'package_version';

/** `holds`: still true; `broken`: no longer true, look again; `unknown`: nothing to evaluate, or it could not be. */
export type PredicateStatus = 'holds' | 'broken' | 'unknown';

export interface PredicateCheck {
  kind: PredicateKind;
  status: PredicateStatus;
  /** Machine-readable: `valid_until_expired`, `source_hash_changed`, `package_version_mismatch`, … */
  reason: string;
  /** What the decision recorded (a date, a hash, a version spec). */
  expected?: string;
  /** What was found. */
  actual?: string;
}

/** Every predicate a decision carries, evaluated. */
export interface PredicateReport {
  /** Broken if any is broken; holds if any holds and none is broken; otherwise unknown. */
  status: PredicateStatus;
  /** The first broken check's reason, else the first holding one's. */
  reason?: string;
  checks: PredicateCheck[];
}

/** Combine predicate checks into one report. */
export function combinePredicateChecks(checks: readonly PredicateCheck[]): PredicateReport {
  const broken = checks.find((c) => c.status === 'broken');
  if (broken) return { status: 'broken', reason: broken.reason, checks: [...checks] };
  const holds = checks.find((c) => c.status === 'holds');
  if (holds) return { status: 'holds', reason: holds.reason, checks: [...checks] };
  return { status: 'unknown', ...(checks[0] ? { reason: checks[0].reason } : {}), checks: [...checks] };
}

/**
 * A predicate time in epoch ms: an RFC 3339 timestamp, or a date
 * (`2026-12-31`), which holds through the end of that day UTC. Null when it
 * cannot be read.
 */
export function parsePredicateTime(value: unknown): number | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const ms = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999);
    const check = new Date(ms);
    if (check.getUTCMonth() !== Number(dateOnly[2]) - 1 || check.getUTCDate() !== Number(dateOnly[3])) return null;
    return ms;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/** The `validUntil` predicate: holds through the date, broken after it. */
export function evaluateValidUntil(validUntil: unknown, nowMs: number): PredicateCheck {
  const expected = validUntil instanceof Date ? validUntil.toISOString().slice(0, 10) : typeof validUntil === 'string' ? validUntil.trim() : '';
  const until = parsePredicateTime(validUntil);
  if (until === null) return { kind: 'valid_until', status: 'unknown', reason: 'invalid_valid_until', ...(expected ? { expected } : {}) };
  if (nowMs > until) return { kind: 'valid_until', status: 'broken', reason: 'valid_until_expired', expected };
  return { kind: 'valid_until', status: 'holds', reason: 'valid_until_holds', expected };
}

/** A package version predicate: `zod>=4.3`, `engines.node>=20`, `go>=1.22`, `@scope/pkg@1.2.0`. */
export interface PackageSpec {
  name: string;
  /** `==`, `!=`, `>=`, `<=`, `>` or `<`. `=` and `@` read as `==`. */
  operator: '==' | '!=' | '>=' | '<=' | '>' | '<';
  version: string;
}

/** Parse `name<op>version`. Null when it is not one. */
export function parsePackageSpec(spec: unknown): PackageSpec | null {
  if (typeof spec !== 'string') return null;
  const match = /^\s*(.+?)\s*(==|!=|>=|<=|=|>|<|@)\s*(\S.*?)\s*$/.exec(spec);
  if (!match || !match[1].trim()) return null;
  const raw = match[2];
  const operator = (raw === '=' || raw === '@' ? '==' : raw) as PackageSpec['operator'];
  return { name: match[1].trim(), operator, version: match[3].trim() };
}

/** `zod>=4.3` from its parts. */
export function formatPackageSpec(spec: PackageSpec): string {
  return `${spec.name}${spec.operator}${spec.version}`;
}

const VERSION_NUMBER = /\d+(?:\.\d+)*/;

/** Compare the first dotted number in each string (`^4.3.6` vs `4.3`). Null when either has none. */
export function compareVersionish(actual: string, wanted: string): number | null {
  const a = VERSION_NUMBER.exec(actual)?.[0];
  const b = VERSION_NUMBER.exec(wanted)?.[0];
  if (!a || !b) return null;
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/**
 * Compare a found version against a wanted one. `==` and `!=` accept an
 * exact (case-insensitive) string match or equal version numbers, so `^4.3.6`
 * equals `4.3.6`; the ordering operators compare version numbers. Null when
 * the comparison cannot be made.
 */
export function comparePredicateValue(actual: string, operator: PackageSpec['operator'], wanted: string): boolean | null {
  const a = actual.trim();
  const w = wanted.trim();
  const cmp = compareVersionish(a, w);
  const same = a.toLowerCase() === w.toLowerCase() || cmp === 0;
  switch (operator) {
    case '==': return same;
    case '!=': return !same;
    case '>=': return cmp === null ? null : cmp >= 0;
    case '<=': return cmp === null ? null : cmp <= 0;
    case '>': return cmp === null ? null : cmp > 0;
    case '<': return cmp === null ? null : cmp < 0;
    default: return null;
  }
}

// ── verdicts ───────────────────────────────────────────────────────────────

/** What `check` says about acting on a decision. */
export type CheckVerdict = 'use' | 'review' | 'use_replacement' | 'no_decision';

export type CheckRecommendation =
  | 'use_current_decision'
  | 'ask_operator'
  | 'revalidate'
  | 'block_action'
  | 'ignore_decision'
  | 'proceed_without_memory';

/** A decision as `check`, `decide` and the desktop report it. */
export interface DecisionSummary {
  id: string;
  title: string;
  claimKey?: string;
  kind?: string;
  status: DecisionStatus;
  stance?: string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  validUntil?: string;
  sourcePath?: string;
  packageVersion?: string;
  supersedes: string[];
  supersededBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

function str(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A decision's fields, as plain data. */
export function summarizeDecision(task: Task): DecisionSummary {
  const record = task as Task & Record<string, unknown>;
  const summary: DecisionSummary = {
    id: task.id,
    title: task.title,
    status: decisionStatus(record),
    supersedes: idList(record.supersedes),
  };
  const fields: Array<[keyof DecisionSummary, unknown]> = [
    ['claimKey', claimKeyOf(task)],
    ['kind', record.kind],
    ['stance', record.stance],
    ['subject', record.subject],
    ['holdsWhile', record.holdsWhile],
    ['recheck', record.recheck],
    ['validUntil', record.validUntil],
    ['sourcePath', record.sourcePath],
    ['packageVersion', record.packageVersion],
    ['supersededBy', record.supersededBy],
    ['createdAt', record.createdAt],
    ['updatedAt', record.updatedAt],
  ];
  for (const [key, value] of fields) {
    const text = str(value);
    if (text) (summary as unknown as Record<string, unknown>)[key] = text;
  }
  return summary;
}

/** What `check` found and what it advises. */
export interface CheckResult {
  /** The action or text checked, when there was one. */
  query?: string;
  /** The claim family checked (a keyless decision's ID stands in for its key). */
  claimKey?: string;
  verdict: CheckVerdict;
  recommendation: CheckRecommendation;
  /** Machine-readable: `single_current_decision`, `request_contradicts_decision`, `valid_until_expired`, … */
  reason: string;
  /** How the decision's predicates stand. */
  predicateStatus: PredicateStatus;
  predicates: PredicateCheck[];
  /** The decision's `recheck`, when a predicate broke or nothing else applies. */
  recheck?: string;
  /** The decision's `holdsWhile`: use it while this holds. */
  advisory?: string;
  stance?: string;
  subject?: string;
  requestedAction?: RequestedAction;
  /** The decision the action matched (or the one asked about by ID). */
  matched?: DecisionSummary;
  /** The family's current decision. */
  current?: DecisionSummary;
  /** For `use_replacement`: the decision to use instead. */
  replacement?: DecisionSummary;
  /** Every decision in the family, current first. */
  family: DecisionSummary[];
}

/** How the target of a check was given. */
export type CheckTargetKind = 'query' | 'decision' | 'claim_key';

export interface AssessFamilyInput {
  query?: string;
  /** The family's key (claim key, or a keyless decision's ID). */
  claimKey: string;
  targetKind: CheckTargetKind;
  /** The decision the query matched or named. */
  matched?: Task;
  /** The family, any order. */
  family: readonly Task[];
  /** Evaluate a decision's predicates (reads files; supplied by the caller). */
  evaluate: (task: Task) => PredicateReport;
}

/** `no_decision`: nothing on the board speaks to the action. */
export function noDecisionResult(query?: string, claimKey?: string): CheckResult {
  return {
    ...(query ? { query } : {}),
    ...(claimKey ? { claimKey } : {}),
    verdict: 'no_decision',
    recommendation: 'proceed_without_memory',
    reason: claimKey ? 'empty_family' : 'no_claim_key_match',
    predicateStatus: 'unknown',
    predicates: [],
    family: [],
  };
}

/**
 * The verdict on one claim family, in recoil's order:
 *
 * 1. more than one current decision → review (ask the operator);
 * 2. a broken predicate on the decision in force → review (revalidate);
 * 3. the action matched a superseded/rejected/stale decision → use_replacement
 *    when the family has a current one, else review;
 * 4. a current decision with a stance and subject, and the action names the
 *    subject next to an adopt or remove cue → use when they agree, review
 *    when they contradict (block_action for requires/forbids);
 * 5. a current decision → use;
 * 6. a family with no current decision → review;
 * 7. nothing → no_decision.
 */
export function assessDecisionFamily(input: AssessFamilyInput): CheckResult {
  const ordered = [...input.family].sort((a, b) => {
    const rank = (t: Task) => (isCurrentDecision(t) ? 0 : isHistoricalDecision(t) ? 2 : 1);
    return rank(a) - rank(b) || compareDecisionsNewestFirst(a, b);
  });
  const currents = ordered.filter(isCurrentDecision);
  const current = currents[0];
  const matched = input.matched;
  const predicateSource = current ?? matched ?? ordered[0];
  const report: PredicateReport = predicateSource ? input.evaluate(predicateSource) : { status: 'unknown', checks: [] };
  const sourceRecord = predicateSource as (Task & Record<string, unknown>) | undefined;

  const result: CheckResult = {
    ...(input.query ? { query: input.query } : {}),
    claimKey: input.claimKey,
    verdict: 'no_decision',
    recommendation: 'proceed_without_memory',
    reason: 'empty_family',
    predicateStatus: report.status,
    predicates: report.checks,
    family: ordered.map(summarizeDecision),
    ...(matched ? { matched: summarizeDecision(matched) } : {}),
    ...(current ? { current: summarizeDecision(current) } : {}),
  };
  const recheck = str(sourceRecord?.recheck);
  const holdsWhile = str(sourceRecord?.holdsWhile);

  if (currents.length > 1) {
    return { ...result, verdict: 'review', recommendation: 'ask_operator', reason: 'multiple_current_decisions' };
  }
  if (report.status === 'broken') {
    return {
      ...result,
      verdict: 'review',
      recommendation: 'revalidate',
      reason: report.reason ?? 'predicate_broken',
      ...(recheck ? { recheck } : {}),
    };
  }
  if (holdsWhile) result.advisory = holdsWhile;
  if (matched && isHistoricalDecision(matched)) {
    if (current) {
      return {
        ...result,
        verdict: 'use_replacement',
        recommendation: 'use_current_decision',
        reason: 'matched_historical_decision',
        replacement: summarizeDecision(current),
      };
    }
    if (input.targetKind === 'decision') {
      return { ...result, verdict: 'review', recommendation: 'ignore_decision', reason: 'decision_is_historical' };
    }
    return { ...result, verdict: 'review', recommendation: 'ask_operator', reason: 'matched_historical_decision' };
  }
  if (current) {
    const record = current as Task & Record<string, unknown>;
    const stance = str(record.stance)?.toLowerCase();
    const subject = str(record.subject);
    if (stance && isDecisionStance(stance) && subject && input.query) {
      const action = requestedAction(input.query, subject);
      result.stance = stance;
      result.subject = subject;
      result.requestedAction = action;
      if (action !== 'unknown') {
        if (stanceActionAligns(stance, action)) {
          return { ...result, verdict: 'use', recommendation: 'use_current_decision', reason: 'request_consistent_with_decision' };
        }
        return {
          ...result,
          verdict: 'review',
          recommendation: stance === 'requires' || stance === 'forbids' ? 'block_action' : 'ask_operator',
          reason: 'request_contradicts_decision',
        };
      }
    }
    return { ...result, verdict: 'use', recommendation: 'use_current_decision', reason: 'single_current_decision' };
  }
  if (ordered.length > 0) {
    return { ...result, verdict: 'review', recommendation: 'ask_operator', reason: 'no_current_decision', ...(recheck ? { recheck } : {}) };
  }
  return result;
}

/** Verdicts worst first: an aggregate over many families must not under-report. */
export const CHECK_VERDICT_SEVERITY: Readonly<Record<CheckVerdict, number>> = {
  review: 0,
  use_replacement: 1,
  use: 2,
  no_decision: 3,
};

/** Lower is worse. */
export function checkVerdictSeverity(verdict: CheckVerdict): number {
  return CHECK_VERDICT_SEVERITY[verdict] ?? 4;
}

/** The worst of several results (the first on a tie), or undefined for none. */
export function worstCheckResult<T extends Pick<CheckResult, 'verdict'>>(results: readonly T[]): T | undefined {
  let worst: T | undefined;
  for (const result of results) {
    if (!worst || checkVerdictSeverity(result.verdict) < checkVerdictSeverity(worst.verdict)) worst = result;
  }
  return worst;
}

/** One line for a title from a decision's text: its first line, cut at a sentence or a word near 100 characters. */
export function decisionTitleFromText(text: string, max = 100): string {
  const firstLine = text.trim().split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
  const line = firstLine.replace(/^#+\s*/, '');
  if (line.length <= max) return line;
  const sentence = /^(.{20,}?[.!?])\s/.exec(line);
  if (sentence && sentence[1].length <= max) return sentence[1];
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}
