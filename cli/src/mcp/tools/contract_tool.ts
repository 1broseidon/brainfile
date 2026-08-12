import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import {
  attachTaskContract,
  activateTaskContract,
  activateTaskContractsByParent,
} from '@brainfile/core';
import { getV2Dirs, findV2Task } from '../../utils/v2-detect';
import { pickupContract, deliverContract, validateContract } from '../../lib/contractRunner';
import { executeContractGraphMcpAction } from './contract';
import { requireV2 } from '../helpers';

export function registerContractTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'contract',
    {
      title: 'Contract',
      description: [
        'Unified action-based contract tool.',
        'action=attach   — Attach a new contract to a task (default status=draft; pass ready:true for immediate dispatch)',
        'action=pickup   — Claim a contract (status → in_progress), returns agent context markdown',
        'action=deliver  — Mark contract as delivered (status → delivered)',
        'action=validate — Validate deliverables + commands (status → done/failed)',
        'action=graph    — Attach contracts to multiple tasks atomically with dependsOn DAG edges (tasks array only)',
        'action=activate — Flip draft → ready for one task (task param) or all children of a parent (parentId param)',
      ].join('\n'),
      inputSchema: z.object({
              action: z.enum(['attach', 'pickup', 'deliver', 'validate', 'graph', 'activate']).describe('Contract action'),
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().optional().describe('Task ID (required for attach, pickup, deliver, validate, and single-task activate)'),
              parentId: z.string().optional().describe('For activate: activate all draft contracts whose parentId matches this value'),
              ready: z.boolean().optional().describe('attach only: when true, status=ready instead of draft'),
              deliverables: z.array(z.string()).optional().describe('attach only: type:path:description'),
              validation_commands: z.array(z.string()).optional().describe('attach only: validation shell commands'),
              constraints: z.array(z.string()).optional().describe('attach only: constraint strings'),
              tasks: z.array(z.object({
                task: z.string(),
                deliverables: z.array(z.object({
                  type: z.enum(['file', 'test', 'docs', 'design', 'research']),
                  path: z.string(),
                  description: z.string().optional(),
                })).optional(),
                validation_commands: z.array(z.string()).optional(),
                constraints: z.array(z.string()).optional(),
                dependsOn: z.array(z.string()).optional(),
              })).optional().describe('graph only: array of contract graph task specs'),
              activate: z.boolean().optional().describe('graph only: when true, attached contracts start in ready instead of draft'),
            })
    },
    async ({ action, file, task, parentId, ready: attachReady, deliverables, validation_commands, constraints, tasks, activate }) => {
      const filePath = file || defaultFile;

      // ── attach ─────────────────────────────────────────────────────────────
      if (action === 'attach') {
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Error: task is required for action=attach' }], isError: true };
        }

        const guard = requireV2(filePath);
        if (guard) return guard;

        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        try {
          const result = attachTaskContract(found.filePath, {
            deliverableSpecs: deliverables,
            validationCommands: validation_commands,
            constraints,
            ready: attachReady === true,
          });
          if (!result.success || !result.task) {
            return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to attach contract'}` }], isError: true };
          }
          return { content: [{ type: 'text' as const, text: `Contract attached (${result.task.contract!.status}): ${task}` }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      // ── pickup ─────────────────────────────────────────────────────────────
      if (action === 'pickup') {
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Error: task is required for action=pickup' }], isError: true };
        }
        const result = pickupContract({ filePath, taskId: task });
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: result.markdown }] };
      }

      // ── deliver ────────────────────────────────────────────────────────────
      if (action === 'deliver') {
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Error: task is required for action=deliver' }], isError: true };
        }
        const result = deliverContract({ filePath, taskId: task });
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Contract delivered: ${task}` }] };
      }

      // ── validate ───────────────────────────────────────────────────────────
      if (action === 'validate') {
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Error: task is required for action=validate' }], isError: true };
        }
        const result = validateContract({ filePath, taskId: task });
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        const output = {
          ok: result.ok,
          status: result.ok ? 'done' : 'failed',
          deliverables: result.deliverableChecks,
          commands: result.commandResults,
          warnings: result.warnings,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          isError: !result.ok,
        };
      }

      // ── graph ──────────────────────────────────────────────────────────────
      if (action === 'graph') {
        if (!tasks || tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: tasks is required for action=graph and must be a non-empty array' }], isError: true };
        }

        try {
          const result = executeContractGraphMcpAction({
            file: filePath,
            tasks,
            activate,
          });

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              attached: result.attached,
              count: result.count,
              order: result.order,
              graph: result.graph,
            }, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }

      // ── activate ───────────────────────────────────────────────────────────
      if (action === 'activate') {
        if (!task && !parentId) {
          return { content: [{ type: 'text' as const, text: 'Error: task or parentId is required for action=activate' }], isError: true };
        }

        const guard = requireV2(filePath);
        if (guard) return guard;

        const activated: string[] = [];
        const dirs = getV2Dirs(filePath);

        if (task) {
          const found = findV2Task(dirs, task, false);
          if (!found || found.isLog) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const result = activateTaskContract(found.filePath);
          if (!result.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${result.error || `Failed to activate contract: ${task}`}` }], isError: true };
          }
          activated.push(task);
        } else {
          // Bulk by parentId
          activated.push(...activateTaskContractsByParent(dirs.boardDir, parentId!).activated);
        }

        const output = { activated, count: activated.length };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      return { content: [{ type: 'text' as const, text: `Error: Unknown action: ${action}` }], isError: true };
    }
  );
}
