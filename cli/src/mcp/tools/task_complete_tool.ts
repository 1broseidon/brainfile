import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {
  completeTaskFile,
  formatTaskForGitHub,
  formatTaskForLinear,
} from '@brainfile/core';
import { getV2Dirs, findV2Task, readV2BoardConfig } from '../../utils/v2-detect';
import { isGitHubAuthenticated, createGitHubIssue } from '../../utils/github-auth';
import { isLinearAuthenticated, createLinearIssue, getLinearTeams } from '../../utils/linear-auth';
import { getArchiveConfig } from '../../utils/config';
import { completeCommand } from '../../commands/complete';
import { requireV2 } from '../helpers';

export function registerTaskCompleteTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_complete',
    {
      title: 'Complete Task',
      description: 'Complete a task or archive it to local/GitHub/Linear destination',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().describe('Task ID to complete'),
              destination: z.enum(['local', 'github', 'linear']).optional().describe('Optional archive destination. If omitted, performs normal completion flow.'),
            })
    },
    async ({ file, task, destination }) => {
      const filePath = file || defaultFile;

      try {
        const guard = requireV2(filePath);
        if (guard) return guard;

        // Default behavior: normal complete flow (task moves to logs/)
        if (!destination) {
          const result = completeCommand({ file: filePath, task }, { log: () => {}, warn: () => {}, error: () => {}, info: () => {} });
          return {
            content: [{ type: 'text' as const, text: `Task ${task} completed at ${result.completedAt}` }]
          };
        }

        // Local archive: move the task file into logs/
        if (destination === 'local') {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const result = completeTaskFile(found.filePath, dirs.logsDir, { legacyMode: true });
          if (!result.success) {
            const detail = result.incompleteChildren?.length
              ? `\nIncomplete children:\n${result.incompleteChildren.map(c => `  - ${c.id}: ${c.title}`).join('\n')}`
              : '';
            return {
              content: [{ type: 'text' as const, text: `Error: ${result.error || `Failed to archive task: ${task}`}${detail}` }],
              isError: true,
            };
          }
          return { content: [{ type: 'text' as const, text: `Task ${task} archived to logs/` }] };
        }

        // External archive destinations
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const board = readV2BoardConfig(filePath);

        if (destination === 'github') {
          if (!(await isGitHubAuthenticated())) {
            return { content: [{ type: 'text' as const, text: 'Error: Not authenticated with GitHub.' }], isError: true };
          }
          const config = getArchiveConfig();
          if (!config.github?.owner || !config.github?.repo) {
            return { content: [{ type: 'text' as const, text: 'Error: GitHub repository not configured.' }], isError: true };
          }
          const payload = formatTaskForGitHub(found.doc.task, {
            includeMeta: true,
            includeSubtasks: true,
            includeRelatedFiles: true,
            boardTitle: board.title,
            fromColumn: found.doc.task.column || 'unknown',
            extraLabels: config.github.labels,
          });
          const ghResult = await createGitHubIssue({
            owner: config.github.owner,
            repo: config.github.repo,
            title: payload.title,
            body: payload.body,
            labels: payload.labels,
            state: 'closed',
          });
          if (!ghResult.success) {
            return { content: [{ type: 'text' as const, text: `Error creating GitHub issue: ${ghResult.error}` }], isError: true };
          }
          fs.unlinkSync(found.filePath);
          return { content: [{ type: 'text' as const, text: `Task ${task} archived to GitHub Issue #${ghResult.issueNumber} (closed)\n\nView: ${ghResult.issueUrl}` }] };
        }

        if (!(await isLinearAuthenticated())) {
          return { content: [{ type: 'text' as const, text: 'Error: Not authenticated with Linear.' }], isError: true };
        }
        const config = getArchiveConfig();
        let teamId = config.linear?.teamId;
        if (!teamId) {
          const teams = await getLinearTeams();
          if (teams.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Error: No Linear teams found.' }], isError: true };
          }
          if (teams.length === 1) {
            teamId = teams[0].id;
          } else {
            const teamList = teams.map(t => `  ${t.key}: ${t.name} (${t.id})`).join('\n');
            return { content: [{ type: 'text' as const, text: `Error: Multiple Linear teams found. Please configure a default.\n\nAvailable teams:\n${teamList}` }], isError: true };
          }
        }
        const payload = formatTaskForLinear(found.doc.task, {
          includeMeta: true,
          includeSubtasks: true,
          includeRelatedFiles: true,
          boardTitle: board.title,
          fromColumn: found.doc.task.column || 'unknown',
          stateName: 'Done',
        });
        const linearResult = await createLinearIssue({
          teamId,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          labelNames: payload.labelNames,
          stateName: 'Done',
        });
        if (!linearResult.success) {
          return { content: [{ type: 'text' as const, text: `Error creating Linear issue: ${linearResult.error}` }], isError: true };
        }
        fs.unlinkSync(found.filePath);
        return { content: [{ type: 'text' as const, text: `Task ${task} archived to Linear Issue ${linearResult.issueId} (Done)\n\nView: ${linearResult.issueUrl}` }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}
