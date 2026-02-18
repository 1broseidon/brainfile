import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, deleteTask } from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  taskNotFoundError,
  missingRequiredError,
  operationError,
  handleError,
} from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { readTaskFile, taskFileName } from '@brainfile/core';
import { isV2, getV2Dirs } from '../utils/v2-detect';

interface DeleteOptions {
  file: string;
  task: string;
  force?: boolean;
}

export function deleteCommand(options: DeleteOptions) {
  try {
    // Validate required options
    if (!options.task) {
      missingRequiredError('--task', 'brainfile delete --task <task-id> [--force]');
    }

    // Resolve file path
    const filePath = resolveCliBrainfilePath(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      fileNotFoundError(filePath);
    }

    // V2 per-task file architecture
    if (isV2(filePath)) {
      const dirs = getV2Dirs(filePath);
      const taskPath = path.join(dirs.tasksDir, taskFileName(options.task));

      const doc = readTaskFile(taskPath);
      if (!doc) {
        operationError(`Task not found: ${options.task}`);
        return; // unreachable but for TS
      }

      const task = doc.task;

      if (!options.force) {
        console.log(chalk.yellow('Warning: This will permanently delete the task.'));
        console.log(chalk.gray(`  Task: ${task.id} - ${task.title}`));
        console.log(chalk.gray(`  Column: ${task.column}`));
        console.log('');
        console.log(chalk.gray('Use --force to confirm deletion, or use "brainfile archive" to archive instead.'));
        process.exit(0);
      }

      fs.unlinkSync(taskPath);

      console.log(chalk.green('Task deleted successfully!'));
      console.log('');
      console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
      console.log(chalk.gray(`  Column: ${task.column}`));
      return;
    }

    // V1: Read and parse the file
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      parseError(result.error);
    }

    const board = result.board;

    // Find the task
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      taskNotFoundError(options.task, board);
    }

    const { task, column } = taskInfo;

    // Warn if not using --force
    if (!options.force) {
      console.log(chalk.yellow('Warning: This will permanently delete the task.'));
      console.log(chalk.gray(`  Task: ${task.id} - ${task.title}`));
      console.log(chalk.gray(`  Column: ${column.title}`));
      console.log('');
      console.log(chalk.gray('Use --force to confirm deletion, or use "brainfile archive" to archive instead.'));
      process.exit(0);
    }

    // Delete task using core operation
    const deleteResult = deleteTask(board, column.id, options.task);

    if (!deleteResult.success) {
      operationError(deleteResult.error!);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(deleteResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('Task deleted successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
    console.log(chalk.gray(`  Column: ${column.title}`));

  } catch (error) {
    handleError(error);
  }
}
