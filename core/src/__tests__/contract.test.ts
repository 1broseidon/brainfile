import {
  setTaskContract,
  clearTaskContract,
  setTaskContractStatus,
  patchTaskContract,
  addTaskContractDeliverable,
  removeTaskContractDeliverable,
  addTaskContractValidationCommand,
  removeTaskContractValidationCommand,
  addTaskContractConstraint,
  removeTaskContractConstraint,
} from '../contract';
import type { Board } from '../types';
import type { Contract } from '../types/contract';

describe('Contract Operations', () => {
  let mockBoard: Board;

  beforeEach(() => {
    mockBoard = {
      title: 'Test Board',
      type: 'board',
      columns: [
        {
          id: 'col1',
          title: 'To Do',
          tasks: [
            { id: 'task-1', title: 'Task 1' },
            {
              id: 'task-2',
              title: 'Task 2',
              contract: {
                status: 'draft',
              },
            },
          ],
        },
        {
          id: 'col2',
          title: 'Done',
          tasks: [{ id: 'task-3', title: 'Task 3' }],
        },
      ],
    };
  });

  it('setTaskContract should create/replace a contract', () => {
    const contract: Contract = {
      status: 'ready',
      deliverables: [{ type: 'file', path: 'core/src/contract.ts', description: 'module' }],
      validation: { commands: ['cd core && npm test'] },
      constraints: ['No side effects'],
    };

    const result = setTaskContract(mockBoard, 'task-1', contract);
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[0].contract).toEqual(contract);
  });

  it('setTaskContract should return error for missing task', () => {
    const result = setTaskContract(mockBoard, 'task-99', { status: 'draft' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Task task-99 not found');
  });

  it('setTaskContract should not mutate original board', () => {
    setTaskContract(mockBoard, 'task-1', { status: 'draft' });
    expect(mockBoard.columns[0].tasks[0].contract).toBeUndefined();
  });

  it('clearTaskContract should remove contract', () => {
    const result = clearTaskContract(mockBoard, 'task-2');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract).toBeUndefined();
  });

  it('clearTaskContract should error if contract missing', () => {
    const result = clearTaskContract(mockBoard, 'task-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Task task-1 has no contract');
  });

  it('setTaskContractStatus should update status', () => {
    const result = setTaskContractStatus(mockBoard, 'task-2', 'in_progress');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.status).toBe('in_progress');
  });

  it('setTaskContractStatus should error if contract missing', () => {
    const result = setTaskContractStatus(mockBoard, 'task-1', 'ready');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Task task-1 has no contract');
  });

  it('patchTaskContract should update and remove fields with null', () => {
    let result = patchTaskContract(mockBoard, 'task-2', {
      deliverables: [{ type: 'test', path: 'core/src/__tests__/contract.test.ts' }],
      constraints: ['A', 'B'],
    });
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.deliverables).toHaveLength(1);
    expect(result.board!.columns[0].tasks[1].contract!.constraints).toEqual(['A', 'B']);

    result = patchTaskContract(result.board!, 'task-2', { deliverables: null, constraints: null });
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.deliverables).toBeUndefined();
    expect(result.board!.columns[0].tasks[1].contract!.constraints).toBeUndefined();
  });

  it('add/remove deliverables should add and remove by path', () => {
    let result = addTaskContractDeliverable(mockBoard, 'task-2', { type: 'file', path: 'a.ts' });
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.deliverables).toEqual([{ type: 'file', path: 'a.ts' }]);

    result = removeTaskContractDeliverable(result.board!, 'task-2', 'a.ts');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.deliverables).toBeUndefined();
  });

  it('add/remove validation commands should manage validation object', () => {
    let result = addTaskContractValidationCommand(mockBoard, 'task-2', ' cd core && npm test ');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.validation).toEqual({
      commands: ['cd core && npm test'],
    });

    result = removeTaskContractValidationCommand(result.board!, 'task-2', 'cd core && npm test');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.validation).toBeUndefined();
  });

  it('remove validation command should error if missing', () => {
    const result = removeTaskContractValidationCommand(mockBoard, 'task-2', 'nope');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation command not found');
  });

  it('add/remove constraints should manage constraints array', () => {
    let result = addTaskContractConstraint(mockBoard, 'task-2', ' Be explicit ');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.constraints).toEqual(['Be explicit']);

    result = removeTaskContractConstraint(result.board!, 'task-2', 'Be explicit');
    expect(result.success).toBe(true);
    expect(result.board!.columns[0].tasks[1].contract!.constraints).toBeUndefined();
  });

  it('remove constraint should error if missing', () => {
    const result = removeTaskContractConstraint(mockBoard, 'task-2', 'nope');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Constraint not found');
  });
});

