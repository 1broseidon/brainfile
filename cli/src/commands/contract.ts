import { pickupContract, deliverContract, validateContract } from '../lib/contractRunner';
import { defaultLogger, type Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findTaskById,
  setTaskContract,
  writeTaskFile,
  readTasksDir,
  taskFileName,
  type Board,
  type Task,
} from '@brainfile/core';
import { missingRequired, operationFailed, validationError } from '../utils/cli-error';
import { buildContract } from '../utils/contractSpec';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { isV2, getV2Dirs, findV2Task } from '../utils/v2-detect';
import { lintValidationCommands } from '../validation/command-lint';

export const CONTRACT_COMMAND_HELP = `
Workflow (PM → Agent → PM):
  1) PM creates a task with a contract:
     brainfile add -c todo -t "Feature" --assignee codex --with-contract --deliverable "file:src/feature.ts:Impl"

  2) Agent picks it up (status → in_progress):
     brainfile contract pickup -t task-123

  3) Agent delivers (status → delivered):
     brainfile contract deliver -t task-123

  4) PM validates (status → done | failed):
     brainfile contract validate -t task-123

Contract metrics are tracked on the task file under contract.metrics.

Find available contracts:
  brainfile list --contract ready
`.trimEnd();

export const CONTRACT_PICKUP_HELP = `
Examples:
  brainfile contract pickup -t task-123
  brainfile contract pickup -t task-123 -f .brainfile/brainfile.md
`.trimEnd();

export const CONTRACT_DELIVER_HELP = `
Examples:
  brainfile contract deliver -t task-123
`.trimEnd();

export const CONTRACT_VALIDATE_HELP = `
Examples:
  brainfile contract validate -t task-123
`.trimEnd();

export const CONTRACT_ATTACH_HELP = `
Examples:
  brainfile contract attach -t task-123 \\
    --deliverable "file:src/feature.ts:Implementation" \\
    --validation "npm test" \\
    --constraint "Make minimal changes"
`.trimEnd();

export const CONTRACT_ACTIVATE_HELP = `
Examples:
  # Activate a single contract (draft → ready)
  brainfile contract activate -t task-123

  # Activate all draft contracts whose parent is epic-1
  brainfile contract activate --parent epic-1
`.trimEnd();

export const CONTRACT_GRAPH_HELP = `
Examples:
  brainfile contract graph \\
    --task research-1 --deliverable "file:docs/findings.md" \\
    --task impl-1 --deliverable "file:src/bridge.ts" --depends-on research-1 \\
    --task test-1 --deliverable "test:src/tests/bridge.test.ts" --depends-on impl-1 \\
    --ready

  brainfile contract graph --show
`.trimEnd();

interface ContractOptions {
  file: string;
  task: string;
}

export interface ContractAttachOptions {
  file: string;
  task: string;
  deliverable?: string | string[];
  validation?: string | string[];
  constraint?: string | string[];
}

export interface ContractPickupCommandResult {
  success: true;
  markdown: string;
}

export interface ContractDeliverCommandResult {
  success: true;
}

export interface ContractValidateCommandResult {
  success: boolean;
}

export interface ContractAttachCommandResult {
  success: true;
}

export interface ContractActivateOptions {
  file: string;
  /** Single task ID to activate */
  task?: string;
  /** Activate all draft contracts whose parentId matches this value */
  parent?: string;
}

export interface ContractActivateCommandResult {
  success: true;
  activated: string[];
}

export interface ContractGraphTaskOptions {
  task: string;
  deliverable?: string | string[];
  validation?: string | string[];
  constraint?: string | string[];
  dependsOn?: string[];
}

export interface ContractGraphOptions {
  file: string;
  ready?: boolean;
  show?: boolean;
  tasks?: ContractGraphTaskOptions[];
}

export interface ContractGraphCommandResult {
  success: true;
  attached: string[];
  order: string[];
  graph: string;
}

interface DependencyGraphNode {
  id: string;
  dependsOn?: readonly string[];
}

class MissingDependencyError extends Error {
  readonly taskId: string;
  readonly dependencyId: string;

  constructor(taskId: string, dependencyId: string) {
    super(`Task ${taskId} depends on missing task ${dependencyId}`);
    this.name = 'MissingDependencyError';
    this.taskId = taskId;
    this.dependencyId = dependencyId;
  }
}

class DependencyCycleError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'DependencyCycleError';
    this.cycle = cycle;
  }
}

function isUnsafeTaskId(taskId: string): boolean {
  const trimmed = taskId.trim();
  if (!trimmed || trimmed !== taskId) {
    return true;
  }

  if (taskId === '.' || taskId === '..') {
    return true;
  }

  return /[\\/]/.test(taskId);
}

function normalizeDependencyIds(dependsOn?: string[]): string[] | undefined {
  if (!Array.isArray(dependsOn)) {
    return undefined;
  }

  const normalized = [...new Set(dependsOn.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function taskDependsOn(task: Task | undefined): string[] | undefined {
  const rawDependsOn = (task as { dependsOn?: unknown } | undefined)?.dependsOn;
  if (!Array.isArray(rawDependsOn)) {
    return undefined;
  }

  return rawDependsOn.filter((value): value is string => typeof value === 'string');
}

function topologicalSort(nodes: readonly DependencyGraphNode[]): string[] {
  const dependenciesById = new Map<string, string[]>();

  for (const node of nodes) {
    if (dependenciesById.has(node.id)) {
      throw new Error(`Duplicate graph node: ${node.id}`);
    }

    dependenciesById.set(node.id, normalizeDependencyIds(node.dependsOn ? [...node.dependsOn] : undefined) ?? []);
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const order: string[] = [];

  const visit = (taskId: string): void => {
    const currentState = state.get(taskId);
    if (currentState === 'done') {
      return;
    }

    if (currentState === 'visiting') {
      const cycleStart = stack.indexOf(taskId);
      const cycle = cycleStart >= 0
        ? [...stack.slice(cycleStart), taskId]
        : [taskId, taskId];
      throw new DependencyCycleError(cycle);
    }

    state.set(taskId, 'visiting');
    stack.push(taskId);

    for (const dependencyId of dependenciesById.get(taskId) ?? []) {
      if (!dependenciesById.has(dependencyId)) {
        throw new MissingDependencyError(taskId, dependencyId);
      }
      visit(dependencyId);
    }

    stack.pop();
    state.set(taskId, 'done');
    order.push(taskId);
  };

  for (const taskId of dependenciesById.keys()) {
    visit(taskId);
  }

  return order;
}

function boardTasks(board: Board): Task[] {
  return board.columns.flatMap((column) => column.tasks);
}

function validateTaskDependencyGraph(tasks: Task[]): string[] {
  try {
    return topologicalSort(tasks.map((task) => ({
      id: task.id,
      dependsOn: taskDependsOn(task),
    })));
  } catch (error) {
    if (error instanceof DependencyCycleError || error instanceof MissingDependencyError) {
      throw validationError(error.message);
    }
    throw error;
  }
}

function renderTaskDependencyGraph(tasks: Task[]): string {
  if (tasks.length === 0) {
    return '(no active tasks)';
  }

  const order = validateTaskDependencyGraph(tasks);
  const taskById = new Map<string, Task>(tasks.map((task) => [task.id, task]));
  return order
    .map((taskId) => {
      const dependsOn = normalizeDependencyIds(taskDependsOn(taskById.get(taskId)));
      return dependsOn && dependsOn.length > 0
        ? `${dependsOn.join(', ')} -> ${taskId}`
        : taskId;
    })
    .join('\n');
}

function updateBoardTask(board: Board, taskId: string, updater: (task: Task) => Task): Board {
  let found = false;

  const columns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      found = true;
      return updater(task);
    }),
  }));

  if (!found) {
    throw operationFailed(`Task not found: ${taskId}`);
  }

  return { ...board, columns };
}

function applyGraphTaskUpdate(
  task: Task,
  spec: ContractGraphTaskOptions,
  ready: boolean,
  now: string,
): Task {
  let contract;
  try {
    contract = buildContract({
      deliverableSpecs: spec.deliverable,
      validationCommands: spec.validation,
      constraints: spec.constraint,
      status: ready ? 'ready' : 'draft',
    });
  } catch (error) {
    throw validationError((error as Error).message);
  }

  const nextTask: Task = {
    ...task,
    contract,
    updatedAt: now,
  };

  if (spec.dependsOn !== undefined) {
    const normalized = normalizeDependencyIds(spec.dependsOn);
    if (normalized) {
      nextTask.dependsOn = normalized;
    } else {
      delete nextTask.dependsOn;
    }
  }

  return nextTask;
}

function ensureUniqueGraphTasks(specs: ContractGraphTaskOptions[]): void {
  const seen = new Set<string>();

  for (const spec of specs) {
    if (seen.has(spec.task)) {
      throw validationError(`Duplicate task in graph input: ${spec.task}`);
    }
    seen.add(spec.task);
  }
}

function loadActiveTasks(filePath: string): Task[] {
  if (isV2(filePath)) {
    const dirs = getV2Dirs(filePath);
    return readTasksDir(dirs.boardDir).map((doc) => doc.task);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  return boardTasks(parsed.board);
}

export function parseContractGraphArgs(args: readonly string[]): ContractGraphOptions {
  const options: ContractGraphOptions = {
    file: 'brainfile.md',
    tasks: [],
  };

  let currentTask: ContractGraphTaskOptions | undefined;

  const readValue = (index: number, flag: string): string => {
    const value = args[index + 1];
    if (value === undefined) {
      throw validationError(`Missing value for ${flag}`);
    }
    return value;
  };

  const pushValue = (
    spec: ContractGraphTaskOptions | undefined,
    key: 'deliverable' | 'validation' | 'constraint',
    value: string,
    flag: string,
  ): void => {
    if (!spec) {
      throw validationError(`${flag} must follow a --task declaration`);
    }

    const existing = spec[key];
    if (!existing) {
      spec[key] = [value];
      return;
    }

    spec[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    switch (token) {
      case '-f':
      case '--file':
        options.file = readValue(index, token);
        index += 1;
        break;
      case '--ready':
        options.ready = true;
        break;
      case '--show':
        options.show = true;
        break;
      case '-t':
      case '--task': {
        const task = readValue(index, token);
        currentTask = { task };
        options.tasks!.push(currentTask);
        index += 1;
        break;
      }
      case '--deliverable':
        pushValue(currentTask, 'deliverable', readValue(index, token), token);
        index += 1;
        break;
      case '--validation':
        pushValue(currentTask, 'validation', readValue(index, token), token);
        index += 1;
        break;
      case '--constraint':
        pushValue(currentTask, 'constraint', readValue(index, token), token);
        index += 1;
        break;
      case '--depends-on':
        if (!currentTask) {
          throw validationError('--depends-on must follow a --task declaration');
        }
        currentTask.dependsOn = [...(currentTask.dependsOn ?? []), readValue(index, token)];
        index += 1;
        break;
      default:
        throw validationError(`Unknown contract graph flag: ${token}`);
    }
  }

  if (options.show && options.tasks!.length > 0) {
    throw validationError('--show cannot be combined with task graph mutations');
  }

  if (!options.show && options.tasks!.length === 0) {
    throw missingRequired('--task', 'brainfile contract graph --task <task-id> [graph options]');
  }

  return options;
}

export function contractGraphCommand(options: ContractGraphOptions, logger: Logger = defaultLogger): ContractGraphCommandResult {
  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw operationFailed(`File not found: ${filePath}`);
  }

  if (options.show) {
    const activeTasks = loadActiveTasks(filePath);
    const graph = renderTaskDependencyGraph(activeTasks);
    logger.log(graph);
    return { success: true, attached: [], order: validateTaskDependencyGraph(activeTasks), graph };
  }

  const specs = options.tasks ?? [];
  ensureUniqueGraphTasks(specs);

  const now = new Date().toISOString();

  if (isV2(filePath)) {
    const dirs = getV2Dirs(filePath);
    const docs = readTasksDir(dirs.boardDir);
    const docById = new Map(docs.map((doc) => [doc.task.id, doc]));

    for (const spec of specs) {
      if (isUnsafeTaskId(spec.task)) {
        throw operationFailed(`Invalid task ID: ${spec.task}`);
      }
      if (!docById.has(spec.task)) {
        throw operationFailed(`Task not found: ${spec.task}`);
      }
    }

    const nextTasks = new Map(docs.map((doc) => [doc.task.id, { ...doc.task }]));
    for (const spec of specs) {
      nextTasks.set(
        spec.task,
        applyGraphTaskUpdate(nextTasks.get(spec.task)!, spec, Boolean(options.ready), now),
      );
    }

    const order = validateTaskDependencyGraph([...nextTasks.values()]);
    const graph = renderTaskDependencyGraph([...nextTasks.values()]);

    for (const taskId of order) {
      if (!specs.some((spec) => spec.task === taskId)) {
        continue;
      }

      const doc = docById.get(taskId)!;
      writeTaskFile(doc.filePath!, nextTasks.get(taskId)!, doc.body);
    }

    logger.log(`Contract graph attached (${options.ready ? 'ready' : 'draft'}): ${specs.map((spec) => spec.task).join(', ')}`);
    return {
      success: true,
      attached: specs.map((spec) => spec.task),
      order,
      graph,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  let board = parsed.board;
  for (const spec of specs) {
    if (!findTaskById(board, spec.task)) {
      throw operationFailed(`Task not found: ${spec.task}`);
    }

    board = updateBoardTask(board, spec.task, (task) =>
      applyGraphTaskUpdate(task, spec, Boolean(options.ready), now));
  }

  const order = validateTaskDependencyGraph(boardTasks(board));
  const graph = renderTaskDependencyGraph(boardTasks(board));

  fs.writeFileSync(filePath, Brainfile.serialize(board), 'utf-8');
  logger.log(`Contract graph attached (${options.ready ? 'ready' : 'draft'}): ${specs.map((spec) => spec.task).join(', ')}`);
  return {
    success: true,
    attached: specs.map((spec) => spec.task),
    order,
    graph,
  };
}

export function contractPickupCommand(options: ContractOptions, logger: Logger = defaultLogger): ContractPickupCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract pickup --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  const result = pickupContract({ filePath, taskId: options.task });
  if ('error' in result) {
    throw operationFailed(result.error);
  }

  logger.log(result.markdown);
  return { success: true, markdown: result.markdown };
}

export function contractDeliverCommand(options: ContractOptions, logger: Logger = defaultLogger): ContractDeliverCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract deliver --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  const result = deliverContract({ filePath, taskId: options.task });
  if ('error' in result) {
    throw operationFailed(result.error);
  }

  logger.log(`Contract delivered: ${options.task}`);
  return { success: true };
}

export function contractValidateCommand(options: ContractOptions, logger: Logger = defaultLogger): ContractValidateCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract validate --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  const result = validateContract({ filePath, taskId: options.task });
  if ('error' in result) {
    throw operationFailed(result.error);
  }

  const deliverablesOk = result.deliverableChecks.every((c) => c.ok);
  const commandsOk = result.commandResults.every((c) => c.exitCode === 0);
  const ok = result.ok;

  // Show warnings first (before success/fail status)
  if (result.warnings.length > 0) {
    logger.log('');
    logger.log('⚠️  Warnings:');
    for (const warning of result.warnings) {
      logger.log(`  Command: ${warning.command}`);
      logger.log(`  ${warning.message}`);
      logger.log('');
    }
  }

  logger.log(`Contract validation ${ok ? 'passed' : 'failed'}: ${options.task}`);

  if (!deliverablesOk) {
    logger.log('');
    logger.log('Deliverables:');
    for (const check of result.deliverableChecks) {
      if (check.deliverable.type !== 'file') continue;
      const status = check.ok ? 'OK' : 'MISSING';
      logger.log(`- [${status}] ${check.deliverable.path}${check.resolvedPath ? ` (${check.resolvedPath})` : ''}`);
    }
  }

  if (!commandsOk && result.commandResults.length > 0) {
    logger.log('');
    logger.log('Validation commands:');
    for (const cmd of result.commandResults) {
      logger.log(`- [${cmd.exitCode === 0 ? 'OK' : `FAIL(${cmd.exitCode})`}] ${cmd.command}`);
    }
  }

  return { success: ok };
}

/**
 * Attach a new contract to an existing task (default status=draft).
 * This is for programmatic contract creation (no manual YAML editing).
 * Pass ready:true via options to make the contract immediately dispatchable.
 */
export function contractAttachCommand(options: ContractAttachOptions & { ready?: boolean }, logger: Logger = defaultLogger): ContractAttachCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract attach --task <task-id> [--file <path>] [--deliverable ...]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw operationFailed(`File not found: ${filePath}`);
  }

  const validationCommands = Array.isArray(options.validation)
    ? options.validation
    : options.validation
      ? [options.validation]
      : [];
  for (const warning of lintValidationCommands(validationCommands, filePath)) {
    logger.warn(`Warning: ${warning.message}`);
  }

  let contract;
  try {
    contract = buildContract({
      deliverableSpecs: options.deliverable,
      validationCommands: options.validation,
      constraints: options.constraint,
      status: (options as any).ready ? 'ready' : 'draft',
    });
  } catch (e) {
    throw validationError((e as Error).message);
  }

  if (isV2(filePath)) {
    if (isUnsafeTaskId(options.task)) {
      throw operationFailed(`Invalid task ID: ${options.task}`);
    }

    const dirs = getV2Dirs(filePath);
    const found = findV2Task(dirs, options.task, false);
    if (!found || found.isLog) {
      throw operationFailed(`Task not found: ${options.task}`);
    }

    found.doc.task.contract = contract;
    writeTaskFile(found.filePath, found.doc.task, found.doc.body);
    logger.log(`Contract attached: ${options.task}`);
    return { success: true };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  const taskInfo = findTaskById(parsed.board, options.task);
  if (!taskInfo) {
    throw operationFailed(`Task not found: ${options.task}`);
  }

  const result = setTaskContract(parsed.board, options.task, contract);
  if (!result.success || !result.board) {
    throw operationFailed(result.error || 'Failed to attach contract');
  }

  fs.writeFileSync(filePath, Brainfile.serialize(result.board), 'utf-8');
  logger.log(`Contract attached: ${options.task}`);
  return { success: true };
}

/**
 * Activate one or more draft contracts (draft → ready).
 *
 * - Single task: `--task <id>`
 * - Bulk by parent: `--parent <epic-id>` (activates all draft children)
 */
export function contractActivateCommand(options: ContractActivateOptions, logger: Logger = defaultLogger): ContractActivateCommandResult {
  if (!options.task && !options.parent) {
    throw missingRequired('--task or --parent', 'brainfile contract activate -t <task-id> | --parent <epic-id>');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw operationFailed(`File not found: ${filePath}`);
  }

  const activated: string[] = [];

  // ── V2 per-task file architecture ──────────────────────────────────────────
  if (isV2(filePath)) {
    const dirs = getV2Dirs(filePath);

    if (options.task) {
      // Single task activation
      if (isUnsafeTaskId(options.task)) {
        throw operationFailed(`Invalid task ID: ${options.task}`);
      }
      const found = findV2Task(dirs, options.task, false);
      if (!found || found.isLog) {
        throw operationFailed(`Task not found: ${options.task}`);
      }
      if (!found.doc.task.contract) {
        throw operationFailed(`Task ${options.task} has no contract`);
      }
      if (found.doc.task.contract.status !== 'draft') {
        throw operationFailed(`Contract is not in draft status (current: ${found.doc.task.contract.status})`);
      }
      const readyAt = new Date().toISOString();
      found.doc.task.contract = {
        ...found.doc.task.contract,
        status: 'ready',
        metrics: ({
          ...(found.doc.task.contract.metrics ?? {}),
          readyAt,
        } as NonNullable<NonNullable<Task['contract']>['metrics']>),
      };
      found.doc.task.updatedAt = readyAt;
      writeTaskFile(found.filePath, found.doc.task, found.doc.body);
      activated.push(options.task);
      logger.log(`Contract activated: ${options.task}`);
    } else {
      // Bulk activation by parentId
      const parentId = options.parent!;
      const allTasks = readTasksDir(dirs.boardDir);
      for (const doc of allTasks) {
        const task = doc.task as any;
        if (task.parentId !== parentId) continue;
        if (!task.contract || task.contract.status !== 'draft') continue;
        const readyAt = new Date().toISOString();
        task.contract = {
          ...task.contract,
          status: 'ready',
          metrics: ({
            ...(task.contract.metrics ?? {}),
            readyAt,
          } as NonNullable<NonNullable<Task['contract']>['metrics']>),
        };
        task.updatedAt = readyAt;
        const taskPath = path.join(dirs.boardDir, taskFileName(task.id));
        writeTaskFile(taskPath, task, doc.body);
        activated.push(task.id);
        logger.log(`Contract activated: ${task.id}`);
      }
      if (activated.length === 0) {
        logger.log(`No draft contracts found with parent: ${parentId}`);
      }
    }

    return { success: true, activated };
  }

  // ── V1 board ──────────────────────────────────────────────────────────────
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  let board = parsed.board;

  if (options.task) {
    // Single task
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      throw operationFailed(`Task not found: ${options.task}`);
    }
    if (!taskInfo.task.contract) {
      throw operationFailed(`Task ${options.task} has no contract`);
    }
    if (taskInfo.task.contract.status !== 'draft') {
      throw operationFailed(`Contract is not in draft status (current: ${taskInfo.task.contract.status})`);
    }

    // Mutate via setTaskContract (re-attach with status=ready)
    const readyAt = new Date().toISOString();
    const updatedContract = {
      ...taskInfo.task.contract,
      status: 'ready' as const,
      metrics: ({
        ...(taskInfo.task.contract.metrics ?? {}),
        readyAt,
      } as NonNullable<NonNullable<Task['contract']>['metrics']>),
    };
    const result = setTaskContract(board, options.task, updatedContract);
    if (!result.success || !result.board) {
      throw operationFailed(result.error || 'Failed to activate contract');
    }
    board = result.board;
    activated.push(options.task);
    logger.log(`Contract activated: ${options.task}`);
  } else {
    // Bulk by parentId (V1 boards store parentId on task)
    const parentId = options.parent!;
    for (const col of board.columns) {
      for (const task of col.tasks) {
        const t = task as any;
        if (t.parentId !== parentId) continue;
        if (!task.contract || task.contract.status !== 'draft') continue;
        const readyAt = new Date().toISOString();
        const updatedContract = {
          ...task.contract,
          status: 'ready' as const,
          metrics: ({
            ...(task.contract.metrics ?? {}),
            readyAt,
          } as NonNullable<NonNullable<Task['contract']>['metrics']>),
        };
        const result = setTaskContract(board, task.id, updatedContract);
        if (result.success && result.board) {
          board = result.board;
          activated.push(task.id);
          logger.log(`Contract activated: ${task.id}`);
        }
      }
    }
    if (activated.length === 0) {
      logger.log(`No draft contracts found with parent: ${parentId}`);
    }
  }

  fs.writeFileSync(filePath, Brainfile.serialize(board), 'utf-8');
  return { success: true, activated };
}
