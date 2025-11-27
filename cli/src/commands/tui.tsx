import React from 'react';
import { render } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import { BrainfileTUI } from '../tui/index.js';

interface TuiOptions {
  file: string;
}

export function tuiCommand(options: TuiOptions) {
  const filePath = path.resolve(options.file);

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

  render(<BrainfileTUI filePath={filePath} />);
}
