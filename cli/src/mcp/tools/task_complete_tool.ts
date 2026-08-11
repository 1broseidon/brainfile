import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {
  findTaskById,
  deleteTask,
  writeTaskFile as coreWriteTaskFile,
  taskFileName,
  formatTaskForGitHub,
  formatTaskForLinear,
} from '@brainfile/core';
import { isV2, getV2Dirs, findV2Task, readV2BoardConfig } from '../../utils/v2-detect';
import { isGitHubAuthenticated, createGitHubIssue } from '../../utils/github-auth';
import { isLinearAuthenticated, createLinearIssue, getLinearTeams } from '../../utils/linear-auth';
import { getArchiveConfig } from '../../utils/config';
import { archiveTaskToFile, getArchivePath } from '../../utils/archive';
import { completeCommand } from '../../commands/complete';
import { readBoard, writeBoard } from '../helpers';

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
        // Default behavior: normal complete flow (v2 -> logs, v1 -> done column)
        if (!destination) {
          const result = completeCommand({ file: filePath, task }, { log: () => {}, warn: () => {}, error: () => {}, info: () => {} });
          return {
            content: [{ type: 'text' as const, text: `Task ${task} completed at ${result.completedAt}` }]
          };
        }

        // Local archive keeps legacy archive_task behavior for v1
        if (destination === 'local') {
          if (isV2(filePath)) {
            const dirs = getV2Dirs(filePath);
            const found = findV2Task(dirs, task);
            if (!found) {
              return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
            }
            const logPath = path.join(dirs.logsDir, taskFileName(task));
            found.doc.task.completedAt = found.doc.task.completedAt || new Date().toISOString();
            delete found.doc.task.column;
            delete found.doc.task.position;
            coreWriteTaskFile(logPath, found.doc.task, found.doc.body);
            fs.unlinkSync(found.filePath);
            return { content: [{ type: 'text' as const, text: `Task ${task} archived to logs/` }] };
          }

          const readResult = readBoard(filePath);
          if ('error' in readResult) {
            return { content: [{ type: 'text' as const, text: `Error: ${readResult.error}` }], isError: true };
          }
          const taskInfo = findTaskById(readResult.board, task);
          if (!taskInfo) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const archiveResult = archiveTaskToFile(filePath, readResult.board, taskInfo.column.id, task);
          if (!archiveResult.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${archiveResult.error}` }], isError: true };
          }
          return {
            content: [{ type: 'text' as const, text: `Task ${task} archived to ${path.basename(getArchivePath(filePath))}` }]
          };
        }

        // External archive destinations: legacy archive behavior
        if (isV2(filePath)) {
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
        }

        const readResult = readBoard(filePath);
        if ('error' in readResult) {
          return { content: [{ type: 'text' as const, text: `Error: ${readResult.error}` }], isError: true };
        }
        const { board } = readResult;
        const taskInfo = findTaskById(board, task);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        if (destination === 'github') {
          if (!(await isGitHubAuthenticated())) {
            return { content: [{ type: 'text' as const, text: 'Error: Not authenticated with GitHub.' }], isError: true };
          }
          const config = getArchiveConfig();
          if (!config.github?.owner || !config.github?.repo) {
            return { content: [{ type: 'text' as const, text: 'Error: GitHub repository not configured.' }], isError: true };
          }
          const payload = formatTaskForGitHub(taskInfo.task, {
            includeMeta: true,
            includeSubtasks: true,
            includeRelatedFiles: true,
            boardTitle: board.title,
            fromColumn: taskInfo.column.title,
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
          const deleteResult = deleteTask(board, taskInfo.column.id, task);
          if (deleteResult.success) writeBoard(filePath, deleteResult.board!);
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
        const payload = formatTaskForLinear(taskInfo.task, {
          includeMeta: true,
          includeSubtasks: true,
          includeRelatedFiles: true,
          boardTitle: board.title,
          fromColumn: taskInfo.column.title,
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
        const deleteResult = deleteTask(board, taskInfo.column.id, task);
        if (deleteResult.success) writeBoard(filePath, deleteResult.board!);
        return { content: [{ type: 'text' as const, text: `Task ${task} archived to Linear Issue ${linearResult.issueId} (Done)\n\nView: ${linearResult.issueUrl}` }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}
