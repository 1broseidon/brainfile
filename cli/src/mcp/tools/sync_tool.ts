import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { mcpError, mcpResult, requireV2, resolveBrainfile } from '../helpers';
import { boardAutosync, boardRemote, boardRemoteRef, syncBoard, syncMessage } from '../../utils/board-sync';
import { isTrackedBoard } from '../../utils/board-repo';
import { syncOutputSchema } from '../schemas';

/**
 * `sync`: fetch, merge and push a shared board now, like `brainfile sync`.
 * It commits nothing itself (merges are their own commits), as the CLI's sync
 * runs outside the per-command board commit. Choosing a remote or the
 * autosync mode stays with the person: they decide who can read the board.
 */
export function registerSyncTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'sync',
    {
      title: 'Sync Board',
      description: 'Share the board now: fetch, merge (the board-aware merge driver) and push through its git remote. pull or push alone for one direction. A plain board, or one with no remote, is skipped with a reason (skipped). conflicts lists files left for a person. Setting the remote or autosync is the person\'s call: brainfile sync --set-remote / --autosync.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        pull: z.boolean().optional().describe('Fetch and merge only'),
        push: z.boolean().optional().describe('Push only'),
      }),
      outputSchema: syncOutputSchema,
    },
    async ({ file, pull, push }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      if (pull === true && push === true) return mcpError('give pull or push, or neither for both');
      const dotDir = path.dirname(resolveBrainfile(filePath));
      const result = syncBoard(dotDir, { pull: push !== true, push: pull !== true });
      const tracked = isTrackedBoard(dotDir);
      const message = syncMessage(result);
      const output = {
        ok: result.ok,
        ...(result.skipped ? { skipped: result.skipped } : {}),
        remote: result.remote ?? (tracked ? boardRemote(dotDir) : null),
        remoteRef: result.remoteRef ?? (tracked && boardRemote(dotDir) ? boardRemoteRef(dotDir) : null),
        pulled: result.pulled,
        pushed: result.pushed,
        conflicts: result.conflicts,
        ...(result.warning ? { warning: result.warning } : {}),
        ...(result.failure ? { failure: result.failure } : {}),
        ...(result.movedFromBranch ? { movedFromBranch: result.movedFromBranch } : {}),
        autosync: tracked ? boardAutosync(dotDir) : null,
        message: message.detail ? `${message.text} (${message.detail})` : message.text,
      };
      return mcpResult(`${output.message}\n\n${JSON.stringify(output, null, 2)}`, output);
    },
  );
}
