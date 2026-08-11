import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, BUILT_IN_TEMPLATES, generateNextFileTaskId, taskFileName, writeTaskFile, type Column } from '@brainfile/core';
import { defaultLogger, type Logger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure, missingRequired, columnNotFound, operationFailed } from '../utils/cli-error';
import { ExitCode } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { getV2Dirs, readV2BoardConfig, composeBody } from '../utils/v2-detect';

interface TemplateOptions {
  file: string;
  list?: boolean;
  use?: string;
  title?: string;
  description?: string;
  column: string;
}

export interface TemplateResult {
  success: boolean;
  taskId?: string;
  templateName?: string;
}

export function templateCommand(options: TemplateOptions, logger: Logger = defaultLogger): TemplateResult {
  // List templates
  if (options.list) {
    logger.log('\nAvailable Templates\n');

    BUILT_IN_TEMPLATES.forEach(template => {
      logger.log(template.id);
      logger.log(`  Name: ${template.name}`);
      logger.log(`  Description: ${template.description}`);

      if (template.template.priority) {
        logger.log(`  Default Priority: ${template.template.priority}`);
      }

      if (template.template.tags && template.template.tags.length > 0) {
        logger.log(`  Default Tags: ${template.template.tags.join(', ')}`);
      }

      if (template.template.subtasks && template.template.subtasks.length > 0) {
        logger.log(`  Subtasks: ${template.template.subtasks.length}`);
      }

      logger.log('');
    });

    logger.log('Usage: brainfile template --use <template-id> --title "Task title"');
    return { success: true };
  }

  // Use a template
  if (options.use) {
    if (!options.title) {
      throw missingRequired('--title', 'brainfile template --use <template-id> --title "Task title"');
    }

    // Resolve file path
    const filePath = resolveCliBrainfilePath(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw fileNotFound(filePath);
    }

    // Read v2 board config
    const board = readV2BoardConfig(filePath);

    // Find the target column
    const targetColumn = board.columns.find(
      (col: Column) => col.id === options.column || col.title.toLowerCase() === options.column.toLowerCase()
    );

    if (!targetColumn) {
      const availableColumns = board.columns.map((c: Column) => `${c.id} (${c.title})`);
      throw columnNotFound(options.column, availableColumns);
    }

    // Create task from template
    const values: Record<string, string> = {
      title: options.title,
    };

    if (options.description) {
      values.description = options.description;
    }

    let partialTask;
    try {
      partialTask = Brainfile.createFromTemplate(options.use, values);
    } catch (error) {
      // Create a nice error message listing available templates
      const availableTemplates = BUILT_IN_TEMPLATES.map(t => `  - ${t.id}: ${t.name}`).join('\n');
      throw new CLIError(
        error instanceof Error ? error.message : String(error),
        ExitCode.USER_ERROR,
        `Available templates:\n${availableTemplates}`
      );
    }

    // Generate task ID
    const dirs = getV2Dirs(filePath);
    const prefix = partialTask.type && partialTask.type !== 'task' ? partialTask.type : 'task';
    const newTaskId = generateNextFileTaskId(dirs.boardDir, dirs.logsDir, prefix);

    // Create complete task - ensure title is set
    // Spread partialTask first, then override with explicit values
    const newTask: any = {
      ...partialTask,
      id: newTaskId,
      title: options.title, // Always use the provided title
      column: targetColumn.id,
      position: targetColumn.tasks?.length || 0,
    };

    const body = composeBody(newTask.description);
    writeTaskFile(path.join(dirs.boardDir, taskFileName(newTaskId)), newTask, body);

    // Success message
    logger.log('✓ Task created from template!');
    logger.log('');
    logger.log(`  ID:       ${newTaskId}`);
    logger.log(`  Title:    ${newTask.title}`);
    logger.log(`  Template: ${options.use}`);
    logger.log(`  Column:   ${targetColumn.title}`);

    if (newTask.priority) {
      logger.log(`  Priority: ${newTask.priority}`);
    }

    if (newTask.tags && newTask.tags.length > 0) {
      logger.log(`  Tags:     ${newTask.tags.join(', ')}`);
    }

    if (newTask.subtasks && newTask.subtasks.length > 0) {
      logger.log(`  Subtasks: ${newTask.subtasks.length}`);
    }

    return {
      success: true,
      taskId: newTaskId,
      templateName: options.use
    };
  }

  // No action specified
  logger.warn('Please specify an action:');
  logger.log('  --list           List all available templates');
  logger.log('  --use <id>       Create task from template');
  logger.log('');
  logger.log('Examples:');
  logger.log('  brainfile template --list');
  logger.log('  brainfile template --use bug-report --title "Fix login issue"');

  return { success: false };
}
