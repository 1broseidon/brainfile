/**
 * `brainfile check`: is a decision on the board still safe to act on? (spec-11)
 *
 *   brainfile check "switch the HTTP client to axios"
 *   brainfile check decision-3
 *   brainfile check --claim-key dependency.http-client
 *   brainfile check --claim-key-prefix dependency "add axios"
 *
 * Finds the claim family the action touches (a decision ID, a claim key, or
 * its words: the local index when there is one, a scan of the decisions
 * when there is not) and answers in recoil's verdict order:
 *
 *   use              act on the current decision
 *   review           ask first: two current decisions, a broken predicate
 *                    (validUntil passed, the source file changed, the package
 *                    moved), a contradiction of the decision's stance, or no
 *                    current decision left
 *   use_replacement  the action matched a superseded decision; use the
 *                    current one instead
 *   no_decision      nothing on the board speaks to it
 *
 * Exit codes, for scripts: 0 use or no_decision, 2 review, 3 use_replacement,
 * 1 an error (no board, bad arguments).
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import {
  checkClaimKeyPrefix,
  checkDecision,
  checkExitCode,
  type CheckPrefixResult,
} from '@brainfile/core/memory';
import type { CheckResult, DecisionSummary } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';

export const CHECK_COMMAND_HELP = `
Examples:
  brainfile check "switch the HTTP client to axios"
  brainfile check decision-3
  brainfile check --claim-key dependency.http-client
  brainfile check --claim-key-prefix dependency "add axios"
  brainfile check "add axios" --json

Verdicts: use · review · use_replacement · no_decision
Exit codes: 0 use or no_decision, 2 review, 3 use_replacement, 1 error.`.trimEnd();

export interface CheckCommandOptions {
  file?: string;
  claimKey?: string;
  claimKeyPrefix?: string;
  json?: boolean;
  /** The action, joined, or a decision ID. */
  query?: string;
}

export type CheckCommandResult =
  | (CheckResult & { matchedBy: string; exitCode: number })
  | (CheckPrefixResult & { exitCode: number });

/** Run a check and print it. Sets `process.exitCode` from the verdict unless `setExitCode` is false. */
export function checkCommand(options: CheckCommandOptions, logger: Logger = defaultLogger, setExitCode = true): CheckCommandResult {
  const query = options.query?.trim() ?? '';
  const claimKey = options.claimKey?.trim() ?? '';
  const prefix = options.claimKeyPrefix?.trim() ?? '';
  if (claimKey && prefix) throw new CLIError('choose --claim-key or --claim-key-prefix, not both');
  if (!query && !claimKey && !prefix) {
    throw new CLIError('check needs an action, a decision ID, --claim-key or --claim-key-prefix', undefined, 'Usage: brainfile check "<action>" | <decision-id> | --claim-key <key> | --claim-key-prefix <prefix>');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  let result: CheckCommandResult;
  if (prefix) {
    const prefixResult = checkClaimKeyPrefix(filePath, prefix, query ? { query } : {});
    result = { ...prefixResult, exitCode: checkExitCode(prefixResult.verdict) };
  } else {
    const { matchedBy, result: single } = checkDecision(filePath, { ...(query ? { query } : {}), ...(claimKey ? { claimKey } : {}) });
    result = { ...single, matchedBy, exitCode: checkExitCode(single.verdict) };
  }

  if (options.json) logger.log(JSON.stringify(result, null, 2));
  else if ('claimKeyPrefix' in result) renderPrefix(result, logger);
  else renderSingle(result, logger);

  if (setExitCode) process.exitCode = result.exitCode;
  return result;
}

const VERDICT_COLOR: Record<string, (s: string) => string> = {
  use: chalk.green,
  review: chalk.yellow,
  use_replacement: chalk.cyan,
  no_decision: chalk.gray,
};

function decisionLine(label: string, d: DecisionSummary): string {
  const facts = [d.status, d.stance && d.subject ? `${d.stance} ${d.subject}` : ''].filter(Boolean).join(' · ');
  return `${chalk.bold(`${label}:`)} ${chalk.cyan(d.id)} ${d.title} ${chalk.gray(`(${facts})`)}`;
}

function renderSingle(result: CheckResult & { matchedBy: string }, logger: Logger): void {
  const color = VERDICT_COLOR[result.verdict] ?? ((s: string) => s);
  logger.log(`${chalk.bold('Verdict:')} ${color(result.verdict)} ${chalk.gray(`· ${result.recommendation.replace(/_/g, ' ')} · ${result.reason.replace(/_/g, ' ')}`)}`);
  if (result.verdict === 'no_decision' && !result.claimKey) {
    logger.log(chalk.gray('No decision on the board speaks to this.'));
    return;
  }
  if (result.claimKey) logger.log(`${chalk.bold('Family:')} ${result.claimKey} ${chalk.gray(`(matched by ${result.matchedBy.replace('_', ' ')})`)}`);
  if (result.current) logger.log(decisionLine('Current', result.current));
  if (result.matched && result.matched.id !== result.current?.id) logger.log(decisionLine('Matched', result.matched));
  if (result.replacement) logger.log(decisionLine('Use instead', result.replacement));
  if (result.requestedAction && result.requestedAction !== 'unknown') {
    logger.log(`${chalk.bold('Your action:')} ${result.requestedAction.replace(/_/g, ' ')} ${chalk.gray(`(decision ${result.stance} ${result.subject})`)}`);
  }
  for (const p of result.predicates) {
    const pc = p.status === 'broken' ? chalk.yellow : p.status === 'holds' ? chalk.green : chalk.gray;
    const detail = [p.expected ? `wants ${p.expected}` : '', p.actual ? `found ${p.actual}` : ''].filter(Boolean).join(', ');
    logger.log(`${chalk.bold(`${p.kind.replace(/_/g, ' ')}:`)} ${pc(p.status)} ${chalk.gray(`(${p.reason.replace(/_/g, ' ')}${detail ? `; ${detail}` : ''})`)}`);
  }
  if (result.advisory) logger.log(`${chalk.bold('Holds while:')} ${result.advisory}`);
  if (result.recheck) logger.log(`${chalk.bold('Recheck:')} ${result.recheck}`);
  const history = result.family.filter((d) => d.id !== result.current?.id && d.id !== result.matched?.id);
  if (history.length > 0) {
    logger.log(chalk.gray(`History: ${history.map((d) => `${d.id} (${d.status}${d.supersededBy ? ` by ${d.supersededBy}` : ''})`).join(', ')}`));
  }
}

function renderPrefix(result: CheckPrefixResult, logger: Logger): void {
  const color = VERDICT_COLOR[result.verdict] ?? ((s: string) => s);
  logger.log(`${chalk.bold('Verdict:')} ${color(result.verdict)} ${chalk.gray(`· ${result.familyCount} famil${result.familyCount === 1 ? 'y' : 'ies'} under ${result.claimKeyPrefix}${result.decidingClaimKey ? ` · decided by ${result.decidingClaimKey}` : ''}`)}`);
  for (const family of result.families) {
    const c = VERDICT_COLOR[family.verdict] ?? ((s: string) => s);
    logger.log(`  ${c(family.verdict.padEnd(15))} ${family.claimKey} ${chalk.gray(`${family.current ? family.current.id : 'no current decision'} · ${family.reason.replace(/_/g, ' ')}`)}`);
  }
}
