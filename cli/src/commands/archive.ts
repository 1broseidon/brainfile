/**
 * Archive command for Brainfile CLI
 *
 * Local (`--to local`, the default): complete the task (ledger + logs/<id>.md).
 * External: export an already-completed task from logs/ to GitHub or Linear.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  completeTaskFile,
  formatTaskForGitHub,
  formatTaskForLinear,
  readTasksDir,
  taskFileName,
  type Board,
  type Task,
} from '@brainfile/core';
import chalk from 'chalk';
import {
  missingRequiredError,
  operationError,
  handleError,
} from '../utils/errorHandler';
import {
  getArchiveConfig,
  getEffectiveDestination,
  type ParsedDestination,
} from '../utils/config';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { createGitHubIssue, isGitHubAuthenticated } from '../utils/github-auth';
import { createLinearIssue, isLinearAuthenticated, getLinearTeams } from '../utils/linear-auth';
import {
  getV2Dirs,
  findV2Task,
  readV2BoardConfig,
} from '../utils/v2-detect';

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
    const filePath = resolveCliBrainfilePath(options.file);
    assertV2Brainfile(filePath);

    const board = readV2BoardConfig(filePath);

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

    if (destination === 'local') {
      if (options.all) {
        console.log(chalk.yellow('Note:') + ' --all with local destination has no effect (tasks complete into logs/ via brainfile complete).');
        return;
      }
      if (options.task) {
        await completeLocalV2(filePath, options.task, options.dryRun);
      }
      return;
    }

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

    // Export from logs/ directory
    if (options.all) {
      await archiveAllFromLogsV2(filePath, board, destination, options.dryRun);
      return;
    }

    if (options.task) {
      await archiveSingleFromLogsV2(filePath, board, options.task, destination, options.dryRun, parsedDest);
    }
  } catch (error) {
    handleError(error);
  }
}

function completeLocalV2(filePath: string, taskId: string, dryRun?: boolean): void {
  const dirs = getV2Dirs(filePath);
  const onBoard = findV2Task(dirs, taskId, false);
  if (onBoard && !onBoard.isLog) {
    if (dryRun) {
      console.log(chalk.yellow('DRY RUN') + ' - No changes will be made');
      console.log('');
      console.log(`Would complete ${chalk.cyan(taskId)} (ledger + logs/${taskId}.md)`);
      return;
    }
    const result = completeTaskFile(onBoard.filePath, dirs.logsDir);
    if (!result.success) {
      operationError(result.error || `Failed to complete task: ${taskId}`);
      return;
    }
    console.log(chalk.green('Task completed!'));
    console.log('');
    console.log(chalk.gray(`  Task:     ${taskId}`));
    console.log(chalk.gray(`  Moved to: logs/${taskId}.md`));
    return;
  }

  const inLogs = findV2Task(dirs, taskId, true);
  if (inLogs?.isLog) {
    console.log(chalk.yellow('Already completed.') + ` ${taskId} is in logs/.`);
    console.log('Export it with: ' + chalk.cyan(`brainfile archive --task ${taskId} --to github|linear`));
    return;
  }

  operationError(`Task not found: ${taskId}`);
}

// ============================================================================
// V2 External Export from logs/
// ============================================================================

async function archiveSingleFromLogsV2(
  filePath: string,
  board: Board,
  taskId: string,
  destination: ArchiveDestination,
  dryRun?: boolean,
  parsedDest?: ParsedDestination
) {
  const dirs = getV2Dirs(filePath);
  const logPath = path.join(dirs.logsDir, taskFileName(taskId));

  if (!fs.existsSync(logPath)) {
    operationError(`Task not found in logs: ${taskId}`);
    return;
  }

  const found = findV2Task(dirs, taskId, true);
  if (!found || !found.isLog) {
    operationError(`Task ${taskId} not found in logs/. Complete the task first with: brainfile complete -t ${taskId}`);
    return;
  }

  const task = found.doc.task;

  if (dryRun) {
    console.log(chalk.yellow('DRY RUN') + ' - No changes will be made');
    console.log('');
    console.log(`Would export task ${chalk.cyan(task.id)} to ${destination}`);
    return;
  }

  // Export to external service then remove from logs
  if (destination === 'github') {
    await archiveToGitHub(board, task, 'Completed', dryRun, parsedDest);
    // Remove from logs
    fs.unlinkSync(logPath);
  } else if (destination === 'linear') {
    await archiveToLinear(board, task, 'Completed', dryRun, parsedDest);
    fs.unlinkSync(logPath);
  }
}

async function archiveAllFromLogsV2(
  filePath: string,
  board: Board,
  destination: ArchiveDestination,
  dryRun?: boolean
) {
  if (destination === 'local') {
    console.log(chalk.yellow('Note:') + ' --all with --to=local has no effect in v2 (tasks are in logs/)');
    return;
  }

  const dirs = getV2Dirs(filePath);
  const logDocs = readTasksDir(dirs.logsDir);

  if (logDocs.length === 0) {
    console.log('No completed tasks in logs/ to export.');
    return;
  }

  console.log(`Found ${logDocs.length} task(s) in logs/.`);
  if (dryRun) {
    console.log(chalk.yellow('DRY RUN') + ' - No changes will be made');
    for (const doc of logDocs) {
      console.log(`  Would export: ${doc.task.id} - ${doc.task.title}`);
    }
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const doc of logDocs) {
    const task = doc.task;
    console.log(`Exporting ${task.id}...`);

    try {
      if (destination === 'github') {
        const config = getArchiveConfig();
        if (!config.github?.owner || !config.github?.repo) {
          console.log(chalk.red('  Failed: GitHub not configured'));
          failCount++;
          continue;
        }
        const payload = formatTaskForGitHub(task, {
          includeMeta: true,
          boardTitle: board.title,
          fromColumn: 'Completed',
        });
        const result = await createGitHubIssue({
          owner: config.github.owner,
          repo: config.github.repo,
          title: payload.title,
          body: payload.body,
          labels: payload.labels,
          state: 'closed',
        });
        if (result.success) {
          const logPath = path.join(dirs.logsDir, taskFileName(task.id));
          fs.unlinkSync(logPath);
          console.log(chalk.green('  OK') + ` #${result.issueNumber}`);
          successCount++;
        } else {
          console.log(chalk.red('  Failed:') + ` ${result.error}`);
          failCount++;
        }
      } else if (destination === 'linear') {
        const config = getArchiveConfig();
        if (!config.linear?.teamId) {
          console.log(chalk.red('  Failed: Linear not configured'));
          failCount++;
          continue;
        }
        const payload = formatTaskForLinear(task, {
          includeMeta: true,
          boardTitle: board.title,
          fromColumn: 'Completed',
          stateName: 'Done',
        });
        const result = await createLinearIssue({
          teamId: config.linear.teamId,
          title: payload.title,
          description: payload.description,
          priority: payload.priority,
          stateName: 'Done',
        });
        if (result.success) {
          const logPath = path.join(dirs.logsDir, taskFileName(task.id));
          fs.unlinkSync(logPath);
          console.log(chalk.green('  OK') + ` ${result.issueId}`);
          successCount++;
        } else {
          console.log(chalk.red('  Failed:') + ` ${result.error}`);
          failCount++;
        }
      }
    } catch (error) {
      console.log(chalk.red('  Error:') + ` ${error}`);
      failCount++;
    }
  }

  console.log('');
  console.log(`Done: ${chalk.green(successCount + ' succeeded')}, ${chalk.red(failCount + ' failed')}`);
}

// ============================================================================
// GitHub Archive
// ============================================================================

async function archiveToGitHub(
  board: Board,
  task: Task,
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
  board: Board,
  task: Task,
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

