import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { ensureDotBrainfileGitignore } from '@brainfile/core';

interface MigrateOptions {
  /** Migration root directory (defaults to cwd) */
  dir?: string;
  force?: boolean;
}

/**
 * Migrate a legacy `brainfile.md` in the project root to `.brainfile/brainfile.md`.
 *
 * Preserves content exactly by using rename when possible.
 */
export function migrateCommand(options: MigrateOptions = {}) {
  try {
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

    console.log(chalk.green('✓ Brainfile migrated successfully!'));
    console.log('');
    console.log(chalk.gray(`  Moved:   ${legacyPath}`));
    console.log(chalk.gray(`  To:      ${targetPath}`));
    console.log('');
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  - Your CLI/MCP commands will auto-detect the new location'));
    console.log(chalk.gray('  - Optionally commit `.brainfile/brainfile.md` to git'));
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

