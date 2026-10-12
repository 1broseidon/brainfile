import {
  buildDocGraph,
  decisionStatus,
  docPlace,
  idList,
  isQualifiedRef,
  parentFit,
  readBoardConfig,
  readTasksDir,
  type DecisionLink,
  type DocGraph,
  type ResolvedDocType,
  type Task,
} from '@brainfile/core';
import {
  describeRelatedBoard,
  describeTaskRefState,
  relatedBoards,
  type RelatedBoard,
  type ResolvedTaskRef,
} from '@brainfile/core/repo';
import chalk from 'chalk';
import { defaultLogger, type Logger } from '../utils/logger';
import {
  CLIError,
  missingRequired,
  taskNotFound,
  validationError,
} from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { getV2Dirs, findV2Task, extractDescription, extractLog } from '../utils/v2-detect';
import { resolveRelatedTask, type FoundRelatedBoard } from '../utils/related';

export interface ShowOptions {
  file: string;
  task?: string;
  json?: boolean;
}

export interface ShowResult {
  success: true;
  taskId: string;
  archived: boolean;
  task?: Task;
  column?: string;
}

/**
 * Show full details of a single task.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function showCommand(options: ShowOptions, logger: Logger = defaultLogger): ShowResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile show --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  if (isQualifiedRef(options.task)) {
    return showRelatedTask(options, filePath, logger);
  }
  return showCommandV2(options, filePath, logger);
}

/**
 * `show -t mobile:task-12` (spec-10): read a task on a related board, found
 * the way `brainfile` in that folder would find it. Read-only.
 */
function showRelatedTask(options: ShowOptions, filePath: string, logger: Logger): ShowResult {
  const target = resolveRelatedTask(filePath, options.task!);
  if (!target.ok) {
    if (target.kind === 'malformed') throw validationError(target.message);
    if (target.kind === 'not-found') throw taskNotFound(options.task!);
    throw new CLIError(target.message, undefined, target.details);
  }
  return showCommandV2({ ...options, task: target.id }, target.board.brainfilePath, logger, target.board);
}

function showCommandV2(
  options: ShowOptions,
  filePath: string,
  logger: Logger,
  relatedBoard?: FoundRelatedBoard,
): ShowResult {
  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, options.task!, true);

  if (!found) {
    throw taskNotFound(options.task!);
  }

  const { doc, isLog } = found;
  const task = { ...doc.task };
  // Restore description from markdown body if not in frontmatter
  if (!task.description) {
    const desc = extractDescription(doc.body);
    if (desc) task.description = desc;
  }

  const childIds = readTasksDir(dirs.boardDir)
    .filter((childDoc) => (childDoc.task as any).parentId === task.id)
    .map((childDoc) => childDoc.task.id);

  // The document's place in the graph (spec-12): parent, children, decisions.
  const types = readBoardConfig(filePath)?.config.types;
  const graph = buildDocGraph([
    ...readTasksDir(dirs.boardDir).map((d) => d.task),
    ...readTasksDir(dirs.logsDir).map((d) => d.task),
  ], { types });
  const place = describePlace(graph, task);

  const columnTitle = isLog ? 'Completed' : (task.column || (place.type.role === 'decision' ? 'none' : 'unknown'));
  const archived = isLog;
  const logContent = extractLog(doc.body);

  // dependsOn, resolved against the board the task lives on.
  const hasDeps = Array.isArray(task.dependsOn) && task.dependsOn.length > 0;
  const rel = hasDeps ? relatedBoards(filePath) : null;
  const dependencies = rel ? rel.dependencies(task) : [];
  const blockers = rel && !archived ? rel.blockers(task) : [];
  const ref = relatedBoard ? `${relatedBoard.alias}:${task.id}` : task.id;

  if (options.json) {
    const jsonOutput = {
      ...task,
      column: columnTitle,
      archived,
      ...(relatedBoard ? { board: relatedBoard.alias, ref } : {}),
      ...(childIds.length > 0 ? { children: childIds } : {}),
      ...(hasDeps ? {
        dependencies: dependencies.map((d) => ({ ref: d.ref, state: d.state, done: d.done })),
        blocked: blockers.length > 0,
      } : {}),
      ...(task.completedAt && { completedAt: task.completedAt }),
      ...(logContent && { log: logContent }),
      graph: docPlace(graph, task.id),
    };
    logger.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    renderTask({ task, columnTitle, archived, childIds, ref, relatedBoard, dependencies, blockers, place }, logger);
    if (task.completedAt) {
      logger.log(`${chalk.bold('Completed:')} ${chalk.white(task.completedAt)}`);
    }
    if (logContent) {
      logger.log('');
      logger.log(chalk.bold('Log:'));
      logger.log(logContent);
    }
    logger.log('');
  }

  return { success: true, taskId: ref, archived, task, column: columnTitle };
}

function renderTask(
  input: {
    task: Task;
    columnTitle: string;
    archived: boolean;
    childIds?: string[];
    ref?: string;
    relatedBoard?: RelatedBoard;
    dependencies?: ResolvedTaskRef[];
    blockers?: ResolvedTaskRef[];
    place: Place;
  },
  logger: Logger
) {
  const { task, columnTitle, archived, dependencies = [], blockers = [], place } = input;
  const isDecision = place.type.role === 'decision';

  logger.log('');
  logger.log(`${chalk.bold('Task:')} ${chalk.cyan(input.ref ?? task.id)}`);
  if (input.relatedBoard) {
    logger.log(`${chalk.bold('Board:')} ${chalk.white(describeRelatedBoard(input.relatedBoard))}`);
  }
  logger.log(`${chalk.bold('Title:')} ${chalk.white(task.title)}`);
  logger.log(`${chalk.bold('Type:')} ${chalk.white(typeLine(place.type))}`);
  if (isDecision) {
    renderDecisionHeader(task, logger);
  } else {
    logger.log(`${chalk.bold('Column:')} ${chalk.white(columnTitle)}${archived ? chalk.gray(' (archived)') : ''}`);
  }

  if (archived) {
    logger.log(`${chalk.bold('Archived:')} ${chalk.yellow('yes')}`);
  }

  if (task.priority) {
    logger.log(`${chalk.bold('Priority:')} ${formatPriority(task.priority)}`);
  }

  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.map((t) => chalk.cyan(`#${t}`)).join(' ');
    logger.log(`${chalk.bold('Tags:')} ${tagStr}`);
  }

  if (task.assignee) {
    const assignee = task.assignee.startsWith('@') ? task.assignee : `@${task.assignee}`;
    logger.log(`${chalk.bold('Assignee:')} ${chalk.magenta(assignee)}`);
  }

  if ((task as any).dueDate) {
    logger.log(`${chalk.bold('Due:')} ${chalk.white(String((task as any).dueDate))}`);
  }

  if (task.template) {
    logger.log(`${chalk.bold('Template:')} ${chalk.magenta(task.template)}`);
  }

  if (place.parent) {
    const parent = place.parent;
    const detail = parent.task
      ? `${chalk.white(parent.task.title)} ${chalk.gray(`(${parent.type!.name}${parent.task.completedAt ? ', done' : ''})`)}`
      : chalk.yellow('not on this board');
    logger.log(`${chalk.bold('Parent:')} ${chalk.cyan(parent.id)} ${detail}`);
    if (parent.offPattern) {
      logger.log(chalk.yellow(`  ⚠ off-pattern: ${parent.offPattern}`));
    }
  }

  if (task.description && task.description.trim().length > 0) {
    logger.log('');
    logger.log(chalk.bold('Description:'));
    logger.log(task.description.trimEnd());
  }

  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter((st) => st.completed).length;
    const total = task.subtasks.length;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    logger.log('');
    logger.log(`${chalk.bold('Subtasks:')} (${progressColor(`${completed}/${total}`)} completed)`);
    for (const st of task.subtasks) {
      const mark = st.completed ? chalk.green('✓') : chalk.gray('○');
      logger.log(`  ${mark} ${st.title}`);
    }
  }

  if (task.relatedFiles && task.relatedFiles.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Related Files:'));
    for (const f of task.relatedFiles) {
      logger.log(`  - ${chalk.gray(f)}`);
    }
  }

  if (place.children.length > 0) {
    const open = place.children.filter((c) => !c.task.completedAt).length;
    logger.log('');
    logger.log(`${chalk.bold('Children:')} ${chalk.gray(`(${place.children.length - open}/${place.children.length} done)`)}`);
    for (const child of place.children) {
      const mark = child.task.completedAt ? chalk.green('✓') : chalk.gray('○');
      logger.log(`  ${mark} ${chalk.white(child.task.id)} ${child.task.title} ${chalk.gray(`(${child.type.name})`)}`);
    }
  }

  if (dependencies.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Depends on:'));
    for (const dep of dependencies) {
      const mark = dep.done ? chalk.green('✓') : chalk.gray('○');
      logger.log(`  ${mark} ${chalk.white(dep.ref)} ${chalk.gray(describeTaskRefState(dep))}`);
    }
    if (blockers.length > 0) {
      logger.log(`${chalk.bold('Blocked by:')} ${chalk.yellow(blockers.map((b) => b.ref).join(', '))}`);
    }
  }

  if (place.decisions.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Rests on:'));
    for (const link of place.decisions) {
      logger.log(`  ${chalk.magenta('●')} ${chalk.white(link.id)} ${describeDecisionLink(link)}`);
    }
    const superseded = place.decisions.filter((link) => link.superseded);
    if (superseded.length > 0 && !task.completedAt) {
      const names = superseded.map((l) => (l.supersededBy ? `${l.id} (superseded by ${l.supersededBy})` : l.id)).join(', ');
      logger.log(chalk.yellow(`⚠ Rests on a superseded decision: ${names}`));
    }
  }

  if (place.restedOnBy.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Rested on by:'));
    for (const work of place.restedOnBy) {
      const mark = work.task.completedAt ? chalk.green('✓') : chalk.gray('○');
      logger.log(`  ${mark} ${chalk.white(work.task.id)} ${work.task.title} ${chalk.gray(`(${work.type.name})`)}`);
    }
  }

  const contract = (task as any).contract as any | undefined;
  if (contract) {
    logger.log('');
    logger.log(chalk.bold('Contract:'));
    if (contract.status) {
      logger.log(`  ${chalk.gray('Status:')} ${chalk.white(String(contract.status))}`);
    }
    if (Array.isArray(contract.deliverables) && contract.deliverables.length > 0) {
      logger.log(`  ${chalk.gray('Deliverables:')} ${chalk.white(String(contract.deliverables.length))}`);
      for (const d of contract.deliverables) {
        const type = d?.type ? String(d.type) : 'deliverable';
        const p = d?.path ? String(d.path) : '';
        const desc = d?.description ? String(d.description) : '';
        logger.log(`    - ${chalk.cyan(type)} ${chalk.gray(p)}${desc ? chalk.gray(` — ${desc}`) : ''}`);
      }
    }
  }

  logger.log('');
}

/** A document's place in the graph, as `show` presents it. */
interface Place {
  type: ResolvedDocType;
  parent?: { id: string; task?: Task; type?: ResolvedDocType; offPattern?: string };
  children: Array<{ task: Task; type: ResolvedDocType }>;
  decisions: DecisionLink[];
  restedOnBy: Array<{ task: Task; type: ResolvedDocType }>;
}

function describePlace(graph: DocGraph, task: Task): Place {
  const type = graph.typeOf(task);
  const parentId = typeof task.parentId === 'string' && task.parentId.trim() ? task.parentId.trim() : undefined;
  let parent: Place['parent'];
  if (parentId) {
    const parentTask = graph.get(parentId);
    if (parentTask) {
      const fit = parentFit(task.type, parentTask.type, graph.types);
      parent = { id: parentId, task: parentTask, type: graph.typeOf(parentTask), ...(fit.fits ? {} : { offPattern: fit.reason }) };
    } else {
      parent = { id: parentId };
    }
  }
  const withType = (t: Task) => ({ task: t, type: graph.typeOf(t) });
  return {
    type,
    parent,
    children: graph.childrenOf(task.id).map(withType),
    decisions: graph.decisionsOf(task.id),
    restedOnBy: type.role === 'decision' ? graph.restingOn(task.id).map(withType) : [],
  };
}

function typeLine(type: ResolvedDocType): string {
  const name = type.glyph ? `${type.glyph} ${type.name}` : type.name;
  if (type.like) return `${name} ${chalk.gray(`(like ${type.like})`)}`;
  if (!type.builtIn) return `${name} ${chalk.gray('(behaves as a task)')}`;
  return name;
}

function renderDecisionHeader(task: Task, logger: Logger): void {
  const record = task as Task & Record<string, unknown>;
  const status = decisionStatus(record);
  const color = status === 'current' ? chalk.green : chalk.yellow;
  logger.log(`${chalk.bold('Status:')} ${color(status)}`);
  const fields: Array<[string, unknown]> = [
    ['Claim key', record.claimKey],
    ['Kind', record.kind],
    ['Stance', record.stance && record.subject ? `${record.stance} ${record.subject}` : record.stance],
    ['Subject', record.stance ? undefined : record.subject],
    ['Holds while', record.holdsWhile],
    ['Recheck', record.recheck],
    ['Valid until', record.validUntil],
  ];
  for (const [label, value] of fields) {
    if (typeof value === 'string' && value.trim()) {
      logger.log(`${chalk.bold(`${label}:`)} ${chalk.white(value)}`);
    }
  }
  const supersedes = idList(record.supersedes);
  if (supersedes.length > 0) logger.log(`${chalk.bold('Supersedes:')} ${chalk.white(supersedes.join(', '))}`);
  if (typeof record.supersededBy === 'string' && record.supersededBy.trim()) {
    logger.log(`${chalk.bold('Superseded by:')} ${chalk.white(record.supersededBy)}`);
  }
}

function describeDecisionLink(link: DecisionLink): string {
  if (link.external) return chalk.gray('(on a related board)');
  if (!link.found) return chalk.yellow('not on this board');
  if (!link.isDecision) return `${link.task!.title} ${chalk.yellow('(not a decision)')}`;
  const by = link.supersededBy ? ` by ${link.supersededBy}` : '';
  const state = link.status === 'current' ? chalk.green(link.status) : chalk.yellow(`${link.status}${by}`);
  return `${link.task!.title} ${chalk.gray('(')}${state}${chalk.gray(')')}`;
}

function formatPriority(priority: string): string {
  const p = priority.toLowerCase();
  const color =
    p === 'critical' ? chalk.redBright.bold :
      p === 'high' ? chalk.red :
        p === 'medium' ? chalk.yellow :
          chalk.blue;
  return color(priority);
}
