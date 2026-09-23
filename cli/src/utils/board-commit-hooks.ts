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
import { syncMessage } from './board-sync';

interface CommandLike {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: CommandLike | null;
}

/** Long-running or board-unrelated commands that manage their own commits, or none. */
const SKIP_COMMANDS = new Set(['mcp', 'tui', 'hooks', 'auth', 'sync', 'merge-driver', 'where']);

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

export function beforeCommand(command: CommandLike): boolean {
  const dotDir = boardDirForCommand(command);
  if (!dotDir) return false;
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
