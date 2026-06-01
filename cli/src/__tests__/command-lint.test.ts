import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lintValidationCommand, lintValidationCommands } from '../validation/command-lint';
import { addCommand } from '../commands/add';
import { contractAttachCommand } from '../commands/contract';
import { MemoryLogger } from '../utils/logger';

describe('command lint', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-command-lint-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects workspace-relative cd prefixes', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'packages', 'cli');
    const brainfilePath = path.join(workspaceRoot, '.brainfile', 'brainfile.md');
    fs.mkdirSync(path.dirname(brainfilePath), { recursive: true });
    process.chdir(repoRoot);

    const warning = lintValidationCommand('cd packages/cli && npm test', brainfilePath);

    expect(warning).toBeTruthy();
    expect(warning?.matchedPrefix).toBe('cd packages/cli &&');
    expect(warning?.suggestion).toBe('npm test');
    expect(warning?.message).toContain("consider using 'npm test' instead");
  });

  it('detects dot-slash workspace-relative cd prefixes', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'supervisor');
    const brainfilePath = path.join(workspaceRoot, '.brainfile', 'brainfile.md');
    fs.mkdirSync(path.dirname(brainfilePath), { recursive: true });
    process.chdir(repoRoot);

    const warning = lintValidationCommand('cd ./supervisor && npm run build', brainfilePath);

    expect(warning).toBeTruthy();
    expect(warning?.matchedPrefix).toBe('cd ./supervisor &&');
    expect(warning?.suggestion).toBe('npm run build');
  });

  it('does not warn for commands that cd elsewhere', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'supervisor');
    const brainfilePath = path.join(workspaceRoot, '.brainfile', 'brainfile.md');
    fs.mkdirSync(path.dirname(brainfilePath), { recursive: true });
    process.chdir(repoRoot);

    expect(lintValidationCommand('cd scripts && npm test', brainfilePath)).toBeNull();
    expect(lintValidationCommand('npm test', brainfilePath)).toBeNull();
  });

  it('does not warn when board is already at the current workspace root', () => {
    const workspaceRoot = path.join(tempDir, 'workspace');
    const brainfilePath = path.join(workspaceRoot, '.brainfile', 'brainfile.md');
    fs.mkdirSync(path.dirname(brainfilePath), { recursive: true });
    process.chdir(workspaceRoot);

    expect(lintValidationCommand('cd workspace && npm test', brainfilePath)).toBeNull();
  });

  it('lints multiple commands', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'foo', 'bar');
    const brainfilePath = path.join(workspaceRoot, '.brainfile', 'brainfile.md');
    fs.mkdirSync(path.dirname(brainfilePath), { recursive: true });
    process.chdir(repoRoot);

    const warnings = lintValidationCommands([
      'cd foo/bar && npm test',
      'npm run lint',
      'cd ./foo/bar && npm run build',
    ], brainfilePath);

    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.suggestion)).toEqual(['npm test', 'npm run build']);
  });
});

describe('validation command lint integration', () => {
  let tempDir: string;
  let originalCwd: string;
  let logger: MemoryLogger;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-command-lint-integration-'));
    logger = new MemoryLogger();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('warns during add when validation commands cd into the workspace path', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'supervisor');
    const dotDir = path.join(workspaceRoot, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dotDir, 'brainfile.md'), `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
    order: 1
---
`, 'utf-8');
    process.chdir(repoRoot);

    addCommand({
      file: path.join(dotDir, 'brainfile.md'),
      column: 'todo',
      title: 'Task with validation',
      validation: ['cd supervisor && npm test'],
      withContract: true,
    }, logger);

    expect(logger.getOutput()).toContain("Validation command contains 'cd supervisor &&'");
    expect(logger.getOutput()).toContain("consider using 'npm test' instead");
  });

  it('warns during contract attach when validation commands cd into the workspace path', () => {
    const repoRoot = path.join(tempDir, 'repo');
    const workspaceRoot = path.join(repoRoot, 'packages', 'cli');
    const dotDir = path.join(workspaceRoot, '.brainfile');
    const boardDir = path.join(dotDir, 'board');
    fs.mkdirSync(boardDir, { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dotDir, 'brainfile.md'), `---
title: Test Board
schema: https://brainfile.md/v2/board.json
columns:
  - id: todo
    title: To Do
    order: 1
---
`, 'utf-8');
    fs.writeFileSync(path.join(boardDir, 'task-1.md'), `---
id: task-1
title: Existing Task
column: todo
position: 0
---
Body
`, 'utf-8');
    process.chdir(repoRoot);

    contractAttachCommand({
      file: path.join(dotDir, 'brainfile.md'),
      task: 'task-1',
      validation: ['cd ./packages/cli && npm run build'],
    }, logger);

    expect(logger.getOutput()).toContain("Validation command contains 'cd ./packages/cli &&'");
    expect(logger.getOutput()).toContain("consider using 'npm run build' instead");
  });
});
