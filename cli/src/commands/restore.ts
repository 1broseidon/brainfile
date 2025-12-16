import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findColumnById, findColumnByName } from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  columnNotFoundError,
  missingRequiredError,
  validationError,
  operationError,
  handleError,
} from '../utils/errorHandler';
import {
  loadArchivedTasks,
  restoreFromArchive,
  getArchivePath,
} from '../utils/archive';

interface RestoreOptions {
  file: string;
  task: string;
  column: string;
}

export function restoreCommand(options: RestoreOptions) {
  try {
    // Validate required options
    if (!options.task) {
      missingRequiredError('--task', 'brainfile restore --task <task-id> --column <column-name>');
    }

    if (!options.column) {
      missingRequiredError('--column', 'brainfile restore --task <task-id> --column <column-name>');
    }

    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      fileNotFoundError(filePath);
    }

    // Read and parse the main brainfile (to validate column)
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      parseError(result.error);
    }

    const board = result.board;

    // Load archived tasks from separate file
    const { tasks: archivedTasks, archivePath, error } = loadArchivedTasks(filePath);

    if (error) {
      operationError(error);
    }

    if (archivedTasks.length === 0) {
      validationError(`Archive is empty (${path.basename(archivePath)})`);
    }

    // Find the task in archive
    const archivedTask = archivedTasks.find(t => t.id === options.task);
    if (!archivedTask) {
      console.error(chalk.red(`Error: Task not found in archive: ${options.task}`));
      console.log(chalk.gray(`\nArchived tasks in ${path.basename(archivePath)}:`));
      archivedTasks.forEach((task) => {
        console.log(chalk.gray(`  - ${task.id}: ${task.title}`));
      });
      process.exit(1);
    }

    // Find the target column by ID or name
    let targetColumn = findColumnById(board, options.column);
    if (!targetColumn) {
      targetColumn = findColumnByName(board, options.column);
    }

    if (!targetColumn) {
      columnNotFoundError(options.column, board);
    }

    // Restore task from archive file to main brainfile
    const restoreResult = restoreFromArchive(filePath, options.task, targetColumn.id);

    if (!restoreResult.success) {
      operationError(restoreResult.error!);
    }

    // Success message
    console.log(chalk.green('Task restored successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${archivedTask.id} - ${archivedTask.title}`));
    console.log(chalk.gray(`  From:   ${path.basename(archivePath)}`));
    console.log(chalk.gray(`  To:     ${targetColumn.title}`));

  } catch (error) {
    handleError(error);
  }
}
