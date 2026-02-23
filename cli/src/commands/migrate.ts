import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Brainfile } from '@brainfile/core';
import { writeTaskFile, taskFileName, type Task } from '@brainfile/core';
import { ensureDotBrainfileGitignore, removeLegacyStateFile } from '../utils/dot-brainfile';
import { ensureV2Dirs } from '../utils/v2-detect';
import { probeWorkspaceFormat, type WorkspaceProbe } from '../utils/workspace-format';

interface MigrateOptions {
  /** Migration root directory (defaults to cwd) */
  dir?: string;
  /** Overwrite existing migration outputs (task files, backups) */
  force?: boolean;
  /** Deprecated alias; migration always targets v2 now */
  v2?: boolean;
}

/**
 * Migrate legacy workspace layouts to v2 (.brainfile/brainfile.md + board/ + logs/).
 */
export function migrateCommand(options: MigrateOptions = {}) {
  try {
    const rootDir = path.resolve(options.dir || process.cwd());
    const probe = probeWorkspaceFormat(rootDir);

    if (probe.format === 'empty') {
      console.error(chalk.red('Error: No brainfile found to migrate.'));
      console.log(chalk.gray(`Checked: ${probe.paths.rootBrainfilePath}`));
      console.log(chalk.gray(`Checked: ${probe.paths.dotBrainfilePath}`));
      process.exit(1);
      return;
    }

    if (probe.format === 'v2') {
      migrateBrainfileToV2(probe.paths.dotBrainfilePath, options);
      return;
    }

    if (probe.format === 'legacy-root') {
      migrateRootBrainfileToDotDir(probe, options);
      migrateBrainfileToV2(probe.paths.dotBrainfilePath, options);
      return;
    }

    if (probe.format === 'legacy-dotbrainfile') {
      migrateBrainfileToV2(probe.paths.dotBrainfilePath, options);
      return;
    }

    // mixed workspace
    migrateMixedWorkspace(probe, options);
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function migrateMixedWorkspace(probe: WorkspaceProbe, options: MigrateOptions): void {
  const { presence, paths } = probe;
  const hasFullV2 = presence.dotBrainfile && presence.boardDir && presence.logsDir;

  if (hasFullV2) {
    if (presence.rootBrainfile) {
      const backupPath = backupAndRemoveLegacyRoot(paths.rootBrainfilePath, paths.dotDir);
      console.log(chalk.yellow('Legacy root brainfile detected alongside v2 workspace.'));
      console.log(chalk.gray(`  Backed up root file to: ${backupPath}`));
    }

    ensureDotBrainfileGitignore(paths.dotBrainfilePath);
    removeLegacyStateFile(paths.dotBrainfilePath);

    console.log(chalk.green('Workspace is already v2. No task migration needed.'));
    return;
  }

  if (presence.rootBrainfile && !presence.dotBrainfile) {
    migrateRootBrainfileToDotDir(probe, options);
    migrateBrainfileToV2(paths.dotBrainfilePath, options);
    return;
  }

  if (presence.rootBrainfile && presence.dotBrainfile) {
    const backupPath = backupAndRemoveLegacyRoot(paths.rootBrainfilePath, paths.dotDir);
    console.log(chalk.yellow('Found both root and .brainfile brainfiles; using .brainfile/brainfile.md as source.'));
    console.log(chalk.gray(`  Backed up root file to: ${backupPath}`));

    migrateBrainfileToV2(paths.dotBrainfilePath, options);
    return;
  }

  if (presence.dotBrainfile) {
    migrateBrainfileToV2(paths.dotBrainfilePath, options);
    return;
  }

  throw new Error('Mixed workspace detected, but no migratable brainfile.md was found.');
}

function migrateRootBrainfileToDotDir(probe: WorkspaceProbe, options: MigrateOptions): void {
  const { rootBrainfilePath, dotDir, dotBrainfilePath } = probe.paths;

  if (!fs.existsSync(rootBrainfilePath)) {
    throw new Error(`File not found: ${rootBrainfilePath}`);
  }

  if (fs.existsSync(dotBrainfilePath) && !options.force) {
    throw new Error(
      `Target already exists: ${dotBrainfilePath}. ` +
      'Run `brainfile migrate` again after resolving conflicts, or use --force.'
    );
  }

  fs.mkdirSync(dotDir, { recursive: true });

  if (fs.existsSync(dotBrainfilePath) && options.force) {
    fs.rmSync(dotBrainfilePath, { force: true });
  }

  // Prefer rename for exact preservation; fall back to copy+unlink on failure.
  try {
    fs.renameSync(rootBrainfilePath, dotBrainfilePath);
  } catch {
    const contents = fs.readFileSync(rootBrainfilePath);
    fs.writeFileSync(dotBrainfilePath, contents);
    fs.rmSync(rootBrainfilePath, { force: true });
  }

  ensureDotBrainfileGitignore(dotBrainfilePath);
  removeLegacyStateFile(dotBrainfilePath);

  console.log(chalk.gray(`Moved: ${rootBrainfilePath} -> ${dotBrainfilePath}`));
}

/**
 * Convert a single legacy board file into v2 per-task files.
 */
function migrateBrainfileToV2(brainfilePath: string, options: MigrateOptions): void {
  if (!fs.existsSync(brainfilePath)) {
    throw new Error(`File not found: ${brainfilePath}`);
  }

  const content = fs.readFileSync(brainfilePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw new Error(`Failed to parse brainfile: ${parsed.error}`);
  }

  const board = parsed.board;
  const dotDir = path.dirname(path.resolve(brainfilePath));
  const hasBoardDir = fs.existsSync(path.join(dotDir, 'board'));
  const hasLogsDir = fs.existsSync(path.join(dotDir, 'logs'));
  const hasEmbeddedColumnTasks = board.columns.some((column) => column.tasks.length > 0);
  const hasEmbeddedArchiveTasks = Array.isArray((board as { archive?: unknown }).archive)
    && ((board as { archive?: unknown[] }).archive?.length ?? 0) > 0;

  if (hasBoardDir && hasLogsDir && !hasEmbeddedColumnTasks && !hasEmbeddedArchiveTasks) {
    console.log(chalk.green('Already using v2 per-task file architecture.'));
    return;
  }

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

  // Validate/clear existing task files
  const existingTaskFiles = fs.existsSync(dirs.boardDir)
    ? fs.readdirSync(dirs.boardDir).filter((f) => f.endsWith('.md'))
    : [];
  const existingLogFiles = fs.existsSync(dirs.logsDir)
    ? fs.readdirSync(dirs.logsDir).filter((f) => f.endsWith('.md'))
    : [];

  if ((existingTaskFiles.length > 0 || existingLogFiles.length > 0) && !options.force) {
    throw new Error(
      'board/ or logs/ already contains task files. ' +
      'Use --force to replace existing .md files in those directories.'
    );
  }

  if (options.force) {
    for (const name of existingTaskFiles) {
      fs.rmSync(path.join(dirs.boardDir, name), { force: true });
    }
    for (const name of existingLogFiles) {
      fs.rmSync(path.join(dirs.logsDir, name), { force: true });
    }
  }

  let activeCount = 0;
  let logCount = 0;

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

  for (const col of board.columns) {
    const isDone = doneColumnIds.has(col.id);

    for (let i = 0; i < col.tasks.length; i++) {
      const task = col.tasks[i];

      if (isDone) {
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
        const activeTask: Task = {
          ...task,
          column: col.id,
          position: i,
        };

        const taskPath = path.join(dirs.boardDir, taskFileName(task.id));
        writeTaskFile(taskPath, activeTask);
        activeCount++;
      }
    }
  }

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

  const configBoard = { ...board };
  configBoard.columns = board.columns.map((col) => ({
    id: col.id,
    title: col.title,
    ...(col.order !== undefined && { order: col.order }),
    ...(col.completionColumn && { completionColumn: col.completionColumn }),
    tasks: [],
  }));
  delete configBoard.archive;
  configBoard.schema = 'https://brainfile.md/v2/board.json';

  const configContent = Brainfile.serialize(configBoard);
  fs.writeFileSync(brainfilePath, configContent, 'utf-8');

  ensureDotBrainfileGitignore(brainfilePath);
  removeLegacyStateFile(brainfilePath);

  console.log(chalk.green('Migration to v2 complete!'));
  console.log('');
  console.log(chalk.gray(`  Active tasks:    ${activeCount} files in board/`));
  console.log(chalk.gray(`  Completed/logs:  ${logCount} files in logs/`));
  console.log(chalk.gray(`  Board config:    ${brainfilePath} (config-only)`));
  console.log(chalk.gray(`  Backup:          ${backupPath}`));
}

function backupAndRemoveLegacyRoot(rootBrainfilePath: string, dotDir: string): string {
  const backupPath = uniquePath(path.join(dotDir, 'brainfile.root.legacy.bak'));
  fs.mkdirSync(dotDir, { recursive: true });
  fs.copyFileSync(rootBrainfilePath, backupPath);
  fs.rmSync(rootBrainfilePath, { force: true });
  return backupPath;
}

function uniquePath(basePath: string): string {
  if (!fs.existsSync(basePath)) return basePath;

  const ext = path.extname(basePath);
  const stem = basePath.slice(0, basePath.length - ext.length);

  let i = 1;
  while (true) {
    const candidate = `${stem}.${i}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
    i++;
  }
}
