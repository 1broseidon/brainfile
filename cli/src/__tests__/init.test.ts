import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initCommand } from '../commands/init';

describe('init command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-init-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .brainfile/brainfile.md and .brainfile/.gitignore by default', () => {
    initCommand({});

    const brainfilePath = path.join(tempDir, '.brainfile', 'brainfile.md');
    const gitignorePath = path.join(tempDir, '.brainfile', '.gitignore');
    const tasksDir = path.join(tempDir, '.brainfile', 'tasks');
    const logsDir = path.join(tempDir, '.brainfile', 'logs');
    const statePath = path.join(tempDir, '.brainfile', 'state.json');

    expect(fs.existsSync(brainfilePath)).toBe(true);
    expect(fs.existsSync(gitignorePath)).toBe(true);
    expect(fs.existsSync(tasksDir)).toBe(true);
    expect(fs.existsSync(logsDir)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);

    const contents = fs.readFileSync(brainfilePath, 'utf-8');
    // Default init now uses v2 format
    expect(contents).toContain('schema: https://brainfile.md/v2/board.json');
    expect(contents).toContain('completionColumn: true');

    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    expect(gitignore).toContain('state.json');
  });
});

