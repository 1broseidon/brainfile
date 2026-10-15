import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { dispatchReport, leadReport, mayDispatch, statusReport, statusText, stopReport, type Access } from '../../commands/dispatch';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { dispatchLeadOutputSchema, dispatchOutputSchema, dispatchStatusOutputSchema, dispatchStopOutputSchema } from '../schemas';

/** How long `dispatch_stop` waits to say whether the run has ended; its runner watches for the stop every second. */
const STOP_WAIT_MS = 5_000;

/**
 * `dispatch`, `dispatch_status`, `dispatch_stop` (task-81) and
 * `dispatch_lead` (task-83), like `brainfile dispatch`, `dispatch status`,
 * `dispatch stop` and `dispatch pause|resume`. `dispatch` queues: whichever
 * runner works the queue on this machine starts it, and the answer says
 * plainly when none is up; an epic gets a lead. A worker's or a discussion's
 * server lists only `dispatch_status` (decision-15: a hand-off never hands
 * off); a lead's reaches only its own tree, inside the rules its runner holds.
 */
export function registerDispatchTools(server: McpServer, defaultFile: string, access: Access = {}): void {
  const lead = access.role === 'lead' ? ` As a lead, only the tasks under ${access.scope ?? 'your epic'}.` : '';
  if (mayDispatch(access)) {
    server.registerTool(
      'dispatch',
      {
        title: 'Hand Off Tasks',
        description:
          'Queue tasks for a coding agent, like brainfile dispatch: dispatch (agent, model, effort, until, by) is written on each task and the agent becomes its assignee. A runner on this machine (brainfile run, or the Brainfile window) starts each in its own git worktree on dispatch/<task-id>, at most the board\'s dispatch.maxRunning (else 3) at once; the answer says when no runner is up. Name tasks, or column (every open task in it) or parent (its open children). With no agent, the one it was last handed to, else its assignee. until review (default) stops in Review for the person; done lands it where the repository allows. A task whose dependsOn are open, or complete and not landed, stays queued until they land. Naming an epic (a task with open children) queues a lead for it instead: an agent that checks the plan and hands its children off in order; in a led tree only its lead and the person hand off. Ask the person before handing off more than three at once.' + lead,
        inputSchema: z.object({
          file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
          task: z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs to hand off'),
          column: z.string().optional().describe('Every open task in this column (id or title)'),
          parent: z.string().optional().describe("The parent's open children"),
          agent: z.string().optional().describe('Who does it, by id or name (agents lists them)'),
          model: z.string().optional().describe('A model the agent offers; default its own'),
          effort: z.string().optional().describe('The effort level for that model'),
          until: z.enum(['review', 'done']).optional().describe('review (default): stop in Review; done: land it where the repository allows'),
        }),
        outputSchema: dispatchOutputSchema,
      },
      withBoardCommit('dispatch', defaultFile, async ({ file, task, column, parent, agent, model, effort, until }) => {
        const filePath = file || defaultFile;
        const guard = requireV2(filePath);
        if (guard) return guard;
        try {
          const ids = task === undefined ? [] : Array.isArray(task) ? task : [task];
          const report = await dispatchReport(resolveBrainfile(filePath), { ids, column, parent }, { agent, model, effort, until }, { kind: 'mcp', access });
          return mcpResult(report.said, { ...report });
        } catch (e) {
          return mcpErrorFrom(e);
        }
      }),
    );
  }

  server.registerTool(
    'dispatch_status',
    {
      title: 'What Is Running',
      description: 'The hand-offs on this machine, like brainfile dispatch status: the runners up, every live run (task, agent, model, activity, what it is asking), the queue in order with what each waits on, and the tasks a runner holds (lost when its runner is gone). From the board and the run files in .brainfile/state, whichever runner started them. Read-only.' + lead,
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
      }),
      outputSchema: dispatchStatusOutputSchema,
    },
    async ({ file }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const report = await statusReport(resolveBrainfile(filePath), { access });
        return mcpResult(statusText(report), { ...report });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    },
  );

  if (mayDispatch(access)) {
    server.registerTool(
      'dispatch_stop',
      {
        title: 'Stop A Hand-Off',
        description: "Stop a run by its run id or its task id, like brainfile dispatch stop, whichever runner on this machine has it: its runner is asked to stop it, and sent SIGTERM if it has not within 15 s. Its worktree and branch stay for review; its claim is given back. An epic's id stops its lead: what it handed off goes on." + lead,
        inputSchema: z.object({
          file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
          run: z.string().describe("The run id (run-…), the task id, e.g. task-12, or an epic's id for its lead"),
        }),
        outputSchema: dispatchStopOutputSchema,
      },
      async ({ file, run }) => {
        const filePath = file || defaultFile;
        const guard = requireV2(filePath);
        if (guard) return guard;
        try {
          const report = await stopReport(resolveBrainfile(filePath), run, { access, waitMs: STOP_WAIT_MS });
          return mcpResult(report.said, { ...report });
        } catch (e) {
          return mcpErrorFrom(e);
        }
      },
    );

    server.registerTool(
      'dispatch_lead',
      {
        title: "Pause Or Resume An Epic's Lead",
        description: "Pause or resume an epic's lead, like brainfile dispatch pause|resume, whichever runner leads it: paused, it hands off nothing and what happens waits for it; resumed, it carries on, or waits for a runner to take it up. What is running goes on either way. Stop it with dispatch_stop and the epic's id." + lead,
        inputSchema: z.object({
          file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
          epic: z.string().describe("The epic whose lead it is, e.g. epic-3"),
          action: z.enum(['pause', 'resume']).describe('pause or resume'),
        }),
        outputSchema: dispatchLeadOutputSchema,
      },
      withBoardCommit('dispatch_lead', defaultFile, async ({ file, epic, action }) => {
        const filePath = file || defaultFile;
        const guard = requireV2(filePath);
        if (guard) return guard;
        try {
          const report = await leadReport(resolveBrainfile(filePath), epic, action, { access });
          return mcpResult(report.said, { ...report });
        } catch (e) {
          return mcpErrorFrom(e);
        }
      }),
    );
  }
}
