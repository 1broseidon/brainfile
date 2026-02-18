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
  // Rule operations
  addRule,
  deleteRule,
  // Discovery
  findNearestBrainfile,
  findBrainfile,
  resolveBrainfilePath,
  type TaskInput,
  type TaskPatch,
  type Board,
  type Rules,
} from '@brainfile/core';
import { mcpCheckIncompleteSubtasks } from '../utils/errorHandler';
import { buildContract } from '../utils/contractSpec';
import { validateType, validateColumn } from '../utils/strict-validation';
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

      // V2: search per-task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const queryLower = query.toLowerCase();
        let matches: Array<{ id: string; title: string; column?: string; priority?: string; tags?: string[]; assignee?: string; score: number; isLog?: boolean }> = [];

        const taskDocs = readTasksDir(dirs.boardDir);
        for (const doc of taskDocs) {
          const task = doc.task;
          if (column && task.column !== column) continue;
          if (priority && task.priority !== priority) continue;
          if (assignee && task.assignee !== assignee) continue;

          let score = 0;
          if (task.title.toLowerCase().includes(queryLower)) { score += 10; if (task.title.toLowerCase().startsWith(queryLower)) score += 5; }
          if (task.description?.toLowerCase().includes(queryLower)) score += 5;
          if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) score += 3;
          if (task.id.toLowerCase() === queryLower) score += 20;

          if (score > 0) {
            matches.push({ id: task.id, title: task.title, column: task.column, priority: task.priority, tags: task.tags, assignee: task.assignee, score });
          }
        }

        // Also search logs
        if (!column) {
          const logDocs = readTasksDir(dirs.logsDir);
          for (const doc of logDocs) {
            const task = doc.task;
            if (priority && task.priority !== priority) continue;
            if (assignee && task.assignee !== assignee) continue;

            let score = 0;
            if (task.title.toLowerCase().includes(queryLower)) { score += 10; if (task.title.toLowerCase().startsWith(queryLower)) score += 5; }
            if (task.description?.toLowerCase().includes(queryLower)) score += 5;
            if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) score += 3;
            if (task.id.toLowerCase() === queryLower) score += 20;

            if (score > 0) {
              matches.push({ id: task.id, title: task.title, column: 'Completed', priority: task.priority, tags: task.tags, assignee: task.assignee, score, isLog: true });
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
      const queryLower = query.toLowerCase();
      let matches: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string; score: number }> = [];

      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const task of col.tasks) {
          if (priority && task.priority !== priority) continue;
          if (assignee && task.assignee !== assignee) continue;

          let score = 0;
          if (task.title.toLowerCase().includes(queryLower)) { score += 10; if (task.title.toLowerCase().startsWith(queryLower)) score += 5; }
          if (task.description?.toLowerCase().includes(queryLower)) score += 5;
          if (task.tags?.some(t => t.toLowerCase().includes(queryLower))) score += 3;
          if (task.id.toLowerCase() === queryLower) score += 20;

          if (score > 0) {
            matches.push({ id: task.id, title: task.title, column: col.title, priority: task.priority, tags: task.tags, assignee: task.assignee, score });
          }
        }
      }

      matches.sort((a, b) => b.score - a.score);
      const output = { results: matches, count: matches.length };
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
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
        type: z.string().optional().describe('Document type (e.g., epic, adr). Determines ID prefix. Default: task'),
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
      type: docType,
      with_contract,
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

          // Optionally attach contract
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, resolvedTaskId);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${resolvedTaskId}` }], isError: true };
        }

        try {
          const contract = buildContract({
            deliverableSpecs: deliverables,
            validationCommands: validation_commands ?? validationCommands,
            constraints,
          });

          found.doc.task.contract = contract;
          found.doc.task.updatedAt = new Date().toISOString();
          coreWriteTaskFile(found.filePath, found.doc.task, found.doc.body);
          return { content: [{ type: 'text' as const, text: `Contract attached: ${resolvedTaskId}` }] };
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

      // V2: update task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const taskPath = path.join(dirs.boardDir, taskFileName(task));
        const doc = coreReadTaskFile(taskPath);
        if (!doc) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

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

        const sourceColumn = doc.task.column || '';
        const targetTasks = readTasksDir(dirs.boardDir).filter(t => t.task.column === resolvedTargetColumn.id);
        doc.task.column = resolvedTargetColumn.id;
        doc.task.position = targetTasks.length;
        doc.task.updatedAt = new Date().toISOString();
        coreWriteTaskFile(taskPath, doc.task, doc.body);

        const shouldAutoComplete = resolvedTargetColumn.completionColumn === true && isTaskCompletable(doc.task.type, (board as unknown as Record<string, unknown>).types);
        if (shouldAutoComplete) {
          const completeResult = coreCompleteTaskFile(taskPath, dirs.logsDir);
          if (!completeResult.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${completeResult.error || `Failed to complete task: ${task}`}` }], isError: true };
          }
        }

        const warning = mcpCheckIncompleteSubtasks(doc.task, resolvedTargetColumn);
        let message = `Task ${task} moved from "${sourceColumn}" to "${resolvedTargetColumn.title}"`;
        if (shouldAutoComplete) {
          message += '\nTask auto-completed and moved to logs/.';
        }
        if (warning) message += `\n\n${warning.warning}`;

        return { content: [{ type: 'text' as const, text: message }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;
      const taskInfo = findTaskById(board, task);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

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

      const isNull = (v: unknown) => v === null || v === 'null';

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const taskPath = path.join(dirs.boardDir, taskFileName(task));
        const doc = coreReadTaskFile(taskPath);
        if (!doc) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
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
        return { content: [{ type: 'text' as const, text: `Task ${task} updated successfully` }] };
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

      // V2: archive means move task from board/ to logs/
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        // Determine effective destination
        const board = readV2BoardConfig(filePath);
        const brainfileDestination = (board as any).archive?.destination;
        const effectiveDestination = destination || getEffectiveArchiveDestination(brainfileDestination);

        // For GitHub/Linear, format and send before removing
        if (effectiveDestination === 'github') {
          if (!(await isGitHubAuthenticated())) {
            return { content: [{ type: 'text' as const, text: `Error: Not authenticated with GitHub.\n\nTo authenticate, run:\n  npx @brainfile/cli auth github\n\nOr fall back to local archive:\n  Use destination: "local"` }], isError: true };
          }
          const config = getArchiveConfig();
          if (!config.github?.owner || !config.github?.repo) {
            return { content: [{ type: 'text' as const, text: `Error: GitHub repository not configured.\n\nTo configure, run:\n  npx @brainfile/cli config set archive.github.owner <owner>\n  npx @brainfile/cli config set archive.github.repo <repo>` }], isError: true };
          }
          const payload = formatTaskForGitHub(found.doc.task, {
            includeMeta: true, includeSubtasks: true, includeRelatedFiles: true,
            boardTitle: board.title, fromColumn: found.doc.task.column || 'unknown',
            extraLabels: config.github.labels,
          });
          const ghResult = await createGitHubIssue({ owner: config.github.owner, repo: config.github.repo, title: payload.title, body: payload.body, labels: payload.labels, state: 'closed' });
          if (!ghResult.success) {
            return { content: [{ type: 'text' as const, text: `Error creating GitHub issue: ${ghResult.error}` }], isError: true };
          }
          fs.unlinkSync(found.filePath);
          return { content: [{ type: 'text' as const, text: `Task ${task} archived to GitHub Issue #${ghResult.issueNumber} (closed)\n\nView: ${ghResult.issueUrl}` }] };
        }

        if (effectiveDestination === 'linear') {
          if (!(await isLinearAuthenticated())) {
            return { content: [{ type: 'text' as const, text: `Error: Not authenticated with Linear.\n\nTo authenticate, run:\n  npx @brainfile/cli auth linear --token <api-key>` }], isError: true };
          }
          const config = getArchiveConfig();
          let teamId = config.linear?.teamId;
          if (!teamId) {
            const teams = await getLinearTeams();
            if (teams.length === 0) { return { content: [{ type: 'text' as const, text: `Error: No Linear teams found.` }], isError: true }; }
            if (teams.length === 1) { teamId = teams[0].id; }
            else {
              const teamList = teams.map(t => `  ${t.key}: ${t.name} (${t.id})`).join('\n');
              return { content: [{ type: 'text' as const, text: `Error: Multiple Linear teams found. Please configure a default.\n\nAvailable teams:\n${teamList}` }], isError: true };
            }
          }
          const payload = formatTaskForLinear(found.doc.task, {
            includeMeta: true, includeSubtasks: true, includeRelatedFiles: true,
            boardTitle: board.title, fromColumn: found.doc.task.column || 'unknown', stateName: 'Done',
          });
          const linearResult = await createLinearIssue({ teamId, title: payload.title, description: payload.description, priority: payload.priority, labelNames: payload.labelNames, stateName: 'Done' });
          if (!linearResult.success) {
            return { content: [{ type: 'text' as const, text: `Error creating Linear issue: ${linearResult.error}` }], isError: true };
          }
          fs.unlinkSync(found.filePath);
          return { content: [{ type: 'text' as const, text: `Task ${task} archived to Linear Issue ${linearResult.issueId} (Done)\n\nView: ${linearResult.issueUrl}` }] };
        }

        // Local archive: move from board/ to logs/
        const logPath = path.join(dirs.logsDir, taskFileName(task));
        found.doc.task.completedAt = found.doc.task.completedAt || new Date().toISOString();
        delete found.doc.task.column;
        delete found.doc.task.position;
        coreWriteTaskFile(logPath, found.doc.task, found.doc.body);
        fs.unlinkSync(found.filePath);
        return { content: [{ type: 'text' as const, text: `Task ${task} archived to logs/` }] };
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

      // V2: restore means move from logs/ to board/
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const board = readV2BoardConfig(filePath);

        let targetColumn = board.columns.find(c => c.id === column);
        if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
        if (!targetColumn) {
          return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
        }

        // Look in logs
        const logPath = path.join(dirs.logsDir, taskFileName(task));
        const doc = coreReadTaskFile(logPath);
        if (!doc) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found in logs: ${task}` }], isError: true };
        }

        // Move to board/ with column info
        const targetTasks = readTasksDir(dirs.boardDir).filter(t => t.task.column === targetColumn!.id);
        doc.task.column = targetColumn.id;
        doc.task.position = targetTasks.length;
        delete doc.task.completedAt;
        doc.task.updatedAt = new Date().toISOString();

        const taskPath = path.join(dirs.boardDir, taskFileName(task));
        coreWriteTaskFile(taskPath, doc.task, doc.body);
        fs.unlinkSync(logPath);

        return { content: [{ type: 'text' as const, text: `Task ${task} restored to "${targetColumn.title}"` }] };
      }

      // V1: use board
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        if (!t.subtasks) t.subtasks = [];
        const nextId = t.subtasks.length > 0
          ? `${task}-${Math.max(...t.subtasks.map(s => parseInt(s.id.split('-').pop() || '0', 10))) + 1}`
          : `${task}-1`;
        const newSubtask = { id: nextId, title, completed: false };
        t.subtasks.push(newSubtask);
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        return { content: [{ type: 'text' as const, text: `Subtask added: ${newSubtask.id} - ${newSubtask.title}` }] };
      }

      // V1: use board
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        if (!t.subtasks || !t.subtasks.some(s => s.id === subtask)) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${subtask}` }], isError: true };
        }

        t.subtasks = t.subtasks.filter(s => s.id !== subtask);
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        return { content: [{ type: 'text' as const, text: `Subtask ${subtask} deleted successfully` }] };
      }

      // V1: use board
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        const st = t.subtasks?.find(s => s.id === subtask);
        if (!st) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${subtask}` }], isError: true };
        }

        const wasCompleted = st.completed;
        st.completed = !st.completed;
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        const newStatus = wasCompleted ? 'incomplete' : 'completed';
        return { content: [{ type: 'text' as const, text: `Subtask ${subtask} marked as ${newStatus}` }] };
      }

      // V1: use board
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        const st = t.subtasks?.find(s => s.id === subtask);
        if (!st) {
          return { content: [{ type: 'text' as const, text: `Error: Subtask not found: ${subtask}` }], isError: true };
        }

        st.title = title;
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        return { content: [{ type: 'text' as const, text: `Subtask ${subtask} updated to "${title}"` }] };
      }

      // V1: use board
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        if (!t.subtasks) {
          return { content: [{ type: 'text' as const, text: `Error: Task has no subtasks` }], isError: true };
        }

        const subtaskSet = new Set(subtasks);
        for (const st of t.subtasks) {
          if (subtaskSet.has(st.id)) {
            st.completed = completed;
          }
        }
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        const status = completed ? 'completed' : 'incomplete';
        return { content: [{ type: 'text' as const, text: `${subtasks.length} subtasks marked as ${status}` }] };
      }

      // V1: use board
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
      const markCompleted = completed ?? true;

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        const t = found.doc.task;
        const count = t.subtasks?.length || 0;
        if (t.subtasks) {
          for (const st of t.subtasks) {
            st.completed = markCompleted;
          }
        }
        t.updatedAt = new Date().toISOString();
        coreWriteTaskFile(found.filePath, t, found.doc.body);

        const status = markCompleted ? 'completed' : 'incomplete';
        return { content: [{ type: 'text' as const, text: `All ${count} subtasks in ${task} marked as ${status}` }] };
      }

      // V1: use board
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

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

      // V2: update each task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const board = readV2BoardConfig(filePath);

        let targetColumn = board.columns.find(c => c.id === column);
        if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
        if (!targetColumn) {
          return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
        }

        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
        let successCount = 0;
        let failureCount = 0;

        for (const taskId of tasks) {
          const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId, success: false, error: 'Task not found' });
            failureCount++;
            continue;
          }

          doc.task.column = targetColumn.id;
          doc.task.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, doc.task, doc.body);
          results.push({ taskId, success: true });
          successCount++;
        }

        const output = { success: failureCount === 0, successCount, failureCount, results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], isError: failureCount > 0 && successCount === 0 };
      }

      // V1: use board
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

      const isNull = (v: unknown) => v === null || v === 'null';

      // V2: update each task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
        let successCount = 0;
        let failureCount = 0;

        for (const taskId of tasks) {
          const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId, success: false, error: 'Task not found' });
            failureCount++;
            continue;
          }

          const t = doc.task;
          if (priority !== undefined) { if (isNull(priority)) delete t.priority; else t.priority = priority as any; }
          if (tags !== undefined) { if (isNull(tags)) delete t.tags; else t.tags = tags as string[]; }
          if (assignee !== undefined) { if (isNull(assignee)) delete t.assignee; else t.assignee = assignee as string; }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, t, doc.body);
          results.push({ taskId, success: true });
          successCount++;
        }

        const output = { success: failureCount === 0, successCount, failureCount, results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], isError: failureCount > 0 && successCount === 0 };
      }

      // V1: use board
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

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

      // V2: delete task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
        let successCount = 0;
        let failureCount = 0;

        for (const taskId of tasks) {
          const found = findV2Task(dirs, taskId, true);
          if (!found) {
            results.push({ taskId, success: false, error: 'Task not found' });
            failureCount++;
            continue;
          }
          try {
            fs.unlinkSync(found.filePath);
            results.push({ taskId, success: true });
            successCount++;
          } catch (e) {
            results.push({ taskId, success: false, error: (e as Error).message });
            failureCount++;
          }
        }

        const output = { success: failureCount === 0, successCount, failureCount, results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], isError: failureCount > 0 && successCount === 0 };
      }

      // V1: use board
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

      // V2: move task files from board/ to logs/
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
        let successCount = 0;
        let failureCount = 0;

        for (const taskId of tasks) {
          const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId, success: false, error: 'Task not found' });
            failureCount++;
            continue;
          }

          try {
            const logPath = path.join(dirs.logsDir, taskFileName(taskId));
            doc.task.completedAt = doc.task.completedAt || new Date().toISOString();
            delete doc.task.column;
            delete doc.task.position;
            coreWriteTaskFile(logPath, doc.task, doc.body);
            fs.unlinkSync(taskPath);
            results.push({ taskId, success: true });
            successCount++;
          } catch (e) {
            results.push({ taskId, success: false, error: (e as Error).message });
            failureCount++;
          }
        }

        const output = { success: failureCount === 0, successCount, failureCount, results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }], isError: failureCount > 0 && successCount === 0 };
      }

      // V1: use board
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

  // ==========================================================================
  // TYPES
  // ==========================================================================

  server.registerTool(
    'list_types',
    {
      title: 'List Types',
      description: 'List board strict mode and custom type configuration',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
      }
    },
    async ({ file }) => {
      const filePath = file || defaultFile;

      if (isV2(filePath)) {
        try {
          const board = readV2BoardConfig(filePath);
          const boardConfig = board as unknown as Record<string, unknown>;
          const output = {
            strict: boardConfig.strict === true,
            types: sanitizeTypesConfig(boardConfig.types),
          };

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
          };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const boardConfig = result.board as unknown as Record<string, unknown>;
      const strict = boardConfig.strict === true;
      const types = sanitizeTypesConfig(boardConfig.types);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ strict, types }, null, 2)
        }]
      };
    }
  );

  // ==========================================================================
  // RULES
  // ==========================================================================

  // List rules tool
  server.registerTool(
    'list_rules',
    {
      title: 'List Rules',
      description: 'List all project rules (always, never, prefer, context) from the brainfile',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        category: z.enum(['always', 'never', 'prefer', 'context']).optional().describe('Filter by rule category')
      }
    },
    async ({ file, category }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const rules = board.rules || {};

      // Filter by category if specified
      let outputRules: Rules = rules;
      if (category) {
        outputRules = { [category]: rules[category] || [] } as Rules;
      }

      // Count total rules
      const countRules = (r: Rules) =>
        (r.always?.length || 0) +
        (r.never?.length || 0) +
        (r.prefer?.length || 0) +
        (r.context?.length || 0);

      const output = {
        rules: outputRules,
        totalCount: category
          ? (outputRules[category]?.length || 0)
          : countRules(rules),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // Add rule tool
  server.registerTool(
    'add_rule',
    {
      title: 'Add Rule',
      description: 'Add a new project rule to the brainfile',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        category: z.enum(['always', 'never', 'prefer', 'context']).describe('Rule category'),
        text: z.string().describe('Rule text/description')
      }
    },
    async ({ file, category, text }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const addResult = addRule(board, category, text);

      if (!addResult.success || !addResult.board) {
        return { content: [{ type: 'text' as const, text: `Error: ${addResult.error}` }], isError: true };
      }

      writeBoard(filePath, addResult.board);

      // Find the newly added rule (last one in the category)
      const newRules = addResult.board.rules?.[category] || [];
      const newRule = newRules[newRules.length - 1];

      const output = {
        success: true,
        category,
        rule: newRule,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // Delete rule tool
  server.registerTool(
    'delete_rule',
    {
      title: 'Delete Rule',
      description: 'Delete a project rule from the brainfile by category and ID',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        category: z.enum(['always', 'never', 'prefer', 'context']).describe('Rule category'),
        id: z.number().describe('Rule ID to delete')
      }
    },
    async ({ file, category, id }) => {
      const filePath = file || defaultFile;
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      // Find the rule being deleted for the response
      const existingRules = board.rules?.[category] || [];
      const ruleToDelete = existingRules.find((r: { id: number; rule: string }) => r.id === id);

      if (!ruleToDelete) {
        const availableIds = existingRules.map((r: { id: number }) => r.id).join(', ');
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Rule ${id} not found in ${category}. ${availableIds ? `Available IDs: ${availableIds}` : `No rules in ${category} category`}`
          }],
          isError: true
        };
      }

      const deleteResult = deleteRule(board, category, id);

      if (!deleteResult.success || !deleteResult.board) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteResult.error}` }], isError: true };
      }

      writeBoard(filePath, deleteResult.board);

      const output = {
        success: true,
        category,
        deletedRule: ruleToDelete,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );

  // ==========================================================================
  // V2 NEW TOOLS: complete_task, search_logs, append_log
  // ==========================================================================

  // Complete task tool
  server.registerTool(
    'complete_task',
    {
      title: 'Complete Task',
      description: 'Complete a task - in v2, moves task file from board/ to logs/ with completedAt timestamp. In v1, moves to done column.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to complete'),
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;

      try {
        const { completeCommand } = await import('./complete');
        const result = completeCommand({ file: filePath, task }, { log: () => {}, warn: () => {}, error: () => {}, info: () => {} });
        return {
          content: [{ type: 'text' as const, text: `Task ${task} completed at ${result.completedAt}` }]
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  // Search logs tool
  server.registerTool(
    'search_logs',
    {
      title: 'Search Logs',
      description: 'Search across completed task logs. Requires v2 per-task file architecture.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        query: z.string().optional().describe('Search query to match against log content'),
        recent: z.boolean().optional().describe('List recently completed tasks'),
        task: z.string().optional().describe('View a specific task log'),
      }
    },
    async ({ file, query, recent, task: taskId }) => {
      const filePath = file || defaultFile;

      if (!isV2(filePath)) {
        return { content: [{ type: 'text' as const, text: 'Error: search_logs requires v2 per-task file architecture. Run: brainfile migrate --v2' }], isError: true };
      }

      const dirs = getV2Dirs(filePath);

      // View specific task log
      if (taskId) {
        const found = findV2Task(dirs, taskId, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${taskId}` }], isError: true };
        }
        const output = {
          id: found.doc.task.id,
          title: found.doc.task.title,
          completedAt: found.doc.task.completedAt,
          description: extractDescription(found.doc.body),
          log: extractLog(found.doc.body),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      // Search logs
      if (query) {
        const logDocs = readTasksDir(dirs.logsDir);
        const queryLower = query.toLowerCase();
        const matches: Array<{ id: string; title: string; completedAt?: string }> = [];

        for (const doc of logDocs) {
          const task = doc.task;
          const desc = extractDescription(doc.body) || '';
          const log = extractLog(doc.body) || '';
          const fullText = [task.title, task.description || '', desc, log].join(' ').toLowerCase();
          if (fullText.includes(queryLower)) {
            matches.push({ id: task.id, title: task.title, completedAt: task.completedAt });
          }
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
      }

      // Recent logs (default)
      const logDocs = readTasksDir(dirs.logsDir);
      logDocs.sort((a, b) => (b.task.completedAt || '').localeCompare(a.task.completedAt || ''));
      const recent20 = logDocs.slice(0, 20).map(doc => ({
        id: doc.task.id,
        title: doc.task.title,
        completedAt: doc.task.completedAt,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ logs: recent20, count: recent20.length }, null, 2) }] };
    }
  );

  // Append log tool
  server.registerTool(
    'append_log',
    {
      title: 'Append Log',
      description: 'Append a timestamped entry to a task log section. Works on both active tasks and completed logs. Requires v2 per-task file architecture.',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to append log to'),
        message: z.string().describe('Log message to append'),
        agent: z.string().optional().describe('Agent name for attribution'),
      }
    },
    async ({ file, task: taskId, message, agent }) => {
      const filePath = file || defaultFile;

      if (!isV2(filePath)) {
        return { content: [{ type: 'text' as const, text: 'Error: append_log requires v2 per-task file architecture. Run: brainfile migrate --v2' }], isError: true };
      }

      const dirs = getV2Dirs(filePath);
      const found = findV2Task(dirs, taskId, true);
      if (!found) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${taskId}` }], isError: true };
      }

      const { doc, filePath: taskFilePath } = found;
      const timestamp = new Date().toISOString();
      const agentPrefix = agent ? `[${agent}] ` : '';
      const entry = `- ${timestamp}: ${agentPrefix}${message}`;

      const existingDescription = extractDescription(doc.body);
      const existingLog = extractLog(doc.body) || '';
      const newLog = existingLog ? `${existingLog}\n${entry}` : entry;
      const newBody = composeBody(existingDescription, newLog);
      coreWriteTaskFile(taskFilePath, doc.task, newBody);

      return { content: [{ type: 'text' as const, text: `Log entry added to ${taskId}: ${entry}` }] };
    }
  );

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
