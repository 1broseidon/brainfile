import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, findColumnById, findColumnByName, moveTask } from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  taskNotFoundError,
  columnNotFoundError,
  missingRequiredError,
  operationError,
  handleError,
  warnIncompleteSubtasks,
} from '../utils/errorHandler';

interface MoveOptions {
  file: string;
  task: string;
  column: string;
}

export function moveCommand(options: MoveOptions) {
  try {
    // Validate required options
    if (!options.task) {
      missingRequiredError('--task', 'brainfile move --task <task-id> --column <column-name>');
    }

    if (!options.column) {
      missingRequiredError('--column', 'brainfile move --task <task-id> --column <column-name>');
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

    let board = result.board;

    // Find the task using core query function
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      taskNotFoundError(options.task, board);
    }

    const { task: foundTask, column: sourceColumn } = taskInfo;

    // Find the target column by ID or name
    let targetColumn = findColumnById(board, options.column);
    if (!targetColumn) {
      targetColumn = findColumnByName(board, options.column);
    }

    if (!targetColumn) {
      columnNotFoundError(options.column, board);
    }

    // Check if already in target column
    if (sourceColumn.id === targetColumn.id) {
      console.log(chalk.yellow(`Task ${options.task} is already in column "${targetColumn.title}"`));
      return;
    }

    // Move task using core operation (immutable)
    const moveResult = moveTask(
      board,
      options.task,
      sourceColumn.id,
      targetColumn.id,
      targetColumn.tasks.length // Move to end of target column
    );

    if (!moveResult.success) {
      operationError(moveResult.error!);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(moveResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('Task moved successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${foundTask.id} - ${foundTask.title}`));
    console.log(chalk.gray(`  From:   ${sourceColumn.title}`));
    console.log(chalk.gray(`  To:     ${targetColumn.title}`));

    // Soft error: warn about incomplete subtasks when moving to done-like column
    warnIncompleteSubtasks(foundTask, targetColumn);

  } catch (error) {
    handleError(error);
  }
}
