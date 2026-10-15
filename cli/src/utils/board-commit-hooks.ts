/**
 * Commander hooks that turn every CLI mutation into one commit on a tracked
 * board (spec-9). `beforeCommand` commits hand edits on their own so they are
 * never folded into the command's commit; `afterCommand` commits whatever the
 * command changed, authored by the git user and tagged with the agent, if any.
 */
import { commitBoard, commitHandEdits, describeCommandForCommit } from './board-repo';
import { detectAgent } from './actor';
import { tryResolveBoardDir } from './brainfile-path';
import { fetchBeforeRead } from './board-autosync';
import { boardConflict, boardConflictError, syncMessage } from './board-sync';
import { CLIError } from './cli-error';

interface CommandLike {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: CommandLike | null;
}

/** Long-running or board-unrelated commands that manage their own commits, or none. */
const SKIP_COMMANDS = new Set(['mcp', 'tui', 'hooks', 'auth', 'sync', 'merge-driver', 'where', 'adopt', 'merge-boards', 'backups', 'fix']);

export function topLevelCommandName(command: CommandLike): string {
  let cursor: CommandLike = command;
  let name = command.name();
  while (cursor.parent && cursor.parent.parent) {
    cursor = cursor.parent;
    name = cursor.name();
  }
  return name;
}

export function boardDirForCommand(command: CommandLike): string | null {
  if (SKIP_COMMANDS.has(topLevelCommandName(command))) return null;
  const file = command.opts().file;
  return tryResolveBoardDir(typeof file === 'string' ? file : undefined);
}

/**
 * Commands that never change the board, or that change how it is stored
 * rather than what it says. With SKIP_COMMANDS (which includes the commands
 * that settle which board is the board, spec-15), everything else is a write.
 */
const READ_COMMANDS = new Set(['list', 'show', 'search', 'check', 'schema', 'log', 'brief', 'index', 'config', 'init', 'migrate']);
const READ_SUBCOMMANDS = new Set(['plan list', 'plan show', 'contract graph', 'contract validate', 'columns list']);

/** Will this invocation change the board? */
export function commandWrites(command: CommandLike): boolean {
  const top = topLevelCommandName(command);
  if (SKIP_COMMANDS.has(top) || READ_COMMANDS.has(top)) return false;
  if (command.name() !== top && READ_SUBCOMMANDS.has(`${top} ${command.name()}`)) return false;
  const opts = command.opts();
  switch (top) {
    case 'types': {
      const action = command.args[0];
      return action === 'add';
    }
    case 'template':
      return typeof opts.use === 'string';
    case 'lint':
      return opts.fix === true;
    default:
      return true;
  }
}

/**
 * Refuse a write while another board in the repository disagrees with this
 * one: writing to either would only widen the gap. Throws a CLIError that
 * names the command to settle it.
 */
export function guardBoardWrite(command: CommandLike, dotDir: string): void {
  if (!commandWrites(command)) return;
  const conflict = boardConflict(dotDir);
  if (conflict) throw new CLIError(boardConflictError(conflict));
}

export function beforeCommand(command: CommandLike): boolean {
  const dotDir = boardDirForCommand(command);
  if (!dotDir) return false;
  guardBoardWrite(command, dotDir);
  const committed = commitHandEdits(dotDir);
  // autosync=full: reads see other machines' work when the last sync is stale.
  const fetched = fetchBeforeRead(dotDir);
  if (fetched && !fetched.ok) process.stderr.write(`${syncMessage(fetched).text}\n`);
  return committed;
}

export function afterCommand(command: CommandLike): boolean {
  const dotDir = boardDirForCommand(command);
  if (!dotDir) return false;
  return commitBoard(dotDir, { message: describeCommandForCommit(command), agent: detectAgent()?.name });
}
