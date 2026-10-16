import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { findV2Task, getV2Dirs } from '@brainfile/core';
import { mayDispatch, type Access } from '../../commands/dispatch';
import { discardReport, landReport, readyReport, readyText, reviewReport, reviewText } from '../../commands/review';
import { mcpError, mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { reviewOutputSchema } from '../schemas';

/**
 * `review` (task-81): a hand-off's work and what to do with it, like
 * `brainfile review`, `land` and `discard`. A worker's or a discussion's
 * server offers only show and ready (decision-15); a lead's lands and
 * discards only in its own tree.
 */
export function registerReviewTool(server: McpServer, defaultFile: string, access: Access = {}): void {
  const acts = mayDispatch(access);
  const actions = acts ? (['show', 'ready', 'land', 'discard'] as const) : (['show', 'ready'] as const);
  server.registerTool(
    'review',
    {
      title: 'Review A Hand-Off',
      description:
        "A task's hand-off on its own branch. show (default): the branch, where it lands, its commits and files, the files that would conflict, and whether it can land now. ready: every hand-off that can land now." +
        (acts
          ? " land: runs the task's contract validation in its worktree with its target brought in, then lands it (decision-12); the task completes unless subtasks are left. A conflict or a failed check goes back to the agent that did it, queued for a runner, up to the contract's maxRetries, then it parks in Review. into lands it on another branch. discard: throws its worktree and branch away. land and discard are refused while an agent is at it."
          : ''),
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        action: z.enum(actions).optional().describe(`${actions.join(' | ')} (default show)`),
        task: z.string().optional().describe('The task whose hand-off it is, e.g. task-12 (not for ready)'),
        into: z.string().optional().describe('land only: land on this branch instead of its target'),
      }),
      outputSchema: reviewOutputSchema,
    },
    withBoardCommit('review', defaultFile, async ({ file, action = 'show', task, into }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const resolved = resolveBrainfile(filePath);
        if (action === 'ready') {
          const report = await readyReport(resolved, { access });
          return mcpResult(readyText(report), { action: 'ready' as const, ...report });
        }
        if (!task) return mcpError(`review ${action} needs a task`);
        if (action === 'land') {
          const report = await landReport(resolved, task, { access, into });
          return mcpResult(report.landed && report.completed ? `${report.message}. ${task} is done.` : report.message, { action: 'land' as const, ...report });
        }
        if (action === 'discard') {
          const report = await discardReport(resolved, task, { access });
          return mcpResult(report.message, { action: 'discard' as const, ...report });
        }
        const report = await reviewReport(resolved, task, { access });
        const title = findV2Task(getV2Dirs(resolved), task, true)?.doc.task.title;
        return mcpResult(reviewText(report, title), { action: 'show' as const, ...report });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    }),
  );
}
