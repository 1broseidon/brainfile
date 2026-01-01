import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findColumnById,
  findColumnByName,
  findTaskById,
  addTask,
  setTaskContract,
  moveTask,
  deleteTask,
  patchTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  toggleSubtask,
  setSubtasksCompleted,
  setAllSubtasksCompleted,
  // Bulk operations
  moveTasks,
  patchTasks,
  deleteTasks,
  // Discovery
  findNearestBrainfile,
  findBrainfile,
  resolveBrainfilePath,
  type TaskInput,
  type TaskPatch,
  type Board
} from '@brainfile/core';
import { mcpCheckIncompleteSubtasks } from '../utils/errorHandler';
import { buildContract } from '../utils/contractSpec';
import { getEffectiveArchiveDestination, getArchiveConfig } from '../utils/config';
import { isGitHubAuthenticated, createGitHubIssue } from '../utils/github-auth';
import { isLinearAuthenticated, createLinearIssue, getLinearTeams } from '../utils/linear-auth';
import { formatTaskForGitHub, formatTaskForLinear } from '@brainfile/core';
import { pickupContract, deliverContract, validateContract } from '../lib/contractRunner';
import {
  archiveTaskToFile,
  loadArchivedTasks,
  restoreFromArchive,
  removeFromArchive,
  getArchivePath,
} from '../utils/archive';

interface McpOptions {
  file: string;
}

function resolveBrainfile(filePath: string): string {
  return path.resolve(filePath);
}

function readBoard(filePath: string): { board: Board; content: string } | { error: string } {
  const resolvedPath = resolveBrainfile(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return { error: `File not found: ${resolvedPath}` };
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);

  if (!result.board) {
    return { error: result.error || 'Failed to parse brainfile' };
  }

  return { board: result.board, content };
}

function writeBoard(filePath: string, board: Board): void {
  const resolvedPath = resolveBrainfile(filePath);
  const content = Brainfile.serialize(board);
  fs.writeFileSync(resolvedPath, content, 'utf-8');
}

/**
 * Find git repository root by walking up directory tree
 */
function findGitRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

export async function mcpCommand(options: McpOptions) {
  // Auto-discover brainfile if not specified
  let defaultFile = options.file;

  if (defaultFile === 'brainfile.md') {
    // Default value - try auto-discovery strategies

    // Strategy 1: Check WORKSPACE_FOLDER_PATHS env var (set by Cursor)
    const workspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
    if (workspacePaths) {
      // Can be colon-separated list of paths
      const paths = workspacePaths.split(':').filter(Boolean);
      for (const wsPath of paths) {
        const found = findBrainfile(wsPath);
        if (found) {
          defaultFile = found.absolutePath;
          console.error(`[brainfile-mcp] Found in workspace: ${defaultFile}`);
          break;
        }
        // Also try discovery from workspace root
        const discovered = findNearestBrainfile(wsPath);
        if (discovered) {
          defaultFile = discovered.absolutePath;
          console.error(`[brainfile-mcp] Discovered in workspace: ${defaultFile}`);
          break;
        }
      }
    }

    // Strategy 2: Check for git repo root and look for brainfile there
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

    // Strategy 3: If still default, try discovery from cwd
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

  const server = new McpServer({
    name: 'brainfile',
    version: '0.8.1'
  });

  // List tasks tool
  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description: 'List all tasks from the brainfile, optionally filtered by column or tag',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        column: z.string().optional().describe('Filter by column ID or name'),
        tag: z.string().optional().describe('Filter by tag')
      }
    },
    async ({ file, column, tag }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      let tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];

      for (const col of board.columns) {
        // Filter by column if specified
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const task of col.tasks) {
          // Filter by tag if specified
          if (tag && (!task.tags || !task.tags.includes(tag))) continue;

          tasks.push({
            id: task.id,
            title: task.title,
            column: col.title,
            priority: task.priority,
            tags: task.tags,
            assignee: task.assignee
          });
        }
      }

      const output = { tasks, count: tasks.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // Get task tool
  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Get detailed information about a specific task by ID',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to retrieve')
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const taskInfo = findTaskById(board, task);

      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      const output = {
        ...taskInfo.task,
        column: taskInfo.column.title,
        columnId: taskInfo.column.id
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // Search tasks tool
  server.registerTool(
    'search_tasks',
    {
      title: 'Search Tasks',
      description: 'Search tasks by title, description, or other fields',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        query: z.string().describe('Search query (matches title, description, tags)'),
        column: z.string().optional().describe('Filter by column ID or name'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
        assignee: z.string().optional().describe('Filter by assignee')
      }
    },
    async ({ file, query, column, priority, assignee }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const queryLower = query.toLowerCase();
      let matches: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string; score: number }> = [];

      for (const col of board.columns) {
        // Filter by column if specified
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const task of col.tasks) {
          // Filter by priority if specified
          if (priority && task.priority !== priority) continue;

          // Filter by assignee if specified
          if (assignee && task.assignee !== assignee) continue;

          // Calculate search score
          let score = 0;

          // Title match (highest weight)
          if (task.title.toLowerCase().includes(queryLower)) {
            score += 10;
            if (task.title.toLowerCase().startsWith(queryLower)) score += 5;
          }

          // Description match
          if (task.description?.toLowerCase().includes(queryLower)) {
            score += 5;
          }

          // Tag match
          if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) {
            score += 3;
          }

          // ID exact match
          if (task.id.toLowerCase() === queryLower) {
            score += 20;
          }

          if (score > 0) {
            matches.push({
              id: task.id,
              title: task.title,
              column: col.title,
              priority: task.priority,
              tags: task.tags,
              assignee: task.assignee,
              score
            });
          }
        }
      }

      // Sort by score descending
      matches.sort((a, b) => b.score - a.score);

      const output = { results: matches, count: matches.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // Add task tool
  server.registerTool(
    'add_task',
    {
      title: 'Add Task',
      description: 'Add a new task to a column in the brainfile',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        column: z.string().describe('Column ID or name to add task to'),
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
        tags: z.array(z.string()).optional().describe('Task tags'),
        assignee: z.string().optional().describe('Task assignee'),
        dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
        subtasks: z.array(z.string()).optional().describe('Subtask titles (IDs auto-generated)'),
        relatedFiles: z.array(z.string()).optional().describe('Related file paths'),
        // Contract creation (optional)
        with_contract: z.boolean().optional().describe('Attach a contract to the new task (status=ready)'),
        deliverables: z.array(z.string()).optional().describe('Contract deliverables: type:path:description'),
        validation_commands: z.array(z.string()).optional().describe('Contract validation commands'),
        constraints: z.array(z.string()).optional().describe('Contract constraints'),
        // Aliases (some clients prefer camelCase)
        withContract: z.boolean().optional().describe('Alias of with_contract'),
        validationCommands: z.array(z.string()).optional().describe('Alias of validation_commands'),
      }
    },
    async ({
      file,
      column,
      title,
      description,
      priority,
      tags,
      assignee,
      dueDate,
      subtasks,
      relatedFiles,
      with_contract,
      deliverables,
      validation_commands,
      constraints,
      withContract,
      validationCommands,
    }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find target column
      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        const available = board.columns.map(c => `${c.id} (${c.title})`).join(', ');
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}. Available: ${available}` }], isError: true };
      }

      const taskInput: TaskInput = {
        title,
        ...(description && { description }),
        ...(priority && { priority }),
        ...(tags && tags.length > 0 && { tags }),
        ...(assignee && { assignee }),
        ...(dueDate && { dueDate }),
        ...(subtasks && subtasks.length > 0 && { subtasks }),
        ...(relatedFiles && relatedFiles.length > 0 && { relatedFiles })
      };

      const addResult = addTask(board, targetColumn.id, taskInput);

      if (!addResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${addResult.error}` }], isError: true };
      }

      // Get the new task
      const newTask = addResult.board!.columns
        .find(c => c.id === targetColumn!.id)!
        .tasks.slice(-1)[0];

      // Optionally attach a contract (status=ready)
      const wantsContract =
        Boolean(with_contract ?? withContract) ||
        Boolean(deliverables && deliverables.length > 0) ||
        Boolean(validation_commands && validation_commands.length > 0) ||
        Boolean(validationCommands && validationCommands.length > 0) ||
        Boolean(constraints && constraints.length > 0);

      let nextBoard = addResult.board!;
      if (wantsContract) {
        try {
          const contract = buildContract({
            deliverableSpecs: deliverables,
            validationCommands: validation_commands ?? validationCommands,
            constraints,
          });

          const contractResult = setTaskContract(nextBoard, newTask.id, contract);
          if (!contractResult.success || !contractResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${contractResult.error || 'Failed to set contract'}` }], isError: true };
          }
          nextBoard = contractResult.board;
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      writeBoard(filePath, nextBoard);

      return {
        content: [{ type: 'text' as const, text: `Task added successfully: ${newTask.id} - ${newTask.title}` }]
      };
    }
  );

  // Attach contract tool
  server.registerTool(
    'attach_contract',
    {
      title: 'Attach Contract',
      description: 'Attach a new contract to an existing task (status=ready)',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().optional().describe('Task ID to attach contract to'),
        task_id: z.string().optional().describe('Alias of task'),
        deliverables: z.array(z.string()).optional().describe('Contract deliverables: type:path:description'),
        validation_commands: z.array(z.string()).optional().describe('Contract validation commands'),
        constraints: z.array(z.string()).optional().describe('Contract constraints'),
        validationCommands: z.array(z.string()).optional().describe('Alias of validation_commands'),
      }
    },
    async ({ file, task, task_id, deliverables, validation_commands, constraints, validationCommands }) => {
      const filePath = file || defaultFile;
      const resolvedTaskId = task || task_id;
      if (!resolvedTaskId) {
        return { content: [{ type: 'text' as const, text: 'Error: task is required' }], isError: true };
      }

      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;
      const taskInfo = findTaskById(board, resolvedTaskId);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${resolvedTaskId}` }], isError: true };
      }

      try {
        const contract = buildContract({
          deliverableSpecs: deliverables,
          validationCommands: validation_commands ?? validationCommands,
          constraints,
        });

        const contractResult = setTaskContract(board, resolvedTaskId, contract);
        if (!contractResult.success || !contractResult.board) {
          return { content: [{ type: 'text' as const, text: `Error: ${contractResult.error || 'Failed to attach contract'}` }], isError: true };
        }

        writeBoard(filePath, contractResult.board);
        return { content: [{ type: 'text' as const, text: `Contract attached: ${resolvedTaskId}` }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  // Move task tool
  server.registerTool(
    'move_task',
    {
      title: 'Move Task',
      description: 'Move a task to a different column',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to move'),
        column: z.string().describe('Target column ID or name')
      }
    },
    async ({ file, task, column }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find the task
      const taskInfo = findTaskById(board, task);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      // Find target column
      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
      }

      const moveResult = moveTask(board, task, taskInfo.column.id, targetColumn.id, targetColumn.tasks.length);

      if (!moveResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${moveResult.error}` }], isError: true };
      }

      writeBoard(filePath, moveResult.board!);

      // Check for incomplete subtasks warning when moving to done-like column
      const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
      let message = `Task ${task} moved from "${taskInfo.column.title}" to "${targetColumn.title}"`;
      if (warning) {
        message += `\n\n${warning.warning}`;
      }

      return {
        content: [{ type: 'text' as const, text: message }]
      };
    }
  );

  // Patch task tool
  server.registerTool(
    'patch_task',
    {
      title: 'Patch Task',
      description: 'Update specific fields of a task. Set fields to null to remove them.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to update'),
        title: z.string().optional().describe('New task title'),
        description: z.string().nullable().optional().describe('New description (null to remove)'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional().describe('New priority (null to remove)'),
        tags: z.array(z.string()).nullable().optional().describe('New tags (null to remove)'),
        assignee: z.string().nullable().optional().describe('New assignee (null to remove)'),
        dueDate: z.string().nullable().optional().describe('New due date (null to remove)'),
        relatedFiles: z.array(z.string()).nullable().optional().describe('Related file paths (null to remove)')
      }
    },
    async ({ file, task, title, description, priority, tags, assignee, dueDate, relatedFiles }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Helper to check for null or "null" string (MCP clients may send either)
      const isNull = (v: unknown) => v === null || v === 'null';

      const patch: TaskPatch = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = isNull(description) ? undefined : description;
      if (priority !== undefined) patch.priority = isNull(priority) ? undefined : priority;
      if (tags !== undefined) patch.tags = isNull(tags) ? undefined : tags;
      if (assignee !== undefined) patch.assignee = isNull(assignee) ? undefined : assignee;
      if (dueDate !== undefined) patch.dueDate = isNull(dueDate) ? undefined : dueDate;
      if (relatedFiles !== undefined) patch.relatedFiles = isNull(relatedFiles) ? undefined : relatedFiles;

      const patchResult = patchTask(board, task, patch);

      if (!patchResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${patchResult.error}` }], isError: true };
      }

      writeBoard(filePath, patchResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Task ${task} updated successfully` }]
      };
    }
  );

  // Delete task tool
  server.registerTool(
    'delete_task',
    {
      title: 'Delete Task',
      description: 'Permanently delete a task from the brainfile',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to delete')
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find the task to get its column
      const taskInfo = findTaskById(board, task);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      const deleteResult = deleteTask(board, taskInfo.column.id, task);

      if (!deleteResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteResult.error}` }], isError: true };
      }

      writeBoard(filePath, deleteResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Task ${task} deleted successfully` }]
      };
    }
  );

  // Archive task tool
  server.registerTool(
    'archive_task',
    {
      title: 'Archive Task',
      description: 'Archive a task locally or to an external service (GitHub Issues, Linear). If no destination is specified, uses the project default from brainfile.md, then user default from ~/.config/brainfile/config.json, then falls back to local.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to archive'),
        destination: z.enum(['local', 'github', 'linear']).optional().describe('Archive destination: local (default), github (creates closed issue), or linear (creates completed issue)')
      }
    },
    async ({ file, task, destination }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find the task to get its column
      const taskInfo = findTaskById(board, task);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      // Determine effective destination
      const brainfileDestination = (board as any).archive?.destination;
      const effectiveDestination = destination || getEffectiveArchiveDestination(brainfileDestination);

      // Handle local archive (to separate brainfile-archive.md file)
      if (effectiveDestination === 'local') {
        const archiveResult = archiveTaskToFile(filePath, board, taskInfo.column.id, task);

        if (!archiveResult.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${archiveResult.error}` }], isError: true };
        }

        const archivePath = getArchivePath(filePath);
        return {
          content: [{ type: 'text' as const, text: `Task ${task} archived to ${path.basename(archivePath)}` }]
        };
      }

      // Handle GitHub archive
      if (effectiveDestination === 'github') {
        // Check authentication
        if (!(await isGitHubAuthenticated())) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Not authenticated with GitHub.\n\nTo authenticate, run:\n  npx @brainfile/cli auth github\n\nOr fall back to local archive:\n  Use destination: "local"`
            }],
            isError: true
          };
        }

        // Check configuration
        const config = getArchiveConfig();
        if (!config.github?.owner || !config.github?.repo) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: GitHub repository not configured.\n\nTo configure, run:\n  npx @brainfile/cli config set archive.github.owner <owner>\n  npx @brainfile/cli config set archive.github.repo <repo>\n\nOr fall back to local archive:\n  Use destination: "local"`
            }],
            isError: true
          };
        }

        // Format and create GitHub issue
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
          return {
            content: [{ type: 'text' as const, text: `Error creating GitHub issue: ${ghResult.error}` }],
            isError: true
          };
        }

        // Remove task from board
        const deleteResult = deleteTask(board, taskInfo.column.id, task);
        if (deleteResult.success) {
          writeBoard(filePath, deleteResult.board!);
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Task ${task} archived to GitHub Issue #${ghResult.issueNumber} (closed)\n\nView: ${ghResult.issueUrl}`
          }]
        };
      }

      // Handle Linear archive
      if (effectiveDestination === 'linear') {
        // Check authentication
        if (!(await isLinearAuthenticated())) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Not authenticated with Linear.\n\nTo authenticate, run:\n  npx @brainfile/cli auth linear --token <api-key>\n\nGet your API key from: https://linear.app/settings/api\n\nOr fall back to local archive:\n  Use destination: "local"`
            }],
            isError: true
          };
        }

        // Check/get team configuration
        const config = getArchiveConfig();
        let teamId = config.linear?.teamId;

        if (!teamId) {
          const teams = await getLinearTeams();
          if (teams.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: No Linear teams found.\n\nVerify your authentication:\n  npx @brainfile/cli auth status`
              }],
              isError: true
            };
          }
          if (teams.length === 1) {
            teamId = teams[0].id;
          } else {
            const teamList = teams.map(t => `  ${t.key}: ${t.name} (${t.id})`).join('\n');
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Multiple Linear teams found. Please configure a default.\n\nAvailable teams:\n${teamList}\n\nTo configure, run:\n  npx @brainfile/cli config set archive.linear.teamId <team-id>\n\nOr fall back to local archive:\n  Use destination: "local"`
              }],
              isError: true
            };
          }
        }

        // Format and create Linear issue
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
          return {
            content: [{ type: 'text' as const, text: `Error creating Linear issue: ${linearResult.error}` }],
            isError: true
          };
        }

        // Remove task from board
        const deleteResult = deleteTask(board, taskInfo.column.id, task);
        if (deleteResult.success) {
          writeBoard(filePath, deleteResult.board!);
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Task ${task} archived to Linear Issue ${linearResult.issueId} (Done)\n\nView: ${linearResult.issueUrl}`
          }]
        };
      }

      return {
        content: [{ type: 'text' as const, text: `Error: Unknown destination: ${effectiveDestination}` }],
        isError: true
      };
    }
  );

  // Restore task tool
  server.registerTool(
    'restore_task',
    {
      title: 'Restore Task',
      description: 'Restore a task from the archive to a column',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to restore'),
        column: z.string().describe('Target column ID or name')
      }
    },
    async ({ file, task, column }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find target column
      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
      }

      // Restore from separate archive file
      const restoreResult = restoreFromArchive(filePath, task, targetColumn.id);

      if (!restoreResult.success) {
        // Provide helpful error if archive is empty
        const { tasks } = loadArchivedTasks(filePath);
        if (tasks.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `Error: Archive is empty (${path.basename(getArchivePath(filePath))})` }],
            isError: true
          };
        }
        return { content: [{ type: 'text' as const, text: `Error: ${restoreResult.error}` }], isError: true };
      }

      return {
        content: [{ type: 'text' as const, text: `Task ${task} restored to "${targetColumn.title}"` }]
      };
    }
  );

  // Add subtask tool
  server.registerTool(
    'add_subtask',
    {
      title: 'Add Subtask',
      description: 'Add a subtask to a task',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        title: z.string().describe('Subtask title')
      }
    },
    async ({ file, task, title }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const addResult = addSubtask(board, task, title);

      if (!addResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${addResult.error}` }], isError: true };
      }

      writeBoard(filePath, addResult.board!);

      // Get the new subtask ID
      const updatedTask = findTaskById(addResult.board!, task)!.task;
      const newSubtask = updatedTask.subtasks!.slice(-1)[0];

      return {
        content: [{ type: 'text' as const, text: `Subtask added: ${newSubtask.id} - ${newSubtask.title}` }]
      };
    }
  );

  // Delete subtask tool
  server.registerTool(
    'delete_subtask',
    {
      title: 'Delete Subtask',
      description: 'Delete a subtask from a task',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        subtask: z.string().describe('Subtask ID to delete')
      }
    },
    async ({ file, task, subtask }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const deleteResult = deleteSubtask(board, task, subtask);

      if (!deleteResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteResult.error}` }], isError: true };
      }

      writeBoard(filePath, deleteResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Subtask ${subtask} deleted successfully` }]
      };
    }
  );

  // Toggle subtask tool
  server.registerTool(
    'toggle_subtask',
    {
      title: 'Toggle Subtask',
      description: 'Toggle a subtask completion status',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        subtask: z.string().describe('Subtask ID to toggle')
      }
    },
    async ({ file, task, subtask }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Get current status
      const taskInfo = findTaskById(board, task);
      const currentSubtask = taskInfo?.task.subtasks?.find(st => st.id === subtask);
      const wasCompleted = currentSubtask?.completed || false;

      const toggleResult = toggleSubtask(board, task, subtask);

      if (!toggleResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${toggleResult.error}` }], isError: true };
      }

      writeBoard(filePath, toggleResult.board!);

      const newStatus = wasCompleted ? 'incomplete' : 'completed';
      return {
        content: [{ type: 'text' as const, text: `Subtask ${subtask} marked as ${newStatus}` }]
      };
    }
  );

  // Update subtask tool
  server.registerTool(
    'update_subtask',
    {
      title: 'Update Subtask',
      description: 'Update a subtask title',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        subtask: z.string().describe('Subtask ID to update'),
        title: z.string().describe('New subtask title')
      }
    },
    async ({ file, task, subtask, title }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const updateResult = updateSubtask(board, task, subtask, title);

      if (!updateResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${updateResult.error}` }], isError: true };
      }

      writeBoard(filePath, updateResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Subtask ${subtask} updated to "${title}"` }]
      };
    }
  );

  // Bulk set subtasks completed tool
  server.registerTool(
    'bulk_set_subtasks',
    {
      title: 'Bulk Set Subtasks',
      description: 'Set multiple subtasks to completed or incomplete in a single atomic operation',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        subtasks: z.array(z.string()).describe('Array of subtask IDs to update'),
        completed: z.boolean().describe('Whether to mark as completed (true) or incomplete (false)')
      }
    },
    async ({ file, task, subtasks, completed }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const bulkResult = setSubtasksCompleted(board, task, subtasks, completed);

      if (!bulkResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${bulkResult.error}` }], isError: true };
      }

      writeBoard(filePath, bulkResult.board!);

      const status = completed ? 'completed' : 'incomplete';
      return {
        content: [{ type: 'text' as const, text: `${subtasks.length} subtasks marked as ${status}` }]
      };
    }
  );

  // Complete all subtasks tool
  server.registerTool(
    'complete_all_subtasks',
    {
      title: 'Complete All Subtasks',
      description: 'Mark all subtasks in a task as completed or incomplete',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        completed: z.boolean().optional().default(true).describe('Whether to mark as completed (default: true) or incomplete (false)')
      }
    },
    async ({ file, task, completed }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Default to true if not specified
      const markCompleted = completed ?? true;

      const bulkResult = setAllSubtasksCompleted(board, task, markCompleted);

      if (!bulkResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${bulkResult.error}` }], isError: true };
      }

      writeBoard(filePath, bulkResult.board!);

      // Count subtasks for the message
      const taskInfo = findTaskById(bulkResult.board!, task);
      const count = taskInfo?.task.subtasks?.length || 0;

      const status = markCompleted ? 'completed' : 'incomplete';
      return {
        content: [{ type: 'text' as const, text: `All ${count} subtasks in ${task} marked as ${status}` }]
      };
    }
  );

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  // Bulk move tasks tool
  server.registerTool(
    'bulk_move_tasks',
    {
      title: 'Bulk Move Tasks',
      description: 'Move multiple tasks to a target column in a single operation',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        tasks: z.array(z.string()).describe('Array of task IDs to move'),
        column: z.string().describe('Target column ID or name')
      }
    },
    async ({ file, tasks, column }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find target column
      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
      }

      // Check for incomplete subtasks before move (for warning)
      const tasksWithIncomplete: Array<{ id: string; incomplete: number; total: number }> = [];
      for (const taskId of tasks) {
        const taskInfo = findTaskById(board, taskId);
        if (taskInfo) {
          const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
          if (warning?.incompleteSubtasks) {
            tasksWithIncomplete.push({
              id: taskId,
              incomplete: warning.incompleteSubtasks.incomplete.length,
              total: warning.incompleteSubtasks.total
            });
          }
        }
      }

      const bulkResult = moveTasks(board, tasks, targetColumn.id);

      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }

      const output: Record<string, unknown> = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results
      };

      // Add warning about incomplete subtasks if any
      if (tasksWithIncomplete.length > 0) {
        output.warning = `${tasksWithIncomplete.length} task(s) moved to "${targetColumn.title}" have incomplete subtasks`;
        output.tasksWithIncompleteSubtasks = tasksWithIncomplete;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success
      };
    }
  );

  // Bulk patch tasks tool
  server.registerTool(
    'bulk_patch_tasks',
    {
      title: 'Bulk Patch Tasks',
      description: 'Apply the same patch to multiple tasks in a single operation',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        tasks: z.array(z.string()).describe('Array of task IDs to patch'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional().describe('New priority (null to remove)'),
        tags: z.array(z.string()).nullable().optional().describe('New tags (null to remove)'),
        assignee: z.string().nullable().optional().describe('New assignee (null to remove)')
      }
    },
    async ({ file, tasks, priority, tags, assignee }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Helper to check for null or "null" string
      const isNull = (v: unknown) => v === null || v === 'null';

      const patch: TaskPatch = {};
      if (priority !== undefined) patch.priority = isNull(priority) ? undefined : priority;
      if (tags !== undefined) patch.tags = isNull(tags) ? undefined : tags;
      if (assignee !== undefined) patch.assignee = isNull(assignee) ? undefined : assignee;

      const bulkResult = patchTasks(board, tasks, patch);

      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }

      const output = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success
      };
    }
  );

  // Bulk delete tasks tool
  server.registerTool(
    'bulk_delete_tasks',
    {
      title: 'Bulk Delete Tasks',
      description: 'Permanently delete multiple tasks in a single operation',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        tasks: z.array(z.string()).describe('Array of task IDs to delete')
      }
    },
    async ({ file, tasks }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const bulkResult = deleteTasks(board, tasks);

      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }

      const output = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success
      };
    }
  );

  // Bulk archive tasks tool
  server.registerTool(
    'bulk_archive_tasks',
    {
      title: 'Bulk Archive Tasks',
      description: 'Archive multiple tasks to the separate archive file',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        tasks: z.array(z.string()).describe('Array of task IDs to archive')
      }
    },
    async ({ file, tasks }) => {
      const filePath = file || defaultFile;

      const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Archive each task individually (need to re-read board after each archive)
      for (const taskId of tasks) {
        const boardResult = readBoard(filePath);
        if ('error' in boardResult) {
          results.push({ taskId, success: false, error: boardResult.error });
          failureCount++;
          continue;
        }

        const { board } = boardResult;
        const taskInfo = findTaskById(board, taskId);

        if (!taskInfo) {
          results.push({ taskId, success: false, error: 'Task not found' });
          failureCount++;
          continue;
        }

        const archiveResult = archiveTaskToFile(filePath, board, taskInfo.column.id, taskId);

        if (archiveResult.success) {
          results.push({ taskId, success: true });
          successCount++;
        } else {
          results.push({ taskId, success: false, error: archiveResult.error });
          failureCount++;
        }
      }

      const output = {
        success: failureCount === 0,
        successCount,
        failureCount,
        results,
        archiveFile: path.basename(getArchivePath(filePath))
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: failureCount > 0 && successCount === 0
      };
    }
  );

  // ==========================================================================
  // CONTRACTS
  // ==========================================================================

  server.registerTool(
    'contract_pickup',
    {
      title: 'Contract Pickup',
      description: 'Claim a task contract (sets status to in_progress) and return agent context as markdown',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to pick up'),
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;
      const result = pickupContract({ filePath, taskId: task });
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: result.markdown }] };
    }
  );

  server.registerTool(
    'contract_deliver',
    {
      title: 'Contract Deliver',
      description: 'Mark a task contract as delivered (sets status to delivered)',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to deliver'),
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;
      const result = deliverContract({ filePath, taskId: task });
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: `Contract delivered: ${task}` }] };
    }
  );

  server.registerTool(
    'contract_validate',
    {
      title: 'Contract Validate',
      description: 'Validate contract deliverables + commands; sets status to done/failed',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to validate'),
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;
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
        isError: !result.ok
      };
    }
  );

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
