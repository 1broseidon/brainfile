import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureDotBrainfileGitignore } from '@brainfile/core';

const DEFAULT_BRAINFILE_V1 = `---
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

const DEFAULT_BRAINFILE_V2 = `---
schema: https://brainfile.md/v2/board.json
title: My Project
agent:
  instructions:
    - Task files are individual .md files in tasks/
    - Completed tasks are in logs/
    - Preserve all IDs
    - Make minimal changes
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: done
    title: Done
    completionColumn: true
---

# My Project

Add your project description here.
`;

interface InitOptions {
  file?: string;
  force?: boolean;
  v2?: boolean;
}

export function initCommand(options: InitOptions) {
  try {
    // Default to the new directory structure
    const filePath = path.resolve(options.file || path.join('.brainfile', 'brainfile.md'));
    const dotDir = path.dirname(filePath);

    // Ensure `.brainfile/.gitignore` ignores state.json by default
    ensureDotBrainfileGitignore(filePath);

    // Check if file already exists
    if (fs.existsSync(filePath) && !options.force) {
      console.error(chalk.red(`Error: File already exists: ${filePath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      process.exit(1);
    }

    fs.mkdirSync(dotDir, { recursive: true });

    // Always create tasks/ and logs/ directories (v2 structure)
    const tasksDir = path.join(dotDir, 'tasks');
    const logsDir = path.join(dotDir, 'logs');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    // Write the default brainfile (v2 format by default now)
    const template = options.v2 === false ? DEFAULT_BRAINFILE_V1 : DEFAULT_BRAINFILE_V2;
    fs.writeFileSync(filePath, template, 'utf-8');

    // Ensure state.json exists
    const statePath = path.join(dotDir, 'state.json');
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(statePath, '{}', 'utf-8');
    }

    // Success message
    console.log(chalk.green('Brainfile initialized successfully!'));
    console.log('');
    console.log(chalk.gray(`  Created: ${filePath}`));
    console.log(chalk.gray(`  Created: ${tasksDir}/`));
    console.log(chalk.gray(`  Created: ${logsDir}/`));
    console.log(chalk.gray(`  Created: ${statePath}`));
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
