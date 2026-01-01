import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  Brainfile,
  resolveBrainfilePath,
  recordContractPickup,
  findTaskById,
  setTaskContractStatus,
  type Board,
  type Contract,
  type Deliverable,
} from '@brainfile/core';

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

function readBoardFromFile(filePath: string): { board: Board; content: string } | { error: string } {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return { error: `File not found: ${resolvedPath}` };
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    return { error: parsed.error || 'Failed to parse brainfile' };
  }

  return { board: parsed.board, content };
}

function writeBoardToFile(filePath: string, board: Board): void {
  const resolvedPath = path.resolve(filePath);
  fs.writeFileSync(resolvedPath, Brainfile.serialize(board), 'utf-8');
}

function normalizeNonEmpty(input: string, errorMessage: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: errorMessage };
  return { ok: true, value: trimmed };
}

function getContractOrError(taskId: string, contract: Contract | undefined): { ok: true; contract: Contract } | { ok: false; error: string } {
  if (!contract) return { ok: false, error: `Task ${taskId} has no contract` };
  return { ok: true, contract };
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
  const read = readBoardFromFile(resolvedFilePath);
  if ('error' in read) return { error: read.error };

  const { board } = read;
  const taskInfo = findTaskById(board, ctx.taskId);
  if (!taskInfo) return { error: `Task not found: ${ctx.taskId}` };

  const contract = getContractOrError(ctx.taskId, taskInfo.task.contract);
  if (!contract.ok) return { error: contract.error };

  const result = setTaskContractStatus(board, ctx.taskId, 'in_progress');
  if (!result.success || !result.board) return { error: result.error || 'Failed to update contract status' };

  writeBoardToFile(resolvedFilePath, result.board);

  const updatedTaskInfo = findTaskById(result.board, ctx.taskId)!;
  const updatedContract = updatedTaskInfo.task.contract!;

  try {
    const agent =
      process.env.BRAINFILE_AGENT ||
      process.env.CURSOR_AGENT ||
      process.env.GITHUB_ACTOR ||
      process.env.USER ||
      'unknown';
    recordContractPickup({ brainfilePath: resolvedFilePath, taskId: ctx.taskId, agent });
  } catch {
    // Never fail contract pickup due to state tracking.
  }

  const markdown = formatContractContextMarkdown({
    taskId: updatedTaskInfo.task.id,
    taskTitle: updatedTaskInfo.task.title,
    description: updatedTaskInfo.task.description,
    columnTitle: updatedTaskInfo.column.title,
    contract: updatedContract,
    relatedFiles: updatedTaskInfo.task.relatedFiles,
  });

  return { action: 'pickup', board: result.board, markdown };
}

export function deliverContract(ctx: ContractRunContext): ContractDeliverResult | { error: string } {
  const resolvedFilePath = resolveBrainfilePath({ filePath: ctx.filePath, startDir: process.cwd() });
  const read = readBoardFromFile(resolvedFilePath);
  if ('error' in read) return { error: read.error };

  const { board } = read;
  const taskInfo = findTaskById(board, ctx.taskId);
  if (!taskInfo) return { error: `Task not found: ${ctx.taskId}` };

  const contract = getContractOrError(ctx.taskId, taskInfo.task.contract);
  if (!contract.ok) return { error: contract.error };

  const result = setTaskContractStatus(board, ctx.taskId, 'delivered');
  if (!result.success || !result.board) return { error: result.error || 'Failed to update contract status' };

  writeBoardToFile(resolvedFilePath, result.board);

  return { action: 'deliver', board: result.board };
}

export function validateContract(ctx: ContractRunContext): ContractValidateResult | { error: string } {
  const resolvedFilePath = resolveBrainfilePath({ filePath: ctx.filePath, startDir: process.cwd() });
  const read = readBoardFromFile(resolvedFilePath);
  if ('error' in read) return { error: read.error };

  const { board } = read;
  const taskInfo = findTaskById(board, ctx.taskId);
  if (!taskInfo) return { error: `Task not found: ${ctx.taskId}` };

  const contractInfo = getContractOrError(ctx.taskId, taskInfo.task.contract);
  if (!contractInfo.ok) return { error: contractInfo.error };

  const contract = contractInfo.contract;
  const brainfileAbs = path.resolve(resolvedFilePath);
  const brainfileDir = path.dirname(brainfileAbs);

  // If brainfile is inside .brainfile/, use parent as project root
  // This ensures paths like "cli/src/file.ts" resolve from project root, not .brainfile/
  const baseDir = path.basename(brainfileDir) === '.brainfile'
    ? path.dirname(brainfileDir)
    : brainfileDir;

  const deliverables = contract.deliverables ?? [];
  const deliverableChecks: ContractValidateResult['deliverableChecks'] = [];

  // Check file deliverables exist
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

  // If any deliverable failed, fail fast (and do not run commands)
  const deliverablesOk = deliverableChecks.every((c) => c.ok);
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

      // Check for directory-changing commands that may cause issues
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

  const status = ok ? 'done' : 'failed';
  const statusResult = setTaskContractStatus(board, ctx.taskId, status);
  if (!statusResult.success || !statusResult.board) {
    return { error: statusResult.error || 'Failed to update contract status' };
  }

  writeBoardToFile(ctx.filePath, statusResult.board);

  return {
    action: 'validate',
    board: statusResult.board,
    deliverableChecks,
    commandResults,
    warnings,
    ok,
  };
}
