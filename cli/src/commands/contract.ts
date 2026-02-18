import { pickupContract, deliverContract, validateContract } from '../lib/contractRunner';
import { defaultLogger, type Logger } from '../utils/logger';
import * as fs from 'fs';
import { Brainfile, findTaskById, setTaskContract } from '@brainfile/core';
import { missingRequired, operationFailed, validationError } from '../utils/cli-error';
import { buildContract } from '../utils/contractSpec';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

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
 * Attach a new contract to an existing task (status=ready).
 * This is for programmatic contract creation (no manual YAML editing).
 */
export function contractAttachCommand(options: ContractAttachOptions, logger: Logger = defaultLogger): ContractAttachCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract attach --task <task-id> [--file <path>] [--deliverable ...]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw operationFailed(`File not found: ${filePath}`);
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

  let contract;
  try {
    contract = buildContract({
      deliverableSpecs: options.deliverable,
      validationCommands: options.validation,
      constraints: options.constraint,
    });
  } catch (e) {
    throw validationError((e as Error).message);
  }

  const result = setTaskContract(parsed.board, options.task, contract);
  if (!result.success || !result.board) {
    throw operationFailed(result.error || 'Failed to attach contract');
  }

  fs.writeFileSync(filePath, Brainfile.serialize(result.board), 'utf-8');
  logger.log(`Contract attached: ${options.task}`);
  return { success: true };
}
