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
  formatTaskForGitHub,
  formatTaskForLinear,
  type Board,
  type Task,
  type TaskPatch,
  type TaskInput,
} from '@brainfile/core';
import {
  getEffectiveDestination,
  getArchiveConfig,
  type ParsedDestination,
} from '../utils/config';
import { isGitHubAuthenticated, createGitHubIssue } from '../utils/github-auth';
import { isLinearAuthenticated, createLinearIssue, getLinearTeams } from '../utils/linear-auth';

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
 * Get the archive file path for a brainfile
 * Archive lives in same directory: brainfile.md -> brainfile-archive.md
 */
function getArchivePath(filePath: string): string {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);
  const archiveFilename = filename.replace(/\.md$/, '-archive.md');
  return path.join(dir, archiveFilename);
}

/**
 * Create an empty archive board structure
 */
function createEmptyArchiveBoard(): Board {
  return {
    title: 'Archive',
    columns: [],
    archive: [],
  };
}

/**
 * Archive a task to a separate brainfile-archive.md file
 * Per protocol spec, archived tasks go to a separate file, not inline archive array
 */
export function archiveTaskAction(filePath: string, taskId: string): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const task = taskInfo.task;
  const columnId = taskInfo.column.id;

  // Remove task from the main board (don't use archiveTask - it puts task in inline archive)
  const result = deleteTask(board, columnId, taskId);
  if (!result.success) return { success: false, error: result.error };

  // Save the main board without the task
  const writeResult = writeBrainfile(filePath, result.board!);
  if (!writeResult.success) return writeResult;

  // Now add the task to the separate archive file
  const archivePath = getArchivePath(filePath);

  // Read or create archive file
  let archiveBoard: Board;
  if (fs.existsSync(archivePath)) {
    try {
      const archiveContent = fs.readFileSync(archivePath, 'utf-8');
      const parseResult = Brainfile.parseWithErrors(archiveContent);
      if (parseResult.board) {
        archiveBoard = parseResult.board;
      } else {
        archiveBoard = createEmptyArchiveBoard();
      }
    } catch {
      archiveBoard = createEmptyArchiveBoard();
    }
  } else {
    archiveBoard = createEmptyArchiveBoard();
  }

  // Add task to archive (at beginning)
  if (!archiveBoard.archive) {
    archiveBoard.archive = [];
  }
  archiveBoard.archive.unshift(task);

  // Save archive file
  try {
    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    // Task was removed from main board but archive write failed
    // This is a partial failure state - log and report
    return {
      success: false,
      error: `Task removed from board but failed to write archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { success: true, message: `Archived ${taskId}` };
}

/**
 * Archive a task with support for external destinations (GitHub, Linear)
 * Respects archive.destination from brainfile.md or global config
 */
export async function archiveTaskActionAsync(
  filePath: string,
  taskId: string
): Promise<ActionResult> {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) return { success: false, error: `Task ${taskId} not found` };

  const task = taskInfo.task;
  const columnId = taskInfo.column.id;
  const columnTitle = taskInfo.column.title;

  // Determine destination from brainfile or config
  const brainfileDestination = (board as any).archive?.destination;
  const parsedDest = getEffectiveDestination(brainfileDestination);
  const destination = parsedDest.type;

  // Handle local archive (default behavior)
  if (destination === 'local') {
    return archiveTaskAction(filePath, taskId);
  }

  // Handle GitHub archive
  if (destination === 'github') {
    if (!(await isGitHubAuthenticated())) {
      return { success: false, error: 'Not authenticated with GitHub. Run: brainfile auth github' };
    }

    const config = getArchiveConfig();
    const owner = parsedDest.owner || config.github?.owner;
    const repo = parsedDest.repo || config.github?.repo;

    if (!owner || !repo) {
      return { success: false, error: 'GitHub owner/repo not configured. Set archive.destination: github:owner/repo' };
    }

    const payload = formatTaskForGitHub(task, {
      includeMeta: true,
      includeSubtasks: true,
      includeRelatedFiles: true,
      boardTitle: board.title,
      fromColumn: columnTitle,
      extraLabels: config.github?.labels,
    });

    const ghResult = await createGitHubIssue({
      owner,
      repo,
      title: payload.title,
      body: payload.body,
      labels: payload.labels,
      state: 'closed',
    });

    if (!ghResult.success) {
      return { success: false, error: `GitHub: ${ghResult.error}` };
    }

    // Remove task from board
    const deleteResult = deleteTask(board, columnId, taskId);
    if (deleteResult.success) {
      writeBrainfile(filePath, deleteResult.board!);
    }

    return { success: true, message: `Archived to GitHub #${ghResult.issueNumber}` };
  }

  // Handle Linear archive
  if (destination === 'linear') {
    if (!(await isLinearAuthenticated())) {
      return { success: false, error: 'Not authenticated with Linear. Run: brainfile auth linear --token <key>' };
    }

    const config = getArchiveConfig();
    let teamId = config.linear?.teamId;

    // Resolve teamKey to teamId if provided in destination
    if (parsedDest.teamKey) {
      const teams = await getLinearTeams();
      const matchingTeam = teams.find(
        (t) => t.key.toLowerCase() === parsedDest.teamKey!.toLowerCase()
      );
      if (matchingTeam) {
        teamId = matchingTeam.id;
      } else {
        return { success: false, error: `Linear team "${parsedDest.teamKey}" not found` };
      }
    }

    if (!teamId) {
      // Try to auto-select if only one team
      const teams = await getLinearTeams();
      if (teams.length === 1) {
        teamId = teams[0].id;
      } else if (teams.length > 1) {
        return { success: false, error: 'Multiple Linear teams. Set archive.destination: linear:TEAM_KEY' };
      } else {
        return { success: false, error: 'No Linear teams found' };
      }
    }

    const payload = formatTaskForLinear(task, {
      includeMeta: true,
      includeSubtasks: true,
      includeRelatedFiles: true,
      boardTitle: board.title,
      fromColumn: columnTitle,
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
      return { success: false, error: `Linear: ${linearResult.error}` };
    }

    // Remove task from board
    const deleteResult = deleteTask(board, columnId, taskId);
    if (deleteResult.success) {
      writeBrainfile(filePath, deleteResult.board!);
    }

    return { success: true, message: `Archived to Linear ${linearResult.issueId}` };
  }

  return { success: false, error: `Unknown destination: ${destination}` };
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

  // Reset terminal state after editor exits - hide cursor and clear line
  // This fixes cursor blink artifact when returning to Ink TUI
  process.stdout.write('\x1b[?25l'); // Hide cursor
  process.stdout.write('\x1b[2K');   // Clear current line

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

  // Reset terminal state after editor exits - hide cursor and clear line
  // This fixes cursor blink artifact when returning to Ink TUI
  process.stdout.write('\x1b[?25l'); // Hide cursor
  process.stdout.write('\x1b[2K');   // Clear current line

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

// =============================================================================
// RULES OPERATIONS
// =============================================================================

type RuleType = 'always' | 'never' | 'prefer' | 'context';

interface Rule {
  id: number;
  rule: string;
}

/**
 * Add a new rule to a rule category
 */
export function addRuleAction(
  filePath: string,
  ruleType: RuleType,
  ruleText: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  // Initialize rules if not present
  if (!board.rules) {
    board.rules = {
      always: [],
      never: [],
      prefer: [],
      context: [],
    };
  }

  // Ensure the rule type array exists
  if (!board.rules[ruleType]) {
    board.rules[ruleType] = [];
  }

  // Generate next rule ID
  const existingIds = board.rules[ruleType].map((r: Rule) => r.id);
  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
  const newRuleId = maxId + 1;

  // Add the rule
  board.rules[ruleType].push({
    id: newRuleId,
    rule: ruleText.trim(),
  });

  const writeResult = writeBrainfile(filePath, board);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Added ${ruleType} rule #${newRuleId}` };
}

/**
 * Update an existing rule
 */
export function updateRuleAction(
  filePath: string,
  ruleType: RuleType,
  ruleId: number,
  ruleText: string
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  if (!board.rules || !board.rules[ruleType]) {
    return { success: false, error: `No ${ruleType} rules found` };
  }

  const rule = board.rules[ruleType].find((r: Rule) => r.id === ruleId);
  if (!rule) {
    return { success: false, error: `Rule #${ruleId} not found` };
  }

  rule.rule = ruleText.trim();

  const writeResult = writeBrainfile(filePath, board);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Updated ${ruleType} rule #${ruleId}` };
}

/**
 * Delete a rule
 */
export function deleteRuleAction(
  filePath: string,
  ruleType: RuleType,
  ruleId: number
): ActionResult {
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  if (!board.rules || !board.rules[ruleType]) {
    return { success: false, error: `No ${ruleType} rules found` };
  }

  const ruleIndex = board.rules[ruleType].findIndex((r: Rule) => r.id === ruleId);
  if (ruleIndex === -1) {
    return { success: false, error: `Rule #${ruleId} not found` };
  }

  board.rules[ruleType].splice(ruleIndex, 1);

  const writeResult = writeBrainfile(filePath, board);
  if (!writeResult.success) return writeResult;

  return { success: true, message: `Deleted ${ruleType} rule #${ruleId}` };
}

// =============================================================================
// ARCHIVE OPERATIONS
// =============================================================================

/**
 * Load archive from the archive file
 */
export function loadArchive(filePath: string): { archive: Task[]; error?: string } {
  const archivePath = getArchivePath(filePath);

  if (!fs.existsSync(archivePath)) {
    return { archive: [] };
  }

  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);
    if (parseResult.board && parseResult.board.archive) {
      return { archive: parseResult.board.archive };
    }
    return { archive: [] };
  } catch (err) {
    return { archive: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Restore a task from the archive to a column
 */
export function restoreTaskAction(
  filePath: string,
  taskId: string,
  toColumnId: string
): ActionResult {
  const archivePath = getArchivePath(filePath);

  // Read archive file
  if (!fs.existsSync(archivePath)) {
    return { success: false, error: 'Archive file not found' };
  }

  let archiveBoard: Board;
  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);
    if (!parseResult.board) {
      return { success: false, error: 'Failed to parse archive file' };
    }
    archiveBoard = parseResult.board;
  } catch (err) {
    return { success: false, error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find task in archive
  if (!archiveBoard.archive || archiveBoard.archive.length === 0) {
    return { success: false, error: 'Archive is empty' };
  }

  const taskIndex = archiveBoard.archive.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: `Task ${taskId} not found in archive` };
  }

  const task = archiveBoard.archive[taskIndex];

  // Read main board
  const { board, error } = readBrainfile(filePath);
  if (!board) return { success: false, error };

  // Find target column
  const column = findColumnById(board, toColumnId) || findColumnByName(board, toColumnId);
  if (!column) {
    return { success: false, error: `Column ${toColumnId} not found` };
  }

  // Add task to column (at beginning)
  column.tasks.unshift(task);

  // Remove from archive
  archiveBoard.archive.splice(taskIndex, 1);

  // Save both files
  const writeResult = writeBrainfile(filePath, board);
  if (!writeResult.success) return writeResult;

  try {
    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    return { success: false, error: `Task restored but failed to update archive: ${err}` };
  }

  return { success: true, message: `Restored ${taskId} to ${column.title}` };
}

/**
 * Permanently delete a task from the archive
 */
export function deleteArchivedTaskAction(
  filePath: string,
  taskId: string
): ActionResult {
  const archivePath = getArchivePath(filePath);

  // Read archive file
  if (!fs.existsSync(archivePath)) {
    return { success: false, error: 'Archive file not found' };
  }

  let archiveBoard: Board;
  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);
    if (!parseResult.board) {
      return { success: false, error: 'Failed to parse archive file' };
    }
    archiveBoard = parseResult.board;
  } catch (err) {
    return { success: false, error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Find and remove task from archive
  if (!archiveBoard.archive || archiveBoard.archive.length === 0) {
    return { success: false, error: 'Archive is empty' };
  }

  const taskIndex = archiveBoard.archive.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return { success: false, error: `Task ${taskId} not found in archive` };
  }

  archiveBoard.archive.splice(taskIndex, 1);

  // Save archive file
  try {
    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    return { success: false, error: `Failed to update archive: ${err}` };
  }

  return { success: true, message: `Permanently deleted ${taskId}` };
}
