#!/usr/bin/env node

import { renderCliError } from './utils/cli-error';
import { existsSync, realpathSync } from 'fs';
import { useBrainfile } from '@brainfile/core/dispatch';
import { sep } from 'path';
import { installAutosync } from './utils/board-autosync';
import { SUBCOMMANDS, createProgram, runTui } from './program';

/** The file's real path, or null when it is not there. */
function realpathOr(file: string): string | null {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
}

// Check if first arg looks like a file path (not a subcommand or flag)
function shouldLaunchTUI(): { launch: boolean; file: string } {
  const args = process.argv.slice(2);

  // No args → TUI with default file
  if (args.length === 0) {
    return { launch: true, file: 'brainfile.md' };
  }

  const firstArg = args[0];

  // If first arg is a flag, let commander handle it
  if (firstArg.startsWith('-')) {
    // Handle -f/--file flag for TUI
    if (args.length >= 2 && (firstArg === '-f' || firstArg === '--file')) {
      return { launch: true, file: args[1] };
    }
    return { launch: false, file: '' };
  }

  // If first arg is a known subcommand, don't launch TUI
  if (SUBCOMMANDS.includes(firstArg)) {
    return { launch: false, file: '' };
  }

  // If first arg looks like a file/directory path, launch TUI with it.
  // Directories are resolved to their .brainfile/brainfile.md by resolveCliBrainfilePath.
  if (firstArg.includes('.') || firstArg.includes('/') || firstArg.endsWith(sep) || existsSync(firstArg)) {
    return { launch: true, file: firstArg };
  }

  // Otherwise let commander handle it (will show help for unknown command)
  return { launch: false, file: '' };
}

const tuiCheck = shouldLaunchTUI();
if (tuiCheck.launch) {
  void runTui({ file: tuiCheck.file }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
} else {

  const program = createProgram();

  // A board commit schedules a push when the board is shared (autosync).
  installAutosync();

  /**
   * The CLI's outermost error boundary.
   *
   * `parseAsync` is an async function awaiting commander's action chain, so a
   * synchronous `throw` from a sync action handler and a rejected promise
   * from an async one both arrive here as one rejection. `program.parse()`
   * could catch neither: a `CLIError` thrown by a command (15 command files
   * throw them, and 7 have no local try/catch at all) escaped as an uncaught
   * exception and printed a raw stack trace, and the async commands wired
   * directly as `.action(fn)` printed unhandled-rejection noise.
   */
  // Always node's argv (node, script, args…): run by an Electron binary as node (ELECTRON_RUN_AS_NODE,
  // as the desktop runs its own copy for its agents), commander would otherwise take the script for a command.
  // Runners this command starts (run, dispatch --now, discuss) give their agents this very CLI as their board
  // server, not whichever brainfile is first on PATH, which may be an older one without the dispatch tools.
  const self = process.argv[1] ? realpathOr(process.argv[1]) : null;
  // Run as node by an Electron binary (the desktop's copy), its children need telling so too.
  const asNode = process.env.ELECTRON_RUN_AS_NODE ? { env: { ELECTRON_RUN_AS_NODE: '1' } } : {};
  if (self) useBrainfile(() => ({ launch: { command: process.execPath, args: [self], ...asNode } }));
  program.parseAsync(process.argv, { from: 'node' }).catch(renderCliError);

} // end else block for CLI commands
