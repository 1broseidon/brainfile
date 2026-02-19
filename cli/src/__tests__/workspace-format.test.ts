import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { probeWorkspaceFormat } from '../utils/workspace-format';

describe('workspace format probe', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-workspace-format-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects empty workspace', () => {
    const probe = probeWorkspaceFormat(tempDir);
    expect(probe.format).toBe('empty');
  });

  it('detects legacy-root workspace', () => {
    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), '---\ncolumns: []\n---\n', 'utf-8');
    const probe = probeWorkspaceFormat(tempDir);
    expect(probe.format).toBe('legacy-root');
  });

  it('detects legacy-dotbrainfile workspace', () => {
    fs.mkdirSync(path.join(tempDir, '.brainfile'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.brainfile', 'brainfile.md'), '---\ncolumns: []\n---\n', 'utf-8');

    const probe = probeWorkspaceFormat(tempDir);
    expect(probe.format).toBe('legacy-dotbrainfile');
  });

  it('detects v2 workspace', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dotDir, 'brainfile.md'), '---\ncolumns: []\n---\n', 'utf-8');

    const probe = probeWorkspaceFormat(tempDir);
    expect(probe.format).toBe('v2');
  });

  it('detects mixed workspace when v2 and root legacy coexist', () => {
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dotDir, 'brainfile.md'), '---\ncolumns: []\n---\n', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'brainfile.md'), 'legacy', 'utf-8');

    const probe = probeWorkspaceFormat(tempDir);
    expect(probe.format).toBe('mixed');
  });
});
