import { contractGraphCommand } from '../../commands/contract';
import { MemoryLogger } from '../../utils/logger';

export interface McpGraphDeliverableInput {
  type: string;
  path: string;
  description?: string;
}

export interface McpContractGraphTaskInput {
  task: string;
  deliverables?: McpGraphDeliverableInput[];
  validation_commands?: string[];
  constraints?: string[];
  dependsOn?: string[];
}

export interface ContractGraphMcpActionOptions {
  file: string;
  tasks: McpContractGraphTaskInput[];
  activate?: boolean;
}

function toDeliverableSpec(deliverable: McpGraphDeliverableInput): string {
  const type = deliverable.type.trim();
  const path = deliverable.path.trim();
  const description = deliverable.description?.trim();

  return description ? `${type}:${path}:${description}` : `${type}:${path}`;
}

export function executeContractGraphMcpAction(options: ContractGraphMcpActionOptions): {
  attached: string[];
  count: number;
  order: string[];
  graph: string;
  logOutput: string;
} {
  const logger = new MemoryLogger();
  const result = contractGraphCommand({
    file: options.file,
    ready: options.activate,
    tasks: options.tasks.map((task) => ({
      task: task.task,
      deliverable: task.deliverables?.map(toDeliverableSpec),
      validation: task.validation_commands,
      constraint: task.constraints,
      dependsOn: task.dependsOn,
    })),
  }, logger);

  return {
    attached: result.attached,
    count: result.attached.length,
    order: result.order,
    graph: result.graph,
    logOutput: logger.getOutput(),
  };
}
