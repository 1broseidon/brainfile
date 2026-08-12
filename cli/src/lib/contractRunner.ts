import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  resolveBrainfilePath,
  pickupTaskContract,
  deliverTaskContract,
  completeTaskContract,
  failTaskContract,
  readTaskFile,
  type Board,
  type Contract,
  type Deliverable,
} from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  findV2Task,
  extractDescription,
} from '../utils/v2-detect';
import { V1_UNSUPPORTED_MESSAGE } from '../utils/v2-only';

export type ContractAction = 'pickup' | 'deliver' | 'validate';

export interface ContractRunContext {
  /** Path to brainfile.md */
  filePath: string;
  /** Task ID with a contract */
  taskId: string;
}

export interface ValidationCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ContractPickupResult {
  action: 'pickup';
  board: Board;
  markdown: string;
}

export interface ContractDeliverResult {
  action: 'deliver';
  board: Board;
}

export interface ValidationWarning {
  command: string;
  message: string;
}

export interface ContractValidateResult {
  action: 'validate';
  board: Board;
  deliverableChecks: Array<{
    deliverable: Deliverable;
    ok: boolean;
    resolvedPath?: string;
    error?: string;
  }>;
  commandResults: ValidationCommandResult[];
  warnings: ValidationWarning[];
  ok: boolean;
}

/**
 * Detects if a command changes directories, which can cause brainfile resolution issues.
 * Returns a warning message if detected, undefined otherwise.
 */
function detectDirectoryChangeWarning(command: string): string | undefined {
  // Patterns that change directory
  const patterns = [
    /\bcd\s+[^\s;|&]+/,           // cd path
    /\bpushd\s+/,                  // pushd
    /\bchdir\s+/,                  // chdir (less common)
  ];

  for (const pattern of patterns) {
    if (pattern.test(command)) {
      return `Command changes directory which may cause brainfile CLI to find a different brainfile. ` +
        `If this command invokes brainfile CLI, use -f to specify the brainfile path explicitly, ` +
        `or run the command from project root without cd.`;
    }
  }
  return undefined;
}

export type ContractRunnerResult =
  | ContractPickupResult
  | ContractDeliverResult
  | ContractValidateResult;

function requireV2Runner(resolvedFilePath: string): { error: string } | null {
  if (!fs.existsSync(resolvedFilePath)) {
    return { error: `File not found: ${resolvedFilePath}` };
  }
  if (!isV2(resolvedFilePath)) {
    return { error: V1_UNSUPPORTED_MESSAGE };
  }
  return null;
}

function normalizeNonEmpty(input: string, errorMessage: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: errorMessage };
  return { ok: true, value: trimmed };
}

export function formatContractContextMarkdown(params: {
  taskId: string;
  taskTitle: string;
  description?: string;
  columnTitle?: string;
  contract: Contract;
  relatedFiles?: string[];
}): string {
  const { taskId, taskTitle, description, columnTitle, contract, relatedFiles } = params;
  const deliverables = contract.deliverables ?? [];
  const constraints = contract.constraints ?? [];
  const ctx = contract.context;

  const lines: string[] = [];
  lines.push(`# Contract pickup: ${taskId}`);
  lines.push('');
  lines.push(`## Task`);
  lines.push(`- **ID**: ${taskId}`);
  lines.push(`- **Title**: ${taskTitle}`);
  if (columnTitle) lines.push(`- **Column**: ${columnTitle}`);
  lines.push(`- **Contract status**: ${contract.status}`);
  lines.push('');

  if (description && description.trim()) {
    lines.push('## Description');
    lines.push(description.trim());
    lines.push('');
  }

  if (ctx?.background && ctx.background.trim()) {
    lines.push('## Background');
    lines.push(ctx.background.trim());
    lines.push('');
  }

  lines.push('## Deliverables');
  if (deliverables.length === 0) {
    lines.push('- (none)');
  } else {
    for (const d of deliverables) {
      const desc = d.description ? ` — ${d.description}` : '';
      lines.push(`- \`${d.type}\` \`${d.path}\`${desc}`);
    }
  }
  lines.push('');

  lines.push('## Constraints');
  if (constraints.length === 0) {
    lines.push('- (none)');
  } else {
    for (const c of constraints) lines.push(`- ${c}`);
  }
  lines.push('');

  const rf = [
    ...(relatedFiles ?? []),
    ...(ctx?.relevantFiles ?? []),
  ];
  lines.push('## Relevant files');
  if (rf.length === 0) {
    lines.push('- (none)');
  } else {
    for (const f of rf) lines.push(`- \`${f}\``);
  }
  lines.push('');

  if (ctx?.outOfScope && ctx.outOfScope.length > 0) {
    lines.push('## Out of scope');
    for (const item of ctx.outOfScope) lines.push(`- ${item}`);
    lines.push('');
  }

  const validationCommands = contract.validation?.commands ?? [];
  lines.push('## Validation');
  if (validationCommands.length === 0) {
    lines.push('- (none)');
  } else {
    for (const cmd of validationCommands) lines.push(`- \`${cmd}\``);
  }
  lines.push('');

  return lines.join('\n');
}

export function pickupContract(ctx: ContractRunContext): ContractPickupResult | { error: string } {
  const resolvedFilePath = resolveBrainfilePath({ filePath: ctx.filePath, startDir: process.cwd() });

  const guard = requireV2Runner(resolvedFilePath);
  if (guard) return guard;

  return pickupContractV2(ctx, resolvedFilePath);
}

export function deliverContract(ctx: ContractRunContext): ContractDeliverResult | { error: string } {
  const resolvedFilePath = resolveBrainfilePath({ filePath: ctx.filePath, startDir: process.cwd() });

  const guard = requireV2Runner(resolvedFilePath);
  if (guard) return guard;

  return deliverContractV2(ctx, resolvedFilePath);
}

export function validateContract(ctx: ContractRunContext): ContractValidateResult | { error: string } {
  const resolvedFilePath = resolveBrainfilePath({ filePath: ctx.filePath, startDir: process.cwd() });

  const guard = requireV2Runner(resolvedFilePath);
  if (guard) return guard;

  return validateContractV2(ctx, resolvedFilePath);
}

// ============================================================================
// V2 Contract Operations (per-task files)
// ============================================================================

function pickupContractV2(ctx: ContractRunContext, resolvedFilePath: string): ContractPickupResult | { error: string } {
  const dirs = getV2Dirs(resolvedFilePath);
  const found = findV2Task(dirs, ctx.taskId, false);
  if (!found) return { error: `Task not found: ${ctx.taskId}` };

  const { filePath: taskPath } = found;
  const taskDoc = readTaskFile(taskPath);
  if (!taskDoc) return { error: `Failed to read task file: ${taskPath}` };

  if (!taskDoc.task.contract) return { error: `Task ${ctx.taskId} has no contract` };

  const op = pickupTaskContract(taskPath);
  if (!op.success) return { error: op.error || 'Failed to update contract status' };

  const updated = readTaskFile(taskPath);
  if (!updated?.task.contract) return { error: `Task ${ctx.taskId} has no contract` };

  const description = updated.task.description || extractDescription(updated.body);
  const markdown = formatContractContextMarkdown({
    taskId: updated.task.id,
    taskTitle: updated.task.title,
    description,
    columnTitle: updated.task.column,
    contract: updated.task.contract,
    relatedFiles: updated.task.relatedFiles,
  });

  const board: Board = { title: '', columns: [] };

  return { action: 'pickup', board, markdown };
}

function deliverContractV2(ctx: ContractRunContext, resolvedFilePath: string): ContractDeliverResult | { error: string } {
  const dirs = getV2Dirs(resolvedFilePath);
  const found = findV2Task(dirs, ctx.taskId, false);
  if (!found) return { error: `Task not found: ${ctx.taskId}` };

  const { filePath: taskPath } = found;
  const taskDoc = readTaskFile(taskPath);
  if (!taskDoc) return { error: `Failed to read task file: ${taskPath}` };

  if (!taskDoc.task.contract) return { error: `Task ${ctx.taskId} has no contract` };

  const op = deliverTaskContract(taskPath);
  if (!op.success) return { error: op.error || 'Failed to update contract status' };

  const board: Board = { title: '', columns: [] };
  return { action: 'deliver', board };
}

function validateContractV2(ctx: ContractRunContext, resolvedFilePath: string): ContractValidateResult | { error: string } {
  const dirs = getV2Dirs(resolvedFilePath);
  const found = findV2Task(dirs, ctx.taskId, false);
  if (!found) return { error: `Task not found: ${ctx.taskId}` };

  const { filePath: taskPath } = found;
  const taskDoc = readTaskFile(taskPath);
  if (!taskDoc) return { error: `Failed to read task file: ${taskPath}` };

  if (!taskDoc.task.contract) return { error: `Task ${ctx.taskId} has no contract` };

  const contract = taskDoc.task.contract;
  const brainfileAbs = path.resolve(resolvedFilePath);
  const brainfileDir = path.dirname(brainfileAbs);
  const baseDir = path.basename(brainfileDir) === '.brainfile'
    ? path.dirname(brainfileDir)
    : brainfileDir;

  const deliverables = contract.deliverables ?? [];
  const deliverableChecks: ContractValidateResult['deliverableChecks'] = [];

  for (const d of deliverables) {
    if (d.type !== 'file') {
      deliverableChecks.push({ deliverable: d, ok: true });
      continue;
    }
    const normalized = normalizeNonEmpty(d.path, 'Deliverable path is required');
    if (!normalized.ok) {
      deliverableChecks.push({ deliverable: d, ok: false, error: normalized.error });
      continue;
    }
    const resolved = path.isAbsolute(normalized.value)
      ? normalized.value
      : path.join(baseDir, normalized.value);
    if (!fs.existsSync(resolved)) {
      deliverableChecks.push({ deliverable: d, ok: false, resolvedPath: resolved, error: 'File not found' });
    } else {
      deliverableChecks.push({ deliverable: d, ok: true, resolvedPath: resolved });
    }
  }

  const deliverablesOk = deliverableChecks.every(c => c.ok);
  const commandResults: ValidationCommandResult[] = [];
  const warnings: ValidationWarning[] = [];
  let ok = deliverablesOk;

  if (ok) {
    const commands = contract.validation?.commands ?? [];
    for (const raw of commands) {
      const normalized = normalizeNonEmpty(raw, 'Validation command is required');
      if (!normalized.ok) {
        commandResults.push({ command: raw, exitCode: 1, stdout: '', stderr: normalized.error });
        ok = false;
        break;
      }

      const dirWarning = detectDirectoryChangeWarning(normalized.value);
      if (dirWarning) {
        warnings.push({ command: normalized.value, message: dirWarning });
      }

      const res = spawnSync(normalized.value, {
        shell: true,
        cwd: baseDir,
        encoding: 'utf-8',
      });

      const exitCode = typeof res.status === 'number' ? res.status : 1;
      commandResults.push({
        command: normalized.value,
        exitCode,
        stdout: res.stdout ?? '',
        stderr: res.stderr ?? '',
      });

      if (exitCode !== 0) {
        ok = false;
        break;
      }
    }
  }

  const failureFeedback = !deliverablesOk
    ? deliverableChecks
        .filter((check) => !check.ok)
        .map((check) => {
          const location = check.resolvedPath ? ` (${check.resolvedPath})` : '';
          return `${check.deliverable.path}${location}: ${check.error || 'Validation failed'}`;
        })
        .join('\n')
    : commandResults.at(-1)?.stderr || commandResults.at(-1)?.stdout || 'Validation failed';

  const op = ok
    ? completeTaskContract(taskPath, dirs.logsDir)
    : failTaskContract(taskPath, failureFeedback);
  if (!op.success) return { error: op.error || 'Failed to update contract status' };

  const board: Board = { title: '', columns: [] };

  return {
    action: 'validate',
    board,
    deliverableChecks,
    commandResults,
    warnings,
    ok,
  };
}
