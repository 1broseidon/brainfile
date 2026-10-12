/**
 * Writing decisions (spec-11): `decide` with auto-supersede by claim key,
 * `supersede` by hand, and retiring a decision to `logs/` as superseded,
 * rejected or stale. Also the predicates that read files: a source file
 * unchanged since the decision (sha256), and a package version in the
 * project's manifests.
 *
 * A current decision lives in `board/`; a retired one moves to `logs/` with
 * its status and links. Decisions never write ledger records: they are not
 * completed work. Node only (fs, crypto).
 *
 * @packageDocumentation
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { DecisionKind, DecisionStance, Task, TaskDocument } from './types/base';
import type { TypesConfig } from './types/board';
import type { V2Dirs } from './workspace';
import { composeBody } from './workspace';
import { readTaskFile, readTasksDir, taskFileName, writeTaskFile, serializeTaskContent } from './taskFile';
import { addTaskFile, type TaskOperationResult } from './taskOperations';
import { decisionStatus, idList } from './docGraph';
import { resolveDocType } from './docTypes';
import {
  claimKeyOf,
  combinePredicateChecks,
  comparePredicateValue,
  decisionTitleFromText,
  evaluateValidUntil,
  isCurrentDecision,
  isDecisionDoc,
  isDecisionKind,
  isDecisionStance,
  isHistoricalDecision,
  isValidClaimKey,
  normalizeClaimKey,
  parsePackageSpec,
  parsePredicateTime,
  relatedClaimFamilies,
  type PackageSpec,
  type PredicateCheck,
  type PredicateReport,
  type RelatedClaim,
} from './decisions';

// ── reading ────────────────────────────────────────────────────────────────

/** A decision document and where it is. */
export interface DecisionDocument extends TaskDocument {
  /** True when it sits in logs/ (retired, or a legacy promoted ADR). */
  inLogs: boolean;
}

/** Every decision on a board: board/ first, then logs/. */
export function readDecisionDocs(dirs: Pick<V2Dirs, 'boardDir' | 'logsDir'>, types?: TypesConfig): DecisionDocument[] {
  const out: DecisionDocument[] = [];
  const seen = new Set<string>();
  for (const [dir, inLogs] of [[dirs.boardDir, false], [dirs.logsDir, true]] as const) {
    for (const doc of readTasksDir(dir)) {
      if (seen.has(doc.task.id) || !isDecisionDoc(doc.task, types)) continue;
      seen.add(doc.task.id);
      out.push({ ...doc, inLogs });
    }
  }
  return out;
}

/**
 * The directory a board's project lives in: the folder holding `.brainfile/`.
 * Relative paths in decisions (`sourcePath`) resolve against it, never
 * against the shell's working directory.
 */
export function projectRootOf(brainfilePath: string): string {
  const dotDir = path.dirname(path.resolve(brainfilePath));
  return path.dirname(dotDir);
}

/** sha256 of a file, hex. Null when it cannot be read. */
export function hashFileSha256(filePath: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

// ── predicates that read files ─────────────────────────────────────────────

/** Where predicates look: the project root, and an injectable clock. */
export interface PredicateContext {
  projectRoot: string;
  /** Epoch ms; defaults to now. */
  now?: number;
}

function resolveInProject(projectRoot: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
}

/** `sourcePath` + `sourceHash`: holds while the file hashes the same. */
export function evaluateSourceUnchanged(sourcePath: unknown, sourceHash: unknown, ctx: PredicateContext): PredicateCheck {
  const rel = typeof sourcePath === 'string' ? sourcePath.trim() : '';
  const want = typeof sourceHash === 'string' ? sourceHash.trim().replace(/^sha256:/i, '').toLowerCase() : '';
  if (!rel) return { kind: 'source_unchanged', status: 'unknown', reason: 'missing_source_path' };
  if (!want) return { kind: 'source_unchanged', status: 'unknown', reason: 'missing_source_hash', expected: rel };
  const got = hashFileSha256(resolveInProject(ctx.projectRoot, rel));
  if (!got) return { kind: 'source_unchanged', status: 'broken', reason: 'source_unreadable', expected: rel };
  if (got === want) return { kind: 'source_unchanged', status: 'holds', reason: 'source_hash_matches', expected: rel };
  return { kind: 'source_unchanged', status: 'broken', reason: 'source_hash_changed', expected: `${rel} sha256:${want.slice(0, 12)}`, actual: `sha256:${got.slice(0, 12)}` };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A version spec from package.json: a dependency of any kind, or `engines.<name>`. */
export function packageJsonVersion(doc: Record<string, unknown>, name: string): string | undefined {
  if (name.startsWith('engines.')) {
    const engines = doc.engines as Record<string, unknown> | undefined;
    const value = engines?.[name.slice('engines.'.length)];
    return typeof value === 'string' ? value : undefined;
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = doc[section] as Record<string, unknown> | undefined;
    const value = deps?.[name];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** A version from go.mod: the `go` directive, or a required module. */
export function goModVersion(raw: string, name: string): string | undefined {
  let inRequire = false;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line === ')') { inRequire = false; continue; }
    if (/^require\s*\($/.test(line)) { inRequire = true; continue; }
    const fields = line.split(/\s+/);
    if (fields[0] === 'go' && name === 'go' && fields[1]) return fields[1];
    if (fields[0] === 'require' && fields[1] === name && fields[2]) return fields[2].replace(/^v/, '');
    if (inRequire && fields[0] === name && fields[1]) return fields[1].replace(/^v/, '');
  }
  return undefined;
}

/** A version from pyproject.toml: `requires-python`, a `key = value`, or a PEP 508 dependency string. */
export function pyprojectVersion(raw: string, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const kv = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) {
      const key = kv[1].toLowerCase();
      const value = kv[2].trim().replace(/^["']|["'],?$/g, '');
      if ((wanted === 'requires-python' || wanted === 'python') && (key === 'requires-python' || key === 'python_requires' || key === 'python')) return value;
      if (key === wanted) return value;
    }
    const dep = /^["']([A-Za-z0-9_.-]+)\s*(\[[^\]]*\])?\s*([<>=!~^][^"';]*)["']/.exec(line);
    if (dep && dep[1].toLowerCase() === wanted) return dep[3].trim();
  }
  return undefined;
}

/** Find the version a project declares for a package: package.json, go.mod, then pyproject.toml. */
export function findDeclaredVersion(projectRoot: string, name: string): { version: string; manifest: string } | undefined {
  const pkg = readJson(path.join(projectRoot, 'package.json'));
  if (pkg) {
    const version = packageJsonVersion(pkg, name);
    if (version) return { version, manifest: 'package.json' };
  }
  for (const [file, read] of [['go.mod', goModVersion], ['pyproject.toml', pyprojectVersion]] as const) {
    try {
      const version = read(fs.readFileSync(path.join(projectRoot, file), 'utf-8'), name);
      if (version) return { version, manifest: file };
    } catch {
      // No such manifest.
    }
  }
  return undefined;
}

/** `packageVersion: zod>=4.3`: holds while the project declares a version that satisfies it. */
export function evaluatePackageVersion(spec: unknown, ctx: PredicateContext): PredicateCheck {
  const parsed = parsePackageSpec(spec);
  if (!parsed) return { kind: 'package_version', status: 'unknown', reason: 'invalid_package_version', ...(typeof spec === 'string' ? { expected: spec } : {}) };
  const expected = `${parsed.name}${parsed.operator}${parsed.version}`;
  const found = findDeclaredVersion(ctx.projectRoot, parsed.name);
  if (!found) return { kind: 'package_version', status: 'unknown', reason: 'package_version_missing', expected };
  const ok = comparePredicateValue(found.version, parsed.operator, parsed.version);
  const actual = `${found.version} (${found.manifest})`;
  if (ok === null) return { kind: 'package_version', status: 'unknown', reason: 'predicate_comparison_unknown', expected, actual };
  return ok
    ? { kind: 'package_version', status: 'holds', reason: 'package_version_matches', expected, actual }
    : { kind: 'package_version', status: 'broken', reason: 'package_version_mismatch', expected, actual };
}

/** Every deterministic predicate a decision carries, evaluated. */
export function evaluateDecisionPredicates(task: Task, ctx: PredicateContext): PredicateReport {
  const record = task as Task & Record<string, unknown>;
  const now = ctx.now ?? Date.now();
  const checks: PredicateCheck[] = [];
  if (record.validUntil !== undefined && record.validUntil !== null && record.validUntil !== '') {
    checks.push(evaluateValidUntil(record.validUntil, now));
  }
  if (typeof record.sourcePath === 'string' && record.sourcePath.trim()) {
    checks.push(evaluateSourceUnchanged(record.sourcePath, record.sourceHash, ctx));
  }
  if (typeof record.packageVersion === 'string' && record.packageVersion.trim()) {
    checks.push(evaluatePackageVersion(record.packageVersion, ctx));
  }
  return combinePredicateChecks(checks);
}

// ── writing ────────────────────────────────────────────────────────────────

/** A new decision. */
export interface DecideInput {
  /** Dotted claim family, e.g. `dependency.http-client`. Lowercased on write. */
  claimKey?: string;
  /** The decision and why. The first line becomes the title unless `title` is given. */
  text: string;
  title?: string;
  kind?: DecisionKind | string;
  stance?: DecisionStance | string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  validUntil?: string;
  /** A file the decision rests on; its sha256 is recorded for the source-unchanged predicate. */
  sourcePath?: string;
  /** `name<op>version`: the package-version predicate. */
  packageVersion?: string;
  tags?: string[];
  /** Work that rests on the new decision: each gets it added to its `decisions:`. */
  forWork?: string[];
}

export interface DecideOptions {
  /** The board's `types:`. */
  types?: TypesConfig;
  /** Project root for `sourcePath` and the package predicate. Defaults to the folder holding `.brainfile/`. */
  projectRoot?: string;
  /** Do not supersede the family's current decision (leaves two current: `check` will say review). */
  noSupersede?: boolean;
  /** Who is acting, for the notes written on retired decisions. */
  agent?: string;
  /** Injectable clock. */
  now?: string;
}

export interface DecideResult {
  success: boolean;
  error?: string;
  /** The new decision (or the existing one, for a duplicate). */
  decision?: Task;
  filePath?: string;
  /** True when the family's current decision already says exactly this; nothing was written. */
  duplicate?: boolean;
  /** Decisions this one superseded, as they now stand in logs/. */
  superseded: Task[];
  /** True when the claim family had no current decision before this one. */
  familyWasEmpty: boolean;
  /** Other claim families that may say the same thing (only when the family was empty). */
  related: RelatedClaim[];
  /** Work that now rests on the decision (`forWork`), and IDs that were not found. */
  linked: string[];
  notFound: string[];
}

function failure(error: string): DecideResult {
  return { success: false, error, superseded: [], familyWasEmpty: false, related: [], linked: [], notFound: [] };
}

/** Problems with a decide input, or null when it is fine. */
export function validateDecideInput(input: DecideInput, options: { requireClaimKey?: boolean } = {}): string | null {
  if (!input.text || !input.text.trim()) return 'decision text is empty';
  const key = normalizeClaimKey(input.claimKey);
  if (options.requireClaimKey && !key) return '--claim-key is required (a dotted family, e.g. dependency.http-client)';
  if (key && !isValidClaimKey(key)) {
    return `invalid claim key '${input.claimKey}': dotted segments of letters, digits, _ and - (e.g. dependency.http-client)`;
  }
  if (input.kind !== undefined && !isDecisionKind(String(input.kind).trim().toLowerCase())) {
    return `invalid kind '${input.kind}' (want: decision, preference, constraint, rule)`;
  }
  const stance = input.stance === undefined ? '' : String(input.stance).trim().toLowerCase();
  if (stance && !isDecisionStance(stance)) {
    return `invalid stance '${input.stance}' (want: prefers, rejects, requires, forbids)`;
  }
  const subject = input.subject?.trim() ?? '';
  if (Boolean(stance) !== Boolean(subject)) return 'stance and subject go together: give both or neither';
  if (input.validUntil !== undefined && input.validUntil.trim() && parsePredicateTime(input.validUntil) === null) {
    return `invalid valid-until '${input.validUntil}' (want a date like 2026-12-31, or an ISO timestamp)`;
  }
  if (input.packageVersion !== undefined && input.packageVersion.trim() && !parsePackageSpec(input.packageVersion)) {
    return `invalid package version '${input.packageVersion}' (want name<op>version, e.g. zod>=4.3 or engines.node>=20)`;
  }
  return null;
}

function decisionFields(input: DecideInput, projectRoot: string, supersedes: string[]): { fields: Record<string, unknown>; error?: string } {
  const fields: Record<string, unknown> = {};
  const key = normalizeClaimKey(input.claimKey);
  if (key) fields.claimKey = key;
  fields.kind = input.kind ? String(input.kind).trim().toLowerCase() : 'decision';
  const stance = input.stance ? String(input.stance).trim().toLowerCase() : '';
  if (stance) {
    fields.stance = stance;
    fields.subject = input.subject!.trim();
  }
  if (input.holdsWhile?.trim()) fields.holdsWhile = input.holdsWhile.trim();
  if (input.recheck?.trim()) fields.recheck = input.recheck.trim();
  if (input.validUntil?.trim()) fields.validUntil = input.validUntil.trim();
  if (input.sourcePath?.trim()) {
    const abs = resolveInProject(projectRoot, input.sourcePath.trim());
    const hash = hashFileSha256(abs);
    if (!hash) return { fields, error: `cannot read source ${input.sourcePath}` };
    // Through symlinks (macOS /var is /private/var), so a path typed in the shell stays relative.
    const real = (p: string) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return p;
      }
    };
    const rel = path.relative(real(projectRoot), real(abs));
    fields.sourcePath = (!rel || rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel).split(path.sep).join('/');
    fields.sourceHash = `sha256:${hash}`;
  }
  if (input.packageVersion?.trim()) {
    const spec = parsePackageSpec(input.packageVersion) as PackageSpec;
    fields.packageVersion = `${spec.name}${spec.operator}${spec.version}`;
  }
  if (supersedes.length === 1) fields.supersedes = supersedes[0];
  else if (supersedes.length > 1) fields.supersedes = supersedes;
  return { fields };
}

function sameText(doc: DecisionDocument, title: string, text: string): boolean {
  const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const body = doc.body.replace(/^## Description\s*/m, '');
  return norm(doc.task.title) === norm(title) && (norm(text) === norm(title) || norm(body) === norm(text) || norm(doc.task.description as string) === norm(text));
}

function sameStance(task: Task, input: DecideInput): boolean {
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
  return norm(task.stance) === norm(input.stance) && norm(task.subject) === norm(input.subject);
}

/**
 * Record a decision. When its claim family already has a current decision,
 * that one is superseded (status, `supersededBy`, moved to logs/) and the new
 * one `supersedes` it, unless `noSupersede`. When the family was empty,
 * `related` names current decisions in other families that may say the same
 * thing. Re-deciding exactly what the family's current decision says writes
 * nothing and returns it as a duplicate.
 */
export function decideFile(dirs: V2Dirs, input: DecideInput, options: DecideOptions = {}): DecideResult {
  const invalid = validateDecideInput(input);
  if (invalid) return failure(invalid);
  return writeDecision(dirs, input, options, null);
}

/**
 * Supersede a decision by hand: a new decision in the same claim family
 * (`claimKey` defaults to the old one's), and the old one retired as
 * superseded. Refuses a decision that is already superseded, rejected or stale.
 */
export function supersedeDecisionFile(
  dirs: V2Dirs,
  oldId: string,
  input: DecideInput,
  options: DecideOptions = {},
): DecideResult {
  const docs = readDecisionDocs(dirs, options.types);
  const old = docs.find((doc) => doc.task.id === oldId);
  if (!old) {
    const any = readTaskFile(path.join(dirs.boardDir, safeFileName(oldId) ?? '')) ?? readTaskFile(path.join(dirs.logsDir, safeFileName(oldId) ?? ''));
    return failure(any ? `${oldId} is not a decision` : `Decision not found: ${oldId}`);
  }
  if (isHistoricalDecision(old.task)) {
    const status = decisionStatus(old.task as Task & { status?: unknown });
    const by = typeof old.task.supersededBy === 'string' && old.task.supersededBy ? ` by ${old.task.supersededBy}` : '';
    return failure(`${oldId} is already ${status}${by}; supersede the decision that stands instead`);
  }
  const merged: DecideInput = {
    ...input,
    claimKey: input.claimKey ?? claimKeyOf(old.task),
    kind: input.kind ?? (typeof old.task.kind === 'string' ? old.task.kind : undefined),
  };
  const invalid = validateDecideInput(merged);
  if (invalid) return failure(invalid);
  return writeDecision(dirs, merged, options, old);
}

function safeFileName(id: string): string | null {
  try {
    return taskFileName(id);
  } catch {
    return null;
  }
}

function writeDecision(dirs: V2Dirs, input: DecideInput, options: DecideOptions, explicitOld: DecisionDocument | null): DecideResult {
  const types = options.types;
  const projectRoot = options.projectRoot ?? path.dirname(dirs.dotDir);
  const claimKey = normalizeClaimKey(input.claimKey);
  const title = input.title?.trim() || decisionTitleFromText(input.text);
  const text = input.text.trim();
  const docs = readDecisionDocs(dirs, types);

  const familyCurrent = claimKey
    ? docs.filter((doc) => claimKeyOf(doc.task) === claimKey && isCurrentDecision(doc.task))
    : [];
  const familyWasEmpty = familyCurrent.length === 0 && !explicitOld;

  if (!explicitOld) {
    const duplicate = familyCurrent.find((doc) => sameText(doc, title, text) && sameStance(doc.task, input));
    if (duplicate) {
      return {
        success: true,
        decision: duplicate.task,
        filePath: duplicate.filePath,
        duplicate: true,
        superseded: [],
        familyWasEmpty: false,
        related: [],
        linked: [],
        notFound: [],
      };
    }
  }

  const toRetire: DecisionDocument[] = explicitOld
    ? [explicitOld]
    : options.noSupersede ? [] : familyCurrent;

  const { fields, error } = decisionFields(input, projectRoot, toRetire.map((doc) => doc.task.id));
  if (error) return failure(error);

  const body = text === title ? '' : composeBody(text);
  const created = addTaskFile(
    dirs.boardDir,
    {
      title,
      type: 'decision',
      status: 'current',
      fields,
      ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
    },
    body,
    dirs.logsDir,
    { types: typesForDecision(types) },
  );
  if (!created.success || !created.task) return failure(created.error ?? 'Failed to write the decision');
  const decision = created.task;

  const superseded: Task[] = [];
  for (const old of toRetire) {
    const retired = retireDecisionFile(dirs, old.task.id, 'superseded', {
      supersededBy: decision.id,
      types,
      ...(options.agent ? { agent: options.agent } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    if (!retired.success || !retired.task) {
      return { ...failure(`${decision.id} was written, but ${old.task.id} could not be retired: ${retired.error}`), decision, filePath: created.filePath };
    }
    superseded.push(retired.task);
  }

  const linked: string[] = [];
  const notFound: string[] = [];
  for (const workId of idList(input.forWork)) {
    const linkedOk = addDecisionToWork(dirs, workId, decision.id);
    (linkedOk ? linked : notFound).push(workId);
  }

  const related = familyWasEmpty
    ? relatedClaimFamilies(
      docs.map((doc) => ({ task: doc.task, body: doc.body })),
      { claimKey, text: `${title}\n${text}`, excludeIds: [decision.id] },
      types,
    )
    : [];

  return {
    success: true,
    decision,
    ...(created.filePath ? { filePath: created.filePath } : {}),
    superseded,
    familyWasEmpty,
    related,
    linked,
    notFound,
  };
}

/** `decision` resolved on a board whose `types:` may configure the alias name only. */
function typesForDecision(types: TypesConfig | undefined): TypesConfig | undefined {
  return resolveDocType('decision', types).role === 'decision' ? types : undefined;
}

function addDecisionToWork(dirs: V2Dirs, workId: string, decisionId: string): boolean {
  const file = safeFileName(workId);
  if (!file) return false;
  const filePath = path.join(dirs.boardDir, file);
  const doc = readTaskFile(filePath);
  if (!doc || doc.task.id !== workId) return false;
  const decisions = idList(doc.task.decisions);
  if (!decisions.includes(decisionId)) decisions.push(decisionId);
  writeTaskFile(filePath, { ...doc.task, decisions, updatedAt: new Date().toISOString() }, doc.body);
  return true;
}

/** How a decision leaves the board. */
export type RetiredDecisionStatus = 'superseded' | 'rejected' | 'stale';

export interface RetireDecisionOptions {
  /** For `superseded`: the decision that replaced it. */
  supersededBy?: string;
  /** Why, written as a note on the decision. */
  note?: string;
  agent?: string;
  types?: TypesConfig;
  now?: string;
}

/**
 * Retire a decision: set its status (and `supersededBy`), and move it from
 * board/ to logs/. One already in logs/ (a legacy promoted ADR) is updated
 * where it is. No ledger record is written: a decision is not completed work.
 */
export function retireDecisionFile(
  dirs: Pick<V2Dirs, 'boardDir' | 'logsDir'>,
  id: string,
  status: RetiredDecisionStatus,
  options: RetireDecisionOptions = {},
): TaskOperationResult {
  const file = safeFileName(id);
  if (!file) return { success: false, error: `Invalid decision ID: ${id}` };
  const boardPath = path.join(dirs.boardDir, file);
  const logsPath = path.join(dirs.logsDir, file);
  const onBoard = readTaskFile(boardPath);
  const inLogs = onBoard ? null : readTaskFile(logsPath);
  const doc = onBoard ?? inLogs;
  if (!doc || doc.task.id !== id) return { success: false, error: `Decision not found: ${id}` };
  if (!isDecisionDoc(doc.task, options.types)) return { success: false, error: `${id} is not a decision` };
  if (status === 'superseded' && !options.supersededBy) {
    return { success: false, error: 'a superseded decision needs supersededBy' };
  }

  const now = options.now ?? new Date().toISOString();
  const { column: _column, position: _position, ...rest } = doc.task;
  const task: Task = {
    ...rest,
    status,
    ...(options.supersededBy ? { supersededBy: options.supersededBy } : {}),
    updatedAt: now,
  };
  if (status !== 'superseded' && !options.supersededBy) delete task.supersededBy;

  let body = doc.body;
  if (options.note?.trim()) {
    body = noteInBody(body, `${status}: ${options.note.trim()}`, now, options.agent);
  }

  try {
    if (onBoard) {
      if (fs.existsSync(logsPath)) return { success: false, error: `${id} already exists in logs/` };
      fs.mkdirSync(dirs.logsDir, { recursive: true });
      fs.writeFileSync(logsPath, serializeTaskContent(task, body), { encoding: 'utf-8', flag: 'wx' });
      fs.unlinkSync(boardPath);
    } else {
      writeTaskFile(logsPath, task, body);
    }
  } catch (err) {
    return { success: false, error: `Failed to retire ${id}: ${err}` };
  }
  return { success: true, task, filePath: logsPath };
}

/** Add a `- <ts> [agent]: text` line to the body's `## Log` section (the same shape as `appendLog`). */
function noteInBody(body: string, text: string, now: string, agent?: string): string {
  const line = `- ${now}${agent ? ` [${agent}]` : ''}: ${text}`;
  const match = /^## Log\s*$/m.exec(body);
  if (match) {
    const at = match.index + match[0].length;
    return `${body.slice(0, at)}\n${line}${body.slice(at)}`;
  }
  const base = body.length > 0 && !body.endsWith('\n') ? `${body}\n` : body;
  return `${base}${base.length > 0 ? '\n' : ''}## Log\n${line}\n`;
}
