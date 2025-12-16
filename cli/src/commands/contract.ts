import { pickupContract, deliverContract, validateContract } from '../lib/contractRunner';
import { defaultLogger, type Logger } from '../utils/logger';
import { missingRequired, operationFailed } from '../utils/cli-error';

interface ContractOptions {
  file: string;
  task: string;
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

export function contractPickupCommand(options: ContractOptions, logger: Logger = defaultLogger): ContractPickupCommandResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile contract pickup --task <task-id> [--file <path>]');
  }

  const result = pickupContract({ filePath: options.file, taskId: options.task });
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

  const result = deliverContract({ filePath: options.file, taskId: options.task });
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

  const result = validateContract({ filePath: options.file, taskId: options.task });
  if ('error' in result) {
    throw operationFailed(result.error);
  }

  const deliverablesOk = result.deliverableChecks.every((c) => c.ok);
  const commandsOk = result.commandResults.every((c) => c.exitCode === 0);
  const ok = result.ok;

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

