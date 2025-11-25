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
  moveTask,
  deleteTask,
  archiveTask,
  restoreTask,
  patchTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  toggleSubtask,
  type TaskInput,
  type TaskPatch,
  type Board
} from '@brainfile/core';

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

export async function mcpCommand(options: McpOptions) {
  const defaultFile = options.file;

  const server = new McpServer({
    name: 'brainfile',
    version: '0.6.5'
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
        subtasks: z.array(z.string()).optional().describe('Subtask titles (IDs auto-generated)')
      }
    },
    async ({ file, column, title, description, priority, tags, assignee, dueDate, subtasks }) => {
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
        ...(subtasks && subtasks.length > 0 && { subtasks })
      };

      const addResult = addTask(board, targetColumn.id, taskInput);

      if (!addResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${addResult.error}` }], isError: true };
      }

      writeBoard(filePath, addResult.board!);

      // Get the new task
      const newTask = addResult.board!.columns
        .find(c => c.id === targetColumn!.id)!
        .tasks.slice(-1)[0];

      return {
        content: [{ type: 'text' as const, text: `Task added successfully: ${newTask.id} - ${newTask.title}` }]
      };
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

      return {
        content: [{ type: 'text' as const, text: `Task ${task} moved from "${taskInfo.column.title}" to "${targetColumn.title}"` }]
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
        dueDate: z.string().nullable().optional().describe('New due date (null to remove)')
      }
    },
    async ({ file, task, title, description, priority, tags, assignee, dueDate }) => {
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
      description: 'Move a task to the archive',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to archive')
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

      const archiveResult = archiveTask(board, taskInfo.column.id, task);

      if (!archiveResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${archiveResult.error}` }], isError: true };
      }

      writeBoard(filePath, archiveResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Task ${task} archived successfully` }]
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

      const restoreResult = restoreTask(board, task, targetColumn.id);

      if (!restoreResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${restoreResult.error}` }], isError: true };
      }

      writeBoard(filePath, restoreResult.board!);

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

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
