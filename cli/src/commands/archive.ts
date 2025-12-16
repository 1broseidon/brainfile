/**
 * Archive command for Brainfile CLI
 *
 * Supports archiving to:
 * - local: Move to local archive section (default)
 * - github: Create closed GitHub Issue
 * - linear: Create completed Linear issue
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findTaskById,
  deleteTask,
  formatTaskForGitHub,
  formatTaskForLinear,
  type Board,
  type Task,
} from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  taskNotFoundError,
  missingRequiredError,
  operationError,
  handleError,
} from '../utils/errorHandler';
import {
  getEffectiveArchiveDestination,
  getArchiveConfig,
  getEffectiveDestination,
  type ParsedDestination,
} from '../utils/config';
import { createGitHubIssue, isGitHubAuthenticated } from '../utils/github-auth';
import { createLinearIssue, isLinearAuthenticated, getLinearTeams } from '../utils/linear-auth';
import {
  archiveTaskToFile,
  loadArchivedTasks,
  removeFromArchive,
  getArchivePath,
} from '../utils/archive';

// ============================================================================
// Types
// ============================================================================

interface ArchiveOptions {
  file: string;
  task?: string;
  to?: 'local' | 'github' | 'linear';
  all?: boolean;
  dryRun?: boolean;
}

type ArchiveDestination = 'local' | 'github' | 'linear';

// ============================================================================
// Main Command
// ============================================================================

export async function archiveCommand(options: ArchiveOptions) {
  try {
    // Validate: need either --task or --all
    if (!options.task && !options.all) {
      missingRequiredError('--task or --all', 'brainfile archive --task <task-id>');
    }

    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      fileNotFoundError(filePath);
    }

    // Read and parse the file
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      parseError(result.error);
    }

    const board = result.board;

    // Determine destination (supports extended format like github:owner/repo)
    const brainfileDestination = (board as any).archive?.destination;
    let parsedDest: ParsedDestination;

    if (options.to) {
      // CLI flag takes precedence (simple format only)
      parsedDest = { type: options.to };
    } else {
      // Parse from brainfile or config (may have extended format)
      parsedDest = getEffectiveDestination(brainfileDestination);
    }

    const destination = parsedDest.type;

    // Validate destination auth if needed
    if (destination === 'github' && !(await isGitHubAuthenticated())) {
      console.log(chalk.red('✗') + ' Not authenticated with GitHub.');
      console.log('');
      console.log('Run: ' + chalk.cyan('brainfile auth github'));
      process.exit(1);
    }

    if (destination === 'linear' && !(await isLinearAuthenticated())) {
      console.log(chalk.red('✗') + ' Not authenticated with Linear.');
      console.log('');
      console.log('Run: ' + chalk.cyan('brainfile auth linear --token <api-key>'));
      process.exit(1);
    }

    // Handle --all flag (archive all from local archive to external)
    if (options.all) {
      await archiveAllToExternal(filePath, board, destination, options.dryRun);
      return;
    }

    // Single task archive
    if (options.task) {
      await archiveSingleTask(filePath, board, options.task, destination, options.dryRun, parsedDest);
    }
  } catch (error) {
    handleError(error);
  }
}

// ============================================================================
// Single Task Archive
// ============================================================================

async function archiveSingleTask(
  filePath: string,
  board: Board,
  taskId: string,
  destination: ArchiveDestination,
  dryRun?: boolean,
  parsedDest?: ParsedDestination
) {
  // Find the task
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    taskNotFoundError(taskId, board);
    return;
  }

  const { task, column } = taskInfo;

  if (dryRun) {
    console.log(chalk.yellow('DRY RUN') + ' - No changes will be made');
    console.log('');
  }

  // Archive based on destination
  if (destination === 'local') {
    await archiveToLocal(filePath, board, task, column.id, column.title, dryRun);
  } else if (destination === 'github') {
    await archiveToGitHub(filePath, board, task, column.id, column.title, dryRun, parsedDest);
  } else if (destination === 'linear') {
    await archiveToLinear(filePath, board, task, column.id, column.title, dryRun, parsedDest);
  }
}

// ============================================================================
// Local Archive
// ============================================================================

async function archiveToLocal(
  filePath: string,
  board: Board,
  task: Task,
  columnId: string,
  columnTitle: string,
  dryRun?: boolean
) {
  const archivePath = getArchivePath(filePath);

  if (dryRun) {
    console.log(`Would archive task ${chalk.cyan(task.id)} to ${chalk.cyan(path.basename(archivePath))}`);
    return;
  }

  const archiveResult = archiveTaskToFile(filePath, board, columnId, task.id);

  if (!archiveResult.success) {
    operationError(archiveResult.error!);
    return;
  }

  // Success message
  console.log(chalk.green('✓') + ' Task archived locally');
  console.log('');
  console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
  console.log(chalk.gray(`  From:   ${columnTitle}`));
  console.log(chalk.gray(`  To:     ${path.basename(archivePath)}`));
  console.log('');
  console.log(chalk.gray('Use "brainfile restore" to restore this task.'));
}

// ============================================================================
// GitHub Archive
// ============================================================================

async function archiveToGitHub(
  filePath: string,
  board: Board,
  task: Task,
  columnId: string,
  columnTitle: string,
  dryRun?: boolean,
  parsedDest?: ParsedDestination
) {
  const config = getArchiveConfig();

  // Use parsed destination if available, otherwise fall back to config
  const owner = parsedDest?.owner || config.github?.owner;
  const repo = parsedDest?.repo || config.github?.repo;
  const labels = config.github?.labels;

  if (!owner || !repo) {
    console.log(chalk.red('✗') + ' GitHub owner/repo not configured.');
    console.log('');
    console.log('Set in brainfile.md:');
    console.log(chalk.cyan('  archive:'));
    console.log(chalk.cyan('    destination: github:owner/repo'));
    console.log('');
    console.log('Or set up global config:');
    console.log(chalk.cyan('  brainfile config set archive.github.owner <owner>'));
    console.log(chalk.cyan('  brainfile config set archive.github.repo <repo>'));
    process.exit(1);
  }

  // Format task for GitHub
  const payload = formatTaskForGitHub(task, {
    includeMeta: true,
    includeSubtasks: true,
    includeRelatedFiles: true,
    boardTitle: board.title,
    fromColumn: columnTitle,
    extraLabels: labels,
  });

  if (dryRun) {
    console.log(`Would create GitHub Issue in ${chalk.cyan(`${owner}/${repo}`)}:`);
    console.log('');
    console.log(chalk.bold('Title:'), payload.title);
    console.log(chalk.bold('Labels:'), payload.labels?.join(', ') || 'none');
    console.log(chalk.bold('State:'), payload.state);
    console.log('');
    console.log(chalk.bold('Body:'));
    console.log(chalk.gray(payload.body.substring(0, 500) + (payload.body.length > 500 ? '...' : '')));
    return;
  }

  console.log(`Creating GitHub Issue in ${chalk.cyan(`${owner}/${repo}`)}...`);

  const result = await createGitHubIssue({
    owner,
    repo,
    title: payload.title,
    body: payload.body,
    labels: payload.labels,
    state: payload.state,
  });

  if (!result.success) {
    console.log(chalk.red('✗') + ` Failed to create issue: ${result.error}`);
    process.exit(1);
  }

  // Remove task from board (delete, not archive locally)
  const deleteResult = deleteTask(board, columnId, task.id);
  if (deleteResult.success) {
    const updatedContent = Brainfile.serialize(deleteResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
  }

  // Success message
  console.log('');
  console.log(chalk.green('✓') + ` Created GitHub Issue #${result.issueNumber} (closed)`);
  console.log('');
  console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
  console.log(chalk.gray(`  From:   ${columnTitle}`));
  console.log(chalk.gray(`  To:     ${result.issueUrl}`));
  console.log('');
  console.log(`View: ${chalk.underline(result.issueUrl)}`);
}

// ============================================================================
// Linear Archive
// ============================================================================

async function archiveToLinear(
  filePath: string,
  board: Board,
  task: Task,
  columnId: string,
  columnTitle: string,
  dryRun?: boolean,
  parsedDest?: ParsedDestination
) {
  const config = getArchiveConfig();
  let teamId = config.linear?.teamId;

  // If teamKey is provided in destination, resolve it to teamId
  if (parsedDest?.teamKey) {
    const teams = await getLinearTeams();
    const matchingTeam = teams.find(
      (t) => t.key.toLowerCase() === parsedDest.teamKey!.toLowerCase()
    );

    if (matchingTeam) {
      teamId = matchingTeam.id;
    } else {
      console.log(chalk.red('✗') + ` Linear team "${parsedDest.teamKey}" not found.`);
      console.log('');
      console.log('Available teams:');
      teams.forEach((t) => console.log(`  ${t.key}: ${t.name}`));
      process.exit(1);
    }
  }

  // If no teamId configured, try to get it interactively
  if (!teamId) {
    const teams = await getLinearTeams();

    if (teams.length === 0) {
      console.log(chalk.red('✗') + ' No Linear teams found or not authenticated.');
      process.exit(1);
    }

    if (teams.length === 1) {
      teamId = teams[0].id;
      console.log(chalk.gray(`Using team: ${teams[0].name}`));
    } else {
      console.log(chalk.red('✗') + ' Multiple Linear teams found. Please configure a default:');
      console.log('');
      console.log('Set in brainfile.md:');
      console.log(chalk.cyan('  archive:'));
      console.log(chalk.cyan('    destination: linear:TEAM_KEY'));
      console.log('');
      console.log('Available teams:');
      teams.forEach((t) => console.log(`  ${t.key}: ${t.name}`));
      console.log('');
      console.log('Or set the default team:');
      console.log(chalk.cyan(`  brainfile config set archive.linear.teamId <team-id>`));
      process.exit(1);
    }
  }

  // Format task for Linear
  const payload = formatTaskForLinear(task, {
    includeMeta: true,
    includeSubtasks: true,
    includeRelatedFiles: true,
    boardTitle: board.title,
    fromColumn: columnTitle,
    stateName: 'Done',
  });

  if (dryRun) {
    console.log(`Would create Linear Issue in team ${chalk.cyan(teamId)}:`);
    console.log('');
    console.log(chalk.bold('Title:'), payload.title);
    console.log(chalk.bold('Priority:'), payload.priority || 'none');
    console.log(chalk.bold('Labels:'), payload.labelNames?.join(', ') || 'none');
    console.log(chalk.bold('State:'), payload.stateName);
    console.log('');
    console.log(chalk.bold('Description:'));
    console.log(chalk.gray(payload.description.substring(0, 500) + (payload.description.length > 500 ? '...' : '')));
    return;
  }

  console.log('Creating Linear Issue...');

  const result = await createLinearIssue({
    teamId,
    title: payload.title,
    description: payload.description,
    priority: payload.priority,
    labelNames: payload.labelNames,
    stateName: payload.stateName,
  });

  if (!result.success) {
    console.log(chalk.red('✗') + ` Failed to create issue: ${result.error}`);
    process.exit(1);
  }

  // Remove task from board
  const deleteResult = deleteTask(board, columnId, task.id);
  if (deleteResult.success) {
    const updatedContent = Brainfile.serialize(deleteResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
  }

  // Success message
  console.log('');
  console.log(chalk.green('✓') + ` Created Linear Issue ${result.issueId} (Done)`);
  console.log('');
  console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
  console.log(chalk.gray(`  From:   ${columnTitle}`));
  console.log(chalk.gray(`  To:     ${result.issueUrl}`));
  console.log('');
  console.log(`View: ${chalk.underline(result.issueUrl)}`);
}

// ============================================================================
// Archive All (from local archive to external)
// ============================================================================

async function archiveAllToExternal(
  filePath: string,
  board: Board,
  destination: ArchiveDestination,
  dryRun?: boolean
) {
  if (destination === 'local') {
    console.log(chalk.yellow('Note:') + ' --all with --to=local has no effect (tasks are already archived)');
    return;
  }

  // Load archived tasks from the separate archive file
  const { tasks: archivedTasks, archivePath, error } = loadArchivedTasks(filePath);

  if (error) {
    console.log(chalk.red('✗') + ` ${error}`);
    return;
  }

  if (archivedTasks.length === 0) {
    console.log(`No tasks in local archive (${path.basename(archivePath)}) to export.`);
    return;
  }

  console.log(`Found ${archivedTasks.length} task(s) in ${path.basename(archivePath)}.`);
  console.log('');

  if (dryRun) {
    console.log(chalk.yellow('DRY RUN') + ' - No changes will be made');
    console.log('');
    for (const task of archivedTasks) {
      console.log(`  Would archive: ${task.id} - ${task.title}`);
    }
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const task of archivedTasks) {
    console.log(`Archiving ${task.id}...`);

    try {
      if (destination === 'github') {
        const config = getArchiveConfig();
        const github = config.github;

        if (!github?.owner || !github?.repo) {
          console.log(chalk.red('✗') + ' GitHub not configured');
          failCount++;
          continue;
        }

        const payload = formatTaskForGitHub(task, {
          includeMeta: true,
          boardTitle: board.title,
          fromColumn: 'Archive',
        });

        const result = await createGitHubIssue({
          owner: github.owner,
          repo: github.repo,
          title: payload.title,
          body: payload.body,
          labels: payload.labels,
          state: 'closed',
        });

        if (result.success) {
          // Remove from archive file
          removeFromArchive(filePath, task.id);
          console.log(chalk.green('  ✓') + ` Created #${result.issueNumber}`);
          successCount++;
        } else {
          console.log(chalk.red('  ✗') + ` Failed: ${result.error}`);
          failCount++;
        }
      } else if (destination === 'linear') {
        const config = getArchiveConfig();
        const teamId = config.linear?.teamId;

        if (!teamId) {
          console.log(chalk.red('✗') + ' Linear teamId not configured');
          failCount++;
          continue;
        }

        const payload = formatTaskForLinear(task, {
          includeMeta: true,
          boardTitle: board.title,
          fromColumn: 'Archive',
          stateName: 'Done',
        });

        const result = await createLinearIssue({
          teamId,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          stateName: 'Done',
        });

        if (result.success) {
          // Remove from archive file
          removeFromArchive(filePath, task.id);
          console.log(chalk.green('  ✓') + ` Created ${result.issueId}`);
          successCount++;
        } else {
          console.log(chalk.red('  ✗') + ` Failed: ${result.error}`);
          failCount++;
        }
      }
    } catch (error) {
      console.log(chalk.red('  ✗') + ` Error: ${error}`);
      failCount++;
    }
  }

  console.log('');
  console.log(
    `Done: ${chalk.green(successCount + ' succeeded')}, ${chalk.red(failCount + ' failed')}`
  );
}
