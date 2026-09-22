/**
 * `brainfile migrate --to-branch` / `--to-plain` (spec-9, phase 1).
 *
 * Moves an existing board between plain-directory storage and tracked storage
 * (a linked worktree on the board branch inside a repo, or a standalone
 * repository outside one). Every path preserves the board's files; the
 * committed-on-main case preserves its history through `git subtree split`.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { findBrainfile } from '@brainfile/core';
import {
  boardBranch,
  boardRepoKind,
  commitBoard,
  createOrphanBoardWorktree,
  ensureExcludeEntry,
  git,
  gitToplevel,
  initStandaloneBoardRepo,
  listWorktrees,
  removeExcludeEntry,
} from '../utils/board-repo';
import { ensureBoardAttributes, registerMergeDriver } from '../utils/board-sync';

export interface MigrateTrackedOptions {
  dir?: string;
  /** After `--to-branch` on a committed board, also commit its removal from the code branch. */
  commit?: boolean;
}

const SKIP_TOP_LEVEL = new Set(['.git']);
const STATE_DIR = 'state';

function locateBoard(rootDir: string): string {
  const found = findBrainfile(rootDir, { stopAtGitRoot: true });
  if (!found || found.kind !== 'dotdir') {
    throw new Error(`No .brainfile/ board found from ${rootDir}.`);
  }
  return path.dirname(found.absolutePath);
}

function copyBoardContents(from: string, to: string): void {
  for (const entry of fs.readdirSync(from)) {
    if (SKIP_TOP_LEVEL.has(entry)) continue;
    fs.cpSync(path.join(from, entry), path.join(to, entry), { recursive: true, force: true });
  }
}

function listBoardFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (prefix === '' && (SKIP_TOP_LEVEL.has(entry.name) || entry.name === STATE_DIR)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

function asidePath(dotDir: string): string {
  const candidate = `${dotDir}.migrating`;
  if (fs.existsSync(candidate)) throw new Error(`${candidate} already exists; remove it before migrating.`);
  return candidate;
}

function restoreAside(aside: string, dotDir: string): void {
  if (fs.existsSync(dotDir)) fs.rmSync(dotDir, { recursive: true, force: true });
  fs.renameSync(aside, dotDir);
}

function verifyAndFinish(aside: string, dotDir: string): void {
  // The board branch gains `.gitattributes` (merge strategies) during the
  // move; every original file must still be present.
  const before = listBoardFiles(aside);
  const added = (f: string) => (f === '.gitattributes' || f.endsWith('/.gitkeep')) && !before.includes(f);
  const after = listBoardFiles(dotDir).filter((f) => !added(f));
  if (before.join('\n') !== after.join('\n')) {
    restoreAside(aside, dotDir);
    throw new Error('Board contents differ after migration; the original directory was restored.');
  }
  const state = path.join(aside, STATE_DIR);
  if (fs.existsSync(state)) fs.cpSync(state, path.join(dotDir, STATE_DIR), { recursive: true, force: true });
  fs.rmSync(aside, { recursive: true, force: true });
}

export function migrateToBranch(options: MigrateTrackedOptions = {}): void {
  const rootDir = path.resolve(options.dir || process.cwd());
  const dotDir = locateBoard(rootDir);
  const kind = boardRepoKind(dotDir);
  const repoRoot = gitToplevel(path.dirname(dotDir));

  if (kind === 'linked') {
    console.log(chalk.green('Board is already a worktree on its own branch.'));
    console.log(chalk.gray(`  ${dotDir}`));
    return;
  }

  if (!repoRoot) {
    if (kind === 'standalone') {
      console.log(chalk.green('Board is already its own git repository.'));
      return;
    }
    initStandaloneBoardRepo(dotDir);
    ensureBoardAttributes(dotDir);
    registerMergeDriver(dotDir);
    commitBoard(dotDir, { message: 'import board' });
    console.log(chalk.green('Board is now its own git repository.'));
    printMigratedStory(dotDir, null);
    return;
  }

  const branch = boardBranch(repoRoot);
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).ok) {
    const checkedOut = listWorktrees(repoRoot).find((w) => w.branch === `refs/heads/${branch}`);
    throw new Error(
      checkedOut
        ? `Branch '${branch}' is already checked out at ${checkedOut.path}.`
        : `Branch '${branch}' already exists. Delete it (git branch -D ${branch}) or set brainfile.branch to another name.`
    );
  }

  const relDotDir = path.relative(repoRoot, dotDir).split(path.sep).join('/');
  const trackedOnCodeBranch = git(['ls-files', '--error-unmatch', relDotDir], repoRoot).ok;
  const aside = asidePath(dotDir);

  if (trackedOnCodeBranch) {
    // History-preserving split of the board's commits onto the new branch.
    const split = git(['subtree', 'split', '--quiet', `--prefix=${relDotDir}`, '-b', branch], repoRoot);
    if (!split.ok) {
      console.log(chalk.yellow('git subtree is unavailable; importing the board without its history.'));
    }
    const rm = git(['rm', '-r', '--quiet', '--cached', relDotDir], repoRoot);
    if (!rm.ok) throw new Error(`git rm --cached failed: ${rm.stderr}`);
    fs.renameSync(dotDir, aside);
    if (split.ok) {
      const add = git(['worktree', 'add', '--quiet', dotDir, branch], repoRoot);
      if (!add.ok) {
        restoreAside(aside, dotDir);
        throw new Error(`git worktree add failed: ${add.stderr}`);
      }
    } else {
      createOrphanBoardWorktree(repoRoot, dotDir, branch);
      copyBoardContents(aside, dotDir);
      ensureBoardAttributes(dotDir);
      registerMergeDriver(dotDir);
      commitBoard(dotDir, { message: 'import board' });
    }
    verifyAndFinish(aside, dotDir);
    ensureExcludeEntry(repoRoot);
    console.log(chalk.green(`Board moved to branch '${branch}'${split.ok ? ' with its history' : ''}.`));
    if (options.commit) {
      const commit = git(['commit', '--quiet', '--no-verify', '-m', `chore: move the board to the ${branch} branch`], repoRoot);
      if (!commit.ok) throw new Error(`Could not commit the removal on the code branch: ${commit.stderr}`);
      console.log(chalk.gray('  The old copy on your code branch was removed in a commit; the board itself is on its own branch.'));
    } else {
      console.log(chalk.gray('  Your code branch still tracks the old copy. It is staged to be dropped there (the board itself is safe). Commit that:'));
      console.log(chalk.cyan(`    git commit -m "chore: move the board to the ${branch} branch"`));
    }
  } else if (kind === 'standalone') {
    // Fold the standalone repository's history into the outer repo as the board branch.
    const fetch = git(['fetch', '--quiet', dotDir, `HEAD:refs/heads/${branch}`], repoRoot);
    if (!fetch.ok) throw new Error(`Could not import the board's history: ${fetch.stderr}`);
    fs.renameSync(dotDir, aside);
    const add = git(['worktree', 'add', '--quiet', dotDir, branch], repoRoot);
    if (!add.ok) {
      git(['branch', '-D', branch], repoRoot);
      restoreAside(aside, dotDir);
      throw new Error(`git worktree add failed: ${add.stderr}`);
    }
    // Uncommitted work in the standalone repo comes along too.
    copyBoardContents(aside, dotDir);
    ensureBoardAttributes(dotDir);
    registerMergeDriver(dotDir);
    commitBoard(dotDir, { message: 'import board' });
    verifyAndFinish(aside, dotDir);
    ensureExcludeEntry(repoRoot);
    console.log(chalk.green(`Board history folded into branch '${branch}'.`));
  } else {
    // Plain, untracked (usually gitignored) directory: import as an orphan branch.
    fs.renameSync(dotDir, aside);
    try {
      createOrphanBoardWorktree(repoRoot, dotDir, branch);
    } catch (error) {
      restoreAside(aside, dotDir);
      throw error;
    }
    copyBoardContents(aside, dotDir);
    ensureBoardAttributes(dotDir);
    registerMergeDriver(dotDir);
    commitBoard(dotDir, { message: 'import board' });
    verifyAndFinish(aside, dotDir);
    ensureExcludeEntry(repoRoot);
    console.log(chalk.green(`Board imported onto branch '${branch}'.`));
  }
  printMigratedStory(dotDir, branch);
}

function printMigratedStory(dotDir: string, branch: string | null): void {
  const say = (text = '') => console.log(text ? `  ${text}` : '');
  say();
  say(`Same files, same place: ${path.relative(process.cwd(), dotDir) || '.'}/`);
  if (branch) {
    say(`Every change is now a git commit on a separate '${branch}' branch, kept out`);
    say('of your code and pull requests. Only on this machine until you share it.');
    say(chalk.gray('(A plain git push never sends it; git push --all or --mirror would.)'));
  } else {
    say('Every change is now a git commit. It is only on this machine until you share it.');
  }
  say();
  say(`${chalk.gray('Share it:')}   ${chalk.cyan('brainfile sync --set-remote origin')}`);
  say(`${chalk.gray('Check it:')}   ${chalk.cyan('brainfile where')}`);
}

export function migrateToPlain(options: MigrateTrackedOptions = {}): void {
  const rootDir = path.resolve(options.dir || process.cwd());
  const dotDir = locateBoard(rootDir);
  const kind = boardRepoKind(dotDir);

  if (kind === null) {
    console.log(chalk.green('Board is already a plain directory.'));
    return;
  }

  if (kind === 'standalone') {
    fs.rmSync(path.join(dotDir, '.git'), { recursive: true, force: true });
    console.log(chalk.green('Board is now a plain directory (its git history was removed).'));
    return;
  }

  const repoRoot = gitToplevel(path.dirname(dotDir));
  if (!repoRoot) throw new Error('Could not find the repository that owns this board worktree.');
  const branch = boardBranch(repoRoot);
  const aside = asidePath(dotDir);
  fs.mkdirSync(aside);
  copyBoardContents(dotDir, aside);
  const remove = git(['worktree', 'remove', '--force', dotDir], repoRoot);
  if (!remove.ok) {
    fs.rmSync(aside, { recursive: true, force: true });
    throw new Error(`git worktree remove failed: ${remove.stderr}`);
  }
  fs.renameSync(aside, dotDir);
  removeExcludeEntry(repoRoot);
  console.log(chalk.green('Board is now a plain directory.'));
  console.log(chalk.gray(`  Branch '${branch}' still holds its history. Delete it with: git branch -D ${branch}`));
  console.log(chalk.gray('  Add .brainfile/ to .gitignore if it should stay out of the code branch.'));
}
