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

    expect(fs.existsSync(brainfilePath)).toBe(true);
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const contents = fs.readFileSync(brainfilePath, 'utf-8');
    expect(contents).toContain('schema: https://brainfile.md/v1/board.json');

    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    expect(gitignore).toContain('state.json');
  });
});

