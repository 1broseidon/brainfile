import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { appendTaskNote } from '../../commands/log';
import { mcpError, mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { noteOutputSchema } from '../schemas';

/**
 * `note`: append a timestamped line to a task's log, attributed like the
 * CLI's `note` (agent, else the detected agent, else the git user).
 */
export function registerNoteTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'note',
    {
      title: 'Add Note',
      description: 'Append a timestamped line to a task\'s log (its ## Log section): what you found, decided or did while working on it. Works on open and completed tasks. Attributed to agent, else the agent running the server, else the git user. Notes become the ledger summary when the task completes.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID'),
        message: z.string().describe('The note: one line is best'),
        agent: z.string().optional().describe('Who wrote it (default: the detected agent, else the git user)'),
      }),
      outputSchema: noteOutputSchema,
    },
    withBoardCommit('note', defaultFile, async ({ file, task, message, agent }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      if (!message.trim()) return mcpError('message is required');
      try {
        const note = appendTaskNote(resolveBrainfile(filePath), task, message.trim(), agent);
        return mcpResult(`Note added to ${note.taskId}\n${note.entry}`, { ...note });
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
