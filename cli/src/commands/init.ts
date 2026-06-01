import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureDotBrainfileGitignore, removeLegacyStateFile } from '../utils/dot-brainfile';
import { probeWorkspaceFormat, workspaceRootFromBrainfilePath } from '../utils/workspace-format';

const DEFAULT_BRAINFILE_V2 = `---
schema: https://brainfile.md/v2/board.json
title: My Project
agent:
  instructions:
    - Task files are individual .md files in board/
    - Completed tasks are in logs/
    - Preserve all IDs
    - Make minimal changes
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---

# My Project

Add your project description here.

> Note: Completing a task moves it to \`logs/\` via \`brainfile complete\`.
`;

interface InitOptions {
  file?: string;
  force?: boolean;
}

export function initCommand(options: InitOptions) {
  try {
    const filePath = path.resolve(options.file || path.join('.brainfile', 'brainfile.md'));
    const dotDir = path.dirname(filePath);
    const workspaceRoot = workspaceRootFromBrainfilePath(filePath);
    const probe = probeWorkspaceFormat(workspaceRoot);

    if (probe.format === 'legacy-root' || probe.format === 'legacy-dotbrainfile' || probe.format === 'mixed') {
      console.error(chalk.yellow('Legacy brainfile layout detected.'));
      console.log(chalk.gray('Run ') + chalk.cyan('brainfile migrate') + chalk.gray(' before running init.'));
      process.exit(1);
    }

    if (probe.format === 'v2' && fs.existsSync(filePath) && !options.force) {
      // Idempotent init for already-migrated workspaces
      ensureDotBrainfileGitignore(filePath);
      removeLegacyStateFile(filePath);
      fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
      fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });

      console.log(chalk.green('Brainfile already initialized (v2).'));
      console.log(chalk.gray(`  ${filePath}`));
      return;
    }

    // Ensure `.brainfile/.gitignore` exists
    ensureDotBrainfileGitignore(filePath);

    if (fs.existsSync(filePath) && !options.force) {
      console.error(chalk.red(`Error: File already exists: ${filePath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      process.exit(1);
    }

    fs.mkdirSync(dotDir, { recursive: true });

    const boardDir = path.join(dotDir, 'board');
    const logsDir = path.join(dotDir, 'logs');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(filePath, DEFAULT_BRAINFILE_V2, 'utf-8');

    removeLegacyStateFile(filePath);

    console.log(chalk.green('Brainfile initialized successfully!'));
    console.log('');
    console.log(chalk.gray(`  Created: ${filePath}`));
    console.log(chalk.gray(`  Created: ${boardDir}/`));
    console.log(chalk.gray(`  Created: ${logsDir}/`));
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
