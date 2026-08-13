import React from 'react';
import { render } from 'ink';
import * as fs from 'fs';
import chalk from 'chalk';
import { BrainfileTUI } from '../tui/index.js';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { shouldSuggestV2Migration, markV2MigrationHintShown } from '../utils/v2-detect';

interface TuiOptions {
  file: string;
}

export async function tuiCommand(options: TuiOptions) {
  const filePath = resolveCliBrainfilePath(options.file);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error('Create a board with: brainfile init');
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    console.error('The board needs an interactive terminal.');
    console.error('Run this in a real terminal, not a pipe.');
    process.exit(1);
  }

  if (shouldSuggestV2Migration(filePath)) {
    console.log(
      chalk.yellow('⚠ Legacy brainfile layout detected. ') +
      chalk.gray('Run ') +
      chalk.cyan('brainfile migrate') +
      chalk.gray(' to upgrade to the v2 board/logs structure.')
    );
    console.log('');
    markV2MigrationHintShown(filePath);
  }

  const { waitUntilExit } = render(<BrainfileTUI filePath={filePath} />);

  // Wait for app to exit, then clear screen
  await waitUntilExit();

  // Clear screen and reset cursor to top-left
  process.stdout.write('\x1b[2J');   // Clear entire screen
  process.stdout.write('\x1b[H');    // Move cursor to home position (top-left)
  process.stdout.write('\x1b[?25h'); // Show cursor (in case it was hidden)
}
