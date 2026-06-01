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
  // Discovery
  findNearestBrainfile,
  findBrainfile,
  resolveBrainfilePath,
  type TaskInput,
  type Task,
  type TaskPatch,
  type Board,
} from '@brainfile/core';
import { mcpCheckIncompleteSubtasks } from '../utils/errorHandler';
import { buildContract } from '../utils/contractSpec';
import { validateType, validateColumn } from '../utils/strict-validation';
import { getArchiveConfig } from '../utils/config';
import { isGitHubAuthenticated, createGitHubIssue } from '../utils/github-auth';
import { isLinearAuthenticated, createLinearIssue, getLinearTeams } from '../utils/linear-auth';
import { formatTaskForGitHub, formatTaskForLinear } from '@brainfile/core';
import { pickupContract, deliverContract, validateContract } from '../lib/contractRunner';
import { executeContractGraphMcpAction } from '../mcp/tools/contract';
import {
  archiveTaskToFile,
  getArchivePath,
} from '../utils/archive';
import {
  readTaskFile as coreReadTaskFile,
  writeTaskFile as coreWriteTaskFile,
  readTasksDir,
  completeTaskFile as coreCompleteTaskFile,
  taskFileName,
  generateNextFileTaskId,
  type TaskDocument,
} from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  buildBoardFromV2,
  findV2Task,
  readV2BoardConfig,
  ensureV2Dirs,
  extractDescription,
  extractLog,
  composeBody,
} from '../utils/v2-detect';

interface McpOptions {
  file: string;
}

interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

type TypesConfig = Record<string, TypeEntry>;

function sanitizeTypesConfig(raw: unknown): TypesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const out: TypesConfig = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const idPrefix = typeof entry.idPrefix === 'string' && entry.idPrefix.trim()
      ? entry.idPrefix.trim()
      : name;

    const normalized: TypeEntry = { idPrefix };
    if (typeof entry.completable === 'boolean') normalized.completable = entry.completable;
    if (typeof entry.schema === 'string' && entry.schema.trim()) normalized.schema = entry.schema.trim();

    out[name] = normalized;
  }

  return out;
}

function isTaskCompletable(taskType: string | undefined, rawTypes: unknown): boolean {
  const resolvedType = taskType || 'task';
  if (resolvedType === 'task') {
    return true;
  }

  const types = sanitizeTypesConfig(rawTypes);
  const typeConfig = types[resolvedType];
  return typeConfig?.completable !== false;
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

function mcpStructuredError(message: string, field: string, value: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(
        { error: { code: 'VALIDATION_ERROR', message, field, value } },
        null,
        2
      )
    }],
    isError: true
  };
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
        tag: z.string().optional().describe('Filter by tag'),
        type: z.string().optional().describe('Filter by document type (e.g., epic, adr). Only returns tasks matching this type.'),
      }
    },
    async ({ file, column, tag, type: filterType }) => {
      const filePath = file || defaultFile;

      // V2: use per-task files
      if (isV2(filePath)) {
        const board = buildBoardFromV2(filePath);
        let tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];
        for (const col of board.columns) {
          if (column) {
            const matchesId = col.id === column;
            const matchesName = col.title.toLowerCase() === column.toLowerCase();
            if (!matchesId && !matchesName) continue;
          }
          for (const task of col.tasks) {
            if (tag && (!task.tags || !task.tags.includes(tag))) continue;
            // Filter by type: match explicit type field, or treat missing/undefined as "task"
            if (filterType) {
              const taskType = task.type || 'task';
              if (taskType !== filterType) continue;
            }
            tasks.push({ id: task.id, title: task.title, column: col.title, priority: task.priority, tags: task.tags, assignee: task.assignee });
          }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ tasks, count: tasks.length }, null, 2) }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      let tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];

      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const task of col.tasks) {
          if (tag && (!task.tags || !task.tags.includes(tag))) continue;
          // Filter by type: match explicit type field, or treat missing/undefined as "task"
          if (filterType) {
            const taskType = task.type || 'task';
            if (taskType !== filterType) continue;
          }

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

      // V2: use per-task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const { doc, isLog } = found;
        const description = extractDescription(doc.body);
        const output = {
          ...doc.task,
          ...(description && !doc.task.description && { description }),
          column: isLog ? 'Completed' : (doc.task.column || 'unknown'),
          ...(isLog && { archived: true }),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      // V1: use board
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

  // Search tool (tasks + logs)
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search tasks and logs by query, list recent logs, or view one task/log entry',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        query: z.string().optional().describe('Search query (matches title, description, tags, and log text in v2)'),
        column: z.string().optional().describe('Filter by column ID or name'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
        assignee: z.string().optional().describe('Filter by assignee'),
        recent: z.boolean().optional().describe('List recently completed tasks (v2 only)'),
        task: z.string().optional().describe('View a specific task/log entry (v2 only)'),
      }
    },
    async ({ file, query, column, priority, assignee, recent, task }) => {
      const filePath = file || defaultFile;

      if (task) {
        if (!isV2(filePath)) {
          return { content: [{ type: 'text' as const, text: 'Error: task lookup in search requires v2 per-task file architecture.' }], isError: true };
        }
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const output = {
          id: found.doc.task.id,
          title: found.doc.task.title,
          completedAt: found.doc.task.completedAt,
          isLog: found.isLog,
          description: extractDescription(found.doc.body),
          log: extractLog(found.doc.body),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      if (recent) {
        if (!isV2(filePath)) {
          return { content: [{ type: 'text' as const, text: 'Error: recent log listing requires v2 per-task file architecture.' }], isError: true };
        }
        const dirs = getV2Dirs(filePath);
        const logDocs = readTasksDir(dirs.logsDir);
        logDocs.sort((a, b) => (b.task.completedAt || '').localeCompare(a.task.completedAt || ''));
        const logs = logDocs.slice(0, 20).map(doc => ({
          id: doc.task.id,
          title: doc.task.title,
          completedAt: doc.task.completedAt,
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify({ logs, count: logs.length }, null, 2) }] };
      }

      if (!query) {
        return { content: [{ type: 'text' as const, text: 'Error: query is required unless recent or task is provided' }], isError: true };
      }

      const queryLower = query.toLowerCase();

      // V2: search per-task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const matches: Array<{ id: string; title: string; column?: string; priority?: string; tags?: string[]; assignee?: string; score: number; isLog?: boolean }> = [];

        const scoreDoc = (doc: TaskDocument, includeLogText: boolean): number => {
          const t = doc.task;
          let score = 0;
          if (t.title.toLowerCase().includes(queryLower)) {
            score += 10;
            if (t.title.toLowerCase().startsWith(queryLower)) score += 5;
          }
          if (t.description?.toLowerCase().includes(queryLower)) score += 5;
          if (extractDescription(doc.body)?.toLowerCase().includes(queryLower)) score += 5;
          if (t.tags?.some(tag => tag.toLowerCase().includes(queryLower))) score += 3;
          if (includeLogText && extractLog(doc.body)?.toLowerCase().includes(queryLower)) score += 2;
          if (t.id.toLowerCase() === queryLower) score += 20;
          return score;
        };

        const taskDocs = readTasksDir(dirs.boardDir);
        for (const doc of taskDocs) {
          const t = doc.task;
          if (column && t.column !== column) continue;
          if (priority && t.priority !== priority) continue;
          if (assignee && t.assignee !== assignee) continue;

          const score = scoreDoc(doc, false);
          if (score > 0) {
            matches.push({ id: t.id, title: t.title, column: t.column, priority: t.priority, tags: t.tags, assignee: t.assignee, score });
          }
        }

        if (!column) {
          const logDocs = readTasksDir(dirs.logsDir);
          for (const doc of logDocs) {
            const t = doc.task;
            if (priority && t.priority !== priority) continue;
            if (assignee && t.assignee !== assignee) continue;

            const score = scoreDoc(doc, true);
            if (score > 0) {
              matches.push({ id: t.id, title: t.title, column: 'Completed', priority: t.priority, tags: t.tags, assignee: t.assignee, score, isLog: true });
            }
          }
        }

        matches.sort((a, b) => b.score - a.score);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const matches: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string; score: number }> = [];

      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const t of col.tasks) {
          if (priority && t.priority !== priority) continue;
          if (assignee && t.assignee !== assignee) continue;

          let score = 0;
          if (t.title.toLowerCase().includes(queryLower)) {
            score += 10;
            if (t.title.toLowerCase().startsWith(queryLower)) score += 5;
          }
          if (t.description?.toLowerCase().includes(queryLower)) score += 5;
          if (t.tags?.some(tag => tag.toLowerCase().includes(queryLower))) score += 3;
          if (t.id.toLowerCase() === queryLower) score += 20;

          if (score > 0) {
            matches.push({ id: t.id, title: t.title, column: col.title, priority: t.priority, tags: t.tags, assignee: t.assignee, score });
          }
        }
      }

      matches.sort((a, b) => b.score - a.score);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
    }
  );

  // Add task tool
  server.registerTool(
    'task_add',
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
        type: z.string().optional().describe('Document type (e.g., epic, adr). Determines ID prefix. Default: task'),
        // Contract creation (optional)
        with_contract: z.boolean().optional().describe('Attach a contract to the new task (default status=draft; use ready:true to make immediately dispatchable)'),
        ready: z.boolean().optional().describe('When true, contract status is set to ready instead of draft'),
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
      type: docType,
      with_contract,
      ready: contractReady,
      deliverables,
      validation_commands,
      constraints,
      withContract,
      validationCommands,
    }) => {
      const filePath = file || defaultFile;

      // V2: add task as individual file
      if (isV2(filePath)) {
        try {
          const dirs = ensureV2Dirs(filePath);
          const board = readV2BoardConfig(filePath);
          const typePrefix = docType || 'task';
          const typeValidation = validateType(board, typePrefix);
          if (!typeValidation.valid) {
            return mcpStructuredError(
              typeValidation.error || `Invalid type: ${typePrefix}`,
              'type',
              typePrefix
            );
          }

          let targetColumn = board.columns.find(c => c.id === column);
          if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
          if (!targetColumn) {
            const available = board.columns.map(c => `${c.id} (${c.title})`).join(', ');
            return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}. Available: ${available}` }], isError: true };
          }

          const taskId = generateNextFileTaskId(dirs.boardDir, dirs.logsDir, typePrefix);
          const existingTasks = readTasksDir(dirs.boardDir).filter(t => t.task.column === targetColumn!.id);
          const position = existingTasks.length;

          const builtSubtasks = subtasks && subtasks.length > 0
            ? subtasks.map((st: string, i: number) => ({ id: `${taskId}-${i + 1}`, title: st.trim(), completed: false }))
            : undefined;

          const task: any = {
            id: taskId,
            title,
            ...(docType && docType !== 'task' && { type: docType }),
            column: targetColumn.id,
            position,
            ...(description && { description }),
            ...(priority && { priority }),
            ...(tags && tags.length > 0 && { tags }),
            ...(assignee && { assignee }),
            ...(dueDate && { dueDate }),
            ...(relatedFiles && relatedFiles.length > 0 && { relatedFiles }),
            ...(builtSubtasks && { subtasks: builtSubtasks }),
            createdAt: new Date().toISOString(),
          };

          // Optionally attach contract (default status=draft; ready:true → status=ready)
          const wantsContract =
            Boolean(with_contract ?? withContract) ||
            Boolean(deliverables && deliverables.length > 0) ||
            Boolean(validation_commands && validation_commands.length > 0) ||
            Boolean(validationCommands && validationCommands.length > 0) ||
            Boolean(constraints && constraints.length > 0);

          if (wantsContract) {
            const contract = buildContract({
              deliverableSpecs: deliverables,
              validationCommands: validation_commands ?? validationCommands,
              constraints,
              status: contractReady ? 'ready' : 'draft',
            });
            task.contract = contract;
          }

          const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
          const body = description ? composeBody(description) : '';
          coreWriteTaskFile(taskPath, task, body);

          return { content: [{ type: 'text' as const, text: `Task added successfully: ${taskId} - ${title}` }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

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

      const newTask = addResult.board!.columns
        .find(c => c.id === targetColumn!.id)!
        .tasks.slice(-1)[0];

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
            status: contractReady ? 'ready' : 'draft',
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

  // Move task tool
  server.registerTool(
    'task_move',
    {
      title: 'Move Task',
      description: 'Move a task to a different column',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        taskId: z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs to move'),
        task: z.string().optional().describe('Alias of taskId for single task move'),
        column: z.string().describe('Target column ID or name')
      }
    },
    async ({ file, taskId, task, column }) => {
      const filePath = file || defaultFile;
      const rawTaskIds = taskId ?? task;
      if (!rawTaskIds) {
        return { content: [{ type: 'text' as const, text: 'Error: taskId is required' }], isError: true };
      }
      const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds];
      const isBatch = taskIds.length > 1;

      // V2: update task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const board = readV2BoardConfig(filePath);
        let targetColumn = board.columns.find(c => c.id === column);
        if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
        const targetColumnId = targetColumn?.id || column;
        const columnValidation = validateColumn(board, targetColumnId);
        if (!columnValidation.valid) {
          return mcpStructuredError(
            columnValidation.error || `Invalid column: ${targetColumnId}`,
            'column',
            targetColumnId
          );
        }
        const resolvedTargetColumn = targetColumn || { id: column, title: column, tasks: [] };
        let nextPosition = readTasksDir(dirs.boardDir).filter(t => t.task.column === resolvedTargetColumn.id).length;
        const results: Array<{ taskId: string; success: boolean; message?: string; warning?: string; error?: string }> = [];

        for (const id of taskIds) {
          const taskPath = path.join(dirs.boardDir, taskFileName(id));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId: id, success: false, error: `Task not found: ${id}` });
            continue;
          }

          const sourceColumn = doc.task.column || '';
          doc.task.column = resolvedTargetColumn.id;
          doc.task.position = nextPosition++;
          doc.task.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, doc.task, doc.body);

          const shouldAutoComplete =
            resolvedTargetColumn.completionColumn === true &&
            isTaskCompletable(doc.task.type, (board as unknown as Record<string, unknown>).types);
          if (shouldAutoComplete) {
            const completeResult = coreCompleteTaskFile(taskPath, dirs.logsDir);
            if (!completeResult.success) {
              results.push({ taskId: id, success: false, error: completeResult.error || `Failed to complete task: ${id}` });
              continue;
            }
          }

          const warning = mcpCheckIncompleteSubtasks(doc.task, resolvedTargetColumn);
          let message = `Task ${id} moved from "${sourceColumn}" to "${resolvedTargetColumn.title}"`;
          if (shouldAutoComplete) {
            message += '\nTask auto-completed and moved to logs/.';
          }
          results.push({ taskId: id, success: true, message, warning: warning?.warning });
        }

        if (!isBatch) {
          const single = results[0];
          if (!single?.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Move failed'}` }], isError: true };
          }
          let text = single.message || `Task ${taskIds[0]} moved`;
          if (single.warning) text += `\n\n${single.warning}`;
          return { content: [{ type: 'text' as const, text }] };
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        const output = { success: failureCount === 0, successCount, failureCount, results };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          isError: failureCount > 0 && successCount === 0,
        };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;

      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
      }

      if (!isBatch) {
        const id = taskIds[0];
        const taskInfo = findTaskById(board, id);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${id}` }], isError: true };
        }

        const moveResult = moveTask(board, id, taskInfo.column.id, targetColumn.id, targetColumn.tasks.length);
        if (!moveResult.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${moveResult.error}` }], isError: true };
        }
        writeBoard(filePath, moveResult.board!);

        const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
        let message = `Task ${id} moved from "${taskInfo.column.title}" to "${targetColumn.title}"`;
        if (warning) message += `\n\n${warning.warning}`;
        return { content: [{ type: 'text' as const, text: message }] };
      }

      const tasksWithIncomplete: Array<{ id: string; incomplete: number; total: number }> = [];
      for (const id of taskIds) {
        const taskInfo = findTaskById(board, id);
        if (taskInfo) {
          const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
          if (warning?.incompleteSubtasks) {
            tasksWithIncomplete.push({
              id,
              incomplete: warning.incompleteSubtasks.incomplete.length,
              total: warning.incompleteSubtasks.total,
            });
          }
        }
      }

      const bulkResult = moveTasks(board, taskIds, targetColumn.id);
      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }

      const output: Record<string, unknown> = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results,
      };
      if (tasksWithIncomplete.length > 0) {
        output.warning = `${tasksWithIncomplete.length} task(s) moved to "${targetColumn.title}" have incomplete subtasks`;
        output.tasksWithIncompleteSubtasks = tasksWithIncomplete;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success,
      };
    }
  );

  // Patch task tool
  server.registerTool(
    'task_patch',
    {
      title: 'Patch Task',
      description: 'Update specific fields of a task. Set fields to null to remove them.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        taskId: z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs to update'),
        task: z.string().optional().describe('Alias of taskId for single task update'),
        title: z.string().optional().describe('New task title'),
        description: z.string().nullable().optional().describe('New description (null to remove)'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional().describe('New priority (null to remove)'),
        tags: z.array(z.string()).nullable().optional().describe('New tags (null to remove)'),
        assignee: z.string().nullable().optional().describe('New assignee (null to remove)'),
        dueDate: z.string().nullable().optional().describe('New due date (null to remove)'),
        relatedFiles: z.array(z.string()).nullable().optional().describe('Related file paths (null to remove)')
      }
    },
    async ({ file, taskId, task, title, description, priority, tags, assignee, dueDate, relatedFiles }) => {
      const filePath = file || defaultFile;
      const rawTaskIds = taskId ?? task;
      if (!rawTaskIds) {
        return { content: [{ type: 'text' as const, text: 'Error: taskId is required' }], isError: true };
      }
      const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds];
      const isBatch = taskIds.length > 1;

      const isNull = (v: unknown) => v === null || v === 'null';

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

        for (const id of taskIds) {
          const taskPath = path.join(dirs.boardDir, taskFileName(id));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId: id, success: false, error: 'Task not found' });
            continue;
          }

          const t = doc.task;
          if (title !== undefined) t.title = title;
          if (description !== undefined) { if (isNull(description)) delete t.description; else t.description = description as string; }
          if (priority !== undefined) { if (isNull(priority)) delete t.priority; else t.priority = priority as any; }
          if (tags !== undefined) { if (isNull(tags)) delete t.tags; else t.tags = tags as string[]; }
          if (assignee !== undefined) { if (isNull(assignee)) delete t.assignee; else t.assignee = assignee as string; }
          if (dueDate !== undefined) { if (isNull(dueDate)) delete t.dueDate; else t.dueDate = dueDate as string; }
          if (relatedFiles !== undefined) { if (isNull(relatedFiles)) delete t.relatedFiles; else t.relatedFiles = relatedFiles as string[]; }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, t, doc.body);
          results.push({ taskId: id, success: true });
        }

        if (!isBatch) {
          const single = results[0];
          if (!single?.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Task not found'}` }], isError: true };
          }
          return { content: [{ type: 'text' as const, text: `Task ${taskIds[0]} updated successfully` }] };
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        const output = { success: failureCount === 0, successCount, failureCount, results };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          isError: failureCount > 0 && successCount === 0,
        };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const patch: TaskPatch = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = isNull(description) ? undefined : description;
      if (priority !== undefined) patch.priority = isNull(priority) ? undefined : priority;
      if (tags !== undefined) patch.tags = isNull(tags) ? undefined : tags;
      if (assignee !== undefined) patch.assignee = isNull(assignee) ? undefined : assignee;
      if (dueDate !== undefined) patch.dueDate = isNull(dueDate) ? undefined : dueDate;
      if (relatedFiles !== undefined) patch.relatedFiles = isNull(relatedFiles) ? undefined : relatedFiles;

      if (!isBatch) {
        const id = taskIds[0];
        const patchResult = patchTask(board, id, patch);
        if (!patchResult.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${patchResult.error}` }], isError: true };
        }
        writeBoard(filePath, patchResult.board!);
        return { content: [{ type: 'text' as const, text: `Task ${id} updated successfully` }] };
      }

      const bulkResult = patchTasks(board, taskIds, patch);
      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }
      const output = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success,
      };
    }
  );

  // Delete task tool
  server.registerTool(
    'task_delete',
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

      // V2: delete task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        try {
          fs.unlinkSync(found.filePath);
          return { content: [{ type: 'text' as const, text: `Task ${task} deleted successfully` }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      // V1: use board
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

  // Unified subtask tool (action-based)
  server.registerTool(
    'subtask',
    {
      title: 'Subtask',
      description: 'Unified subtask tool for add/toggle/delete/update with single, array, or all targeting',
      inputSchema: {
        action: z.enum(['add', 'toggle', 'delete', 'update']).describe('Subtask action'),
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Parent task ID'),
        subtask: z.string().optional().describe('Single subtask title/id depending on action'),
        subtasks: z.array(z.string()).optional().describe('Subtask titles/ids depending on action'),
        title: z.string().optional().describe('New title for update action'),
        titles: z.array(z.string()).optional().describe('Optional titles for batch update action'),
        completed: z.boolean().optional().describe('For toggle action: set explicit completed state (true/false) instead of flipping'),
        all: z.boolean().optional().describe('For toggle/delete action: target all subtasks in the task'),
      }
    },
    async ({ action, file, task, subtask, subtasks, title, titles, completed, all }) => {
      const filePath = file || defaultFile;
      const listParam = subtasks ?? (subtask ? [subtask] : []);
      const useAll = all === true;

      const resolveUpdateTitles = (ids: string[]): { ok: true; values: string[] } | { ok: false; error: string } => {
        if (titles && titles.length > 0) {
          if (titles.length !== ids.length && titles.length !== 1) {
            return { ok: false, error: 'titles length must match subtasks length (or provide a single title to apply to all)' };
          }
          const values = titles.length === 1 ? ids.map(() => titles[0]) : titles;
          return { ok: true, values };
        }
        if (title !== undefined) {
          return { ok: true, values: ids.map(() => title) };
        }
        return { ok: false, error: 'title or titles is required for action=update' };
      };

      // ── add ────────────────────────────────────────────────────────────────
      if (action === 'add') {
        const titlesToAdd = listParam.map(value => value.trim()).filter(Boolean);
        if (titlesToAdd.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=add' }], isError: true };
        }

        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }

          const t = found.doc.task;
          if (!t.subtasks) t.subtasks = [];
          let nextIndex = t.subtasks.length > 0
            ? Math.max(...t.subtasks.map(st => parseInt(st.id.split('-').pop() || '0', 10))) + 1
            : 1;

          const added: Array<{ id: string; title: string }> = [];
          for (const value of titlesToAdd) {
            const id = `${task}-${nextIndex++}`;
            const newSubtask = { id, title: value, completed: false };
            t.subtasks.push(newSubtask);
            added.push({ id: newSubtask.id, title: newSubtask.title });
          }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(found.filePath, t, found.doc.body);

          if (added.length === 1) {
            return { content: [{ type: 'text' as const, text: `Subtask added: ${added[0].id} - ${added[0].title}` }] };
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ added, count: added.length }, null, 2) }] };
        }

        const result = readBoard(filePath);
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        let board = result.board;
        const added: Array<{ id: string; title: string }> = [];

        for (const value of titlesToAdd) {
          const addResult = addSubtask(board, task, value);
          if (!addResult.success || !addResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${addResult.error}` }], isError: true };
          }
          board = addResult.board;
          const updatedTask = findTaskById(board, task)?.task;
          const created = updatedTask?.subtasks?.slice(-1)[0];
          if (created) added.push({ id: created.id, title: created.title });
        }

        writeBoard(filePath, board);
        if (added.length === 1) {
          return { content: [{ type: 'text' as const, text: `Subtask added: ${added[0].id} - ${added[0].title}` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ added, count: added.length }, null, 2) }] };
      }

      // ── delete ─────────────────────────────────────────────────────────────
      if (action === 'delete') {
        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const t = found.doc.task;
          if (!t.subtasks || t.subtasks.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
          }

          const targetIds = useAll ? t.subtasks.map(st => st.id) : listParam;
          if (targetIds.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=delete (unless all=true)' }], isError: true };
          }

          const existing = new Set(t.subtasks.map(st => st.id));
          const deleted = targetIds.filter(id => existing.has(id));
          const missing = targetIds.filter(id => !existing.has(id));
          if (deleted.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
          }

          const deleteSet = new Set(deleted);
          t.subtasks = t.subtasks.filter(st => !deleteSet.has(st.id));
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(found.filePath, t, found.doc.body);

          if (!useAll && deleted.length === 1 && missing.length === 0) {
            return { content: [{ type: 'text' as const, text: `Subtask ${deleted[0]} deleted successfully` }] };
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted, missing, count: deleted.length }, null, 2) }] };
        }

        const result = readBoard(filePath);
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        let board = result.board;
        const taskInfo = findTaskById(board, task);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const targetIds = useAll ? (taskInfo.task.subtasks || []).map(st => st.id) : listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=delete (unless all=true)' }], isError: true };
        }

        const deleted: string[] = [];
        const missing: string[] = [];
        for (const id of targetIds) {
          const deleteResult = deleteSubtask(board, task, id);
          if (!deleteResult.success || !deleteResult.board) {
            missing.push(id);
            continue;
          }
          board = deleteResult.board;
          deleted.push(id);
        }
        if (deleted.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }
        writeBoard(filePath, board);
        if (!useAll && deleted.length === 1 && missing.length === 0) {
          return { content: [{ type: 'text' as const, text: `Subtask ${deleted[0]} deleted successfully` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted, missing, count: deleted.length }, null, 2) }] };
      }

      // ── toggle ─────────────────────────────────────────────────────────────
      if (action === 'toggle') {
        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const t = found.doc.task;
          if (!t.subtasks || t.subtasks.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
          }

          const targetIds = useAll ? t.subtasks.map(st => st.id) : listParam;
          if (targetIds.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=toggle (unless all=true)' }], isError: true };
          }

          const targetSet = new Set(targetIds);
          const updated: Array<{ id: string; completed: boolean }> = [];
          for (const st of t.subtasks) {
            if (!targetSet.has(st.id)) continue;
            st.completed = completed !== undefined ? completed : !st.completed;
            updated.push({ id: st.id, completed: st.completed });
          }
          if (updated.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
          }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(found.filePath, t, found.doc.body);

          if (!useAll && updated.length === 1) {
            const status = updated[0].completed ? 'completed' : 'incomplete';
            return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} marked as ${status}` }] };
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
        }

        const result = readBoard(filePath);
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        let board = result.board;
        const taskInfo = findTaskById(board, task);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const targetIds = useAll ? (taskInfo.task.subtasks || []).map(st => st.id) : listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=toggle (unless all=true)' }], isError: true };
        }

        const updated: Array<{ id: string; completed: boolean }> = [];
        if (useAll && completed !== undefined) {
          const setResult = setAllSubtasksCompleted(board, task, completed);
          if (!setResult.success || !setResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${setResult.error}` }], isError: true };
          }
          board = setResult.board;
          const updatedTask = findTaskById(board, task)?.task;
          for (const st of updatedTask?.subtasks || []) {
            updated.push({ id: st.id, completed: st.completed });
          }
        } else if (completed !== undefined && targetIds.length > 0) {
          const setResult = setSubtasksCompleted(board, task, targetIds, completed);
          if (!setResult.success || !setResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${setResult.error}` }], isError: true };
          }
          board = setResult.board;
          const updatedTask = findTaskById(board, task)?.task;
          const targetSet = new Set(targetIds);
          for (const st of updatedTask?.subtasks || []) {
            if (targetSet.has(st.id)) updated.push({ id: st.id, completed: st.completed });
          }
        } else {
          for (const id of targetIds) {
            const toggleResult = toggleSubtask(board, task, id);
            if (!toggleResult.success || !toggleResult.board) {
              continue;
            }
            board = toggleResult.board;
            const st = findTaskById(board, task)?.task.subtasks?.find(entry => entry.id === id);
            if (st) updated.push({ id: st.id, completed: st.completed });
          }
        }

        if (updated.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }
        writeBoard(filePath, board);

        if (!useAll && updated.length === 1) {
          const status = updated[0].completed ? 'completed' : 'incomplete';
          return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} marked as ${status}` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
      }

      // ── update ─────────────────────────────────────────────────────────────
      if (action === 'update') {
        const targetIds = listParam;
        if (targetIds.length === 0) {
          return { content: [{ type: 'text' as const, text: 'Error: subtask or subtasks is required for action=update' }], isError: true };
        }
        const resolvedTitles = resolveUpdateTitles(targetIds);
        if (!resolvedTitles.ok) {
          return { content: [{ type: 'text' as const, text: `Error: ${resolvedTitles.error}` }], isError: true };
        }

        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          const t = found.doc.task;
          if (!t.subtasks || t.subtasks.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
          }

          const updates = new Map<string, string>();
          targetIds.forEach((id, i) => updates.set(id, resolvedTitles.values[i]));
          const updated: Array<{ id: string; title: string }> = [];
          for (const st of t.subtasks) {
            const nextTitle = updates.get(st.id);
            if (nextTitle === undefined) continue;
            st.title = nextTitle;
            updated.push({ id: st.id, title: st.title });
          }
          if (updated.length === 0) {
            return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
          }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(found.filePath, t, found.doc.body);

          if (updated.length === 1) {
            return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} updated to "${updated[0].title}"` }] };
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
        }

        const result = readBoard(filePath);
        if ('error' in result) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
        }
        let board = result.board;
        const updated: Array<{ id: string; title: string }> = [];

        targetIds.forEach((id, idx) => {
          const updateResult = updateSubtask(board, task, id, resolvedTitles.values[idx]);
          if (!updateResult.success || !updateResult.board) return;
          board = updateResult.board;
          const st = findTaskById(board, task)?.task.subtasks?.find(entry => entry.id === id);
          if (st) updated.push({ id: st.id, title: st.title });
        });

        if (updated.length === 0) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${targetIds.join(', ')}` }], isError: true };
        }
        writeBoard(filePath, board);
        if (updated.length === 1) {
          return { content: [{ type: 'text' as const, text: `Subtask ${updated[0].id} updated to "${updated[0].title}"` }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ updated, count: updated.length }, null, 2) }] };
      }

      return { content: [{ type: 'text' as const, text: `Error: Unknown action: ${action}` }], isError: true };
    }
  );

  // Unified contract tool (action-based)
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
      inputSchema: {
        action: z.enum(['attach', 'pickup', 'deliver', 'validate', 'graph', 'activate']).describe('Contract action'),
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().optional().describe('Task ID (required for attach, pickup, deliver, validate, and single-task activate)'),
        parentId: z.string().optional().describe('For activate: activate all draft contracts whose parentId matches this value'),
        // attach fields
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
      }
    },
    async ({ action, file, task, parentId, ready: attachReady, deliverables, validation_commands, constraints, tasks, activate }) => {
      const filePath = file || defaultFile;

      // ── attach ─────────────────────────────────────────────────────────────
      if (action === 'attach') {
        if (!task) {
          return { content: [{ type: 'text' as const, text: 'Error: task is required for action=attach' }], isError: true };
        }

        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);
          const found = findV2Task(dirs, task);
          if (!found) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          try {
            const contract = buildContract({
              deliverableSpecs: deliverables,
              validationCommands: validation_commands,
              constraints,
              status: attachReady ? 'ready' : 'draft',
            });
            found.doc.task.contract = contract;
            found.doc.task.updatedAt = new Date().toISOString();
            coreWriteTaskFile(found.filePath, found.doc.task, found.doc.body);
            return { content: [{ type: 'text' as const, text: `Contract attached (${contract.status}): ${task}` }] };
          } catch (e) {
            return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
          }
        }

        const readResult = readBoard(filePath);
        if ('error' in readResult) {
          return { content: [{ type: 'text' as const, text: `Error: ${readResult.error}` }], isError: true };
        }
        const taskInfo = findTaskById(readResult.board, task);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        try {
          const contract = buildContract({
            deliverableSpecs: deliverables,
            validationCommands: validation_commands,
            constraints,
            status: attachReady ? 'ready' : 'draft',
          });
          const contractResult = setTaskContract(readResult.board, task, contract);
          if (!contractResult.success || !contractResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${contractResult.error || 'Failed to attach contract'}` }], isError: true };
          }
          writeBoard(filePath, contractResult.board);
          return { content: [{ type: 'text' as const, text: `Contract attached (${contract.status}): ${task}` }] };
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

        const activated: string[] = [];

        if (isV2(filePath)) {
          const dirs = getV2Dirs(filePath);

          if (task) {
            const found = findV2Task(dirs, task, false);
            if (!found || found.isLog) {
              return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
            }
            if (!found.doc.task.contract) {
              return { content: [{ type: 'text' as const, text: `Error: Task ${task} has no contract` }], isError: true };
            }
            if (found.doc.task.contract.status !== 'draft') {
              return { content: [{ type: 'text' as const, text: `Error: Contract is not in draft status (current: ${found.doc.task.contract.status})` }], isError: true };
            }
            const readyAt = new Date().toISOString();
            found.doc.task.contract = {
              ...found.doc.task.contract,
              status: 'ready',
              metrics: ({
                ...(found.doc.task.contract.metrics ?? {}),
                readyAt,
              } as NonNullable<NonNullable<Task['contract']>['metrics']>),
            };
            found.doc.task.updatedAt = readyAt;
            coreWriteTaskFile(found.filePath, found.doc.task, found.doc.body);
            activated.push(task);
          } else {
            // Bulk by parentId
            const allTasks = readTasksDir(dirs.boardDir);
            for (const doc of allTasks) {
              const t = doc.task as any;
              if (t.parentId !== parentId) continue;
              if (!t.contract || t.contract.status !== 'draft') continue;
              const readyAt = new Date().toISOString();
              t.contract = {
                ...t.contract,
                status: 'ready',
                metrics: ({
                  ...(t.contract.metrics ?? {}),
                  readyAt,
                } as NonNullable<NonNullable<Task['contract']>['metrics']>),
              };
              t.updatedAt = readyAt;
              coreWriteTaskFile(path.join(dirs.boardDir, taskFileName(t.id)), t, doc.body);
              activated.push(t.id);
            }
          }

          const output = { activated, count: activated.length };
          return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
        }

        // V1
        const readResult = readBoard(filePath);
        if ('error' in readResult) {
          return { content: [{ type: 'text' as const, text: `Error: ${readResult.error}` }], isError: true };
        }
        let board = readResult.board;

        if (task) {
          const taskInfo = findTaskById(board, task);
          if (!taskInfo) {
            return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
          }
          if (!taskInfo.task.contract) {
            return { content: [{ type: 'text' as const, text: `Error: Task ${task} has no contract` }], isError: true };
          }
          if (taskInfo.task.contract.status !== 'draft') {
            return { content: [{ type: 'text' as const, text: `Error: Contract is not in draft status (current: ${taskInfo.task.contract.status})` }], isError: true };
          }
          const readyAt = new Date().toISOString();
          const updatedContract = {
            ...taskInfo.task.contract,
            status: 'ready' as const,
            metrics: ({
              ...(taskInfo.task.contract.metrics ?? {}),
              readyAt,
            } as NonNullable<NonNullable<Task['contract']>['metrics']>),
          };
          const contractResult = setTaskContract(board, task, updatedContract);
          if (!contractResult.success || !contractResult.board) {
            return { content: [{ type: 'text' as const, text: `Error: ${contractResult.error || 'Failed to activate contract'}` }], isError: true };
          }
          board = contractResult.board;
          activated.push(task);
        } else {
          // Bulk by parentId
          for (const col of board.columns) {
            for (const t of col.tasks) {
              const taskAny = t as any;
              if (taskAny.parentId !== parentId) continue;
              if (!t.contract || t.contract.status !== 'draft') continue;
              const readyAt = new Date().toISOString();
              const updatedContract = {
                ...t.contract,
                status: 'ready' as const,
                metrics: ({
                  ...(t.contract.metrics ?? {}),
                  readyAt,
                } as NonNullable<NonNullable<Task['contract']>['metrics']>),
              };
              const contractResult = setTaskContract(board, t.id, updatedContract);
              if (contractResult.success && contractResult.board) {
                board = contractResult.board;
                activated.push(t.id);
              }
            }
          }
        }

        writeBoard(filePath, board);
        const output = { activated, count: activated.length };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      return { content: [{ type: 'text' as const, text: `Error: Unknown action: ${action}` }], isError: true };
    }
  );

  // Task complete tool (also supports archive destinations)
  server.registerTool(
    'task_complete',
    {
      title: 'Complete Task',
      description: 'Complete a task or archive it to local/GitHub/Linear destination',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to complete'),
        destination: z.enum(['local', 'github', 'linear']).optional().describe('Optional archive destination. If omitted, performs normal completion flow.'),
      }
    },
    async ({ file, task, destination }) => {
      const filePath = file || defaultFile;

      try {
        // Default behavior: normal complete flow (v2 -> logs, v1 -> done column)
        if (!destination) {
          const { completeCommand } = await import('./complete');
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

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
