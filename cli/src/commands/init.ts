import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface InitOptions {
  file?: string;
  force?: boolean;
}

const DEFAULT_BRAINFILE = `---
schema: https://brainfile.md/v1
title: My Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---

# My Project

Add your project description here.
`;

export function initCommand(options: InitOptions) {
  try {
    // Resolve file path
    const filePath = path.resolve(options.file || 'brainfile.md');

    // Check if file already exists
    if (fs.existsSync(filePath) && !options.force) {
      console.error(chalk.red(`Error: File already exists: ${filePath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      process.exit(1);
    }

    // Write the default brainfile
    fs.writeFileSync(filePath, DEFAULT_BRAINFILE, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Brainfile initialized successfully!'));
    console.log('');
    console.log(chalk.gray(`  Created: ${filePath}`));
    console.log('');
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. Edit brainfile.md to customize your project'));
    console.log(chalk.gray('  2. Add tasks: brainfile add --title "Your task"'));
    console.log(chalk.gray('  3. View tasks: brainfile list'));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
