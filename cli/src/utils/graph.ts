/**
 * CLI glue for the document graph (spec-12): read a board's graph, and turn a
 * link check into a refusal or warnings.
 */
import chalk from 'chalk';
import {
  buildDocGraph,
  checkDocumentLinks,
  getV2Dirs,
  readBoardGraph,
  readTasksDir,
  type BoardGraph,
  type DocGraph,
  type LinkChange,
  type LinkCheckResult,
  type ResolvedDocType,
  type Task,
  type TypesConfig,
} from '@brainfile/core';
import { CLIError } from './cli-error';
import { type Logger } from './logger';

export { readBoardGraph, type BoardGraph };

/** Throw on refusals; print warnings. */
export function applyLinkCheck(result: LinkCheckResult, logger: Logger): void {
  if (result.errors.length > 0) {
    const [first, ...rest] = result.errors;
    throw new CLIError(first, undefined, rest.length > 0 ? rest.join('\n') : undefined);
  }
  for (const warning of result.warnings) {
    logger.warn(chalk.yellow(`Warning: ${warning}`));
  }
}

/** Check the links a write would set against the board, refusing or warning as the board's strictness says. */
export function checkLinks(board: BoardGraph, change: LinkChange, logger: Logger): void {
  applyLinkCheck(
    checkDocumentLinks(board.graph, change, { strict: board.config?.strict === true }),
    logger,
  );
}

/** `▸ epic`, `◆ spec`, `task`: a type with its glyph, for prose. */
export function typeWithGlyph(type: ResolvedDocType): string {
  return type.glyph ? `${type.glyph} ${type.name}` : type.name;
}

/** Comma-separated IDs, trimmed, empties dropped. */
export function splitIds(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * The board's documents as a graph, board/ in column order then position,
 * logs/ after, so an outline reads the way the columns do. `onBoard` holds
 * the IDs read from board/.
 */
export function readOrderedGraph(
  filePath: string,
  columnOrder: string[],
  types: TypesConfig | undefined,
): DocGraph & { onBoard: ReadonlySet<string> } {
  const dirs = getV2Dirs(filePath);
  const rank = (task: Task) => {
    const index = columnOrder.indexOf(task.column ?? '');
    return index === -1 ? columnOrder.length : index;
  };
  const open = readTasksDir(dirs.boardDir).map((doc) => doc.task).sort((a, b) =>
    rank(a) - rank(b)
    || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const done = readTasksDir(dirs.logsDir).map((doc) => doc.task);
  return Object.assign(buildDocGraph([...open, ...done], { types }), { onBoard: new Set(open.map((task) => task.id)) });
}
