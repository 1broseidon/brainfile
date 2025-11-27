/**
 * TUI Actions - Wrappers around @brainfile/core operations
 *
 * All actions read/write the brainfile directly. The file watcher
 * in useBrainfileLoader will detect changes and refresh the UI.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import {
  Brainfile,
  findTaskById,
  findColumnById,
  findColumnByName,
  moveTask,
  deleteTask,
  patchTask,
  toggleSubtask,
  addTask,
  archiveTask,
  type Board,
  type Task,
  type TaskPatch,
  type TaskInput,
} from '@brainfile/core';

export interface ActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Read and parse the brainfile
 */
function readBrainfile(filePath: string): { board: Board | null; content: string; error?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);
    if (!result.board) {
      return { board: null, content, error: result.error || 'Failed to parse brainfile' };
    }
    return { board: result.board, content };
  } catch (err) {
    return { board: null, content: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Write the board back to the brainfile
 */
function writeBrainfile(filePath: string, board: Board): ActionResult {
  try {
    const content = Brainfile.serialize(board);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Move a task to a different column
 */
export function moveTaskAction(
  filePath: string,
  taskId: string,
  targetColumnId: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const targetColumn = findColumnById(board, targetColumnId) || findColumnByName(board, targetColumnId);
  if (!targetColumn) return { success: false, error: `Column ${targetColumnId} not found` };

  if (taskInfo.column.id === targetColumn.id) {
    return { success: true, message: 'Task already in this column' };
  }

  const result = moveTask(board, taskId, taskInfo.column.id, targetColumn.id, targetColumn.tasks.length);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Moved to ${targetColumn.title}` };
}

/**
 * Delete a task permanently
 */
export function deleteTaskAction(filePath: string, taskId: string): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const result = deleteTask(board, taskInfo.column.id, taskId);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Deleted ${taskId}` };
}

/**
 * Archive a task
 */
export function archiveTaskAction(filePath: string, taskId: string): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const result = archiveTask(board, taskInfo.column.id, taskId);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Archived ${taskId}` };
}

/**
 * Patch/update task fields
 */
export function patchTaskAction(
  filePath: string,
  taskId: string,
  patch: TaskPatch
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const result = patchTask(board, taskId, patch);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Updated ${taskId}` };
}

/**
 * Cycle task priority: none -> low -> medium -> high -> critical -> none
 */
export function cyclePriorityAction(filePath: string, taskId: string): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const priorities = [undefined, 'low', 'medium', 'high', 'critical'] as const;
  const currentIndex = priorities.indexOf(taskInfo.task.priority as typeof priorities[number]);
  const nextIndex = (currentIndex + 1) % priorities.length;
  const nextPriority = priorities[nextIndex];

  const patch: TaskPatch = { priority: nextPriority || null };
  const result = patchTask(board, taskId, patch);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Priority: ${nextPriority || 'none'}` };
}

/**
 * Toggle a subtask's completion status
 */
export function toggleSubtaskAction(
  filePath: string,
  taskId: string,
  subtaskId: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const result = toggleSubtask(board, taskId, subtaskId);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Toggled ${subtaskId}` };
}

/**
 * Add a new task to a column (quick add - title only)
 */
export function addTaskAction(
  filePath: string,
  columnId: string,
  taskInput: TaskInput
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const column = findColumnById(board, columnId) || findColumnByName(board, columnId);
  if (!column) return { success: false, error: `Column ${columnId} not found` };

  const result = addTask(board, column.id, taskInput);
  if (!result.success) return { success: false, error: result.error };

  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  // Get the new task ID
  const newColumn = result.board!.columns.find(c => c.id === column.id);
  const newTask = newColumn?.tasks[newColumn.tasks.length - 1];

  return { success: true, message: `Added ${newTask?.id || 'task'}` };
}

/**
 * Create a new task using $EDITOR with full template
 */
export function newTaskInEditor(
  filePath: string,
  columnId: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const column = findColumnById(board, columnId) || findColumnByName(board, columnId);
  if (!column) return { success: false, error: `Column ${columnId} not found` };

  // Build template for new task
  const template = buildNewTaskTemplate();

  // Write to temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `brainfile-new-task.yaml`);

  try {
    fs.writeFileSync(tempFile, template, 'utf-8');
  } catch (err) {
    return { success: false, error: `Failed to create temp file: ${err}` };
  }

  // Get editor from environment
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  // Use spawnSync to block and give full terminal control to editor
  // 5 minute timeout to prevent indefinite hangs
  const result = spawnSync(editor, [tempFile], {
    stdio: 'inherit',
    shell: true,
    timeout: 300000,
  });

  if (result.error) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Failed to open editor: ${result.error.message}` };
  }

  if (result.signal === 'SIGTERM') {
    cleanupTempFile(tempFile);
    return { success: false, error: 'Editor timed out (5 minute limit)' };
  }

  if (result.status !== 0) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Editor exited with code ${result.status}` };
  }

  // Read edited content
  let editedYaml: string;
  try {
    editedYaml = fs.readFileSync(tempFile, 'utf-8');
  } catch (err) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Failed to read edited file: ${err}` };
  }

  cleanupTempFile(tempFile);

  // Parse the new task
  const parseResult = parseNewTaskYaml(editedYaml);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  if (!parseResult.taskInput || !parseResult.taskInput.title) {
    return { success: false, error: 'Task title is required' };
  }

  // Add the task
  return addTaskAction(filePath, columnId, parseResult.taskInput);
}

/**
 * Build template for a new task
 */
function buildNewTaskTemplate(): string {
  return `# New Task
# Fill in the fields below. Save and close to create the task.
# Lines starting with # are ignored. Title is required.

title:
description:
priority:
tags:
assignee:
dueDate:
`;
}

/**
 * Parse new task YAML into TaskInput
 */
function parseNewTaskYaml(
  yaml: string
): { success: boolean; taskInput?: TaskInput; error?: string } {
  try {
    const lines = yaml.split('\n').filter(line => !line.startsWith('#') && line.trim());
    const taskInput: TaskInput = { title: '' };

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      switch (key) {
        case 'title':
          if (value) taskInput.title = value;
          break;
        case 'description':
          if (value) taskInput.description = value;
          break;
        case 'priority':
          const validPriorities = ['low', 'medium', 'high', 'critical'];
          if (validPriorities.includes(value)) {
            taskInput.priority = value as 'low' | 'medium' | 'high' | 'critical';
          }
          break;
        case 'tags':
          if (value) {
            taskInput.tags = value.split(',').map(t => t.trim()).filter(Boolean);
          }
          break;
        case 'assignee':
          if (value) taskInput.assignee = value;
          break;
        case 'dueDate':
          if (value) taskInput.dueDate = value;
          break;
      }
    }

    return { success: true, taskInput };
  } catch (err) {
    return { success: false, error: `Failed to parse task: ${err}` };
  }
}

/**
 * Edit a task in the user's preferred editor
 * Uses spawnSync to fully block and give terminal control to the editor
 */
export function editTaskInEditor(
  filePath: string,
  taskId: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) {
    return { success: false, error };
  }

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const task = taskInfo.task;

  // Build YAML representation of just this task
  const taskYaml = buildTaskYaml(task);

  // Write to temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `brainfile-edit-${taskId}.yaml`);

  try {
    fs.writeFileSync(tempFile, taskYaml, 'utf-8');
  } catch (err) {
    return { success: false, error: `Failed to create temp file: ${err}` };
  }

  // Get editor from environment
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';

  // Use spawnSync to block and give full terminal control to editor
  // 5 minute timeout to prevent indefinite hangs
  const result = spawnSync(editor, [tempFile], {
    stdio: 'inherit',
    shell: true,
    timeout: 300000,
  });

  if (result.error) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Failed to open editor: ${result.error.message}` };
  }

  if (result.signal === 'SIGTERM') {
    cleanupTempFile(tempFile);
    return { success: false, error: 'Editor timed out (5 minute limit)' };
  }

  if (result.status !== 0) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Editor exited with code ${result.status}` };
  }

  // Read edited content
  let editedYaml: string;
  try {
    editedYaml = fs.readFileSync(tempFile, 'utf-8');
  } catch (err) {
    cleanupTempFile(tempFile);
    return { success: false, error: `Failed to read edited file: ${err}` };
  }

  cleanupTempFile(tempFile);

  // Parse edited YAML and apply as patch
  const patchResult = parseEditedTaskYaml(editedYaml, task);
  if (!patchResult.success) {
    return { success: false, error: patchResult.error };
  }

  if (!patchResult.patch || Object.keys(patchResult.patch).length === 0) {
    return { success: true, message: 'No changes made' };
  }

  // Apply the patch
  return patchTaskAction(filePath, taskId, patchResult.patch);
}

/**
 * Build YAML representation of a task for editing
 */
function buildTaskYaml(task: Task): string {
  const lines: string[] = [
    `# Edit task: ${task.id}`,
    `# Save and close to apply changes. Delete a field to clear it.`,
    `# Lines starting with # are ignored.`,
    ``,
    `title: ${task.title}`,
  ];

  if (task.description) {
    // Handle multi-line descriptions
    if (task.description.includes('\n')) {
      lines.push(`description: |`);
      task.description.split('\n').forEach(line => {
        lines.push(`  ${line}`);
      });
    } else {
      lines.push(`description: ${task.description}`);
    }
  } else {
    lines.push(`# description: `);
  }

  lines.push(`priority: ${task.priority || ''}`);
  lines.push(`tags: ${task.tags?.join(', ') || ''}`);
  lines.push(`assignee: ${task.assignee || ''}`);
  lines.push(`dueDate: ${task.dueDate || ''}`);

  if (task.subtasks && task.subtasks.length > 0) {
    lines.push(`subtasks:`);
    task.subtasks.forEach(st => {
      lines.push(`  - [${st.completed ? 'x' : ' '}] ${st.title}`);
    });
  }

  if (task.relatedFiles && task.relatedFiles.length > 0) {
    lines.push(`relatedFiles: ${task.relatedFiles.join(', ')}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Parse edited YAML and return a TaskPatch
 */
function parseEditedTaskYaml(
  yaml: string,
  originalTask: Task
): { success: boolean; patch?: TaskPatch; error?: string } {
  const patch: TaskPatch = {};

  try {
    const lines = yaml.split('\n').filter(line => !line.startsWith('#') && line.trim());

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      switch (key) {
        case 'title':
          if (value && value !== originalTask.title) {
            patch.title = value;
          }
          break;
        case 'description':
          if (value !== (originalTask.description || '')) {
            patch.description = value || undefined;
          }
          break;
        case 'priority':
          const validPriorities = ['low', 'medium', 'high', 'critical', ''] as const;
          if (validPriorities.includes(value as typeof validPriorities[number]) && value !== (originalTask.priority || '')) {
            patch.priority = (value as 'low' | 'medium' | 'high' | 'critical') || null;
          }
          break;
        case 'tags':
          const newTags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
          const oldTags = originalTask.tags || [];
          if (JSON.stringify(newTags) !== JSON.stringify(oldTags)) {
            patch.tags = newTags.length > 0 ? newTags : null;
          }
          break;
        case 'assignee':
          if (value !== (originalTask.assignee || '')) {
            patch.assignee = value || null;
          }
          break;
        case 'dueDate':
          if (value !== (originalTask.dueDate || '')) {
            patch.dueDate = value || null;
          }
          break;
        case 'relatedFiles':
          const newFiles = value ? value.split(',').map(f => f.trim()).filter(Boolean) : [];
          const oldFiles = originalTask.relatedFiles || [];
          if (JSON.stringify(newFiles) !== JSON.stringify(oldFiles)) {
            patch.relatedFiles = newFiles.length > 0 ? newFiles : null;
          }
          break;
      }
    }

    return { success: true, patch };
  } catch (err) {
    return { success: false, error: `Failed to parse edited YAML: ${err}` };
  }
}

/**
 * Clean up temp file
 */
function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Copy text to clipboard (cross-platform)
 * Uses spawnSync with input option to pipe text to clipboard command
 */
export function copyToClipboard(text: string): ActionResult {
  try {
    const platform = process.platform;
    let command: string;
    let args: string[];

    if (platform === 'darwin') {
      command = 'pbcopy';
      args = [];
    } else if (platform === 'linux') {
      // Try xclip first, fall back to xsel
      command = 'xclip';
      args = ['-selection', 'clipboard'];
    } else if (platform === 'win32') {
      command = 'clip';
      args = [];
    } else {
      return { success: false, error: 'Clipboard not supported on this platform' };
    }

    const result = spawnSync(command, args, {
      input: text,
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    if (result.error) {
      return { success: false, error: `Clipboard error: ${result.error.message}` };
    }

    return { success: true, message: 'Copied to clipboard' };
  } catch (err) {
    return { success: false, error: `Failed to copy: ${err}` };
  }
}
