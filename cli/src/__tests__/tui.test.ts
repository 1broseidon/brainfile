import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { tuiCommand } from '../commands/tui';
import { render } from 'ink';
import { CLIError } from '../utils/cli-error';

jest.mock('ink', () => ({
  render: jest.fn(() => ({
    waitUntilExit: () => Promise.resolve(),
  })),
}));

describe('tui command', () => {
  let tempDir: string;
  let originalIsTTY: boolean | undefined;
  let originalSetRawMode: ((mode: boolean) => void) | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-tui-test-'));
    originalIsTTY = (process.stdin as any).isTTY;
    originalSetRawMode = (process.stdin as any).setRawMode;

    (process.stdin as any).isTTY = true;
    (process.stdin as any).setRawMode = jest.fn();
  });

  afterEach(() => {
    (process.stdin as any).isTTY = originalIsTTY;
    (process.stdin as any).setRawMode = originalSetRawMode;
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('rejects v1 brainfiles and points to migrate', async () => {
    const brainfilePath = path.join(tempDir, 'brainfile.md');
    fs.writeFileSync(brainfilePath, '---\ncolumns: []\n---\n', 'utf-8');

    await expect(tuiCommand({ file: brainfilePath })).rejects.toThrow(CLIError);
    await expect(tuiCommand({ file: brainfilePath })).rejects.toThrow('Brainfile v1 is no longer supported');
    expect(render).not.toHaveBeenCalled();
  });
});

