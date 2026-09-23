/**
 * `brainfile migrate --to-branch` / `--to-plain` (spec-9, phase 1).
 *
 * Moves an existing board between plain-directory storage and tracked storage
 * (a linked worktree on the board branch inside a repo, or a standalone
 * repository outside one). Every path preserves the board's files as they are
 * on disk, uncommitted edits included; the committed-on-main case also
 * preserves its history through `git subtree split`. A failed `--to-branch`
 * rolls back everything it did, so the repository is left as it was found.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { findBrainfile } from '@brainfile/core';
import {
  boardBranch,
  boardIsDirty,
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
    // verbatimSymlinks: a relative link must not be rewritten to point into the copy being deleted.
    fs.cpSync(path.join(from, entry), path.join(to, entry), { recursive: true, force: true, verbatimSymlinks: true });
  }
}

/**
 * Make `to` hold exactly what `from` holds on disk (its `.git` aside): files
 * edited, added, or deleted since the last commit all carry over.
 */
function mirrorBoardContents(from: string, to: string): void {
  for (const entry of fs.readdirSync(to)) {
    if (SKIP_TOP_LEVEL.has(entry)) continue;
    fs.rmSync(path.join(to, entry), { recursive: true, force: true });
  }
  copyBoardContents(from, to);
}

/** Every board file (local-only `state/` excluded) mapped to a sha256 of its contents. */
function hashBoardFiles(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (prefix === '' && (SKIP_TOP_LEVEL.has(entry.name) || entry.name === STATE_DIR)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isSymbolicLink()) out.set(rel, `link:${fs.readlinkSync(full)}`);
      else out.set(rel, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
    }
  };
  walk(dir, '');
  return out;
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

/**
 * Every original file must be in the migrated board with the same contents.
 * The move may add `.gitattributes` (merge strategies, appended to an
 * existing one) and `.gitkeep` files; nothing else may differ. Throws on a
 * mismatch and leaves both copies in place for the caller to roll back.
 */
function verifyBoardContents(aside: string, dotDir: string): void {
  const before = hashBoardFiles(aside);
  const after = hashBoardFiles(dotDir);
  const problems: string[] = [];
  for (const [file, hash] of before) {
    if (!after.has(file)) problems.push(`missing ${file}`);
    else if (after.get(file) === hash) continue;
    else if (file === '.gitattributes' && attributesExtend(aside, dotDir)) continue;
    else problems.push(`changed ${file}`);
  }
  for (const file of after.keys()) {
    if (before.has(file)) continue;
    if (file === '.gitattributes' || file.endsWith('/.gitkeep')) continue;
    problems.push(`unexpected ${file}`);
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5).join(', ');
    const more = problems.length > 5 ? ` (+${problems.length - 5} more)` : '';
    throw new Error(`Board contents differ after migration: ${shown}${more}.`);
  }
}

function attributesExtend(aside: string, dotDir: string): boolean {
  const lines = (dir: string) => fs.readFileSync(path.join(dir, '.gitattributes'), 'utf-8').split('\n').map((l) => l.trim());
  const after = new Set(lines(dotDir));
  return lines(aside).every((line) => after.has(line));
}

/** Staged changes under `relPath` as a binary patch, untrimmed so it applies back verbatim. */
function stagedPatch(relPath: string, repoRoot: string): string {
  const r = spawnSync('git', ['diff', '--cached', '--binary', '--', relPath], { cwd: repoRoot, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout : '';
}

/** `git apply --cached` with a patch on stdin. */
function applyToIndex(patch: string, repoRoot: string): boolean {
  const r = spawnSync('git', ['apply', '--cached', '--binary', '-'], { cwd: repoRoot, input: patch, encoding: 'utf-8' });
  return r.status === 0;
}

/**
 * Undo log for `--to-branch`. Each step that changes the repository records
 * itself; `undo()` reverses them so a failure leaves the repo as it was found.
 */
class MigrationRollback {
  private branchMayExist = false;
  private indexChanged = false;
  private stagedBefore = '';
  private movedAside = false;

  constructor(
    private readonly repoRoot: string,
    private readonly dotDir: string,
    private readonly aside: string,
    private readonly branch: string,
    private readonly relDotDir: string
  ) {}

  /** Call just before anything may create the board branch (it did not exist when the migration started). */
  creatingBranch(): void {
    this.branchMayExist = true;
  }

  /** Call just before unstaging the board from the code branch. */
  changingIndex(): void {
    // Board changes the user had already staged are put back as they were.
    this.stagedBefore = stagedPatch(this.relDotDir, this.repoRoot);
    this.indexChanged = true;
  }

  moveAside(): void {
    fs.renameSync(this.dotDir, this.aside);
    this.movedAside = true;
  }

  /** Reverse every recorded step. Returns what could not be undone (empty when fully restored). */
  undo(): string[] {
    const problems: string[] = [];
    const attempt = (what: string, step: () => void) => {
      try {
        step();
      } catch (error) {
        problems.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    // Once the original is aside, whatever sits at dotDir was made by this
    // migration. Judge by what exists, not by what reported success: `git
    // worktree add` can register the worktree and still fail (a failing
    // post-checkout hook, for one).
    if (this.movedAside && boardRepoKind(this.dotDir) === 'linked') {
      attempt('remove the board worktree', () => {
        const removed = git(['worktree', 'remove', '--force', this.dotDir], this.repoRoot);
        if (!removed.ok) fs.rmSync(this.dotDir, { recursive: true, force: true });
      });
    }
    if (this.movedAside) attempt(`move ${this.aside} back`, () => restoreAside(this.aside, this.dotDir));
    // The branch did not exist before, so a worktree still claiming it is ours and now stale.
    if (this.branchMayExist && listWorktrees(this.repoRoot).some((w) => w.branch === `refs/heads/${this.branch}`)) {
      git(['worktree', 'prune'], this.repoRoot);
    }
    if (this.branchMayExist && git(['rev-parse', '--verify', '--quiet', `refs/heads/${this.branch}`], this.repoRoot).ok) {
      attempt(`delete branch '${this.branch}'`, () => {
        const deleted = git(['branch', '-D', this.branch], this.repoRoot);
        if (!deleted.ok) throw new Error(deleted.stderr);
      });
    }
    if (this.indexChanged) {
      attempt(`restore the index for ${this.relDotDir}`, () => {
        const reset = git(['reset', '-q', '--', this.relDotDir], this.repoRoot);
        if (!reset.ok) throw new Error(reset.stderr);
        if (this.stagedBefore && !applyToIndex(this.stagedBefore, this.repoRoot)) {
          throw new Error('could not re-stage the board changes that were staged before');
        }
      });
    }
    return problems;
  }
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
  const rollback = new MigrationRollback(repoRoot, dotDir, aside, branch, relDotDir);
  let done: string;
  let uncommittedImported = false;

  try {
    if (trackedOnCodeBranch) {
      // History-preserving split of the board's commits onto the new branch.
      rollback.creatingBranch();
      const split = git(['subtree', 'split', '--quiet', `--prefix=${relDotDir}`, '-b', branch], repoRoot);
      if (!split.ok) {
        console.log(chalk.yellow('git subtree is unavailable; importing the board without its history.'));
      }
      rollback.changingIndex();
      const rm = git(['rm', '-r', '--quiet', '--cached', relDotDir], repoRoot);
      if (!rm.ok) throw new Error(`git rm --cached failed: ${rm.stderr}`);
      rollback.moveAside();
      if (split.ok) {
        const add = git(['worktree', 'add', '--quiet', dotDir, branch], repoRoot);
        if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr || `exit status ${add.status}`}.`);
        // The split carries committed history only. Bring the board over as it
        // is on disk (uncommitted edits, new or git-ignored files, deletions)
        // and record the difference as one commit on top of that history.
        mirrorBoardContents(aside, dotDir);
        if (boardIsDirty(dotDir)) {
          if (!commitBoard(dotDir, { message: 'import uncommitted board changes' }) || boardIsDirty(dotDir)) {
            throw new Error('Could not commit the uncommitted board changes on the board branch.');
          }
          uncommittedImported = true;
        }
      } else {
        createOrphanBoardWorktree(repoRoot, dotDir, branch);
        mirrorBoardContents(aside, dotDir);
        ensureBoardAttributes(dotDir);
        registerMergeDriver(dotDir);
        commitBoard(dotDir, { message: 'import board' });
      }
      verifyBoardContents(aside, dotDir);
      done = `Board moved to branch '${branch}'${split.ok ? ' with its history' : ''}.`;
    } else if (kind === 'standalone') {
      // Fold the standalone repository's history into the outer repo as the board branch.
      rollback.creatingBranch();
      const fetch = git(['fetch', '--quiet', dotDir, `HEAD:refs/heads/${branch}`], repoRoot);
      if (!fetch.ok) throw new Error(`Could not import the board's history: ${fetch.stderr}`);
      rollback.moveAside();
      const add = git(['worktree', 'add', '--quiet', dotDir, branch], repoRoot);
      if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr || `exit status ${add.status}`}.`);
      // Uncommitted work in the standalone repo comes along too.
      mirrorBoardContents(aside, dotDir);
      ensureBoardAttributes(dotDir);
      registerMergeDriver(dotDir);
      commitBoard(dotDir, { message: 'import board' });
      verifyBoardContents(aside, dotDir);
      done = `Board history folded into branch '${branch}'.`;
    } else {
      // Plain, untracked (usually gitignored) directory: import as an orphan branch.
      rollback.moveAside();
      rollback.creatingBranch();
      createOrphanBoardWorktree(repoRoot, dotDir, branch);
      mirrorBoardContents(aside, dotDir);
      ensureBoardAttributes(dotDir);
      registerMergeDriver(dotDir);
      commitBoard(dotDir, { message: 'import board' });
      verifyBoardContents(aside, dotDir);
      done = `Board imported onto branch '${branch}'.`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const leftovers = rollback.undo();
    throw new Error(
      leftovers.length === 0
        ? `${message} Nothing was changed: the board is back where it was.`
        : `${message} Rolling back was incomplete; could not ${leftovers.join('; ')}. The original board is in ${fs.existsSync(aside) ? aside : dotDir}.`
    );
  }

  fs.rmSync(aside, { recursive: true, force: true });
  ensureExcludeEntry(repoRoot);
  console.log(chalk.green(done));
  if (uncommittedImported) {
    console.log(chalk.gray('  Board changes that were not committed yet came along as one more commit on that branch.'));
  }
  if (trackedOnCodeBranch) {
    if (options.commit) {
      const commit = git(['commit', '--quiet', '--no-verify', '-m', `chore: move the board to the ${branch} branch`], repoRoot);
      if (!commit.ok) throw new Error(`Could not commit the removal on the code branch: ${commit.stderr}`);
      console.log(chalk.gray('  The old copy on your code branch was removed in a commit; the board itself is on its own branch.'));
    } else {
      console.log(chalk.gray('  Your code branch still tracks the old copy. It is staged to be dropped there (the board itself is safe). Commit that:'));
      console.log(chalk.cyan(`    git commit -m "chore: move the board to the ${branch} branch"`));
    }
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
