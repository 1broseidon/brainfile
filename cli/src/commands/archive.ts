import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, archiveTask } from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  taskNotFoundError,
  missingRequiredError,
  operationError,
  handleError,
} from '../utils/errorHandler';

interface ArchiveOptions {
  file: string;
  task: string;
}

export function archiveCommand(options: ArchiveOptions) {
  try {
    // Validate required options
    if (!options.task) {
      missingRequiredError('--task', 'brainfile archive --task <task-id>');
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

    // Find the task
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      taskNotFoundError(options.task, board);
    }

    const { task, column } = taskInfo;

    // Archive task using core operation
    const archiveResult = archiveTask(board, column.id, options.task);

    if (!archiveResult.success) {
      operationError(archiveResult.error!);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(archiveResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('Task archived successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
    console.log(chalk.gray(`  From:   ${column.title}`));
    console.log(chalk.gray(`  To:     Archive`));
    console.log('');
    console.log(chalk.gray('Use "brainfile restore" to restore this task.'));

  } catch (error) {
    handleError(error);
  }
}
