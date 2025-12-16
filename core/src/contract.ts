/**
 * Contract operations for PM-to-agent workflows.
 *
 * These are pure board mutation operations, following the same patterns as
 * `operations.ts`: no side effects, no in-place mutation, and returning a
 * `BoardOperationResult`.
 *
 * @packageDocumentation
 */

import type { Board, Task } from './types';
import type {
  Contract,
  ContractContext,
  ContractStatus,
  Deliverable,
  ValidationConfig,
} from './types/contract';
import type { BoardOperationResult } from './operations';
import { findTaskById } from './query';

/**
 * Patch input for updating an existing task contract.
 *
 * - `undefined` fields are ignored (no change)
 * - `null` removes the field from the contract
 */
export interface ContractPatch {
  status?: ContractStatus;
  deliverables?: Deliverable[] | null;
  validation?: ValidationConfig | null;
  constraints?: string[] | null;
  context?: ContractContext | null;
}

type TaskUpdate =
  | { ok: true; task: Task }
  | { ok: false; error: string };

function updateTaskById(
  board: Board,
  taskId: string,
  updater: (task: Task) => TaskUpdate
): BoardOperationResult {
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const { column } = taskInfo;
  const updated = updater(taskInfo.task);
  if (!updated.ok) {
    return { success: false, error: updated.error };
  }
  const updatedTask = updated.task;

  const newBoard: Board = {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== column.id) return col;
      return {
        ...col,
        tasks: col.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
      };
    }),
  };

  return { success: true, board: newBoard };
}

function getContract(task: Task): { ok: true; contract: Contract } | { ok: false; error: string } {
  if (!task.contract) return { ok: false, error: `Task ${task.id} has no contract` };
  return { ok: true, contract: task.contract };
}

function normalizeNonEmpty(input: string, errorMessage: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: errorMessage };
  return { ok: true, value: trimmed };
}

/**
 * Set (create or replace) the contract on a task.
 */
export function setTaskContract(board: Board, taskId: string, contract: Contract): BoardOperationResult {
  return updateTaskById(board, taskId, (task) => ({ ok: true, task: { ...task, contract } }));
}

/**
 * Remove a contract from a task.
 */
export function clearTaskContract(board: Board, taskId: string): BoardOperationResult {
  return updateTaskById(board, taskId, (task) => {
    if (!task.contract) return { ok: false, error: `Task ${task.id} has no contract` };
    const { contract: _contract, ...taskWithoutContract } = task;
    return { ok: true, task: taskWithoutContract };
  });
}

/**
 * Update only the contract status.
 */
export function setTaskContractStatus(
  board: Board,
  taskId: string,
  status: ContractStatus
): BoardOperationResult {
  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };
    return { ok: true, task: { ...task, contract: { ...existing.contract, status } } };
  });
}

/**
 * Patch a task's existing contract.
 */
export function patchTaskContract(board: Board, taskId: string, patch: ContractPatch): BoardOperationResult {
  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const updated: Contract = { ...existing.contract };

    if (patch.status !== undefined) updated.status = patch.status;

    if (patch.deliverables !== undefined) {
      if (patch.deliverables === null) delete updated.deliverables;
      else updated.deliverables = patch.deliverables;
    }

    if (patch.validation !== undefined) {
      if (patch.validation === null) delete updated.validation;
      else updated.validation = patch.validation;
    }

    if (patch.constraints !== undefined) {
      if (patch.constraints === null) delete updated.constraints;
      else updated.constraints = patch.constraints;
    }

    if (patch.context !== undefined) {
      if (patch.context === null) delete updated.context;
      else updated.context = patch.context;
    }

    return { ok: true, task: { ...task, contract: updated } };
  });
}

/**
 * Add a deliverable to a task's contract.
 */
export function addTaskContractDeliverable(
  board: Board,
  taskId: string,
  deliverable: Deliverable
): BoardOperationResult {
  const normalizedPath = normalizeNonEmpty(deliverable.path, 'Deliverable path is required');
  if (!normalizedPath.ok) return { success: false, error: normalizedPath.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const current = existing.contract.deliverables ?? [];
    if (current.some((d) => d.path === normalizedPath.value)) {
      return { ok: false, error: `Deliverable ${normalizedPath.value} already exists` };
    }

    const next: Deliverable[] = [...current, { ...deliverable, path: normalizedPath.value }];
    return { ok: true, task: { ...task, contract: { ...existing.contract, deliverables: next } } };
  });
}

/**
 * Remove a deliverable from a task's contract (by path).
 */
export function removeTaskContractDeliverable(
  board: Board,
  taskId: string,
  deliverablePath: string
): BoardOperationResult {
  const normalizedPath = normalizeNonEmpty(deliverablePath, 'Deliverable path is required');
  if (!normalizedPath.ok) return { success: false, error: normalizedPath.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const current = existing.contract.deliverables ?? [];
    const exists = current.some((d) => d.path === normalizedPath.value);
    if (!exists) return { ok: false, error: `Deliverable ${normalizedPath.value} not found` };

    const remaining = current.filter((d) => d.path !== normalizedPath.value);
    const updated: Contract = { ...existing.contract };
    if (remaining.length > 0) updated.deliverables = remaining;
    else delete updated.deliverables;

    return { ok: true, task: { ...task, contract: updated } };
  });
}

/**
 * Add a validation command to a task's contract.
 */
export function addTaskContractValidationCommand(
  board: Board,
  taskId: string,
  command: string
): BoardOperationResult {
  const normalized = normalizeNonEmpty(command, 'Validation command is required');
  if (!normalized.ok) return { success: false, error: normalized.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const currentCommands = existing.contract.validation?.commands ?? [];
    if (currentCommands.includes(normalized.value)) return { ok: true, task }; // idempotent

    const nextCommands = [...currentCommands, normalized.value];
    return {
      ok: true,
      task: {
        ...task,
        contract: {
          ...existing.contract,
          validation: { ...(existing.contract.validation ?? {}), commands: nextCommands },
        },
      },
    };
  });
}

/**
 * Remove a validation command from a task's contract.
 */
export function removeTaskContractValidationCommand(
  board: Board,
  taskId: string,
  command: string
): BoardOperationResult {
  const normalized = normalizeNonEmpty(command, 'Validation command is required');
  if (!normalized.ok) return { success: false, error: normalized.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const currentCommands = existing.contract.validation?.commands ?? [];
    if (!currentCommands.includes(normalized.value)) {
      return { ok: false, error: 'Validation command not found' };
    }

    const remaining = currentCommands.filter((c) => c !== normalized.value);
    const updated: Contract = { ...existing.contract };

    if (remaining.length > 0) {
      updated.validation = { ...(existing.contract.validation ?? {}), commands: remaining };
    } else {
      // remove validation entirely if it would become empty
      delete updated.validation;
    }

    return { ok: true, task: { ...task, contract: updated } };
  });
}

/**
 * Add a constraint to a task's contract.
 */
export function addTaskContractConstraint(
  board: Board,
  taskId: string,
  constraint: string
): BoardOperationResult {
  const normalized = normalizeNonEmpty(constraint, 'Constraint is required');
  if (!normalized.ok) return { success: false, error: normalized.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const current = existing.contract.constraints ?? [];
    if (current.includes(normalized.value)) return { ok: true, task }; // idempotent

    return {
      ok: true,
      task: {
        ...task,
        contract: {
          ...existing.contract,
          constraints: [...current, normalized.value],
        },
      }
    };
  });
}

/**
 * Remove a constraint from a task's contract.
 */
export function removeTaskContractConstraint(
  board: Board,
  taskId: string,
  constraint: string
): BoardOperationResult {
  const normalized = normalizeNonEmpty(constraint, 'Constraint is required');
  if (!normalized.ok) return { success: false, error: normalized.error };

  return updateTaskById(board, taskId, (task) => {
    const existing = getContract(task);
    if (!existing.ok) return { ok: false, error: existing.error };

    const current = existing.contract.constraints ?? [];
    if (!current.includes(normalized.value)) return { ok: false, error: 'Constraint not found' };

    const remaining = current.filter((c) => c !== normalized.value);
    const updated: Contract = { ...existing.contract };

    if (remaining.length > 0) updated.constraints = remaining;
    else delete updated.constraints;

    return { ok: true, task: { ...task, contract: updated } };
  });
}

