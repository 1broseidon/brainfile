/**
 * Brief command — per-agent "what changed that I should care about?".
 *
 *   brainfile brief --agent codex           Delta since this agent's last brief
 *   brainfile brief --agent codex --peek    Same, without advancing the checkpoint
 *   brainfile brief --agent codex --json    Machine-readable envelope
 *
 * The first brief for an agent is a full orientation (board rules, assigned
 * tasks, latest notes, recent completions). Every later brief is a delta.
 *
 * Rendering is plain chalk, matching the rest of the non-TUI command surface.
 * It borrows only the dependency-free glyph vocabulary from the TUI theme so
 * the v3 design language stays consistent; no TUI file is modified.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import chalk from 'chalk';
import {
  buildBrief,
  isEmptyBrief,
  readBriefState,
  writeBriefState,
  type BriefResult,
} from '@brainfile/core';
import { isV2, getV2Dirs } from '../utils/v2-detect';
import { GLYPHS } from '../tui/theme';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { ExitCode } from '../utils/errorHandler';

export interface BriefOptions {
  file?: string;
  agent?: string;
  peek?: boolean;
  json?: boolean;
}

/** `--json` envelope version. Bump only on a breaking payload change. */
export const BRIEF_JSON_VERSION = '0.1';

export interface BriefCommandResult extends BriefResult {
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

  const dirs = getV2Dirs(filePath);
  const peek = options.peek === true;

  const state = readBriefState(filePath, agent);
  const result = buildBrief(dirs, agent, { lastBriefAt: state.lastBriefAt });

  // Peek is a caller-side no-op on the write step only — the brief itself is
  // identical either way, and no state file is created on a first-ever peek.
  if (!peek) {
    writeBriefState(filePath, agent, result.generatedAt);
  }

  return { ...result, peek };
}

// ============================================================================
// Rendering
// ============================================================================

function renderBrief(result: BriefCommandResult, logger: Logger): void {
  const modeLabel = result.mode === 'full' ? 'first brief' : 'since last brief';
  const header = `${chalk.bold(result.agent)} ${chalk.gray('·')} ${chalk.gray(modeLabel)}`;
  logger.log(header + (result.peek ? chalk.gray('  (peek)') : ''));

  if (isEmptyBrief(result)) {
    logger.log('');
    logger.log(chalk.gray(`  ${GLYPHS.success} Nothing new since your last brief.`));
    return;
  }

  for (const lane of result.lanes) {
    if (lane.items.length === 0) continue;

    logger.log('');
    logger.log(chalk.bold(lane.label));

    // Align the why-column so the eye can scan reasons independently of text.
    const width = Math.max(...lane.items.map((item) => laneKey(item.taskId).length));

    for (const item of lane.items) {
      const key = laneKey(item.taskId).padEnd(width);
      const prefix = key.trim().length > 0 ? chalk.cyan(key) : key;
      logger.log(`  ${prefix}  ${item.text}  ${chalk.gray(`(${item.why})`)}`);
    }
  }
}

function laneKey(taskId?: string): string {
  return taskId ? `${GLYPHS.pointer} ${taskId}` : '';
}
