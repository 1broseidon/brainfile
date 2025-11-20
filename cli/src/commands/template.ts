import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, BUILT_IN_TEMPLATES, generateTaskId } from '@brainfile/core';
import chalk from 'chalk';

interface TemplateOptions {
  file: string;
  list?: boolean;
  use?: string;
  title?: string;
  description?: string;
  column: string;
}

export function templateCommand(options: TemplateOptions) {
  try {
    // List templates
    if (options.list) {
      console.log(chalk.bold.white('\nAvailable Templates\n'));

      BUILT_IN_TEMPLATES.forEach(template => {
        console.log(chalk.cyan(`${template.id}`));
        console.log(chalk.gray(`  Name: ${template.name}`));
        console.log(chalk.gray(`  Description: ${template.description}`));

        if (template.template.priority) {
          console.log(chalk.gray(`  Default Priority: ${template.template.priority}`));
        }

        if (template.template.tags && template.template.tags.length > 0) {
          console.log(chalk.gray(`  Default Tags: ${template.template.tags.join(', ')}`));
        }

        if (template.template.subtasks && template.template.subtasks.length > 0) {
          console.log(chalk.gray(`  Subtasks: ${template.template.subtasks.length}`));
        }

        console.log('');
      });

      console.log(chalk.gray('Usage: bangbang template --use <template-id> --title "Task title"'));
      return;
    }

    // Use a template
    if (options.use) {
      if (!options.title) {
        console.error(chalk.red('Error: --title is required when using a template'));
        console.log(chalk.gray('Usage: bangbang template --use <template-id> --title "Task title"'));
        process.exit(1);
      }

      // Resolve file path
      const filePath = path.resolve(options.file);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(chalk.red(`Error: File not found: ${filePath}`));
        process.exit(1);
      }

      // Read and parse the file
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = Brainfile.parseWithErrors(content);

      if (!result.board) {
        console.error(chalk.red('Error: Failed to parse bangbang.md'));
        if (result.error) {
          console.error(chalk.red(result.error));
        }
        process.exit(1);
      }

      const board = result.board;

      // Find the target column
      const targetColumn = board.columns.find(
        col => col.id === options.column || col.title.toLowerCase() === options.column.toLowerCase()
      );

      if (!targetColumn) {
        console.error(chalk.red(`Error: Column not found: ${options.column}`));
        console.log(chalk.gray('Available columns:'));
        board.columns.forEach(col => {
          console.log(chalk.gray(`  - ${col.id} (${col.title})`));
        });
        process.exit(1);
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
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        console.log(chalk.gray('\nAvailable templates:'));
        BUILT_IN_TEMPLATES.forEach(t => {
          console.log(chalk.gray(`  - ${t.id}: ${t.name}`));
        });
        process.exit(1);
      }

      // Generate task ID
      const newTaskId = generateTaskId();

      // Create complete task - ensure title is set
      const newTask: any = {
        id: newTaskId,
        title: partialTask.title || options.title,
        ...partialTask,
      };

      // Add task to column
      targetColumn.tasks.push(newTask);

      // Serialize and write back
      const updatedContent = Brainfile.serialize(board);
      fs.writeFileSync(filePath, updatedContent, 'utf-8');

      // Success message
      console.log(chalk.green('✓ Task created from template!'));
      console.log('');
      console.log(chalk.gray(`  ID:       ${newTaskId}`));
      console.log(chalk.gray(`  Title:    ${newTask.title}`));
      console.log(chalk.gray(`  Template: ${options.use}`));
      console.log(chalk.gray(`  Column:   ${targetColumn.title}`));

      if (newTask.priority) {
        console.log(chalk.gray(`  Priority: ${newTask.priority}`));
      }

      if (newTask.tags && newTask.tags.length > 0) {
        console.log(chalk.gray(`  Tags:     ${newTask.tags.join(', ')}`));
      }

      if (newTask.subtasks && newTask.subtasks.length > 0) {
        console.log(chalk.gray(`  Subtasks: ${newTask.subtasks.length}`));
      }

      return;
    }

    // No action specified
    console.log(chalk.yellow('Please specify an action:'));
    console.log(chalk.gray('  --list           List all available templates'));
    console.log(chalk.gray('  --use <id>       Create task from template'));
    console.log('');
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  bangbang template --list'));
    console.log(chalk.gray('  bangbang template --use bug-report --title "Fix login issue"'));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
