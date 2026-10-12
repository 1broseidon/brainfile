/**
 * Board-on-a-branch storage (spec-9) lives in `@brainfile/core/repo` so every
 * frontend commits the same way; this module re-exports it and adds what
 * only the CLI needs: `-g` detection and commit messages built from a
 * commander invocation.
 */
import { oneLine } from '@brainfile/core/repo';

export {
  DEFAULT_BOARD_BRANCH,
  BOARD_BRANCH_CONFIG_KEY,
  BOARD_REF_NAMESPACE,
  BOARD_NAME_CONFIG_KEY,
  LEGACY_REMOTE_BRANCH_CONFIG_KEY,
  DEFAULT_BOARD_NAME,
  remoteBoardRef,
  boardTrackingRef,
  gitNetwork,
  git,
  gitToplevel,
  gitCommonDir,
  listWorktrees,
  boardBranch,
  boardRepoKind,
  isTrackedBoard,
  findTrackedBoardDir,
  listRemoteBoards,
  pruneLostBoardCheckouts,
  materializeBoardWorktree,
  ensureExcludeEntry,
  removeExcludeEntry,
  createOrphanBoardWorktree,
  initStandaloneBoardRepo,
  boardIsDirty,
  boardHasCommits,
  unmergedFiles,
  boardDirtyFiles,
  onBoardCommitted,
  ensureBoardDirs,
  commitBoard,
  commitHandEdits,
  homeBoardDir,
  scheduleBoardCommit,
  flushBoardCommits,
  type GitResult,
  type WorktreeEntry,
  type BoardRepoKind,
  type MaterializeOptions,
  type CommitBoardOptions,
} from '@brainfile/core/repo';

export function isGlobalBoardRequested(argv: string[] = process.argv): boolean {
  if (process.env.BRAINFILE_GLOBAL === '1') return true;
  return argv.includes('-g') || argv.includes('--global');
}

interface CommandLike {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: CommandLike | null;
}

/**
 * Commit message for a CLI invocation: `<verb> <id>: <detail>`, e.g.
 * `move task-3: in-progress`, `add: Fix login bug`, `contract pickup task-2`.
 */
export function describeCommandForCommit(command: CommandLike): string {
  const names: string[] = [];
  let cursor: CommandLike | null | undefined = command;
  while (cursor && cursor.parent) {
    names.unshift(cursor.name());
    cursor = cursor.parent;
  }
  const opts = command.opts();
  const idValue = opts.task ?? opts.taskId;
  const id = Array.isArray(idValue) ? idValue.join(',') : typeof idValue === 'string' ? idValue : '';
  const positional = command.args.filter((a) => typeof a === 'string' && a.length > 0);
  const detail = [opts.title, opts.column, positional.join(' ')]
    .find((v): v is string => typeof v === 'string' && v.length > 0) ?? '';
  const head = `${names.join(' ')}${id ? ` ${id}` : ''}`;
  return oneLine(detail ? `${head}: ${detail}` : head);
}
