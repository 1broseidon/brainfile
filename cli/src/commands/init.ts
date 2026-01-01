import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureDotBrainfileGitignore } from '@brainfile/core';

interface InitOptions {
  file?: string;
  force?: boolean;
}

const DEFAULT_BRAINFILE = `---
schema: https://brainfile.md/v1/board.json
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
    // Default to the new directory structure
    const filePath = path.resolve(options.file || path.join('.brainfile', 'brainfile.md'));

    // Ensure `.brainfile/.gitignore` ignores state.json by default
    ensureDotBrainfileGitignore(filePath);

    // Check if file already exists
    if (fs.existsSync(filePath) && !options.force) {
      console.error(chalk.red(`Error: File already exists: ${filePath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Write the default brainfile
    fs.writeFileSync(filePath, DEFAULT_BRAINFILE, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Brainfile initialized successfully!'));
    console.log('');
    console.log(chalk.gray(`  Created: ${filePath}`));
    console.log('');
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. Edit your brainfile to customize your project'));
    console.log(chalk.gray('  2. Add tasks: brainfile add --title "Your task"'));
    console.log(chalk.gray('  3. View tasks: brainfile list'));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
