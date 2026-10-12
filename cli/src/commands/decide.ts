/**
 * Decisions on the board (spec-11).
 *
 *   brainfile decide --claim-key dependency.http-client "Use undici for HTTP"
 *   brainfile supersede decision-3 "Use fetch now that it retries"
 *   brainfile retire decision-4 --as rejected --note "too costly"
 *
 * `decide` records a current decision in its claim family. When the family
 * already has one, that one is superseded: its status, the links both ways,
 * and it moves to logs/. `supersede` does the same by hand for one decision.
 * `retire` marks a decision rejected or stale and moves it to logs/.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import {
  decideFile,
  readBoardConfig,
  retireDecisionFile,
  summarizeDecision,
  supersedeDecisionFile,
  validateDecideInput,
  type DecideInput,
  type DecideResult,
  type DecisionSummary,
  type RelatedClaim,
  type Task,
} from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, missingRequired, operationFailed } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { ensureV2Dirs } from '../utils/v2-detect';
import { resolveActor } from '../utils/actor';
import { splitIds } from '../utils/graph';

export const DECIDE_COMMAND_HELP = `
Examples:
  brainfile decide --claim-key dependency.http-client "Use undici for HTTP. It ships with Node."
  brainfile decide -k dependency.http-client --stance forbids --subject axios "Never axios: one HTTP client"
  brainfile decide -k release.window --valid-until 2026-12-31 --recheck "Ask the release manager" "Release on Tuesdays"
  brainfile decide -k storage.index --source docs/index.md "Index with SQLite FTS5, as the design says"
  brainfile decide -k runtime.node --package "engines.node>=20" "Support Node 20 and later"
  echo "Long decision text" | brainfile decide -k a.b -

A family has one current decision: a new one supersedes it (status,
supersedes/supersededBy both ways, moved to logs/). --no-supersede keeps both
current; check then says review. When the family was empty, related
families (same parent key, or the same words) are listed.

Kinds: decision (default), preference, constraint, rule.
Stances: prefers, rejects, requires, forbids (with --subject; check reads them).
Predicates check reads: --valid-until, --source (sha256 recorded), --package.`.trimEnd();

export const SUPERSEDE_COMMAND_HELP = `
Examples:
  brainfile supersede decision-3 "Use fetch: it retries now"
  brainfile supersede adr-1 -k storage.board "Boards live on a branch"

The new decision keeps the old one's claim key and kind unless you give
others; stance, subject and predicates are only what you pass.`.trimEnd();

export const RETIRE_COMMAND_HELP = `
Examples:
  brainfile retire decision-4 --as rejected --note "Too costly to run"
  brainfile retire decision-2 --as stale

The decision moves to logs/ with its status. To replace it with a new one,
use brainfile supersede.`.trimEnd();

export interface DecideOptions {
  file?: string;
  claimKey?: string;
  title?: string;
  kind?: string;
  stance?: string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  validUntil?: string;
  source?: string;
  package?: string;
  for?: string;
  tags?: string;
  /** commander's --no-supersede sets supersede: false. */
  supersede?: boolean;
  agent?: string;
  json?: boolean;
  /** The text, already joined; '-' reads stdin. */
  text?: string;
}

export interface DecideCommandResult {
  success: true;
  decision: DecisionSummary & { path: string };
  duplicate: boolean;
  superseded: string[];
  familyWasEmpty: boolean;
  related: RelatedClaim[];
  linked: string[];
  notFound: string[];
}

function readText(text: string | undefined): string {
  if (text === '-') {
    try {
      return fs.readFileSync(0, 'utf-8');
    } catch {
      return '';
    }
  }
  return text ?? '';
}

function boardFor(file: string | undefined): { filePath: string; dirs: ReturnType<typeof ensureV2Dirs>; types: ReturnType<typeof readBoardConfig> } {
  const filePath = resolveCliBrainfilePath(file);
  assertV2Brainfile(filePath);
  return { filePath, dirs: ensureV2Dirs(filePath), types: readBoardConfig(filePath) };
}

function inputFrom(options: DecideOptions, text: string): DecideInput {
  return {
    text,
    ...(options.claimKey !== undefined ? { claimKey: options.claimKey } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.stance ? { stance: options.stance } : {}),
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.holdsWhile ? { holdsWhile: options.holdsWhile } : {}),
    ...(options.recheck ? { recheck: options.recheck } : {}),
    ...(options.validUntil ? { validUntil: options.validUntil } : {}),
    ...(options.source ? { sourcePath: path.resolve(process.cwd(), options.source) } : {}),
    ...(options.package ? { packageVersion: options.package } : {}),
    ...(options.tags ? { tags: options.tags.split(',').map((t) => t.trim()).filter(Boolean) } : {}),
    ...(options.for ? { forWork: splitIds(options.for) } : {}),
  };
}

function resultFrom(result: DecideResult, filePath: string): DecideCommandResult {
  const decision = result.decision as Task;
  const projectRoot = path.dirname(path.dirname(filePath));
  const docPath = result.filePath ? path.relative(projectRoot, result.filePath).split(path.sep).join('/') : '';
  return {
    success: true,
    decision: { ...summarizeDecision(decision), path: docPath },
    duplicate: result.duplicate === true,
    superseded: result.superseded.map((t) => t.id),
    familyWasEmpty: result.familyWasEmpty,
    related: result.related,
    linked: result.linked,
    notFound: result.notFound,
  };
}

function render(result: DecideCommandResult, verb: string, logger: Logger): void {
  const d = result.decision;
  if (result.duplicate) {
    logger.log(chalk.yellow(`Already current: ${d.id}${d.claimKey ? ` · ${d.claimKey}` : ''}`));
    logger.log(chalk.gray(`  ${d.title}`));
    return;
  }
  logger.log(chalk.green(`${verb} ${d.id}${d.claimKey ? chalk.gray(` · ${d.claimKey}`) : ''}`));
  logger.log(`  ${d.title}`);
  const facts: string[] = [];
  if (d.kind && d.kind !== 'decision') facts.push(d.kind);
  if (d.stance && d.subject) facts.push(`${d.stance} ${d.subject}`);
  if (d.holdsWhile) facts.push(`while ${d.holdsWhile}`);
  if (d.validUntil) facts.push(`valid until ${d.validUntil}`);
  if (d.sourcePath) facts.push(`source ${d.sourcePath}`);
  if (d.packageVersion) facts.push(`package ${d.packageVersion}`);
  if (facts.length > 0) logger.log(chalk.gray(`  ${facts.join(' · ')}`));
  for (const id of result.superseded) {
    logger.log(chalk.gray(`  Superseded ${id} (moved to logs/)`));
  }
  if (result.linked.length > 0) logger.log(chalk.gray(`  Rests on it: ${result.linked.join(', ')}`));
  if (result.notFound.length > 0) logger.warn(chalk.yellow(`Warning: not on the board: ${result.notFound.join(', ')}`));
  if (result.related.length > 0) {
    logger.log(chalk.yellow('  Related families (the same call under another key?):'));
    for (const claim of result.related) {
      const why = claim.reason === 'prefix' ? 'same parent key' : 'same words';
      logger.log(chalk.gray(`    ${claim.claimKey} (${claim.id}) ${claim.title} · ${why}`));
    }
  }
}

function finish(result: DecideResult, filePath: string, verb: string, options: { json?: boolean }, logger: Logger): DecideCommandResult {
  if (!result.success || !result.decision) {
    throw operationFailed(result.error ?? 'The decision was not written');
  }
  const out = resultFrom(result, filePath);
  if (options.json) logger.log(JSON.stringify(out, null, 2));
  else render(out, verb, logger);
  return out;
}

/** `brainfile decide`: record a decision in its claim family. */
export function decideCommand(options: DecideOptions, logger: Logger = defaultLogger): DecideCommandResult {
  const text = readText(options.text);
  const input = inputFrom(options, text);
  const invalid = validateDecideInput(input, { requireClaimKey: true });
  if (invalid) {
    if (/claim-key is required/.test(invalid)) throw missingRequired('--claim-key', 'brainfile decide --claim-key <family> "decision text"');
    throw new CLIError(invalid);
  }
  const { filePath, dirs, types } = boardFor(options.file);
  const agent = options.agent?.trim() || resolveActor(path.dirname(filePath))?.name;
  const result = decideFile(dirs, input, {
    types: types?.config.types,
    noSupersede: options.supersede === false,
    ...(agent ? { agent } : {}),
  });
  return finish(result, filePath, 'Decided', options, logger);
}

/** `brainfile supersede <id>`: a new decision replacing one by hand. */
export function supersedeCommand(id: string | undefined, options: DecideOptions, logger: Logger = defaultLogger): DecideCommandResult {
  if (!id) throw missingRequired('<id>', 'brainfile supersede <decision-id> "new decision text"');
  const text = readText(options.text);
  if (!text.trim()) throw missingRequired('text', 'brainfile supersede <decision-id> "new decision text"');
  const { filePath, dirs, types } = boardFor(options.file);
  const agent = options.agent?.trim() || resolveActor(path.dirname(filePath))?.name;
  const result = supersedeDecisionFile(dirs, id, inputFrom(options, text), {
    types: types?.config.types,
    ...(agent ? { agent } : {}),
  });
  return finish(result, filePath, `Superseded ${id} with`, options, logger);
}

export interface RetireOptions {
  file?: string;
  as?: string;
  note?: string;
  agent?: string;
  json?: boolean;
}

export interface RetireCommandResult {
  success: true;
  decision: DecisionSummary & { path: string };
}

/** `brainfile retire <id> --as rejected|stale`: a decision leaves the board. */
export function retireCommand(id: string | undefined, options: RetireOptions, logger: Logger = defaultLogger): RetireCommandResult {
  if (!id) throw missingRequired('<id>', 'brainfile retire <decision-id> --as rejected|stale');
  const status = options.as?.trim().toLowerCase();
  if (status !== 'rejected' && status !== 'stale') {
    throw new CLIError(`--as must be rejected or stale${options.as ? ` (got '${options.as}')` : ''}`, undefined, 'To replace a decision with a new one: brainfile supersede <id> "text"');
  }
  const { filePath, dirs, types } = boardFor(options.file);
  const agent = options.agent?.trim() || resolveActor(path.dirname(filePath))?.name;
  const result = retireDecisionFile(dirs, id, status, {
    types: types?.config.types,
    ...(options.note ? { note: options.note } : {}),
    ...(agent ? { agent } : {}),
  });
  if (!result.success || !result.task) throw operationFailed(result.error ?? `Could not retire ${id}`);
  const projectRoot = path.dirname(path.dirname(filePath));
  const out: RetireCommandResult = {
    success: true,
    decision: { ...summarizeDecision(result.task), path: path.relative(projectRoot, result.filePath!).split(path.sep).join('/') },
  };
  if (options.json) {
    logger.log(JSON.stringify(out, null, 2));
  } else {
    logger.log(chalk.green(`Retired ${id} as ${status}`) + chalk.gray(' (moved to logs/)'));
    logger.log(`  ${result.task.title}`);
    if (options.note) logger.log(chalk.gray(`  ${options.note}`));
  }
  return out;
}
