import {
  decisionStatus,
  flattenDocTree,
  readBoardConfig,
  resolveDocType,
  typesMatch,
  type DocGraph,
  type DocTreeNode,
  type Task,
} from '@brainfile/core';
import { describeRelatedBoard, relatedBoards, type RelatedBoards } from '@brainfile/core/repo';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { validationError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { buildBoardFromV2, shouldSuggestV2Migration, markV2MigrationHintShown } from '../utils/v2-detect';
import { readOrderedGraph } from '../utils/graph';

type BoardDocGraph = ReturnType<typeof readOrderedGraph>;

export interface ListOptions {
  file: string;
  column?: string;
  tag?: string;
  parent?: string;
  contract?: string;
  /** Document type; aliases work (`adr` is `decision`, `issue` is `task`). `decision` lists decisions. */
  type?: string;
  /** Print the outline: documents nested under their parents. */
  tree?: boolean;
  /** `--related` (true): open tasks on related boards this board depends on. `--related all`: every one. */
  related?: boolean | string;
}

export interface ListResult {
  success: true;
  totalTasks: number;
  columnsDisplayed: number;
}

interface TaskExtras {
  /** Shown in place of the ID: `alias:id` for a task on a related board. */
  ref?: string;
  column?: string;
  neededBy?: string[];
  blockedBy?: string[];
  /** Superseded decisions this task rests on. */
  superseded?: string[];
}

export const LIST_COMMAND_HELP = `
Examples:
  brainfile list
  brainfile list --column todo
  brainfile list --tag urgent
  brainfile list --parent epic-1
  brainfile list --type spec            # aliases work: issue is task, adr is decision
  brainfile list --tree                 # the outline: epics, specs, plans, tasks
  brainfile list --tree --parent epic-1 # everything under one epic
  brainfile list --type decision        # decisions have no column; list leaves them out otherwise
  brainfile list --contract ready
  brainfile list --related          # open tasks on related boards that this board depends on
  brainfile list --related all      # every open task on every related board

Notes:
  - When you don't pass --file, Brainfile auto-detects (prefers .brainfile/brainfile.md)
  - Contract statuses: ready | in_progress | delivered | done | failed
`.trimEnd();

/**
 * List tasks from a brainfile.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function listCommand(options: ListOptions, logger: Logger = defaultLogger): ListResult {
  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  if (options.related !== undefined && options.related !== false) {
    return listRelated(filePath, options.related, logger);
  }

  const board = buildBoardFromV2(filePath);
  const types = readBoardConfig(filePath)?.config.types;
  const graph = readOrderedGraph(filePath, board.columns.map((c) => c.id), types);
  const isDecision = (task: Task) => resolveDocType(task.type, types).role === 'decision';

  if (options.type && resolveDocType(options.type, types).role === 'decision') {
    return listDecisions(graph, options.type, board.title, logger);
  }

  if (options.tree) {
    return listTree(graph, options, board, logger);
  }

  const rel = relatedBoards(filePath);

  // Filter columns if specified
  const columns = options.column
    ? board.columns.filter(col => col.id === options.column || col.title === options.column)
    : board.columns;

  if (columns.length === 0) {
    logger.log(chalk.yellow(`No columns found matching: ${options.column}`));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  // Display board title
  logger.log(chalk.bold.white(`\n${board.title || 'Brainfile Board'}\n`));

  const filtering = Boolean(options.tag || options.parent || options.contract || options.type);

  // Display each column
  for (const column of columns) {
    // Decisions have no column (spec-12): they are listed with --type decision.
    let tasks = column.tasks.filter((task) => !isDecision(task));
    if (options.tag) {
      tasks = tasks.filter(task => task.tags?.includes(options.tag!));
    }
    if (options.parent) {
      tasks = tasks.filter(task => (task as any).parentId === options.parent);
    }
    if (options.contract) {
      const status = options.contract.trim().toLowerCase();
      tasks = tasks.filter(task => task.contract?.status?.toLowerCase() === status);
    }
    if (options.type) {
      tasks = tasks.filter(task => typesMatch(task.type, options.type));
    }

    if (tasks.length === 0 && filtering) {
      continue;
    }

    // Column header
    logger.log(chalk.bold.cyan(`${column.title} (${tasks.length})`));
    logger.log(chalk.gray('─'.repeat(50)));

    if (tasks.length === 0) {
      logger.log(chalk.gray('  (no tasks)\n'));
      continue;
    }

    // Display tasks
    for (const task of tasks) {
      displayTask(task, logger, { blockedBy: blockedBy(rel, task), superseded: supersededFor(graph, task) });
    }
    logger.log('');
  }

  // Display summary
  const totalTasks = board.columns.reduce((sum, col) => sum + col.tasks.filter((task) => !isDecision(task)).length, 0);
  logger.log(chalk.gray(`Total tasks: ${totalTasks}`));
  hiddenDecisionsHint(graph, logger);

  // Show one-time migration hint for legacy/mixed layouts
  if (shouldSuggestV2Migration(filePath)) {
    logger.log('');
    logger.log(
      chalk.yellow('⚠ Legacy brainfile layout detected. ') +
      chalk.gray('Run ') +
      chalk.cyan('brainfile migrate') +
      chalk.gray(' to upgrade to the v2 board/logs structure.')
    );
    markV2MigrationHintShown(filePath);
  }

  return { success: true, totalTasks, columnsDisplayed: columns.length };
}

function supersededFor(graph: DocGraph, task: Task): string[] | undefined {
  const ids = graph.supersededDecisionsOf(task.id).map((link) => link.id);
  return ids.length > 0 ? ids : undefined;
}

/** One dim line saying how many decisions on the board the list left out, and how to see them. */
function hiddenDecisionsHint(graph: BoardDocGraph, logger: Logger): void {
  const hidden = graph.tasks.filter((task) => graph.onBoard.has(task.id) && graph.typeOf(task).role === 'decision').length;
  if (hidden === 0) return;
  const noun = hidden === 1 ? 'decision' : 'decisions';
  logger.log(chalk.gray(`${hidden} ${noun} not shown: brainfile list --type decision`));
}

/**
 * `list --type decision`: decisions have no column, so they are listed on
 * their own, current first. Board and logs both: a promoted ADR lives in
 * logs/ and still stands.
 */
function listDecisions(graph: DocGraph, typeFilter: string, title: string | undefined, logger: Logger): ListResult {
  const order = { current: 0, proposed: 1, stale: 2, rejected: 3, superseded: 4 } as const;
  const decisions = graph.tasks
    .filter((task) => graph.typeOf(task).role === 'decision' && typesMatch(task.type, typeFilter))
    .map((task) => ({ task, status: decisionStatus(task as Task & { status?: unknown }) }))
    .sort((a, b) => order[a.status] - order[b.status] || a.task.id.localeCompare(b.task.id, undefined, { numeric: true }));

  logger.log(chalk.bold.white(`\n${title || 'Brainfile Board'} — decisions\n`));
  if (decisions.length === 0) {
    logger.log(chalk.gray('  No decisions yet. brainfile add --type decision -t "…" records one.\n'));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  const width = Math.max(...decisions.map((d) => d.task.id.length));
  for (const { task, status } of decisions) {
    const glyph = graph.typeOf(task).glyph || '●';
    const by = typeof task.supersededBy === 'string' && task.supersededBy ? ` by ${task.supersededBy}` : '';
    const state = status === 'current' ? chalk.green(status) : chalk.gray(`${status}${by}`);
    const restingOn = graph.restingOn(task.id).filter((w) => graph.isOpenWork(w)).length;
    const resting = restingOn > 0 ? chalk.gray(` · ${restingOn} open resting on it`) : '';
    logger.log(`  ${chalk.magenta(glyph)} ${chalk.gray(task.id.padEnd(width))}  ${chalk.white(task.title)}  ${state}${resting}`);
  }
  logger.log('');
  logger.log(chalk.gray(`Decisions: ${decisions.length}`));
  return { success: true, totalTasks: decisions.length, columnsDisplayed: 0 };
}

/**
 * `list --tree`: open work as an outline, nested by parentId. Decisions are
 * never in it. Filters pick documents and keep their ancestors as dim
 * context; --parent shows one document and everything under it.
 */
function listTree(
  graph: BoardDocGraph,
  options: ListOptions,
  board: { title?: string; columns: Array<{ id: string; title: string }> },
  logger: Logger,
): ListResult {
  const columnTitle = new Map(board.columns.map((c) => [c.id, c.title]));
  const column = options.column
    ? board.columns.find((c) => c.id === options.column || c.title.toLowerCase() === options.column!.toLowerCase())?.id ?? options.column
    : undefined;
  const contract = options.contract?.trim().toLowerCase();
  const filtering = Boolean(column || options.tag || contract || options.type);

  const include = filtering
    ? (task: Task) =>
        (!column || task.column === column)
        && (!options.tag || Boolean(task.tags?.includes(options.tag)))
        && (!contract || task.contract?.status?.toLowerCase() === contract)
        && (!options.type || typesMatch(task.type, options.type))
    : undefined;

  if (options.parent && !graph.get(options.parent)) {
    logger.log(chalk.yellow(`No document ${options.parent} on this board.`));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  const roots = graph.tree({ include, ...(options.parent ? { rootId: options.parent } : {}) });
  const nodes = flattenDocTree(roots);

  logger.log(chalk.bold.white(`\n${board.title || 'Brainfile Board'} — outline\n`));
  if (nodes.length === 0) {
    logger.log(chalk.gray('  Nothing to show.\n'));
    hiddenDecisionsHint(graph, logger);
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  const idWidth = Math.max(...nodes.map((n) => n.task.id.length));
  for (const node of nodes) {
    logger.log(renderTreeLine(node, graph, columnTitle, idWidth));
  }

  const shown = nodes.filter((n) => n.match).length;
  logger.log('');
  logger.log(chalk.gray(`${shown} ${shown === 1 ? 'document' : 'documents'}`));
  hiddenDecisionsHint(graph, logger);
  return { success: true, totalTasks: shown, columnsDisplayed: 0 };
}

function renderTreeLine(
  node: DocTreeNode,
  graph: DocGraph,
  columnTitle: Map<string, string>,
  idWidth: number,
): string {
  const { task, type } = node;
  const indent = '  '.repeat(node.depth);
  // A plain task has no TUI glyph; the outline gives it a dim dot so nesting stays legible.
  const glyph = type.glyph ? chalk.magenta(type.glyph) : chalk.gray('·');
  const id = chalk.gray(task.id.padEnd(idWidth));
  const where = task.column ? chalk.gray(`· ${columnTitle.get(task.column) ?? task.column}`) : '';

  const flags: string[] = [];
  if (node.detachedFrom) {
    const { id: parentId, state } = node.detachedFrom;
    flags.push(state === 'missing'
      ? chalk.yellow(`← ${parentId} (not on this board)`)
      : chalk.gray(`← ${parentId}${state === 'completed' ? ' (done)' : ''}`));
  }
  if (node.offPattern) flags.push(chalk.yellow('⚠ off-pattern parent'));
  if (node.cycle) flags.push(chalk.yellow('⚠ parentId loop'));
  const superseded = graph.supersededDecisionsOf(task.id).map((link) => link.id);
  if (superseded.length > 0) flags.push(chalk.yellow(`⚠ rests on superseded ${superseded.join(', ')}`));

  const title = node.match ? chalk.white(task.title) : chalk.gray(task.title);
  const line = `${indent}${glyph} ${id}  ${title}  ${where}`.trimEnd();
  return flags.length > 0 ? `${line}  ${flags.join('  ')}` : line;
}

/** Cross-repo dependencies of `task` that are not completed (spec-10). */
function blockedBy(rel: RelatedBoards, task: Task): string[] | undefined {
  if (!Array.isArray(task.dependsOn) || task.dependsOn.length === 0) return undefined;
  const refs = rel.blockers(task).map((b) => b.ref);
  return refs.length > 0 ? refs : undefined;
}

/**
 * `list --related [all]`: open tasks on the boards named under `related:`.
 * Never checks a related board out, fetches it or writes to it.
 */
function listRelated(filePath: string, scope: boolean | string, logger: Logger): ListResult {
  if (scope !== true && scope !== 'all') {
    throw validationError(`--related takes no value or 'all' (got '${scope}')`);
  }
  const mode = scope === 'all' ? 'all' : 'depends';
  const rel = relatedBoards(filePath);
  const title = buildBoardFromV2(filePath).title || 'Brainfile Board';

  logger.log(chalk.bold.white(`\n${title} — related boards\n`));

  if (rel.aliases.length === 0) {
    logger.log(chalk.gray('No related boards. Name them under related: in brainfile.md.\n'));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  const listings = rel.openTasks(mode);
  if (listings.length === 0) {
    logger.log(chalk.gray('No task on this board depends on a related board.'));
    logger.log(chalk.gray('Run brainfile list --related all for every open task on them.\n'));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  let total = 0;
  for (const { board, tasks, notFound, neededBy } of listings) {
    const count = board.status === 'found' ? ` (${tasks.length})` : '';
    const name = board.status === 'found' && board.title ? `${describeRelatedBoard(board)} · ${board.title}` : describeRelatedBoard(board);
    logger.log(board.status === 'found' ? chalk.bold.cyan(`${name}${count}`) : chalk.bold.yellow(name));
    logger.log(chalk.gray('─'.repeat(50)));

    if (board.status !== 'found') {
      for (const [id, by] of Object.entries(neededBy)) {
        logger.log(`  ${chalk.gray(`[${board.alias}:${id}]`)} ${chalk.gray(`needed by ${by.join(', ')}`)}`);
      }
      logger.log('');
      continue;
    }

    if (tasks.length === 0 && notFound.length === 0) {
      logger.log(chalk.gray(mode === 'all' ? '  (no open tasks)\n' : '  (nothing open that this board depends on)\n'));
      continue;
    }

    const columnTitles = new Map(board.columns.map((c) => [c.id, c.title]));
    for (const task of tasks) {
      displayTask(task, logger, {
        ref: `${board.alias}:${task.id}`,
        column: columnTitles.get(task.column ?? '') ?? task.column,
        neededBy: neededBy[task.id],
      });
    }
    for (const id of notFound) {
      logger.log(`  ${chalk.gray(`[${board.alias}:${id}]`)} ${chalk.yellow('not on that board')}`);
      logger.log('');
    }
    total += tasks.length;
  }

  logger.log(chalk.gray(`Open on related boards: ${total}`));
  return { success: true, totalTasks: total, columnsDisplayed: listings.length };
}

function displayTask(task: Task, logger: Logger, extras: TaskExtras = {}) {
  // Task ID and title, with optional type badge for non-task types
  const idStr = chalk.gray(`[${extras.ref ?? task.id}]`);
  const typeBadge = task.type && task.type !== 'task' ? chalk.magenta(`[${task.type}]`) + ' ' : '';
  const titleStr = chalk.white(task.title);
  logger.log(`  ${idStr} ${typeBadge}${titleStr}`);

  if (extras.column) {
    logger.log(`    ${chalk.gray('Column:')} ${chalk.white(extras.column)}`);
  }

  // Priority
  if (task.priority) {
    const priorityColor =
      task.priority === 'high' ? chalk.red :
        task.priority === 'medium' ? chalk.yellow :
          chalk.blue;
    logger.log(`    ${chalk.gray('Priority:')} ${priorityColor(task.priority)}`);
  }

  // Tags
  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.map(t => chalk.cyan(`#${t}`)).join(' ');
    logger.log(`    ${chalk.gray('Tags:')} ${tagStr}`);
  }

  // Template
  if (task.template) {
    logger.log(`    ${chalk.gray('Template:')} ${chalk.magenta(task.template)}`);
  }

  const parentId = (task as any).parentId as string | undefined;
  if (parentId) {
    logger.log(`    ${chalk.gray('Parent:')} ${chalk.white(parentId)}`);
  }

  // Subtasks summary
  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter(st => st.completed).length;
    const total = task.subtasks.length;
    const progressStr = `${completed}/${total}`;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    logger.log(`    ${chalk.gray('Subtasks:')} ${progressColor(progressStr)}`);
  }

  if (extras.neededBy && extras.neededBy.length > 0) {
    logger.log(`    ${chalk.gray('Needed by:')} ${chalk.white(extras.neededBy.join(', '))}`);
  }

  if (extras.blockedBy) {
    logger.log(`    ${chalk.gray('Blocked by:')} ${chalk.yellow(extras.blockedBy.join(', '))}`);
  }

  if (extras.superseded) {
    logger.log(`    ${chalk.yellow(`⚠ Rests on a superseded decision: ${extras.superseded.join(', ')}`)}`);
  }

  logger.log('');
}
