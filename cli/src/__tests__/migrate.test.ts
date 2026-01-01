import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateCommand } from '../commands/migrate';

describe('migrate command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-migrate-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('moves brainfile.md to .brainfile/brainfile.md preserving content', () => {
    const original = 'original-content\nline2\n';
    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), original, 'utf-8');

    migrateCommand({});

    const legacyPath = path.join(tempDir, 'brainfile.md');
    const targetPath = path.join(tempDir, '.brainfile', 'brainfile.md');
    const gitignorePath = path.join(tempDir, '.brainfile', '.gitignore');

    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.readFileSync(targetPath, 'utf-8')).toBe(original);
    expect(fs.readFileSync(gitignorePath, 'utf-8')).toContain('state.json');
  });
});

