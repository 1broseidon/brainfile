export interface DependencyGraphNode {
  id: string;
  dependsOn?: readonly string[];
}

export class MissingDependencyError extends Error {
  readonly taskId: string;
  readonly dependencyId: string;

  constructor(taskId: string, dependencyId: string) {
    super(`Task ${taskId} depends on missing task ${dependencyId}`);
    this.name = 'MissingDependencyError';
    this.taskId = taskId;
    this.dependencyId = dependencyId;
  }
}

export class DependencyCycleError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'DependencyCycleError';
    this.cycle = cycle;
  }
}

function normalizeDependencyIds(dependsOn?: readonly string[]): string[] {
  if (!Array.isArray(dependsOn)) {
    return [];
  }

  return [...new Set(dependsOn.map((value) => value.trim()).filter(Boolean))];
}

export function topologicalSort(nodes: readonly DependencyGraphNode[]): string[] {
  const dependenciesById = new Map<string, string[]>();

  for (const node of nodes) {
    if (dependenciesById.has(node.id)) {
      throw new Error(`Duplicate graph node: ${node.id}`);
    }

    dependenciesById.set(node.id, normalizeDependencyIds(node.dependsOn));
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
