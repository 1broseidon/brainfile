/**
 * Brief command: the session-start block (spec-11, recoil's `wake`).
 *
 *   brainfile brief --agent codex                  Budgeted block (~1,600 chars)
 *   brainfile brief --agent codex --max-chars 0    Everything
 *   brainfile brief --agent codex --peek           Same, without advancing the checkpoint
 *   brainfile brief --agent codex --json           Machine-readable envelope
 *
 * The block has lanes: heads up (work resting on a superseded decision,
 * decisions whose predicates broke), current decisions, your tasks (or the
 * work in flight), what changed since this agent's checkpoint, and the docs
 * that bear on the tasks (from the local index, when there is one). The
 * SessionStart hook injects the same block.
 *
 * `--json` keeps the checkpoint lanes (`lanes`: a first brief's orientation,
 * later the delta) and adds the block's `sections`, `text`, `maxChars` and
 * `truncated`.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  readBriefState,
  writeBriefState,
} from '@brainfile/core';
import { composeBrief, DEFAULT_BRIEF_MAX_CHARS, type ComposedBrief } from '@brainfile/core/memory';
import { isV2, getV2Dirs } from '../utils/v2-detect';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { ExitCode } from '../utils/errorHandler';
import { syncBoard, syncMessage } from '../utils/board-sync';
import * as path from 'path';

export interface BriefOptions {
  file?: string;
  agent?: string;
  peek?: boolean;
  offline?: boolean;
  json?: boolean;
  /** Character budget for the block (default 1,600; 0 for no limit). */
  maxChars?: string | number;
}

/** `--json` envelope version. Bump only on a breaking payload change. */
export const BRIEF_JSON_VERSION = '0.1';

export interface BriefCommandResult extends ComposedBrief {
  peek: boolean;
}

export function briefCommand(
  options: BriefOptions,
  logger: Logger = defaultLogger,
): BriefCommandResult | undefined {
  try {
    const result = runBrief(options);

    if (options.json) {
      logger.log(JSON.stringify(
        { version: BRIEF_JSON_VERSION, kind: 'brief', data: result },
        null,
        2,
      ));
    } else {
      renderBrief(result, logger);
    }

    return result;
  } catch (error) {
    // In --json mode brief owns its error output so consumers always get a
    // parseable envelope on stderr. Otherwise let the error propagate to the
    // shared top-level boundary like every other command.
    if (options.json && error instanceof CLIError) {
      const payload = {
        version: BRIEF_JSON_VERSION,
        kind: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          ...(error.details ? { field: error.details } : {}),
        },
      };
      process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
      process.exit(error.exitCode ?? ExitCode.USER_ERROR);
    }
    throw error;
  }
}

function runBrief(options: BriefOptions): BriefCommandResult {
  const agent = options.agent?.trim();
  if (!agent) {
    throw missingRequired('--agent', 'brainfile brief --agent <name>');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }
  if (!isV2(filePath)) {
    throw operationFailed(
      'Brief requires v2 per-task file architecture. Run: brainfile migrate',
    );
  }

  // A shared board syncs first so the brief reflects other machines. Sync
  // failures are a one-line warning: the brief itself never fails over them.
  if (!options.offline) {
    const sync = syncBoard(path.dirname(filePath));
    if (!sync.skipped && !sync.ok) {
      process.stderr.write(`${syncMessage(sync).text}\n`);
    }
  }

  const dirs = getV2Dirs(filePath);
  const peek = options.peek === true;

  const state = readBriefState(filePath, agent);
  const result = composeBrief(dirs, agent, { lastBriefAt: state.lastBriefAt, maxChars: parseMaxChars(options.maxChars) });

  // Peek is a caller-side no-op on the write step only — the brief itself is
  // identical either way, and no state file is created on a first-ever peek.
  if (!peek) {
    writeBriefState(filePath, agent, result.generatedAt);
  }

  return { ...result, peek };
}

function parseMaxChars(value: string | number | undefined): number {
  if (value === undefined) return DEFAULT_BRIEF_MAX_CHARS;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new CLIError(`--max-chars must be a number of characters, 0 for no limit (got '${value}')`);
  }
  return n;
}

// ============================================================================
// Rendering
// ============================================================================

/** The block as plain text, lightly styled on a terminal (chalk is a no-op when piped). */
function renderBrief(result: BriefCommandResult, logger: Logger): void {
  const lines = result.text.split('\n');
  lines.forEach((line, index) => {
    if (index === 0) logger.log(chalk.bold(line) + (result.peek ? chalk.gray('  (peek)') : ''));
    else if (line.startsWith('## ')) logger.log(chalk.bold(line.slice(3)));
    else if (line.startsWith('! ')) logger.log(chalk.yellow(line));
    else if (line.startsWith('(+')) logger.log(chalk.gray(line));
    else logger.log(line);
  });
}
