import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  findNearestBrainfile,
  findBrainfile,
  resolveBrainfilePath,
} from '@brainfile/core';
import { findGitRoot, type McpOptions } from '../mcp/helpers';
import { assertV2Brainfile } from '../utils/v2-only';
import { registerListTasksTool } from '../mcp/tools/list_tasks_tool';
import { registerGetTaskTool } from '../mcp/tools/get_task_tool';
import { registerSearchTool } from '../mcp/tools/search_tool';
import { registerTaskAddTool } from '../mcp/tools/task_add_tool';
import { registerTaskMoveTool } from '../mcp/tools/task_move_tool';
import { registerTaskPatchTool } from '../mcp/tools/task_patch_tool';
import { registerTaskDeleteTool } from '../mcp/tools/task_delete_tool';
import { registerSubtaskTool } from '../mcp/tools/subtask_tool';
import { registerContractTool } from '../mcp/tools/contract_tool';
import { registerTaskCompleteTool } from '../mcp/tools/task_complete_tool';

export async function mcpCommand(options: McpOptions) {
  // Auto-discover brainfile if not specified
  let defaultFile = options.file;

  if (defaultFile === 'brainfile.md') {
    // Strategy 1: Check WORKSPACE_FOLDER_PATHS env var (set by Cursor)
    const workspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
    if (workspacePaths) {
      const paths = workspacePaths.split(':').filter(Boolean);
      for (const wsPath of paths) {
        const found = findBrainfile(wsPath);
        if (found) {
          defaultFile = found.absolutePath;
          console.error(`[brainfile-mcp] Found in workspace: ${defaultFile}`);
          break;
        }
        const discovered = findNearestBrainfile(wsPath);
        if (discovered) {
          defaultFile = discovered.absolutePath;
          console.error(`[brainfile-mcp] Discovered in workspace: ${defaultFile}`);
          break;
        }
      }
    }

    // Strategy 2: git repo root
    if (defaultFile === 'brainfile.md') {
      const gitRoot = findGitRoot(process.cwd());
      if (gitRoot) {
        const found = findBrainfile(gitRoot);
        if (found) {
          defaultFile = found.absolutePath;
          console.error(`[brainfile-mcp] Found from git root: ${defaultFile}`);
        } else {
          const discovered = findNearestBrainfile(gitRoot);
          if (discovered) {
            defaultFile = discovered.absolutePath;
            console.error(`[brainfile-mcp] Discovered from git root: ${defaultFile}`);
          }
        }
      }
    }

    // Strategy 3: discovery from cwd
    if (defaultFile === 'brainfile.md') {
      const found = findBrainfile();
      if (found) {
        defaultFile = found.absolutePath;
        console.error(`[brainfile-mcp] Auto-discovered: ${defaultFile}`);
      } else {
        defaultFile = resolveBrainfilePath({ filePath: 'brainfile.md', startDir: process.cwd() });
        console.error(`[brainfile-mcp] No brainfile found, using: ${defaultFile}`);
      }
    }
  } else {
    // User specified a file - resolve it
    defaultFile = resolveBrainfilePath({ filePath: defaultFile, startDir: process.cwd() });
    console.error(`[brainfile-mcp] Using specified file: ${defaultFile}`);
  }

  assertV2Brainfile(defaultFile);

  const server = new McpServer({
    name: 'brainfile',
    version: '0.8.1'
  });

  registerListTasksTool(server, defaultFile);
  registerGetTaskTool(server, defaultFile);
  registerSearchTool(server, defaultFile);
  registerTaskAddTool(server, defaultFile);
  registerTaskMoveTool(server, defaultFile);
  registerTaskPatchTool(server, defaultFile);
  registerTaskDeleteTool(server, defaultFile);
  registerSubtaskTool(server, defaultFile);
  registerContractTool(server, defaultFile);
  registerTaskCompleteTool(server, defaultFile);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
