import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Brainfile, ensureDotBrainfileGitignore } from '@brainfile/core';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';
import { ensureV2Dirs } from '../utils/v2-detect';

interface MigrateOptions {
  /** Migration root directory (defaults to cwd) */
  dir?: string;
  force?: boolean;
  /** Convert v1 embedded tasks to v2 per-task files */
  v2?: boolean;
}

/**
 * Migrate a legacy `brainfile.md` in the project root to `.brainfile/brainfile.md`,
 * or convert v1 embedded tasks to v2 per-task file architecture.
 */
export function migrateCommand(options: MigrateOptions = {}) {
  try {
    if (options.v2) {
      migrateToV2(options);
      return;
    }

    // Original migration: root brainfile.md -> .brainfile/brainfile.md
    migrateToDirectory(options);
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Original migration: move root brainfile.md into .brainfile/ directory.
 */
function migrateToDirectory(options: MigrateOptions) {
  const rootDir = path.resolve(options.dir || process.cwd());
  const legacyPath = path.join(rootDir, 'brainfile.md');
  const dotDir = path.join(rootDir, '.brainfile');
  const targetPath = path.join(dotDir, 'brainfile.md');

  if (!fs.existsSync(legacyPath)) {
    console.error(chalk.red(`Error: File not found: ${legacyPath}`));
    console.log(chalk.gray('Nothing to migrate.'));
    process.exit(1);
  }

  if (fs.existsSync(targetPath) && !options.force) {
    console.error(chalk.red(`Error: Target already exists: ${targetPath}`));
    console.log(chalk.gray('Use --force to overwrite'));
    process.exit(1);
  }

  fs.mkdirSync(dotDir, { recursive: true });
  ensureDotBrainfileGitignore(targetPath);

  if (fs.existsSync(targetPath) && options.force) {
    fs.rmSync(targetPath, { force: true });
  }

  // Prefer rename for exact preservation; fall back to copy+unlink on failure.
  try {
    fs.renameSync(legacyPath, targetPath);
  } catch {
    const contents = fs.readFileSync(legacyPath);
    fs.writeFileSync(targetPath, contents);
    fs.rmSync(legacyPath, { force: true });
  }

  console.log(chalk.green('Brainfile migrated successfully!'));
  console.log('');
  console.log(chalk.gray(`  Moved:   ${legacyPath}`));
  console.log(chalk.gray(`  To:      ${targetPath}`));
  console.log('');
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray('  - Your CLI/MCP commands will auto-detect the new location'));
  console.log(chalk.gray('  - Optionally commit `.brainfile/brainfile.md` to git'));
}

/**
 * V2 migration: convert v1 board (embedded tasks in YAML) to v2 per-task files.
 *
 * - Reads all tasks from columns + archive in brainfile.md
 * - Writes each as an individual file in tasks/ (active) or logs/ (done/archived)
 * - Rewrites brainfile.md as config-only (columns without tasks)
 * - Non-destructive: backs up original brainfile.md first
 */
function migrateToV2(options: MigrateOptions) {
  const rootDir = path.resolve(options.dir || process.cwd());

  // Find the brainfile
  let brainfilePath: string;
  const dotPath = path.join(rootDir, '.brainfile', 'brainfile.md');
  const rootPath = path.join(rootDir, 'brainfile.md');

  if (fs.existsSync(dotPath)) {
    brainfilePath = dotPath;
  } else if (fs.existsSync(rootPath)) {
    brainfilePath = rootPath;
  } else {
    console.error(chalk.red('Error: No brainfile found to migrate.'));
    console.log(chalk.gray(`Checked: ${dotPath}`));
    console.log(chalk.gray(`Checked: ${rootPath}`));
    process.exit(1);
    return; // unreachable but for TS
  }

  // Parse the current brainfile
  const content = fs.readFileSync(brainfilePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    console.error(chalk.red(`Error: Failed to parse brainfile: ${parsed.error}`));
    process.exit(1);
    return;
  }

  const board = parsed.board;

  // Back up original file
  const backupPath = brainfilePath + '.v1.bak';
  if (!fs.existsSync(backupPath) || options.force) {
    fs.copyFileSync(brainfilePath, backupPath);
    console.log(chalk.gray(`Backup: ${backupPath}`));
  } else {
    console.log(chalk.gray(`Backup already exists: ${backupPath}`));
  }

  // Ensure v2 directory structure
  const dirs = ensureV2Dirs(brainfilePath);

  let activeCount = 0;
  let logCount = 0;

  // Check for existing tasks/ files to avoid clobbering
  const existingTaskFiles = fs.existsSync(dirs.tasksDir)
    ? fs.readdirSync(dirs.tasksDir).filter(f => f.endsWith('.md'))
    : [];
  const existingLogFiles = fs.existsSync(dirs.logsDir)
    ? fs.readdirSync(dirs.logsDir).filter(f => f.endsWith('.md'))
    : [];

  if ((existingTaskFiles.length > 0 || existingLogFiles.length > 0) && !options.force) {
    console.error(chalk.red('Error: tasks/ or logs/ directory already contains files.'));
    console.log(chalk.gray('Use --force to overwrite.'));
    process.exit(1);
    return;
  }

  // Determine which column IDs are "done"-like
  const doneColumnIds = new Set<string>();
  for (const col of board.columns) {
    if (
      col.completionColumn ||
      /^(done|completed?|finished|closed)$/i.test(col.id) ||
      /^(done|completed?|finished|closed)$/i.test(col.title)
    ) {
      doneColumnIds.add(col.id);
    }
  }

  // Write active tasks and done tasks to files
  for (const col of board.columns) {
    const isDone = doneColumnIds.has(col.id);

    for (let i = 0; i < col.tasks.length; i++) {
      const task = col.tasks[i];

      if (isDone) {
        // Move to logs - remove column/position, add completedAt
        const logTask: Task = {
          ...task,
          completedAt: task.completedAt || new Date().toISOString(),
        };
        delete logTask.column;
        delete logTask.position;

        const logPath = path.join(dirs.logsDir, taskFileName(task.id));
        writeTaskFile(logPath, logTask);
        logCount++;
      } else {
        // Active task - add column and position
        const activeTask: Task = {
          ...task,
          column: col.id,
          position: i,
        };

        const taskPath = path.join(dirs.tasksDir, taskFileName(task.id));
        writeTaskFile(taskPath, activeTask);
        activeCount++;
      }
    }
  }

  // Write archived tasks to logs
  if (board.archive && board.archive.length > 0) {
    for (const task of board.archive) {
      const logTask: Task = {
        ...task,
        completedAt: task.completedAt || new Date().toISOString(),
      };
      delete logTask.column;
      delete logTask.position;

      const logPath = path.join(dirs.logsDir, taskFileName(task.id));
      writeTaskFile(logPath, logTask);
      logCount++;
    }
  }

  // Rewrite brainfile.md as config-only (strip tasks from columns, remove archive)
  const configBoard = { ...board };
  configBoard.columns = board.columns.map(col => ({
    id: col.id,
    title: col.title,
    ...(col.order !== undefined && { order: col.order }),
    ...(col.completionColumn && { completionColumn: col.completionColumn }),
    tasks: [], // empty tasks array for serialization compatibility
  }));
  delete configBoard.archive;

  // Update schema to v2
  configBoard.schema = 'https://brainfile.md/v2/board.json';

  const configContent = Brainfile.serialize(configBoard);
  fs.writeFileSync(brainfilePath, configContent, 'utf-8');

  // Ensure .gitignore
  ensureDotBrainfileGitignore(brainfilePath);

  console.log(chalk.green('Migration to v2 complete!'));
  console.log('');
  console.log(chalk.gray(`  Active tasks:    ${activeCount} files in tasks/`));
  console.log(chalk.gray(`  Completed/logs:  ${logCount} files in logs/`));
  console.log(chalk.gray(`  Board config:    ${brainfilePath} (config-only)`));
  console.log(chalk.gray(`  Backup:          ${backupPath}`));
  console.log('');
  console.log(chalk.gray('All CLI commands now work with the per-task file architecture.'));
}
