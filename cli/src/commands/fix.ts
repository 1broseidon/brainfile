/**
 * `brainfile fix` — the desktop health list's Fix and Undo, from the CLI
 * (task-78). It prints what is wrong with where the board lives and what Fix
 * would do, in the words the desktop shows, then does it: only a fix that
 * loses nothing, with every copy backed up first, and only while the plan is
 * still the one shown (`--expected`, by default the plan it just printed).
 * `--undo` puts back what the last fix changed, within 20 seconds of it,
 * whether this CLI, an agent or the desktop ran it. The MCP `where` tool's
 * `action: fix | undo` runs the same.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { isTrackedBoard, unmergedFiles } from '../utils/board-repo';
import { surveyBoards } from '../utils/board-sync';
import {
  FIX_UNDO_MS,
  type BoardProblem,
  type FixPlan,
  applyFix,
  boardProblems,
  lastFix,
  planFix,
  undoFix,
} from '@brainfile/core/repo';

export interface FixOptions {
  file?: string;
  json?: boolean;
  /** Say what Fix would do, and do nothing. */
  dryRun?: boolean;
  /** Put back what the last fix changed. */
  undo?: boolean;
  /** The plan's words as shown; if the plan is different now, nothing runs. */
  expected?: string;
}

export interface FixReport {
  /** The board, after the fix or the undo when one ran. */
  path: string;
  /** Every problem with where the board lives, worst first, as the desktop's health list says them. */
  problems: BoardProblem[];
  /** What Fix would do now; null when nothing can be fixed without a person's choice. */
  plan: Pick<FixPlan, 'kind' | 'words'> | null;
  /** Set when the fix ran. */
  applied?: {
    message: string;
    backups: string[];
    /** Until when `brainfile fix --undo` (or `where` action undo, or the desktop's Undo) can put it back; null when there is nothing to undo. */
    undoUntil: string | null;
  };
  /** Set when an undo ran: what it said. */
  undone?: string;
}

/**
 * What is wrong with where the board at `dotDir` lives, and what Fix would do
 * about it. `project` is the folder asking (the CLI's or the server's working
 * directory): a fix that would remove the checkout it is in is not offered.
 */
export function fixPlanReport(dotDir: string, project = process.cwd()): FixReport {
  const survey = surveyBoards(dotDir);
  const unfinished = isTrackedBoard(dotDir) ? unmergedFiles(dotDir) : [];
  let plan: FixPlan | null = null;
  try {
    plan = planFix(dotDir, project, survey);
  } catch {
    // No plan when it cannot be worked out; the problems still stand.
  }
  return { path: dotDir, problems: boardProblems(survey, unfinished), plan: plan ? { kind: plan.kind, words: plan.words } : null };
}

/** Run the fix while its words are still `expected`; the report is of the board where the fix left it. */
export function runFixReport(dotDir: string, expected: string, project = process.cwd()): FixReport {
  const at = Date.now();
  const applied = applyFix(dotDir, { expected, project, now: at });
  // An adopt leaves the board at .brainfile/ of the main worktree, wherever it was.
  const after = applied.undo?.board?.home ?? dotDir;
  return {
    ...fixPlanReport(after, project),
    applied: {
      message: applied.message,
      backups: applied.backups,
      undoUntil: applied.undo ? new Date(at + FIX_UNDO_MS).toISOString() : null,
    },
  };
}

/** Put back what the last fix changed; the report is of the board where it is again. */
export function undoFixReport(dotDir: string, project = process.cwd()): FixReport {
  const kept = lastFix(dotDir);
  const undone = undoFix(dotDir);
  // A board that was checked out elsewhere before the fix is back there.
  const back = fs.existsSync(path.join(dotDir, 'brainfile.md')) ? dotDir : kept?.record.board?.checkouts[0] ?? dotDir;
  if (!fs.existsSync(path.join(back, 'brainfile.md'))) return { path: back, problems: [], plan: null, undone };
  return { ...fixPlanReport(back, project), undone };
}

function run<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof CLIError) throw error;
    throw new CLIError(error instanceof Error ? error.message : String(error));
  }
}

export function fixCommand(options: FixOptions, logger: Logger = defaultLogger): FixReport {
  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) throw fileNotFound(filePath);
  const dotDir = path.dirname(filePath);
  const label = (name: string) => chalk.bold(name.padEnd(8));
  const more = (text: string) => logger.log(`${' '.repeat(8)}  ${text}`);

  if (options.undo) {
    const report = run(() => undoFixReport(dotDir));
    if (options.json) {
      logger.log(JSON.stringify(report, null, 2));
      return report;
    }
    logger.log(chalk.green(report.undone));
    more(chalk.gray('The board as the fix left it was saved first: brainfile backups.'));
    return report;
  }

  const shown = run(() => fixPlanReport(dotDir));
  if (options.dryRun || !shown.plan) {
    if (options.json) {
      logger.log(JSON.stringify(shown, null, 2));
    } else if (shown.problems.length === 0 && !shown.plan) {
      logger.log(chalk.green('Nothing to fix: one board, where it belongs.'));
    } else {
      for (const problem of shown.problems) {
        logger.log(`${label('Problem')}  ${chalk.yellow(problem.short)}`);
        more(problem.line);
      }
      if (shown.plan) {
        logger.log(`${label('Fix')}  ${shown.plan.words}`);
        more(chalk.gray('Nothing changed. To do it: brainfile fix'));
      } else {
        logger.log(`${label('Fix')}  none that loses nothing: a person decides this one`);
        more(chalk.gray('brainfile where shows every copy; brainfile adopt or merge-boards settles two boards.'));
      }
    }
    if (!shown.plan && !options.dryRun && shown.problems.length > 0) {
      throw new CLIError('No safe fix here now. Nothing was changed.');
    }
    return shown;
  }

  const expected = options.expected ?? shown.plan.words;
  if (!options.json) logger.log(`${label('Fix')}  ${shown.plan.words}`);
  const report = run(() => runFixReport(dotDir, expected));
  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }
  const applied = report.applied!;
  logger.log(chalk.green(applied.message));
  if (applied.backups.length > 0) more(chalk.gray(`Saved first: ${applied.backups.join(', ')}.`));
  more(chalk.gray(applied.undoUntil
    ? `Undo within ${FIX_UNDO_MS / 1000} seconds: brainfile fix --undo. After that, brainfile backups has every copy.`
    : 'Nothing to undo; brainfile backups has every copy.'));
  return report;
}
