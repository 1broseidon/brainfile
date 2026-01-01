import React from 'react';
import { render } from 'ink';
import * as fs from 'fs';
import { BrainfileTUI } from '../tui/index.js';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

interface TuiOptions {
  file: string;
}

export async function tuiCommand(options: TuiOptions) {
  const filePath = resolveCliBrainfilePath(options.file);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    console.log('');
    console.log('To create a new brainfile, run:');
    console.log('  brainfile init');
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    console.error('Error: Terminal UI requires an interactive terminal');
    console.log('');
    console.log('The TUI cannot run in non-interactive environments.');
    console.log('Please run this command in a standard terminal (not piped or in a non-TTY context).');
    process.exit(1);
  }

  const { waitUntilExit } = render(<BrainfileTUI filePath={filePath} />);

  // Wait for app to exit, then clear screen
  await waitUntilExit();

  // Clear screen and reset cursor to top-left
  process.stdout.write('\x1b[2J');   // Clear entire screen
  process.stdout.write('\x1b[H');    // Move cursor to home position (top-left)
  process.stdout.write('\x1b[?25h'); // Show cursor (in case it was hidden)
}
