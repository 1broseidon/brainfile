import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureDotBrainfileGitignore } from '@brainfile/core';
import { removeLegacyStateFile } from '../utils/dot-brainfile';
import { probeWorkspaceFormat, workspaceRootFromBrainfilePath } from '../utils/workspace-format';
import {
  boardBranch,
  boardRepoKind,
  commitBoard,
  createOrphanBoardWorktree,
  ensureExcludeEntry,
  gitToplevel,
  homeBoardDir,
  initStandaloneBoardRepo,
  isGlobalBoardRequested,
} from '../utils/board-repo';
import { ensureBoardAttributes, registerMergeDriver } from '../utils/board-sync';

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

const DEFAULT_FILE = path.join('.brainfile', 'brainfile.md');

interface InitOptions {
  file?: string;
  force?: boolean;
  /** Store the board as its own git branch (in a repo) or repository (elsewhere). */
  tracked?: boolean;
  /** Plain directory, no git tracking, even inside a repo. */
  plain?: boolean;
  /** Inside a repo: create the board here instead of at the repository root. */
  here?: boolean;
  /** The home board at ~/.brainfile. */
  global?: boolean;
}

/**
 * How the board directory is stored (spec-9):
 * - `plain`: a directory, as before.
 * - `linked`: a git worktree on the board branch of the surrounding repo.
 * - `standalone`: its own git repository (boards outside any repo, the home board).
 */
type StorageMode = 'plain' | 'linked' | 'standalone';

interface InitPlan {
  filePath: string;
  mode: StorageMode;
  repoRoot: string | null;
  /** True when init ran in a subdirectory and the board was placed at the repo root. */
  movedToRoot: boolean;
}

function planInit(options: InitOptions): InitPlan {
  const explicitFile = Boolean(options.file) && path.resolve(options.file as string) !== path.resolve(DEFAULT_FILE);

  if (options.global || (!explicitFile && isGlobalBoardRequested())) {
    return {
      filePath: path.join(homeBoardDir(), 'brainfile.md'),
      mode: options.plain ? 'plain' : 'standalone',
      repoRoot: null,
      movedToRoot: false,
    };
  }

  if (explicitFile) {
    return {
      filePath: path.resolve(options.file as string),
      mode: options.tracked ? 'standalone' : 'plain',
      repoRoot: null,
      movedToRoot: false,
    };
  }

  const cwd = process.cwd();
  const repoRoot = gitToplevel(cwd);
  if (repoRoot && !options.plain) {
    const base = options.here ? cwd : repoRoot;
    const atRoot = path.resolve(base) === repoRoot;
    return {
      filePath: path.join(base, DEFAULT_FILE),
      mode: atRoot ? 'linked' : options.tracked ? 'standalone' : 'plain',
      repoRoot,
      movedToRoot: base !== cwd,
    };
  }

  return {
    filePath: path.join(cwd, DEFAULT_FILE),
    mode: options.tracked ? 'standalone' : 'plain',
    repoRoot,
    movedToRoot: false,
  };
}

function isNonEmptyDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function initCommand(options: InitOptions) {
  try {
    const plan = planInit(options);
    const { filePath, mode } = plan;
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

      console.log(chalk.green(`A board already exists at ${displayPath(dotDir)}/`));
      if (mode !== 'plain' && boardRepoKind(dotDir) === null) {
        console.log(chalk.gray('  It is plain files. To keep it on its own branch and share it: ') + chalk.cyan('brainfile migrate --to-branch'));
      }
      console.log(chalk.gray('  Where it lives and who has it: ') + chalk.cyan('brainfile where'));
      return;
    }

    if (fs.existsSync(filePath) && !options.force) {
      console.error(chalk.red(`Error: File already exists: ${filePath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      process.exit(1);
    }

    if (mode === 'linked') {
      if (isNonEmptyDir(dotDir)) {
        console.error(chalk.red(`Error: ${dotDir} exists and is not empty.`));
        console.log(chalk.gray('To move an existing board onto its own branch: ') + chalk.cyan('brainfile migrate --to-branch'));
        process.exit(1);
      }
      // The worktree must be created before any file lands in the directory.
      createOrphanBoardWorktree(plan.repoRoot as string, dotDir, boardBranch(plan.repoRoot as string));
    }

    // Ensure `.brainfile/.gitignore` exists
    ensureDotBrainfileGitignore(filePath);

    fs.mkdirSync(dotDir, { recursive: true });

    const boardDir = path.join(dotDir, 'board');
    const logsDir = path.join(dotDir, 'logs');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    fs.writeFileSync(filePath, DEFAULT_BRAINFILE_V2, 'utf-8');

    removeLegacyStateFile(filePath);

    if (mode === 'standalone') {
      initStandaloneBoardRepo(dotDir);
    }
    if (mode !== 'plain') {
      if (mode === 'linked') ensureExcludeEntry(plan.repoRoot as string);
      ensureBoardAttributes(dotDir);
      registerMergeDriver(dotDir);
      commitBoard(dotDir, { message: 'init board' });
    }

    printStorageStory(mode, dotDir, plan.repoRoot ? boardBranch(plan.repoRoot) : null, plan.movedToRoot === true);
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function displayPath(dir: string): string {
  const relative = path.relative(process.cwd(), dir);
  return relative && !relative.startsWith('..') ? relative : dir;
}

/**
 * What a person needs right after init: where the board is, who has it, and
 * the one command to change that. Plain words first; git terms only where
 * they are the literal answer.
 */
export function printStorageStory(mode: 'plain' | 'linked' | 'standalone', dotDir: string, branch: string | null, movedToRoot: boolean): void {
  const say = (text = '') => console.log(text ? `  ${text}` : '');
  console.log(chalk.green(`Board created at ${displayPath(dotDir)}/`));
  say();
  if (mode === 'plain') {
    say('Plain files on this machine. Read and edit them directly, or use the commands below.');
  } else if (mode === 'linked') {
    say('Only on this machine for now. Every change is a git commit on a');
    say(`separate '${branch}' branch, kept out of your code and pull requests.`);
    say(chalk.gray(`(A plain git push never sends it; git push --all or --mirror would.)`));
    if (movedToRoot) say(chalk.gray('Created at the repository root so every checkout finds it. Use --plain for a folder board in this directory.'));
  } else {
    say('Only on this machine for now. Every change is a git commit in its');
    say(`own small repository inside ${displayPath(dotDir)}/.`);
  }
  say();
  if (mode !== 'plain') {
    say(`${chalk.gray('Share it:')}   ${chalk.cyan('brainfile sync --set-remote origin')}`);
    say(`${chalk.gray('Check it:')}   ${chalk.cyan('brainfile where')}`);
    say();
  }
  console.log(chalk.gray('Next:'));
  say(chalk.cyan('brainfile add --title "Your first task"'));
  say(chalk.cyan('brainfile list'));
}
